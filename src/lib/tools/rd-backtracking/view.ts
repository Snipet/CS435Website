/**
 * What the two tabs draw for one step: the lines of the "Try …" log, the
 * marks on the tree and on the token stream, the fringe, the call stack and
 * the list of calls. Pure functions over the engine results, so they can be
 * tested without the page.
 */
import type { TreeHighlight } from '$lib/components/grammar/types';
import type { HighlightRange, Tone } from '$lib/components/ui/types';
import { printSymbols } from '$lib/theory/grammar/parse';
import { EPSILON } from '$lib/theory/grammar/types';
import {
	describeStep,
	matchedPaths,
	type BacktrackResult,
	type BacktrackStep,
	type Fringe
} from './backtrack';
import {
	listTokens,
	stackOf,
	type Frame,
	type LimitedResult,
	type LimitedStep,
	type Program
} from './limited';
import { plainText, text, type Piece } from './notation';
import type { Run } from './session';

// ───────────────────────────── backtracking ─────────────────────────────

export type MessageTone = 'neutral' | 'accept' | 'reject' | 'warn';

/** The color a step's message is written in. */
export function messageTone(event: BacktrackStep['event'] | LimitedStep['event']): MessageTone {
	switch (event) {
		case 'match':
		case 'accept':
			return 'accept';
		case 'mismatch':
		case 'backtrack':
		case 'exhausted':
		case 'reject':
			return 'reject';
		case 'stop':
			return 'warn';
		default:
			return 'neutral';
	}
}

/** One line of the "Try …" log (Top-Down Parsing, slides 18–20). */
export interface LogLine {
	/** The step the line belongs to; choosing the line shows that step. */
	step: number;
	kind: 'try' | 'exhausted' | 'accept' | 'reject' | 'stop';
	pieces: Piece[];
	/** A try whose children have been removed again by the step shown. */
	undone: boolean;
	/** For such a try, the failure that sent the search back to it: "Mismatch: ( is not int". */
	cause: string | null;
	/** The line of the step shown. */
	current: boolean;
}

