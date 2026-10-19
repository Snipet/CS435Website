/**
 * What the page draws from a parse: the rows of the shift-reduce trace
 * (Bottom-up Parsing II, slides 4–14) with the symbols each action works on,
 * the forest beside them, why each action is taken (slide 16), and the
 * handles and rightmost derivation of Bottom-Up Parsing, slides 5–10.
 */
import { annotationText, symbolSeparators, symbolText } from '$lib/components/grammar/lr-item';
import { isEpsilonNode, layoutForest } from '$lib/components/grammar/tree-layout';
import {
	END_MARKER,
	collapseShifts,
	shiftReduceRows,
	type Derivation,
	type Grammar,
	type HandleStep,
	type LrParse,
	type ParseNode,
	type ShiftReduceRow
} from '$lib/theory/grammar';
import type { ParseView, RowDecision } from './model';

// ───────────────────────────── trace rows ─────────────────────────────

/** The rows of the trace: one per action, or with consecutive shifts on one row. */
export function traceRows(parse: LrParse, collapse: boolean): ShiftReduceRow[] {
	const rows = shiftReduceRows(parse);
	return collapse ? collapseShifts(rows) : rows;
}

/** The row of `rows` that stands for the parse row `raw`. */
export function rowOfRaw(rows: readonly ShiftReduceRow[], raw: number): number {
	const i = rows.findIndex((r) => r.rows.includes(raw));
	return i === -1 ? Math.max(0, rows.length - 1) : i;
}

/**
 * The same place in the other listing: switching between collapsed and single
 * shifts keeps the configuration shown (a collapsed row opens on its first shift).
 */
export function convertStep(
	from: readonly ShiftReduceRow[],
	to: readonly ShiftReduceRow[],
	step: number
): number {
	const row = from[Math.min(Math.max(0, step), from.length - 1)];
	return row ? rowOfRaw(to, row.rows[0]) : 0;
}

// ───────────────────────────── configurations ─────────────────────────────

export interface ConfigSymbol {
	/** As the grammar text writes it. */
	text: string;
	/** What goes before it: '' or ' '. */
	sep: string;
	/** The DFA state the stack is in after this symbol; null right of the divider. */
	state: number | null;
}

/** Consecutive symbols that are, or are not, what the row's action works on. */
export interface ConfigRun {
	mark: boolean;
	symbols: ConfigSymbol[];
}

export interface ConfigurationView {
	/** The stack's symbols, bottom first. */
	left: ConfigRun[];
	/** The state of the bottom pair < dummy, 0 >. */
	bottom: number;
	/** A reduction by an ε-production: the handle is empty, right before the divider. */
	emptyHandle: boolean;
	/** The rest of the input, `$` last. */
	right: ConfigRun[];
	/** What the action works on: the handle before a reduce, the tokens before a shift. */
	mark: 'handle' | 'shift' | null;
}

/**
 * Symbols spaced as the bottom-up decks write sentential forms: no space just
 * inside parentheses, and `$` right after the input (`+ (int)$`).
 */
function separators(symbols: readonly string[]): string[] {
	const seps = symbolSeparators(symbols.map(symbolText), 'hug');
	return seps.map((sep, i) => (i > 0 && symbols[i] === END_MARKER ? '' : sep));
}

function runs(symbols: ConfigSymbol[], from: number, to: number): ConfigRun[] {
	const out: ConfigRun[] = [];
	symbols.forEach((symbol, i) => {
		const mark = i >= from && i < to;
		const last = out[out.length - 1];
		if (last && last.mark === mark) last.symbols.push(symbol);
		else out.push({ mark, symbols: [symbol] });
	});
	return out;
}

/**
 * A row as Bottom-up Parsing II, slide 14 writes it, `E + (int I ) + (int)$`,
 * split around the divider, with the symbols the action works on marked: the
 * handle (the top |β| symbols of the stack) before a reduce, the tokens to
 * shift before a shift. `states` are the DFA states of the stack, bottom
 * (< dummy, 0 >) first.
 */
