/**
 * How a conflict is settled, in the words of Bottom-up Parsing III,
 * slides 19–20. The precedence of a rule is that of its last terminal, and
 * a shift/reduce conflict is resolved with a shift if
 *
 *   • no precedence declared for either rule or terminal
 *   • input terminal has higher precedence than the rule
 *   • the precedences are the same and right associative
 *
 * and with a reduce otherwise ("reduce because precedence of rule E → E * E
 * is higher than that of terminal +"). Equal precedences declared %nonassoc
 * make the entry an error (beyond the decks). A reduce/reduce conflict goes
 * to the earlier rule. The decision itself is the engine's (lrTable); this
 * module says why.
 */
import type { Grammar } from '$lib/theory/grammar/types';
import { printProduction, type Augmented } from '$lib/theory/grammar/lr';
import {
	rulePrecedence,
	type LrAction,
	type LrConflict,
	type Precedence
} from '$lib/theory/grammar/lr-table';
import { printSymbols } from '$lib/theory/grammar/parse';

/** Slide 19's three conditions for a shift, in its words. */
export const SHIFT_IF = [
	'no precedence declared for either rule or terminal',
	'input terminal has higher precedence than the rule',
	'the precedences are the same and right associative'
] as const;

export interface Explanation {
	by: 'precedence' | 'default';
	/** The action that wins: its index in the conflict's pair, or 'error' (%nonassoc). */
	winner: 0 | 1 | 'error';
	/** Shift/reduce: the rule, its last terminal and that terminal's precedence. */
	rule: {
		production: number;
		text: string;
		last: string | null;
		precedence: Precedence | null;
	} | null;
	/** Shift/reduce: the input terminal and its precedence. */
	token: { terminal: string; precedence: Precedence | null } | null;
	/** Which of the three conditions of SHIFT_IF hold; null for reduce/reduce. */
	shiftIf: [boolean, boolean, boolean] | null;
	/** "reduce because precedence of rule E → E * E is higher than that of terminal +". */
	text: string;
}

const sameAction = (x: LrAction, y: LrAction): boolean =>
	x.kind === y.kind &&
	(x.kind !== 'shift' || x.state === (y as typeof x).state) &&
	(x.kind !== 'reduce' || x.production === (y as typeof x).production);

/** The index of the action that wins, or 'error' when %nonassoc made the entry an error. */
export function winnerOf(c: LrConflict): 0 | 1 | 'error' {
	if (c.resolution.action.kind === 'error') return 'error';
	return sameAction(c.resolution.action, c.actions[0]) ? 0 : 1;
}

/** Why the conflict is settled the way it is. `terminals`: readPrecedence(…).terminals. */
export function explain(
	aug: Augmented,
	conflict: LrConflict,
	terminals: ReadonlyMap<string, Precedence>
): Explanation {
	const g: Grammar = aug.grammar;
	const term = printSymbols([conflict.terminal]);
	const winner = winnerOf(conflict);
	const ruleText = (p: number) => printProduction(aug.productions[p]);
	if (conflict.kind === 'reduce/reduce') {
		const won = conflict.actions[winner === 1 ? 1 : 0];
		return {
			by: conflict.resolution.by,
			winner,
			rule: null,
			token: null,
			shiftIf: null,
			text:
				won.kind === 'accept'
					? 'accept because the start rule comes before every other rule'
					: won.kind === 'reduce'
						? `reduce by ${ruleText(won.production)} because it is the earlier rule`
						: conflict.resolution.reason
		};
	}
	const reduce = conflict.actions.find((a) => a.kind === 'reduce');
	const production = reduce?.kind === 'reduce' ? reduce.production : -1;
	const { terminal: last, precedence: rp } = rulePrecedence(g, terminals, production);
	const tp = terminals.get(conflict.terminal) ?? null;
	const rule = ruleText(production);
	const shiftIf: [boolean, boolean, boolean] = [
		!rp || !tp,
		!!rp && !!tp && tp.level > rp.level,
		!!rp && !!tp && tp.level === rp.level && tp.assoc === 'right'
	];
	let text: string;
	if (!rp && !tp)
		text = `shift because no precedence is declared for rule ${rule} or for terminal ${term}`;
	else if (!rp)
		text = `shift because no precedence is declared for rule ${rule} (${
			last === null ? 'it has no terminal' : `its last terminal ${printSymbols([last])} has none`
		})`;
	else if (!tp) text = `shift because no precedence is declared for terminal ${term}`;
	else if (tp.level > rp.level)
		text = `shift because terminal ${term} has higher precedence than rule ${rule}`;
	else if (rp.level > tp.level)
		text = `reduce because precedence of rule ${rule} is higher than that of terminal ${term}`;
	else {
		const assoc =
			tp.assoc === 'left'
				? 'left associative'
				: tp.assoc === 'right'
					? 'right associative'
					: 'non-associative';
		const action = tp.assoc === 'left' ? 'reduce' : tp.assoc === 'right' ? 'shift' : 'error';
		text = `${action} because the precedences of rule ${rule} and terminal ${term} are the same and ${assoc}`;
	}
	return {
		by: conflict.resolution.by,
		winner,
		rule: { production, text: rule, last, precedence: rp },
		token: { terminal: conflict.terminal, precedence: tp },
		shiftIf,
		text
	};
}
