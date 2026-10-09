import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { formatQuad, quadText } from './ir';
import { basicBlocks, isLeader, optimize, type OptimizeResult } from './optimize';
import { SAMPLES } from './samples';

const DECLS =
	'int g; int arr[10]; int f(int n) { return n; } void p(void) { g = g + 1; } int two(int a, int b) { return a; } ';

function run(body: string, decls = DECLS): OptimizeResult {
	const c = compile(`${decls}void main(void) { int x; int y; int z; int a[5]; ${body} }`);
	expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return c.optimized!;
}

/** The optimized quads of main, in the one-line form, without begin and end. */
function opt(body: string, decls = DECLS): string[] {
	const { program } = run(body, decls);
	const main = program.functions[program.functions.length - 1];
	return program.quads.slice(main.from + 1, main.to - 1).map(quadText);
}

const passes = (body: string) =>
	run(body)
		.log.filter((l) => l.function === 'main')
		.map((l) => l.pass);

describe('constant folding', () => {
	it('computes an operation on two constants', () => {
		expect(opt('x = 2 + 3;')).toEqual(['x := 5']);
		expect(opt('x = 2 * 3 + 4 * 5;')).toEqual(['x := 26']);
		expect(opt('x = 7 / 2; y = (0 - 7) / 2;')).toEqual(['x := 3', 'y := -3']);
		expect(opt('x = 10 - 3 - 2;')).toEqual(['x := 5']);
	});

	it('folds relational operators to 0 or 1', () => {
		expect(opt('x = 1 < 2; y = 2 <= 1; z = 3 == 3;')).toEqual(['x := 1', 'y := 0', 'z := 1']);
		expect(opt('x = 1 != 1; y = 2 > 1; z = 1 >= 2;')).toEqual(['x := 0', 'y := 1', 'z := 0']);
	});

	it('wraps around at 32 bits as the machine does', () => {
		expect(opt('x = 2147483647 + 1;')).toEqual(['x := -2147483648']);
		expect(opt('x = 65536 * 65536;')).toEqual(['x := 0']);
		expect(opt('x = 0 - 2147483647 - 2;')).toEqual(['x := 2147483647']);
		expect(opt('x = (0 - 2147483647 - 1) / (0 - 1);')).toEqual(['x := -2147483648']);
	});

	it('never folds a division by zero', () => {
		expect(opt('x = 6 / 0;')).toEqual(['x := 6 / 0']);
		expect(opt('y = 0; x = 6 / y;')).toEqual(['y := 0', 'x := 6 / 0']);
		expect(opt('x = 6 / (3 - 3);')).toEqual(['x := 6 / 0']);
		const { log } = run('x = 6 / 0;');
		expect(log.filter((l) => l.function === 'main')).toEqual([
			{
				pass: 'keep',
				round: 1,
				function: 'main',
				quad: expect.any(Number),
				before: 't1 := 6 / 0',
				after: 't1 := 6 / 0',
				text: '6 / 0 is not computed: the division stops the program when it runs.'
			},
			expect.objectContaining({ pass: 'retarget' }),
			expect.objectContaining({ pass: 'retarget' })
		]);
	});

	it('0 / x is not 0: x may be 0', () => {
		expect(opt('x = 0 / y;')).toEqual(['x := 0 / y']);
	});
});

