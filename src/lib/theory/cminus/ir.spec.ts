import { describe, expect, it } from 'vitest';
import { allNodes, findNode } from './ast';
import { compile } from './compile';
import {
	constant,
	formatQuad,
	functionRanges,
	label,
	operandText,
	printCode,
	printQuads,
	quadColumns,
	quadText,
	sameOperand,
	temporariesOf,
	temporary,
	type IrProgram
} from './ir';
import type { IdentifierMode } from './scanner';

function ir(source: string, identifiers: IdentifierMode = 'letters'): IrProgram {
	const c = compile(source, { optimize: false, identifiers });
	expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return c.ir!;
}

const DECLS = 'int g; int arr[10]; int f(int n) { return n; } int two(int a, int b) { return a; } ';

/** The quads of main for a body, in the four-column form, without begin and end. */
function quads(body: string, decls = DECLS): string[] {
	const p = ir(`${decls}void main(void) { int x; int y; int z; int a[5]; ${body} }`);
	const main = p.functions[p.functions.length - 1];
	return p.quads.slice(main.from + 1, main.to - 1).map(formatQuad);
}

/** The same in the one-line form. */
function lines(body: string, decls = DECLS): string[] {
	const p = ir(`${decls}void main(void) { int x; int y; int z; int a[5]; ${body} }`);
	const main = p.functions[p.functions.length - 1];
	return p.quads.slice(main.from + 1, main.to - 1).map(quadText);
}

describe('expressions', () => {
	it('arithmetic, one operator per quad', () => {
		expect(quads('x = y + z * 2;')).toEqual(['* z #2 t1', '+ y t1 t2', ':= t2 _ x']);
		expect(quads('x = y - z - 1;')).toEqual(['- y z t1', '- t1 #1 t2', ':= t2 _ x']);
		expect(quads('x = (y - z) / (y + z);')).toEqual([
			'- y z t1',
			'+ y z t2',
			'/ t1 t2 t3',
			':= t3 _ x'
		]);
	});

	it('relational operators give 0 or 1 in a temporary', () => {
		for (const op of ['<', '<=', '>', '>=', '==', '!=']) {
			expect(quads(`x = y ${op} z;`)).toEqual([`${op} y z t1`, ':= t1 _ x']);
		}
	});

	it('a constant and a variable are operands as they are', () => {
		expect(quads('x = 5;')).toEqual([':= #5 _ x']);
		expect(quads('x = y;')).toEqual([':= y _ x']);
		expect(quads('x = g;')).toEqual([':= g _ x']);
	});

	it('an expression statement is evaluated', () => {
		expect(quads('x + 1;')).toEqual(['+ x #1 t1']);
		expect(quads(';')).toEqual([]);
		expect(quads('x;')).toEqual([]);
	});

	it('the value of an assignment is the value assigned', () => {
		expect(quads('x = y = 3;')).toEqual([':= #3 _ y', ':= #3 _ x']);
		expect(quads('x = y = z + 1;')).toEqual(['+ z #1 t1', ':= t1 _ y', ':= t1 _ x']);
		expect(quads('x = (y = 2) + 1;')).toEqual([':= #2 _ y', '+ #2 #1 t1', ':= t1 _ x']);
		expect(quads('a[0] = a[1] = 0;')).toEqual(['[]= #0 #1 a', '[]= #0 #0 a']);
	});
});

describe('arrays', () => {
	it('reads an element', () => {
		expect(quads('x = a[y];')).toEqual(['=[] a y t1', ':= t1 _ x']);
		expect(lines('x = a[y];')).toEqual(['t1 := a[y]', 'x := t1']);
		expect(quads('x = arr[y + 1] * 2;')).toEqual([
			'+ y #1 t1',
			'=[] arr t1 t2',
			'* t2 #2 t3',
			':= t3 _ x'
		]);
	});

	it('writes an element', () => {
		expect(quads('a[y] = x;')).toEqual(['[]= x y a']);
		expect(lines('a[y] = x;')).toEqual(['a[y] := x']);
		expect(quads('a[y + 1] = x * 2;')).toEqual(['+ y #1 t1', '* x #2 t2', '[]= t2 t1 a']);
	});

	it('the subscript is evaluated before the value', () => {
		expect(quads('a[f(1)] = f(2);')).toEqual([
			'param #1 _ _',
			'call f 1 t1',
			'param #2 _ _',
			'call f 1 t2',
			'[]= t2 t1 a'
		]);
	});

	it('nested subscripts', () => {
		expect(lines('x = a[a[a[0]]];')).toEqual([
			't1 := a[0]',
			't2 := a[t1]',
			't3 := a[t2]',
			'x := t3'
		]);
	});

	it('an array parameter is indexed like an array', () => {
		const p = ir('int first(int v[]) { v[1] = v[0]; return v[1]; } void main(void) { }');
		expect(p.quads.map(quadText)).toEqual([
			'begin first',
			't1 := v[0]',
			'v[1] := t1',
			't2 := v[1]',
			'return t2',
			'end first',
			'begin main',
			'end main'
		]);
	});
});

