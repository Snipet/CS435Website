import { describe, expect, it } from 'vitest';
import { DADDR_SIZE, IADDR_SIZE, formatInstruction } from '$lib/tools/tiny-vm/machine';
import { parseTM } from '$lib/tools/tiny-vm/parse';
import { formatListing, generateCode, type CodegenResult, type TmCode } from './codegen';
import { compile, type Compilation } from './compile';
import { quadText } from './ir';
import { runTM } from './run';
import {
	AC,
	AC1,
	FP,
	FRAME_HEADER,
	GP,
	INT_MAX,
	INT_MIN,
	OLD_FP_OFFSET,
	PC,
	RETURN_OFFSET,
	arith,
	compare,
	registerName
} from './runtime';
import { SAMPLES } from './samples';

function build(source: string, optimize = false): Compilation & { codegen: CodegenResult } {
	const c = compile(source, { optimize });
	expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return c as Compilation & { codegen: CodegenResult };
}

/** "addr: OP operands" of the instructions that implement the quad with the given text. */
function codeFor(c: Compilation, code: TmCode, text: string): string[] {
	const quads = (c.optimized?.program ?? c.ir!).quads;
	const index = quads.findIndex((q) => quadText(q) === text);
	expect(index).toBeGreaterThanOrEqual(0);
	return code.instructions.filter((i) => i.quad === index).map((i) => formatInstruction(i.instr));
}

const outputs = (source: string, inputs: number[] = [], optimize = false) => {
	const c = build(source, optimize);
	const raw = runTM(c.codegen.code, inputs);
	const final = runTM(c.codegen.peephole.code, inputs);
	expect([final.stop, final.outputs]).toEqual([raw.stop, raw.outputs]);
	return final.stop === 'halted' ? final.outputs : [final.stop, ...final.outputs];
};

describe('the listing', () => {
	it('the smallest program: prelude, input, output, main', () => {
		const c = build('void main(void) { }');
		expect(c.codegen.code.listing).toBe(`* C- program compiled for the TINY Machine
* registers: ac = 0, ac1 = 1, fp = 5, gp = 6, pc = 7
* prelude
  0:  LD   6,0(0)     gp = dMem[0], the highest address
  1:  ST   0,0(0)     clear dMem[0]
  2:  LDA  5,0(6)     fp = the record of main, below the globals
  3:  LDA  0,1(7)     ac = return address
  4:  LDA  7,9(7)     call main
  5:  HALT 0,0,0      main returned: stop
  6:  HALT 1,0,0      negative subscript: stop
* int input(void)
  7:  ST   0,-1(5)    save the return address
  8:  IN   0,0,0      ac = the integer read
  9:  LD   7,-1(5)    return to the caller
* void output(int x)
 10:  ST   0,-1(5)    save the return address
 11:  LD   0,-2(5)    ac = x
 12:  OUT  0,0,0      print ac
 13:  LD   7,-1(5)    return to the caller
* function main: activation record of 2 cells
* begin main
 14:  ST   0,-1(5)    save the return address
* end main
 15:  LD   7,-1(5)    return to the caller`);
		expect(c.codegen.peephole.code.listing).toBe(c.codegen.code.listing);
		expect(c.codegen.peephole.changes).toEqual([]);
	});

	it('a quad is a comment line above the instructions that implement it', () => {
		const c = build('int g; void main(void) { int x; x = input(); g = x + 2; output(g); }');
		const lines = c.codegen.code.listing.split('\n');
		const from = lines.indexOf('* t2 := x + 2');
		expect(lines.slice(from, from + 8)).toEqual([
			'* t2 := x + 2',
			' 23:  LD   0,-2(5)    ac = x',
			' 24:  LDC  1,2(0)     ac1 = 2',
			' 25:  ADD  0,0,1      ac = ac + ac1',
			' 26:  ST   0,-4(5)    t2 = ac',
			'* g := t2',
			' 27:  LD   0,-4(5)    ac = t2',
			' 28:  ST   0,0(6)     g = ac'
		]);
	});

	it('the TINY Machine tool reads the listing back as the same program', () => {
		for (const s of SAMPLES.filter((s) => s.id !== 'undeclared')) {
			for (const optimize of [false, true]) {
				const c = build(s.source, optimize);
				for (const code of [c.codegen.code, c.codegen.peephole.code]) {
					const parsed = parseTM(code.listing);
					expect(parsed.diagnostics).toEqual([]);
					expect(parsed.program.entries.map((e) => [e.addr, e.instr, e.comment])).toEqual(
						code.instructions.map((i) => [i.addr, i.instr, i.comment])
					);
				}
			}
		}
	});

	it('every instruction line is "N:  OP  operands  comment"', () => {
		const c = build(SAMPLES.find((s) => s.id === 'sort')!.source);
		const lines = c.codegen.code.listing.split('\n');
		const instruction = /^ *\d+: {2}[A-Z]+ +\d,(-?\d+\(\d\)|\d,\d) +[A-Za-z].*\S$/;
		for (const line of lines) {
			if (line.startsWith('*')) expect(line).toMatch(/^\* \S/);
			else expect(line).toMatch(instruction);
		}
		expect(lines.filter((l) => !l.startsWith('*'))).toHaveLength(
			c.codegen.code.instructions.length
		);
	});

	it('every instruction knows its line in the listing', () => {
		for (const id of ['sort', 'gcd']) {
			const c = build(SAMPLES.find((s) => s.id === id)!.source);
			for (const code of [c.codegen.code, c.codegen.peephole.code]) {
				const lines = code.listing.split('\n');
				for (const i of code.instructions) {
					expect(lines[i.line - 1].trimStart().startsWith(`${i.addr}:`)).toBe(true);
				}
			}
		}
	});

	it('formatListing rebuilds the text from the instructions', () => {
		const c = build(SAMPLES.find((s) => s.id === 'gcd')!.source);
		expect(formatListing(c.codegen.code.instructions)).toBe(c.codegen.code.listing);
		expect(formatListing([])).toBe('');
		expect(formatListing([], ['end'])).toBe('* end');
	});

	it('a function that ends with a return has no second return', () => {
		const c = build('int f(void) { return 1; } void main(void) { f(); return; }');
		expect(codeFor(c, c.codegen.code, 'return 1')).toEqual(['LDC 0,1(0)', 'LD 7,-1(5)']);
		expect(codeFor(c, c.codegen.code, 'end f')).toEqual([]);
		expect(codeFor(c, c.codegen.code, 'end main')).toEqual([]);
		// The comment of the last quad still closes the listing.
		expect(c.codegen.code.listing.endsWith('\n* end main')).toBe(true);
		expect(c.codegen.code.listing).toContain('* end f\n* function main');
		expect(parseTM(c.codegen.code.listing).diagnostics).toEqual([]);
	});
});

