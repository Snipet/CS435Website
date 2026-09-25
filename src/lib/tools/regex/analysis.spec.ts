import { describe, expect, it } from 'vitest';
import { compareLanguages, parseAutomatonText, runDfa } from '$lib/theory/automata';
import { CharSet } from '$lib/theory/charset';
import { printRegex } from '$lib/theory/regex';
import {
	analyzeCompare,
	analyzeExpression,
	automataState,
	convertDialect,
	evaluateTest,
	groupDigits,
	languageFor,
	listLanguage,
	listSymbols,
	namedSymbolSets,
	parseCompare,
	parseDefs,
	sampleOf,
	splitFlexDefinitions,
	thompsonState,
	type ExpressionAnalysis,
	type ExpressionInput
} from './analysis';
import { MAX_PRODUCT } from './machines';
import { languageBlocked, sizeMessage, structureBlocked } from './messages';

const input = (over: Partial<ExpressionInput>): ExpressionInput => ({
	re: '',
	defs: '',
	dialect: 'lecture',
	alphabet: '',
	...over
});

const messages = (ds: { message: string }[]) => ds.map((d) => d.message);

function minOf(a: ExpressionAnalysis) {
	if (!a.language?.ok) throw new Error('language not built');
	return a.language.min;
}

describe('flex definitions', () => {
	it('splits NAME pattern lines with absolute offsets', () => {
		const text = 'DIGIT     [0-9]\n\n  LETTER\t[A-Za-z]  \n';
		const { lines } = splitFlexDefinitions(text);
		expect(lines).toEqual([
			{ name: 'DIGIT', text: '[0-9]', line: 1, nameStart: 0, textStart: 10 },
			{ name: 'LETTER', text: '[A-Za-z]', line: 3, nameStart: 19, textStart: 26 }
		]);
		expect(text.slice(26, 34)).toBe('[A-Za-z]');
	});

	it('skips comments, which may span lines', () => {
		const text = '/* C-style comments allowed */\nDELIM [ \\t]+\n/* two\nlines */ X a\n/* open';
		const { lines, diagnostics } = splitFlexDefinitions(text);
		expect(lines.map((l) => [l.name, l.text, text.slice(l.textStart!, l.textStart! + 1)])).toEqual([
			['DELIM', '[ \\t]+', '['],
			['X', 'a', 'a']
		]);
		expect(messages(diagnostics)).toEqual(['comment /* is never closed']);
	});

	it('reports a definition with no pattern at its line', () => {
		const d = parseDefs('A [a]\nB', 'flex');
		expect(d.defs.has('A')).toBe(true);
		expect(d.invalid.has('B')).toBe(true);
	});
});