describe('calls', () => {
	it('param for each argument, then call with the count', () => {
		expect(quads('x = two(y, 3);')).toEqual([
			'param y _ _',
			'param #3 _ _',
			'call two 2 t1',
			':= t1 _ x'
		]);
		expect(lines('x = two(y, 3);')).toEqual(['param y', 'param 3', 't1 := call two, 2', 'x := t1']);
	});

	it('a call statement keeps no result', () => {
		expect(quads('output(x);')).toEqual(['param x _ _', 'call output 1 _']);
		expect(quads('f(1);')).toEqual(['param #1 _ _', 'call f 1 _']);
		expect(lines('input();')).toEqual(['call input, 0']);
	});

	it('every argument is computed before the first param', () => {
		expect(lines('output(two(f(x), f(y)));')).toEqual([
			'param x',
			't1 := call f, 1',
			'param y',
			't2 := call f, 1',
			'param t1',
			'param t2',
			't3 := call two, 2',
			'param t3',
			'call output, 1'
		]);
		expect(lines('x = two(y + 1, z * 2);')).toEqual([
			't1 := y + 1',
			't2 := z * 2',
			'param t1',
			'param t2',
			't3 := call two, 2',
			'x := t3'
		]);
	});

	it('the params of a call are next to it, whatever the arguments are', () => {
		const p = ir(
			`${DECLS}void main(void) { int x; output(two(two(f(1), 2), two(3, f(two(4, 5))))); x = two(arr[f(1)], x = 2); }`
		);
		let pending = 0;
		for (const q of p.quads) {
			if (q.op === 'param') pending++;
			else if (q.op === 'call') {
				expect(q.arg2).toEqual({ kind: 'count', value: pending });
				pending = 0;
			} else expect(pending).toBe(0);
		}
	});

	it('a whole array is an argument', () => {
		const p = ir(
			'int sum(int v[], int n) { return v[0] + n; } int arr[3]; void main(void) { int loc[2]; output(sum(arr, 3) + sum(loc, 2)); }'
		);
		const main = p.functions[1];
		expect(p.quads.slice(main.from, main.to).map(quadText)).toEqual([
			'begin main',
			'param arr',
			'param 3',
			't1 := call sum, 2',
			'param loc',
			'param 2',
			't2 := call sum, 2',
			't3 := t1 + t2',
			'param t3',
			'call output, 1',
			'end main'
		]);
	});
});

describe('statements', () => {
	it('if with else', () => {
		expect(lines('if (x < y) z = 1; else z = 2;')).toEqual([
			't1 := x < y',
			'if_false t1 goto L1',
			'z := 1',
			'goto L2',
			'L1:',
			'z := 2',
			'L2:'
		]);
		expect(quads('if (x < y) z = 1; else z = 2;')).toEqual([
			'< x y t1',
			'if_false t1 _ L1',
			':= #1 _ z',
			'goto _ _ L2',
			'label _ _ L1',
			':= #2 _ z',
			'label _ _ L2'
		]);
	});

	it('if without else has the same shape', () => {
		expect(lines('if (x) z = 1;')).toEqual([
			'if_false x goto L1',
			'z := 1',
			'goto L2',
			'L1:',
			'L2:'
		]);
	});

	it('while', () => {
		expect(lines('while (x > 0) x = x - 1;')).toEqual([
			'L1:',
			't1 := x > 0',
			'if_false t1 goto L2',
			't2 := x - 1',
			'x := t2',
			'goto L1',
			'L2:'
		]);
	});

	it('nested statements', () => {
		expect(lines('while (x) { if (y) x = 0; else { y = 1; } }')).toEqual([
			'L1:',
			'if_false x goto L2',
			'if_false y goto L3',
			'x := 0',
			'goto L4',
			'L3:',
			'y := 1',
			'L4:',
			'goto L1',
			'L2:'
		]);
	});

	it('return with and without a value', () => {
		const p = ir('int f(int n) { return n + 1; } void main(void) { return; }');
		expect(p.quads.map(formatQuad)).toEqual([
			'begin f _ _',
			'+ n #1 t1',
			'return t1 _ _',
			'end f _ _',
			'begin main _ _',
			'return _ _ _',
			'end main _ _'
		]);
	});

	it('the assignment in a condition is evaluated each time round', () => {
		expect(lines('while ((x = input()) != 0) output(x);')).toEqual([
			'L1:',
			't1 := call input, 0',
			'x := t1',
			't2 := t1 != 0',
			'if_false t2 goto L2',
			'param x',
			'call output, 1',
			'goto L1',
			'L2:'
		]);
	});
});

