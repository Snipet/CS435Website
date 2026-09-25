/**
 * Runs a compiled flex spec on an input string, following flex's yylex():
 *
 * - Among the rules active in the current start condition, the longest match
 *   at the current position wins; ties go to the rule listed first. `^r`
 *   matches only at the start of a line. `r/s` counts s toward the match
 *   length, but yytext holds only r. `r$` is `r/\n`: it matches only before a
 *   newline, as in flex.
 * - yytext and yyleng are set and the action runs. yylex returns when an
 *   action executes `return`; at the end of the input it runs the <<EOF>>
 *   rule for the start condition, or returns 0.
 * - When no rule matches, the default rule copies one character to the
 *   output (ECHO).
 *
 * Every match is recorded as a step (position, each rule's match length,
 * winner, yytext, output) for the step-through view.
 */
import { CharSet } from '$lib/theory/charset';
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Regex } from '$lib/theory/regex';
import type { Loc } from './c-ast';
import {
	BARE_RETURN,
	CLimitError,
	CMachine,
	CRuntimeError,
	Env,
	ExitSignal,
	TerminateSignal,
	type FlexHooks,
	type OutputChunk,
	type Val
} from './c';
import { MatchBudget, MatchBudgetExceeded, PatternTooLarge, RuleMatcher } from './match';
import type { CompiledSpec } from './program';
import { activeRules, eofRule } from './spec';

export type { OutputChunk } from './c';

/** Longest input the playground runs. */
export const MAX_INPUT = 20_000;
/** Matches recorded for the step view; later matches still run. */
export const MAX_RECORDED_STEPS = 5_000;

export interface RunOptions {
	/** C statements and loop iterations (default 1,000,000). */
	budget?: number;
	/** Characters examined by the pattern matchers (default 5,000,000). */
	matchBudget?: number;
	/** Characters of output (default 200,000). */
	outputLimit?: number;
	maxSteps?: number;
	/** Numeric globals whose values are recorded after every step. */
	watch?: readonly string[];
}

export type CandidateStatus = 'match' | 'none' | 'inactive' | 'bol';

export interface Candidate {
	rule: number;
	status: CandidateStatus;
	/** Characters matched, trailing context included (0 unless status is 'match'). */
	length: number;
	/** Characters that become yytext. */
	textLength: number;
}

export interface MatchStep {
	index: number;
	/** 1-based yylex() call this match belongs to. */
	call: number;
	/** Input position where matching started. */
	pos: number;
	/** 1-based line and column of `pos` in the input. */
	line: number;
	col: number;
	/** Start condition number (0 = INITIAL) while matching. */
	sc: number;
	atBol: boolean;
	/** A rule matched, nothing matched (default rule), or end of input. */
	kind: 'rule' | 'default' | 'eof';
	candidates: Candidate[];
	/** Winning rule (or the <<EOF>> rule); null for the default rule and the default end of input. */
	rule: number | null;
	/** Rule whose action ran (differs from `rule` for |). */
	actionRule: number | null;
	yytext: string;
	yyleng: number;
	/** End of yytext as matched. */
	end: number;
	/** End of the match with its trailing context. */
	context: number;
	/** Where scanning continues after the action (yyless and input() move it). */
	next: number;
	/** yyless(n) called by the action, if any. */
	yyless: number | null;
	/** Value yylex returned after this step, if it returned. */
	returned: number | null;
	scAfter: number;
	/** Watched globals after the step. */
	watch?: Record<string, number>;
}

export interface YylexCall {
	/** 1-based. */
	index: number;
	/** Steps recorded during the call: [firstStep, lastStep]. */
	firstStep: number;
	lastStep: number;
	/** null when the run stopped inside the call. */
	returned: number | null;
}

export interface FlexRun {
	/** False when the spec has errors or the input is too long: nothing ran. */
	ran: boolean;
	output: OutputChunk[];
	steps: MatchStep[];
	calls: YylexCall[];
	exitStatus: number | null;
	diagnostics: Diagnostic[];
	/** Why the run stopped early, if it did. */
	stopped: string | null;
	/** More matches ran than were recorded. */
	truncated: boolean;
	/** Watched globals at the end. */
	watch: Record<string, number> | null;
	/** Watched globals before the first step (after the globals are initialized). */
	watchStart: Record<string, number> | null;
	/** #define and enum names for yylex return values. */
	valueNames: Map<number, string[]>;
}

const NEWLINE: Regex = { kind: 'chars', set: CharSet.single('\n') };