describe('analyzeExpression', () => {
	it('parses lecture notation with definitions', () => {
		const a = analyzeExpression(input({ re: 'digit+', defs: "digit = '0' | '1'" }));
		expect(a.re.regex?.kind).toBe('plus');
		expect(a.sigma).toEqual({ set: CharSet.of('01'), declared: false });
		expect(a.print.symbols).toBe('quoted');
		expect(a.language?.ok).toBe(true);
	});

	it('prints bare symbols when R is written with them', () => {
		expect(analyzeExpression(input({ re: '(0 | 1)*00' })).print.symbols).toBe('bare');
	});

	it('reports a use of a definition that has errors', () => {
		const a = analyzeExpression(input({ re: 'digit', defs: 'digit = (' }));
		expect(a.re.regex).toBeNull();
		expect(messages(a.re.diagnostics)).toEqual(['definition digit has errors']);
	});

	it('rejects anchors and trailing context in flex', () => {
		const e = (re: string) =>
			messages(analyzeExpression(input({ re, dialect: 'flex' })).re.diagnostics);
		expect(e('^ab')).toEqual([
			'^ ties a flex rule to the start of a line; anchors are not part of an RE here'
		]);
		expect(e('ab$')).toEqual([
			'$ ties a flex rule to the end of a line; anchors are not part of an RE here'
		]);
		const t = analyzeExpression(input({ re: 'ab/cd', dialect: 'flex' })).re;
		expect(t.regex).toBeNull();
		expect(t.diagnostics[0].span).toEqual({ start: 2, end: 5, source: null });
	});

	it('needs Σ when R uses it', () => {
		const a = analyzeExpression(input({ re: 'Σ* 1' }));
		expect(a.resolved).toBeNull();
		expect(messages(a.alphabetDiagnostics)).toEqual([
			'R uses Σ, so Σ must be given, e.g. { 0, 1 }'
		]);
		const b = analyzeExpression(input({ re: 'Σ* 1', alphabet: '{ 0, 1 }' }));
		expect(b.language?.ok && runDfa(b.language.min, '0101').accepted).toBe(true);
	});

	it('warns about symbols of R that are not in Σ', () => {
		const a = analyzeExpression(input({ re: "'a' ' '", alphabet: '{ a }' }));
		expect(messages(a.alphabetDiagnostics)).toEqual(["R uses ' ', not in Σ"]);
		expect(a.language?.ok).toBe(true);
	});

	it('stops at an invalid Σ', () => {
		const a = analyzeExpression(input({ re: 'a', alphabet: '{ …' }));
		expect(a.sigma).toBeNull();
		expect(a.language).toBeNull();
	});

	it('only parses with build: false', () => {
		const a = analyzeExpression(input({ re: '(0 | 1)*00' }), { build: false });
		expect(a.re.regex?.kind).toBe('concat');
		expect(a.sigma?.set.chars()).toEqual(['0', '1']);
		expect(a.language).toBeNull();
	});

	it('notes that Σ is a plain character in flex', () => {
		const a = analyzeExpression(input({ re: 'Σ*1', defs: 'X [Σ]\nY Σ', dialect: 'flex' }));
		expect(a.re.diagnostics).toMatchObject([
			{ severity: 'info', span: { start: 0, end: 1, source: null } }
		]);
		expect(messages(a.re.diagnostics)[0]).toMatch(/^in flex, Σ is the character Σ/);
		// Only the bare Σ of Y, not the class [Σ] of X.
		expect(a.defs.diagnostics).toMatchObject([{ severity: 'info', span: { source: 'Y' } }]);
		expect(a.language?.ok && runDfa(a.language.min, 'ΣΣ1').accepted).toBe(true);
	});
});

describe('languageFor', () => {
	it('builds each node once, and a definition use shares its body', () => {
		const a = analyzeExpression(
			input({ re: 'digit digit', defs: "digit = '0' | '1'", alphabet: '{ 0, 1 }' })
		);
		const root = a.re.regex!;
		expect(languageFor(root, a.sigma)).toBe(a.language);
		if (root.kind !== 'concat') throw new Error('not a concatenation');
		const [x, y] = root.parts;
		expect(x).not.toBe(y);
		expect(languageFor(x, a.sigma)).toBe(languageFor(y, a.sigma));
	});

	it('resolves Σ with the settled alphabet, and needs one', () => {
		const a = analyzeExpression(input({ re: 'Σ* 1', alphabet: '{ 0, 1 }' }));
		expect(languageFor(a.re.regex!, a.sigma)).toBe(a.language);
		expect(languageFor(a.re.regex!, null)).toBeNull();
		const other = languageFor(a.re.regex!, { set: CharSet.of('1'), declared: true });
		expect(other?.ok && runDfa(other.min, '01').accepted).toBe(false);
	});
});