describe('order of evaluation', () => {
	it('copies the left operand when the right one assigns to it', () => {
		expect(lines('y = x + (x = 5);')).toEqual(['t1 := x', 'x := 5', 't2 := t1 + 5', 'y := t2']);
		expect(lines('y = (x = 5) + x;')).toEqual(['x := 5', 't1 := 5 + x', 'y := t1']);
	});

	it('copies a global when the right operand calls a function', () => {
		expect(lines('y = g + f(1);')).toEqual([
			't1 := g',
			'param 1',
			't2 := call f, 1',
			't3 := t1 + t2',
			'y := t3'
		]);
	});

	it('a local cannot be changed by a call: no copy', () => {
		expect(lines('y = x * f(x - 1);')).toEqual([
			't1 := x - 1',
			'param t1',
			't2 := call f, 1',
			't3 := x * t2',
			'y := t3'
		]);
	});

	it('copies an argument a later argument changes', () => {
		expect(lines('two(x, x = 3);')).toEqual([
			't1 := x',
			'x := 3',
			'param t1',
			'param 3',
			'call two, 2'
		]);
		expect(lines('two(g, f(1));')).toEqual([
			't1 := g',
			'param 1',
			't2 := call f, 1',
			'param t1',
			'param t2',
			'call two, 2'
		]);
		expect(lines('two(x = 3, x);')).toEqual(['x := 3', 'param 3', 'param x', 'call two, 2']);
	});

	it('copies a subscript the assigned value changes', () => {
		expect(lines('a[x] = (x = 2);')).toEqual(['t1 := x', 'x := 2', 'a[t1] := 2']);
		expect(lines('a[x] = y;')).toEqual(['a[x] := y']);
	});

	it('an assignment to an element does not change a variable', () => {
		expect(lines('y = x + (a[0] = 5);')).toEqual(['a[0] := 5', 't1 := x + 5', 'y := t1']);
	});
});

