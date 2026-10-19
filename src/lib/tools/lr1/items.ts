/**
 * LR(1) items between the engine and the page: the engine's items as the
 * `ItemView`s the item components draw, one line per item ("full") or one
 * line per core with the lookaheads merged ("abbreviated", `$/+`, Bottom-up
 * Parsing III, slide 11), and items typed by the user, read back with the
 * grammar's own symbols (`E → E + ( •E ), +`).
 */
import { itemParts, type ItemPart, type ItemView } from '$lib/components/grammar/lr-item';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { mergeItems, type Augmented, type LrItem } from '$lib/theory/grammar/lr';
import { tokenizeInput } from '$lib/theory/grammar/parse';
import { END_MARKER } from '$lib/theory/grammar/types';

/** Items one per line, or merged per core with their lookaheads joined by `/`. */
export type ItemForm = 'abbreviated' | 'full';

/** An engine item as the item components draw it. */
export function itemView(aug: Augmented, item: LrItem): ItemView {
	const p = aug.productions[item.production];
	return {
		lhs: p.lhs,
		rhs: p.rhs,
		dot: item.dot,
		lookaheads: item.lookahead === null ? [] : [item.lookahead]
	};
}

/**
 * An item as Bottom-up Parsing III writes the items of Closure and Transition
 * (slides 10, 11 and 13): every symbol spaced, the dot against the symbol after
 * it, `S → •E, $`, `E → •E + ( E ), $/+`, `[Y → •γ, b]`; at the end of the
 * right side it stands apart, `E → E + ( E ) •, +` (slide 8), and alone for an
 * ε-production, `S → •, $`.
 */
export function closureItemParts(view: ItemView, brackets = false): ItemPart[] {
	const parts = itemParts(view, brackets ? 'bracketed' : 'spaced');
	return parts.filter((p, i) => !(p.kind === 'space' && parts[i - 1]?.kind === 'dot'));
}

/** `closureItemParts` as text. */
export const closureItemText = (view: ItemView, brackets = false): string =>
	closureItemParts(view, brackets)
		.map((p) => p.text)
		.join('');

/** A line of an item list: the item drawn, and the indices of the items it stands for. */
export interface ItemLine {
	view: ItemView;
	items: number[];
}

/**
 * The lines of an item list. 'full' has one line per item; 'abbreviated'
 * one line per core, in the order the first of each appears, with `$` first
 * among the lookaheads and the rest in order of appearance (the engine's
 * `mergeItems`: `$/+`, `)/+`).
 */
export function itemLines(aug: Augmented, items: readonly LrItem[], form: ItemForm): ItemLine[] {
	if (form === 'full') return items.map((item, i) => ({ view: itemView(aug, item), items: [i] }));
	const lines = mergeItems(items).map((m) => {
		const p = aug.productions[m.production];
		return {
			view: { lhs: p.lhs, rhs: p.rhs, dot: m.dot, lookaheads: m.lookaheads ?? [] },
			items: [] as number[]
		};
	});
	const lineOf = new Map(mergeItems(items).map((m, k) => [`${m.production},${m.dot}`, k]));
	items.forEach((item, i) => lines[lineOf.get(`${item.production},${item.dot}`)!].items.push(i));
	return lines;
}

/** The lines (indices into `itemLines`) that show any of `indices`. */
export function linesOf(lines: readonly ItemLine[], indices: Iterable<number>): number[] {
	const wanted = new Set(indices);
	const out: number[] = [];
	lines.forEach((line, k) => {
		if (line.items.some((i) => wanted.has(i))) out.push(k);
	});
	return out;
}

/** Characters read as the dot of an item: •, ·, ∙, ●; `.` too when the grammar has no symbol `.`. */
const DOTS = ['•', '·', '∙', '●'];

export interface ItemsReading {
	items: LrItem[];
	diagnostics: Diagnostic[];
}

function shift(d: Diagnostic, offset: number): Diagnostic {
	return d.span
		? { ...d, span: { ...d.span, start: d.span.start + offset, end: d.span.end + offset } }
		: d;
}

const problem = (message: string, start: number, end: number): Diagnostic => ({
	severity: 'error',
	message,
	span: { start, end, source: null }
});

/**
 * Reads LR(1) items typed one per line, as Bottom-up Parsing III writes
 * them: `E → E + ( •E ), +`, with or without square brackets, `->` for the
 * arrow, the dot as • (or `.` when the grammar has no symbol `.`), and
 * several lookaheads joined by `/` (`E → •int, $/+` is two items). `S → •, $`
 * is the item of an ε-production. Each item must be one of the augmented
 * grammar's productions with a dot in it. Spans of the diagnostics index
 * into `text`.
 */
