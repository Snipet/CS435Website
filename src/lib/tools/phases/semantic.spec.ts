import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { scan } from './scanner';
import { MAX_TEXT } from './parser';
import {
	analyze,
	checkDeclarations,
	formatConstant,
	type Decl,
	type TExpr,
	type TStmt
} from './semantic';
import { annotatedForest, treeText } from './trees';
import { SLIDE_4_DECLS } from './presets';

function run(source: string, decls: readonly Decl[] = SLIDE_4_DECLS) {
	const { program } = parse(scan(source).tokens, source.length);
	if (!program) throw new Error('syntax error');
	return analyze(program, checkDeclarations(decls).table);
}

function show(e: TExpr | TStmt): string {
	switch (e.kind) {
		case 'id':
			return `${e.name}:${e.type ?? '?'}`;
		case 'num':
			return `${e.text}:${e.type}`;
		case 'int2fp':
			return `int2fp(${show(e.arg)})`;
		case 'bin':
			return `${e.op}:${e.type ?? '?'}(${show(e.left)}, ${show(e.right)})`;
		case 'assign':
			return `=(${e.target.name}:${e.target.type ?? '?'}, ${show(e.value)})`;
		case 'if':
			return `if(${e.cond.op}:${e.cond.operandType ?? '?'}(${show(e.cond.left)}, ${show(e.cond.right)}), ${show(e.then)}${e.else ? `, ${show(e.else)}` : ''})`;
	}
}

describe('checkDeclarations', () => {
	it('builds the table of the slide’s assumptions', () => {
		const c = checkDeclarations(SLIDE_4_DECLS);
		expect(c.hasErrors).toBe(false);
		expect([...c.table.values()]).toEqual([
			{ name: 'A', type: 'float', constant: null },
			{ name: 'B1', type: 'int', constant: null },
			{ name: 'C', type: 'float', constant: 2.3 }
		]);
	});

	it('reports bad names, duplicates, reserved names, and bad values per row', () => {
		const c = checkDeclarations([
			{ name: '1x', type: 'int', value: '' },
			{ name: 'if', type: 'int', value: '' },
			{ name: 'a', type: 'int', value: '2.5' },
			{ name: 'a', type: 'float', value: '' },
			{ name: 'f', type: 'float', value: 'abc' },
			{ name: 't1', type: 'int', value: '' },
			{ name: 'r2', type: 'int', value: '' },
			{ name: '', type: 'int', value: '' },
			{ name: ' g ', type: 'float', value: ' -2 ' }
		]);
		expect(c.hasErrors).toBe(true);
		expect(c.problems[0].name).toBeDefined();
		expect(c.problems[1].name).toContain('keyword');
		expect(c.problems[2].value).toContain('whole number');
		expect(c.problems[3].name).toContain('already declared');
		expect(c.problems[4].value).toBe('Not a number');
		expect(c.problems[5].name).toContain('temporaries');
		expect(c.problems[6].name).toContain('registers');
		expect(c.problems[7]).toEqual({});
		expect(c.problems[8]).toEqual({});
		expect(c.table.get('g')).toEqual({ name: 'g', type: 'float', constant: -2 });
		expect(c.table.get('a')?.type).toBe('int');
	});

	it('keeps int constants within 32 bits and float constants finite', () => {
		const c = checkDeclarations([
			{ name: 'a', type: 'int', value: '2147483647' },
			{ name: 'b', type: 'int', value: '-2147483648' },
			{ name: 'c', type: 'int', value: '2147483648' },
			{ name: 'd', type: 'int', value: '99999999999999999999' },
			{ name: 'e', type: 'float', value: '1000000000000000000000' },
			{ name: 'f', type: 'float', value: `1${'0'.repeat(400)}` }
		]);
		expect(c.problems.map((p) => p.value ?? null)).toEqual([
			null,
			null,
			'Out of range for an int (32 bits)',
			'Out of range for an int (32 bits)',
			null,
			'Too large for a float'
		]);
		expect(c.table.get('b')?.constant).toBe(-2147483648);
		expect(c.table.get('c')?.constant).toBeNull();
	});
});

