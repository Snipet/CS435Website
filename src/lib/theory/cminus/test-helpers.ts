/**
 * Helpers for the C- specs: a seeded random number generator and a generator
 * of small random C- programs that are always well typed.
 */

/** A small deterministic random number generator: the same seed gives the same numbers. */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface ArrayVar {
	name: string;
	/** Subscripts 0 … size − 1 are safe. */
	size: number;
}

interface Counter {
	name: string;
	/** Inside its loop the counter runs over 0 … bound − 1. */
	bound: number;
}

interface FunctionSig {
	name: string;
	params: ('int' | 'array')[];
	returns: 'int' | 'void';
}

interface Context {
	/** Int variables that can be read (all of them hold a value). */
	readable: string[];
	/** Int variables that can be assigned (loop counters in use are not among them). */
	assignable: string[];
	arrays: ArrayVar[];
	/** Counters of the loops around this point. */
	counters: Counter[];
	/** Counters no loop around this point uses. */
	freeCounters: string[];
	/** Names declared in the innermost scope. */
	declared: Set<string>;
	functions: FunctionSig[];
	/** The function being written; null in main. */
	returns: 'int' | 'void' | null;
	loops: number;
}

type ExprKind = 'atom' | 'arith' | 'rel' | 'assign';
interface Text {
	text: string;
	kind: ExprKind;
}

const CONSTANTS = [0, 0, 1, 1, 2, 3, 4, 5, 7, 10, 13, 100, 255, 46341, 65536, 1000000, 2147483647];

/**
 * A random C- program and input list. The program is syntactically and
 * semantically correct, every loop is bounded, every variable is assigned
 * before it is read, and no subscript is past the end of its array. It may
 * divide by zero, use a negative subscript or read past the end of the input:
 * all three are defined ways to stop.
 */