export function configuration(
	row: ShiftReduceRow,
	grammar: Grammar,
	states?: readonly number[]
): ConfigurationView {
	const leftSeps = separators(row.stack);
	const left = row.stack.map((text, i): ConfigSymbol => ({
		text: symbolText(text),
		sep: leftSeps[i],
		state: states?.[i + 1] ?? null
	}));
	const rightSeps = separators(row.input);
	const right = row.input.map((text, i): ConfigSymbol => ({
		text: symbolText(text),
		sep: rightSeps[i],
		state: null
	}));
	const length =
		row.action === 'reduce' && row.production !== null
			? grammar.productions[row.production].rhs.length
			: 0;
	const handle = row.action === 'reduce' ? [left.length - length, left.length] : [0, 0];
	const shifted = row.action === 'shift' ? row.count : 0;
	return {
		left: runs(left, handle[0], handle[1]),
		bottom: states?.[0] ?? 0,
		emptyHandle: row.action === 'reduce' && length === 0,
		right: runs(right, 0, shifted),
		mark: row.action === 'reduce' ? 'handle' : row.action === 'shift' ? 'shift' : null
	};
}

/**
 * A configuration as text, `E + (int I ) + (int)$`; `mark` puts brackets
 * around the symbols the action works on (`E + ([int] I ) + (int)$`, and
 * `[]` for an empty handle), for checks against the slides.
 */
export function configurationText(view: ConfigurationView, mark = false): string {
	const text = (runs: ConfigRun[]) =>
		runs
			.map((run) => {
				const joined = run.symbols.map((s, i) => (i > 0 ? s.sep : '') + s.text).join('');
				const lead = run.symbols[0]?.sep ?? '';
				return mark && run.mark ? `${lead}[${joined}]` : lead + joined;
			})
			.join('');
	const left = text(view.left) + (mark && view.emptyHandle ? ' []' : '');
	return [left.trim(), 'I', text(view.right).trim()].filter(Boolean).join(' ');
}

/** The states of the stack before a parse row, bottom first. */
export function stackStates(parse: LrParse, raw: number): number[] {
	return parse.rows[raw]?.stack.map((e) => e.state) ?? [0];
}

// ───────────────────────────── the forest ─────────────────────────────

/** Leaves of a tree as the baseline layout draws them: terminals and ε leaves. */
export function leafCount(root: ParseNode): number {
	let count = 0;
	const todo = [root];
	while (todo.length > 0) {
		const node = todo.pop()!;
		if (node.terminal || isEpsilonNode(node)) count++;
		else for (const child of node.children) todo.push(child);
	}
	return count;
}

export interface ForestView {
	/** The stack's subtrees, then a leaf for each token still to come (`$` left out). */
	forest: ParseNode[];
	/** Leaves left of the divider, ε leaves included. */
	marker: number;
	/** Trees in `forest` that are the stack's. */
	stacked: number;
}

/** The tokens from position `j` on, without `$`, as leaves numbered from `j`. */
function rest(parse: LrParse, j: number): ParseNode[] {
	return parse.input.slice(j, -1).map((symbol, k) => ({
		symbol,
		terminal: true,
		children: [],
		start: j + k,
		end: j + k + 1
	}));
}

/**
 * The partial parse tree before the parse row `raw` (Bottom-up Parsing II,
 * slides 4–14): the subtrees of the stack's symbols over the tokens they
 * cover, the tokens still to come as bare leaves, and the up-arrow under the
 * divider.
 */
export function forestBefore(parse: LrParse, raw: number): ForestView {
	const row = parse.rows[raw];
	const stack = raw > 0 ? parse.rows[raw - 1].forest : [];
	const j = row?.j ?? 0;
	const marker = stack.reduce((n, tree) => n + leafCount(tree), 0);
	return { forest: [...stack, ...rest(parse, j)], marker, stacked: stack.length };
}

/** Indices of the parse rows that reduce (and push a non-terminal). */
export function reductionRows(parse: LrParse): number[] {
	return parse.rows.flatMap((row, k) =>
		row.action?.kind === 'reduce' && row.goto?.to != null ? [k] : []
	);
}

