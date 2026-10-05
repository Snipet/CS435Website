import { describe, expect, it } from 'vitest';
import { nodeAtPath } from '$lib/components/grammar';
import {
	bracketForm,
	parseGrammar,
	treeEquals,
	treeFromDerivation,
	yieldOf,
	type Grammar
} from '$lib/theory/grammar';
import {
	allowedPositions,
	bothDerivations,
	chainOf,
	chainSteps,
	currentForm,
	derivationKind,
	describeLastStep,
	formsOf,
	freshPaths,
	frontier,
	isSentence,
	kindLabel,
	lastStepText,
	pairsOf,
	productionText,
	productionsOf,
	replay,
	stepCount,
	symbolText
} from './builder';
import { ARITHMETIC, CASCADE, ENGLISH } from './presets';
import type { StepPair } from './state';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

const arithmetic = grammar(ARITHMETIC);
/** Slide 12: E → E * E → ( E ) * E → ( E + E ) * E, then the three E → int. */
const CHAIN: StepPair[] = [
	[0, 2],
	[0, 3],
	[1, 1],
	[1, 0],
	[3, 0],
	[6, 0]
];

describe('replay', () => {
	it('rebuilds the rewrite chain of slide 12', () => {
		const { derivation, pairs, dropped } = replay(arithmetic, CHAIN);
		expect(dropped).toBe(0);
		expect(pairs).toEqual(CHAIN);
		expect(formsOf(derivation).map((f) => f.join(' '))).toEqual([
			'E',
			'E * E',
			'( E ) * E',
			'( E + E ) * E',
			'( int + E ) * E',
			'( int + int ) * E',
			'( int + int ) * int'
		]);
		expect(currentForm(derivation).join(' ')).toBe('( int + int ) * int');
		expect(pairsOf(derivation)).toEqual(CHAIN);
		expect(stepCount(derivation)).toBe('6 steps');
	});

	it('starts from the start symbol', () => {
		const { derivation } = replay(arithmetic, []);
		expect(derivation.start).toEqual(['E']);
		expect(currentForm(derivation)).toEqual(['E']);
		expect(stepCount(derivation)).toBe('0 steps');
		expect(stepCount(replay(arithmetic, [[0, 0]]).derivation)).toBe('1 step');
	});

	it('stops before the first step that does not apply', () => {
		// Position 1 of "E * E" is the terminal *.
		const wrongPlace = replay(arithmetic, [
			[0, 2],
			[1, 0],
			[0, 0]
		]);
		expect(wrongPlace.pairs).toEqual([[0, 2]]);
		expect(wrongPlace.dropped).toBe(2);
		// No production 9, and no symbol at position 5.
		expect(replay(arithmetic, [[0, 9]])).toMatchObject({ pairs: [], dropped: 1 });
		expect(replay(arithmetic, [[5, 0]])).toMatchObject({ pairs: [], dropped: 1 });
	});

	it('keeps the steps that still apply after the grammar changes', () => {
		// Without E → E * E the ids shift: production 2 is now E → ( E ).
		const smaller = grammar('E → int\nE → E + E\nE → ( E )');
		const { derivation, dropped } = replay(smaller, CHAIN);
		expect(formsOf(derivation).map((f) => f.join(' '))).toEqual(['E', '( E )']);
		expect(dropped).toBe(5);
	});

	it('stops at the step limit', () => {
		const loop = grammar('S → S | a');
		const many = Array.from({ length: 30 }, (): StepPair => [0, 0]);
		expect(replay(loop, many, 10)).toMatchObject({ dropped: 20 });
		expect(replay(loop, many, 10).pairs).toHaveLength(10);
	});
});