describe('constant propagation', () => {
	it('carries a constant to the uses in the same block', () => {
		expect(opt('x = 4; y = x + 1; z = x * y;')).toEqual(['x := 4', 'y := 5', 'z := 20']);
		expect(opt('x = 4; output(x); a[x] = x;')).toEqual([
			'x := 4',
			'param 4',
			'call output, 1',
			'a[4] := 4'
		]);
	});

	it('a new assignment ends what was known', () => {
		expect(opt('x = 4; x = input(); y = x + 1;')).toEqual([
			'x := 4',
			'x := call input, 0',
			'y := x + 1'
		]);
		expect(opt('x = 1; x = x + y; z = x;')).toEqual(['x := 1', 'x := 1 + y', 'z := x']);
	});

	it('does not cross a label: the value may differ on another path', () => {
		expect(opt('x = 0; while (x < 3) x = x + 1; output(x);')).toEqual([
			'x := 0',
			'L1:',
			't1 := x < 3',
			'if_false t1 goto L2',
			'x := x + 1',
			'goto L1',
			'L2:',
			'param x',
			'call output, 1'
		]);
	});

	it('does not cross a branch either: a block ends at if_false', () => {
		expect(opt('x = 1; if (y) z = x; output(x);')).toEqual([
			'x := 1',
			'if_false y goto L1',
			'z := x',
			'L1:',
			'param x',
			'call output, 1'
		]);
	});

	it('a call ends what is known about globals, not about locals', () => {
		expect(opt('g = 1; x = 2; p(); y = g + x;')).toEqual([
			'g := 1',
			'x := 2',
			'call p, 0',
			'y := g + 2'
		]);
		expect(opt('g = 1; y = g + 1; p();')).toEqual(['g := 1', 'y := 2', 'call p, 0']);
	});

	it('a store into an array ends nothing about variables', () => {
		expect(opt('x = 2; a[0] = 9; y = x;')).toEqual(['x := 2', 'a[0] := 9', 'y := 2']);
	});
});

describe('copy propagation', () => {
	it('a use of a copy becomes the original', () => {
		expect(opt('x = input(); y = x; z = y + y;')).toEqual([
			'x := call input, 0',
			'y := x',
			'z := x + x'
		]);
	});

	it('ends when the original changes', () => {
		expect(opt('x = input(); y = x; x = 0; z = y;')).toEqual([
			'x := call input, 0',
			'y := x',
			'x := 0',
			'z := y'
		]);
	});

	it('ends when the copy changes', () => {
		expect(opt('x = input(); y = x; y = input(); z = y;')).toEqual([
			'x := call input, 0',
			'y := x',
			'y := call input, 0',
			'z := y'
		]);
	});

	it('a copy of a global ends at a call', () => {
		expect(opt('x = g; p(); y = x; z = g;')).toEqual(['x := g', 'call p, 0', 'y := x', 'z := g']);
		expect(opt('g = input(); x = g; p(); y = x;')).toEqual([
			'g := call input, 0',
			'x := g',
			'call p, 0',
			'y := x'
		]);
	});

	it('removes the copy made to keep the order of evaluation when it is not needed', () => {
		// g is copied before f(1) is called; x is a local, so its copy is not needed.
		expect(opt('y = g + f(1);')).toEqual(['t1 := g', 'param 1', 't2 := call f, 1', 'y := t1 + t2']);
		expect(opt('z = input(); y = z + (x = 2);')).toEqual([
			'z := call input, 0',
			'x := 2',
			'y := z + 2'
		]);
	});

	it('the copy that keeps an old value stays', () => {
		expect(opt('x = input(); y = x + (x = 5);')).toEqual([
			'x := call input, 0',
			't2 := x',
			'x := 5',
			'y := t2 + 5'
		]);
	});
});

describe('algebraic identities', () => {
	const body = (e: string) => opt(`y = input(); x = ${e};`)[1];

	it('x + 0, 0 + x and x - 0 are x', () => {
		expect(body('y + 0')).toBe('x := y');
		expect(body('0 + y')).toBe('x := y');
		expect(body('y - 0')).toBe('x := y');
	});

	it('x * 1, 1 * x and x / 1 are x', () => {
		expect(body('y * 1')).toBe('x := y');
		expect(body('1 * y')).toBe('x := y');
		expect(body('y / 1')).toBe('x := y');
	});

	it('x * 0 and 0 * x are 0', () => {
		expect(body('y * 0')).toBe('x := 0');
		expect(body('0 * y')).toBe('x := 0');
	});

	it('leaves what is not an identity', () => {
		expect(body('0 - y')).toBe('x := 0 - y');
		expect(body('1 / y')).toBe('x := 1 / y');
		expect(body('0 / y')).toBe('x := 0 / y');
		expect(body('y / 0')).toBe('x := y / 0');
		expect(body('y + 1')).toBe('x := y + 1');
		expect(body('y * 2')).toBe('x := y * 2');
	});

	it('x * 0 keeps the call that computed x', () => {
		expect(opt('x = f(3) * 0;')).toEqual(['param 3', 'call f, 1', 'x := 0']);
		expect(opt('x = 0 * input();')).toEqual(['call input, 0', 'x := 0']);
	});

	it('x * 0 keeps a division and an array read that can stop the program', () => {
		expect(opt('x = (y / z) * 0;')).toEqual(['t1 := y / z', 'x := 0']);
		expect(opt('x = a[y] * 0;')).toEqual(['t1 := a[y]', 'x := 0']);
	});

	it('identities feed the other passes', () => {
		expect(opt('y = input(); x = (y + 0) * 1 + 0 * y;')).toEqual(['y := call input, 0', 'x := y']);
		expect(passes('y = input(); x = y * 1;')).toContain('identity');
	});
});

