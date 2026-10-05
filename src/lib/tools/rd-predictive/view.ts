/**
 * What the page shows of a run, as plain data: the words for each step, the
 * outcome, the tokens to mark, the call stack with its variables, and the
 * trees built so far.
 */
import { highlightGrammar } from '$lib/components/grammar/grammar-text';
import type { HighlightRange } from '$lib/components/ui/types';
import type { ParseNode } from '$lib/theory/grammar/types';
import { bracketOf, nodesAt, pathTo, placeholderPaths, rootsOf, treeOf, type AstNode } from './ast';
import type { Target } from './program';
import { framesOf, leftOver, type Frame, type RunResult, type Step } from './run';

export type StepTone = 'neutral' | 'accept' | 'reject' | 'warn';

export interface StepText {
	/** What the step does. */
	title: string;
	/** What follows from it; may be empty. */
	detail: string;
	tone: StepTone;
}

const either = (parts: readonly string[]): string =>
	new Intl.ListFormat('en', { type: 'disjunction' }).format(parts);

const call = (r: RunResult, fn: number): string => `${r.program.functions[fn].name} ()`;

/** The token at `pointer`, or null past the end of the input. */
export const tokenAt = (r: RunResult, pointer: number): string | null =>
	pointer >= 0 && pointer < r.tokens.length ? r.tokens[pointer] : null;

const tokenIs = (r: RunResult, pointer: number): string => {
	const token = tokenAt(r, pointer);
	return token === null ? 'No token is left.' : `The token is ${token}.`;
};

/** `tree`, `plus->right`: the left-hand side of an assignment. */
export const targetText = (target: Target): string =>
	target.kind === 'variable' ? target.name : `${target.object}->${target.field}`;

/** The tokens of the tests that failed just before step `index`, in the same call. */
function expectedBefore(r: RunResult, index: number): string[] {
	const out: string[] = [];
	const { depth } = r.steps[index].stack;
	for (let i = index - 1; i >= 0; i--) {
		const step = r.steps[i];
		if (step.kind !== 'test' || step.result || step.stack.depth !== depth) break;
		for (const token of [...step.tokens].reverse()) if (!out.includes(token)) out.push(token);
	}
	return out.reverse();
}

/** The words for step `index` of a run. */
export function describeStep(r: RunResult, index: number): StepText {
	const step = r.steps[index];
	if (!step) return { title: '', detail: '', tone: 'neutral' };
	const neutral = (title: string, detail = ''): StepText => ({ title, detail, tone: 'neutral' });
	switch (step.kind) {
		case 'start':
			return neutral(`${call(r, step.fn)} starts`, tokenIs(r, step.pointer));
		case 'enter':
			return neutral(`${call(r, step.from)} calls ${call(r, step.fn)}`, tokenIs(r, step.pointer));
		case 'test': {
			const about = tokenIs(r, step.pointer);
			if (step.result) {
				return neutral(
					`${step.test} holds`,
					step.loop ? `${about} The body of the loop runs.` : about
				);
			}
			return neutral(`${step.test} does not hold`, step.loop ? `${about} The loop ends.` : about);
		}
		case 'match': {
			const next = tokenAt(r, step.pointer);
			return {
				title: `${step.text}: ${step.terminal} is matched`,
				detail:
					next === null
						? 'The input is at its end.'
						: `The input advances. The token is now ${next}.`,
				tone: 'accept'
			};
		}
		case 'leave': {
			const builds = r.program.kind === 'ast';
			const tree = builds ? bracketOf(nodesAt(r, index), step.value) : '';
			if (step.to !== null) {
				return neutral(
					`${call(r, step.fn)} returns${builds ? ' tree' : ''} to ${call(r, step.to)}`,
					builds ? `tree is ${tree}.` : ''
				);
			}
			if (r.outcome === 'accept') {
				return {
					title: `${call(r, step.fn)} returns`,
					detail: 'It was the first call, so the run is over.',
					tone: 'accept'
				};
			}
			const rest = leftOver(r);
			const unread = rest.length > 0 ? ` Not read: ${rest.join(' ')}.` : '';
			return {
				title: `${call(r, step.fn)} returns${builds ? ' tree' : ''}`,
				detail: builds ? `The AST is ${tree}.${unread}` : unread.trim(),
				tone: rest.length > 0 ? 'warn' : 'accept'
			};
		}
		case 'make':
			return neutral(
				`A new node ${step.label}`,
				step.target.kind === 'variable'
					? `${step.target.name} points to it.`
					: `It is the ${step.target.field} child of the node ${step.target.object} points to.`
			);
		case 'assign':
			return neutral(
				`${targetText(step.target)} = ${step.from}`,
				step.target.kind === 'variable'
					? `${step.target.name} now points to the node ${step.from} points to.`
					: `The node ${step.from} points to becomes the ${step.target.field} child of the node ${step.target.object} points to.`
			);
		case 'store':
			return neutral(
				`${targetText(step.target)} = the tree ${call(r, step.fn)} returned`,
				step.target.kind === 'variable'
					? `${step.target.name} points to it.`
					: `It becomes the ${step.target.field} child of the node ${step.target.object} points to.`
			);
		case 'error': {
			const expected = expectedBefore(r, index);
			return {
				title: `error ("${step.name}")`,
				detail:
					expected.length > 0
						? `${tokenIs(r, step.pointer)} Here ${step.name} needs ${either(expected)}.`
						: `${step.name} derives no string of terminals.`,
				tone: 'reject'
			};
		}
		case 'mismatch': {
			const token = tokenAt(r, step.pointer);
			return {
				title: `${step.text} fails`,
				detail:
					token === null
						? `No token is left to match ${step.terminal}.`
						: `The token is ${token}, not ${step.terminal}.`,
				tone: 'reject'
			};
		}
		case 'loop': {
			const token = tokenAt(r, step.pointer);
			return {
				title: `${call(r, step.fn)} is called again${token === null ? '' : ` and the token is still ${token}`}`,
				detail: `No token is matched between the calls, so they never end. The run stops at ${step.nested} nested calls.`,
				tone: 'warn'
			};
		}
		case 'limit':
			return {
				title: `Stopped after ${step.limit} steps`,
				detail: 'The run is longer than this page follows.',
				tone: 'warn'
			};
	}
}

