/**
 * The rewritten grammar for tools that read BNF only (the LL(1) table: "RHS
 * production choices must NOT contain meta-characters"). A result without
 * brackets is BNF already; one with `{ }` or `[ ]` is written in BNF with a
 * new non-terminal per bracket, as `ebnfToGrammar` writes it:
 * `E → T [ + E ]` becomes `E → T E’` and `E’ → + E | ε`.
 */
import { ebnfToGrammar, parseEbnf, printGrammar } from '$lib/theory/grammar';
import type { Rewrite } from './transform';

/** The rewrite in BNF; null when its text does not read back (it always should). */
export function rewriteBnf(rewrite: Pick<Rewrite, 'text' | 'brackets'>): string | null {
	if (!rewrite.brackets) return rewrite.text;
	const { grammar } = parseEbnf(rewrite.text);
	return grammar ? printGrammar(ebnfToGrammar(grammar)) : null;
}

/** A tool the Rewrite panel opens on the result. */
export interface RewriteTarget {
	slug: 'rd-backtracking' | 'll1';
	/** The grammar the tool opens on. */
	grammar: string;
	/** The grammar is the result written in BNF, not the result as shown. */
	converted: boolean;
}

/**
 * The tools that take the result: the backtracking parser a result without
 * brackets (a plain grammar), the LL(1) table the result in BNF. A rewrite
 * that changes nothing has none: the grammar as written is linked already.
 */
export function rewriteTargets(
	rewrite: Pick<Rewrite, 'text' | 'brackets' | 'changes'>
): RewriteTarget[] {
	if (rewrite.changes.length === 0) return [];
	const targets: RewriteTarget[] = [];
	if (!rewrite.brackets)
		targets.push({ slug: 'rd-backtracking', grammar: rewrite.text, converted: false });
	const bnf = rewriteBnf(rewrite);
	if (bnf !== null) targets.push({ slug: 'll1', grammar: bnf, converted: rewrite.brackets });
	return targets;
}