describe('instructions', () => {
	const source = `int g;
int twice(int n) { return n + n; }
void main(void)
{
  int x;
  x = twice(input());
  if (x < g) output(x);
}`;
	const c = build(source);
	const code = c.codegen.code;

	it('addresses count from 0 and match the positions', () => {
		expect(code.instructions.map((i) => i.addr)).toEqual(code.instructions.map((_, i) => i));
		expect(code.instructions.every((i) => i.origin === i.addr)).toBe(true);
	});

	it('every instruction has a comment that starts with a letter', () => {
		for (const i of code.instructions) expect(i.comment).toMatch(/^[A-Za-z]/);
	});

	it('entries and the two HALTs', () => {
		expect([...code.entries.keys()]).toEqual(['input', 'output', 'twice', 'main']);
		expect(code.entries.get('input')).toBe(7);
		expect(code.entries.get('output')).toBe(10);
		expect(code.entries.get('twice')).toBe(14);
		expect(code.haltAddress).toBe(5);
		expect(code.negativeSubscriptAddress).toBe(6);
		for (const [name, addr] of code.entries) {
			expect(code.instructions[addr]).toMatchObject({
				function: name,
				instr: { op: 'ST', a1: 0, a2: -1, a3: 5 }
			});
		}
	});

	it('maps every instruction of a function to its quad and source span', () => {
		const quads = c.ir!.quads;
		for (const i of code.instructions) {
			if (i.function === null || i.function === 'input' || i.function === 'output') {
				expect(i.quad).toBeNull();
				expect(i.span).toBeNull();
			} else {
				expect(quads[i.quad!]).toBeDefined();
				expect(i.span).toEqual(quads[i.quad!].span);
			}
		}
		// The instructions of one quad are next to each other, in the order of the quads.
		const order = code.instructions.filter((i) => i.quad !== null).map((i) => i.quad!);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		const text = (addr: number) => {
			const span = code.instructions[addr].span!;
			return source.slice(span.start, span.end);
		};
		const first = (quad: string) =>
			code.instructions.find((i) => i.quad !== null && quadText(quads[i.quad]) === quad)!.addr;
		expect(text(first('t1 := n + n'))).toBe('n + n');
		expect(text(first('t1 := call input, 0'))).toBe('input()');
		expect(text(first('t3 := x < g'))).toBe('x < g');
		expect(text(first('if_false t3 goto L1'))).toBe('if (x < g)');
		expect(code.instructions[first('t3 := x < g')].span).toMatchObject({ line: 7, column: 7 });
	});

	it('the header of the first instruction of a quad is the quad', () => {
		const quads = c.ir!.quads;
		let previous: number | null = null;
		for (const i of code.instructions) {
			if (i.quad !== null && i.quad !== previous) {
				expect(i.header.at(-1)).toBe(quadText(quads[i.quad]));
			}
			previous = i.quad;
		}
	});
});