export interface OutcomeText {
	tone: 'success' | 'error' | 'warn' | 'info';
	title: string;
	lines: string[];
}

/**
 * How a run ended. The words of the last step (describeStep) say what stopped
 * it; `lines` adds only what they do not say.
 */
export function outcomeText(r: RunResult): OutcomeText {
	const last = r.steps.length - 1;
	const step = r.steps[last];
	if (!step) return { tone: 'info', title: 'Not run', lines: [] };
	const { title } = describeStep(r, last);
	switch (r.outcome) {
		case 'accept':
			return { tone: 'success', title: 'Accepted: every token matched, including $', lines: [] };
		case 'error':
		case 'mismatch':
			return { tone: 'error', title: `Rejected: ${title}`, lines: [] };
		case 'loop':
			return { tone: 'warn', title: 'Stopped: the calls never end', lines: [] };
		case 'limit':
			return { tone: 'warn', title, lines: [] };
		case 'done': {
			const rest = leftOver(r);
			if (r.program.kind !== 'ast') {
				return { tone: 'warn', title: 'The parser returned with tokens left', lines: [] };
			}
			const tree = bracketOf(nodesAt(r, last), r.result);
			if (rest.length === 0) return { tone: 'success', title: `AST: ${tree}`, lines: [] };
			return {
				tone: 'warn',
				title: 'Tokens are left over',
				lines: [
					`The token after the expression is ${rest[0]}, not $. A main like the parser’s would call error ("main").`
				]
			};
		}
	}
}

/** The tokens a step is about: the one tested, the one just matched, the one that stops the run. */
export function tokenHighlights(r: RunResult, index: number): HighlightRange[] {
	const step = r.steps[index];
	if (!step) return [];
	const at = (i: number, tone: HighlightRange['tone']): HighlightRange[] =>
		i >= 0 && i < r.tokens.length ? [{ start: i, end: i + 1, tone }] : [];
	switch (step.kind) {
		case 'test':
			return at(step.pointer, 'active');
		case 'match':
			return at(step.pointer - 1, 'accept');
		case 'make':
			return at(nodesAt(r, index)[step.node]?.token ?? -1, 'info');
		case 'error':
		case 'mismatch':
			return at(step.pointer, 'reject');
		case 'loop':
			return at(step.pointer, 'active');
		default:
			return [];
	}
}

/** The line of every call in progress at a step: where each outer function waits. */
export function callSites(step: Step | undefined): number[] {
	if (!step) return [];
	return framesOf(step)
		.map((frame) => frame.site)
		.filter((line): line is number => line !== null);
}

export interface StackRow {
	/** Unique among the rows of one step. */
	key: number;
	/** `T ()` */
	name: string;
	/** The line (from 1) of the call in the calling function; null for the outermost call. */
	calledFrom: number | null;
	/** The token the function was entered on, with its index; null past the end. */
	entered: { index: number; token: string | null };
	/** Local variables with the trees they point to; `null` before a variable has a value. */
	variables: { name: string; value: string; node: number | null }[];
}

/** The calls in progress at step `index`, innermost first. */
export function stackRows(r: RunResult, index: number): StackRow[] {
	const step = r.steps[index];
	if (!step) return [];
	const nodes = nodesAt(r, index);
	return framesOf(step).map((frame) => ({
		key: frame.depth,
		name: call(r, frame.fn),
		calledFrom: frame.site === null ? null : frame.site + 1,
		entered: { index: frame.entered, token: tokenAt(r, frame.entered) },
		variables: Object.entries(frame.vars).map(([name, node]) => ({
			name,
			value: bracketOf(nodes, node),
			node
		}))
	}));
}