describe('names', () => {
	it('temporaries restart in every function; labels run through the program', () => {
		const p = ir(
			'int f(int n) { if (n) return n + 1; return n * 2; } void main(void) { int x; x = 1 + 2; if (x) x = 0; }'
		);
		expect(p.quads.map(quadText)).toEqual([
			'begin f',
			'if_false n goto L1',
			't1 := n + 1',
			'return t1',
			'goto L2',
			'L1:',
			'L2:',
			't2 := n * 2',
			'return t2',
			'end f',
			'begin main',
			't1 := 1 + 2',
			'x := t1',
			'if_false x goto L3',
			'x := 0',
			'goto L4',
			'L3:',
			'L4:',
			'end main'
		]);
	});

	it('a local that hides another name gets a number', () => {
		const p = ir(
			'int x; void main(void) { int y; x = 1; y = 2; { int x; x = 3; { int y; y = x; } } { int y; y = 4; } }'
		);
		expect(p.quads.map(quadText)).toEqual([
			'begin main',
			'x := 1',
			'y := 2',
			'x.2 := 3',
			'y.2 := x.2',
			'y.3 := 4',
			'end main'
		]);
		// The operands name different symbols.
		const symbols = p.quads
			.slice(1, 6)
			.map((q) => (q.result?.kind === 'var' ? q.result.symbol : -1));
		expect(new Set(symbols).size).toBe(5);
		expect([...p.functions[0].names.values()].sort()).toEqual(['x', 'x.2', 'y', 'y.2', 'y.3']);
	});

	it('a parameter or outer local that hides a global keeps its name', () => {
		const p = ir('int n; int f(int n) { return n; } void main(void) { int n; n = f(n); }');
		expect(p.quads.map(quadText)).toEqual([
			'begin f',
			'return n',
			'end f',
			'begin main',
			'param n',
			't1 := call f, 1',
			'n := t1',
			'end main'
		]);
	});

	it('a variable spelled like a temporary is told apart', () => {
		const p = ir('void main(void) { int t1; int t2; t1 = 1; t2 = t1 + t1; }', 'extended');
		expect(p.quads.map(quadText)).toEqual([
			'begin main',
			't1.2 := 1',
			't1 := t1.2 + t1.2',
			't2.2 := t1',
			'end main'
		]);
		expect(p.quads[2].arg1).toMatchObject({ kind: 'var' });
		expect(p.quads[2].result).toMatchObject({ kind: 'temp', name: 't1' });
	});

	it('a variable spelled like a label is told apart', () => {
		const p = ir(
			'int L2; void main(void) { int L1; L1 = input(); if (L1) L2 = L1 + 1; else L2 = 0; while (L2) L2 = L2 - 1; }',
			'extended'
		);
		expect(p.quads.map(quadText)).toEqual([
			'begin main',
			't1 := call input, 0',
			'L1.2 := t1',
			'if_false L1.2 goto L1',
			't2 := L1.2 + 1',
			'L2.2 := t2',
			'goto L2',
			'L1:',
			'L2.2 := 0',
			'L2:',
			'L3:',
			'if_false L2.2 goto L4',
			't3 := L2.2 - 1',
			'L2.2 := t3',
			'goto L3',
			'L4:',
			'end main'
		]);
		expect(p.quads.map(formatQuad)).toContain('if_false L1.2 _ L1');
		expect(p.quads[3].arg1).toMatchObject({ kind: 'var', name: 'L1.2' });
		expect(p.quads[3].result).toEqual({ kind: 'label', name: 'L1' });
		expect([...p.functions[0].names.values()].sort()).toEqual(['L1.2', 'L2.2']);
		// A name that only starts like one keeps its spelling, and so does every name in letters mode.
		const plain = ir(
			'void main(void) { int L; int Lx1; int t; L = 1; Lx1 = L; t = Lx1; }',
			'extended'
		);
		expect([...plain.functions[0].names.values()].sort()).toEqual(['L', 'Lx1', 't']);
	});

	it('a global declared after a function is not in its names', () => {
		const p = ir('void f(void) { } int late; void main(void) { late = 1; }');
		expect([...p.functions[0].names.values()]).toEqual([]);
		expect([...p.functions[1].names.values()]).toEqual(['late']);
	});
});

