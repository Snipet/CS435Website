import { describe, expect, it } from 'vitest';
import { parseRegex } from '$lib/theory/regex';
import { CharSet } from '$lib/theory/charset';
import {
	RuleMachine,
	describeLookahead,
	longestSoFar,
	lookaheadIndex,
	lookaheadPoint,
	lookaheadStart,
	ruleMachine,
	standingsAt
} from './lookahead';
import { presetById } from './presets';
import { lexAlphabet, runScan, type StepContext } from './scan';
import { buildSpec } from './spec';
import { regexToDfa } from '$lib/theory/automata';

function setup(id: string, input?: string, errorRule = false) {
	const p = presetById(id)!;
	const spec = buildSpec(p.value.defs ?? '', p.value.rules);
	const run = runScan(spec, input ?? p.value.input, errorRule);
	const alphabet = lexAlphabet(spec, run.text);
	const machines = spec.tokenRules.map((r) => ruleMachine(r.regex, alphabet));
	const index = lookaheadIndex(run);
	const ctx: StepContext = { spec, run, errorRule, format: 'paren' };
	const at = (i: number) => {
		const point = lookaheadPoint(run, index, i)!;
		const standings = standingsAt(machines, run, point, errorRule);
		return { point, standings, text: describeLookahead(ctx, point, standings) };
	};
	return { spec, run, index, at };
}

describe('RuleMachine', () => {
	const re = (t: string) => {
		const r = parseRegex(t);
		if (!r.ok) throw new Error(t);
		return r.regex;
	};

	it('classifies prefixes as match, viable, or dead', () => {
		const m = new RuleMachine(regexToDfa(re("'iffy'"), { minimal: true }));
		expect(m.standingAfter('iffy', 0, 1)).toEqual({ status: 'viable', more: true });
		expect(m.standingAfter('iffy', 0, 4)).toEqual({ status: 'match', more: false });
		expect(m.standingAfter('ifx', 0, 3)).toEqual({ status: 'dead', more: false });
	});

	it('treats states that cannot reach acceptance as dead', () => {
		const m = new RuleMachine(regexToDfa(re("'a' ɸ | 'bc'"), { minimal: true }));
		expect(m.standingAfter('a', 0, 1).status).toBe('dead');
		expect(m.standingAfter('b', 0, 1).status).toBe('viable');
	});

	it('is cached per expression and, for Σ, alphabet', () => {
		const r = re('Σ');
		const a = ruleMachine(r, CharSet.of('ab'));
		expect(ruleMachine(r, CharSet.of('ab'))).toBe(a);
		expect(ruleMachine(r, CharSet.of('abc'))).not.toBe(a);
		expect(ruleMachine(r, CharSet.of('abc')).standingAfter('c', 0, 1).status).toBe('match');
		const plain = re("'a'");
		expect(ruleMachine(plain, CharSet.of('xyz'))).toBe(ruleMachine(plain, CharSet.of('a')));
	});
});

describe('lookahead walk (i if iffy)', () => {
	const { run, index, at } = setup('lookahead-iffy');

	it('has one entry per character read for each token', () => {
		expect(run.steps.map((s) => s.maxLen)).toEqual([2, 2, 3, 2, 4]);
		expect(index.total).toBe(13);
		expect(index.offsets).toEqual([0, 2, 4, 7, 9]);
		expect(lookaheadStart(index, 2)).toBe(4);
		expect(lookaheadPoint(run, index, 13)).toBeNull();
	});

	it('after "i": IF and IFFY are viable, ID matches', () => {
		const { point, standings, text } = at(0);
		expect(point).toMatchObject({ scanStep: 0, pos: 0, read: 1, end: 1, final: false });
		expect(standings.map((s) => s.status)).toEqual([
			'dead',
			'viable',
			'viable',
			'match',
			'dead',
			'dead',
			'dead'
		]);
		expect(text).toBe(
			"Read \"i\" (1 character). ID (R4) matches it; 'if' (R2) and 'iffy' (R3) can still match with more input, so the scanner reads on."
		);
	});

	it('backs up when every rule is dead', () => {
		const { point, text } = at(1);
		expect(point.final).toBe(true);
		expect(text).toBe(
			'Read "i " (2 characters): no rule matches it or anything longer. The scanner backs up to the longest match, "i" → (ID, "i"); " " stays in the input.'
		);
	});

	it('after "if", IFFY is still viable', () => {
		const { point, text } = at(5);
		expect(point).toMatchObject({ scanStep: 2, read: 2 });
		expect(text).toBe(
			"Read \"if\" (2 characters). 'if' (R2) and ID (R4) match it; 'iffy' (R3) can still match with more input, so the scanner reads on."
		);
		expect(longestSoFar(run, point)).toEqual({ length: 2, rule: 1 });
	});

	it('stops at the end of the input', () => {
		const { point, text } = at(12);
		expect(point).toMatchObject({ scanStep: 4, read: 4, final: true });
		expect(text).toBe('End of input after "iffy". The longest match is "iffy" → (IFFY, "iffy").');
	});
});

