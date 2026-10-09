/**
 * The whole compiler, end to end: every sample program gives the same output
 * from the AST interpreter and from the TM code, with the optimizer off and
 * on and before and after the peephole pass; and so do a few hundred random
 * programs.
 */
import { describe, expect, it } from 'vitest';
import { IADDR_SIZE } from '$lib/tools/tiny-vm/machine';
import type { TmCode } from './codegen';
import {
	PHASES,
	codeQuads,
	compile,
	finalCode,
	interpretCompilation,
	runCompilation,
	type Compilation
} from './compile';
import { interpret } from './interpret';
import { formatQuad } from './ir';
import { runTM, type StopReason } from './run';
import { arith } from './runtime';
import { SAMPLES, UNDECLARED_SOURCE, sampleById } from './samples';
import type { IdentifierMode } from './scanner';
import { random, randomProgram } from './test-helpers';

interface Outcome {
	stop: StopReason;
	outputs: number[];
}

/** The five ways to run a program: each gives [name, stop reason, outputs]. */
function allRuns(
	source: string,
	inputs: readonly number[],
	maxSteps?: number,
	identifiers: IdentifierMode = 'letters'
) {
	const plain = compile(source, { optimize: false, identifiers });
	const optimized = compile(source, { optimize: true, identifiers });
	for (const c of [plain, optimized]) {
		if (c.stoppedAt !== null) throw new Error(`does not compile: ${JSON.stringify(c.diagnostics)}`);
	}
	const reference = interpretCompilation(plain, inputs, { maxSteps: 50_000_000 })!;
	const runs: [string, Outcome][] = [['interpreter', reference]];
	const codes: [string, TmCode][] = [
		['TM code', plain.codegen!.code],
		['TM code, peephole', plain.codegen!.peephole.code],
		['optimized TM code', optimized.codegen!.code],
		['optimized TM code, peephole', optimized.codegen!.peephole.code]
	];
	for (const [name, code] of codes) {
		// A program compiles when its code fits after the peephole pass; the code before it may not.
		if (code.instructions.length <= IADDR_SIZE)
			runs.push([name, runTM(code, inputs, { maxSteps })]);
	}
	return runs.map(([name, r]) => [name, r.stop, r.outputs] as const);
}

/** Runs the program all five ways, checks that they agree, and returns the common outcome. */
function agreed(
	source: string,
	inputs: readonly number[],
	identifiers: IdentifierMode = 'letters'
): Outcome {
	const runs = allRuns(source, inputs, undefined, identifiers);
	const [, stop, outputs] = runs[0];
	expect(runs).toEqual(runs.map(([name]) => [name, stop, outputs]));
	return { stop, outputs };
}

const halted = (...outputs: number[]): Outcome => ({ stop: 'halted', outputs });

/** What each sample prints, worked out here in JavaScript. */
const EXPECTED: Record<string, (inputs: readonly number[]) => Outcome> = {
	gcd: ([a, b]) => {
		while (b !== 0) [a, b] = [b, a % b];
		return halted(a);
	},
	factorial: ([n]) => {
		let product = 1;
		for (let i = 2; i <= n; i++) product = Math.imul(product, i);
		return halted(product, product);
	},
	fibonacci: ([n]) => {
		const fib = [0, 1];
		for (let i = 2; i <= n; i++) fib.push(fib[i - 1] + fib[i - 2]);
		return halted(...fib.slice(0, n), fib[n]);
	},
	sort: (inputs) => halted(...[...inputs].sort((a, b) => a - b)),
	scopes: ([x]) => halted(30, 32, x + 2),
	'local-array': ([step]) => halted(28 * step),
	'nested-calls': ([x, y]) => halted(2 * x + y * y),
	'assignment-value': (inputs) => {
		const end = inputs.indexOf(0);
		if (end === -1) return { stop: 'input-exhausted', outputs: [] };
		const read = inputs.slice(0, end);
		return halted(
			read.length,
			read.reduce((s, v) => s + v, 0)
		);
	},
	'deep-recursion': ([n]) => halted(n),
	'zero-divide': ([a, b]) =>
		b === 0 ? { stop: 'zero-divide', outputs: [a] } : halted(a, arith('/', a, b)!, b),
	'negative-subscript': ([i]) =>
		i < 0 ? { stop: 'negative-subscript', outputs: [7] } : halted(7, i === 0 ? 7 : 0, 1)
};