/** The log up to step `index`: one line per production tried, as on the slides. */
export function logLines(result: BacktrackResult, index: number, instances: boolean): LogLine[] {
	const shown = result.steps[index];
	if (!shown) return [];
	return result.log.slice(0, shown.log).map((entry) => {
		const step = result.steps[entry.step];
		const lines = describeStep(step, { instances });
		const undone = entry.undone !== null && entry.undone <= index;
		return {
			step: entry.step,
			kind: step.event as LogLine['kind'],
			// "Have exhausted the choices for T2 and T1" / "so backtrack to choice for E0" on one line.
			pieces: lines.flatMap((line, i) => (i === 0 ? line : [text(' '), ...line])),
			undone,
			cause: undone && entry.cause !== null ? result.steps[entry.cause].message[0] : null,
			current: entry.step === index
		};
	});
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** How far the step shown is: `3 of 6 tried · 2 of 2 backtracks`. */
export function backtrackProgress(step: BacktrackStep, result: BacktrackResult): string {
	const noun = plural(result.backtracks, 'backtrack', 'backtracks');
	return `${step.tries} of ${result.tries} tried · ${step.backtracks} of ${result.backtracks} ${noun}`;
}

/** The current node and the matched terminals, for ParseTreeView. */
export function treeHighlight(step: BacktrackStep): TreeHighlight {
	return { current: step.path ? [step.path] : [], matched: matchedPaths(step.tree) };
}

/** The token a match or mismatch compares, colored by the outcome. */
export function compareHighlight(step: BacktrackStep, count: number): HighlightRange[] {
	if (step.event !== 'match' && step.event !== 'mismatch') return [];
	if (step.pos >= count) return [];
	return [
		{ start: step.pos, end: step.pos + 1, tone: step.event === 'match' ? 'accept' : 'reject' }
	];
}

export type FringeMark = 'matched' | 'next' | 'added' | 'rest';

export interface FringeSymbol {
	piece: Piece;
	mark: FringeMark;
}

/**
 * A fringe for display: the matched terminals t1 … tk, the leftmost
 * non-terminal A, and the rest. With `added` (the new fringe of a try), the
 * right-hand side that replaced A is marked instead.
 */
export function fringeSymbols(
	fringe: Fringe & { added?: [number, number] },
	instances: boolean
): FringeSymbol[] {
	return fringe.items.map((item, i) => {
		const piece: Piece = { text: printSymbols([item.symbol]) };
		if (!item.terminal) {
			piece.kind = 'nonterminal';
			if (instances && item.instance !== undefined) piece.sub = String(item.instance);
		}
		let mark: FringeMark = 'rest';
		if (i < fringe.matched) mark = 'matched';
		else if (fringe.added) {
			if (i >= fringe.added[0] && i < fringe.added[1]) mark = 'added';
		} else if (i === fringe.next) mark = 'next';
		return { piece, mark };
	});
}

/** A fringe as text: `int * T₂ + E₂`, or ε when it has no symbols. */
export function fringeText(fringe: Fringe, instances: boolean): string {
	const symbols = fringeSymbols(fringe, instances);
	return symbols.length === 0 ? EPSILON : symbols.map((s) => plainText([s.piece])).join(' ');
}

// ───────────────────────────── bool functions ─────────────────────────────

/** Where a pointer into the token array is: the token it points to, and its place in words. */
export interface PointerPlace {
	/** The token pointed to; null at end-of-stream and past it. */
	token: string | null;
	/** `token 2 of 3`, `end-of-stream`, or `one past end-of-stream`. */
	where: string;
}

export function pointerPlace(index: number, tokens: readonly string[]): PointerPlace {
	if (index < tokens.length)
		return {
			token: printSymbols([tokens[index]]),
			where: `token ${index + 1} of ${tokens.length}`
		};
	return {
		token: null,
		where: index === tokens.length ? 'end-of-stream' : 'one past end-of-stream'
	};
}

/** The innermost non-terminal function in progress (the one whose `save` is in scope), or null. */
export function innermostSave(step: LimitedStep): Frame | null {
	for (let node = step.top; node; node = node.below)
		if (node.frame.save !== null) return node.frame;
	return null;
}

/**
 * Marks on the token stream of the bool functions: every `save` in progress
 * (the innermost one filled, the others as an underline), and the token a
 * match just compared, colored by its result.
 */
export function pointerHighlights(step: LimitedStep, count: number): HighlightRange[] {
	const out: HighlightRange[] = [];
	const inner = innermostSave(step)?.save ?? null;
	const seen = new Set<number>();
	for (const frame of stackOf(step)) {
		const save = frame.save;
		if (save === null || save === inner || save >= count || seen.has(save)) continue;
		seen.add(save);
		out.push({ start: save, end: save + 1, tone: 'info', muted: true });
	}
	if (inner !== null && inner < count) out.push({ start: inner, end: inner + 1, tone: 'info' });
	if (step.compare && step.compare.at < count) {
		const tone: Tone = step.result ? 'accept' : 'reject';
		out.push({ start: step.compare.at, end: step.compare.at + 1, tone });
	}
	return out;
}

/** The sites of the calls in progress below the innermost one: the chain of calls in the code. */
export function callChain(step: LimitedStep): number[] {
	const out: number[] = [];
	for (let node = step.top?.below ?? null; node; node = node.below)
		if (node.frame.site !== null) out.push(node.frame.site);
	return out;
}

/** A row of the call stack. */
export interface StackRow {
	/** `T ()` or `T₃ ()`. */
	name: Piece[];
	kind: 'production' | 'nonterminal';
	/** A non-terminal's function: its save. */
	save: number | null;
	/** A production's function: `T → ( E )`. */
	production: string | null;
}

/** The calls in progress, innermost first. */
export function stackRows(program: Program, step: LimitedStep): StackRow[] {
	return stackOf(step)
		.reverse()
		.map((frame) => {
			const f = program.functions[frame.fn];
			const p = f.production === undefined ? null : program.grammar.productions[f.production];
			return {
				name: [f.name, text(' ()')],
				kind: f.kind === 'production' ? 'production' : 'nonterminal',
				save: frame.save,
				production: p ? `${printSymbols([p.lhs])} → ${printSymbols(p.rhs)}` : null
			};
		});
}

/** A line of the list of calls. */
export interface TraceLine {
	/** Index in `LimitedResult.calls`. */
	call: number;
	/** `T₁ ()` or `match (INT)`. */
	name: Piece[];
	depth: number;
	/** The value returned, or null while the call is in progress at the step shown. */
	result: boolean | null;
	/** The step that makes the call; choosing the line shows it. */
	step: number;
	/** The call the step shown makes or returns from. */
	current: boolean;
}

/** The calls made up to step `index`, in order, with the results known by then. */
export function traceLines(program: Program, result: LimitedResult, index: number): TraceLine[] {
	const shown = result.steps[index];
	if (!shown) return [];
	return result.calls.slice(0, shown.calls).map((c, call) => {
		const f = program.functions[c.fn];
		const done = c.end !== null && c.end <= index;
		return {
			call,
			name:
				c.constant === undefined
					? [f.name, text(' ()')]
					: [f.name, text(' ('), { text: c.constant, kind: 'constant' }, text(')')],
			depth: c.depth,
			result: done ? c.result : null,
			step: c.start,
			current: c.start === index || c.end === index
		};
	});
}

/**
 * The production whose function is the innermost call in progress, or null
 * when that call is the function of a non-terminal (or there is none).
 */
export function runningProduction(program: Program, step: LimitedStep): number | null {
	const f = step.top ? program.functions[step.top.frame.fn] : null;
	return f?.kind === 'production' ? (f.production ?? null) : null;
}

/** How far the step shown is: `4 of 6 productions tried · next = save 2 of 2 times`. */
export function limitedProgress(step: LimitedStep, result: LimitedResult): string {
	const tried = plural(result.tried, 'production', 'productions');
	const times = plural(result.restores, 'time', 'times');
	return `${step.tried} of ${result.tried} ${tried} tried · next = save ${step.restores} of ${result.restores} ${times}`;
}

/** The tone of a step of the bool functions: a value returned colors it. */
export function limitedTone(step: LimitedStep): MessageTone {
	if (step.event === 'match' || step.event === 'return') return step.result ? 'accept' : 'reject';
	return messageTone(step.event);
}

// ───────────────────────────── verdicts ─────────────────────────────

const tokenText = (tokens: readonly string[]): string =>
	tokens.length === 0 ? 'The empty token stream' : tokens.map((t) => printSymbols([t])).join(' ');

/** Whether the token string is a sentence of the grammar, as a sentence; null when not checked. */
export function languageLine(run: Run): string | null {
	if (run.inLanguage === null) return null;
	return `${tokenText(run.tokens)} ${run.inLanguage ? 'is' : 'is not'} a sentence of the grammar.`;
}

export interface VerdictView {
	tone: 'success' | 'error' | 'warn';
	title: string;
	lines: string[];
}

/**
 * The outcome of the bool functions in words. When they reject a sentence of
 * the grammar the title is slide 33's: "Cannot backtrack once a production is
 * successful".
 */
export function limitedVerdict(run: Run): VerdictView | null {
	const r = run.limited;
	if (!r) return null;
	const start = `${plainText([run.program.functions[run.program.start].name])} ()`;
	if (r.outcome === 'accept')
		return {
			tone: 'success',
			title: 'Accept',
			lines: [`${start} returned true and next points to end-of-stream.`]
		};
	if (r.outcome === 'stopped') {
		const nested =
			r.stop?.fn === undefined
				? 'one function'
				: `${plainText([run.program.functions[r.stop.fn].name])} ()`;
		return {
			tone: 'warn',
			title: 'The run was stopped',
			lines: [
				r.stop?.reason === 'depth'
					? `${r.stop.limit} calls of ${nested} are nested and next has not moved. Each of them does what the one before it did, so in C the calls go on until the stack overflows.`
					: `The functions did not return within ${r.stop?.limit ?? 0} steps.`
			]
		};
	}
	const lines = [
		r.returned
			? `${start} returned true with ${listTokens(r.leftover)} left over, so the input is rejected.`
			: `${start} returned false, so the input is rejected.`
	];
	if (run.inLanguage !== true) {
		const language = languageLine(run);
		return { tone: 'error', title: 'Reject', lines: language ? [...lines, language] : lines };
	}
	lines.push(
		`${tokenText(run.tokens)} is a sentence of the grammar. A production that succeeded was not the one the rest of the input needed, and the function of its non-terminal is never entered again.`
	);
	if (run.backtracking?.outcome === 'accept')
		lines.push('Recursive descent with backtracking accepts this input.');
	lines.push(
		'The bool functions work for grammars where at most one production can succeed for a non-terminal.'
	);
	return { tone: 'error', title: 'Cannot backtrack once a production is successful', lines };
}