describe('the program', () => {
	const source = `int g;
int f(int n) { return n + g; }
void main(void)
{
  int x;
  x = f(2) * 3;
  if (x > 4) output(x);
}`;
	const c = compile(source, { optimize: false });
	const p = c.ir!;

	it('lists the functions with their quads', () => {
		expect(p.functions.map((f) => [f.name, f.from, f.to])).toEqual([
			['f', 0, 4],
			['main', 4, p.quads.length]
		]);
		expect(functionRanges(p.quads).map((r) => [r.name, r.from, r.to])).toEqual([
			['f', 0, 4],
			['main', 4, p.quads.length]
		]);
		for (const f of p.functions) {
			expect(p.quads[f.from]).toMatchObject({
				op: 'begin',
				arg1: { kind: 'function', name: f.name }
			});
			expect(p.quads[f.to - 1]).toMatchObject({
				op: 'end',
				arg1: { kind: 'function', name: f.name }
			});
		}
	});

	it('ids are the positions of the quads', () => {
		expect(p.quads.map((q) => q.id)).toEqual(p.quads.map((_, i) => i));
	});

	it('every quad carries the node and the source text it came from', () => {
		const program = c.parse!.program;
		const text = (q: (typeof p.quads)[number]) => source.slice(q.span!.start, q.span!.end);
		for (const q of p.quads) {
			expect(q.span).not.toBeNull();
			expect(findNode(program, q.node!)).not.toBeNull();
		}
		expect(p.quads.map((q) => [quadText(q), text(q)])).toEqual([
			['begin f', 'int f(int n)'],
			['t1 := n + g', 'n + g'],
			['return t1', 'return n + g;'],
			['end f', '}'],
			['begin main', 'void main(void)'],
			['param 2', '2'],
			['t1 := call f, 1', 'f(2)'],
			['t2 := t1 * 3', 'f(2) * 3'],
			['x := t2', 'x = f(2) * 3'],
			['t3 := x > 4', 'x > 4'],
			['if_false t3 goto L1', 'if (x > 4)'],
			['param x', 'x'],
			['call output, 1', 'output(x)'],
			['goto L2', 'if (x > 4)'],
			['L1:', 'if (x > 4)'],
			['L2:', 'if (x > 4)'],
			['end main', '}']
		]);
		const kinds = new Map(allNodes(program).map((n) => [n.id, n.kind]));
		expect(kinds.get(p.quads[7].node!)).toBe('Binary');
		expect(kinds.get(p.quads[10].node!)).toBe('If');
		expect(kinds.get(p.quads[0].node!)).toBe('FunDecl');
	});

	it('else and the labels of an if point at the else keyword', () => {
		const q = compile('void main(void) { int x; if (x) x = 1; else x = 2; }', { optimize: false })
			.ir!.quads;
		expect(q.map((x) => [quadText(x), x.span!.start])).toEqual([
			['begin main', 0],
			['if_false x goto L1', 25],
			['x := 1', 32],
			['goto L2', 39],
			['L1:', 39],
			['x := 2', 44],
			['L2:', 25],
			['end main', 51]
		]);
	});

	it('printQuads aligns the four columns', () => {
		expect(printQuads(p.quads.slice(0, 4))).toBe(
			['begin   f   _  _', '+       n   g  t1', 'return  t1  _  _', 'end     f   _  _'].join('\n')
		);
		expect(printQuads([])).toBe('');
	});

	it('printCode indents everything but labels and function marks', () => {
		expect(printCode(p.quads.slice(9, 17))).toBe(
			[
				'    t3 := x > 4',
				'    if_false t3 goto L1',
				'    param x',
				'    call output, 1',
				'    goto L2',
				'L1:',
				'L2:',
				'end main'
			].join('\n')
		);
	});

	it('temporariesOf lists the temporaries in order of appearance', () => {
		const main = p.functions[1];
		expect(temporariesOf(p.quads.slice(main.from, main.to))).toEqual(['t1', 't2', 't3']);
		expect(temporariesOf(p.quads.slice(0, 1))).toEqual([]);
	});
});

describe('operands', () => {
	it('operandText and quadColumns', () => {
		expect(operandText(constant(5))).toBe('#5');
		expect(operandText(constant(-2))).toBe('#-2');
		expect(operandText(temporary(3))).toBe('t3');
		expect(operandText(label(7))).toBe('L7');
		expect(operandText({ kind: 'count', value: 2 })).toBe('2');
		expect(operandText({ kind: 'var', name: 'x.2', symbol: 9 })).toBe('x.2');
		expect(operandText(null)).toBe('_');
		expect(
			quadColumns({
				id: 0,
				op: '[]=',
				arg1: constant(1),
				arg2: temporary(2),
				result: { kind: 'var', name: 'a', symbol: 4 },
				node: null,
				span: null
			})
		).toEqual(['[]=', '#1', 't2', 'a']);
	});

	it('sameOperand compares by what is named', () => {
		expect(sameOperand(constant(1), constant(1))).toBe(true);
		expect(sameOperand(constant(1), constant(2))).toBe(false);
		expect(sameOperand(constant(1), { kind: 'count', value: 1 })).toBe(false);
		expect(sameOperand(temporary(1), temporary(1))).toBe(true);
		expect(sameOperand(temporary(1), label(1))).toBe(false);
		expect(
			sameOperand({ kind: 'var', name: 'x', symbol: 3 }, { kind: 'var', name: 'x', symbol: 4 })
		).toBe(false);
		expect(
			sameOperand({ kind: 'var', name: 'x', symbol: 3 }, { kind: 'var', name: 'x', symbol: 3 })
		).toBe(true);
		expect(sameOperand(null, null)).toBe(true);
		expect(sameOperand(null, constant(0))).toBe(false);
	});

	it('a negative constant reads as written', () => {
		expect(
			quadText({
				id: 0,
				op: ':=',
				arg1: constant(-3),
				arg2: null,
				result: temporary(1),
				node: null,
				span: null
			})
		).toBe('t1 := -3');
	});
});