describe('the sample programs', () => {
	const runnable = SAMPLES.filter((s) => s.id !== 'undeclared');

	it('there are twelve, and all but the one with undeclared names compile', () => {
		expect(SAMPLES.map((s) => s.id)).toEqual([
			'gcd',
			'factorial',
			'fibonacci',
			'sort',
			'scopes',
			'local-array',
			'nested-calls',
			'assignment-value',
			'deep-recursion',
			'undeclared',
			'zero-divide',
			'negative-subscript'
		]);
		for (const s of runnable) {
			expect(compile(s.source).diagnostics).toEqual([]);
			expect(compile(s.source, { optimize: false }).diagnostics).toEqual([]);
			expect(EXPECTED[s.id]).toBeDefined();
			expect(s.inputs.length).toBeGreaterThanOrEqual(3);
		}
		expect(sampleById('gcd')).toBe(SAMPLES[0]);
		expect(sampleById('nothing')).toBeUndefined();
	});

	for (const sample of runnable) {
		it(`${sample.id}: interpreter and TM code agree, optimizer off and on`, () => {
			for (const inputs of sample.inputs) {
				expect([inputs, agreed(sample.source, inputs)]).toEqual([
					inputs,
					EXPECTED[sample.id](inputs)
				]);
			}
		});
	}

	it('gcd by Euclid, recursive, with the remainder computed as a - a / b * b', () => {
		const source = sampleById('gcd')!.source;
		expect(source).toContain('a - a / b * b');
		expect(agreed(source, [48, 18]).outputs).toEqual([6]);
		expect(agreed(source, [270, 192]).outputs).toEqual([6]);
		expect(agreed(source, [13, 13]).outputs).toEqual([13]);
		expect(agreed(source, [1, 1000000]).outputs).toEqual([1]);
	});

	it('factorial: 12! fits, 13! wraps around', () => {
		const source = sampleById('factorial')!.source;
		expect(agreed(source, [12]).outputs).toEqual([479001600, 479001600]);
		expect(agreed(source, [13]).outputs).toEqual([1932053504, 1932053504]);
		expect(agreed(source, [6]).outputs).toEqual([720, 720]);
	});

	it('Fibonacci', () => {
		expect(agreed(sampleById('fibonacci')!.source, [10]).outputs).toEqual([
			0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55
		]);
	});

	it('selection sort through a function that takes the array as a parameter', () => {
		const source = sampleById('sort')!.source;
		expect(source).toContain('void sort(int a[], int n)');
		expect(agreed(source, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]).outputs).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9
		]);
		expect(agreed(source, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]).outputs).toEqual(Array(10).fill(4));
		// Nine numbers are not enough.
		expect(agreed(source, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({
			stop: 'input-exhausted',
			outputs: []
		});
	});

	it('nested blocks with shadowed variables', () => {
		expect(agreed(sampleById('scopes')!.source, [100]).outputs).toEqual([30, 32, 102]);
	});

	it('deep recursion that still fits in memory, and one that does not', () => {
		const source = sampleById('deep-recursion')!.source;
		expect(agreed(source, [120]).outputs).toEqual([120]);
		// 1000 records of 7 cells do not fit in 1024 cells.
		const c = compile(source);
		expect(c.codegen!.frames.find((f) => f.function === 'depth')!.size).toBe(7);
		expect(runCompilation(c, [1000])).toMatchObject({ stop: 'memory-error', outputs: [] });
		expect(runCompilation(compile(source, { optimize: false }), [1000])).toMatchObject({
			stop: 'memory-error',
			outputs: []
		});
	});

	it('division by zero stops the machine with the zero-divide result', () => {
		const source = sampleById('zero-divide')!.source;
		expect(agreed(source, [12, 0])).toEqual({ stop: 'zero-divide', outputs: [12] });
		const c = compile(source);
		const r = runCompilation(c, [12, 0])!;
		expect(r.stop).toBe('zero-divide');
		// The instruction that stopped is the DIV of `a / b`.
		const at = finalCode(c)!.instructions[r.pc!];
		expect(at.instr.op).toBe('DIV');
		expect(source.slice(at.span!.start, at.span!.end)).toBe('a / b');
	});

	it('a negative subscript halts', () => {
		const source = sampleById('negative-subscript')!.source;
		expect(agreed(source, [-1])).toEqual({ stop: 'negative-subscript', outputs: [7] });
		expect(agreed(source, [-2147483648])).toEqual({ stop: 'negative-subscript', outputs: [7] });
		const c = compile(source);
		const r = runCompilation(c, [-1])!;
		expect(r.pc).toBe(finalCode(c)!.negativeSubscriptAddress);
		expect(runCompilation(c, [2])).toMatchObject({ stop: 'halted', outputs: [7, 0, 1] });
	});
});

