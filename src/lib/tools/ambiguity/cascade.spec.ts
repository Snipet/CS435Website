import { describe, expect, it } from 'vitest';
import { compareGrammars, parseGrammar, parseTrees, printGrammar } from '$lib/theory/grammar';
import {
	DEFAULT_ATOMS,
	DEFAULT_LEVELS,
	buildCascade,
	cascadeNames,
	type CascadeLevel
} from './cascade';
import { CASCADE } from './presets';
import { shapeOf, shapeText } from './shape';

const left = (ops: string): CascadeLevel => ({ ops, assoc: 'left' });
const right = (ops: string): CascadeLevel => ({ ops, assoc: 'right' });

describe('cascadeNames', () => {
	it('names the levels E, T, F and then further letters', () => {
		expect(cascadeNames(3)).toEqual(['E', 'T', 'F']);
		expect(cascadeNames(6)).toEqual(['E', 'T', 'F', 'G', 'H', 'I']);
		expect(cascadeNames(1)).toEqual(['E']);
		expect(cascadeNames(0)).toEqual(['E']);
	});

	it('skips letters that are symbols already, and numbers the rest', () => {
		expect(cascadeNames(4, new Set(['T', 'G', 'E']))).toEqual(['E', 'F', 'H', 'I']);
		const many = cascadeNames(30);
		expect(new Set(many).size).toBe(30);
		expect(many.slice(0, 4)).toEqual(['E', 'T', 'F', 'G']);
		expect(many.slice(-4)).toEqual(['E1', 'E2', 'E3', 'E4']);
	});
});

describe('buildCascade', () => {
	it('builds the grammar of slide 8 from + then * and the atoms int | ( E )', () => {
		const c = buildCascade(DEFAULT_LEVELS, DEFAULT_ATOMS);
		expect(c.text).toBe('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		expect(c.text).toBe(CASCADE);
		expect(c.problems).toEqual([]);
		expect(c.names).toEqual(['E', 'T', 'F']);
		// The same grammar as the slide's text, production for production.
		expect(printGrammar(c.grammar!)).toBe(printGrammar(parseGrammar(CASCADE).grammar!));
		expect(c.grammar!.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ')}`)).toEqual([
			'E → E + T',
			'E → T',
			'T → T * F',
			'T → F',
			'F → int',
			'F → ( E )'
		]);
	});

	it('puts several operators on one level and uses right recursion for right-associative ones', () => {
		const c = buildCascade([left('+ -'), left('* /'), right('^')], 'int | id | ( E )');
		expect(c.text).toBe(
			[
				'E → E + T | E - T | T',
				'T → T * F | T / F | F',
				'F → G ^ F | G',
				'G → int | id | ( E )'
			].join('\n')
		);
		expect(c.problems).toEqual([]);
		expect(c.names).toEqual(['E', 'T', 'F', 'G']);
		const tree = (tokens: string[]) => {
			const { trees } = parseTrees(c.grammar!, tokens);
			expect(trees).toHaveLength(1);
			return shapeText(shapeOf(trees[0]));
		};
		expect(tree(['int', '-', 'int', '-', 'int'])).toBe('(int - int) - int');
		expect(tree(['int', '^', 'int', '^', 'int'])).toBe('int ^ (int ^ int)');
		expect(tree(['int', '+', 'int', '*', 'int', '^', 'int'])).toBe('int + (int * (int ^ int))');
	});

	it('generates the language of the ambiguous grammar it replaces', () => {
		const ambiguous = parseGrammar('E → E + E | E * E | ( E ) | int').grammar!;
		const c = buildCascade(DEFAULT_LEVELS, DEFAULT_ATOMS);
		expect(compareGrammars(ambiguous, c.grammar!, { maxLength: 7 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 7
		});
	});

	it('quotes operators of several characters', () => {
		const c = buildCascade([left('"==" "!="'), left('+')], 'id');
		expect(c.text).toBe('E → E "==" T | E "!=" T | T\nT → T + F | F\nF → id');
		expect(parseGrammar(c.text).grammar!.terminals).toEqual(['==', '!=', '+', 'id']);
	});

	it('leaves out a level without operators and reports repeats', () => {
		const c = buildCascade([left('+'), left(' '), left('* +')], DEFAULT_ATOMS);
		expect(c.text).toBe('E → E + T | T\nT → T * F | T + F | F\nF → int | ( E )');
		expect(c.names).toEqual(['E', null, 'T', 'F']);
		expect(c.problems).toEqual([
			'Level 2 has no operator and is left out.',
			'+ is on levels 1 and 3: the grammar is ambiguous for +.'
		]);
	});

	it('with no level, derives the atoms from E', () => {
		expect(buildCascade([], 'int | ( E )').text).toBe('E → int | ( E )');
	});

	it('avoids non-terminal names that the atoms or operators use', () => {
		const c = buildCascade([left('+'), left('*')], 'T | F | ( E )');
		expect(c.text).toBe('E → E + G | G\nG → G * H | H\nH → T | F | ( E )');
	});

	it('reports atoms it cannot read', () => {
		expect(buildCascade(DEFAULT_LEVELS, '  ')).toEqual({
			grammar: null,
			text: '',
			names: [],
			problems: ['Enter the atoms, for example int | ( E ).']
		});
		const bad = buildCascade(DEFAULT_LEVELS, 'int | | ( E )');
		expect(bad.grammar).toBeNull();
		expect(bad.problems).toEqual(['Nothing before |. Write ε for an empty alternative.']);
	});
});
