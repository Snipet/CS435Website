import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, any, cat, chars, plus, ref, star, sym } from '../regex/ast';
import { analyzeDeterminism, complete } from './core';
import { compareLanguages } from './language';
import {
	driveScanner,
	ERROR_RULE,
	longestMatchRun,
	scan,
	scannerAlphabet,
	scannerDfa,
	scannerNfa,
	type ScanResult,
	type ScanToken,
	type TokenRule
} from './scanner';
import { accepts } from './simulate';
import { thompson } from './thompson';

const letter = () =>
	ref(
		'letter',
		chars(
			CharSet.fromRanges([
				[65, 90],
				[97, 122]
			])
		)
	);
const digit = () => ref('digit', chars(CharSet.range('0', '9')));

const whitespace: TokenRule = { name: 'Whitespace', regex: plus(sym(' ')) };
const integer: TokenRule = { name: 'Integer', regex: plus(digit()) };
const identifier: TokenRule = {
	name: 'Identifier',
	regex: cat(letter(), star(alt(letter(), digit())))
};
const plusRule: TokenRule = { name: 'Plus', regex: sym('+') };
const newRule: TokenRule = { name: 'New', regex: sym('new') };

const rules = [whitespace, integer, identifier, plusRule];
const keywordRules = [whitespace, newRule, integer, identifier];

const pairs = (r: ScanResult) => r.tokens.map((t) => [t.name, t.lexeme]);

describe('scan (Lexical Analysis II loop)', () => {
	it('"f+3 +g"', () => {
		const r = scan(rules, 'f+3 +g');
		expect(pairs(r)).toEqual([
			['Identifier', 'f'],
			['Plus', '+'],
			['Integer', '3'],
			['Whitespace', ' '],
			['Plus', '+'],
			['Identifier', 'g']
		]);
		expect(r.stuck).toBeNull();
		expect(r.tokens.map((t) => [t.start, t.end])).toEqual([
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6]
		]);
	});

	it('"foo+3" takes the longest match', () => {
		const r = scan(rules, 'foo+3');
		expect(pairs(r)).toEqual([
			['Identifier', 'foo'],
			['Plus', '+'],
			['Integer', '3']
		]);
		expect(r.steps[0]).toEqual({
			pos: 0,
			maxLen: 4,
			matches: [
				[false, false, false, false],
				[false, false, false, false],
				[true, true, true, false],
				[false, false, false, false]
			],
			length: 3,
			rule: 2
		});
		expect(r.steps.map((s) => s.pos)).toEqual([0, 3, 4]);
	});

	it('"new foo": ties go to the earlier rule', () => {
		const r = scan(keywordRules, 'new foo');
		expect(pairs(r)).toEqual([
			['New', 'new'],
			['Whitespace', ' '],
			['Identifier', 'foo']
		]);
		expect(r.steps[0].matches[1]).toEqual([false, false, true, false]);
		expect(r.steps[0].matches[3]).toEqual([true, true, true, false]);
	});

	it('"newer": priority only breaks ties', () => {
		expect(pairs(scan(keywordRules, 'newer'))).toEqual([['Identifier', 'newer']]);
	});

	it('"=56" is stuck at 0 without an Error rule', () => {
		const r = scan(rules, '=56');
		expect(r.stuck).toBe(0);
		expect(r.tokens).toEqual([]);
		expect(r.steps).toEqual([
			{ pos: 0, maxLen: 1, matches: [[false], [false], [false], [false]], length: null, rule: null }
		]);
	});

	it('"=56" with the Error rule', () => {
		const r = scan(rules, '=56', { errorRule: true });
		expect(pairs(r)).toEqual([
			['Error', '='],
			['Integer', '56']
		]);
		expect(r.tokens[0]).toMatchObject({ rule: ERROR_RULE, error: true, skipped: false });
		expect(r.stuck).toBeNull();
	});

	it('flags skipped tokens', () => {
		const r = scan([{ ...whitespace, skip: true }, integer], '1 2');
		expect(r.tokens.map((t) => t.skipped)).toEqual([false, true, false]);
		expect(r.tokens.filter((t) => !t.skipped).map((t) => t.lexeme)).toEqual(['1', '2']);
	});

	it('never matches the empty string', () => {
		const r = scan([{ name: 'As', regex: star(sym('a')) }], 'b');
		expect(r.stuck).toBe(0);
	});

	it('handles empty input and no rules', () => {
		expect(scan(rules, '')).toEqual({ tokens: [], steps: [], stuck: null });
		expect(scan([], 'x').stuck).toBe(0);
	});

	it('reads Σ as any symbol the rules use, or of the given alphabet', () => {
		const withAny = [integer, { name: 'Other', regex: any() }];
		expect(pairs(scan(withAny, '1x', { errorRule: true }))).toEqual([
			['Integer', '1'],
			['Error', 'x']
		]);
		const alphabet = scannerAlphabet(withAny, CharSet.of('1x'));
		expect(alphabet.equals(CharSet.range('0', '9').union(CharSet.single('x')))).toBe(true);
		expect(pairs(scan(withAny, '1x', { alphabet }))).toEqual([
			['Integer', '1'],
			['Other', 'x']
		]);
	});
});