describe('views', () => {
	it('lists a finite language with its size', () => {
		const a = analyzeExpression(input({ re: "('0' | '1') ('0' | '1')" }));
		if (!a.language?.ok) throw new Error('not built');
		const l = listLanguage(a.language.min, 6);
		expect(l).toMatchObject({ strings: ['00', '01', '10', '11'], truncated: false, finite: true });
		expect(l.total).toBe(4n);
		expect(l.counts).toEqual([0n, 0n, 4n, 0n, 0n, 0n, 0n, 0n, 0n]);
	});

	it('lists an infinite language up to the length and the limit', () => {
		const a = analyzeExpression(input({ re: '(0 | 1)*' }));
		if (!a.language?.ok) throw new Error('not built');
		const l = listLanguage(a.language.min, 12, 5);
		expect(l).toMatchObject({
			strings: ['', '0', '1', '00', '01'],
			truncated: true,
			finite: false
		});
		expect(l.total).toBeNull();
		expect(l.counts[8]).toBe(256n);
	});

	it('reports L(R) = { }', () => {
		const a = analyzeExpression(input({ re: 'ɸ' }));
		if (!a.language?.ok) throw new Error('not built');
		expect(listLanguage(a.language.min, 6)).toMatchObject({ empty: true, finite: true, total: 0n });
	});

	it('samples a sub-expression', () => {
		const a = analyzeExpression(input({ re: "'1' '0'*" }));
		const node = a.re.regex!.kind === 'concat' ? a.re.regex!.parts[1] : a.re.regex!;
		expect(sampleOf(node, a.sigma, 3)).toEqual({
			ok: true,
			strings: ['', '0', '00'],
			truncated: true
		});
		const b = analyzeExpression(input({ re: 'Σ' }));
		expect(sampleOf(b.re.regex!, b.sigma)).toEqual({ ok: false, reason: 'sigma' });
	});

	it('samples a language whose strings are all long from its shortest length', () => {
		// Lexical Analysis, slide 31: every phone number has 13 symbols.
		const a = analyzeExpression(
			input({
				re: "'(' area ')' exchange '-' phone",
				defs: "digit = '0' | '1' | '2' | … | '9'\narea = digit^3\nexchange = digit^3\nphone = digit^4"
			})
		);
		const s = sampleOf(a.re.regex!, a.sigma);
		if (!s.ok) throw new Error('no sample');
		expect(s.strings).toHaveLength(12);
		expect(s.strings.slice(0, 2)).toEqual(['(000)000-0000', '(000)000-0001']);
		expect(s.truncated).toBe(true);
		const l = listLanguage(minOf(a), 12);
		expect(l).toMatchObject({ strings: [], truncated: true, shortest: '(000)000-0000' });
		expect(l.total).toBe(10_000_000_000n);
	});

	it('lists the shortest string with every listing', () => {
		expect(listLanguage(minOf(analyzeExpression(input({ re: "'1' '0'*" }))), 6).shortest).toBe('1');
		expect(listLanguage(minOf(analyzeExpression(input({ re: 'ɸ' }))), 6).shortest).toBeNull();
	});

	it('explains test strings', () => {
		const a = analyzeExpression(input({ re: '1*0', alphabet: '{ 0, 1 }' }));
		expect(evaluateTest(a, '110')).toMatchObject({ member: true, rejection: null });
		const r = evaluateTest(a, '1x0')!;
		expect(r.member).toBe(false);
		expect(r.outside.chars()).toEqual(['x']);
		expect(r.rejection).toMatchObject({ kind: 'fails', prefixEnd: 1 });
		expect(evaluateTest(analyzeExpression(input({ re: '(' })), 'a')).toBeNull();
	});

	it('compares with R₂', () => {
		const a = analyzeExpression(input({ re: 'a*' }));
		expect(analyzeCompare(a, '  ')).toBeNull();
		const c = analyzeCompare(a, 'a a*')!;
		expect(c.comparison).toMatchObject({ equivalent: false, onlyA: '', onlyB: null });
		expect(analyzeCompare(a, '(')?.comparison).toBeNull();
		expect(messages(analyzeCompare(a, 'Σ')!.r2.diagnostics)).toEqual([
			'R₂ uses Σ, so Σ must be given above'
		]);
	});

	it('parses R₂ without building it', () => {
		const a = analyzeExpression(input({ re: 'a*' }), { build: false });
		expect(parseCompare(a, ' ')).toBeNull();
		expect(parseCompare(a, 'a a*')?.regex?.kind).toBe('concat');
		expect(messages(parseCompare(a, 'Σ')!.diagnostics)).toEqual([
			'R₂ uses Σ, so Σ must be given above'
		]);
	});

	it('does not compare minimal DFAs with too many pairs of states', () => {
		// Strings of a's whose length is a multiple of 50, or of 41: 2050 pairs.
		const a = analyzeExpression(input({ re: "('a'^50)*" }));
		expect(50 * 41).toBeGreaterThan(MAX_PRODUCT);
		expect(analyzeCompare(a, "('a'^41)*")).toMatchObject({ comparison: null, tooLarge: true });
		// 50 × 39 = 1950 pairs are compared.
		expect(analyzeCompare(a, "('a'^39)*")).toMatchObject({
			tooLarge: false,
			comparison: { equivalent: false, onlyA: 'a'.repeat(50), onlyB: 'a'.repeat(39) }
		});
		expect(analyzeCompare(a, "('a'^50)* | ɸ")?.comparison?.equivalent).toBe(true);
	});
});

