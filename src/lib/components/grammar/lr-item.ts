/**
 * LR(1) items and item-set states as the bottom-up decks write them
 * (docs/ARCHITECTURE.md §3.10; Bottom-up Parsing III, slides 5–14):
 *
 * - bracketed, for definitions and conflicts: `[E → E + • ( E ), +]`,
 *   `[S → •, $]`;
 * - spaced, the same without brackets: `E → E + • ( E ), +`;
 * - compact, inside a state box: `E → •E+(E), $/+`, where items that differ
 *   only in their lookahead are merged and the lookaheads joined by `/`.
 *
 * A state is annotated with the reductions it allows, `E → int on $, +`, and
 * the state of the augmented start item with `accept on $`.
 *
 * Pure: no DOM, no engine beyond the grammar types and the symbol printer, so
 * the item type of an LR engine maps onto `ItemView` with a few lines.
 */
import { printSymbols } from '$lib/theory/grammar/parse';
import { END_MARKER, EPSILON } from '$lib/theory/grammar/types';

/** The dot of an item; drawn red (`--reject`) by the item components. */
export const ITEM_DOT = '•';

/** An LR item [X → α•β, a]: `rhs` is αβ and `dot` the length of α. */
export interface ItemView {
	lhs: string;
	rhs: readonly string[];
	/** Position of the dot in `rhs`, 0 … rhs.length. */
	dot: number;
	/**
	 * The lookahead terminals: one for an LR(1) item, several for items merged
	 * by `mergeLookaheads`, none for an LR(0) item (then no `, a` is written).
	 */
	lookaheads: readonly string[];
}

/** `bracketed`: [E → E + • ( E ), +]; `spaced`: E → E + • ( E ), +; `compact`: E → E+•(E), $/+. */
export type ItemStyle = 'bracketed' | 'spaced' | 'compact';

/**
 * How symbols are joined: `spaced` puts a space between any two (`E + ( E )`);
 * `compact` only between two word-like symbols (`E+(E)`, `int Y`); `hug` puts
 * spaces everywhere except just inside parentheses and brackets, as the
 * bottom-up decks write sentential forms and reductions (`E + (E)`,
 * `int + (int) + (int)`).
 */
export type SymbolSpacing = 'spaced' | 'compact' | 'hug';

const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);

/** A symbol as the grammar text would write it (`int`, `+`, `"the cat"`). */
export function symbolText(symbol: string): string {
	return printSymbols([symbol]);
}