describe('scannerNfa', () => {
	const { nfa, starts, positions } = scannerNfa(keywordRules);

	it('adds a start with ε to each rule and tags rule finals', () => {
		const sizes = keywordRules.map((r) => thompson(r.regex).nfa.states.length);
		expect(nfa.states).toHaveLength(1 + sizes.reduce((a, b) => a + b, 0));
		expect(nfa.start).toBe(0);
		expect(nfa.states[0].name).toBe('A');
		expect(starts).toEqual([
			1,
			1 + sizes[0],
			1 + sizes[0] + sizes[1],
			1 + sizes[0] + sizes[1] + sizes[2]
		]);
		expect(nfa.transitions.slice(0, 4).map((t) => [t.from, t.to, t.label])).toEqual(
			starts.map((s) => [0, s, null])
		);
		const finals = nfa.states.filter((s) => s.accepting);
		expect(finals.map((s) => s.accept)).toEqual([
			{ rule: 0, token: 'Whitespace' },
			{ rule: 1, token: 'New' },
			{ rule: 2, token: 'Integer' },
			{ rule: 3, token: 'Identifier' }
		]);
	});

	it('positions every state, rules stacked top to bottom', () => {
		expect(positions.size).toBe(nfa.states.length);
		const ys = starts.map((s) => positions.get(s)!.y);
		expect([...ys].sort((a, b) => a - b)).toEqual(ys);
		expect(positions.get(starts[0])!.x).toBe(96);
		expect(positions.get(0)!.x).toBe(0);
	});
});

describe('scannerDfa', () => {
	it('reports the lowest rule index in each accepting state', () => {
		const dfa = scannerDfa(keywordRules);
		expect(analyzeDeterminism(dfa).kind).not.toBe('nfa');
		const run = longestMatchRun(dfa, 'new', 0);
		expect(dfa.states[run.token!.state].accept).toEqual({ rule: 1, token: 'New' });
		const ident = longestMatchRun(dfa, 'ne', 0);
		expect(dfa.states[ident.token!.state].accept).toEqual({ rule: 3, token: 'Identifier' });
	});

	it('minimizes without merging different tokens', () => {
		const dfa = scannerDfa(keywordRules);
		const min = scannerDfa(keywordRules, { minimal: true });
		expect(min.states.length).toBeLessThan(dfa.states.length);
		expect(compareLanguages(dfa, min).equivalent).toBe(true);
		for (const input of ['new foo', 'newer 12 x', 'n ne new']) {
			const a = driveScanner(dfa, input);
			const b = driveScanner(min, input);
			expect(b.tokens.map((t) => [t.name, t.lexeme])).toEqual(
				a.tokens.map((t) => [t.name, t.lexeme])
			);
			expect(b.tokens.map((t) => [t.name, t.lexeme])).toEqual(pairs(scan(keywordRules, input)));
		}
	});
});

