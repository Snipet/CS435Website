/**
 * "Is the grammar suitable for prediction?" (Top-Down Parsing, slide 36): for
 * every place where the parser of an EBNF grammar has to choose, the tokens
 * that select each way, and the places where one token of lookahead cannot
 * choose.
 *
 * The parser chooses in three kinds of places:
 *
 * - between the alternatives of a rule (or of a bracket): an alternative is
 *   selected by the tokens it can start with, and by the tokens that may
 *   follow it when it can derive ε;
 * - at an option `[ α ]`: α is parsed when the token can start α, and skipped
 *   otherwise;
 * - at a repetition `{ α }`: α is parsed again while the token can start α.
 *
 * One token is not enough when two alternatives can be selected by the same
 * token, or when a token that can start the part in brackets may also come
 * right after it.
 *
 * The sets of the non-terminals come from firstSets and followSets on
 * ebnfToGrammar(e); the sets of the parts of a rule are computed from them.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { firstSets, followSets, leftRecursion, reservedSymbols } from '$lib/theory/grammar/analyze';
import { ebnfToGrammar, printSet } from '$lib/theory/grammar/parse';
import { END_MARKER, EPSILON, type EbnfGrammar, type Grammar } from '$lib/theory/grammar/types';
import {
	printAlt,
	printRule,
	printSymbol,
	rulesOfEbnf,
	type Alt,
	type Item,
	type Rule
} from './ebnf';

/** What a string of items can start with, and whether it can derive ε. */
export interface First {
	/** Terminals, in the order of T. */
	tokens: string[];
	nullable: boolean;
}

/** FIRST and FOLLOW for the rules of an EBNF grammar. */
export interface Lookahead {
	ebnf: EbnfGrammar;
	rules: Rule[];
	/** The plain grammar the sets are computed on. */
	grammar: Grammar;
	first: Map<string, Set<string>>;
	follow: Map<string, Set<string>>;
	isNonterminal(name: string): boolean;
	/** FIRST of a string of items. */
	firstOf(items: readonly Item[]): First;
	/** FIRST of a list of alternatives. */
	firstOfAlts(alts: readonly Alt[]): First;
	/** `tokens` in the order of T, then `$`. */
	sorted(tokens: Iterable<string>): string[];
}

export function lookaheadOf(e: EbnfGrammar): Lookahead {
	const grammar = ebnfToGrammar(e);
	const first = firstSets(grammar);
	const follow = followSets(grammar);
	const nonterminals = new Set(e.nonterminals);
	const order = [...grammar.terminals, END_MARKER];
	const sorted = (tokens: Iterable<string>): string[] => {
		const set = new Set(tokens);
		const out = order.filter((t) => set.has(t));
		for (const t of set) if (!out.includes(t)) out.push(t);
		return out;
	};
	const add = (items: readonly Item[], into: Set<string>): boolean => {
		for (const item of items) {
			if (item.kind !== 'sym') {
				for (const alt of item.alts) add(alt, into);
				continue;
			}
			const set = nonterminals.has(item.name) ? first.get(item.name) : undefined;
			if (!set) {
				into.add(item.name);
				return false;
			}
			for (const t of set) if (t !== EPSILON) into.add(t);
			if (!set.has(EPSILON)) return false;
		}
		return true;
	};
	const firstOf = (items: readonly Item[]): First => {
		const into = new Set<string>();
		const nullable = add(items, into);
		return { tokens: sorted(into), nullable };
	};
	const firstOfAlts = (alts: readonly Alt[]): First => {
		const into = new Set<string>();
		let nullable = false;
		for (const alt of alts) nullable = add(alt, into) || nullable;
		return { tokens: sorted(into), nullable };
	};
	return {
		ebnf: e,
		rules: rulesOfEbnf(e),
		grammar,
		first,
		follow,
		isNonterminal: (name) => nonterminals.has(name),
		firstOf,
		firstOfAlts,
		sorted
	};
}

export type ChoiceKind = 'alternative' | 'option' | 'repetition';

