import { describe, expect, it } from 'vitest';
import { analyze } from './semantic';
import {
	DEFAULT_CALL_DEPTH,
	DEFAULT_INTERPRETER_STEPS,
	interpret,
	type InterpretOptions,
	type InterpretResult
} from './interpret';
import { parseSource } from './parser';

function run(
	source: string,
	inputs: number[] = [],
	options?: InterpretOptions
): InterpretResult & { source: string } {
	const parsed = parseSource(source);
	expect(parsed.diagnostics).toEqual([]);
	const semantic = analyze(parsed.program);
	expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return { ...interpret(parsed.program, semantic, inputs, options), source };
}

const inMain = (body: string) => `void main(void) { ${body} }`;
const outputs = (body: string, inputs: number[] = []) => {
	const r = run(inMain(body), inputs);
	expect(r.stop).toBe('halted');
	return r.outputs;
};
/** The source text at which a run stopped. */
const where = (r: InterpretResult & { source: string }) =>
	r.span ? r.source.slice(r.span.start, r.span.end) : null;

describe('expressions', () => {
	it('integer arithmetic; / truncates toward zero', () => {
		expect(
			outputs('output(2 + 3 * 4); output((2 + 3) * 4); output(7 / 2); output((0 - 7) / 2);')
		).toEqual([14, 20, 3, -3]);
		expect(outputs('output(10 - 4 - 3); output(100 / 10 / 5); output(2 * 3 / 4);')).toEqual([
			3, 2, 1
		]);
	});

	it('wraps around at 32 bits', () => {
		expect(
			outputs('output(2147483647 + 1); output(65536 * 65536); output(0 - 2147483647 - 2);')
		).toEqual([-2147483648, 0, 2147483647]);
	});

	it('relational operators give 1 or 0', () => {
		expect(
			outputs('output(1 < 2); output(2 < 1); output(2 <= 2); output(3 > 3); output(3 >= 3);')
		).toEqual([1, 0, 1, 0, 1]);
		expect(outputs('output(4 == 4); output(4 != 4); output((1 < 2) + (2 < 3));')).toEqual([
			1, 0, 2
		]);
		expect(
			outputs('output(2147483647 > 0 - 2147483647); output(0 - 2147483647 < 2147483647);')
		).toEqual([1, 1]);
	});

	it('an assignment has the value assigned', () => {
		expect(outputs('int x; int y; x = y = 4; output(x + y); output(x = 9); output(x);')).toEqual([
			8, 9, 9
		]);
	});

	it('evaluates operands and arguments left to right', () => {
		expect(outputs('output(input() - input());', [10, 4])).toEqual([6]);
		expect(outputs('int x; x = 1; output(x + (x = 5)); output((x = 7) + x);')).toEqual([6, 14]);
		expect(
			run(
				'int f(int a, int b, int c) { return a * 100 + b * 10 + c; } void main(void) { output(f(input(), input(), input())); }',
				[1, 2, 3]
			).outputs
		).toEqual([123]);
	});
});

describe('statements', () => {
	it('if and while test for non-zero', () => {
		expect(
			outputs('if (5) output(1); if (0) output(2); else output(3); if (0 - 1) output(4);')
		).toEqual([1, 3, 4]);
		expect(outputs('int n; n = 3; while (n) { output(n); n = n - 1; }')).toEqual([3, 2, 1]);
	});

	it('an else belongs to the nearest if', () => {
		expect(outputs('if (1) if (0) output(1); else output(2);')).toEqual([2]);
		expect(outputs('if (0) if (1) output(1); else output(2); output(3);')).toEqual([3]);
	});

	it('return leaves the function from inside loops and blocks', () => {
		const source = `int first(int a[], int n) { int i; i = 0; while (i < n) { if (a[i] > 10) { return i; } i = i + 1; } return 0 - 1; }
int v[4];
void main(void) { v[0] = 1; v[1] = 5; v[2] = 50; v[3] = 500; output(first(v, 4)); output(first(v, 2)); }`;
		expect(run(source).outputs).toEqual([2, -1]);
	});

	it('a void function returns with return; or at its end', () => {
		const source =
			'void p(int n) { if (n < 0) return; output(n); } void main(void) { p(1); p(0 - 1); p(2); return; output(9); }';
		expect(run(source).outputs).toEqual([1, 2]);
	});
});

