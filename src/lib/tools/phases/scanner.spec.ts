import { describe, expect, it } from 'vitest';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { scan as scanRules, type TokenRule } from '$lib/theory/automata';
import { lexerRules, scan, tokenName, type TokenNaming } from './scanner';
import { PRESETS } from './presets';

const pairs = (source: string, naming: TokenNaming = 'seven') =>
	scan(source).tokens.map((t) => `<${tokenName(t.kind, naming)},'${t.lexeme}'>`);

describe('scan', () => {
	it('reproduces the scanner row of Intro (cont’d), slide 4', () => {
		const out = scan('A= B1   +C;');
		expect(out.diagnostics).toEqual([]);
		expect(pairs('A= B1   +C;').join(', ')).toBe(
			"<ID,'A'>, <ASSIGN,'='>, <ID,'B1'>, <PLUS,'+'>, <ID,'C'>, <SEMI,';'>"
		);
		expect(out.tokens.map((t) => [t.start, t.end])).toEqual([
			[0, 1],
			[1, 2],
			[3, 5],
			[8, 9],
			[9, 10],
			[10, 11]
		]);
	});

	it('reproduces the lexemes and tokens of the structure slides (slide 5)', () => {
		const out = scan('if x==y then z  =1; else z= 2  ;');
		expect(out.tokens.map((t) => t.lexeme).join(', ')).toBe(
			'if, x, ==, y, then, z, =, 1, ;, else, z, =, 2, ;'
		);
		expect(out.tokens.map((t) => tokenName(t.kind, 'five')).join(', ')).toBe(
			'IF, ID, EQ, ID, THEN, ID, ASSIGN, ILIT, SEMI, ELSE, ID, ASSIGN, ILIT, SEMI'
		);
	});

	it('uses NUM and FNUM in the seven-phase naming', () => {
		expect(pairs('x = 12 + 2.5;')).toEqual([
			"<ID,'x'>",
			"<ASSIGN,'='>",
			"<NUM,'12'>",
			"<PLUS,'+'>",
			"<FNUM,'2.5'>",
			"<SEMI,';'>"
		]);
		expect(tokenName('FNUM', 'five')).toBe('FLIT');
	});

	it('takes the longest operator and tells keywords from identifiers', () => {
		const kinds = (s: string) => scan(s).tokens.map((t) => t.kind);
		expect(kinds('a<=b>=c<d>e==f!=g=h')).toEqual([
			'ID',
			'LE',
			'ID',
			'GE',
			'ID',
			'LT',
			'ID',
			'GT',
			'ID',
			'EQ',
			'ID',
			'NE',
			'ID',
			'ASSIGN',
			'ID'
		]);
		expect(kinds('if iffy then then1 else')).toEqual(['IF', 'ID', 'THEN', 'ID', 'ELSE']);
		expect(kinds('IF')).toEqual(['ID']);
		expect(kinds('(a-b)*c/d')).toEqual([
			'LPAREN',
			'ID',
			'MINUS',
			'ID',
			'RPAREN',
			'TIMES',
			'ID',
			'OVER',
			'ID'
		]);
	});

	it('reads "2." as a number followed by an unexpected dot', () => {
		const out = scan('x = 2.;');
		expect(out.tokens.map((t) => t.lexeme)).toEqual(['x', '=', '2', ';']);
		expect(out.diagnostics).toHaveLength(1);
		expect(out.diagnostics[0].span).toEqual({ start: 5, end: 6, source: null });
	});

	it('reports a run of unknown characters once and keeps scanning', () => {
		const out = scan('a = b @# c;');
		expect(out.tokens.map((t) => t.lexeme)).toEqual(['a', '=', 'b', 'c', ';']);
		expect(out.diagnostics).toHaveLength(1);
		expect(out.diagnostics[0].severity).toBe('error');
		expect(out.diagnostics[0].message).toContain("'@#'");
		expect(out.diagnostics[0].span).toEqual({ start: 6, end: 8, source: null });
	});

	it('explains a lone !', () => {
		expect(scan('a ! b').diagnostics[0].message).toContain('!=');
	});

	it('keeps a surrogate pair together', () => {
		const out = scan('a 😀 b');
		expect(out.diagnostics[0].span).toEqual({ start: 2, end: 4, source: null });
	});
});

describe('lexerRules', () => {
	function rules(naming: TokenNaming): TokenRule[] {
		const { defs, rules } = lexerRules(naming);
		const d = parseDefinitions(defs);
		expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
		return rules.map((r) => {
			const parsed = parseRegex(r.re, { defs: d.defs });
			if (!parsed.ok) throw new Error(`${r.name}: ${parsed.diagnostics[0]?.message}`);
			expect(parsed.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
			return { name: r.name, regex: parsed.regex, skip: r.drop };
		});
	}

	it.each(['seven', 'five'] as const)('scan the presets like the scanner (%s)', (naming) => {
		const compiled = rules(naming);
		for (const p of PRESETS) {
			const engine = scanRules(compiled, p.value.source)
				.tokens.filter((t) => !t.skipped)
				.map((t) => `${t.name} ${t.lexeme}`);
			const mine = scan(p.value.source).tokens.map(
				(t) => `${tokenName(t.kind, naming)} ${t.lexeme}`
			);
			expect(engine).toEqual(mine);
		}
	});

	it('names the literal tokens per view', () => {
		expect(lexerRules('five').rules.map((r) => r.name)).toContain('ILIT');
		expect(lexerRules('seven').rules.map((r) => r.name)).toContain('NUM');
	});
});