describe('lookahead sentences', () => {
	it('a match that cannot grow still reads one more character', () => {
		const { at } = setup('lookahead-eq', '=a');
		expect(at(0).text).toBe(
			"Read \"=\" (1 character). '=' (R7) matches it; '===' (R5) and '==' (R6) can still match with more input, so the scanner reads on."
		);
		const plus = setup('foo-plus-3', '+3');
		expect(plus.at(0).text).toBe(
			'Read "+" (1 character). \'+\' (R4) matches it. The scanner reads the next character to see whether a longer prefix matches.'
		);
	});

	it('an identifier can grow', () => {
		const { at } = setup('foo-plus-3');
		expect(at(0).text).toBe(
			'Read "f" (1 character). Identifier (R3) matches it, and a longer match is still possible, so the scanner reads on.'
		);
	});

	it('a token that ends the input ends with "End of input", even when no rule can grow', () => {
		const lastOf = (id: string, input?: string) => {
			const s = setup(id, input);
			const i = s.index.total - 1;
			const { point, standings, text } = s.at(i);
			expect(point.final).toBe(true);
			expect(point.end).toBe(s.run.text.length);
			return { standings, text };
		};

		const eq = lastOf('lookahead-eq');
		expect(eq.standings[4]).toEqual({ status: 'match', more: false });
		expect(eq.standings.some((s) => s.status === 'viable' || s.more)).toBe(false);
		expect(eq.text).toBe('End of input after "===". The longest match is "===" → (EQ3, "===").');

		expect(lastOf('templates').text).toBe(
			'End of input after ">>". The longest match is ">>" → (SHR, ">>").'
		);
		expect(lastOf('f-plus-3', 'f+').text).toBe(
			'End of input after "+". The longest match is "+" → (Plus, "+").'
		);
	});

	it('at the end of the input, the scanner can still back up or be stuck', () => {
		// REAL = digit+ '.' digit+ is still viable after "1." when the input ends.
		const { index, at } = setup('fortran-do', '1.');
		expect(at(index.offsets[0] + 1).text).toBe(
			'End of input after "1.". The scanner backs up to the longest match, "1" → (INT, "1"); "." stays in the input.'
		);
		expect(at(index.total - 1).text).toBe(
			'End of input after ".". No prefix matches R, so the scanner is stuck at position 1.'
		);
	});

	it('mid-input, the last read is the one no rule survives', () => {
		const { run, index, at } = setup('lookahead-eq');
		// "= == ===": the reads for "=" are "=" and "= ".
		const { point, standings, text } = at(index.offsets[0] + 1);
		expect(point.final).toBe(true);
		expect(point.end).toBeLessThan(run.text.length);
		expect(standings.every((s) => s.status === 'dead')).toBe(true);
		expect(text).toBe(
			'Read "= " (2 characters): no rule matches it or anything longer. The scanner backs up to the longest match, "=" → (ASSIGN, "="); " " stays in the input.'
		);
	});

	it('stuck and Error', () => {
		expect(setup('equals-56').at(0).text).toBe(
			'Read "=" (1 character): no rule matches it or anything longer. No prefix matches R, so the scanner is stuck at position 0.'
		);
		const withError = setup('equals-56', undefined, true).at(0);
		expect(withError.standings.at(-1)).toEqual({ status: 'match', more: false });
		expect(withError.text).toBe(
			'Read "=" (1 character). No prefix matches R1…R4, so the Error rule (R5) takes one character → (Error, "=").'
		);
	});
});