describe('analyze', () => {
	it('annotates the slide’s tree and inserts int2fp for B1', () => {
		const out = run('A= B1   +C;');
		expect(out.diagnostics).toEqual([]);
		expect(out.stmts.map(show)).toEqual(['=(A:float, +:float(int2fp(B1:int), C:float))']);
		expect(out.checks.map((c) => c.text)).toEqual([
			'A is declared: float.',
			'B1 is declared: int.',
			'C is declared: float constant 2.3.',
			'B1 + C: int + float gives float; B1 is converted with int2fp.',
			'A = …: a float value assigned to float A.'
		]);
		expect(out.conversions).toEqual(['B1 is int in the float operation B1 + C']);
	});

	it('words the int assignment check with "an"', () => {
		const out = run('B1 = 2;');
		expect(out.checks.at(-1)?.text).toBe('B1 = …: an int value assigned to int B1.');
	});

	it('needs no conversion when B1 is float', () => {
		const decls: Decl[] = SLIDE_4_DECLS.map((d) => (d.name === 'B1' ? { ...d, type: 'float' } : d));
		const out = run('A= B1   +C;', decls);
		expect(out.stmts.map(show)).toEqual(['=(A:float, +:float(B1:float, C:float))']);
		expect(out.conversions).toEqual([]);
	});

	it('converts an int value assigned to a float variable', () => {
		expect(run('A = B1;').stmts.map(show)).toEqual(['=(A:float, int2fp(B1:int))']);
		expect(run('A = 1 + 2;').stmts.map(show)).toEqual(['=(A:float, int2fp(+:int(1:int, 2:int)))']);
	});

	it('types comparisons and converts mixed ones', () => {
		expect(run('if B1 < C then A = C;').stmts.map(show)).toEqual([
			'if(<:float(int2fp(B1:int), C:float), =(A:float, C:float))'
		]);
	});

	it('reports undeclared identifiers once each', () => {
		const out = run('A = D + D;');
		expect(out.diagnostics.map((d) => d.message)).toEqual(['D is not declared.']);
		expect(out.diagnostics[0].span).toEqual({ start: 4, end: 5, source: null });
		expect(out.stmts.map(show)).toEqual(['=(A:float, +:?(D:?, D:?))']);
	});

	it('rejects a float value assigned to an int variable', () => {
		const out = run('B1 = A + C;');
		expect(out.diagnostics.map((d) => d.message)).toEqual([
			'A float value cannot be assigned to B1, which is int.'
		]);
		const s = out.stmts[0];
		expect(s.kind === 'assign' && s.error).toBe('float assigned to int');
	});

	it('reports a reserved name used in the program as reserved, not as undeclared', () => {
		const out = run('A = t1 + C; L1 = r1;');
		expect(out.diagnostics.map((d) => d.message)).toEqual([
			't1 is reserved for temporaries; use another name.',
			'L1 is reserved for labels; use another name.',
			'r1 is reserved for registers; use another name.'
		]);
		const [first, second] = annotatedForest(out.stmts).map(treeText);
		expect(first).toBe('= [float] (A [float], + (t1 [reserved], C [float const]))');
		expect(second).toBe('= (L1 [reserved], r1 [reserved])');
	});

	it('rejects an int literal that does not fit in 32 bits', () => {
		expect(run('B1 = 2147483647;').diagnostics).toEqual([]);
		const out = run('B1 = 1 + 99999999999999999999;');
		expect(out.diagnostics.map((d) => d.message)).toEqual([
			'99999999999999999999 is out of range for an int (32 bits).'
		]);
		expect(out.diagnostics[0].span).toEqual({ start: 9, end: 29, source: null });
		expect(treeText(annotatedForest(out.stmts)[0])).toContain(
			'99999999999999999999 [out of range]'
		);
		// Float literals have no such limit here.
		expect(run('A = 99999999999999999999.0;').diagnostics).toEqual([]);
	});

	it('keeps the text of long expressions short, in linear time', () => {
		const decls: Decl[] = [
			{ name: 'F', type: 'float', value: '' },
			{ name: 'G', type: 'float', value: '' },
			{ name: 'a', type: 'int', value: '' }
		];
		const source = `F = G${'+a'.repeat(1990)};`;
		const out = run(source, decls);
		expect(out.diagnostics).toEqual([]);
		expect(out.conversions).toHaveLength(1990);
		// Three declarations, one check per operation, and the assignment.
		expect(out.checks).toHaveLength(3 + 1990 + 1);
		for (const text of [...out.checks.map((c) => c.text), ...out.conversions])
			expect(text.length).toBeLessThanOrEqual(2 * MAX_TEXT + 80);
		expect(out.checks[3].text).toBe('G + a: float + int gives float; a is converted with int2fp.');
		expect(out.checks.at(-2)?.text).toMatch(
			/^G \+ a \+ a .*…: float \+ int gives float; a is converted/
		);
	});

	it('rejects an assignment to a constant', () => {
		const out = run('C = A;');
		expect(out.diagnostics.map((d) => d.message)).toEqual([
			'C is a constant; it cannot be assigned.'
		]);
	});
});

describe('formatConstant', () => {
	it('keeps a decimal point on floats', () => {
		expect(formatConstant(2.3, 'float')).toBe('2.3');
		expect(formatConstant(2, 'float')).toBe('2.0');
		expect(formatConstant(2.3 + 1, 'float')).toBe('3.3');
		expect(formatConstant(0.1 + 0.2, 'float')).toBe('0.3');
		expect(formatConstant(7, 'int')).toBe('7');
	});

	it('writes floats without an exponent, as the source’s literals are written', () => {
		expect(formatConstant(1e21, 'float')).toBe('1000000000000000000000.0');
		expect(formatConstant(1.5e-7, 'float')).toBe('0.00000015');
		expect(formatConstant(-2.5e22, 'float')).toBe('-25000000000000000000000.0');
		expect(formatConstant(1e-7, 'float')).toBe('0.0000001');
	});
});