describe('temporaries that are never used', () => {
	it('removes a pure computation whose result is unused', () => {
		expect(opt('x + 1; x * y; x < y;')).toEqual([]);
		expect(opt('x = input(); (x + 1) * 2;')).toEqual(['x := call input, 0']);
	});

	it('keeps a division whose divisor may be 0', () => {
		expect(opt('x / y;')).toEqual(['t1 := x / y']);
		expect(opt('x / 2;')).toEqual([]);
		expect(opt('x / 0;')).toEqual(['t1 := x / 0']);
	});

	it('keeps an array read whose subscript may be negative', () => {
		expect(opt('a[x];')).toEqual(['t1 := a[x]']);
		expect(opt('a[2];')).toEqual([]);
		expect(opt('a[0 - 1];')).toEqual(['t2 := a[-1]']);
	});

	it('keeps a call and drops only its result', () => {
		const c = compile(`${DECLS}void main(void) { int x; x = f(1) * 0; }`);
		const main = c.optimized!.program.functions.at(-1)!;
		expect(c.optimized!.program.quads.slice(main.from, main.to).map(formatQuad)).toEqual([
			'begin main _ _',
			'param #1 _ _',
			'call f 1 _',
			':= #0 _ x',
			'end main _ _'
		]);
		expect(c.optimized!.log.filter((l) => l.pass === 'dead-temp')).toMatchObject([
			{ before: 't2 := 0', after: null, text: 't2 is never used.' },
			{
				before: 't1 := call f, 1',
				after: 'call f, 1',
				text: 't1 is never used: the call keeps no result.'
			}
		]);
	});

	it('a chain of unused temporaries goes in one round', () => {
		const r = run('((x + 1) * 2 - 3) * 4 + 5;');
		expect(r.program.quads.slice(r.program.functions.at(-1)!.from).map(quadText)).toEqual([
			'begin main',
			'end main'
		]);
		expect(r.log.filter((l) => l.function === 'main').map((l) => [l.pass, l.round])).toEqual([
			['dead-temp', 1],
			['dead-temp', 1],
			['dead-temp', 1],
			['dead-temp', 1],
			['dead-temp', 1]
		]);
	});

	it('never removes an assignment to a variable', () => {
		expect(opt('x = 1; x = 2;')).toEqual(['x := 1', 'x := 2']);
	});
});

describe('retargeting', () => {
	it('an operation whose temporary is only copied writes the variable', () => {
		expect(opt('x = y + z;')).toEqual(['x := y + z']);
		expect(opt('x = a[y];')).toEqual(['x := a[y]']);
		expect(opt('x = f(y);')).toEqual(['param y', 'x := call f, 1']);
		expect(opt('x = x + 1;')).toEqual(['x := x + 1']);
		expect(opt('g = g * 2;')).toEqual(['g := g * 2']);
	});

	it('not when the temporary is used again', () => {
		expect(opt('x = y = z + 1;')).toEqual(['t1 := z + 1', 'y := t1', 'x := t1']);
		expect(opt('while ((x = input()) != 0) ;')).toEqual([
			'L1:',
			't1 := call input, 0',
			'x := t1',
			't2 := t1 != 0',
			'if_false t2 goto L2',
			'goto L1',
			'L2:'
		]);
	});

	it('not into an array element', () => {
		expect(opt('a[x] = y + 1;')).toEqual(['t1 := y + 1', 'a[x] := t1']);
	});
});