describe('the program of the lecture deck', () => {
	const c = compile(UNDECLARED_SOURCE);

	it('is void main (void) { int x; y = input (); output (z); }', () => {
		expect(UNDECLARED_SOURCE).toBe('void main (void) { int x; y = input (); output (z); }');
		expect(sampleById('undeclared')!.source).toBe(UNDECLARED_SOURCE);
	});

	it('scans and parses', () => {
		expect(c.scan.diagnostics).toEqual([]);
		expect(c.scan.tokens.map((t) => t.type)).toEqual([
			'VOID',
			'ID',
			'LPAREN',
			'VOID',
			'RPAREN',
			'LBRACE',
			'INT',
			'ID',
			'SEMI',
			'ID',
			'ASSIGN',
			'ID',
			'LPAREN',
			'RPAREN',
			'SEMI',
			'ID',
			'LPAREN',
			'ID',
			'RPAREN',
			'SEMI',
			'RBRACE',
			'ENDFILE'
		]);
		expect(c.parse!.ok).toBe(true);
	});

	it('stops in the semantic analyzer with exactly two undeclared-identifier errors', () => {
		expect(c.stoppedAt).toBe('semantic');
		expect(c.diagnostics).toEqual([
			{
				severity: 'error',
				phase: 'semantic',
				message: 'y is not declared.',
				span: { start: 26, end: 27, line: 1, column: 27, source: null }
			},
			{
				severity: 'error',
				phase: 'semantic',
				message: 'z is not declared.',
				span: { start: 48, end: 49, line: 1, column: 49, source: null }
			}
		]);
		expect(c.semantic!.ok).toBe(false);
		expect([c.ir, c.optimized, c.codegen]).toEqual([null, null, null]);
		expect(runCompilation(c, [])).toBeNull();
		expect(interpretCompilation(c, [])).toBeNull();
		expect(finalCode(c)).toBeNull();
		expect(codeQuads(c)).toBeNull();
	});

	it('declaring y and z makes it compile and run', () => {
		const fixed = UNDECLARED_SOURCE.replace('int x;', 'int x; int y; int z;').replace(
			'(z)',
			'(z = y)'
		);
		expect(agreed(fixed, [41]).outputs).toEqual([41]);
	});
});

