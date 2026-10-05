/**
 * The "(Limited) Recursive Descent Parser" of Top-Down Parsing, slides 28–34:
 * C code with one bool function per production and one per non-terminal, and
 * a faithful run of that code on a token string.
 *
 *   bool match (TOKEN tok) { return *next++ == tok; }
 *   bool E1 () { return T (); }
 *   bool E2 () { return T () && match (PLUS) && E (); }
 *   bool E () { TOKEN* save = next; return E1 ()
 *                                       || (next = save, E2 ()); }
 *
 * The functions of a non-terminal's productions are numbered from 1 in
 * grammar order. `match` advances `next` whether or not the comparison
 * succeeds, and the function of a non-terminal returns as soon as one of its
 * productions succeeds: it is never entered again to try the next one
 * (slide 33: "Cannot backtrack once a production is successful"). The input
 * is accepted when the start symbol's function returns true and `next` points
 * to end-of-stream (slide 30).
 */
import { printSymbols } from '$lib/theory/grammar/parse';
import type { Grammar } from '$lib/theory/grammar/types';
import { asciiText, joinPieces, plainText, text, type Piece } from './notation';

/** Steps recorded before a run stops by itself. */
export const DEFAULT_MAX_STEPS = 3000;

// ───────────────────────────── the program ─────────────────────────────

/** A piece of a code line; pieces with the same `site` are one expression that a step executes. */
export interface CodePiece extends Piece {
	site?: number;
}

export interface CodeLine {
	pieces: CodePiece[];
	/** Index of the function the line belongs to; null for an empty line. */
	fn: number | null;
}

export interface FunctionInfo {
	kind: 'match' | 'production' | 'nonterminal';
	/** `match`, `E`, or `E` with the production's number as subscript. */
	name: Piece;
	/** The non-terminal of a `nonterminal` or `production` function. */
	nonterminal?: string;
	/** The production id of a `production` function. */
	production?: number;
	/** First and last line of the function. */
	lines: [first: number, last: number];
}

/** An expression of the program that one step executes. */
export interface Site {
	line: number;
	/** The function it is in. */
	fn: number;
	/**
	 * `compare`: `*next++ == tok` in match; `match`: a call of match;
	 * `call`: a call of another function; `save`: `save = next`;
	 * `restore`: `next = save`.
	 */
	kind: 'compare' | 'match' | 'call' | 'save' | 'restore';
	/** `call`: the function called. */
	callee?: number;
	/** `match`: the token constant passed. */
	constant?: string;
}

/** One symbol of a production's function body. */
type Item =
	| { kind: 'match'; terminal: string; constant: string; site: number }
	| {
			kind: 'call';
			fn: number;
			site: number;
	  };

/** What a function does, for the interpreter. */
export type Body =
	| { kind: 'match' }
	| { kind: 'production'; items: Item[] }
	| {
			kind: 'nonterminal';
			save: number;
			/** One per production: the call, and the `next = save` before it (none before the first). */
			alternatives: { fn: number; call: number; restore: number | null }[];
	  };

export interface Program {
	grammar: Grammar;
	/** The token constant of each terminal: int → INT, ( → OPEN. */
	constants: Map<string, string>;
	/** `match` first, then for each non-terminal its productions' functions and its own. */
	functions: FunctionInfo[];
	bodies: Body[];
	lines: CodeLine[];
	sites: Site[];
	/** Index of the start symbol's function. */
	start: number;
}

/** The token constants of slide 28, and names for other punctuation. */
const TOKEN_NAMES: Record<string, string> = {
	int: 'INT',
	'(': 'OPEN',
	')': 'CLOSE',
	'+': 'PLUS',
	'*': 'TIMES',
	'-': 'MINUS',
	'/': 'DIVIDE',
	'%': 'MOD',
	'=': 'ASSIGN',
	'==': 'EQ',
	'!=': 'NE',
	'<': 'LT',
	'>': 'GT',
	'<=': 'LE',
	'>=': 'GE',
	':=': 'ASSIGN',
	'&&': 'AND',
	'||': 'OR',
	'->': 'ARROW',
	';': 'SEMI',
	',': 'COMMA',
	'.': 'DOT',
	':': 'COLON',
	'{': 'LBRACE',
	'}': 'RBRACE',
	'[': 'LBRACKET',
	']': 'RBRACKET',
	'!': 'NOT',
	'&': 'AMP',
	'|': 'BAR',
	'^': 'CARET',
	'~': 'TILDE',
	'?': 'QUESTION',
	'#': 'HASH',
	$: 'DOLLAR',
	'@': 'AT',
	'"': 'QUOTE',
	"'": 'APOSTROPHE',
	'\\': 'BACKSLASH',
	'→': 'ARROW',
	ε: 'EPSILON'
};