describe('positions a step may replace', () => {
	const form = ['(', 'E', '+', 'E', ')', '*', 'E'];

	it('lists every non-terminal, or only the leftmost or the rightmost one', () => {
		expect(allowedPositions(arithmetic, form, 'any')).toEqual([1, 3, 6]);
		expect(allowedPositions(arithmetic, form, 'leftmost')).toEqual([1]);
		expect(allowedPositions(arithmetic, form, 'rightmost')).toEqual([6]);
	});

	it('is empty for a sentence', () => {
		const sentence = ['int', '+', 'int'];
		for (const order of ['any', 'leftmost', 'rightmost'] as const)
			expect(allowedPositions(arithmetic, sentence, order)).toEqual([]);
		expect(isSentence(arithmetic, sentence)).toBe(true);
		expect(isSentence(arithmetic, form)).toBe(false);
		expect(isSentence(arithmetic, [])).toBe(true);
	});

	it('lists the productions of a non-terminal in grammar order', () => {
		expect(productionsOf(arithmetic, 'E').map(productionText)).toEqual([
			'E → int',
			'E → E + E',
			'E → E * E',
			'E → ( E )'
		]);
		const cascade = grammar(CASCADE);
		expect(productionsOf(cascade, 'F').map((p) => p.id)).toEqual([4, 5]);
		expect(productionsOf(cascade, 'int')).toEqual([]);
		expect(productionText(grammar('S → ε | ( S )').productions[0])).toBe('S → ε');
	});

	it('quotes a symbol only when a grammar would', () => {
		expect(symbolText('E')).toBe('E');
		expect(symbolText('the cat')).toBe('"the cat"');
	});
});

describe('the tree of a derivation', () => {
	it('gives the tree node of each symbol of the form', () => {
		const { derivation } = replay(arithmetic, CHAIN.slice(0, 3));
		const tree = treeFromDerivation(arithmetic, derivation);
		const paths = frontier(tree);
		expect(paths).toEqual([[0, 0], [0, 1, 0], [0, 1, 1], [0, 1, 2], [0, 2], [1], [2]]);
		expect(paths.map((p) => nodeAtPath(tree, p)?.symbol)).toEqual(yieldOf(tree));
		expect(yieldOf(tree)).toEqual(currentForm(derivation));
		expect(frontier(treeFromDerivation(arithmetic, replay(arithmetic, []).derivation))).toEqual([
			[]
		]);
	});

	it('skips the node of an ε-production, which has no symbol in the form', () => {
		const balanced = grammar('S → ε | ( S )');
		const { derivation } = replay(balanced, [
			[0, 1],
			[1, 0]
		]);
		expect(currentForm(derivation)).toEqual(['(', ')']);
		expect(frontier(treeFromDerivation(balanced, derivation))).toEqual([[0], [2]]);
	});

	it('marks the nodes the last step added', () => {
		expect(freshPaths(arithmetic, replay(arithmetic, []).derivation)).toEqual([]);
		expect(freshPaths(arithmetic, replay(arithmetic, CHAIN.slice(0, 1)).derivation)).toEqual([
			[0],
			[1],
			[2]
		]);
		// ( E ) * E → ( E + E ) * E expands the E inside the parentheses.
		expect(freshPaths(arithmetic, replay(arithmetic, CHAIN.slice(0, 3)).derivation)).toEqual([
			[0, 1, 0],
			[0, 1, 1],
			[0, 1, 2]
		]);
		// The last step is E → int on the right operand.
		expect(freshPaths(arithmetic, replay(arithmetic, CHAIN).derivation)).toEqual([[2, 0]]);
	});

	it('marks the ε leaf drawn under an ε-production', () => {
		const balanced = grammar('S → ε | ( S )');
		const { derivation } = replay(balanced, [
			[0, 1],
			[1, 0]
		]);
		expect(freshPaths(balanced, derivation)).toEqual([[1, 0]]);
	});
});

describe('chains', () => {
	it('marks each step for DerivationChain', () => {
		const { derivation } = replay(arithmetic, CHAIN);
		expect(chainSteps(arithmetic, derivation)).toEqual([
			{ index: 0, length: 3 },
			{ index: 0, length: 3 },
			{ index: 1, length: 3 },
			{ index: 1, length: 1 },
			{ index: 3, length: 1 },
			{ index: 6, length: 1 }
		]);
		const chain = chainOf(arithmetic, derivation);
		expect(chain.forms).toHaveLength(7);
		expect(chain.steps).toHaveLength(6);
		expect(chain.nonterminals).toEqual(['E']);
	});

	it('writes symbols as a grammar does, and an ε step with length 0', () => {
		const english = grammar(ENGLISH);
		const { derivation } = replay(english, [
			[0, 0],
			[0, 1],
			[0, 6]
		]);
		expect(chainOf(english, derivation).forms[3]).toEqual(['"the cat"', 'VerbPhrase']);

		const balanced = grammar('S → ε | ( S )');
		const empty = replay(balanced, [[0, 0]]).derivation;
		expect(chainOf(balanced, empty)).toMatchObject({
			forms: [['S'], []],
			steps: [{ index: 0, length: 0 }]
		});
	});
});

