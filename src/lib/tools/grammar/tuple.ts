/**
 * A grammar as the four-tuple (N, T, S, P) of Introduction to Parsing, slide
 * 14, and its place in the Chomsky hierarchy by the form of its productions
 * (slide 23).
 */
import { chomskyType, unproductive, unreachable, type Grammar } from '$lib/theory/grammar';
import { PLAIN, type Spelling } from './spelling';

export interface TupleProduction {
	/** Number in P, from 1. */
	number: number;
	lhs: string;
	rhs: string;
	/** The production has the type 3 form V → w | wU. */
	regular: boolean;
}

export interface TupleView {
	/** `{ E }` */
	nonterminals: string;
	/** `{ int, +, *, (, ) }` */
	terminals: string;
	start: string;
	productions: TupleProduction[];
	/** One sentence per problem: non-terminals that are never reached, or derive no terminal string. */
	warnings: string[];
}

/** `write`: how the symbols are written; by default quoted only where they have to be. */
export function tupleOf(g: Grammar, write: Spelling = PLAIN): TupleView {
	const { regular } = chomskyType(g);
	const list = (symbols: readonly string[]) => symbols.map(write.symbol).join(', ');
	const start = write.symbol(g.start);
	const warnings: string[] = [];
	const lost = unreachable(g);
	if (lost.length > 0)
		warnings.push(
			`${list(lost)} ${lost.length === 1 ? 'is' : 'are'} not reachable from the start symbol ${start}.`
		);
	const barren = unproductive(g);
	if (barren.length > 0)
		warnings.push(
			`${list(barren)} ${barren.length === 1 ? 'derives' : 'derive'} no string of terminals.`
		);
	return {
		nonterminals: write.set(g.nonterminals),
		terminals: write.set(g.terminals),
		start,
		productions: g.productions.map((p) => ({
			number: p.id + 1,
			lhs: write.symbol(p.lhs),
			rhs: write.symbols(p.rhs),
			regular: regular[p.id]
		})),
		warnings
	};
}

export interface ChomskyRow {
	type: 0 | 1 | 2 | 3;
	language: string;
	/** The lines of the Form cell. */
	form: string[];
	recognizer: string;
}

/** The table of Introduction to Parsing, slide 23, cell by cell. */
export const CHOMSKY_TABLE: readonly ChomskyRow[] = [
	{
		type: 0,
		language: 'Unrestricted or recursively enumerable',
		form: ['αXβ → αδβ', 'X ∈ N ∪ T', 'α, β, δ ∈ (N ∪ T)*'],
		recognizer: 'Turing machine'
	},
	{
		type: 1,
		language: 'Context Sensitive',
		form: ['αVβ → αδβ', 'V ∈ N', 'δ ≠ ε'],
		recognizer: 'Linear Bounded Automaton (ND)'
	},
	{
		type: 2,
		language: 'Context Free',
		form: ['V → α', 'V ∈ N', 'α ∈ (N ∪ T)*'],
		recognizer: 'Push-down Automaton (ND)'
	},
	{
		type: 3,
		language: 'Regular',
		form: ['V → w | wU', 'w ∈ T*; U, V ∈ N'],
		recognizer: 'NFA or DFA'
	}
];

export const REGULAR_FORM = 'V → w | wU';

export interface ChomskyView {
	type: 2 | 3;
	/** "Type 3 (regular)" */
	name: string;
	/** What the productions look like: "every production has the form V → w | wU". */
	form: string;
	recognizer: string;
	/** Numbers (from 1) of the productions that do not have the type 3 form. */
	breaking: number[];
	/** A sentence naming them; null when there are none. */
	breakingText: string | null;
}

/** Longest list of production numbers written out. */
const NUMBERS_SHOWN = 8;

/** "Production 2", "Productions 2 and 3", "Productions 2, 3 and 4"; a long list ends with "and n more". */
export function productionNumbers(numbers: readonly number[]): string {
	if (numbers.length === 1) return `Production ${numbers[0]}`;
	if (numbers.length > NUMBERS_SHOWN) {
		const shown = numbers.slice(0, NUMBERS_SHOWN - 1);
		return `Productions ${shown.join(', ')} and ${numbers.length - shown.length} more`;
	}
	return `Productions ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

export function chomskyOf(g: Grammar): ChomskyView {
	const report = chomskyType(g);
	const breaking = report.regular.flatMap((ok, id) => (ok ? [] : [id + 1]));
	if (report.type === 3)
		return {
			type: 3,
			name: 'Type 3 (regular)',
			form: `every production has the form ${REGULAR_FORM}`,
			recognizer: 'NFA or DFA',
			breaking,
			breakingText: null
		};
	const verb = breaking.length === 1 ? 'does' : 'do';
	return {
		type: 2,
		name: 'Type 2 (context free)',
		form: 'V → α',
		recognizer: 'push-down automaton (ND)',
		breaking,
		breakingText: `${productionNumbers(breaking)} ${verb} not have the type 3 form ${REGULAR_FORM}.`
	};
}