/**
 * The number yylex returns for the value of a `return` in an action or in the
 * code before the first rule. A bare `return;` compiles with gcc's warning
 * "'return' with no value, in function returning non-void" (see c-check.ts);
 * C leaves the value undefined, and here yylex returns 0 (end of input for the
 * usual `while (yylex())` loop) so the run can go on.
 */
function yylexValue(m: CMachine, v: Val): number {
	return v === BARE_RETURN ? 0 : m.toInt(v);
}

/** Consecutive matches that leave the position and start condition unchanged before the run stops. */
const STUCK_LIMIT = 200;

class Scanner implements FlexHooks {
	readonly machine: CMachine;
	readonly steps: MatchStep[] = [];
	readonly calls: YylexCall[] = [];
	readonly diagnostics: Diagnostic[] = [];
	private readonly matchers: (RuleMatcher | null)[] = [];
	private readonly active = new Map<number, Set<number>>();
	private readonly budget: MatchBudget;
	private readonly maxSteps: number;
	private readonly lineStarts: number[] = [0];
	private pos = 0;
	private sc = 0;
	/** During an action: where scanning resumes (after yytext; moved by input() and yyless). */
	private cursor = 0;
	private matchStart = 0;
	private inAction = false;
	private current: MatchStep | null = null;
	private stepCount = 0;
	private stuck = 0;
	truncated = false;
	watchStart: Record<string, number> | null = null;

	constructor(
		private readonly compiled: CompiledSpec,
		private readonly text: string,
		private readonly opts: RunOptions
	) {
		this.machine = new CMachine({
			budget: opts.budget ?? 1_000_000,
			outputLimit: opts.outputLimit ?? 200_000,
			hooks: this
		});
		this.budget = new MatchBudget(opts.matchBudget ?? 5_000_000);
		this.maxSteps = opts.maxSteps ?? MAX_RECORDED_STEPS;
		for (let k = 0; k < text.length; k++) if (text[k] === '\n') this.lineStarts.push(k + 1);
	}

	private get spec() {
		return this.compiled.spec;
	}