describe('translation of each quad', () => {
	const c = build(`int g; int arr[4];
int f(int v[], int n) { v[n] = g; return v[0]; }
void main(void)
{
  int x; int loc[3];
  x = 7;
  g = x - 2;
  x = arr[g];
  loc[x] = 5;
  if (x) x = f(loc, 1);
  while (x == g) x = x / 3 * g;
  output(x);
}`);
	const code = c.codegen.code;
	const of = (text: string) => codeFor(c, code, text);

	it('copy, arithmetic', () => {
		expect(of('x := 7')).toEqual(['LDC 0,7(0)', 'ST 0,-2(5)']);
		expect(of('t1 := x - 2')).toEqual(['LD 0,-2(5)', 'LDC 1,2(0)', 'SUB 0,0,1', 'ST 0,-6(5)']);
		expect(of('g := t1')).toEqual(['LD 0,-6(5)', 'ST 0,0(6)']);
		expect(of('t5 := x / 3')).toEqual(['LD 0,-2(5)', 'LDC 1,3(0)', 'DIV 0,0,1', 'ST 0,-10(5)']);
		expect(of('t6 := t5 * g')).toEqual(['LD 0,-10(5)', 'LD 1,0(6)', 'MUL 0,0,1', 'ST 0,-11(5)']);
	});

	it('array read and write, with the test for a negative subscript', () => {
		// arr is global: 4 cells below g, element 0 at -4(gp).
		expect(of('t2 := arr[g]')).toEqual([
			'LD 0,0(6)',
			`JLT 0,${6 - (code.instructions.find((i) => i.instr.op === 'JLT' && i.function === 'main')!.addr + 1)}(7)`,
			'LDA 1,-4(6)',
			'ADD 1,1,0',
			'LD 0,0(1)',
			'ST 0,-7(5)'
		]);
		// loc is local: element 0 at -5(fp).
		expect(of('loc[x] := 5').filter((t) => !t.startsWith('JLT'))).toEqual([
			'LD 0,-2(5)',
			'LDA 1,-5(5)',
			'ADD 1,1,0',
			'LDC 0,5(0)',
			'ST 0,0(1)'
		]);
		// v is an array parameter: its cell holds the address of element 0.
		expect(of('v[n] := g').filter((t) => !t.startsWith('JLT'))).toEqual([
			'LD 0,-3(5)',
			'LD 1,-2(5)',
			'ADD 1,1,0',
			'LD 0,0(6)',
			'ST 0,0(1)'
		]);
		for (const i of code.instructions.filter(
			(i) => i.instr.op === 'JLT' && i.comment.includes('subscript')
		)) {
			expect(i.addr + 1 + i.instr.a2).toBe(code.negativeSubscriptAddress);
		}
	});

	it('param stores into the new record, call builds it and comes back', () => {
		// main's record has 12 cells; the new record starts 12 cells down.
		const size = c.codegen.frames.find((f) => f.function === 'main')!.size;
		expect(size).toBe(12);
		expect(of('param loc')).toEqual(['LDA 0,-5(5)', `ST 0,${-(size + 2)}(5)`]);
		expect(of('param 1')).toEqual(['LDC 0,1(0)', `ST 0,${-(size + 3)}(5)`]);
		const call = code.instructions.filter(
			(i) => i.quad !== null && quadText(c.ir!.quads[i.quad]) === 't3 := call f, 2'
		);
		expect(call.map((i) => formatInstruction(i.instr))).toEqual([
			`ST 5,${-size}(5)`,
			`LDA 5,${-size}(5)`,
			'LDA 0,1(7)',
			`LDA 7,${code.entries.get('f')! - (call[3].addr + 1)}(7)`,
			'LD 5,0(5)',
			'ST 0,-8(5)'
		]);
	});

	it('an array parameter is passed on by loading its cell', () => {
		const d = build(
			'int g(int v[]) { return v[0]; } int f(int v[]) { return g(v); } int a[2]; void main(void) { a[0] = 9; output(f(a)); }'
		);
		expect(codeFor(d, d.codegen.code, 'param v')[0]).toBe('LD 0,-2(5)');
		expect(codeFor(d, d.codegen.code, 'param a')[0]).toBe('LDA 0,-1(6)');
		expect(runTM(d.codegen.code, []).outputs).toEqual([9]);
	});

	it('begin, return, end', () => {
		expect(of('begin f')).toEqual(['ST 0,-1(5)']);
		expect(of('return t1')).toEqual(['LD 0,-4(5)', 'LD 7,-1(5)']);
		expect(of('end main')).toEqual(['LD 7,-1(5)']);
	});

	it('jumps are relative to the pc', () => {
		const at = (text: string) =>
			code.instructions.filter((i) => i.quad !== null && quadText(c.ir!.quads[i.quad]) === text);
		const label = (name: string) => {
			const index = c.ir!.quads.findIndex((q) => quadText(q) === `${name}:`);
			// The label stands for the first instruction after it.
			return code.instructions.find((i) => i.quad !== null && i.quad > index)!.addr;
		};
		const [load, jump] = at('if_false x goto L1');
		expect(formatInstruction(load.instr)).toBe('LD 0,-2(5)');
		expect(jump.instr).toMatchObject({ op: 'JEQ', a1: 0, a3: 7 });
		expect(jump.addr + 1 + jump.instr.a2).toBe(label('L1'));
		const [back] = at('goto L3');
		expect(back.instr).toMatchObject({ op: 'LDA', a1: 7, a3: 7 });
		expect(back.addr + 1 + back.instr.a2).toBe(label('L3'));
		expect(back.instr.a2).toBeLessThan(0);
	});

	it('== and != are decided by one subtraction', () => {
		expect(of('t4 := x == g')).toEqual([
			'LD 0,-2(5)',
			'LD 1,0(6)',
			'SUB 0,0,1',
			'JEQ 0,2(7)',
			'LDC 0,0(0)',
			'LDA 7,1(7)',
			'LDC 0,1(0)',
			'ST 0,-9(5)'
		]);
	});

	it('< tests the signs first, so the subtraction cannot overflow', () => {
		const d = build('void main(void) { int a; int b; a = input(); b = input(); output(a < b); }');
		expect(codeFor(d, d.codegen.code, 't3 := a < b')).toEqual([
			'LD 0,-2(5)',
			'LD 1,-3(5)',
			'JLT 0,2(7)',
			'JLT 1,4(7)',
			'LDA 7,1(7)',
			'JGE 1,4(7)',
			'SUB 0,0,1',
			'JLT 0,2(7)',
			'LDC 0,0(0)',
			'LDA 7,1(7)',
			'LDC 0,1(0)',
			'ST 0,-6(5)'
		]);
	});
});