/** One of the trees that exist at a step. */
export interface ForestTree {
	root: number;
	tree: ParseNode;
	/** The places of children that are not set yet, to be drawn faded. */
	dim: number[][];
	/** The node the step made or assigned, when it is in this tree. */
	current: number[][];
	/** The variables that point to the root: `tree`, `plus in E ()`. */
	names: string[];
	/** The tree on one line. */
	text: string;
}

/** The node a step made, assigned or returned. */
function touched(step: Step): number | null {
	switch (step.kind) {
		case 'make':
		case 'assign':
		case 'store':
			return step.node;
		case 'leave':
			return step.value;
		default:
			return null;
	}
}

function namesFor(r: RunResult, frames: readonly Frame[], root: number): string[] {
	const out: string[] = [];
	frames.forEach((frame, i) => {
		for (const [name, node] of Object.entries(frame.vars)) {
			if (node !== root) continue;
			out.push(i === 0 ? name : `${name} in ${call(r, frame.fn)}`);
		}
	});
	return out;
}

/**
 * The trees at step `index`: one per node that is no node's child, in the
 * order the roots were made. While a loop or a recursion is at work there
 * are several: the tree so far, a new operator node, the operand being read.
 */
export function forestAt(r: RunResult, index: number): ForestTree[] {
	const step = r.steps[index];
	if (!step) return [];
	const nodes: AstNode[] = nodesAt(r, index);
	const frames = framesOf(step);
	const node = touched(step);
	return rootsOf(nodes).map((root) => {
		const tree = treeOf(nodes, root);
		const path = node === null ? null : pathTo(nodes, root, node);
		return {
			root,
			tree,
			dim: placeholderPaths(tree),
			current: path ? [path] : [],
			names: namesFor(r, frames, root),
			text: bracketOf(nodes, root)
		};
	});
}

/** A run of grammar text with the class that colors it (one of the `hl-*` classes), or null. */
export interface GrammarSegment {
	text: string;
	className: string | null;
}

/**
 * Grammar text as lines of colored runs, with the colors of GrammarEditor:
 * for the boxes that show a grammar as the slides do.
 */
export function grammarLines(text: string, opts: { ebnf?: boolean } = {}): GrammarSegment[][] {
	const tokens = highlightGrammar(text, opts);
	const lines: GrammarSegment[][] = [];
	let offset = 0;
	let next = 0;
	for (const line of text.split('\n')) {
		const end = offset + line.length;
		const segments: GrammarSegment[] = [];
		let at = offset;
		while (next < tokens.length && tokens[next].from < end) {
			const token = tokens[next++];
			if (token.from > at) segments.push({ text: text.slice(at, token.from), className: null });
			const to = Math.min(token.to, end);
			segments.push({ text: text.slice(token.from, to), className: token.className });
			at = to;
		}
		if (at < end) segments.push({ text: text.slice(at, end), className: null });
		lines.push(segments);
		offset = end + 1;
	}
	return lines;
}

/**
 * Where a scrolling listing has to scroll so that the line being executed is
 * in view, or null when it is in view already with a line to spare on each
 * side. `view` is the visible part and `row` the line, both from the top of
 * the listing; `start` is the top of the first line of the line's function.
 * The function is shown from its start when the line then fits; otherwise
 * the line is put in the middle.
 */
export function scrollFor(
	view: { top: number; height: number },
	row: { top: number; height: number },
	start: number
): number | null {
	const margin = row.height;
	const bottom = row.top + row.height;
	if (row.top - margin >= view.top && bottom + margin <= view.top + view.height) return null;
	const from = Math.min(start, row.top);
	if (bottom + margin - from <= view.height) return Math.max(0, from - margin / 2);
	return Math.max(0, row.top - (view.height - row.height) / 2);
}

/** A piece of notation: text, drawn as a subscript or a superscript when `script` says so. */
export interface FormulaPart {
	text: string;
	script: 'sub' | 'sup' | null;
}

/** Subscript characters and the characters they are drawn as. */
const SUBSCRIPTS: Record<string, string> = {
	'₀': '0',
	'₁': '1',
	'₂': '2',
	'₃': '3',
	'₄': '4',
	'₅': '5',
	'₆': '6',
	'₇': '7',
	'₈': '8',
	'₉': '9',
	ᵢ: 'i',
	ₖ: 'k',
	ₘ: 'm',
	ₙ: 'n'
};

/**
 * Splits `S → S α₁ | … | S αₙ` into text and subscripts, so that the page
 * draws every subscript the same way whatever the font has a glyph for. The
 * `+` or `*` right after an arrow (`S →+ S β α`: one or more steps, zero or
 * more) is a superscript, as the slides write it.
 */
export function formulaParts(text: string): FormulaPart[] {
	const out: FormulaPart[] = [];
	let previous = '';
	for (const ch of text) {
		const script = Object.hasOwn(SUBSCRIPTS, ch)
			? 'sub'
			: previous === '→' && (ch === '+' || ch === '*')
				? 'sup'
				: null;
		const part = script === 'sub' ? SUBSCRIPTS[ch] : ch;
		const last = out[out.length - 1];
		if (last && last.script === script) last.text += part;
		else out.push({ text: part, script });
		previous = ch;
	}
	return out;
}