/** One way to go at a place where the parser chooses. */
export interface Choice {
	kind: ChoiceKind;
	/** The non-terminal whose rule the choice is in. */
	rule: string;
	/** The alternative, or the bracket with its brackets: `int [ * T ]`, `[ * T ]`, `{ + T }`. */
	text: string;
	/** The tokens that select it. */
	lookahead: string[];
	/**
	 * An alternative that can derive ε: the tokens of `lookahead` that select
	 * it because they may follow. An option or a repetition: the tokens on
	 * which it is skipped or left.
	 */
	after: string[];
	/** An alternative that can derive ε. */
	nullable: boolean;
	/** 0 for the alternatives of the rule; one more for each bracket around the choice. */
	depth: number;
}

export type ConflictKind =
	'alternatives' | 'option' | 'repetition' | 'left-recursion' | 'empty-repetition';

/** A place where one token of lookahead cannot choose. */
export interface Conflict {
	kind: ConflictKind;
	rule: string;
	/** The tokens that do not decide. */
	tokens: string[];
	/** The alternatives or the bracket concerned, as text. */
	parts: string[];
	message: string;
}

export interface Prediction {
	lookahead: Lookahead;
	/** In rule order; within a rule, a choice comes before the choices inside it. */
	choices: Choice[];
	conflicts: Conflict[];
	/** The conflicts as warnings, and an error when `$` or `ε` is a symbol of the grammar. */
	diagnostics: Diagnostic[];
	/** Symbols of the grammar spelled like `$` or `ε`: the sets cannot be trusted. */
	reserved: string[];
	/** No conflicts: one token of lookahead picks every rule. */
	suitable: boolean;
}

const tokenList = (tokens: readonly string[]): string => {
	const names = tokens.map(printSymbol);
	return new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
};

const plural = (tokens: readonly string[], one: string, many: string): string =>
	tokens.length === 1 ? one : many;

/**
 * The prediction analysis of an EBNF grammar: every choice with its lookahead
 * tokens, and every conflict.
 */
export function predict(e: EbnfGrammar, lookahead: Lookahead = lookaheadOf(e)): Prediction {
	const choices: Choice[] = [];
	const conflicts: Conflict[] = [];
	const { firstOf, firstOfAlts, sorted } = lookahead;

	/** The choices of a list of alternatives that may be followed by `after`. */
	const visit = (rule: string, alts: readonly Alt[], after: readonly string[], depth: number) => {
		const firsts = alts.map(firstOf);
		const selected = firsts.map((f) => (f.nullable ? sorted([...f.tokens, ...after]) : f.tokens));
		if (alts.length > 1) {
			alts.forEach((alt, i) => {
				choices.push({
					kind: 'alternative',
					rule,
					text: printAlt(alt),
					lookahead: selected[i],
					after: firsts[i].nullable ? after.filter((t) => !firsts[i].tokens.includes(t)) : [],
					nullable: firsts[i].nullable,
					depth
				});
			});
			for (let i = 0; i < alts.length; i++) {
				for (let k = i + 1; k < alts.length; k++) {
					const both = selected[i].filter((t) => selected[k].includes(t));
					if (both.length === 0) continue;
					const parts = [printAlt(alts[i]), printAlt(alts[k])];
					conflicts.push({
						kind: 'alternatives',
						rule,
						tokens: both,
						parts,
						message: `${printSymbol(rule)}: the ${plural(both, 'token', 'tokens')} ${tokenList(both)} ${plural(both, 'selects', 'select')} both ${parts[0]} and ${parts[1]}.`
					});
				}
			}
		}
		alts.forEach((alt) => {
			alt.forEach((item, at) => {
				if (item.kind === 'sym') return;
				const rest = firstOf(alt.slice(at + 1));
				const follows = rest.nullable ? sorted([...rest.tokens, ...after]) : rest.tokens;
				const starts = firstOfAlts(item.alts);
				const text = printAlt([item]);
				const repetition = item.kind === 'rep';
				choices.push({
					kind: repetition ? 'repetition' : 'option',
					rule,
					text,
					lookahead: starts.tokens,
					after: follows,
					nullable: false,
					depth: depth + 1
				});
				if (starts.nullable && repetition) {
					conflicts.push({
						kind: 'empty-repetition',
						rule,
						tokens: [],
						parts: [text],
						message: `${printSymbol(rule)}: the part inside ${text} can derive ε, so the repetition can go on without a token being matched.`
					});
				}
				const both = starts.tokens.filter((t) => follows.includes(t));
				if (both.length > 0) {
					conflicts.push({
						kind: repetition ? 'repetition' : 'option',
						rule,
						tokens: both,
						parts: [text],
						message: `${printSymbol(rule)}: the ${plural(both, 'token', 'tokens')} ${tokenList(both)} can start ${text} and can also come right after it.`
					});
				}
				// Inside a repetition, the next round may follow as well.
				visit(
					rule,
					item.alts,
					repetition ? sorted([...starts.tokens, ...follows]) : follows,
					depth + 1
				);
			});
		});
	};

	for (const rule of lookahead.rules) {
		visit(rule.lhs, rule.alts, [...(lookahead.follow.get(rule.lhs) ?? [])], 0);
	}

	const own = new Set(e.nonterminals);
	const rules = new Map(lookahead.rules.map((rule) => [rule.lhs, rule]));
	for (const found of leftRecursion(lookahead.grammar)) {
		if (!own.has(found.nonterminal)) continue;
		const name = printSymbol(found.nonterminal);
		conflicts.push({
			kind: 'left-recursion',
			rule: found.nonterminal,
			tokens: [],
			parts: [printRule(rules.get(found.nonterminal)!)],
			message: `${name} is left-recursive: ${name} () is called again before a token is matched, so the calls never end.`
		});
	}

	const reserved = reservedSymbols(lookahead.grammar);
	const diagnostics: Diagnostic[] = conflicts.map((c) => ({
		severity: 'warning',
		message: c.message
	}));
	if (reserved.length > 0) {
		diagnostics.unshift({
			severity: 'error',
			message: `${tokenList(reserved)} ${plural(reserved, 'is a symbol', 'are symbols')} of the grammar and also ${plural(reserved, 'marks', 'mark')} the end of the input or the empty string, so the lookahead sets cannot tell them apart.`
		});
	}
	return {
		lookahead,
		choices,
		conflicts,
		diagnostics,
		reserved,
		suitable: conflicts.length === 0 && reserved.length === 0
	};
}