describe('arithmetic on the machine', () => {
	const VALUES = [
		INT_MIN,
		INT_MIN + 1,
		-1000000007,
		-2,
		-1,
		0,
		1,
		2,
		46341,
		1000000007,
		INT_MAX - 1,
		INT_MAX
	];

	it('the six relational operators are exact for every pair of extreme values', () => {
		const source = `void main(void) { int a; int b; a = input(); b = input();
  output(a < b); output(a <= b); output(a > b); output(a >= b); output(a == b); output(a != b); }`;
		const c = build(source);
		for (const a of VALUES) {
			for (const b of VALUES) {
				const expected = (['<', '<=', '>', '>=', '==', '!='] as const).map((op) =>
					compare(op, a, b)
				);
				expect([a, b, ...runTM(c.codegen.peephole.code, [a, b]).outputs]).toEqual([
					a,
					b,
					...expected
				]);
			}
		}
	});

	it('comparisons with constants on either side', () => {
		const tests = [
			'x < 0',
			'0 < x',
			'x <= 5',
			'5 <= x',
			'x > 0 - 1',
			'0 - 1 > x',
			'x >= 2147483647',
			'2147483647 >= x',
			'x == 0',
			'0 != x'
		];
		const source = `void main(void) { int x; x = input(); ${tests.map((t) => `output(${t});`).join(' ')} }`;
		const c = build(source);
		const expected = (x: number) =>
			[
				x < 0,
				0 < x,
				x <= 5,
				5 <= x,
				x > -1,
				-1 > x,
				x >= INT_MAX,
				INT_MAX >= x,
				x === 0,
				0 !== x
			].map(Number);
		for (const x of VALUES) expect(runTM(c.codegen.code, [x]).outputs).toEqual(expected(x));
		// The optimized code folds nothing here (x is read), and agrees.
		const o = build(source, true);
		for (const x of VALUES)
			expect(runTM(o.codegen.peephole.code, [x]).outputs).toEqual(expected(x));
	});

	it('+ - * wrap around at 32 bits and / truncates toward zero', () => {
		const source =
			'void main(void) { int a; int b; a = input(); b = input(); output(a + b); output(a - b); output(a * b); output(a / b); }';
		const c = build(source);
		for (const a of VALUES) {
			for (const b of VALUES.filter((v) => v !== 0)) {
				const expected = (['+', '-', '*', '/'] as const).map((op) => arith(op, a, b));
				expect([a, b, ...runTM(c.codegen.peephole.code, [a, b]).outputs]).toEqual([
					a,
					b,
					...expected
				]);
			}
		}
		expect(runTM(c.codegen.code, [7, 2]).outputs).toEqual([9, 5, 14, 3]);
		expect(runTM(c.codegen.code, [-7, 2]).outputs).toEqual([-5, -9, -14, -3]);
		expect(runTM(c.codegen.code, [7, -2]).outputs).toEqual([5, 9, -14, -3]);
		expect(runTM(c.codegen.code, [INT_MAX, 1]).outputs[0]).toBe(INT_MIN);
	});

	it('registers and the base of a record', () => {
		expect([AC, AC1, FP, GP, PC]).toEqual([0, 1, 5, 6, 7]);
		expect([0, 1, 5, 6, 7].map(registerName)).toEqual(['ac', 'ac1', 'fp', 'gp', 'pc']);
		expect([2, 3, 4].map(registerName)).toEqual(['r2', 'r3', 'r4']);
		expect([OLD_FP_OFFSET, RETURN_OFFSET, FRAME_HEADER]).toEqual([0, -1, 2]);
		expect([INT_MIN, INT_MAX]).toEqual([-2147483648, 2147483647]);
	});

	it('the shared arithmetic agrees with JavaScript on small values', () => {
		expect(arith('+', 2, 3)).toBe(5);
		expect(arith('-', 2, 3)).toBe(-1);
		expect(arith('*', -4, 3)).toBe(-12);
		expect(arith('/', -7, 2)).toBe(-3);
		expect(arith('/', 1, 0)).toBeNull();
		expect(arith('*', 65536, 65536)).toBe(0);
		expect(arith('/', INT_MIN, -1)).toBe(INT_MIN);
		expect(compare('<', INT_MIN, INT_MAX)).toBe(1);
		expect(compare('>=', 3, 3)).toBe(1);
		expect(compare('!=', 3, 3)).toBe(0);
	});
});