describe('compile', () => {
	it('keeps the result of every phase', () => {
		const c = compile(sampleById('gcd')!.source);
		expect(c.stoppedAt).toBeNull();
		expect(c.source).toBe(sampleById('gcd')!.source);
		expect(c.options).toEqual({ identifiers: 'letters', optimize: true });
		expect(c.scan.tokens.length).toBeGreaterThan(50);
		expect(c.scan.trivia.some((t) => t.kind === 'comment')).toBe(true);
		expect(c.parse!.program.decls.map((d) => d.name)).toEqual(['remainder', 'gcd', 'main']);
		expect(c.semantic!.functions.map((f) => f.name)).toEqual(['remainder', 'gcd', 'main']);
		expect(c.ir!.functions.map((f) => f.name)).toEqual(['remainder', 'gcd', 'main']);
		expect(c.optimized!.program.quads.length).toBeLessThan(c.ir!.quads.length);
		expect(c.codegen!.ok).toBe(true);
		expect(c.codegen!.peephole.code.instructions.length).toBeLessThan(
			c.codegen!.code.instructions.length
		);
		expect(PHASES).toEqual(['scanner', 'parser', 'semantic', 'ir', 'optimizer', 'codegen']);
	});

	it('the code comes from the optimized quads when the optimizer runs', () => {
		const on = compile(sampleById('factorial')!.source);
		const off = compile(sampleById('factorial')!.source, { optimize: false });
		expect(codeQuads(on)).toBe(on.optimized!.program);
		expect(off.optimized).toBeNull();
		expect(codeQuads(off)).toBe(off.ir);
		expect(off.options.optimize).toBe(false);
		expect(off.ir!.quads.map(formatQuad)).toEqual(on.ir!.quads.map(formatQuad));
		// Every instruction of a function points into the quads the code came from.
		for (const c of [on, off]) {
			const quads = codeQuads(c)!.quads;
			for (const i of finalCode(c)!.instructions) {
				if (i.quad !== null) expect(quads[i.quad]).toBeDefined();
			}
		}
		expect(finalCode(on)!.instructions.length).toBeLessThan(finalCode(off)!.instructions.length);
	});

	it('stops at the scanner', () => {
		const c = compile('void main(void) { int x; x = 3 $ 4; }');
		expect(c.stoppedAt).toBe('scanner');
		expect(c.diagnostics).toEqual([
			{
				severity: 'error',
				phase: 'scanner',
				message: 'Illegal character "$": no token starts with it.',
				span: { start: 31, end: 32, line: 1, column: 32, source: null }
			}
		]);
		expect(c.scan.tokens.some((t) => t.type === 'ERROR')).toBe(true);
		expect([c.parse, c.semantic, c.ir, c.optimized, c.codegen]).toEqual([
			null,
			null,
			null,
			null,
			null
		]);
	});

	it('stops at the parser', () => {
		const c = compile('void main(void) { int x; x = ; }');
		expect(c.stoppedAt).toBe('parser');
		expect(c.diagnostics.map((d) => [d.phase, d.message])).toEqual([
			['parser', 'Expected an expression, found ";".']
		]);
		// The tree of what did parse is there to look at.
		expect(c.parse!.program.decls).toHaveLength(1);
		expect([c.semantic, c.ir, c.optimized, c.codegen]).toEqual([null, null, null, null]);
		expect(interpretCompilation(c, [])).toBeNull();
	});

	it('stops at the semantic analyzer', () => {
		const c = compile('void main(void) { int x; x = y; }');
		expect(c.stoppedAt).toBe('semantic');
		expect(c.semantic!.symbols.some((s) => s.name === 'x')).toBe(true);
		expect([c.ir, c.optimized, c.codegen]).toEqual([null, null, null]);
	});

	it('stops at the code generator when the program does not fit the machine', () => {
		const c = compile('int a[2000]; void main(void) { a[0] = 1; }');
		expect(c.stoppedAt).toBe('codegen');
		expect(c.diagnostics.map((d) => d.phase)).toEqual(['codegen']);
		expect(c.codegen).not.toBeNull();
		expect(finalCode(c)).toBeNull();
		expect(runCompilation(c, [])).toBeNull();
		// The interpreter has no memory limit.
		expect(interpretCompilation(c, [])).toMatchObject({ stop: 'halted' });
	});

	it('a warning does not stop the compilation', () => {
		const c = compile('int f(int n) { if (n) return 1; } void main(void) { output(f(1)); }');
		expect(c.stoppedAt).toBeNull();
		expect(c.diagnostics).toMatchObject([{ severity: 'warning', phase: 'semantic' }]);
		expect(runCompilation(c, [])).toMatchObject({ stop: 'halted', outputs: [1] });
	});

	it('identifiers: letters by default, extended on request', () => {
		const source =
			'void main(void) { int count_1; int t2; count_1 = 4; t2 = count_1 * 2; output(t2); }';
		const letters = compile(source);
		expect(letters.stoppedAt).toBe('scanner');
		const extended = compile(source, { identifiers: 'extended' });
		expect(extended.stoppedAt).toBeNull();
		expect(extended.options.identifiers).toBe('extended');
		expect(runCompilation(extended, [])!.outputs).toEqual([8]);
		expect(interpretCompilation(extended, [])!.outputs).toEqual([8]);
		const plain = compile(source, { identifiers: 'extended', optimize: false });
		expect(runCompilation(plain, [])!.outputs).toEqual([8]);
		// The variable t2 and the temporaries are different things.
		expect(plain.ir!.quads.map(formatQuad)).toContain('* count_1 #2 t1');
		expect(plain.ir!.quads.map(formatQuad)).toContain(':= t1 _ t2.2');
	});

	it('in letters mode x1 is two tokens, so int x1; is a syntax error', () => {
		const c = compile('void main(void) { int x1; }');
		expect(c.stoppedAt).toBe('parser');
		expect(c.diagnostics[0].message).toBe('Expected ";" or "[" after the name x, found "1".');
	});

	it('the result is plain data: it survives a structured clone', () => {
		const c = compile(sampleById('sort')!.source);
		const copy = structuredClone(c) as Compilation;
		expect(copy.codegen!.peephole.code.listing).toBe(c.codegen!.peephole.code.listing);
		expect(copy.semantic!.refs).toEqual(c.semantic!.refs);
		expect(copy.ir!.functions[0].names).toEqual(c.ir!.functions[0].names);
		// And it still runs.
		expect(runCompilation(copy, [3, 1, 2, 0, 0, 0, 0, 0, 0, 0])!.outputs).toEqual([
			0, 0, 0, 0, 0, 0, 0, 1, 2, 3
		]);
		expect(
			interpret(copy.parse!.program, copy.semantic!, [3, 1, 2, 0, 0, 0, 0, 0, 0, 0]).outputs
		).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
	});

	it('compiling twice gives the same result', () => {
		const source = sampleById('sort')!.source;
		const a = compile(source);
		const b = compile(source);
		expect(b.codegen!.peephole.code.listing).toBe(a.codegen!.peephole.code.listing);
		expect(b.optimized!.log).toEqual(a.optimized!.log);
	});

	it('never throws on text that is not a program', () => {
		const texts = [
			'',
			' ',
			'}',
			'int',
			'void main(void)',
			'void main(void) {',
			'/*',
			'int x; int x; int x;',
			'void main(void) { main = main; main[main] = main(main); }',
			'int f(int f) { return f(f); } void main(void) { }',
			'int a[3]; void main(void) { a = a[a]; a(); a[0](); }',
			'void main(void) { return 1 + ; } }}}} {{{{',
			'\u0000￿\ud800',
			'x'.repeat(5000),
			'('.repeat(5000),
			'void main(void) { ' + 'if (1) '.repeat(3000) + '; }'
		];
		for (const text of texts) {
			const c = compile(text);
			expect(c.stoppedAt).not.toBeNull();
			expect(c.diagnostics.some((d) => d.severity === 'error')).toBe(true);
		}
	});
});