describe('jumps and labels', () => {
	it('removes a goto to the next quad and the label nobody jumps to', () => {
		expect(opt('if (x) y = 1;')).toEqual(['if_false x goto L1', 'y := 1', 'L1:']);
		expect(passes('if (x) y = 1;')).toEqual(['jump', 'label']);
	});

	it('keeps the jumps of an if with else and of a while', () => {
		expect(opt('if (x) y = 1; else y = 2;')).toEqual([
			'if_false x goto L1',
			'y := 1',
			'goto L2',
			'L1:',
			'y := 2',
			'L2:'
		]);
	});

	it('an if with an empty body leaves nothing', () => {
		expect(opt('if (x) ;')).toEqual([]);
		expect(opt('if (x) ; else ;')).toEqual([]);
		expect(opt('if (x < y) { }')).toEqual([]);
	});

	it('a test that may stop the program stays when its jump goes', () => {
		expect(opt('if (x / y) ;')).toEqual(['t1 := x / y']);
		expect(opt('if (f(1)) ;')).toEqual(['param 1', 'call f, 1']);
	});

	it('a constant condition becomes a goto or disappears', () => {
		expect(opt('if (0) x = 1; else x = 2;')).toEqual([
			'goto L1',
			'x := 1',
			'goto L2',
			'L1:',
			'x := 2',
			'L2:'
		]);
		expect(opt('if (1) x = 1; else x = 2;')).toEqual(['x := 1', 'goto L2', 'x := 2', 'L2:']);
		expect(opt('while (1) x = input();')).toEqual(['L1:', 'x := call input, 0', 'goto L1']);
		// Code that can no longer be reached is left in place.
		expect(opt('while (0) x = input();')).toEqual([
			'L1:',
			'goto L2',
			'x := call input, 0',
			'goto L1',
			'L2:'
		]);
		expect(opt('x = 3; if (x > 2) y = 1;')).toEqual(['x := 3', 'y := 1']);
	});

	it('merging blocks lets constants travel further', () => {
		// Once the labels of the if are gone, x = 3 reaches the output.
		expect(opt('x = 3; if (x > 2) y = x; output(x + y);')).toEqual([
			'x := 3',
			'y := 3',
			'param 6',
			'call output, 1'
		]);
	});
});