export function randomProgram(rnd: () => number): { source: string; inputs: number[] } {
	const int = (n: number) => Math.floor(rnd() * n);
	const pick = <T>(list: readonly T[]): T => list[int(list.length)];
	const chance = (p: number) => rnd() < p;
	const lines: string[] = [];

	// --- Expressions ---------------------------------------------------------

	/** An operand of an operator of the given kind, parenthesized where the grammar needs it. */
	const operand = (e: Text, parent: 'arith' | 'rel'): string => {
		if (e.kind === 'atom') return e.text;
		if (e.kind === 'arith' && (parent === 'rel' || chance(0.5))) return e.text;
		return `(${e.text})`;
	};

	const subscript = (ctx: Context, a: ArrayVar): string => {
		const counters = ctx.counters.filter((c) => c.bound <= a.size);
		if (counters.length && chance(0.35)) {
			const c = pick(counters);
			// Now and then a subscript that goes negative: the program halts there.
			return chance(0.06) ? `${c.name} - ${1 + int(2)}` : c.name;
		}
		if (ctx.readable.length && chance(0.12)) {
			// v mod size: inside the array, or negative.
			const v = pick(ctx.readable);
			return `${v} - ${v} / ${a.size} * ${a.size}`;
		}
		return String(int(a.size));
	};

	const call = (ctx: Context, f: FunctionSig, depth: number): string => {
		const args = f.params.map((p) =>
			p === 'array' ? pick(ctx.arrays).name : expr(ctx, depth - 1).text
		);
		return `${f.name}(${args.join(', ')})`;
	};

	const atom = (ctx: Context, depth: number): Text => {
		const k = rnd();
		const ints = ctx.functions.filter((f) => f.returns === 'int');
		if (k < 0.05 && depth > 0 && ints.length) {
			return { text: call(ctx, pick(ints), depth), kind: 'atom' };
		}
		if (k < 0.07) return { text: 'input()', kind: 'atom' };
		if (k < 0.12 && depth > 0 && ctx.assignable.length) {
			return { text: `${pick(ctx.assignable)} = ${expr(ctx, depth - 1).text}`, kind: 'assign' };
		}
		if (k < 0.3 && ctx.arrays.length) {
			const a = pick(ctx.arrays);
			return { text: `${a.name}[${subscript(ctx, a)}]`, kind: 'atom' };
		}
		if (k < 0.75 && ctx.readable.length) return { text: pick(ctx.readable), kind: 'atom' };
		return { text: String(pick(CONSTANTS)), kind: 'atom' };
	};

	function expr(ctx: Context, depth: number): Text {
		if (depth <= 0 || chance(0.3)) return atom(ctx, depth);
		const k = rnd();
		if (k < 0.22) {
			const op = pick(['<', '<=', '>', '>=', '==', '!=']);
			return {
				text: `${operand(expr(ctx, depth - 1), 'rel')} ${op} ${operand(expr(ctx, depth - 1), 'rel')}`,
				kind: 'rel'
			};
		}
		if (k < 0.32) {
			// A divisor that is usually not zero.
			const divisor = chance(0.85) ? String(1 + int(9)) : operand(expr(ctx, depth - 1), 'arith');
			return { text: `${operand(expr(ctx, depth - 1), 'arith')} / ${divisor}`, kind: 'arith' };
		}
		const op = pick(['+', '+', '-', '-', '*']);
		return {
			text: `${operand(expr(ctx, depth - 1), 'arith')} ${op} ${operand(expr(ctx, depth - 1), 'arith')}`,
			kind: 'arith'
		};
	}

	// --- Statements ----------------------------------------------------------

	const simple = (ctx: Context, depth: number): string => {
		const k = rnd();
		if (k < 0.38 && ctx.assignable.length) {
			return `${pick(ctx.assignable)} = ${expr(ctx, depth).text};`;
		}
		if (k < 0.52 && ctx.arrays.length) {
			const a = pick(ctx.arrays);
			return `${a.name}[${subscript(ctx, a)}] = ${expr(ctx, depth).text};`;
		}
		if (k < 0.62 && ctx.functions.length) return `${call(ctx, pick(ctx.functions), depth)};`;
		if (k < 0.68) return `${expr(ctx, depth).text};`;
		if (k < 0.7) return ';';
		return `output(${expr(ctx, depth).text});`;
	};

	/** A new scope with its own variables, which may hide outer ones. */
	const scoped = (ctx: Context, depth: number, count: number, pad: string): string[] => {
		const inner: Context = {
			...ctx,
			readable: [...ctx.readable],
			assignable: [...ctx.assignable],
			arrays: [...ctx.arrays],
			declared: new Set()
		};
		const out: string[] = [];
		const init: string[] = [];
		for (let n = int(3); n > 0; n--) {
			const name = pick(['la', 'lb', 'lc', 'ld', 'ga', 'pa']);
			if (inner.declared.has(name) || ctx.counters.some((c) => c.name === name)) continue;
			inner.declared.add(name);
			out.push(`${pad}int ${name};`);
			init.push(`${pad}${name} = ${pick(CONSTANTS)};`);
			if (!inner.readable.includes(name)) inner.readable.push(name);
			if (!inner.assignable.includes(name)) inner.assignable.push(name);
		}
		if (chance(0.3)) {
			const name = pick(['ya', 'yb', 'xa']);
			if (!inner.declared.has(name)) {
				inner.declared.add(name);
				const size = 3 + int(3);
				out.push(`${pad}int ${name}[${size}];`);
				for (let i = 0; i < size; i++) init.push(`${pad}${name}[${i}] = ${pick(CONSTANTS)};`);
				inner.arrays = [...inner.arrays.filter((a) => a.name !== name), { name, size }];
			}
		}
		out.push(...init);
		for (let n = 0; n < count; n++) out.push(...statement(inner, depth, pad));
		return out;
	};

	function statement(ctx: Context, depth: number, pad: string): string[] {
		const k = rnd();
		if (depth > 0 && k < 0.16) {
			const out = [`${pad}if (${expr(ctx, 2).text})`];
			out.push(...branch(ctx, depth - 1, pad));
			if (chance(0.5)) {
				out.push(`${pad}else`);
				out.push(...branch(ctx, depth - 1, pad));
			}
			return out;
		}
		if (depth > 0 && k < 0.26 && ctx.freeCounters.length && ctx.loops < 2) {
			const name = ctx.freeCounters[0];
			const bound = 1 + int(3);
			const inner: Context = {
				...ctx,
				counters: [...ctx.counters, { name, bound }],
				freeCounters: ctx.freeCounters.slice(1),
				readable: [...ctx.readable, name],
				loops: ctx.loops + 1
			};
			const out = [`${pad}${name} = 0;`, `${pad}while (${name} < ${bound}) {`];
			for (let n = 1 + int(3); n > 0; n--) out.push(...statement(inner, depth - 1, `${pad}  `));
			out.push(`${pad}  ${name} = ${name} + 1;`, `${pad}}`);
			return out;
		}
		if (depth > 0 && k < 0.33) {
			return [`${pad}{`, ...scoped(ctx, depth - 1, 1 + int(3), `${pad}  `), `${pad}}`];
		}
		if (k < 0.38 && ctx.returns !== null) {
			const value = ctx.returns === 'int' ? ` ${expr(ctx, 2).text}` : '';
			return [`${pad}if (${expr(ctx, 1).text})`, `${pad}  return${value};`];
		}
		return [pad + simple(ctx, 2)];
	}

	/** The statement under an if or else: one statement, or a block. */
	function branch(ctx: Context, depth: number, pad: string): string[] {
		if (chance(0.4)) return [`${pad}  ${simple(ctx, 2)}`];
		return [`${pad}{`, ...scoped(ctx, depth, 1 + int(2), `${pad}  `), `${pad}}`];
	}

	// --- Declarations --------------------------------------------------------

	const globals = ['ga', 'gb', 'gc'].slice(0, 1 + int(3));
	const globalArrays: ArrayVar[] = [{ name: 'xa', size: 3 + int(4) }];
	if (chance(0.5)) globalArrays.push({ name: 'xb', size: 3 + int(4) });
	for (const g of globals) lines.push(`int ${g};`);
	for (const a of globalArrays) lines.push(`int ${a.name}[${a.size}];`);

	const functions: FunctionSig[] = [];
	const body = (
		params: string[],
		arrays: ArrayVar[],
		returns: 'int' | 'void' | null,
		count: number
	): string[] => {
		const locals = ['la', 'lb'].slice(0, 1 + int(2));
		const counters = ['ia', 'ib'];
		const ctx: Context = {
			readable: [...globals, ...params, ...locals],
			assignable: [...globals, ...params, ...locals],
			arrays: [...globalArrays.filter((g) => !arrays.some((a) => a.name === g.name)), ...arrays],
			counters: [],
			freeCounters: counters,
			declared: new Set([...params, ...locals, ...counters, ...arrays.map((a) => a.name)]),
			functions: [...functions],
			returns,
			loops: 0
		};
		const out = ['{'];
		for (const name of [...locals, ...counters]) out.push(`  int ${name};`);
		for (const name of locals) out.push(`  ${name} = ${pick(CONSTANTS)};`);
		for (let n = 0; n < count; n++) out.push(...statement(ctx, 2, '  '));
		if (returns === 'int') out.push(`  return ${expr(ctx, 2).text};`);
		out.push('}');
		return out;
	};

	if (chance(0.4)) {
		// A recursion that ends: n counts down to 0.
		const k = 1 + int(5);
		lines.push(
			'int rec(int n, int acc)',
			'{',
			'  if (n < 1)',
			'    return acc;',
			`  ${globals[0]} = ${globals[0]} + n;`,
			`  return rec(n - 1, acc * ${k} + n) - ${pick(CONSTANTS)};`,
			'}'
		);
	}
	const recursive = lines.some((l) => l.startsWith('int rec('));

	const names = ['fa', 'fb', 'fc'];
	for (let n = int(3); n > 0; n--) {
		const name = names[functions.length];
		const returns = chance(0.7) ? 'int' : 'void';
		const params: string[] = ['pa', 'pb'].slice(0, int(3));
		const arrayParam = chance(0.4);
		const header = [...params.map((p) => `int ${p}`), ...(arrayParam ? ['int za[]'] : [])];
		lines.push(`${returns} ${name}(${header.length ? header.join(', ') : 'void'})`);
		// Every array has at least 3 elements, so 0 … 2 are safe for a parameter.
		lines.push(...body(params, arrayParam ? [{ name: 'za', size: 3 }] : [], returns, 1 + int(3)));
		functions.push({
			name,
			params: [...params.map(() => 'int' as const), ...(arrayParam ? ['array' as const] : [])],
			returns
		});
	}
	// rec is only called with a small first argument (below), never by the other functions.

	lines.push('void main(void)');
	const main = body([], [], null, 3 + int(5));
	if (recursive)
		main.splice(main.length - 1, 0, `  output(rec(${1 + int(4)}, ${pick(CONSTANTS)}));`);
	lines.push(...main);

	const inputs: number[] = [];
	for (let n = 2 + int(9); n > 0; n--) inputs.push(chance(0.2) ? pick(CONSTANTS) : int(21) - 10);
	return { source: lines.join('\n') + '\n', inputs };
}
