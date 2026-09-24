import { describe, expect, it } from 'vitest';
import { exprText, MAX_NESTING, parse, type Expr, type Program, type Stmt } from './parser';
import { scan } from './scanner';

function program(source: string): Program {
	const out = parse(scan(source).tokens, source.length);
	expect(out.diagnostics).toEqual([]);
	return out.program!;
}

function errorOf(source: string) {
	const out = parse(scan(source).tokens, source.length);
	expect(out.program).toBeNull();
	expect(out.diagnostics).toHaveLength(1);
	return out.diagnostics[0];
}

/** Prefix form: `=(A, +(B1, C))`. */
function show(e: Expr | Stmt): string {
	switch (e.kind) {
		case 'id':
			return e.name;
		case 'num':
			return e.text;
		case 'bin':
			return `${e.op}(${show(e.left)}, ${show(e.right)})`;
		case 'assign':
			return `=(${e.target.name}, ${show(e.value)})`;
		case 'if':
			return `if(${e.cond.op}(${show(e.cond.left)}, ${show(e.cond.right)}), ${show(e.then)}${e.else ? `, ${show(e.else)}` : ''})`;
	}
}

describe('parse', () => {
	it('builds the tree of Intro (cont’d), slide 4', () => {
		const p = program('A= B1   +C;');
		expect(p.stmts.map(show)).toEqual(['=(A, +(B1, C))']);
		expect(p.stmts[0].span).toEqual({ start: 0, end: 11, source: null });
	});

	it('parses the if statement of the structure slides', () => {
		const p = program('if x==y then z  =1; else z= 2  ;');
		expect(p.stmts.map(show)).toEqual(['if(==(x, y), =(z, 1), =(z, 2))']);
	});

	it('gives * and / precedence over + and -, all left-associative', () => {
		expect(show(program('a = b + c * d;').stmts[0])).toBe('=(a, +(b, *(c, d)))');
		expect(show(program('a = b - c - d;').stmts[0])).toBe('=(a, -(-(b, c), d))');
		expect(show(program('a = b / c * d;').stmts[0])).toBe('=(a, *(/(b, c), d))');
		expect(show(program('a = (b + c) * d;').stmts[0])).toBe('=(a, *(+(b, c), d))');
	});

	it('records parentheses on the expression they enclose', () => {
		const s = program('a = ((b)) + c;').stmts[0];
		if (s.kind !== 'assign' || s.value.kind !== 'bin') throw new Error('shape');
		expect(s.value.left.parens).toBe(2);
		expect(s.value.left.span).toEqual({ start: 4, end: 9, source: null });
	});

	it('attaches else to the nearest if and allows no else', () => {
		expect(show(program('if a < b then if b < c then m = c; else m = b;').stmts[0])).toBe(
			'if(<(a, b), if(<(b, c), =(m, c), =(m, b)))'
		);
		expect(show(program('if n > 0 then n = n - 1;').stmts[0])).toBe('if(>(n, 0), =(n, -(n, 1)))');
	});

	it('parses several statements and the empty program', () => {
		expect(program('a = 1; b = a;').stmts).toHaveLength(2);
		expect(program('   ').stmts).toEqual([]);
	});

	it('reports the first syntax error with its location', () => {
		let d = errorOf('A = B1 + C');
		expect(d.message).toBe(
			"Expected ';' at the end of the assignment, found the end of the input."
		);
		expect(d.span).toEqual({ start: 10, end: 10, source: null });

		d = errorOf('A = + C;');
		expect(d.message).toContain("found '+'");
		expect(d.span).toEqual({ start: 4, end: 5, source: null });

		expect(errorOf('if x then y = 1;').message).toContain('comparison');
		expect(errorOf('if x == y z = 1;').message).toContain("Expected 'then'");
		expect(errorOf('A B;').message).toContain("Expected '='");
		expect(errorOf('+ A;').message).toContain('A statement starts with');
		expect(errorOf('a = (b + c;').message).toContain("Expected ')'");
	});

	it('limits nesting depth', () => {
		const deep = `a = ${'('.repeat(MAX_NESTING + 1)}b${')'.repeat(MAX_NESTING + 1)};`;
		expect(errorOf(deep).message).toContain('Nested');
		const ok = `a = ${'('.repeat(MAX_NESTING)}b${')'.repeat(MAX_NESTING)};`;
		expect(program(ok).stmts).toHaveLength(1);
	});
});

describe('exprText', () => {
	it('prints the parentheses the tree needs', () => {
		const text = (s: string) => {
			const st = program(`x = ${s};`).stmts[0];
			if (st.kind !== 'assign') throw new Error('shape');
			return exprText(st.value);
		};
		expect(text('B1   +C')).toBe('B1 + C');
		expect(text('(a * b) + c')).toBe('a * b + c');
		expect(text('a - (b - c)')).toBe('a - (b - c)');
		expect(text('(a + b) * c')).toBe('(a + b) * c');
	});
});
