/**
 * Checks a span picked in a sentential form against the definition of a
 * handle (Bottom-Up Parsing, slides 4 and 11): β is a handle of sent when
 * A → β and S →* α A γ → α β γ = sent is a step of a rightmost derivation,
 * so γ is all terminals.
 */
import { productionText, symbolText } from '$lib/components/grammar/lr-item';
import { makeGrammar, recognizes, type Grammar, type HandleStep } from '$lib/theory/grammar';
import { formView } from './view';

/** Longest sentential form in which a pick is checked. */
export const MAX_PICK_FORM = 120;

export interface Span {
	start: number;
	end: number;
}

export type PickVerdict =
	/** The handle the parse reduces. */
	| { kind: 'handle'; production: number }
	/** No production has these symbols as its right-hand side. */
	| { kind: 'not-rhs' }
	/** Right of the span stands a non-terminal: γ is not all terminals. */
	| { kind: 'nonterminal-right'; productions: number[]; symbol: string; index: number }
	/**
	 * The handle the parse reduces starts further left. `forms` holds α A γ for
	 * each production A → β; `alsoHandle` lists the productions for which it is
	 * a sentential form of a rightmost derivation all the same (an ambiguous
	 * grammar: then the first handle is the one reduced).
	 */
	| { kind: 'further-left'; productions: number[]; forms: string[][]; alsoHandle: number[] }
	/** A handle of another parse of the same form: the grammar is ambiguous. */
	| { kind: 'other-handle'; productions: number[]; forms: string[][] }
	/** α A γ is not a sentential form of any rightmost derivation. */
	| { kind: 'not-rightmost'; productions: number[]; forms: string[][] };

const sameSymbols = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((s, i) => s === b[i]);

// Names for the symbols of the checking grammar that no grammar symbol can have.
const leafName = (n: string) => `\u0000leaf ${n}`;
const pathName = (n: string) => `\u0000path ${n}`;

/**
 * Whether `form` is a sentential form of a rightmost derivation from the
 * start symbol (a right sentential form). In the tree of a rightmost
 * derivation that stops at `form`, the rightmost non-terminal of the form is
 * a leaf, every node left of the path from the root to it is a leaf, and what
 * is right of the path derives terminals only. A grammar for exactly such
 * forms has, for each non-terminal X, a symbol "path X": path X → leaf X (X
 * is that leaf), and for every production X → Y1 … Yn and non-terminal Yi,
 * path X → leaf Y1 … leaf Yi−1 path Yi Yi+1 … Yn, where a leaf of a terminal is
 * the terminal and the leaf of a non-terminal is a terminal that stands for
 * it. A form without non-terminals is a sentence, a right sentential form
 * when the grammar derives it.
 */
export function isRightSentential(g: Grammar, form: readonly string[]): boolean {
	const nonterminals = new Set(g.nonterminals);
	if (!form.some((s) => nonterminals.has(s))) return recognizes(g, form);
	const leaf = (s: string) => (nonterminals.has(s) ? leafName(s) : s);
	const rules: { lhs: string; rhs: string[] }[] = [];
	// The start symbol's path rules first: makeGrammar takes the first left-hand side as S.
	const order = [g.start, ...g.nonterminals.filter((n) => n !== g.start)];
	for (const x of order) {
		rules.push({ lhs: pathName(x), rhs: [leafName(x)] });
		for (const p of g.productions) {
			if (p.lhs !== x) continue;
			p.rhs.forEach((y, i) => {
				if (!nonterminals.has(y)) return;
				rules.push({
					lhs: pathName(x),
					rhs: [...p.rhs.slice(0, i).map(leaf), pathName(y), ...p.rhs.slice(i + 1)]
				});
			});
		}
	}
	for (const p of g.productions) rules.push({ lhs: p.lhs, rhs: p.rhs });
	const checking = makeGrammar(rules);
	return recognizes(checking, form.map(leaf));
}

/**
 * Checks `pick` against the handle of `step` (a form of the parse, not the
 * start symbol), in this order: the parse's own handle; the right-hand side
 * of a production; only terminals right of it; a handle further left; a
 * handle of another rightmost derivation; otherwise α A γ is not a form of
 * any rightmost derivation.
 */
