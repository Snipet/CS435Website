/**
 * Handles (Bottom-Up Parsing, slides 4–11): a bottom-up parse reduces the
 * input to the start symbol, each time replacing a handle β by A for a
 * production A → β. The sentential forms, read from the start symbol back to
 * the input, are a rightmost derivation; so the handles of a parse can be
 * read off an LR parse, or off a parse tree's rightmost derivation reversed.
 */
import { derivationFromTree } from './derive';
import type { LrParse } from './lr-parse';
import type { Grammar, ParseNode, SententialForm } from './types';

/** One sentential form of a bottom-up parse and the reduction made in it. */
export interface HandleStep {
	form: SententialForm;
	/** The handle β: form[start … end) (empty for an ε-production); null for the start symbol. */
	handle: { start: number; end: number } | null;
	/** The production A → β whose reduction gives the next form; null for the start symbol. */
	production: number | null;
}

/**
 * The handles of a parse tree: its rightmost derivation (derivationFromTree),
 * reversed. The first form is the tree's yield, the last its root symbol;
 * each form but the last has the handle that the next reduction replaces.
 * For an unambiguous grammar this is the reduction sequence of every
 * bottom-up parse of the sentence.
 */
export function handlesFromTree(g: Grammar, tree: ParseNode): HandleStep[] {
	const d = derivationFromTree(g, tree, 'rightmost');
	const forms = [d.start, ...d.steps.map((s) => s.form)];
	const out: HandleStep[] = [];
	for (let k = d.steps.length; k >= 1; k--) {
		const step = d.steps[k - 1];
		const length = g.productions[step.production].rhs.length;
		out.push({
			form: forms[k],
			handle: { start: step.index, end: step.index + length },
			production: step.production
		});
	}
	out.push({ form: forms[0], handle: null, production: null });
	return out;
}

/**
 * The handles of an LR parse: at each reduction, the stack's symbols and the
 * rest of the input form the sentential form, and the handle is the top |β|
 * symbols of the stack (Bottom-Up Parsing, slide 11: what is right of a
 * handle is all terminals). null unless the parse accepted.
 */
export function handlesFromParse(parse: LrParse): HandleStep[] | null {
	if (parse.outcome !== 'accept') return null;
	const g = parse.grammar;
	const out: HandleStep[] = [];
	for (const row of parse.rows) {
		if (row.action?.kind !== 'reduce' || row.goto?.to == null) continue;
		const stack = row.stack.slice(1).map((e) => e.symbol!);
		const rest = parse.input.slice(row.j, -1);
		const length = g.productions[row.action.production].rhs.length;
		out.push({
			form: [...stack, ...rest],
			handle: { start: stack.length - length, end: stack.length },
			production: row.action.production
		});
	}
	out.push({ form: [g.start], handle: null, production: null });
	return out;
}