describe('variables', () => {
	it('globals and locals start at 0', () => {
		expect(
			run('int g; int a[2]; void main(void) { int x; int b[2]; output(g + a[1] + x + b[0]); }')
				.outputs
		).toEqual([0]);
	});

	it('a block hides outer variables of the same name', () => {
		expect(
			outputs('int x; x = 1; { int x; x = 2; { int x; x = 3; output(x); } output(x); } output(x);')
		).toEqual([3, 2, 1]);
	});

	it('every call has its own parameters and locals', () => {
		const source = `int f(int n) { int mine; mine = n; if (n > 0) f(n - 1); return mine; }
void main(void) { output(f(3)); }`;
		expect(run(source).outputs).toEqual([3]);
	});

	it('an int parameter is a copy; an array parameter is the array itself', () => {
		const source = `void change(int n, int a[]) { n = 99; a[0] = 99; }
int g[2];
void main(void) { int x; int loc[2]; x = 1; g[0] = 1; loc[0] = 1; change(x, g); change(x, loc); output(x); output(g[0]); output(loc[0]); }`;
		expect(run(source).outputs).toEqual([1, 99, 99]);
	});

	it('an int function that reaches its end gives 0', () => {
		const r = run(
			'int f(int n) { if (n) return 5; } void main(void) { output(f(1)); output(f(0)); }'
		);
		expect(r.outputs).toEqual([5, 0]);
		// Not the value an inner call returned.
		const nested = run(
			'int seven(void) { return 7; } int f(void) { seven(); } void main(void) { output(f()); }'
		);
		expect(nested.outputs).toEqual([0]);
	});
});