const DIGIT_NAMES = [
	'ZERO',
	'ONE',
	'TWO',
	'THREE',
	'FOUR',
	'FIVE',
	'SIX',
	'SEVEN',
	'EIGHT',
	'NINE'
];

/** Names the generated code uses itself, and C keywords a grammar symbol may be spelled like. */
const RESERVED = [
	'bool',
	'match',
	'next',
	'save',
	'tok',
	'TOKEN',
	'true',
	'false',
	'return',
	'int',
	'char',
	'float',
	'double',
	'long',
	'short',
	'void',
	'if',
	'else',
	'while',
	'for',
	'do',
	'switch',
	'case',
	'default',
	'break',
	'continue',
	'goto',
	'struct',
	'union',
	'enum',
	'typedef',
	'static',
	'const',
	'sizeof',
	'main'
];

/** An upper-case constant name for a terminal that slide 28 does not name. */
function constantName(terminal: string): string {
	const known = TOKEN_NAMES[terminal];
	if (known) return known;
	if (/^[0-9]$/.test(terminal)) return DIGIT_NAMES[Number(terminal)];
	if (/^[0-9]+$/.test(terminal)) return `NUM_${terminal}`;
	const parts: string[] = [];
	let word = '';
	const flush = () => {
		if (word) parts.push(word.toUpperCase());
		word = '';
	};
	for (const ch of terminal) {
		if (/[A-Za-z0-9]/.test(ch)) word += ch;
		else {
			flush();
			if (ch === '_' || ch === '-' || /\s/u.test(ch)) continue;
			parts.push(TOKEN_NAMES[ch] ?? `U${ch.codePointAt(0)!.toString(16).toUpperCase()}`);
		}
	}
	flush();
	const name = parts.join('_') || 'TOKEN_';
	return /^[0-9]/.test(name) ? `T_${name}` : name;
}

/** A C identifier for a non-terminal: primes and hyphens become underscores. */
function functionName(nonterminal: string): string {
	const name = nonterminal.replace(/[^A-Za-z0-9_]/gu, '_');
	return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
}

/**
 * The C functions for `g` in the layout of slide 34: `match`, then for each
 * non-terminal the functions of its productions (numbered from 1) and the
 * function that tries them in order, with `next = save` before every
 * production after the first. An ε-production's function returns true.
 */