describe('convertDialect', () => {
	it('rewrites lecture notation as flex and back', () => {
		const lecture = {
			re: 'letter (letter | digit)*',
			defs: "letter = 'a' | 'b'\ndigit = '0' | … | '9'",
			compare: "'if'"
		};
		const flex = convertDialect(lecture, 'lecture', 'flex');
		expect(flex).toEqual({
			re: '{letter}({letter}|{digit})*',
			defs: 'letter  a|b\ndigit   [0-9]',
			compare: '"if"'
		});
		const a = analyzeExpression(input({ ...flex, dialect: 'flex' }));
		expect(a.language?.ok).toBe(true);
		const back = convertDialect(flex, 'flex', 'lecture');
		expect(back.re).toBe('letter (letter | digit)*');
		expect(back.defs).toBe("letter = 'a' | 'b'\ndigit = [0-9]");
		expect(back.compare).toBe("'if'");
	});

	it('keeps parts with errors as typed', () => {
		const text = { re: '(', defs: 'd = 0', compare: '' };
		expect(convertDialect(text, 'lecture', 'flex')).toEqual({
			re: '(',
			defs: 'd  0',
			compare: ''
		});
		const broken = { re: 'd', defs: 'd = (', compare: 'x' };
		expect(convertDialect(broken, 'lecture', 'flex')).toEqual(broken);
		const dashed = { re: '{A-B}', defs: 'A-B x', compare: '' };
		expect(convertDialect(dashed, 'flex', 'lecture')).toEqual(dashed);
		expect(convertDialect(text, 'flex', 'flex')).toBe(text);
	});

	it('writes Σ as the typed alphabet in flex, keeping the language', () => {
		const lecture = { re: 'Σ* 1', defs: 'x = Σ', compare: 'x x' };
		const alphabet = '{ 0, 1 }';
		const flex = convertDialect(lecture, 'lecture', 'flex', alphabet);
		expect(flex).toEqual({ re: '[01]*1', defs: 'x  [01]', compare: '{x}{x}' });
		const before = analyzeExpression(input({ ...lecture, alphabet }));
		const after = analyzeExpression(input({ ...flex, alphabet, dialect: 'flex' }));
		expect(after.alphabetDiagnostics).toEqual([]);
		expect(compareLanguages(minOf(before), minOf(after)).equivalent).toBe(true);
		const [c1, c2] = [analyzeCompare(before, lecture.compare), analyzeCompare(after, flex.compare)];
		const [m1, m2] = [c1?.language, c2?.language];
		if (!m1?.ok || !m2?.ok) throw new Error('R₂ not built');
		expect(compareLanguages(m1.min, m2.min).equivalent).toBe(true);
		// And back: flex has no Σ, so the class stays a class.
		expect(convertDialect(flex, 'flex', 'lecture').re).toBe("[01]* '1'");
	});

	it('keeps parts that use Σ as typed when no valid Σ is typed', () => {
		const text = { re: 'Σ* 1', defs: '', compare: "'01'" };
		expect(convertDialect(text, 'lecture', 'flex')).toEqual({
			re: 'Σ* 1',
			defs: '',
			compare: '"01"'
		});
		expect(convertDialect(text, 'lecture', 'flex', '{ …')).toMatchObject({ re: 'Σ* 1' });
		// A definition that uses Σ keeps every part as typed.
		const withDef = { re: 'x 1', defs: 'x = Σ', compare: '' };
		expect(convertDialect(withDef, 'lecture', 'flex')).toEqual(withDef);
	});
});