export function readItems(text: string, aug: Augmented): ItemsReading {
	const g = aug.grammar;
	const symbols = [...new Set([...g.nonterminals, ...g.terminals, aug.start])];
	const dots = symbols.includes('.') ? DOTS : [...DOTS, '.'];
	const terminals = new Set(g.terminals);
	const items: LrItem[] = [];
	const diagnostics: Diagnostic[] = [];
	const seen = new Set<string>();
	let offset = 0;
	for (const rawLine of text.split('\n')) {
		const lineStart = offset;
		offset += rawLine.length + 1;
		let line = rawLine;
		let start = lineStart;
		// Leading and trailing blanks, then the square brackets of the bracketed form.
		const lead = line.length - line.trimStart().length;
		line = line.trim();
		start += lead;
		if (line === '') continue;
		if (line.startsWith('[') && line.endsWith(']')) {
			line = line.slice(1, -1);
			start += 1;
		}
		const arrowMatch = /→|->/u.exec(line);
		if (!arrowMatch) {
			diagnostics.push(
				problem('An item needs an arrow: E → E + ( •E ), +', start, start + line.length)
			);
			continue;
		}
		const lhsText = line.slice(0, arrowMatch.index);
		const lhsRead = tokenizeInput(lhsText, symbols);
		if (lhsRead.tokens.length !== 1 || lhsRead.diagnostics.length > 0) {
			diagnostics.push(
				problem(
					'The left of the arrow must be one non-terminal.',
					start,
					start + Math.max(1, arrowMatch.index)
				)
			);
			continue;
		}
		const lhs = lhsRead.tokens[0];
		const restStart = arrowMatch.index + arrowMatch[0].length;
		const rest = line.slice(restStart);
		// The lookaheads follow the last comma that leaves a list of terminals after it.
		let comma = -1;
		let lookaheads: string[] = [];
		for (let at = rest.lastIndexOf(','); at >= 0; at = rest.lastIndexOf(',', at - 1)) {
			const read = readLookaheads(rest.slice(at + 1), terminals);
			if (read) {
				comma = at;
				lookaheads = read;
				break;
			}
		}
		if (comma < 0) {
			diagnostics.push(
				problem(
					`Write the lookahead after a comma: ${lhs} → … , $ (several as $/+).`,
					start,
					start + line.length
				)
			);
			continue;
		}
		const bodyText = rest.slice(0, comma);
		const bodyStart = start + restStart;
		const body = tokenizeInput(bodyText, [...symbols, ...dots]);
		const unknown = body.diagnostics.map((d) =>
			shift(
				{
					...d,
					message: d.message.replace(
						'is not a terminal of the grammar.',
						'is not a symbol of the grammar.'
					)
				},
				bodyStart
			)
		);
		if (unknown.length > 0) {
			diagnostics.push(...unknown);
			continue;
		}
		const dotAt = body.tokens.flatMap((t, i) => (dots.includes(t) ? [i] : []));
		if (dotAt.length !== 1) {
			diagnostics.push(
				problem(
					dotAt.length === 0 ? 'Mark the dot with •: E → E + ( •E ), +' : 'An item has one dot.',
					bodyStart,
					bodyStart + Math.max(1, bodyText.length)
				)
			);
			continue;
		}
		const rhs = body.tokens.filter((_, i) => i !== dotAt[0]);
		const dot = dotAt[0];
		const p = aug.productions.find(
			(q) => q.lhs === lhs && q.rhs.length === rhs.length && q.rhs.every((s, i) => s === rhs[i])
		);
		if (!p) {
			diagnostics.push(
				problem(
					`${lhs} → ${rhs.length ? rhs.join(' ') : 'ε'} is not a production of the grammar.`,
					start,
					start + line.length
				)
			);
			continue;
		}
		for (const a of lookaheads) {
			const key = `${p.id},${dot},${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			items.push({ production: p.id, dot, lookahead: a });
		}
	}
	if (items.length === 0 && diagnostics.length === 0)
		diagnostics.push({ severity: 'error', message: 'Write an item, such as E → E + ( •E ), +' });
	return { items, diagnostics };
}

/** `$/+` → [$, +]; null unless every part is one terminal or $. */
function readLookaheads(text: string, terminals: ReadonlySet<string>): string[] | null {
	const known = [...terminals, END_MARKER, '/'];
	const read = tokenizeInput(text, known);
	if (read.diagnostics.length > 0 || read.tokens.length === 0) return null;
	const out: string[] = [];
	for (let i = 0; i < read.tokens.length; i++) {
		const t = read.tokens[i];
		if (i % 2 === 1) {
			if (t !== '/') return null;
			continue;
		}
		if (t !== END_MARKER && !terminals.has(t)) return null;
		out.push(t);
	}
	return read.tokens.length % 2 === 1 ? out : null;
}