/** One punctuation character, which needs no space next to it in the compact form. */
const isMark = (text: string) => [...text].length === 1 && /^[^\p{L}\p{N}_'’-]$/u.test(text);

/**
 * The separator to write before each symbol of `symbols` (printed texts):
 * '' before the first.
 */
export function symbolSeparators(texts: readonly string[], spacing: SymbolSpacing): string[] {
	return texts.map((text, i) => {
		if (i === 0) return '';
		const before = texts[i - 1];
		if (spacing === 'spaced') return ' ';
		if (spacing === 'hug') return OPENING.has(before) || CLOSING.has(text) ? '' : ' ';
		return isMark(before) || isMark(text) ? '' : ' ';
	});
}

/** Symbols joined with `spacing`; `ε` for none. */
export function joinSymbols(symbols: readonly string[], spacing: SymbolSpacing = 'spaced'): string {
	if (!symbols.length) return EPSILON;
	const texts = symbols.map(symbolText);
	const seps = symbolSeparators(texts, spacing);
	return texts.map((t, i) => seps[i] + t).join('');
}

/** A production, `E → E + ( E )`; the arrow is always spaced, `S → ε` for an empty right side. */
export function productionText(
	lhs: string,
	rhs: readonly string[],
	spacing: SymbolSpacing = 'spaced'
): string {
	return `${symbolText(lhs)} → ${joinSymbols(rhs, spacing)}`;
}

/**
 * A lookahead as written in an item or an annotation: `$` stays bare, and a
 * comma or slash terminal is quoted so it is not read as a separator.
 */
export function lookaheadSymbol(symbol: string): string {
	if (symbol === END_MARKER) return END_MARKER;
	if (symbol === ',' || symbol === '/') return `"${symbol}"`;
	return symbolText(symbol);
}

/** `$/+` in an item, `$, +` in an annotation. */
export function lookaheadText(lookaheads: readonly string[], separator: '/' | ', ' = '/'): string {
	return lookaheads.map(lookaheadSymbol).join(separator);
}

export type ItemPartKind =
	'bracket' | 'lhs' | 'arrow' | 'symbol' | 'dot' | 'space' | 'comma' | 'lookahead';

export interface ItemPart {
	kind: ItemPartKind;
	text: string;
}

/** The pieces of an item, in order, for drawing the dot in its own color. */
export function itemParts(item: ItemView, style: ItemStyle = 'bracketed'): ItemPart[] {
	const parts: ItemPart[] = [];
	const push = (kind: ItemPartKind, text: string) => {
		if (text) parts.push({ kind, text });
	};
	const dot = Math.max(0, Math.min(item.rhs.length, Math.trunc(item.dot) || 0));
	if (style === 'bracketed') push('bracket', '[');
	push('lhs', symbolText(item.lhs));
	push('space', ' ');
	push('arrow', '→');
	push('space', ' ');
	const texts = item.rhs.map(symbolText);
	if (style === 'compact') {
		const seps = symbolSeparators(texts, 'compact');
		// The dot sticks to the symbol after it: `E+(•E)`, `int •Y`.
		texts.forEach((text, i) => {
			push('space', seps[i]);
			if (i === dot) push('dot', ITEM_DOT);
			push('symbol', text);
		});
		if (dot === texts.length) push('dot', ITEM_DOT);
	} else {
		// Spaced: the dot is a symbol of its own, `E + • ( E )`, `S → •`.
		const all = [...texts.slice(0, dot), ITEM_DOT, ...texts.slice(dot)];
		all.forEach((text, i) => {
			if (i > 0) push('space', ' ');
			push(i === dot ? 'dot' : 'symbol', text);
		});
	}
	if (item.lookaheads.length) {
		push('comma', ', ');
		push('lookahead', lookaheadText(item.lookaheads, '/'));
	}
	if (style === 'bracketed') push('bracket', ']');
	return parts;
}

/** `[E → E + • ( E ), +]`, `E → E + • ( E ), +` or `E → E+•(E), $/+`. */
export function formatItem(item: ItemView, style: ItemStyle = 'bracketed'): string {
	return itemParts(item, style)
		.map((p) => p.text)
		.join('');
}

/** Identity of an item without its lookaheads. */
const coreKey = (item: ItemView) => JSON.stringify([item.lhs, item.rhs, item.dot]);

/**
 * Merges items that differ only in their lookahead into one item with all of
 * them, as the state boxes do (`E → •int, $` and `E → •int, +` become
 * `E → •int, $/+`). Items keep the order of their first appearance, and so do
 * the lookaheads of each, unless `order` lists the terminals in the order to
 * use (terminals it does not list come last, in order of appearance).
 */
export function mergeLookaheads(
	items: readonly ItemView[],
	opts: { order?: readonly string[] } = {}
): ItemView[] {
	const merged = new Map<string, { item: ItemView; lookaheads: string[] }>();
	for (const item of items) {
		const key = coreKey(item);
		let entry = merged.get(key);
		if (!entry) {
			entry = { item, lookaheads: [] };
			merged.set(key, entry);
		}
		for (const a of item.lookaheads) if (!entry.lookaheads.includes(a)) entry.lookaheads.push(a);
	}
	const rank = opts.order ? new Map(opts.order.map((a, i) => [a, i])) : null;
	return [...merged.values()].map(({ item, lookaheads }) => {
		if (rank) {
			const at = (a: string) => rank.get(a) ?? rank.size + lookaheads.indexOf(a);
			lookaheads = [...lookaheads].sort((a, b) => at(a) - at(b));
		}
		return { lhs: item.lhs, rhs: item.rhs, dot: item.dot, lookaheads };
	});
}

/** One item per lookahead: the full form of a merged item (`$/+` gives two items). */
export function splitLookaheads(items: readonly ItemView[]): ItemView[] {
	return items.flatMap((item) =>
		item.lookaheads.length
			? item.lookaheads.map((a) => ({ ...item, lookaheads: [a] }))
			: [{ ...item, lookaheads: [] }]
	);
}

/** What a state is labeled with beside its box. */
export type StateAnnotation =
	| { kind: 'reduce'; lhs: string; rhs: readonly string[]; lookaheads: readonly string[] }
	| { kind: 'accept'; lookaheads: readonly string[] };

/**
 * The labels of a state: for every item with the dot at the end, "reduce with
 * X → α on b" (merged over lookaheads, in order of appearance); for such an
 * item of `start` (the augmented start symbol, e.g. `S` of `S → E`), accept.
 */
export function stateAnnotations(
	items: readonly ItemView[],
	opts: { start?: string } = {}
): StateAnnotation[] {
	const out: StateAnnotation[] = [];
	for (const item of mergeLookaheads(items.filter((it) => it.dot >= it.rhs.length))) {
		if (opts.start !== undefined && item.lhs === opts.start) {
			out.push({ kind: 'accept', lookaheads: item.lookaheads });
		} else {
			out.push({ kind: 'reduce', lhs: item.lhs, rhs: item.rhs, lookaheads: item.lookaheads });
		}
	}
	return out;
}

/** `E → int on $, +`, `E → E + (E) on ), +`, `accept on $`. */
export function annotationText(a: StateAnnotation): string {
	const head = a.kind === 'accept' ? 'accept' : productionText(a.lhs, a.rhs, 'hug');
	return a.lookaheads.length ? `${head} on ${lookaheadText(a.lookaheads, ', ')}` : head;
}