describe('activation records', () => {
	const c = build(`int g; int table[6]; int h;
int f(int a, int v[], int b)
{
  int x; int loc[3]; int y;
  { int z; z = a + b; x = z; }
  y = v[0] * x;
  return y + loc[0];
}
void main(void) { int k; k = f(1, table, 2); output(k); }`);

	it('describes the record of every function', () => {
		expect(c.codegen.frames.map((f) => [f.function, f.size])).toEqual([
			['input', 2],
			['output', 3],
			['f', 16],
			['main', 4]
		]);
		const f = c.codegen.frames[2];
		expect(f.slots.map((s) => [s.name, s.kind, s.offset, s.size])).toEqual([
			["caller's fp", 'old-fp', 0, 1],
			['return address', 'return-address', -1, 1],
			['a', 'parameter', -2, 1],
			['v', 'array-parameter', -3, 1],
			['b', 'parameter', -4, 1],
			['x', 'variable', -5, 1],
			['loc', 'array', -8, 3],
			['y', 'variable', -9, 1],
			['z', 'variable', -10, 1],
			['t1', 'temporary', -11, 1],
			['t2', 'temporary', -12, 1],
			['t3', 'temporary', -13, 1],
			['t4', 'temporary', -14, 1],
			['t5', 'temporary', -15, 1]
		]);
		// The slots fill the record without gaps or overlaps.
		for (const frame of c.codegen.frames) {
			const cells = frame.slots.flatMap((s) =>
				Array.from({ length: s.size }, (_, k) => s.offset + k)
			);
			expect([...cells].sort((x, y) => y - x)).toEqual(
				Array.from({ length: frame.size }, (_, k) => 0 - k)
			);
		}
		expect(f.slots[2].symbol).toBe(c.semantic!.symbols.find((s) => s.name === 'a')!.id);
		expect(f.slots[0].symbol).toBeNull();
		expect(f.slots.at(-1)!.symbol).toBeNull();
	});

	it('describes the globals: offsets from gp and addresses', () => {
		expect(c.codegen.globals).toEqual({
			size: 8,
			slots: [
				{
					name: 'g',
					kind: 'variable',
					offset: 0,
					address: 1023,
					size: 1,
					symbol: expect.any(Number)
				},
				{
					name: 'table',
					kind: 'array',
					offset: -6,
					address: 1017,
					size: 6,
					symbol: expect.any(Number)
				},
				{
					name: 'h',
					kind: 'variable',
					offset: -7,
					address: 1016,
					size: 1,
					symbol: expect.any(Number)
				}
			]
		});
	});

	it('memory after a run matches the layout', () => {
		const d = build(
			'int g; int table[3]; void main(void) { int k; g = 11; table[0] = 22; table[2] = 33; k = 44; }'
		);
		const r = runTM(d.codegen.code, []);
		expect(r.stop).toBe('halted');
		const { dMem } = r.machine;
		expect([dMem[1023], dMem[1020], dMem[1021], dMem[1022]]).toEqual([11, 22, 0, 33]);
		// main's record starts below the 4 global cells: fp = 1019, k at -2(fp).
		expect(dMem[1019 - 2]).toBe(44);
		// Its return address is the HALT after the call.
		expect(dMem[1019 - 1]).toBe(d.codegen.code.haltAddress);
		expect(d.codegen.globals.slots.map((s) => s.address)).toEqual([1023, 1020]);
	});

	it('the optimizer shrinks the record when temporaries go', () => {
		const source = 'void main(void) { int x; x = 1 + 2 + 3; output(x * 1); }';
		expect(build(source, false).codegen.frames.at(-1)!.size).toBe(6);
		expect(build(source, true).codegen.frames.at(-1)!.size).toBe(3);
	});

	it('names in the record are the names in the quads', () => {
		const d = build('int x; void main(void) { int y; { int x; x = 1; y = x; } x = y; }');
		expect(d.codegen.frames.at(-1)!.slots.map((s) => s.name)).toEqual([
			"caller's fp",
			'return address',
			'y',
			'x.2'
		]);
		expect(d.codegen.code.listing).toContain('x.2 = ac');
	});
});