export function generateProgram(g: Grammar): Program {
	const taken = new Set(RESERVED);
	/** `name` with underscores added until every spelling it stands for is free; those are then taken. */
	const unique = (name: string, spell: (base: string) => string[] = (base) => [base]): string => {
		let base = name;
		while (spell(base).some((id) => taken.has(id))) base += '_';
		for (const id of spell(base)) taken.add(id);
		return base;
	};

	const names = new Map(g.nonterminals.map((n) => [n, unique(functionName(n))]));
	const functions: FunctionInfo[] = [
		{ kind: 'match', name: { text: 'match', kind: 'function' }, lines: [0, 0] }
	];
	const bodies: Body[] = [{ kind: 'match' }];
	/** Function index of each non-terminal and of each production (by id). */
	const ofNonterminal = new Map<string, number>();
	const ofProduction = new Map<number, number>();
	for (const n of g.nonterminals) {
		const base = names.get(n)!;
		const productions = g.productions.filter((p) => p.lhs === n);
		// One name for all the functions of the non-terminal's productions: E1, E2 or E_1, E_2.
		const numbered = unique(base, (b) =>
			productions.map((_, i) => asciiText([{ text: b, sub: String(i + 1) }]))
		);
		productions.forEach((p, i) => {
			ofProduction.set(p.id, functions.length);
			functions.push({
				kind: 'production',
				name: { text: numbered, sub: String(i + 1), kind: 'function' },
				nonterminal: n,
				production: p.id,
				lines: [0, 0]
			});
			bodies.push({ kind: 'production', items: [] });
		});
		ofNonterminal.set(n, functions.length);
		functions.push({
			kind: 'nonterminal',
			name: { text: base, kind: 'function' },
			nonterminal: n,
			lines: [0, 0]
		});
		bodies.push({ kind: 'nonterminal', save: -1, alternatives: [] });
	}
	const constants = new Map(g.terminals.map((t) => [t, unique(constantName(t))]));

	const lines: CodeLine[] = [];
	const sites: Site[] = [];
	const site = (s: Site): number => sites.push(s) - 1;
	const at = (pieces: Piece[], id: number): CodePiece[] => pieces.map((p) => ({ ...p, site: id }));
	const kw = (word: string): CodePiece => ({ text: word, kind: 'keyword' });
	const variable = (name: string): CodePiece => ({ text: name, kind: 'variable' });
	const call = (fn: number): Piece[] => [functions[fn].name, text(' ()')];
	const head = (fn: number): CodePiece[] => [kw('bool'), text(' '), functions[fn].name];

	// bool match (TOKEN tok) { return *next++ == tok; }
	lines.push({
		fn: 0,
		pieces: [
			...head(0),
			text(' ('),
			{ text: 'TOKEN', kind: 'type' },
			text(' tok) { '),
			kw('return'),
			text(' '),
			...at(
				[text('*'), variable('next'), text('++ == '), variable('tok')],
				site({ line: 0, fn: 0, kind: 'compare' })
			),
			text('; }')
		]
	});

	g.nonterminals.forEach((n, order) => {
		// Slide 34 leaves a line free after match and before each non-terminal's own function.
		if (order === 0) lines.push({ fn: null, pieces: [] });
		const productions = g.productions.filter((p) => p.lhs === n);
		for (const p of productions) {
			const fn = ofProduction.get(p.id)!;
			const line = lines.length;
			const body = bodies[fn] as Extract<Body, { kind: 'production' }>;
			const calls = p.rhs.map((symbol): CodePiece[] => {
				const callee = ofNonterminal.get(symbol);
				if (callee !== undefined) {
					const id = site({ line, fn, kind: 'call', callee });
					body.items.push({ kind: 'call', fn: callee, site: id });
					return at(call(callee), id);
				}
				const constant = constants.get(symbol)!;
				const id = site({ line, fn, kind: 'match', callee: 0, constant });
				body.items.push({ kind: 'match', terminal: symbol, constant, site: id });
				return at(
					[functions[0].name, text(' ('), { text: constant, kind: 'constant' }, text(')')],
					id
				);
			});
			lines.push({
				fn,
				pieces: [
					...head(fn),
					text(' () { '),
					kw('return'),
					text(' '),
					...(calls.length > 0 ? joinPieces(calls, ' && ', ' && ') : [kw('true')]),
					text('; }')
				]
			});
			functions[fn].lines = [line, line];
		}

		// bool E () { TOKEN* save = next; return E1 ()
		//                                     || (next = save, E2 ()); }
		lines.push({ fn: null, pieces: [] });
		const fn = ofNonterminal.get(n)!;
		const body = bodies[fn] as Extract<Body, { kind: 'nonterminal' }>;
		const first = lines.length;
		body.save = site({ line: first, fn, kind: 'save' });
		const opening: CodePiece[] = [
			...head(fn),
			text(' () { '),
			{ text: 'TOKEN', kind: 'type' },
			text('* '),
			...at([variable('save'), text(' = '), variable('next')], body.save),
			text('; '),
			kw('return'),
			text(' ')
		];
		// The || of the next lines stands three columns left of the first call, so the calls line up.
		const indent = ' '.repeat(Math.max(0, asciiText(opening).length - 3));
		productions.forEach((p, k) => {
			const callee = ofProduction.get(p.id)!;
			const line = first + k;
			const end = k === productions.length - 1 ? '; }' : '';
			if (k === 0) {
				const id = site({ line, fn, kind: 'call', callee });
				body.alternatives.push({ fn: callee, call: id, restore: null });
				lines.push({
					fn,
					pieces: [...opening, ...at(call(callee), id), ...(end ? [text(end)] : [])]
				});
				return;
			}
			const restore = site({ line, fn, kind: 'restore' });
			const id = site({ line, fn, kind: 'call', callee });
			body.alternatives.push({ fn: callee, call: id, restore });
			lines.push({
				fn,
				pieces: [
					text(`${indent}|| (`),
					...at([variable('next'), text(' = '), variable('save')], restore),
					text(', '),
					...at(call(callee), id),
					text(`)${end}`)
				]
			});
		});
		functions[fn].lines = [first, first + productions.length - 1];
	});

	return {
		grammar: g,
		constants,
		functions,
		bodies,
		lines,
		sites,
		start: ofNonterminal.get(g.start)!
	};
}