describe('leftmost and rightmost derivations', () => {
	it('names the kind of a derivation', () => {
		const leftmost = replay(arithmetic, CHAIN).derivation;
		expect(derivationKind(arithmetic, leftmost)).toEqual({ leftmost: true, rightmost: false });
		expect(kindLabel(arithmetic, leftmost)).toBe('leftmost derivation');

		// E → E + E → E + int → int + int
		const rightmost = replay(arithmetic, [
			[0, 1],
			[2, 0],
			[0, 0]
		]).derivation;
		expect(kindLabel(arithmetic, rightmost)).toBe('rightmost derivation');

		// E → E + E → E + E + E → E + int + E: the middle E is neither.
		const neither = replay(arithmetic, [
			[0, 1],
			[2, 1],
			[2, 0]
		]).derivation;
		expect(derivationKind(arithmetic, neither)).toEqual({ leftmost: false, rightmost: false });
		expect(kindLabel(arithmetic, neither)).toBeNull();

		expect(kindLabel(arithmetic, replay(arithmetic, [[0, 0]]).derivation)).toBe(
			'leftmost and rightmost derivation'
		);
		expect(kindLabel(arithmetic, replay(arithmetic, []).derivation)).toBeNull();
	});

	it('gives both derivations of the tree a finished derivation builds', () => {
		const { derivation } = replay(arithmetic, CHAIN);
		const { tree, leftmost, rightmost } = bothDerivations(arithmetic, derivation);
		expect(bracketForm(tree)).toBe('E( E( ( E( E(int) + E(int) ) ) ) * E(int) )');
		expect(pairsOf(leftmost)).toEqual(CHAIN);
		expect(formsOf(rightmost).map((f) => f.join(' '))).toEqual([
			'E',
			'E * E',
			'E * int',
			'( E ) * int',
			'( E + E ) * int',
			'( E + int ) * int',
			'( int + int ) * int'
		]);
		expect(derivationKind(arithmetic, rightmost).rightmost).toBe(true);
		// Both derivations define the same parse tree.
		expect(treeEquals(treeFromDerivation(arithmetic, leftmost), tree)).toBe(true);
		expect(treeEquals(treeFromDerivation(arithmetic, rightmost), tree)).toBe(true);
	});
});

describe('the description of the last step', () => {
	it('names the start symbol before the first step', () => {
		const { derivation } = replay(arithmetic, []);
		expect(lastStepText(arithmetic, derivation)).toBe('Start: the start symbol E.');
		expect(describeLastStep(arithmetic, derivation)).toBe('Start: the start symbol E.');
	});

	it('names the production and the symbol it replaced', () => {
		const first = replay(arithmetic, CHAIN.slice(0, 1)).derivation;
		expect(lastStepText(arithmetic, first)).toBe('Step 1: production 3, E → E * E, replaces E.');
		const third = replay(arithmetic, CHAIN.slice(0, 3)).derivation;
		expect(lastStepText(arithmetic, third)).toBe(
			'Step 3: production 2, E → E + E, replaces symbol 2 of ( E ) * E.'
		);
		expect(describeLastStep(arithmetic, third)).toBe(
			'Step 3: production 2, E → E + E, replaces symbol 2 of ( E ) * E. Sentential form: ( E + E ) * E.'
		);
	});

	it('says when only terminals remain', () => {
		const done = replay(arithmetic, CHAIN).derivation;
		expect(describeLastStep(arithmetic, done)).toBe(
			'Step 6: production 1, E → int, replaces symbol 7 of ( int + int ) * E. Sentential form: ( int + int ) * int. Only terminals remain.'
		);
		const balanced = grammar('S → ε | ( S )');
		expect(describeLastStep(balanced, replay(balanced, [[0, 0]]).derivation)).toBe(
			'Step 1: production 1, S → ε, replaces S. Sentential form: ε. Only terminals remain.'
		);
	});
});