describe('robustness', () => {
	it('compiles and runs thousands of damaged programs without throwing', () => {
		const rnd = random(11);
		const pieces = [
			' ',
			';',
			'(',
			')',
			'{',
			'}',
			'[',
			']',
			'=',
			'+',
			'-',
			'*',
			'/',
			'<',
			',',
			'0',
			'7'
		];
		const words = [
			'int',
			'void',
			'if',
			'else',
			'while',
			'return',
			'x',
			'a',
			'main',
			'input',
			'output'
		];
		const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
		const sources = SAMPLES.map((s) => s.source);
		const stopped = new Map<string, number>();
		let ran = 0;
		for (let n = 0; n < 3000; n++) {
			let text = pick(sources);
			for (let edits = 1 + Math.floor(rnd() * 3); edits > 0; edits--) {
				const at = Math.floor(rnd() * text.length);
				const kind = rnd();
				if (kind < 0.3) text = text.slice(0, at) + text.slice(at + 1 + Math.floor(rnd() * 6));
				else if (kind < 0.6) text = text.slice(0, at) + pick(pieces) + text.slice(at);
				else if (kind < 0.8) text = `${text.slice(0, at)} ${pick(words)} ${text.slice(at)}`;
				else text = text.slice(0, at) + pick(pieces) + text.slice(at + 1);
			}
			const c = compile(text, { optimize: n % 2 === 0 });
			stopped.set(String(c.stoppedAt), (stopped.get(String(c.stoppedAt)) ?? 0) + 1);
			expect(c.stoppedAt === null).toBe(!c.diagnostics.some((d) => d.severity === 'error'));
			for (const d of c.diagnostics) {
				expect(d.message.length).toBeGreaterThan(5);
				if (d.span) expect(d.span.line).toBeGreaterThanOrEqual(1);
			}
			if (c.stoppedAt !== null) continue;
			// Whatever the damage did to the program's meaning, running it ends in a stop reason.
			const inputs = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
			const onMachine = runCompilation(c, inputs, { maxSteps: 20_000 })!;
			const interpreted = interpretCompilation(c, inputs, { maxSteps: 20_000 })!;
			expect(typeof onMachine.stop).toBe('string');
			expect(typeof interpreted.stop).toBe('string');
			ran++;
		}
		// The edits reach every phase, and many damaged programs still compile.
		expect([...stopped.keys()].sort()).toEqual(['null', 'parser', 'scanner', 'semantic']);
		expect(ran).toBeGreaterThan(300);
		expect(stopped.get('semantic')).toBeGreaterThan(100);
	});
});

