/** Short notes shown in place of a view that cannot be computed. */
import type { ExpressionAnalysis } from './analysis';

/** Why an expression's language was not built. */
export function sizeMessage(
	b: { stage: 'nfa' | 'dfa'; limit: number },
	what: 'R' | 'R₂' = 'R'
): string {
	return b.stage === 'nfa'
		? `Thompson's construction for ${what} needs more than ${b.limit} states, so its language is not computed.`
		: `The DFA for ${what} has more than ${b.limit} states, so its language is not computed.`;
}

/** Why the syntax tree is not shown, or null. */
export function structureBlocked(re: string, a: ExpressionAnalysis): string | null {
	if (a.re.regex) return null;
	return re.trim() === ''
		? 'Enter an expression R above.'
		: 'Fix the problems in R to see its structure.';
}

/** Why the language views are not shown, or null. */
export function languageBlocked(re: string, a: ExpressionAnalysis): string | null {
	if (!a.re.regex)
		return re.trim() === '' ? 'Enter an expression R above.' : 'Fix the problems in R first.';
	if (!a.sigma) return 'Fix Σ first.';
	if (a.language && !a.language.ok) return sizeMessage(a.language);
	return null;
}