/** The forest after the first `count` reductions (Bottom-Up Parsing, slides 5–10). */
export function forestAfter(parse: LrParse, count: number): ParseNode[] {
	if (count <= 0) return rest(parse, 0);
	const rows = reductionRows(parse);
	const k = rows[Math.min(count, rows.length) - 1];
	if (k === undefined) return rest(parse, 0);
	return [...parse.rows[k].forest, ...rest(parse, parse.rows[k].j)];
}

/**
 * Rows of the drawing before the last row of the parse, the tallest the
 * forest gets: passed as `minRows`, it keeps the height steady while the
 * forest grows.
 */
export function finalRows(parse: LrParse): number {
	if (parse.rows.length === 0) return 1;
	const { forest } = forestBefore(parse, parse.rows.length - 1);
	return forest.length ? layoutForest(forest).rows : 1;
}

// ───────────────────────────── why each action ─────────────────────────────

const list = (items: readonly string[]): string =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** A state's label, quoted as Bottom-up Parsing II, slide 16 quotes it: “E → int on $, +”. */
const label = (g: Grammar, r: RowDecision['reduces'][number]): string => {
	const p = g.productions[r.production];
	const text = annotationText({ kind: 'reduce', lhs: p.lhs, rhs: p.rhs, lookaheads: r.lookaheads });
	return `“${text}”`;
};

/** The shift/reduce conflict of a state that shifts: “… is also labeled …”. */
const alsoLabeled = (g: Grammar, d: RowDecision, subject: string): string =>
	d.reduces.length
		? ` ${subject} is also labeled ${list(d.reduces.map((r) => label(g, r)))}: a shift/reduce conflict on ${symbolText(d.token)}, which the table settles with the shift.`
		: '';

/**
 * Why a parse stopped before accepting or rejecting its input, from the
 * engine's text for its last row: "the parse tree would be more than 500
 * levels deep", "after 20000 steps". Null for a parse that did not stop.
 */
export function stopReason(parse: LrParse): string | null {
	if (parse.outcome !== 'limit') return null;
	const text = parse.rows[parse.rows.length - 1]?.text ?? '';
	return text.replace(/^stopped:?\s*/, '') || null;
}

/**
 * Why the parser takes the action of a row, in the words of Bottom-up Parsing
 * II, slide 16: the DFA run on the stack ends in a state X; with the token
 * tok after the divider, a transition on tok means shift and a label
 * “A → β on tok” means reduce. A conflict and how the table settles it are
 * named, and so is the reason a parse stopped.
 */
export function explain(
	result: Pick<ParseView, 'grammar' | 'decisions' | 'parse'>,
	row: ShiftReduceRow
): string {
	const { grammar: g, decisions } = result;
	const ds = row.rows.map((k) => decisions[k]).filter((d) => d !== undefined);
	const d = ds[0];
	if (!d) return '';
	const tok = symbolText(d.token);
	const X = `State ${d.state}`;
	switch (row.action) {
		case 'shift': {
			if (ds.length === 1)
				return `${X} has a transition on ${tok}: shift.${alsoLabeled(g, d, 'It')}`;
			const moves = ds.map((e, i) =>
				i === 0
					? `State ${e.state} has a transition on ${symbolText(e.token)}`
					: `state ${e.state} on ${symbolText(e.token)}`
			);
			const also = ds.map((e) => alsoLabeled(g, e, `State ${e.state}`)).join('');
			return `${list(moves)}: ${row.text}.${also}`;
		}
		case 'reduce': {
			const chosen = d.reduces.find((r) => r.production === row.production);
			const text = chosen ? label(g, chosen) : row.text.replace(/^red\. /, '');
			const others = d.reduces.filter((r) => r !== chosen).map((r) => label(g, r));
			const conflict =
				d.shift !== null
					? ` It also has a transition on ${tok}: a shift/reduce conflict, which the table settles with the reduction.`
					: others.length
						? ` It is also labeled ${list(others)}: a reduce/reduce conflict, which the table settles with the rule written first.`
						: '';
			return `${X} is labeled ${text}, and the token after the divider is ${tok}: reduce.${conflict}`;
		}
		case 'accept':
			return `${X} is labeled “accept on $”, and the token after the divider is $: accept.${
				d.reduces.length
					? ` It is also labeled ${list(d.reduces.map((r) => label(g, r)))}: a reduce/reduce conflict, which the table settles with accept.`
					: ''
			}`;
		case 'error':
			return `${X} has no transition on ${tok} and no label on ${tok}: the input is rejected.`;
		case 'limit': {
			const reason = stopReason(result.parse);
			if (!reason) return 'The parse stopped here: it is too long to follow further.';
			return /^after\b/.test(reason)
				? `The parse stopped here, ${reason}: it is too long to follow further.`
				: `The parse stopped here: ${reason}.`;
		}
	}
}