	private lineCol(pos: number): { line: number; col: number } {
		let lo = 0;
		let hi = this.lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.lineStarts[mid] <= pos) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, col: pos - this.lineStarts[lo] + 1 };
	}

	/** Compiles every rule's pattern; false (with a diagnostic) when one is too large. */
	prepare(): boolean {
		for (const r of this.spec.rules) {
			if (!r.pattern) {
				this.matchers.push(null);
				continue;
			}
			try {
				const tail = r.pattern.trailing ?? (r.pattern.eol ? NEWLINE : null);
				this.matchers.push(new RuleMatcher(r.pattern.regex, tail));
			} catch (e) {
				if (!(e instanceof PatternTooLarge)) throw e;
				this.diagnostics.push({
					severity: 'error',
					message: e.message,
					span: { start: r.patternStart, end: r.patternEnd, source: null }
				});
				return false;
			}
		}
		return true;
	}

	private activeIn(sc: number): Set<number> {
		let set = this.active.get(sc);
		if (!set) {
			set = activeRules(this.spec, sc);
			this.active.set(sc, set);
		}
		return set;
	}

	private record(step: Omit<MatchStep, 'index' | 'line' | 'col'>): MatchStep {
		const full: MatchStep = { ...step, index: this.steps.length, ...this.lineCol(step.pos) };
		this.stepCount++;
		if (this.steps.length < this.maxSteps) this.steps.push(full);
		else this.truncated = true;
		const call = this.calls[this.calls.length - 1];
		if (call && this.steps.length <= this.maxSteps && this.steps.at(-1) === full) {
			if (call.firstStep < 0) call.firstStep = full.index;
			call.lastStep = full.index;
		}
		return full;
	}

	/** Current values of the watched globals, or null when nothing is watched. */
	watched(): Record<string, number> | null {
		if (!this.opts.watch?.length) return null;
		const w: Record<string, number> = {};
		for (const name of this.opts.watch) w[name] = this.machine.getGlobalInt(name);
		return w;
	}

	private watch(step: MatchStep): void {
		const w = this.watched();
		if (w) step.watch = w;
	}

	private countLines(text: string): void {
		if (!this.spec.options.has('yylineno')) return;
		let n = 0;
		for (const ch of text) if (ch === '\n') n++;
		if (n) this.machine.setGlobalInt('yylineno', this.machine.getGlobalInt('yylineno') + n);
	}

	/** Runs an action (or the default rule's ECHO) attributed to `step`; returns the value it returned. */
	private runAction(step: MatchStep, body: () => Val | null): number | null {
		const m = this.machine;
		const prev = { at: m.at, inAction: m.inAction, scanner: this.inAction, current: this.current };
		m.at = step.index < this.maxSteps ? step.index : this.maxSteps;
		m.inAction = true;
		this.inAction = true;
		this.current = step;
		try {
			const v = body();
			return v === null ? null : yylexValue(m, v);
		} catch (e) {
			if (e instanceof TerminateSignal) return e.value;
			throw e;
		} finally {
			m.inAction = prev.inAction;
			this.inAction = prev.scanner;
			this.current = prev.current;
		}
	}

	// ---------------------------------------------------------------------------
	// FlexHooks

	yylex(loc: Loc): number {
		const call: YylexCall = {
			index: this.calls.length + 1,
			firstStep: -1,
			lastStep: -1,
			returned: null
		};
		this.calls.push(call);
		const env = new Env(this.machine.globals);
		const pre = this.runPrologue(env);
		if (pre !== null) {
			call.returned = pre;
			return pre;
		}
		for (;;) {
			this.machine.tick(loc);
			const value =
				this.pos >= this.text.length ? this.atEof(call, env) : this.matchOnce(call, env);
			if (value !== null) {
				call.returned = value;
				return value;
			}
		}
	}

	private runPrologue(env: Env): number | null {
		if (!this.compiled.prologue.length) return null;
		try {
			const v = this.machine.runBody(this.compiled.prologue, env);
			return v === null ? null : yylexValue(this.machine, v);
		} catch (e) {
			if (e instanceof TerminateSignal) return e.value;
			throw e;
		}
	}

	private atEof(call: YylexCall, env: Env): number {
		const m = this.machine;
		const user = m.functions.get('yywrap');
		if (user && !this.spec.options.has('noyywrap')) {
			const r = m.toInt(m.call('yywrap', [], user.nameLoc));
			if (r === 0)
				this.warn(
					'yywrap() returned 0 (more input), but there is no more input; treated as 1',
					user.nameLoc
				);
		}
		const rule = eofRule(this.spec, this.sc);
		m.setYytext('');
		const step = this.record({
			call: call.index,
			pos: this.pos,
			sc: this.sc,
			atBol: this.atBol(this.pos),
			kind: 'eof',
			candidates: [],
			rule: rule ? rule.index : null,
			actionRule: rule ? rule.actionRule : null,
			yytext: '',
			yyleng: 0,
			end: this.pos,
			context: this.pos,
			next: this.pos,
			yyless: null,
			returned: null,
			scAfter: this.sc
		});
		let value: number | null = 0;
		if (rule && rule.actionRule >= 0) {
			this.cursor = this.pos;
			value = this.runAction(step, () =>
				m.runBody(this.compiled.actions[rule.actionRule], new Env(env))
			);
			if (value === null) {
				this.warn(
					'this <<EOF>> action does not return or call yyterminate(); flex would run it again forever, so yylex returns 0 here',
					{ start: rule.patternStart, end: rule.patternEnd }
				);
				value = 0;
			}
		}
		step.returned = value;
		step.scAfter = this.sc;
		this.watch(step);
		return value;
	}

	private atBol(pos: number): boolean {
		return pos === 0 || this.text[pos - 1] === '\n';
	}

	private matchOnce(call: YylexCall, env: Env): number | null {
		const m = this.machine;
		const pos = this.pos;
		const active = this.activeIn(this.sc);
		const bol = this.atBol(pos);
		const candidates: Candidate[] = [];
		let best: Candidate | null = null;
		for (const r of this.spec.rules) {
			if (r.eof) continue;
			const c: Candidate = { rule: r.index, status: 'none', length: 0, textLength: 0 };
			if (!active.has(r.index)) c.status = 'inactive';
			else if (r.pattern?.bol && !bol) c.status = 'bol';
			else {
				const hit = this.matchers[r.index]?.match(this.text, pos, this.budget);
				if (hit) {
					c.status = 'match';
					c.length = hit.end - pos;
					c.textLength = hit.textEnd - pos;
					if (!best || c.length > best.length) best = c;
				}
			}
			candidates.push(c);
		}

		if (!best) {
			// Default rule: copy one character to the output.
			const cp = this.text.codePointAt(pos)!;
			const text = String.fromCodePoint(cp);
			if (this.spec.options.has('nodefault')) {
				m.write('stderr', 'flex scanner jammed\n');
				this.warn(
					`no rule matches ${JSON.stringify(text)} at line ${this.lineCol(pos).line} and %option nodefault forbids the default rule`
				);
				throw new ExitSignal(2);
			}
			m.setYytext(text);
			this.countLines(text);
			const step = this.record({
				call: call.index,
				pos,
				sc: this.sc,
				atBol: bol,
				kind: 'default',
				candidates,
				rule: null,
				actionRule: null,
				yytext: text,
				yyleng: text.length,
				end: pos + text.length,
				context: pos + text.length,
				next: pos + text.length,
				yyless: null,
				returned: null,
				scAfter: this.sc
			});
			this.runAction(step, () => {
				m.write(m.yyout(), text, true);
				return null;
			});
			this.pos = pos + text.length;
			this.stuck = 0;
			this.watch(step);
			return null;
		}

		const rule = this.spec.rules[best.rule];
		const text = this.text.slice(pos, pos + best.textLength);
		m.setYytext(text);
		this.countLines(text);
		this.matchStart = pos;
		this.cursor = pos + best.textLength;
		const step = this.record({
			call: call.index,
			pos,
			sc: this.sc,
			atBol: bol,
			kind: 'rule',
			candidates,
			rule: rule.index,
			actionRule: rule.actionRule,
			yytext: text,
			yyleng: text.length,
			end: pos + best.textLength,
			context: pos + best.length,
			next: pos + best.textLength,
			yyless: null,
			returned: null,
			scAfter: this.sc
		});
		const scBefore = this.sc;
		const value =
			rule.actionRule < 0
				? null
				: this.runAction(step, () =>
						m.runBody(this.compiled.actions[rule.actionRule], new Env(env))
					);
		this.pos = this.cursor;
		step.next = this.pos;
		step.scAfter = this.sc;
		step.returned = value;
		this.watch(step);
		if (this.pos === pos && this.sc === scBefore && value === null) {
			if (++this.stuck >= STUCK_LIMIT) {
				throw new CRuntimeError(
					`the scanner is stuck at input position ${pos}: rule ${rule.index + 1} matches without consuming input (yytext is empty or yyless(0) keeps it)`,
					{ start: rule.patternStart, end: rule.patternEnd }
				);
			}
		} else this.stuck = 0;
		return value;
	}

	input(loc: Loc): number {
		const at = this.inAction ? this.cursor : this.pos;
		if (at >= this.text.length) return -1;
		const cp = this.text.codePointAt(at)!;
		const next = at + (cp > 0xffff ? 2 : 1);
		if (this.inAction) this.cursor = next;
		else this.pos = next;
		if (cp === 10) this.countLines('\n');
		void loc;
		return cp;
	}

	yyless(n: number, loc: Loc): void {
		const step = this.current;
		if (!this.inAction || !step || step.kind !== 'rule')
			throw new CRuntimeError('yyless() can only be used in a rule’s action', loc);
		if (n < 0 || n > step.yyleng)
			throw new CRuntimeError(`yyless(${n}) needs 0 ≤ n ≤ yyleng (${step.yyleng})`, loc);
		const text = step.yytext.slice(0, n);
		// Newlines put back are counted again when they are matched (flex's YY_LESS_LINENO).
		if (this.spec.options.has('yylineno')) {
			const back = (step.yytext.slice(n).match(/\n/g) ?? []).length;
			if (back) this.machine.setGlobalInt('yylineno', this.machine.getGlobalInt('yylineno') - back);
		}
		this.machine.setYytext(text);
		this.cursor = this.matchStart + n;
		step.yyless = n;
	}

	begin(sc: number, loc: Loc): void {
		if (sc < 0 || sc > this.spec.startConditions.length)
			throw new CRuntimeError(`BEGIN(${sc}): there is no start condition ${sc}`, loc);
		this.sc = sc;
	}

	echo(): void {
		const m = this.machine;
		const yytext = m.globals.vars.get('yytext')!.val;
		const leng = m.getGlobalInt('yyleng');
		const text = [...(m.cstr(yytext) ?? '')].slice(0, Math.max(0, leng)).join('');
		m.write(m.yyout(), text, true);
	}

	terminate(loc: Loc): never {
		void loc;
		// YY_NULL
		throw new TerminateSignal(0);
	}

	yyStart(): number {
		return this.sc;
	}

	warn(message: string, loc?: Loc): void {
		this.diagnostics.push({
			severity: 'warning',
			message,
			span: loc ? { start: loc.start, end: loc.end, source: null } : undefined
		});
	}

	/** Runs the program: main(), or yylex() until it returns 0. */
	run(): { exitStatus: number | null; stopped: string | null } {
		const m = this.machine;
		m.defineConstant('INITIAL', 0);
		this.spec.startConditions.forEach((s, k) => m.defineConstant(s.name, k + 1));
		const noLoc = { start: 0, end: 0 };
		try {
			m.loadGlobals(this.compiled.globals);
			this.watchStart = this.watched();
			for (const fn of this.compiled.functions.values()) m.addFunction(fn);
			const main = this.compiled.functions.get('main');
			if (main) {
				const args: Val[] = [];
				if (main.params.length >= 1) args.push({ t: 'i', v: 1 });
				if (main.params.length >= 2) args.push(m.argv());
				const ret = m.call('main', args, main.nameLoc);
				return { exitStatus: ret.t === 'i' ? ret.v & 0xff : 0, stopped: null };
			}
			while (this.yylex(noLoc) !== 0) {
				// Like linking with -lfl: main calls yylex() until it returns 0.
			}
			return { exitStatus: 0, stopped: null };
		} catch (e) {
			if (e instanceof ExitSignal) return { exitStatus: e.status & 0xff, stopped: null };
			if (e instanceof TerminateSignal) {
				// Only outside every function (a global's initializer, which compileSpec reports).
				this.diagnostics.push({
					severity: 'error',
					message: 'yyterminate() can only be used inside a function or a rule’s action'
				});
				return { exitStatus: null, stopped: 'yyterminate() outside a function' };
			}
			if (e instanceof MatchBudgetExceeded) {
				const message = 'stopped: matching this input takes too long';
				this.diagnostics.push({ severity: 'error', message });
				return { exitStatus: null, stopped: message };
			}
			if (e instanceof CRuntimeError) {
				const message = e instanceof CLimitError ? e.message : `runtime error: ${e.message}`;
				this.diagnostics.push({
					severity: 'error',
					message,
					span:
						e.loc && e.loc.end >= e.loc.start && (e.loc.start || e.loc.end)
							? { ...e.loc, source: null }
							: undefined
				});
				return { exitStatus: null, stopped: message };
			}
			throw e;
		}
	}
}

