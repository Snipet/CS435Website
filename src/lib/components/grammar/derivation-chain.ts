/**
 * Marks for DerivationChain: in each step, the non-terminal that is replaced
 * (in the form before the step) and what replaces it (in the form after).
 */
import { EPSILON } from '$lib/theory/grammar/types';
import type { ChainStep } from './types';

export interface ChainSymbol {
	text: string;
	nonterminal: boolean;
	/** The next step replaces this symbol. */
	replaced: boolean;
}

/** Consecutive symbols of a form; `made` marks the ones the last step put in. */
export interface ChainSegment {
	made: boolean;
	symbols: ChainSymbol[];
}

export interface ChainForm {
	/** Index into `forms`. */
	index: number;
	/** Before, the replacement, after; empty segments are left out. */
	segments: ChainSegment[];
	/** The form has no symbols and is shown as ε. */
	empty: boolean;
	/** The form as text: `E + T`, or `ε`. */
	text: string;
}

/** A sentential form as text: symbols separated by spaces, `ε` when empty. */
export function formText(form: readonly string[]): string {
	return form.length ? form.join(' ') : EPSILON;
}

/**
 * `steps[i]` describes the step from `forms[i]` to `forms[i + 1]`; missing
 * steps, and steps that do not point at a symbol, leave their forms unmarked.
 */
export function chainForms(
	forms: readonly (readonly string[])[],
	steps: readonly ChainStep[] = [],
	nonterminals: readonly string[] = []
): ChainForm[] {
	const isNonterminal = new Set(nonterminals);
	const valid = (i: number): ChainStep | null => {
		const step = steps[i];
		const before = forms[i];
		if (!step || !before || i + 1 >= forms.length) return null;
		const ok =
			Number.isInteger(step.index) &&
			step.index >= 0 &&
			step.index < before.length &&
			Number.isInteger(step.length) &&
			step.length >= 0;
		return ok ? step : null;
	};
	return forms.map((form, index) => {
		const next = valid(index);
		const last = index > 0 ? valid(index - 1) : null;
		const from = last ? Math.min(last.index, form.length) : 0;
		const to = last ? Math.min(last.index + last.length, form.length) : 0;
		const symbols = form.map((text, k): ChainSymbol => ({
			text,
			nonterminal: isNonterminal.has(text),
			replaced: next !== null && next.index === k
		}));
		const segments: ChainSegment[] = [
			{ made: false, symbols: symbols.slice(0, from) },
			{ made: true, symbols: symbols.slice(from, to) },
			{ made: false, symbols: symbols.slice(to) }
		].filter((s) => s.symbols.length > 0);
		return { index, segments, empty: form.length === 0, text: formText(form) };
	});
}
