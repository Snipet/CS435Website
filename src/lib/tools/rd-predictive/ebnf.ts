/**
 * EBNF rules as lists of alternatives, the form the rewrites and the code
 * generators work on. An alternative is a list of items: a symbol, an option
 * `[ … ]` or a repetition `{ … }`, where a bracket holds alternatives of its
 * own. The empty list is the alternative ε.
 *
 * A grammar without brackets is plain BNF in the same form, so one set of
 * functions serves both `S → 1 S’ ; S’ → 0 S’ | ε` and `S → 1 { 0 }`.
 */
import { printSymbols } from '$lib/theory/grammar/parse';
import { EPSILON, type Ebnf, type EbnfGrammar, type Grammar } from '$lib/theory/grammar/types';

export type Item = { kind: 'sym'; name: string } | { kind: 'opt' | 'rep'; alts: Alt[] };
export type Alt = Item[];

export interface Rule {
	lhs: string;
	/** At least one alternative; `[]` is ε. */
	alts: Alt[];
}

export const sym = (name: string): Item => ({ kind: 'sym', name });
/** `[ … ]`: zero or one. */
export const opt = (alts: Alt[]): Item => ({ kind: 'opt', alts });
/** `{ … }`: zero or more. */
export const rep = (alts: Alt[]): Item => ({ kind: 'rep', alts });

/** The prime of new non-terminals: S’ (docs/ARCHITECTURE.md §3.10). */
export const PRIME = '’';
const ARROW = '→';

/** Structural identity of an item or an alternative. */
export const itemKey = (item: Item): string => JSON.stringify(item);
export const altKey = (alt: Alt): string => JSON.stringify(alt);

export const isSymbol = (item: Item | undefined, name: string): boolean =>
	item !== undefined && item.kind === 'sym' && item.name === name;

