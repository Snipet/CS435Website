import { describe, expect, it } from 'vitest';
import { formatTokenPair } from '$lib/components/ui/token-format';
import { DEFAULT_PRESET_ID, presetById, presets } from './presets';
import { runScan } from './scan';
import { buildSpec } from './spec';
import { stripDropped } from './strip';
import { isLexerHash, normalizeState } from './state';

function scanPreset(id: string, overrides: { input?: string; errorRule?: boolean } = {}) {
	const p = presetById(id);
	if (!p) throw new Error(`no preset ${id}`);
	const spec = buildSpec(p.value.defs ?? '', p.value.rules);
	const run = runScan(
		spec,
		overrides.input ?? p.value.input,
		overrides.errorRule ?? p.value.errorRule ?? false
	);
	return { p, spec, run };
}

/** Reported tokens in the preset's format. */
function pairs(id: string, overrides: { input?: string; errorRule?: boolean } = {}) {
	const { p, run } = scanPreset(id, overrides);
	return run.tokens
		.filter((t) => !t.skipped)
		.map((t) => formatTokenPair(t, p.value.format ?? 'paren'));
}

describe('presets', () => {
	it('have unique ids, a citation, and a default', () => {
		const ids = presets.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(presets.every((p) => p.cite !== undefined)).toBe(true);
		expect(presetById(DEFAULT_PRESET_ID)).toBeDefined();
	});

	it.each(presets.map((p) => [p.id, p] as const))(
		'%s parses without errors and scans to the end',
		(_, p) => {
			const spec = buildSpec(p.value.defs ?? '', p.value.rules);
			expect(spec.defs.diagnostics).toEqual([]);
			for (const r of spec.rules) {
				expect(r.diagnostics, r.name).toEqual([]);
				expect(r.problem, r.name).toBeNull();
				expect(r.nameError, r.name).toBeNull();
				expect(r.nameWarning, r.name).toBeNull();
			}
			expect(spec.ok).toBe(true);
			const run = runScan(spec, p.value.input, p.value.errorRule ?? false);
			if (p.id !== 'equals-56') expect(run.stuck).toBeNull();
			// Presets are valid hash states.
			expect(isLexerHash(p.value)).toBe(true);
			expect(normalizeState(p.value).rules).toHaveLength(p.value.rules.length);
		}
	);
});

describe('Lexical Analysis II', () => {
	it('slide 7: f+3  +g', () => {
		expect(pairs('f-plus-3')).toEqual([
			'(Identifier, "f")',
			'(Plus, "+")',
			'(Integer, "3")',
			'(Whitespace, "  ")',
			'(Plus, "+")',
			'(Identifier, "g")'
		]);
	});

	it('slide 8: Whitespace dropped', () => {
		expect(pairs('drop-whitespace')).toEqual([
			'(Identifier, "f")',
			'(Plus, "+")',
			'(Integer, "3")',
			'(Plus, "+")',
			'(Identifier, "g")'
		]);
	});

	it('slides 9–10: foo+3 uses "foo"; "foo+" matches no rule', () => {
		const { run } = scanPreset('foo-plus-3');
		const first = run.steps[0];
		expect(first.maxLen).toBe(4);
		expect(first.matches[2]).toEqual([true, true, true, false]);
		expect(first.length).toBe(3);
		expect(pairs('foo-plus-3')).toEqual(['(Identifier, "foo")', '(Plus, "+")', '(Integer, "3")']);
	});

	it("slide 11: 'new' is listed before Identifier; newer is an Identifier", () => {
		const { run } = scanPreset('new-foo');
		expect(run.steps[0].matches[1][2]).toBe(true);
		expect(run.steps[0].matches[3][2]).toBe(true);
		expect(run.steps[0].rule).toBe(1);
		expect(pairs('new-foo')).toEqual(['(New, "new")', '(Identifier, "foo")']);
		expect(pairs('new-foo', { input: 'newer foo' })).toEqual([
			'(Identifier, "newer")',
			'(Identifier, "foo")'
		]);
	});

	it('slide 12: =56 is stuck, then scanned with the Error rule', () => {
		const { run } = scanPreset('equals-56');
		expect(run.stuck).toBe(0);
		expect(run.tokens).toEqual([]);
		expect(pairs('equals-56', { errorRule: true })).toEqual(['(Error, "=")', '(Integer, "56")']);
	});

	it('slide 4: Keyword wins ties with Identifier, longer identifiers win', () => {
		expect(pairs('lexical-spec')).toEqual([
			'(Keyword, "if")',
			'(OpenPar, "(")',
			'(Identifier, "iffy")',
			'(OpenPar, "(")',
			'(Number, "42")'
		]);
	});
});