describe('order of evaluation agrees everywhere', () => {
	const cases: [string, number[], number[]][] = [
		// [body of main, inputs, outputs]
		['int x; x = 1; output(x + (x = 5)); output(x);', [], [6, 5]],
		['int x; x = 1; output((x = 5) + x);', [], [10]],
		['int x; x = 2; output(x * (x = x + 1) * x);', [], [18]],
		[
			'int a[3]; int i; i = 0; a[i] = (i = 2); output(a[0]); output(a[2]); output(i);',
			[],
			[2, 0, 2]
		],
		['int a[3]; int i; i = 1; a[0] = 7; a[1] = 8; output(a[i = 0] + a[i + 1]);', [], [15]],
		['output(input() - input());', [10, 3], [7]],
		['output(input() / input() * input());', [20, 6, 5], [15]],
		['int x; int y; x = y = input(); output(x + y);', [21], [42]],
		['int x; if (x = input()) output(x); else output(0 - 1);', [0], [-1]],
		['int x; x = 0; while ((x = x + 1) < 4) output(x);', [], [1, 2, 3]]
	];

	for (const [body, inputs, outputs] of cases) {
		it(body, () => {
			expect(agreed(`void main(void) { ${body} }`, inputs)).toEqual({ stop: 'halted', outputs });
		});
	}

	it('a global read before a call that changes it keeps its old value', () => {
		const source = `int g;
int bump(void) { g = g + 10; return 1; }
int pair(int a, int b) { return a * 100 + b; }
void main(void)
{
  g = 1;
  output(g + bump());
  output(bump() + g);
  output(pair(g, bump()));
  output(pair(bump(), g));
}`;
		expect(agreed(source, []).outputs).toEqual([2, 22, 2101, 141]);
	});

	it('what is printed before a stop is the same', () => {
		expect(agreed('int a[2]; void main(void) { a[0 - 1] = input(); }', [5])).toEqual({
			stop: 'negative-subscript',
			outputs: []
		});
		// The value is computed (and printed from) before the subscript is tested.
		const source = `int a[2];
int noisy(int n) { output(n); return n; }
void main(void) { a[noisy(0 - 1)] = noisy(7); output(9); }`;
		expect(agreed(source, [])).toEqual({ stop: 'negative-subscript', outputs: [-1, 7] });
		expect(agreed(`void main(void) { output(1); output(2 / (3 - 3)); output(4); }`, [])).toEqual({
			stop: 'zero-divide',
			outputs: [1]
		});
		expect(agreed('void main(void) { output(input()); output(input()); }', [8])).toEqual({
			stop: 'input-exhausted',
			outputs: [8]
		});
	});

	it('an unused division or array read still stops the program', () => {
		expect(agreed('void main(void) { int z; z = 0; output(1); 5 / z; output(2); }', []).stop).toBe(
			'zero-divide'
		);
		expect(
			agreed('int a[2]; void main(void) { int i; i = 0 - 1; output(1); a[i]; output(2); }', [])
		).toEqual({ stop: 'negative-subscript', outputs: [1] });
		expect(
			agreed('void main(void) { int z; z = input(); output(1); z * 0 / z; output(2); }', [0])
		).toEqual({ stop: 'zero-divide', outputs: [1] });
	});
});