/** `alts` with repeated alternatives listed once. */
export function distinct(alts: readonly Alt[]): Alt[] {
	const seen = new Set<string>();
	return alts.filter((alt) => {
		const key = altKey(alt);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The alternatives of an EBNF tree. A choice inside a sequence, which the
 * notation cannot write without grouping, is multiplied out. Inside brackets
 * the alternative ε adds nothing and is dropped.
 */
export function alternativesOf(e: Ebnf): Alt[] {
	switch (e.kind) {
		case 'sym':
			return [[sym(e.name)]];
		case 'eps':
			return [[]];
		case 'opt':
		case 'rep': {
			const inner = alternativesOf(e.body).filter((alt) => alt.length > 0);
			// `[ ε ]` and `{ ε }` are the empty string.
			return inner.length === 0 ? [[]] : [[{ kind: e.kind, alts: inner }]];
		}
		case 'alt':
			return e.options.flatMap(alternativesOf);
		case 'seq':
			return e.items.reduce<Alt[]>(
				(heads, item) => {
					const tails = alternativesOf(item);
					return heads.flatMap((head) => tails.map((tail) => [...head, ...tail]));
				},
				[[]]
			);
	}
}

const itemTree = (item: Item): Ebnf =>
	item.kind === 'sym'
		? { kind: 'sym', name: item.name }
		: { kind: item.kind, body: bodyOf(item.alts) };

const sequenceTree = (items: Alt): Ebnf =>
	items.length === 0
		? { kind: 'eps' }
		: items.length === 1
			? itemTree(items[0])
			: { kind: 'seq', items: items.map(itemTree) };

/** The EBNF tree of a list of alternatives, in the shape parseEbnf builds. */
export function bodyOf(alts: readonly Alt[]): Ebnf {
	const options = alts.map(sequenceTree);
	return options.length === 1 ? options[0] : { kind: 'alt', options };
}

export function rulesOfEbnf(e: EbnfGrammar): Rule[] {
	return e.rules.map((rule) => ({ lhs: rule.lhs, alts: alternativesOf(rule.body) }));
}

/** One rule per non-terminal, in the order of N, each with its productions in grammar order. */
export function rulesOfGrammar(g: Grammar): Rule[] {
	const rules = new Map<string, Rule>(g.nonterminals.map((n) => [n, { lhs: n, alts: [] }]));
	for (const p of g.productions) rules.get(p.lhs)?.alts.push(p.rhs.map(sym));
	return [...rules.values()].filter((rule) => rule.alts.length > 0);
}

/** The rules of a grammar in either notation. */
export function rulesOf(g: Grammar | EbnfGrammar): Rule[] {
	return 'rules' in g ? rulesOfEbnf(g) : rulesOfGrammar(g);
}

function collect(alts: readonly Alt[], out: string[]): string[] {
	for (const alt of alts)
		for (const item of alt) {
			if (item.kind === 'sym') out.push(item.name);
			else collect(item.alts, out);
		}
	return out;
}

/** Every symbol on a right-hand side, in the order written (repeats included). */
export function symbolsOf(alts: readonly Alt[]): string[] {
	return collect(alts, []);
}

/**
 * The EBNF grammar of a list of rules: the start symbol is the first
 * left-hand side, and a symbol is a terminal when it is no left-hand side.
 * Rules of one non-terminal are joined.
 */
export function ebnfOf(rules: readonly Rule[]): EbnfGrammar {
	if (rules.length === 0) throw new Error('ebnfOf: a grammar needs a rule');
	const joined = new Map<string, Alt[]>();
	for (const rule of rules) {
		const alts = joined.get(rule.lhs);
		if (alts) alts.push(...rule.alts);
		else joined.set(rule.lhs, [...rule.alts]);
	}
	const nonterminals = [...joined.keys()];
	const symbols = [...joined.values()].flatMap((alts) => symbolsOf(alts));
	return {
		start: nonterminals[0],
		nonterminals,
		terminals: [...new Set(symbols.filter((s) => !joined.has(s)))],
		rules: [...joined].map(([lhs, alts]) => ({ lhs, body: bodyOf(distinct(alts)) }))
	};
}

/** A symbol as EBNF text: braces and brackets used as terminals are quoted. */
export const printSymbol = (name: string): string => printSymbols([name], { ebnf: true });

/** An alternative as text: `T { + T }`, and `ε` for the empty one. */
export function printAlt(items: Alt): string {
	if (items.length === 0) return EPSILON;
	return items
		.map((item) => {
			if (item.kind === 'sym') return printSymbol(item.name);
			const inner = printAlts(item.alts);
			return item.kind === 'rep' ? `{ ${inner} }` : `[ ${inner} ]`;
		})
		.join(' ');
}

export function printAlts(alts: readonly Alt[]): string {
	return alts.map(printAlt).join(' | ');
}

/** `E → T { + T }`: text that parseEbnf reads back as the rule. */
export function printRule(rule: Rule): string {
	return `${printSymbol(rule.lhs)} ${ARROW} ${printAlts(rule.alts)}`;
}

/** One line per rule, as printEbnf writes an EBNF grammar. */
export function printRules(rules: readonly Rule[]): string {
	return rules.map(printRule).join('\n');
}

/** A production `A → α` of one alternative. */
export function printProduction(lhs: string, alt: Alt): string {
	return `${printSymbol(lhs)} ${ARROW} ${printAlt(alt)}`;
}

/** True when the rules use `{ }` or `[ ]`. */
export function hasBrackets(rules: readonly Rule[]): boolean {
	return rules.some((rule) => rule.alts.some((alt) => alt.some((item) => item.kind !== 'sym')));
}

/**
 * A new non-terminal for `base`: primed, with primes added until the name is
 * unused. The name is added to `used`.
 */
export function freshName(base: string, used: Set<string>): string {
	let name = base + PRIME;
	while (used.has(name)) name += PRIME;
	used.add(name);
	return name;
}

/** Every name the rules use: left-hand sides and symbols. */
export function namesOf(rules: readonly Rule[]): Set<string> {
	const used = new Set<string>();
	for (const rule of rules) {
		used.add(rule.lhs);
		for (const s of symbolsOf(rule.alts)) used.add(s);
	}
	return used;
}