describe('the peephole pass', () => {
	it('removes a load right after a store of the same register and cell', () => {
		const c = build('void main(void) { int x; x = input() + 1; output(x); }');
		const { code, peephole } = c.codegen;
		expect(peephole.changes.every((ch) => ch.rule === 'store-load')).toBe(true);
		expect(peephole.changes.length).toBeGreaterThan(0);
		for (const ch of peephole.changes) {
			const removed = code.instructions[ch.addr];
			const before = code.instructions[ch.addr - 1];
			expect(formatInstruction(removed.instr)).toBe(ch.instruction);
			expect(removed.instr.op).toBe('LD');
			expect(before.instr).toEqual({ ...removed.instr, op: 'ST' });
			expect(ch.text).toBe(
				`${registerName(removed.instr.a1)} still holds the value the instruction before it stored.`
			);
		}
		expect(peephole.code.instructions).toHaveLength(
			code.instructions.length - peephole.changes.length
		);
	});

	it('removes a jump to the next instruction', () => {
		const c = build('void main(void) { int x; x = input(); if (x) output(x); }');
		const { code, peephole } = c.codegen;
		const jumps = peephole.changes.filter((ch) => ch.rule === 'jump-to-next');
		expect(jumps).toHaveLength(1);
		expect(code.instructions[jumps[0].addr].instr).toEqual({ op: 'LDA', a1: 7, a2: 0, a3: 7 });
		expect(jumps[0]).toMatchObject({
			instruction: 'LDA 7,0(7)',
			text: 'It jumps to the instruction that follows it.'
		});
		// No instruction of the result jumps to the next one.
		for (const i of peephole.code.instructions) {
			if (i.instr.a3 === 7 && (i.instr.op === 'LDA' || i.instr.op.startsWith('J'))) {
				expect(i.instr.a2).not.toBe(0);
			}
		}
	});

	it('keeps a load that a jump lands on', () => {
		// The loop test loads x right after `x := 1` stored it, but the jump back lands there.
		const c = build('void main(void) { int x; x = 1; while (x) x = x - 1; output(x); }');
		const { code, peephole } = c.codegen;
		const store = code.instructions.findIndex((i) => i.comment === 'x = ac');
		expect(formatInstruction(code.instructions[store + 1].instr)).toBe('LD 0,-2(5)');
		expect(peephole.changes.map((ch) => ch.addr)).not.toContain(store + 1);
		expect(runTM(peephole.code, []).outputs).toEqual([0]);
	});

	it('origin maps the shorter code back to the longer one', () => {
		const c = build(SAMPLES.find((s) => s.id === 'sort')!.source);
		const { code, peephole } = c.codegen;
		const removed = new Set(peephole.changes.map((ch) => ch.addr));
		expect(removed.size).toBe(peephole.changes.length);
		expect(peephole.code.instructions.map((i) => i.origin)).toEqual(
			code.instructions.map((i) => i.addr).filter((a) => !removed.has(a))
		);
		for (const i of peephole.code.instructions) {
			const before = code.instructions[i.origin];
			expect([i.instr.op, i.instr.a1, i.instr.a3, i.comment, i.quad, i.span]).toEqual([
				before.instr.op,
				before.instr.a1,
				before.instr.a3,
				before.comment,
				before.quad,
				before.span
			]);
		}
		expect(peephole.changes.map((ch) => ch.addr)).toEqual(
			[...peephole.changes.map((ch) => ch.addr)].sort((a, b) => a - b)
		);
	});

	it('every jump still reaches the instruction it reached before', () => {
		const c = build(SAMPLES.find((s) => s.id === 'sort')!.source);
		const { code, peephole } = c.codegen;
		const removed = new Set(peephole.changes.map((ch) => ch.addr));
		/** Where an old address is in the new code (a removed one: the instruction after it). */
		const moved = (old: number) => {
			let target = old;
			while (removed.has(target)) target++;
			return peephole.code.instructions.findIndex((i) => i.origin === target);
		};
		const relative = (i: { instr: { op: string; a3: number } }) =>
			i.instr.a3 === 7 && (i.instr.op === 'LDA' || i.instr.op.startsWith('J'));
		let jumps = 0;
		for (const i of peephole.code.instructions.filter(relative)) {
			const before = code.instructions[i.origin];
			expect(i.addr + 1 + i.instr.a2).toBe(moved(before.addr + 1 + before.instr.a2));
			jumps++;
		}
		expect(jumps).toBeGreaterThan(20);
	});

	it('the comment lines of a removed instruction move to the next one', () => {
		const c = build('void main(void) { int x; x = input(); output(x + 1); }');
		const before = c.codegen.code.listing.split('\n').filter((l) => l.startsWith('*'));
		const after = c.codegen.peephole.code.listing.split('\n').filter((l) => l.startsWith('*'));
		expect(after).toEqual(before);
	});
});