describe('how a run ends', () => {
	it('halted: main returned', () => {
		const r = run(inMain('output(1);'));
		expect(r).toMatchObject({ stop: 'halted', outputs: [1], node: null, span: null });
		expect(r.steps).toBeGreaterThan(0);
	});

	it('input-exhausted, at the call of input', () => {
		const r = run(inMain('output(input()); output(input() + 1);'), [5]);
		expect(r).toMatchObject({ stop: 'input-exhausted', outputs: [5] });
		expect(where(r)).toBe('input()');
		expect(r.span).toMatchObject({ line: 1 });
	});

	it('zero-divide, at the division', () => {
		const r = run(inMain('int z; z = 0; output(1); output(8 / z); output(2);'));
		expect(r).toMatchObject({ stop: 'zero-divide', outputs: [1] });
		expect(where(r)).toBe('8 / z');
		expect(run(inMain('output(0 / 5);')).outputs).toEqual([0]);
	});

	it('negative-subscript, on a read and on a write', () => {
		const read = run('int a[3]; void main(void) { output(1); output(a[0 - 1]); }');
		expect(read).toMatchObject({ stop: 'negative-subscript', outputs: [1] });
		expect(where(read)).toBe('a[0 - 1]');
		const write = run('void main(void) { int a[3]; int i; i = 0 - 2; a[i] = 4; output(1); }');
		expect(write).toMatchObject({ stop: 'negative-subscript', outputs: [] });
		expect(where(write)).toBe('a[i]');
	});

	it('the value of an assignment to an element is computed before the subscript is tested', () => {
		const r = run('int a[2]; void main(void) { a[0 - 1] = input(); }', []);
		expect(r.stop).toBe('input-exhausted');
	});

	it('subscript-out-of-range: the interpreter also checks the upper bound', () => {
		const r = run('int a[3]; void main(void) { a[2] = 1; output(a[2]); output(a[3]); }');
		expect(r).toMatchObject({ stop: 'subscript-out-of-range', outputs: [1] });
		expect(where(r)).toBe('a[3]');
		const viaParameter = run(
			'void f(int v[]) { v[5] = 1; } void main(void) { int a[5]; f(a); output(1); }'
		);
		expect(viaParameter.stop).toBe('subscript-out-of-range');
		expect(where(viaParameter)).toBe('v[5]');
	});

	it('step-budget', () => {
		const r = run(inMain('int n; while (1) { n = n + 1; output(n); }'), [], { maxSteps: 500 });
		expect(r.stop).toBe('step-budget');
		expect(r.steps).toBe(500);
		expect(r.outputs.length).toBeGreaterThan(20);
		expect(r.node).not.toBeNull();
		expect(DEFAULT_INTERPRETER_STEPS).toBe(1_000_000);
		const unbounded = run(inMain('while (1) ;'));
		expect(unbounded).toMatchObject({ stop: 'step-budget', steps: DEFAULT_INTERPRETER_STEPS });
	});

	it('counts one step per statement executed and expression node evaluated', () => {
		// Compound; ExprStmt, Call output, Num.
		expect(run(inMain('output(1);')).steps).toBe(4);
		// Compound; ExprStmt, Assign, Binary, Num, Num.
		expect(run(inMain('int x; x = 1 + 2;')).steps).toBe(6);
		expect(run(inMain('')).steps).toBe(1);
	});

	it('memory-error: calls nested deeper than the limit', () => {
		const source =
			'int down(int n) { output(n); return down(n + 1); } void main(void) { down(1); }';
		const r = run(source);
		expect(r.stop).toBe('memory-error');
		// main is the first call.
		expect(r.outputs).toHaveLength(DEFAULT_CALL_DEPTH - 1);
		expect(where(r)).toBe('down(n + 1)');
		expect(run(source, [], { maxCallDepth: 10 }).outputs).toHaveLength(9);
		expect(DEFAULT_CALL_DEPTH).toBe(512);
	});

	it('recursion within the limit runs', () => {
		const source =
			'int sum(int n) { if (n == 0) return 0; return n + sum(n - 1); } void main(void) { output(sum(input())); }';
		expect(run(source, [500]).outputs).toEqual([125250]);
		expect(run(source, [600]).stop).toBe('memory-error');
		expect(run(source, [600], { maxCallDepth: 1000 }).outputs).toEqual([180300]);
	});

	it('never throws when the JavaScript stack runs out first', () => {
		const source = 'void f(void) { f(); } void main(void) { f(); }';
		const r = run(source, [], { maxCallDepth: 100_000_000, maxSteps: 100_000_000 });
		expect(r.stop).toBe('memory-error');
		// Deep expressions in every call use the stack faster.
		const nested = `int f(int n) { if (n == 0) return 0; return ${'1 + ('.repeat(150)}f(n - 1)${')'.repeat(150)}; } void main(void) { output(f(input())); }`;
		expect(run(nested, [3]).outputs).toEqual([450]);
		const deep = run(nested, [100000], { maxCallDepth: 100_000_000, maxSteps: 100_000_000 });
		expect(deep.stop).toBe('memory-error');
		expect(deep.outputs).toEqual([]);
	});

	it('memory-error: global variables that cannot fit the machine are not allocated', () => {
		// Two arrays of 8 GB each: main's head is where the run ends, before anything runs.
		const huge = run(
			'int a[2147483647]; int b[2147483647]; void main(void) { a[2147483646] = 7; b[5] = 1; output(a[2147483646]); }'
		);
		expect(huge).toMatchObject({ stop: 'memory-error', outputs: [], steps: 0 });
		expect(where(huge)).toBe('void main(void)');
		expect(huge.node).not.toBeNull();
		// One declaration with a slip of the finger is enough.
		expect(run('int a[1000000000]; void main(void) { output(1); }').stop).toBe('memory-error');
		// The cost does not grow with the number of declarations.
		const name = (i: number) => [...String(i)].map((d) => 'abcdefghij'[Number(d)]).join('');
		const many = Array.from({ length: 4096 }, (_, i) => `int g${name(i)}[2147483647];`);
		const r = run(`${many.join('\n')}\nvoid main(void) { output(1); }`);
		expect(r).toMatchObject({ stop: 'memory-error', outputs: [], steps: 0 });
	});

	it('memory-error: the global variables and the record of main take at most 1024 cells', () => {
		// 2 cells for the base of main's record.
		const fits = 'int a[1022]; void main(void) { a[1021] = 5; output(a[1021]); }';
		expect(run(fits)).toMatchObject({ stop: 'halted', outputs: [5] });
		expect(run(fits.replace('1022', '1023')).stop).toBe('memory-error');
		const locals = 'int g; void main(void) { int a[1021]; a[1020] = g + 6; output(a[1020]); }';
		expect(run(locals)).toMatchObject({ stop: 'halted', outputs: [6] });
		expect(run(locals.replace('1021', '1022')).stop).toBe('memory-error');
	});

	it('memory-error: a call whose record cannot fit the machine, at the call', () => {
		const source = (size: number) =>
			`int g[10]; int f(int n) { int big[${size}]; big[0] = n; return big[0] + 1; } void main(void) { output(1); output(f(4)); output(2); }`;
		// 10 globals, 2 cells, the parameter and 1011 locals: exactly 1024.
		expect(run(source(1011))).toMatchObject({ stop: 'halted', outputs: [1, 5, 2] });
		const r = run(source(1012));
		expect(r).toMatchObject({ stop: 'memory-error', outputs: [1] });
		expect(where(r)).toBe('f(4)');
		const enormous = run(source(2147483647));
		expect(enormous).toMatchObject({ stop: 'memory-error', outputs: [1] });
		expect(where(enormous)).toBe('f(4)');
		// A function that is never called costs nothing.
		expect(
			run('void never(void) { int big[2147483647]; } void main(void) { output(3); }').outputs
		).toEqual([3]);
	});

	it('every call gets fresh storage, however many calls there are', () => {
		const source =
			'int f(int n) { int a[1000]; a[999] = a[999] + n; return a[999]; } void main(void) { int i; int s; i = 0; s = 0; while (i < 3000) { s = s + f(i); i = i + 1; } output(s); }';
		expect(run(source).outputs).toEqual([(2999 * 3000) / 2]);
	});

	it('reads input values as 32-bit integers', () => {
		expect(outputs('output(input());', [4294967298])).toEqual([2]);
		expect(outputs('output(input() + 1);', [2147483647])).toEqual([-2147483648]);
	});

	it('does not change the program or the analysis it is given', () => {
		const parsed = parseSource(inMain('int x; x = input(); output(x * 2);'));
		const semantic = analyze(parsed.program);
		const before = JSON.stringify([parsed.program, semantic.symbols]);
		expect(interpret(parsed.program, semantic, [4]).outputs).toEqual([8]);
		expect(interpret(parsed.program, semantic, [5]).outputs).toEqual([10]);
		expect(JSON.stringify([parsed.program, semantic.symbols])).toBe(before);
	});
});
