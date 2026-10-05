/**
 * "Same grammar, different order" (Top-Down Parsing, slide 17): the grammar
 * text with the alternatives of every non-terminal in reverse order.
 */
import { parseGrammar } from '$lib/theory/grammar/parse';

/**
 * Swaps the alternatives of each non-terminal in place, first with last, so
 * the layout, the comments and the order of the non-terminals stay as they
 * were written. Reversing twice gives the text back. Null when the text is
 * not a grammar.
 */
export function reverseAlternatives(text: string): string | null {
	const { grammar } = parseGrammar(text);
	if (!grammar) return null;
	const spans = new Map<string, { start: number; end: number }[]>();
	for (const p of grammar.productions) {
		if (!p.span) return null;
		const list = spans.get(p.lhs);
		if (list) list.push(p.span);
		else spans.set(p.lhs, [p.span]);
	}
	const edits: { start: number; end: number; text: string }[] = [];
	for (const list of spans.values()) {
		const written = list.map((s) => text.slice(s.start, s.end));
		list.forEach((s, i) =>
			edits.push({ start: s.start, end: s.end, text: written[written.length - 1 - i] })
		);
	}
	// From the end of the text, so the offsets of the edits still to make stay valid.
	edits.sort((a, b) => b.start - a.start);
	let out = text;
	for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
	return out;
}

/** True when reversing changes the grammar: some non-terminal has two alternatives. */
export function canReverse(text: string): boolean {
	const reversed = reverseAlternatives(text);
	return reversed !== null && reversed !== text;
}