describe('limits of the machine', () => {
	it('reports code that does not fit in instruction memory', () => {
		const body = 'x = x * 3 + input() - 1; output(x); '.repeat(60);
		const c = compile(`void main(void) { int x; x = 0; ${body} }`);
		expect(c.stoppedAt).toBe('codegen');
		const size = c.codegen!.peephole.code.instructions.length;
		expect(size).toBeGreaterThan(IADDR_SIZE);
		expect(c.diagnostics).toEqual([
			{
				severity: 'error',
				phase: 'codegen',
				message: `The program needs ${size} instruction cells; the TINY Machine has 1024.`
			}
		]);
		expect(c.codegen!.ok).toBe(false);
		// The code is there to look at, but it is not run.
		expect(runTM(c.codegen!.peephole.code, [])).toMatchObject({
			stop: 'memory-error',
			steps: 0,
			pc: null,
			outputs: []
		});
	});

	it('a program just under the limit runs', () => {
		const body = 'x = x + 1; '.repeat(150);
		const c = compile(`void main(void) { int x; x = 0; ${body} output(x); }`, { optimize: false });
		expect(c.stoppedAt).toBeNull();
		expect(c.codegen!.peephole.code.instructions.length).toBeLessThanOrEqual(IADDR_SIZE);
		expect(runTM(c.codegen!.peephole.code, []).outputs).toEqual([150]);
	});

	it('the code after the peephole pass decides whether the program fits', () => {
		const body = 'x = x + 1; '.repeat(170);
		const c = compile(`void main(void) { int x; x = 0; ${body} output(x); }`, { optimize: false });
		expect(c.codegen!.code.instructions.length).toBeGreaterThan(IADDR_SIZE);
		expect(c.codegen!.peephole.code.instructions.length).toBeLessThanOrEqual(IADDR_SIZE);
		expect(c.stoppedAt).toBeNull();
		expect(c.diagnostics).toEqual([]);
		expect(runTM(c.codegen!.peephole.code, [])).toMatchObject({ stop: 'halted', outputs: [170] });
		// The longer code cannot be loaded.
		expect(runTM(c.codegen!.code, [])).toMatchObject({ stop: 'memory-error', steps: 0, pc: null });
	});

	it('reports globals and records that do not fit in data memory', () => {
		const c = compile('int big[1020]; void main(void) { int x; int y; int z; x = 1; }');
		expect(c.stoppedAt).toBe('codegen');
		expect(c.diagnostics.map((d) => d.message)).toEqual([
			'The global variables (1020 cells) and the activation record of main (5 cells) do not fit in the 1024 cells of data memory.'
		]);
		expect(c.diagnostics[0].span).toMatchObject({ start: 20, end: 24 });

		const local = compile('void f(void) { int big[2000]; big[0] = 1; } void main(void) { f(); }');
		expect(local.diagnostics.map((d) => d.message)).toEqual([
			'The activation record of f (2002 cells) does not fit in the 1024 cells of data memory.'
		]);
		expect(DADDR_SIZE).toBe(1024);
	});

	it('globals that leave room for the stack are fine', () => {
		const c = compile('int big[1015]; void main(void) { big[1014] = 5; output(big[1014]); }');
		expect(c.stoppedAt).toBeNull();
		expect(runTM(c.codegen!.peephole.code, [])).toMatchObject({ stop: 'halted', outputs: [5] });
	});

	it('a stack that runs out while the program runs is a memory error', () => {
		// main's record fits under the globals, the record of output does not.
		const c = compile('int big[1021]; void main(void) { big[1020] = 5; output(big[1020]); }');
		expect(c.stoppedAt).toBeNull();
		expect(runTM(c.codegen!.peephole.code, [])).toMatchObject({
			stop: 'memory-error',
			outputs: []
		});
	});

	it('an enormous array is a diagnostic, not a crash', () => {
		const c = compile('int big[2147483647]; void main(void) { big[0] = 1; }');
		expect(c.stoppedAt).toBe('codegen');
		expect(c.diagnostics).toHaveLength(1);
	});
});