/** One row of the prediction table: a choice with its sets as text. */
export interface PredictionRow {
	rule: string;
	/** The rule as text, on the first row of each rule. */
	ruleText: string | null;
	kind: ChoiceKind;
	choice: string;
	depth: number;
	/** `{ (, int }` */
	lookahead: string;
	/** What happens on other tokens: `skipped on { ), $ }`, or '' for an alternative. */
	otherwise: string;
	/** Some conflict names this choice. */
	conflict: boolean;
	tokens: string[];
	/** Tokens of the lookahead that take part in a conflict. */
	clashing: string[];
}

/** The table "rule, choice, lookahead tokens" of a prediction. */
export function predictionRows(p: Prediction): PredictionRow[] {
	const printed = new Map(p.lookahead.rules.map((rule) => [rule.lhs, printRule(rule)]));
	const seen = new Set<string>();
	return p.choices.map((c) => {
		const first = !seen.has(c.rule);
		seen.add(c.rule);
		const clashing = new Set<string>();
		for (const conflict of p.conflicts) {
			if (conflict.rule !== c.rule || !conflict.parts.includes(c.text)) continue;
			if (c.kind === 'alternative' && conflict.kind !== 'alternatives') continue;
			if (c.kind !== 'alternative' && conflict.kind === 'alternatives') continue;
			for (const t of conflict.tokens) clashing.add(t);
		}
		const otherwise =
			c.kind === 'option'
				? `skipped on ${printSet(c.after)}`
				: c.kind === 'repetition'
					? `left on ${printSet(c.after)}`
					: c.nullable
						? c.after.length > 0
							? `can derive ε: ${printSet(c.after)} may follow`
							: 'can derive ε'
						: '';
		return {
			rule: c.rule,
			ruleText: first ? (printed.get(c.rule) ?? null) : null,
			kind: c.kind,
			choice: c.text,
			depth: c.depth,
			lookahead: printSet(c.lookahead),
			otherwise,
			conflict: clashing.size > 0,
			tokens: c.lookahead,
			clashing: c.lookahead.filter((t) => clashing.has(t))
		};
	});
}
