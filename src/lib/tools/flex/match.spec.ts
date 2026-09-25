import { describe, expect, it } from 'vitest';
import { parseFlexDefinitions, parseFlexPattern, type Regex } from '$lib/theory/regex';
import { MatchBudget, MatchBudgetExceeded, Matcher, PatternTooLarge, RuleMatcher } from './match';

function re(text: string, defs: [string, string][] = []): Regex {
	const d = parseFlexDefinitions(defs.map(([name, t], k) => ({ name, text: t, line: k + 1 })));
	const r = parseFlexPattern(text, { defs: d.defs });
	if (!r.ok) throw new Error(r.diagnostics.map((x) => x.message).join('; '));
	return r.pattern.regex;
}

describe('Matcher', () => {
	it('finds every end and the longest end from a position', () => {
		const m = new Matcher(re('a*'));
		expect(m.ends('aab', 0)).toEqual([0, 1, 2]);
		expect(m.longest('aab', 0)).toBe(2);
		expect(m.longest('aab', 2)).toBe(2);
		expect(new Matcher(re('b')).longest('aab', 0)).toBe(-1);
	});

	it('handles classes, ., alternation, grouping, and repetition', () => {
		expect(new Matcher(re('[0-9]+')).longest('123abc', 0)).toBe(3);
		expect(new Matcher(re('.')).longest('\n', 0)).toBe(-1);
		expect(new Matcher(re('.|\\n')).longest('\n', 0)).toBe(1);
		expect(new Matcher(re('(ab|a)(bc)?')).longest('abc', 0)).toBe(3);
		expect(new Matcher(re('x{2,3}')).ends('xxxx', 0)).toEqual([2, 3]);
		expect(new Matcher(re('x{2,}')).longest('xxxx', 0)).toBe(4);
		expect(new Matcher(re('"ab"*')).ends('ababa', 0)).toEqual([0, 2, 4]);
		expect(new Matcher(re('[^a]')).longest('\n', 0)).toBe(1);
	});

	it('expands definitions ({ID} from Example 3)', () => {
		const id = re('{ID}', [
			['DIGIT', '[0-9]'],
			['LETTER', '[A-Za-z]'],
			['ID', '{LETTER}({LETTER}|{DIGIT})*']
		]);
		const m = new Matcher(id);
		expect(m.longest('abc123 x', 0)).toBe(6);
		expect(m.longest('123abc', 0)).toBe(-1);
		expect(m.matchesAll('x_1')).toBe(false);
	});

	it('steps over characters outside the BMP as one character', () => {
		const m = new Matcher(re('.+'));
		expect(m.longest('a😀b\nc', 0)).toBe(4);
	});

	it('spends the shared budget', () => {
		const budget = new MatchBudget(3);
		expect(() => new Matcher(re('a*')).longest('aaaaaa', 0, budget)).toThrow(MatchBudgetExceeded);
	});

	it('refuses patterns that are too large', () => {
		expect(() => new Matcher(re('(a{1000}){1000}'))).toThrow(PatternTooLarge);
	});
});

describe('RuleMatcher', () => {
	it('matches without trailing context', () => {
		expect(new RuleMatcher(re('[a-z]+'), null).match('abc1', 0)).toEqual({ end: 3, textEnd: 3 });
		expect(new RuleMatcher(re('[a-z]*'), null).match('1', 0)).toBeNull();
	});

	it('counts the trailing context in the length but not in yytext', () => {
		const m = new RuleMatcher(re('[0-9]+'), re('"."'));
		expect(m.match('12.5', 0)).toEqual({ end: 3, textEnd: 2 });
		expect(m.match('12', 0)).toBeNull();
	});

	it('prefers the longest total, then the longest head', () => {
		const m = new RuleMatcher(re('a*'), re('a*b'));
		expect(m.match('aab', 0)).toEqual({ end: 3, textEnd: 2 });
	});
});
