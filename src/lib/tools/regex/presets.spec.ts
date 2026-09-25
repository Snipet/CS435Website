import { describe, expect, it } from 'vitest';
import { formatStringSet } from '$lib/theory/chars';
import { compareLanguages, enumerate, runDfa } from '$lib/theory/automata';
import {
	analyzeCompare,
	analyzeExpression,
	convertDialect,
	evaluateTest,
	listLanguage,
	sampleOf,
	type ExpressionAnalysis
} from './analysis';
import { applyPreset, DEFAULT_PRESET_ID, matchPreset, presetById, presets } from './presets';
import { blankState } from './state';

function load(id: string): ExpressionAnalysis {
	const p = presetById(id);
	if (!p) throw new Error(`no preset ${id}`);
	const s = applyPreset(p, blankState());
	return analyzeExpression(s);
}

function minOf(a: ExpressionAnalysis) {
	if (!a.language?.ok) throw new Error('language not built');
	return a.language.min;
}

const errors = (ds: { severity: string }[]) => ds.filter((d) => d.severity === 'error');

describe('presets', () => {
	it('have unique ids, groups, and citations', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group, p.id).toBeTruthy();
			expect(p.cite, p.id).toBeTruthy();
		}
		expect(presetById(DEFAULT_PRESET_ID)).toBeDefined();
	});

	it.each(presets.map((p) => [p.id, p] as const))(
		'%s loads without errors and builds its language',
		(_, p) => {
			const s = applyPreset(p, blankState());
			const a = analyzeExpression(s);
			expect(errors(a.defs.diagnostics)).toEqual([]);
			expect(errors(a.re.diagnostics)).toEqual([]);
			expect(errors(a.alphabetDiagnostics)).toEqual([]);
			expect(a.alphabetDiagnostics.filter((d) => d.severity === 'warning')).toEqual([]);
			expect(a.language?.ok).toBe(true);
			if (s.compare) {
				const c = analyzeCompare(a, s.compare);
				expect(c && errors(c.r2.diagnostics)).toEqual([]);
				expect(c?.comparison).not.toBeNull();
			}
			for (const t of s.tests) {
				const r = evaluateTest(a, t);
				expect(r).not.toBeNull();
				// The derivation agrees with the DFA.
				if (r!.member) expect(r!.derivation?.status).toBe('match');
				else expect(r!.rejection).not.toBeNull();
			}
			expect(matchPreset(s)?.id).toBe(p.id);
		}
	);

	it.each(presets.map((p) => [p.id, p] as const))(
		'%s keeps its languages in the other notation, and lists strings of L(R)',
		(_, p) => {
			const s = applyPreset(p, blankState());
			const a = analyzeExpression(s);
			const other = s.dialect === 'lecture' ? 'flex' : 'lecture';
			const text = convertDialect(s, s.dialect, other, s.alphabet);
			const b = analyzeExpression({ ...text, dialect: other, alphabet: s.alphabet });
			expect(compareLanguages(minOf(a), minOf(b)).equivalent).toBe(true);
			if (s.compare) {
				const [c1, c2] = [analyzeCompare(a, s.compare), analyzeCompare(b, text.compare)];
				if (!c1?.language?.ok || !c2?.language?.ok) throw new Error('R₂ not built');
				expect(compareLanguages(c1.language.min, c2.language.min).equivalent).toBe(true);
			}
			// The Structure view's sample for the root, and the shortest string.
			const sample = sampleOf(a.re.regex!, a.sigma);
			const empty = listLanguage(minOf(a), 12).shortest === null;
			expect(sample.ok && sample.strings.length > 0).toBe(!empty);
		}
	);
});

