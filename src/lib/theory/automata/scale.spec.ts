import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, chars, plus, pow, star, sym } from '../regex/ast';
import { formatAutomatonText, parseAutomatonText } from './core';
import { compareLanguages, countByLength, enumerate, isFiniteLanguage } from './language';
import { minimize } from './minimize';
import { scan } from './scanner';
import { runNfa } from './simulate';
import { subsetConstruction } from './subset';
import { thompson } from './thompson';

describe('machines with a few hundred states', () => {
	// (0|1)*1(0|1)^7: the DFA must remember the last 8 symbols, 256 states.
	const bit = () => alt(sym('0'), sym('1'));
	const r = cat(star(bit()), sym('1'), pow(bit(), 7));

	it('builds, determinizes, and minimizes quickly', () => {
		const t0 = performance.now();
		const { nfa } = thompson(r);
		const { dfa } = subsetConstruction(nfa);
		// The start state is equivalent to "last 8 symbols were 0".
		expect(dfa.states).toHaveLength(257);
		expect(dfa.states[0].name.startsWith('{')).toBe(true);
		const result = minimize(dfa);
		expect(result.dfa.states).toHaveLength(256);
		expect(countByLength(dfa, 8)[8]).toBe(128n);
		expect(isFiniteLanguage(dfa)).toBe(false);
		expect(compareLanguages(nfa, result.dfa).equivalent).toBe(true);
		expect(enumerate(dfa, { maxLength: 8, limit: 3 }).strings).toEqual([
			'10000000',
			'10000001',
			'10000010'
		]);
		const text = formatAutomatonText(dfa);
		expect(parseAutomatonText(text).automaton?.states).toHaveLength(257);
		expect(runNfa(nfa, '1'.repeat(200)).accepted).toBe(true);
		expect(performance.now() - t0).toBeLessThan(4000);
	});

	it('scans long inputs', () => {
		const digit = chars(CharSet.range('0', '9'));
		const letter = chars(CharSet.range('a', 'z'));
		const rules = [
			{ name: 'Whitespace', regex: plus(sym(' ')), skip: true },
			{ name: 'Integer', regex: plus(digit) },
			{ name: 'Identifier', regex: cat(letter, star(alt(letter, digit))) },
			{ name: 'Plus', regex: sym('+') }
		];
		const input = 'abc + 123 + x9 '.repeat(200);
		const t0 = performance.now();
		const result = scan(rules, input);
		expect(result.stuck).toBeNull();
		expect(result.tokens.filter((t) => !t.skipped)).toHaveLength(1000);
		expect(performance.now() - t0).toBeLessThan(4000);
	});
});