/** The program as text, with the production numbers as ordinary digits (E1, T2). */
export function programText(program: Program): string {
	return program.lines.map((line) => asciiText(line.pieces)).join('\n');
}

/** One line of the program as text. */
export function lineText(program: Program, line: number): string {
	return asciiText(program.lines[line].pieces);
}

/** The text of a function: one line for a production, one line per production for a non-terminal. */
export function functionText(program: Program, fn: number): string {
	const [first, last] = program.functions[fn].lines;
	return program.lines
		.slice(first, last + 1)
		.map((line) => asciiText(line.pieces))
		.join('\n');
}

/** Index of the function of a production (by id), or of a non-terminal (by name). */
export function functionOf(program: Program, what: number | string): number {
	return program.functions.findIndex((f) =>
		typeof what === 'number'
			? f.kind === 'production' && f.production === what
			: f.kind === 'nonterminal' && f.nonterminal === what
	);
}

// ───────────────────────────── the run ─────────────────────────────

/** A function that has been called and has not returned. */
export interface Frame {
	fn: number;
	/** `next` when the function was called. */
	entry: number;
	/** The function's `save`; null in a production's function. */
	save: number | null;
	/** The expression of this function that is being executed, or null. */
	site: number | null;
}

/**
 * The calls in progress as a linked list from the innermost call outward.
 * Steps share the part of the stack that did not change, so a deep recursion
 * costs one node per step. Read it with `stackOf`.
 */
export interface StackNode {
	frame: Frame;
	below: StackNode | null;
	/** Number of calls in progress, this one included. */
	depth: number;
}

export type LimitedEvent =
	'start' | 'call' | 'match' | 'return' | 'restore' | 'accept' | 'reject' | 'stop';

export interface LimitedStop {
	/** `depth`: calls of one function nested without `next` moving; `steps`: the step budget. */
	reason: 'depth' | 'steps';
	limit: number;
	/** `depth`: the non-terminal's function whose calls are nested. */
	fn?: number;
}

export interface LimitedStep {
	event: LimitedEvent;
	/** The innermost call in progress after the step (see `stackOf`); null when there is none. */
	top: StackNode | null;
	/**
	 * Index of the token `next` points to after the step: `tokens.length` is
	 * end-of-stream, and one more after a match that failed there.
	 */
	next: number;
	/** The line being executed, or null (before the first call and after the last return). */
	line: number | null;
	/** The expression being executed on that line, or null for the whole line. */
	site: number | null;
	/** `call`: the function entered; `return`: the one that returned; `match`: 0. */
	fn: number | null;
	/** `match`, `return`: the value returned. */
	result: boolean | null;
	/** `match`: the constant passed, the token index compared and the token there (null: end-of-stream). */
	compare?: { constant: string; at: number; found: string | null };
	/** `stop`: why the run ended early. */
	stop?: LimitedStop;
	message: Piece[][];
	/** Number of `LimitedResult.calls` started so far. */
	calls: number;
	/** Production functions called so far. */
	tried: number;
	/** `next = save` executed so far. */
	restores: number;
}

/** One call, for the list of finished calls and their results. */
export interface CallRecord {
	fn: number;
	/** `match`: the constant passed. */
	constant?: string;
	/** Number of calls in progress around it. */
	depth: number;
	/** The step that makes the call. */
	start: number;
	/** The step that shows its result; null when the run stopped first. */
	end: number | null;
	result: boolean | null;
	/** `next` at the call and at the return. */
	entry: number;
	exit: number | null;
}