describe('more programs', () => {
	const programs: [string, string, number[], number[]][] = [
		[
			'an element assigned three times over',
			'void main(void) { int a[3]; a[0] = a[1] = a[2] = 7; output(a[0] + a[1] + a[2]); }',
			[],
			[21]
		],
		[
			'six parameters, in order',
			`int weigh(int a, int b, int c, int d, int e, int f) { return a + 2 * b + 3 * c + 4 * d + 5 * e + 6 * f; }
void main(void) { output(weigh(1, 2, 3, 4, 5, 6)); output(weigh(input(), input(), 0, 0, 0, input())); }`,
			[10, 20, 30],
			[91, 230]
		],
		[
			'a local array handed down a recursion and filled on the way',
			`void fill(int v[], int n) { if (n < 0) return; v[n] = n * n; fill(v, n - 1); }
int total(int v[], int n) { if (n < 0) return 0; return v[n] + total(v, n - 1); }
void main(void) { int squares[6]; fill(squares, 5); output(total(squares, 5)); output(squares[3]); }`,
			[],
			[55, 9]
		],
		[
			'two arrays through two levels of calls',
			`int g[4];
void copy(int from[], int to[], int n) { int i; i = 0; while (i < n) { to[i] = from[i]; i = i + 1; } }
void twice(int a[], int b[]) { copy(a, b, 4); copy(b, a, 2); }
void main(void) { int loc[4]; int i; i = 0; while (i < 4) { loc[i] = i + 1; i = i + 1; } twice(loc, g); output(g[0] * 1000 + g[1] * 100 + g[2] * 10 + g[3]); }`,
			[],
			[1234]
		],
		[
			'return from inside nested loops',
			`int find(int target)
{
  int i; int j;
  i = 0;
  while (i < 5) {
    j = 0;
    while (j < 5) {
      if (i * j == target) return i * 10 + j;
      j = j + 1;
    }
    i = i + 1;
  }
  return 0 - 1;
}
void main(void) { output(find(6)); output(find(16)); output(find(7)); }`,
			[],
			[23, 44, -1]
		],
		[
			'return from main inside a loop',
			'void main(void) { int n; n = 0; while (1) { n = n + 1; output(n); if (n == 3) return; } output(99); }',
			[],
			[1, 2, 3]
		],
		[
			'an expression nested 150 levels deep',
			`void main(void) { int x; x = input(); output(${'x + ('.repeat(150)}1${')'.repeat(150)}); }`,
			[2],
			[301]
		],
		[
			'fifty statements in a row',
			`void main(void) { int x; x = input(); ${'x = x * 3 - x - x + 1; '.repeat(50)} output(x); }`,
			[5],
			[55]
		],
		[
			'mutual work between a global and the functions that change it',
			`int count;
int next(void) { count = count + 1; return count; }
int square(int n) { return n * n; }
void main(void) { output(next() + next() * next()); output(square(next()) - count); output(count + next() + count); }`,
			[],
			[7, 12, 14]
		],
		[
			'while with a call in its condition',
			`int left;
int more(void) { left = left - 1; return left > 0; }
void main(void) { left = input(); while (more()) output(left); output(0 - left); }`,
			[4],
			[3, 2, 1, 0]
		],
		[
			'a dangling else in a loop',
			`void main(void) { int i; i = 0; while (i < 6) { if (i > 1) if (i < 4) output(i); else output(0 - i); i = i + 1; } }`,
			[],
			[2, 3, -4, -5]
		],
		[
			'numbers at the edge of 32 bits',
			`void main(void) { int big; big = 2147483647; output(big); output(big + 1); output(0 - big - 1); output((big + 1) / (0 - 1)); output(big * big); output(big / big + (0 - big) / big); }`,
			[],
			[2147483647, -2147483648, -2147483648, -2147483648, 1, 0]
		]
	];

	for (const [name, source, inputs, outputs] of programs) {
		it(name, () => {
			expect(agreed(source, inputs)).toEqual({ stop: 'halted', outputs });
		});
	}

	it('extended identifiers: variables spelled like temporaries and labels', () => {
		const source = `int t1; int L1;
int t2(int t3, int L2) { int t1; t1 = t3 * L2 + L1; return t1 - t2_(t3); }
int t2_(int x_1) { return x_1 + t1; }
void main(void) { int t4; t1 = 5; L1 = 7; t4 = t2(2, 3) + t1 * (L1 - 1); if (t4 > t1) output(t4); output(t2(t1, L1)); }`;
		// t2 calls t2_ before it is declared.
		expect(compile(source, { identifiers: 'extended' }).diagnostics.map((d) => d.message)).toEqual([
			't2_ is not declared.'
		]);
		const fixed = `int t1; int L1;
int t2_(int x_1) { return x_1 + t1; }
int t2(int t3, int L2) { int t1; t1 = t3 * L2 + L1; return t1 - t2_(t3); }
void main(void) { int t4; t1 = 5; L1 = 7; t4 = t2(2, 3) + t1 * (L1 - 1); if (t4 > t1) output(t4); output(t2(t1, L1)); }`;
		expect(agreed(fixed, [], 'extended')).toEqual({ stop: 'halted', outputs: [36, 32] });
	});
});