/** Runs `compiled` on `input` (data.txt). */
export function runScanner(compiled: CompiledSpec, input: string, opts: RunOptions = {}): FlexRun {
	const empty: FlexRun = {
		ran: false,
		output: [],
		steps: [],
		calls: [],
		exitStatus: null,
		diagnostics: [],
		stopped: null,
		truncated: false,
		watch: null,
		watchStart: null,
		valueNames: new Map()
	};
	if (!compiled.ok) return empty;
	if (input.length > MAX_INPUT) {
		return {
			...empty,
			diagnostics: [
				{
					severity: 'error',
					message: `the input is too long to run here (${input.length.toLocaleString('en-US')} characters; at most ${MAX_INPUT.toLocaleString('en-US')})`
				}
			]
		};
	}
	const scanner = new Scanner(compiled, input, opts);
	if (!scanner.prepare()) return { ...empty, diagnostics: scanner.diagnostics };
	let result: { exitStatus: number | null; stopped: string | null };
	try {
		result = scanner.run();
	} catch (e) {
		// A limit of the JavaScript engine (e.g. the call stack), not of the program.
		const message = `stopped: the program could not be run here (${e instanceof Error ? e.message : String(e)})`;
		scanner.diagnostics.push({ severity: 'error', message });
		result = { exitStatus: null, stopped: message };
	}
	const { exitStatus, stopped } = result;
	const m = scanner.machine;
	const watch = scanner.watched();
	const valueNames = new Map<number, string[]>();
	const addName = (v: number, name: string) => {
		const list = valueNames.get(v) ?? [];
		if (!list.includes(name)) list.push(name);
		valueNames.set(v, list);
	};
	for (const [name, v] of compiled.defines) addName(v, name);
	for (const s of compiled.globals)
		if (s.k === 'enum') for (const it of s.items) addName(m.getGlobalInt(it.name), it.name);
	return {
		ran: true,
		output: m.output,
		steps: scanner.steps,
		calls: scanner.calls,
		exitStatus,
		diagnostics: [...scanner.diagnostics, ...m.warnings],
		stopped,
		truncated: scanner.truncated,
		watch,
		watchStart: scanner.watchStart,
		valueNames
	};
}

/** The whole output of a stream (or both, in program order). */
export function outputText(run: FlexRun, stream?: 'stdout' | 'stderr'): string {
	return run.output
		.filter((c) => !stream || c.stream === stream)
		.map((c) => c.text)
		.join('');
}