export interface LimitedResult {
	steps: LimitedStep[];
	calls: CallRecord[];
	/** Accept: the start function returned true and `next` points to end-of-stream (slide 30). */
	outcome: 'accept' | 'reject' | 'stopped';
	/** What the start symbol's function returned; null when the run stopped. */
	returned: boolean | null;
	/** `next` at the end. */
	next: number;
	/** The tokens from `next` on when the start function returned true: not empty means reject. */
	leftover: string[];
	stop: LimitedStop | null;
	tried: number;
	restores: number;
}

export interface LimitedOptions {
	/** Steps to record at most, the closing `stop` step included. */
	maxSteps?: number;
	/**
	 * Stop when this many calls of one non-terminal's function are in progress
	 * that were all made with `next` where it is now, and one more would be
	 * made: the recursion of a left-recursive grammar, which in C ends in a
	 * stack overflow. A call made with the same `next` does what the call
	 * around it did, so the first repeat already never returns; functions of
	 * other non-terminals between them do not count. Null (default) for no
	 * limit.
	 */
	depthCap?: number | null;
}

const MAX_TOKENS_LISTED = 8;

/** Tokens as text, the first few of a long list: `* int`, `a a a a a a a a …`. */
export function listTokens(tokens: readonly string[]): string {
	const shown = tokens.slice(0, MAX_TOKENS_LISTED).map((t) => printSymbols([t]));
	return shown.join(' ') + (tokens.length > MAX_TOKENS_LISTED ? ' …' : '');
}

/** The calls in progress at a step, outermost first. */
export function stackOf(step: LimitedStep): Frame[] {
	const out: Frame[] = [];
	for (let node = step.top; node; node = node.below) out.push(node.frame);
	return out.reverse();
}

/** A step's message as text, one string per line. */
export function messageText(step: LimitedStep): string[] {
	return step.message.map(plainText);
}

/** A call in progress while the program runs. */
interface Active {
	fn: number;
	entry: number;
	save: number | null;
	site: number | null;
	record: CallRecord;
	/** Productions called (a non-terminal's function) or symbols done (a production's). */
	done: number;
	below: Active | null;
	depth: number;
	/** The frame as last recorded, until `site` changes. */
	node: StackNode | null;
}

/** A call that has returned, until the step that shows its result. */
interface Returned {
	fn: number;
	result: boolean;
	record: CallRecord;
	/** A non-terminal's function: how many of its productions it called. */
	used: number;
}

/**
 * Runs the program on `tokens`, which are terminals of its grammar, and
 * records every call, match, return and `next = save`. The C call stack is
 * kept as data, so a deep recursion cannot overflow the stack of the page.
 */