describe('random programs', () => {
	it('the generator writes programs that compile', () => {
		const rnd = random(1);
		for (let n = 0; n < 50; n++) {
			const { source } = randomProgram(rnd);
			const c = compile(source);
			if (c.stoppedAt !== null && c.stoppedAt !== 'codegen') {
				throw new Error(`${JSON.stringify(c.diagnostics, null, 1)}\n${source}`);
			}
			expect(c.diagnostics.filter((d) => d.phase !== 'codegen')).toEqual([]);
		}
	});

	it('interpreter, TM code and optimized TM code print the same for 400 random programs', () => {
		const rnd = random(Number(process.env.CMINUS_FUZZ_SEED ?? 435));
		const stops = new Map<string, number>();
		let compared = 0;
		let tooLarge = 0;
		let outOfTime = 0;
		let printed = 0;
		for (let n = 0; n < 400; n++) {
			const { source, inputs } = randomProgram(rnd);
			if ([false, true].some((optimize) => compile(source, { optimize }).stoppedAt === 'codegen')) {
				tooLarge++;
				continue;
			}
			const runs = allRuns(source, inputs, 3_000_000);
			if (runs.some(([, stop]) => stop === 'step-budget')) {
				outOfTime++;
				continue;
			}
			const [, stop, outputs] = runs[0];
			for (const [name, s, o] of runs) {
				if (s !== stop || o.length !== outputs.length || o.some((v, i) => v !== outputs[i])) {
					throw new Error(
						`program ${n}: ${name} gives ${s} ${JSON.stringify(o)}, the interpreter ${stop} ${JSON.stringify(outputs)}\ninputs ${JSON.stringify(inputs)}\n${source}`
					);
				}
			}
			compared++;
			printed += outputs.length;
			stops.set(stop, (stops.get(stop) ?? 0) + 1);
		}
		// Most programs are compared, they print something, and every way to stop comes up.
		expect(compared).toBeGreaterThan(350);
		expect(outOfTime).toBeLessThan(10);
		expect(tooLarge).toBeLessThan(40);
		expect(printed).toBeGreaterThan(600);
		expect(stops.get('halted')).toBeGreaterThan(200);
		expect(stops.get('zero-divide')).toBeGreaterThan(0);
		expect(stops.get('negative-subscript')).toBeGreaterThan(0);
		expect(stops.get('input-exhausted')).toBeGreaterThan(0);
		expect([...stops.keys()].sort()).toEqual([
			'halted',
			'input-exhausted',
			'negative-subscript',
			'zero-divide'
		]);
	}, 120_000);

	it('the optimizer finds work in random programs and never grows them', () => {
		const rnd = random(77);
		const passes = new Set<string>();
		for (let n = 0; n < 100; n++) {
			const c = compile(randomProgram(rnd).source);
			if (!c.optimized) continue;
			expect(c.optimized.program.quads.length).toBeLessThanOrEqual(c.ir!.quads.length);
			for (const entry of c.optimized.log) passes.add(entry.pass);
		}
		passes.delete('keep');
		expect([...passes].sort()).toEqual(
			[
				'branch',
				'constant',
				'copy',
				'dead-temp',
				'fold',
				'identity',
				'jump',
				'label',
				'retarget'
			].sort()
		);
	});
});