describe('Lexical Analysis results', () => {
	const list = (id: string, maxLength = 4, limit = 10) =>
		enumerate(minOf(load(id)), { maxLength, limit });

	it('basis clauses (slide 23)', () => {
		expect(list('atomic').strings).toEqual(['c']);
		expect(list('empty').strings).toEqual([]);
		expect(list('epsilon').strings).toEqual(['']);
	});

	it("'i' 'f' is 'if' (slide 24)", () => {
		const a = load('if-concat');
		expect(list('if-concat').strings).toEqual(['if']);
		expect(analyzeCompare(a, "'if'")?.comparison?.equivalent).toBe(true);
	});

	it('alternations (slide 25)', () => {
		expect(list('if-then-else').strings).toEqual(['if', 'else', 'then']);
		expect(list('digits').strings).toEqual('0123456789'.split(''));
		const q = presetById('two-bits')!.questions![0];
		expect(formatStringSet(list('two-bits').strings)).toBe(q.answer);
	});

	it('iteration (slide 26)', () => {
		expect(list('zero-star', 3).strings).toEqual(['', '0', '00', '000']);
		expect(list('zero-star', 3).truncated).toBe(true);
		const { strings } = list('one-zero-star', 4);
		expect(formatStringSet(strings, { more: true })).toBe(
			presetById('one-zero-star')!.questions![0].answer
		);
	});

	it('number = digit digit* = digit+, and digit^3 (slide 27)', () => {
		const a = load('number');
		expect(analyzeCompare(a, 'digit+')?.comparison?.equivalent).toBe(true);
		const b = load('plus-and-power');
		const cmp = analyzeCompare(b, 'digit^3')!.comparison!;
		expect(cmp.equivalent).toBe(false);
		expect(cmp.onlyA).toBe('0');
		expect(cmp.onlyB).toBeNull();
		expect(cmp.examples.both[0]).toBe('000');
	});

	it('keyword (slide 28)', () => {
		expect(list('keyword', 8).strings).toEqual(['for', 'class', 'typename']);
	});

	it('identifier differs from (letter* | digit*) (slide 29)', () => {
		const a = load('identifier');
		const cmp = analyzeCompare(a, '(letter* | digit*)')!.comparison!;
		expect(cmp.equivalent).toBe(false);
		expect(cmp.onlyA).toBe('A0');
		expect(cmp.onlyB).toBe('');
		expect(cmp.examples.onlyB.slice(0, 3)).toEqual(['', '0', '1']);
	});

	it('ws (slide 30)', () => {
		const a = load('ws');
		expect(evaluateTest(a, ' \t\r\n')?.member).toBe(true);
		expect(evaluateTest(a, '')?.member).toBe(false);
	});

	it('the phone number with a space is not in L (slide 31)', () => {
		const a = load('phone');
		const spaced = evaluateTest(a, '(717) 867-5309')!;
		expect(spaced.member).toBe(false);
		expect(spaced.rejection).toMatchObject({ kind: 'fails', prefixEnd: 5 });
		expect(spaced.outside.chars()).toEqual([' ']);
		expect(evaluateTest(a, '(717)867-5309')?.member).toBe(true);
	});

	it('the email address matches (slide 32)', () => {
		const a = load('email');
		const r = evaluateTest(a, 'account@cs.example.edu')!;
		expect(r.member).toBe(true);
		expect(r.derivation?.status).toBe('match');
		const short = evaluateTest(a, 'account@cs')!;
		expect(short.rejection).toMatchObject({ kind: 'incomplete', completion: '.A' });
	});
});

describe('Lexical Analysis III and IV results', () => {
	it('1*0 accepts "1110" but not "1101" (06 slide 7)', () => {
		const min = minOf(load('ones-then-zero'));
		expect(runDfa(min, '1110').accepted).toBe(true);
		expect(runDfa(min, '1101').accepted).toBe(false);
	});

	it('(0 | 1)*00 has the three-state DFA (06 slide 8)', () => {
		const min = minOf(load('ends-00'));
		expect(min.states.filter((s) => !s.trap)).toHaveLength(3);
	});

	it('(0|1)*01 accepts 1 0 1 (06 slide 13)', () => {
		expect(runDfa(minOf(load('ends-01')), '101').accepted).toBe(true);
	});

	it('(0 | 1)* 1 (0|1)^2 needs 8 DFA states (06 slide 16)', () => {
		expect(minOf(load('third-from-end')).states).toHaveLength(8);
	});

	it('(1 | 0)*1 gives the slide-10 subset DFA (08 slide 6)', () => {
		const a = load('thompson-example');
		expect(a.language?.ok && a.language.dfa.states.map((s) => s.name)).toEqual([
			'ABCDHI',
			'FGABCDHI',
			'EJGABCDHI'
		]);
	});
});

describe('flex results', () => {
	it('[0-9]+ (07 slide 8)', () => {
		const a = load('flex-number');
		expect(evaluateTest(a, '123')?.member).toBe(true);
		expect(evaluateTest(a, '7.5')?.rejection).toMatchObject({ kind: 'fails', prefixEnd: 1 });
	});

	it('DELIM [ \\t]+ (07 slide 9)', () => {
		const a = load('flex-delim');
		expect(evaluateTest(a, ' \t ')?.member).toBe(true);
	});

	it('the flex ID is the lecture identifier (07 slide 10)', () => {
		const flex = minOf(load('flex-id'));
		const lecture = load('identifier');
		expect(analyzeCompare(lecture, '(letter | digit)*')).not.toBeNull();
		const cmp = analyzeCompare(
			{ ...lecture, language: { ok: true, nfa: flex, dfa: flex, min: flex } },
			'letter (letter | digit)*'
		);
		expect(cmp?.comparison?.equivalent).toBe(true);
	});
});