export function runLimited(
	program: Program,
	tokens: readonly string[],
	opts: LimitedOptions = {}
): LimitedResult {
	const maxSteps = Math.max(3, Math.floor(opts.maxSteps ?? DEFAULT_MAX_STEPS));
	const depthCap = opts.depthCap ?? null;
	const { functions, bodies, sites, constants, grammar } = program;
	const steps: LimitedStep[] = [];
	const calls: CallRecord[] = [];
	let top: Active | null = null;
	/** The innermost call in progress (read through a function: the helpers below assign `top`). */
	const innermost = (): Active | null => top;
	let next = 0;
	let tried = 0;
	let restores = 0;

	const name = (fn: number): Piece[] => [functions[fn].name, text(' ()')];
	const variable = (word: string): Piece => ({ text: word, kind: 'variable' });
	const tokenName = (index: number): string =>
		index < tokens.length ? (constants.get(tokens[index]) ?? tokens[index]) : 'end-of-stream';

	/** The stack as shared, unchanging nodes: only frames whose `site` changed are new. */
	function record(frame: Active | null): StackNode | null {
		const fresh: Active[] = [];
		let f = frame;
		while (f && !f.node) {
			fresh.push(f);
			f = f.below;
		}
		let below: StackNode | null = f ? f.node : null;
		for (let i = fresh.length - 1; i >= 0; i--) {
			const a = fresh[i];
			a.node = {
				frame: { fn: a.fn, entry: a.entry, save: a.save, site: a.site },
				below,
				depth: a.depth
			};
			below = a.node;
		}
		return below;
	}

	/** Moves `frame` to the expression `site`. Only the innermost frame ever moves. */
	const at = (frame: Active, site: number | null): void => {
		frame.site = site;
		frame.node = null;
	};

	type Detail = Partial<Pick<LimitedStep, 'site' | 'fn' | 'result' | 'compare' | 'stop'>> & {
		line?: number | null;
	};

	function emit(event: LimitedEvent, message: Piece[][], detail: Detail = {}): void {
		const site = detail.site ?? null;
		steps.push({
			event,
			top: record(top),
			next,
			line: detail.line !== undefined ? detail.line : site === null ? null : sites[site].line,
			site,
			fn: detail.fn ?? null,
			result: detail.result ?? null,
			...(detail.compare ? { compare: detail.compare } : {}),
			...(detail.stop ? { stop: detail.stop } : {}),
			message,
			calls: calls.length,
			tried,
			restores
		});
	}

	function open(fn: number, constant?: string): CallRecord {
		const call: CallRecord = {
			fn,
			depth: top?.depth ?? 0,
			start: steps.length,
			end: null,
			result: null,
			entry: next,
			exit: null
		};
		if (constant !== undefined) call.constant = constant;
		calls.push(call);
		return call;
	}

	/** Calls `fn`: a new frame, and the step that enters it. */
	function enter(fn: number): void {
		const body = bodies[fn];
		const frame: Active = {
			fn,
			entry: next,
			save: body.kind === 'nonterminal' ? next : null,
			site: body.kind === 'nonterminal' ? body.save : null,
			record: open(fn),
			done: 0,
			below: top,
			depth: (top?.depth ?? 0) + 1,
			node: null
		};
		top = frame;
		if (body.kind === 'nonterminal') {
			emit(
				'call',
				[
					[text('Call '), ...name(fn)],
					[variable('save'), text(' = '), variable('next')]
				],
				{ fn, site: body.save }
			);
			return;
		}
		tried++;
		const p = grammar.productions[functions[fn].production!];
		emit(
			'call',
			[
				[text('Call '), ...name(fn)],
				[text(`for production ${printSymbols([p.lhs])} → ${printSymbols(p.rhs)}`)]
			],
			{ fn, line: functions[fn].lines[0] }
		);
	}

	/** Returns from the innermost call. */
	function leave(result: boolean): Returned {
		const frame = top!;
		top = frame.below;
		return { fn: frame.fn, result, record: frame.record, used: frame.done };
	}

	/** The step in which the caller has the result of a call it made at `site`. */
	function report(call: Returned, site: number | null): void {
		const { fn, result } = call;
		call.record.end = steps.length;
		call.record.result = result;
		call.record.exit = next;
		const lines: Piece[][] = [[...name(fn), text(` returns ${result}`)]];
		const body = bodies[fn];
		if (body.kind === 'nonterminal') {
			// The productions after the one that succeeded are never called.
			const skipped = result ? body.alternatives.slice(call.used).map((a) => name(a.fn)) : [];
			if (!result) lines.push([text('No production succeeded')]);
			else if (skipped.length > 0) {
				const parts = skipped.length > 3 ? skipped.slice(0, 2) : skipped;
				if (parts.length < skipped.length)
					parts.push([text(`${skipped.length - parts.length} more`)]);
				lines.push([
					...joinPieces(parts),
					text(skipped.length === 1 ? ' is not called' : ' are not called')
				]);
			}
		}
		emit('return', lines, { fn, result, site });
	}

	/** Calls of `fn` in progress that were made with `next` where it is now. */
	function nested(fn: number): number {
		let count = 0;
		for (let f = top; f && f.entry === next; f = f.below) if (f.fn === fn) count++;
		return count;
	}

	let outcome: LimitedResult['outcome'] = 'stopped';
	let value: boolean | null = null;
	let stop: LimitedStop | null = null;
	/** The call that just returned to the innermost frame. */
	let back: Returned | null = null;
	const start = program.start;

	emit('start', [
		[text('Initialize next to point to first token')],
		[text('Invoke '), ...name(start)]
	]);
	/** The function to call next, when the last thing done was to decide on a call. */
	let pending: number | null = start;

	for (;;) {
		const frame = innermost();
		// A return with nothing to report takes no step: go on to what the caller does with it.
		if (pending === null && back === null && frame !== null) {
			const body = bodies[frame.fn];
			if (body.kind === 'nonterminal' && frame.done === body.alternatives.length) {
				back = leave(false);
				continue;
			}
			if (body.kind === 'production' && frame.done === body.items.length) {
				back = leave(true);
				continue;
			}
		}
		// Every pass from here on records one step; the last place is kept for the closing step.
		if (steps.length >= maxSteps - 1) {
			stop = { reason: 'steps', limit: maxSteps };
			break;
		}
		if (pending !== null) {
			if (
				bodies[pending].kind === 'nonterminal' &&
				depthCap !== null &&
				nested(pending) >= depthCap
			) {
				stop = { reason: 'depth', limit: depthCap, fn: pending };
				break;
			}
			enter(pending);
			pending = null;
			continue;
		}
		if (frame === null) {
			// The start symbol's function has returned.
			value = back!.result;
			report(back!, null);
			break;
		}
		const body = bodies[frame.fn];
		if (back) {
			const call: Returned = back;
			back = null;
			report(call, frame.site);
			// A non-terminal's function is done at the first true, a production's at the first false.
			if (call.result === (body.kind === 'nonterminal')) back = leave(call.result);
			continue;
		}
		if (body.kind === 'nonterminal') {
			const alt = body.alternatives[frame.done];
			if (alt.restore !== null && frame.site !== alt.restore) {
				next = frame.save!;
				restores++;
				at(frame, alt.restore);
				emit(
					'restore',
					[
						[variable('next'), text(' = '), variable('save')],
						[text(`next points to ${tokenName(next)} again`)]
					],
					{ fn: frame.fn, site: alt.restore }
				);
				continue;
			}
			frame.done++;
			at(frame, alt.call);
			pending = alt.fn;
			continue;
		}
		if (body.kind !== 'production') throw new Error('runLimited: match has no frame');
		const item = body.items[frame.done++];
		at(frame, item.site);
		if (item.kind === 'call') {
			pending = item.fn;
			continue;
		}
		const index = next;
		const found = index < tokens.length ? tokens[index] : null;
		const result = found === item.terminal;
		const call = open(0, item.constant);
		// *next++: the pointer moves whether or not the tokens are equal.
		next++;
		call.end = steps.length;
		call.result = result;
		call.exit = next;
		emit(
			'match',
			[
				[
					functions[0].name,
					text(' ('),
					{ text: item.constant, kind: 'constant' },
					text(
						result
							? `): *next is ${item.constant}`
							: `): *next is ${tokenName(index)}, not ${item.constant}`
					)
				],
				[text(`Returns ${result}; next advances`)]
			],
			{ fn: 0, result, site: item.site, compare: { constant: item.constant, at: index, found } }
		);
		if (!result) back = leave(false);
	}

	if (stop) {
		// Where the innermost call is: at the call it was about to make, when there is one.
		const frame = innermost();
		const line =
			frame === null
				? null
				: frame.site !== null
					? sites[frame.site].line
					: functions[frame.fn].lines[0];
		emit(
			'stop',
			[
				stop.reason !== 'depth'
					? [text(`Stopped after ${stop.limit} steps`)]
					: stop.fn === undefined
						? [text(`Stopped: ${stop.limit} calls nested and next has not moved`)]
						: [
								text(`Stopped: ${stop.limit} calls of `),
								...name(stop.fn),
								text(' nested and next has not moved')
							]
			],
			{ stop, site: frame?.site ?? null, line }
		);
	} else if (value && next === tokens.length) {
		outcome = 'accept';
		emit('accept', [
			[...name(start), text(' returned true and next points to end-of-stream: accept')]
		]);
	} else {
		outcome = 'reject';
		emit(
			'reject',
			value
				? [
						[
							...name(start),
							text(' returned true, but next does not point to end-of-stream: reject')
						],
						[text(`Left over: ${listTokens(tokens.slice(next))}`)]
					]
				: [[...name(start), text(' returned false: reject')]]
		);
	}

	return {
		steps,
		calls,
		outcome,
		returned: stop ? null : value,
		next,
		leftover: !stop && value ? tokens.slice(Math.min(next, tokens.length)) : [],
		stop,
		tried,
		restores
	};
}
