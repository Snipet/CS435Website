/**
 * Text and choices the tool's components show, kept apart from the markup so
 * they can be tested: configurations (stack I input), the labels of a
 * conflict's resolution and of its two actions, outcomes of a parse, the
 * declaration lines, and highlighting of the declaration editor.
 */
import { classPoint, placeText, type GrammarPlace } from '$lib/components/grammar/grammar-classes';
import { joinSymbols, symbolText } from '$lib/components/grammar/lr-item';
import type { HighlightToken, Tone } from '$lib/components/ui/types';
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Precedence } from '$lib/theory/grammar/lr-table';
import { END_MARKER } from '$lib/theory/grammar/types';
import type { ConflictView, ParseView } from './analysis';
import type { PrecedenceLine } from './precedence';

/** The divider between the stack and the input, the decks' red bar (§3.10). */
export const DIVIDER = 'I';

/**
 * A configuration as the shift-reduce traces write it: the stack (spaced as
 * the decks space sentential forms), the divider, then the next terminal and
 * `…` for the rest of the input (nothing after `$`).
 */
export function configurationParts(
	stack: readonly string[],
	next: string | null
): { stack: string; next: string; rest: boolean } {
	return {
		stack: stack.length ? joinSymbols(stack, 'hug') : '',
		next: next === null ? '' : next === END_MARKER ? END_MARKER : symbolText(next),
		rest: next !== END_MARKER
	};
}

/** `E * E I + …`, `id I $`, `E * E + I …`. */
export function configurationText(stack: readonly string[], next: string | null): string {
	const p = configurationParts(stack, next);
	return [p.stack, DIVIDER, p.next, p.rest ? '…' : ''].filter(Boolean).join(' ');
}

/** The resolution in a few words: `reduce, by precedence`, `shift, bison’s default`. */
export function resolutionLabel(c: Pick<ConflictView, 'explanation' | 'moves'>): {
	text: string;
	tone: Tone;
} {
	const e = c.explanation;
	const action = e.winner === 'error' ? 'error' : c.moves[e.winner].kind;
	if (e.by === 'precedence') return { text: `${action}, by precedence`, tone: 'accept' };
	return { text: `${action}, bison’s default`, tone: 'active' };
}

/** The name of a table entry: `action[6, +]`. */
export const entryText = (state: number, terminal: string) =>
	`action[${state}, ${terminal === END_MARKER ? END_MARKER : symbolText(terminal)}]`;

/** The options of a conflict's choice: its two moves, and `error` when %nonassoc made the entry one. */
export function choiceOptions(
	c: Pick<ConflictView, 'explanation' | 'moves'>
): { value: 0 | 1 | 2; label: string }[] {
	const options: { value: 0 | 1 | 2; label: string }[] = c.moves.map((m, i) => ({
		value: i as 0 | 1,
		label: m.text
	}));
	if (c.explanation.winner === 'error') options.push({ value: 2, label: 'error' });
	return options;
}

/** The option a conflict's choice shows: the action chosen, else the one that won (2: error). */
export function choiceValue(
	c: Pick<ConflictView, 'explanation' | 'index'>,
	choices: readonly [number, 0 | 1][]
): 0 | 1 | 2 {
	const chosen = choices.find(([k]) => k === c.index);
	if (chosen) return chosen[1];
	return c.explanation.winner === 'error' ? 2 : c.explanation.winner;
}

/** A declared precedence: `line 2, %left`; `none` when undeclared. */
export function precedenceText(p: Precedence | null, lines: readonly PrecedenceLine[]): string {
	if (!p) return 'none declared';
	const line = lines.find((l) => l.level === p.level);
	return `${line ? `line ${line.line + 1}` : `level ${p.level}`}, %${p.assoc}`;
}

/** What a parse ended with, for its card. */
export function outcomeText(p: ParseView): { title: string; tone: Tone; detail: string | null } {
	if (p.outcome === 'accept')
		return { title: 'Accepted', tone: 'accept', detail: `${p.steps} steps of the LR parser` };
	if (p.outcome === 'limit') return { title: 'Stopped', tone: 'active', detail: p.text };
	return { title: 'Rejected', tone: 'reject', detail: p.text };
}

/** The declaration lines in words, for the toggles: `level 1 (lowest)`, `off`. */
export function lineCaption(line: PrecedenceLine, levels: number): string {
	if (!line.on || line.level === null) return 'off';
	if (levels === 1) return 'level 1';
	if (line.level === 1) return 'level 1, lowest';
	if (line.level === levels) return `level ${line.level}, highest`;
	return `level ${line.level}`;
}

/**
 * Highlighting for the declaration editor: directives, quoted terminals and
 * comments, with the global `hl-*` classes.
 */
export function highlightPrecedence(text: string): HighlightToken[] {
	const out: HighlightToken[] = [];
	const pattern =
		/(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(%[A-Za-z-]+)|('(?:\\.|[^'\\\n])*'?)|("(?:\\.|[^"\\\n])*"?)|(<[^>\n]*>)/g;
	for (const m of text.matchAll(pattern)) {
		const from = m.index;
		const to = from + m[0].length;
		const className =
			m[1] || m[2] ? 'hl-comment' : m[3] ? 'hl-keyword' : m[6] ? 'hl-special' : 'hl-string';
		out.push({ from, to, className });
	}
	return out;
}

/** A list of numbers in words: `4`, `4 and 9`, `3, 8 and 11`. */
export function listText(items: readonly (string | number)[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What the dot of the grammar classes diagram marks, or why there is none. */
export function placeCaption(place: GrammarPlace): string {
	if (!classPoint(place))
		return 'The grammar is not LR(1), and no token string has shown it to be ambiguous: the diagram has no one place for it.';
	return placeText(place).replace(/^Marked: /, 'The dot marks ');
}

/**
 * Notes of one kind as one note: the grammar parser notes each non-terminal
 * that does not start with a capital letter, which for C- is 29 notes. Notes
 * whose text is the same up to `: ` become the first of them, naming the
 * first `limit` and counting the rest. Errors and warnings are kept as they
 * are.
 */
export function condenseNotes(diagnostics: readonly Diagnostic[], limit = 3): Diagnostic[] {
	const out: Diagnostic[] = [];
	const groups = new Map<string, { at: number; names: string[] }>();
	for (const d of diagnostics) {
		const colon = d.message.lastIndexOf(': ');
		if (d.severity !== 'info' || colon < 0) {
			out.push(d);
			continue;
		}
		const head = d.message.slice(0, colon);
		const name = d.message.slice(colon + 2);
		const group = groups.get(head);
		if (group) {
			group.names.push(name);
			continue;
		}
		groups.set(head, { at: out.length, names: [name] });
		out.push(d);
	}
	for (const [head, { at, names }] of groups) {
		if (names.length === 1) continue;
		const shown = names.slice(0, limit).join(', ');
		const rest = names.length - Math.min(limit, names.length);
		out[at] = { ...out[at], message: `${head}: ${shown}${rest ? ` and ${rest} more` : ''}` };
	}
	return out;
}