export function checkPick(g: Grammar, step: HandleStep, pick: Span): PickVerdict {
	const { form, handle } = step;
	const beta = form.slice(pick.start, pick.end);
	if (handle && step.production !== null && pick.start === handle.start && pick.end === handle.end)
		return { kind: 'handle', production: step.production };
	const productions = g.productions.filter((p) => sameSymbols(p.rhs, beta)).map((p) => p.id);
	if (productions.length === 0) return { kind: 'not-rhs' };
	const nonterminals = new Set(g.nonterminals);
	const right = form.findIndex((s, i) => i >= pick.end && nonterminals.has(s));
	if (right !== -1)
		return { kind: 'nonterminal-right', productions, symbol: form[right], index: right };
	const forms = productions.map((id) => [
		...form.slice(0, pick.start),
		g.productions[id].lhs,
		...form.slice(pick.end)
	]);
	const reducible = productions.filter((_, k) => isRightSentential(g, forms[k]));
	if (handle && handle.start < pick.start)
		return { kind: 'further-left', productions, forms, alsoHandle: reducible };
	if (reducible.length > 0)
		return {
			kind: 'other-handle',
			productions: reducible,
			forms: reducible.map((id) => forms[productions.indexOf(id)])
		};
	return { kind: 'not-rightmost', productions, forms };
}

export interface VerdictText {
	correct: boolean;
	title: string;
	text: string;
}

/** What the page says about a pick: in words, with forms spaced as the decks write them. */
export function describeVerdict(
	g: Grammar,
	step: HandleStep,
	pick: Span,
	verdict: PickVerdict
): VerdictText {
	const form = step.form;
	const beta = formView(form.slice(pick.start, pick.end)).text;
	const production = (id: number) => {
		const p = g.productions[id];
		return productionText(p.lhs, p.rhs, 'hug');
	};
	const productions = (ids: readonly number[]) => ids.map(production).join(' and ');
	const start = symbolText(g.start);
	const text = (symbols: readonly string[]) => formView(symbols).text;
	switch (verdict.kind) {
		case 'handle': {
			const p = g.productions[verdict.production];
			const before = [...form.slice(0, pick.start), p.lhs, ...form.slice(pick.end)];
			const gamma = form.slice(pick.end);
			return {
				correct: true,
				title: 'This is the handle.',
				text: `${production(p.id)}, and ${text(before)} → ${text(form)} is a step of a rightmost derivation from ${start}. ${
					gamma.length ? `Right of the handle, γ = ${text(gamma)} is all terminals.` : 'γ is empty.'
				}`
			};
		}
		case 'not-rhs':
			return {
				correct: false,
				title: 'Not a right-hand side.',
				text: `No production A → β has β = ${beta}.`
			};
		case 'nonterminal-right':
			return {
				correct: false,
				title: 'A non-terminal is right of it.',
				text: `${beta} is the right-hand side of ${productions(verdict.productions)}, but ${symbolText(verdict.symbol)} stands right of it. Right of a handle there are only terminals, because α A γ → α β γ is a step of a rightmost derivation, which replaces the rightmost non-terminal.`
			};
		case 'further-left': {
			const also = verdict.alsoHandle;
			const id = also[0] ?? verdict.productions[0];
			const reduced = text(verdict.forms[verdict.productions.indexOf(id)]);
			return {
				correct: false,
				title: 'There is a handle further left.',
				text: also.length
					? `Reducing ${beta} by ${production(id)} gives ${reduced}, a form of another rightmost derivation from ${start} (the grammar is ambiguous). The first handle of the form is the one reduced, and it starts further left.`
					: `Reducing ${beta} by ${production(id)} gives ${reduced}, which is not a sentential form of a rightmost derivation from ${start}. The handle starts further left.`
			};
		}
		case 'other-handle':
			return {
				correct: false,
				title: 'A handle of another parse.',
				text: `Reducing ${beta} by ${production(verdict.productions[0])} gives ${text(verdict.forms[0])}, a sentential form of a rightmost derivation from ${start}: the grammar is ambiguous, and in another parse tree this is the handle. This parse reduces another one, as the LR(1) table settles its conflicts.`
			};
		case 'not-rightmost':
			return {
				correct: false,
				title: 'Not reducible in a rightmost derivation.',
				text: `Reducing ${beta} by ${production(verdict.productions[0])} gives ${text(verdict.forms[0])}, which is not a sentential form of any rightmost derivation from ${start}.`
			};
	}
}