describe('generated code runs', () => {
	it('arrays: global, local, parameter, through two calls', () => {
		const source = `int g[3];
void fill(int v[], int n, int start) { int i; i = 0; while (i < n) { v[i] = start + i; i = i + 1; } }
int total(int v[], int n) { int i; int s; s = 0; i = 0; while (i < n) { s = s + v[i]; i = i + 1; } return s; }
int both(int a[], int b[]) { fill(a, 3, 10); fill(b, 4, 100); return total(a, 3) + total(b, 4); }
void main(void) { int loc[4]; output(both(g, loc)); output(g[2]); output(loc[3]); }`;
		expect(outputs(source)).toEqual([33 + 406, 12, 103]);
		expect(outputs(source, [], true)).toEqual([439, 12, 103]);
	});

	it('a negative subscript halts: read and write, any kind of array', () => {
		const source = (use: string) =>
			`int g[3]; void f(int v[], int i) { ${use.replace(/A/g, 'v')} } void main(void) { int loc[3]; int i; i = input(); output(1); ${use} output(2); }`;
		for (const use of ['A[i] = 5;', 'output(A[i]);', 'A[i];', 'A[0] = A[i];']) {
			for (const array of ['g', 'loc']) {
				const text = source(use).replace(/A/g, array);
				expect(outputs(text, [-1])).toEqual(['negative-subscript', 1]);
				expect(outputs(text, [-1], true)).toEqual(['negative-subscript', 1]);
				expect(outputs(text, [2]).slice(0, 1)).toEqual([1]);
			}
		}
		const viaParameter =
			'int g[3]; void f(int v[], int i) { v[i] = 5; } void main(void) { output(1); f(g, input()); output(2); }';
		expect(outputs(viaParameter, [-3])).toEqual(['negative-subscript', 1]);
		expect(outputs(viaParameter, [1])).toEqual([1, 2]);
	});

	it('the value of the subscript is tested, not its text', () => {
		expect(outputs('int a[2]; void main(void) { output(a[0 - 1]); }', [], true)).toEqual([
			'negative-subscript'
		]);
		expect(outputs('int a[2]; void main(void) { a[1 - 2] = 3; }', [], true)).toEqual([
			'negative-subscript'
		]);
	});

	it('a function reaches its end without a return and comes back', () => {
		expect(
			outputs(
				'void f(int n) { if (n) output(n); } void main(void) { f(0); f(5); f(0); output(9); }'
			)
		).toEqual([5, 9]);
	});

	it('recursion keeps each call its own parameters and locals', () => {
		const source = `int f(int n) { int mine; mine = n * 10; if (n > 0) f(n - 1); return mine; }
void main(void) { output(f(3)); output(f(1)); }`;
		expect(outputs(source)).toEqual([30, 10]);
		expect(outputs(source, [], true)).toEqual([30, 10]);
	});

	it('globals start at 0 and keep their values between calls', () => {
		const source =
			'int n; int a[2]; void bump(void) { n = n + 1; a[1] = a[1] + n; } void main(void) { output(n); output(a[1]); bump(); bump(); bump(); output(n); output(a[1]); }';
		expect(outputs(source)).toEqual([0, 0, 3, 6]);
	});

	it('generateCode takes the optimized quads as well as the plain ones', () => {
		const c = compile(SAMPLES.find((s) => s.id === 'fibonacci')!.source);
		const plain = generateCode(c.ir!, c.semantic!);
		const optimized = generateCode(c.optimized!.program, c.semantic!);
		expect(optimized.code.instructions.length).toBeLessThan(plain.code.instructions.length);
		expect(runTM(plain.peephole.code, [8]).outputs).toEqual(
			runTM(optimized.peephole.code, [8]).outputs
		);
	});
});