describe('the result', () => {
	const source = `${DECLS}void main(void) { int x; int y; x = 2 + 3; if (x) y = x * 1; output(y + 0); }`;
	const c = compile(source);
	const r = c.optimized!;

	it('every quad keeps the id, node and span of the quad it came from', () => {
		const original = c.ir!.quads;
		for (const q of r.program.quads) {
			expect(q.node).toBe(original[q.id].node);
			expect(q.span).toEqual(original[q.id].span);
		}
		const ids = r.program.quads.map((q) => q.id);
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('removed lists the quads that are gone', () => {
		const kept = new Set(r.program.quads.map((q) => q.id));
		expect(r.removed).toEqual(c.ir!.quads.map((q) => q.id).filter((id) => !kept.has(id)));
		expect(r.removed.length).toBeGreaterThan(0);
	});

	it('changed names the fields that were rewritten', () => {
		const main = r.program.functions.at(-1)!;
		expect(r.program.quads.slice(main.from, main.to).map((q) => [quadText(q), q.changed])).toEqual([
			['begin main', []],
			// `x := t1` and `y := t2` with their operands replaced; the folded quads are gone.
			['x := 5', ['arg1']],
			['y := 5', ['arg1']],
			['param 5', ['arg1']],
			['call output, 1', []],
			['end main', []]
		]);
		// Unoptimized quads have no such field.
		expect(c.ir!.quads.every((q) => q.changed === undefined)).toBe(true);
	});

	it('the functions are found again in the shorter code', () => {
		expect(r.program.functions.map((f) => f.name)).toEqual(['f', 'p', 'two', 'main']);
		for (const f of r.program.functions) {
			expect(r.program.quads[f.from].op).toBe('begin');
			expect(r.program.quads[f.to - 1].op).toBe('end');
		}
		expect(r.program.functions.at(-1)!.names).toBe(c.ir!.functions.at(-1)!.names);
	});

	it('the log says what each pass did, in order', () => {
		const main = r.log.filter((l) => l.function === 'main');
		expect(main[0]).toEqual({
			pass: 'fold',
			round: 1,
			function: 'main',
			quad: c.ir!.quads.findIndex((q) => quadText(q) === 't1 := 2 + 3'),
			before: 't1 := 2 + 3',
			after: 't1 := 5',
			text: '2 + 3 is 5, computed at compile time.'
		});
		expect(main.find((l) => l.pass === 'constant')).toMatchObject({
			before: 'x := t1',
			after: 'x := 5',
			text: 't1 is 5 here.'
		});
		expect(main.find((l) => l.pass === 'branch')).toMatchObject({
			before: 'if_false 5 goto L1',
			after: null,
			text: 'The condition is 5: the jump is never taken.'
		});
		// The multiplication is in another block than x = 2 + 3, so x is still a name there.
		expect(main.find((l) => l.pass === 'identity')).toMatchObject({
			before: 't2 := x * 1',
			after: 't2 := x',
			text: 'x * 1 is x.'
		});
		expect(main.find((l) => l.pass === 'jump')).toMatchObject({
			before: 'goto L2',
			after: null,
			text: 'L2 is the next quad.'
		});
		expect(main.filter((l) => l.pass === 'label').map((l) => l.text)).toEqual([
			'No quad jumps to L1.',
			'No quad jumps to L2.'
		]);
		expect(r.rounds).toBeGreaterThan(1);
		for (const l of r.log) expect(c.ir!.quads[l.quad]).toBeDefined();
	});

	it('copy propagation is logged with the name copied', () => {
		const copy = run('x = input(); y = x; z = y + 1;').log.find((l) => l.pass === 'copy');
		expect(copy).toMatchObject({
			before: 't2 := y + 1',
			after: 't2 := x + 1',
			text: 'y is a copy of x here.'
		});
	});

	it('optimizing optimized code changes nothing', () => {
		for (const s of SAMPLES.filter((s) => s.id !== 'undeclared')) {
			const first = compile(s.source);
			const again = optimize(first.optimized!.program, first.semantic!);
			expect(again.program.quads.map(formatQuad)).toEqual(
				first.optimized!.program.quads.map(formatQuad)
			);
			expect(again.log.filter((l) => l.pass !== 'keep')).toEqual([]);
			expect(again.rounds).toBe(1);
		}
	});

	it('does not change the code it is given', () => {
		const before = c.ir!.quads.map(formatQuad);
		optimize(c.ir!, c.semantic!);
		expect(c.ir!.quads.map(formatQuad)).toEqual(before);
	});
});

describe('basic blocks', () => {
	it('start at begin, at a label, and after a jump or a return', () => {
		const c = compile(
			'int f(int n) { if (n) return 1; n = n + 1; while (n < 9) n = n * 2; return n; } void main(void) { output(f(1)); }',
			{ optimize: false }
		);
		const quads = c.ir!.quads;
		const leaders = quads.filter((_, i) => isLeader(quads, i)).map(quadText);
		expect(leaders).toEqual([
			'begin f',
			'return 1',
			'goto L2',
			'L1:',
			'L2:',
			'L3:',
			't3 := n * 2',
			'L4:',
			'end f',
			'begin main'
		]);
		const blocks = basicBlocks(quads);
		expect(blocks[0].from).toBe(0);
		expect(blocks.at(-1)!.to).toBe(quads.length);
		blocks.forEach((b, i) => {
			if (i > 0) expect(b.from).toBe(blocks[i - 1].to);
			expect(isLeader(quads, b.from)).toBe(true);
			for (let k = b.from + 1; k < b.to; k++) expect(isLeader(quads, k)).toBe(false);
		});
		expect(blocks.map((b) => quadText(quads[b.from]))).toEqual(leaders);
		expect(basicBlocks([])).toEqual([]);
	});

	it('the blocks of a small function', () => {
		const c = compile('void main(void) { int n; n = input(); if (n) n = 1; output(n); }', {
			optimize: false
		});
		const quads = c.ir!.quads;
		expect(basicBlocks(quads).map((b) => quads.slice(b.from, b.to).map(quadText))).toEqual([
			['begin main', 't1 := call input, 0', 'n := t1', 'if_false n goto L1'],
			['n := 1', 'goto L2'],
			['L1:'],
			['L2:', 'param n', 'call output, 1', 'end main']
		]);
	});
});