describe('helpers', () => {
	it('names definitions that are sets of symbols', () => {
		const d = parseDefs(
			"digit = '0' | … | '9'\nsign = '+' | '-'\nnum = digit+\nkw = 'if'",
			'lecture'
		);
		expect(namedSymbolSets(d).map((n) => [n.name, n.set.chars().join('')])).toEqual([
			['digit', '0123456789'],
			['sign', '+-']
		]);
	});

	it('groups digits the same everywhere', () => {
		expect(groupDigits(0n)).toBe('0');
		expect(groupDigits(3224n)).toBe('3,224');
		expect(groupDigits(183123959522816n)).toBe('183,123,959,522,816');
		expect(groupDigits(999)).toBe('999');
	});

	it('says why a view is not shown', () => {
		expect(structureBlocked('', analyzeExpression(input({})))).toBe('Enter an expression R above.');
		expect(structureBlocked('(', analyzeExpression(input({ re: '(' })))).toMatch(
			/Fix the problems/
		);
		expect(languageBlocked('a', analyzeExpression(input({ re: 'a' })))).toBeNull();
		expect(languageBlocked('Σ', analyzeExpression(input({ re: 'Σ' })))).toBe('Fix Σ first.');
		const big = analyzeExpression(input({ re: '(0 | 1)* 1 (0|1)^10' }));
		expect(languageBlocked(big.re.regex ? 'x' : '', big)).toBe(
			'The DFA for R has more than 300 states, so its language is not computed.'
		);
		expect(sizeMessage({ stage: 'nfa', limit: 10 }, 'R₂')).toMatch(
			/^Thompson's construction for R₂/
		);
	});
});

describe('links', () => {
	it('passes lecture text through to Thompson', () => {
		const i = input({ re: 'digit+', defs: "digit = '0' | '1'" });
		expect(thompsonState(i, analyzeExpression(i))).toEqual({
			re: 'digit+',
			defs: "digit = '0' | '1'"
		});
		const j = input({ re: '(0 | 1)*00' });
		expect(thompsonState(j, analyzeExpression(j))).toEqual({ re: '(0 | 1)*00' });
		expect(thompsonState(input({ re: '(' }), analyzeExpression(input({ re: '(' })))).toBeNull();
	});

	it('prints flex patterns and resolved Σ in lecture notation', () => {
		const f = input({ dialect: 'flex', re: '{L}({L}|{D})*', defs: 'D [0-9]\nL [a-z]' });
		expect(thompsonState(f, analyzeExpression(f))).toEqual({
			re: 'L (L | D)*',
			defs: 'D = [0-9]\nL = [a-z]'
		});
		const s = input({ re: 'Σ* 1', alphabet: '{ 0, 1 }' });
		expect(thompsonState(s, analyzeExpression(s))?.re).toBe("[01]* '1'");
	});

	it('sends the minimal DFA without its trap to Finite Automata', () => {
		const a = analyzeExpression(input({ re: '(1 | 0)*1' }));
		const link = automataState(a, '101');
		expect(link?.input).toBe('101');
		const parsed = parseAutomatonText(link!.text).automaton!;
		expect(parsed.states).toHaveLength(2);
		expect(runDfa(parsed, '101').accepted).toBe(true);
		expect(automataState(analyzeExpression(input({ re: '(' })))).toBeNull();
	});

	it('lists symbols for messages', () => {
		expect(listSymbols(CharSet.of(' \t'))).toBe("'\\t', ' '");
		expect(listSymbols(CharSet.of('abcdef'))).toBe("'a', 'b', 'c', 'd' and 2 more");
		expect(printRegex(analyzeExpression(input({ re: 'a' })).resolved!)).toBe("'a'");
	});
});