// ───────────────────────────── handles ─────────────────────────────

export interface FormPiece {
	text: string;
	/** Part of the handle (or, in a derivation, of what the step put in). */
	mark: boolean;
}

export interface FormView {
	pieces: FormPiece[];
	/** The marked part is empty: an ε-production, at the place between the pieces. */
	empty: boolean;
	/** Plain text of the form, `E + (int) + (int)`. */
	text: string;
}

/** Symbols [start, end) of a form; start = end for the empty handle of an ε-production. */
export interface FormSpan {
	start: number;
	end: number;
}

/**
 * A sentential form spaced as the bottom-up decks write it, `E + (int) + (int)`,
 * with the symbols of `span` as one marked piece (the space before it is not
 * marked). An empty span is a marked piece without text at its place.
 */
export function formView(form: readonly string[], span: FormSpan | null = null): FormView {
	const texts = form.map(symbolText);
	const seps = symbolSeparators(texts, 'hug');
	const pieces: FormPiece[] = [];
	const add = (text: string, mark: boolean) => {
		if (!text) return;
		const last = pieces[pieces.length - 1];
		if (last && last.mark === mark && last.text !== '') last.text += text;
		else pieces.push({ text, mark });
	};
	const empty = span !== null && span.start === span.end;
	texts.forEach((text, i) => {
		const inside = span !== null && i >= span.start && i < span.end;
		add(seps[i], inside && i > span!.start);
		if (empty && i === span.start) pieces.push({ text: '', mark: true });
		add(text, inside);
	});
	if (empty && span.start >= texts.length) pieces.push({ text: '', mark: true });
	return { pieces, empty, text: texts.map((t, i) => seps[i] + t).join('') || 'ε' };
}

export interface HandleRow {
	/** The form with its handle marked (the start symbol has none). */
	marked: FormView;
	plain: FormView;
	/** The production the handle is reduced by; null for the start symbol. */
	production: number | null;
}

/** The reduction list of slides 5–10: each form, with and without its handle marked. */
export function handleRows(handles: readonly HandleStep[]): HandleRow[] {
	return handles.map((h) => ({
		marked: formView(h.form, h.handle),
		plain: formView(h.form),
		production: h.production
	}));
}

/**
 * The rightmost derivation read top-down, each form with the symbols the step
 * before it put in marked: the handle of the same form in the reduction list.
 */
export function derivationRows(g: Grammar, d: Derivation): FormView[] {
	const forms = [d.start, ...d.steps.map((s) => s.form)];
	return forms.map((form, i) => {
		const step = i > 0 ? d.steps[i - 1] : null;
		if (!step) return formView(form);
		const length = g.productions[step.production].rhs.length;
		return formView(form, { start: step.index, end: step.index + length });
	});
}

/**
 * The rightmost derivation listed bottom-up, to stand beside the reductions:
 * entry i is the form on row i of the reduction list, read upward the list is
 * the derivation, and the symbols marked in a form are what the step to it
 * put in, the handle of that form.
 */
export function derivationUpward(g: Grammar, d: Derivation): FormView[] {
	return derivationRows(g, d).reverse();
}