describe('token–lexeme pairs', () => {
	it('Lexical Analysis slide 11 starts with the five pairs on the slide', () => {
		expect(pairs('if-i-j')).toEqual([
			'(Keyword, "if")',
			'(OpenPar, "(")',
			'(Identifier, "i")',
			'(Relation, "==")',
			'(Identifier, "j")',
			'(ClosePar, ")")',
			'(Identifier, "z")',
			'(Assign, "=")',
			'(Integer, "0")',
			'(Semicolon, ";")',
			'(Keyword, "else")',
			'(Identifier, "z")',
			'(Assign, "=")',
			'(Integer, "1")',
			'(Semicolon, ";")'
		]);
	});

	it('Intro slide 5 (compiler structure): IF, ID, EQ, …', () => {
		const { run } = scanPreset('if-x-y');
		const reported = run.tokens.filter((t) => !t.skipped);
		expect(reported.map((t) => t.lexeme)).toEqual(
			['if', 'x', '==', 'y', 'then', 'z', '=', '1', ';', 'else', 'z', '=', '2', ';'].map(String)
		);
		expect(reported.map((t) => t.name)).toEqual([
			'IF',
			'ID',
			'EQ',
			'ID',
			'THEN',
			'ID',
			'ASSIGN',
			'ILIT',
			'SEMI',
			'ELSE',
			'ID',
			'ASSIGN',
			'ILIT',
			'SEMI'
		]);
	});

	it("Intro slide 4 (compiler architecture): <ID,'A'>, …", () => {
		expect(pairs('a-b1-c').join(', ')).toBe(
			"<ID,'A'>, <ASSIGN,'='>, <ID,'B1'>, <PLUS,'+'>, <ID,'C'>, <SEMI,';'>"
		);
	});

	it('TINY: reserved words before ID, comments dropped', () => {
		const got = pairs('tiny');
		expect(got.slice(0, 7)).toEqual([
			"<READ,'read'>",
			"<ID,'x'>",
			"<SEMI,';'>",
			"<IF,'if'>",
			"<NUM,'0'>",
			"<LT,'<'>",
			"<ID,'x'>"
		]);
		expect(got).toContain("<ASSIGN,':='>");
		expect(got).toContain("<TIMES,'*'>");
		expect(got).toContain("<UNTIL,'until'>");
		expect(got.at(-1)).toBe("<END,'end'>");
		const { run } = scanPreset('tiny');
		expect(run.tokens[0]).toMatchObject({
			name: 'COMMENT',
			lexeme: '{ factorial }',
			skipped: true
		});
	});
});

describe('Lexical Analysis: lookahead and whitespace', () => {
	it('slide 12: stripping first fuses int, a and 2', () => {
		const { spec, run } = scanPreset('strip-comment');
		expect(pairs('strip-comment')).toEqual([
			'(Keyword, "int")',
			'(Identifier, "a")',
			'(Integer, "2")',
			'(Assign, "=")',
			'(Integer, "3")',
			'(Semicolon, ";")'
		]);
		const stripped = stripDropped(run);
		expect(stripped.text).toBe('inta2=3;');
		const again = runScan(spec, stripped.text, false);
		expect(again.tokens.map((t) => formatTokenPair(t, 'paren'))).toEqual([
			'(Identifier, "inta2")',
			'(Assign, "=")',
			'(Integer, "3")',
			'(Semicolon, ";")'
		]);
	});

	it('slide 13: i if iffy and = == ===', () => {
		expect(pairs('lookahead-iffy')).toEqual(['(ID, "i")', '(IF, "if")', '(IFFY, "iffy")']);
		expect(pairs('lookahead-eq')).toEqual(['(ASSIGN, "=")', '(EQ2, "==")', '(EQ3, "===")']);
	});

	it('slide 16: >> is one token', () => {
		expect(pairs('templates')).toEqual([
			'(ID, "vector")',
			'(LT, "<")',
			'(ID, "queue")',
			'(LT, "<")',
			'(ID, "int")',
			'(SHR, ">>")'
		]);
		expect(pairs('templates', { input: 'vector<queue<int> >' }).slice(-2)).toEqual([
			'(GT, ">")',
			'(GT, ">")'
		]);
	});

	it('Intro slide 28 (history): DO 15 I = 1.100 reads as DO15I=1.100 once spaces go', () => {
		const { spec, run } = scanPreset('fortran-do');
		expect(pairs('fortran-do')).toEqual([
			'(DO, "DO")',
			'(INT, "15")',
			'(ID, "I")',
			'(ASSIGN, "=")',
			'(REAL, "1.100")'
		]);
		const stripped = stripDropped(run);
		expect(stripped.text).toBe('DO15I=1.100');
		expect(runScan(spec, stripped.text, false).tokens.map((t) => t.name)).toEqual([
			'ID',
			'ASSIGN',
			'REAL'
		]);
	});
});