describe('longestMatchRun', () => {
	const dfa = scannerDfa(rules);

	it('tracks the last accepting position', () => {
		const run = longestMatchRun(dfa, 'foo+3', 0);
		expect(run.token?.end).toBe(3);
		expect(run.steps.map((s) => s.pos)).toEqual([0, 1, 2, 3, 4]);
		expect(run.steps.at(-1)!.state).toBeNull();
		expect(run.steps.map((s) => s.lastAccept?.pos ?? null)).toEqual([null, 1, 2, 3, 3]);
	});

	it('backs up to the last accepting position', () => {
		const abc = scannerDfa([
			{ name: 'A', regex: sym('a') },
			{ name: 'ABC', regex: sym('abc') }
		]);
		const run = longestMatchRun(abc, 'abd', 0);
		expect(run.steps.at(-1)!.pos).toBe(3);
		expect(run.token?.end).toBe(1);
		expect(abc.states[run.token!.state].accept?.token).toBe('A');
		expect(longestMatchRun(abc, 'abc', 0).token?.end).toBe(3);
	});

	it('starts anywhere and returns null when nothing matches', () => {
		expect(longestMatchRun(dfa, 'x+12', 2).token?.end).toBe(4);
		expect(longestMatchRun(dfa, '=', 0).token).toBeNull();
	});

	it('stops once a total DFA enters its trap', () => {
		const total = complete(dfa).automaton;
		const run = longestMatchRun(total, 'ab+cd', 0);
		expect(run.token?.end).toBe(2);
		expect(run.steps).toHaveLength(4);
		expect(total.states[run.steps.at(-1)!.state!].trap).toBe(true);
	});
});

describe('driveScanner', () => {
	it('matches scan on the lecture examples', () => {
		const dfa = scannerDfa(rules);
		for (const input of ['f+3 +g', 'foo+3']) {
			expect(driveScanner(dfa, input).tokens.map((t) => [t.name, t.lexeme])).toEqual(
				pairs(scan(rules, input))
			);
		}
	});

	it('handles errors and skipped tokens', () => {
		const dfa = scannerDfa(rules);
		expect(driveScanner(dfa, '=56').stuck).toBe(0);
		const r = driveScanner(dfa, '=5 6', { errorRule: true, skip: new Set(['Whitespace']) });
		expect(r.tokens.map((t) => [t.name, t.lexeme, t.skipped])).toEqual([
			['Error', '=', false],
			['Integer', '5', false],
			['Whitespace', ' ', true],
			['Integer', '6', false]
		]);
		expect(r.runs).toHaveLength(4);
	});

	it('gives the same tokens as scan for the same rules and alphabet', () => {
		const other: TokenRule = { name: 'Other', regex: any() };
		const cases: { rules: TokenRule[]; input: string; alphabet?: CharSet }[] = [
			{ rules, input: 'f+3 +g' },
			{ rules, input: 'x1 = 22+y' },
			{ rules: keywordRules, input: 'new newer ne 7' },
			{ rules: [{ name: 'A', regex: sym('a') }, other], input: 'ab' },
			{ rules: [{ name: 'A', regex: sym('a') }, other], input: 'ab', alphabet: CharSet.of('ab') },
			{
				rules: [integer, other],
				input: '12x?',
				alphabet: scannerAlphabet([integer], CharSet.of('x?'))
			}
		];
		for (const { rules: rs, input, alphabet } of cases) {
			for (const errorRule of [false, true]) {
				const expected = scan(rs, input, { errorRule, alphabet });
				const got = driveScanner(scannerDfa(rs, { alphabet }), input, { errorRule });
				const view = (ts: ScanToken[]) => ts.map((t) => [t.rule, t.name, t.lexeme, t.error]);
				expect(view(got.tokens)).toEqual(view(expected.tokens));
				expect(got.stuck).toBe(expected.stuck);
				const minimal = driveScanner(scannerDfa(rs, { alphabet, minimal: true }), input, {
					errorRule
				});
				expect(view(minimal.tokens)).toEqual(view(expected.tokens));
			}
		}
	});

	it('accepts the combined language', () => {
		const dfa = scannerDfa(rules);
		expect(accepts(dfa, 'abc1')).toBe(true);
		expect(accepts(dfa, '1abc')).toBe(false);
	});
});
