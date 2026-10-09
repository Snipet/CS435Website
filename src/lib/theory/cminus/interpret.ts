/**
 * A direct interpreter of the abstract syntax tree: the reference the
 * compiled code is checked against. It shares nothing with the intermediate
 * code or the code generator.
 *
 * It follows the same rules as compiled code: 32-bit integers that wrap
 * around, division truncating toward zero, operands and arguments evaluated
 * left to right, and for `a[i] = e` the subscript, then e, then the store.
 * Where compiled code leaves a value undefined the interpreter picks one: a
 * local variable starts at 0, and an int function that ends without a return
 * gives 0. It checks both bounds of a subscript; compiled code only checks
 * for a negative one.
 */
import {
	isArithOp,
	type Call,
	type Expr,
	type FunDecl,
	type Node,
	type Program,
	type Stmt
} from './ast';
import type { StopReason } from './run';
import { arith, compare } from './runtime';
import type { SemanticResult } from './semantic';
import type { SourceSpan } from './tokens';

/** Statements and expressions evaluated at most, unless `maxSteps` says otherwise. */
export const DEFAULT_INTERPRETER_STEPS = 1_000_000;
/**
 * Calls nested at most. The machine's 1024 data cells hold at most 511
 * activation records, so compiled code never goes deeper than this.
 */
export const DEFAULT_CALL_DEPTH = 512;

export interface InterpretOptions {
	/** Statements executed plus expression nodes evaluated, at most. */
	maxSteps?: number;
	maxCallDepth?: number;
}

export interface InterpretResult {
	/** The integers the program printed, in order. */
	outputs: number[];
	stop: StopReason;
	/** Statements executed plus expression nodes evaluated. */
	steps: number;
	/** Id of the node at which it stopped; null when main returned. */
	node: number | null;
	span: SourceSpan | null;
}

/** A simple variable. */
interface Cell {
	value: number;
}
type Storage = Cell | Int32Array;

class Stop {
	constructor(
		readonly reason: StopReason,
		readonly node: Node | null
	) {}
}

/**
 * Runs a checked program (no semantic errors) with the given input values.
 */
export function interpret(
	program: Program,
	semantic: SemanticResult,
	inputs: readonly number[],
	options: InterpretOptions = {}
): InterpretResult {
	const maxSteps = options.maxSteps ?? DEFAULT_INTERPRETER_STEPS;
	const maxDepth = options.maxCallDepth ?? DEFAULT_CALL_DEPTH;
	const outputs: number[] = [];
	let steps = 0;
	let inPos = 0;
	let depth = 0;
	let returned = 0;

	const functions = new Map<number, FunDecl>();
	for (const decl of program.decls) {
		const symbol = semantic.refs.get(decl.id);
		if (decl.kind === 'FunDecl' && symbol !== undefined) functions.set(symbol, decl);
	}
	const frameOf = new Map(semantic.functions.map((f) => [f.symbol, f] as const));

	const allocate = (symbolId: number): Storage => {
		const symbol = semantic.symbols[symbolId];
		return symbol.kind === 'array' ? new Int32Array(symbol.size ?? 1) : { value: 0 };
	};
	const globals = new Map<number, Storage>();
	for (const id of semantic.scopes[0].symbols) {
		if (semantic.symbols[id].kind !== 'function') globals.set(id, allocate(id));
	}
	let frame = new Map<number, Storage>();

	const tick = (node: Node) => {
		if (++steps > maxSteps) {
			steps = maxSteps;
			throw new Stop('step-budget', node);
		}
	};
	const storage = (node: Node): Storage => {
		const id = semantic.refs.get(node.id);
		const found = id === undefined ? undefined : (frame.get(id) ?? globals.get(id));
		if (!found) throw new Error(`interpret: ${node.kind} ${node.id} has no storage`);
		return found;
	};
	const cell = (node: Node): Cell => storage(node) as Cell;
	const array = (node: Node): Int32Array => storage(node) as Int32Array;
	/** Checks a subscript the way compiled code does, and the upper bound as well. */
	const checked = (a: Int32Array, i: number, node: Node): number => {
		if (i < 0) throw new Stop('negative-subscript', node);
		if (i >= a.length) throw new Stop('subscript-out-of-range', node);
		return i;
	};

	const call = (e: Call): number => {
		const symbolId = semantic.refs.get(e.id)!;
		const symbol = semantic.symbols[symbolId];
		// Arguments left to right: an array is passed itself, an int by value.
		const args: (number | Int32Array)[] = e.args.map((arg, i) =>
			symbol.params?.[i]?.type === 'array' ? array(arg) : evaluate(arg)
		);
		if (symbol.builtin) {
			if (symbol.name === 'input') {
				if (inPos >= inputs.length) throw new Stop('input-exhausted', e);
				return inputs[inPos++] | 0;
			}
			outputs.push(args[0] as number);
			return 0;
		}
		const decl = functions.get(symbolId)!;
		const info = frameOf.get(symbolId)!;
		if (depth >= maxDepth) throw new Stop('memory-error', e);
		const caller = frame;
		const callee = new Map<number, Storage>();
		info.params.forEach((id, i) => {
			const arg = args[i];
			callee.set(id, typeof arg === 'number' ? { value: arg } : arg);
		});
		for (const id of info.locals) callee.set(id, allocate(id));
		frame = callee;
		depth++;
		// Reaching the end of the body without a return gives 0.
		const value = execute(decl.body) ? returned : 0;
		depth--;
		frame = caller;
		return value;
	};

	const evaluate = (e: Expr): number => {
		tick(e);
		switch (e.kind) {
			case 'Num':
				return e.value | 0;
			case 'Var':
				return cell(e).value;
			case 'Index': {
				const i = evaluate(e.index);
				const a = array(e);
				return a[checked(a, i, e)];
			}
			case 'Call':
				return call(e);
			case 'Binary': {
				const left = evaluate(e.left);
				const right = evaluate(e.right);
				if (!isArithOp(e.op)) return compare(e.op, left, right);
				const value = arith(e.op, left, right);
				if (value === null) throw new Stop('zero-divide', e);
				return value;
			}
			case 'Assign': {
				if (e.target.kind === 'Var') {
					const value = evaluate(e.value);
					cell(e.target).value = value;
					return value;
				}
				const i = evaluate(e.target.index);
				const value = evaluate(e.value);
				const a = array(e.target);
				a[checked(a, i, e.target)] = value;
				return value;
			}
		}
	};

	/** Runs a statement; true when it executed a return (its value is in `returned`). */
	const execute = (s: Stmt): boolean => {
		tick(s);
		switch (s.kind) {
			case 'Compound':
				for (const inner of s.body) if (execute(inner)) return true;
				return false;
			case 'ExprStmt':
				if (s.expr) evaluate(s.expr);
				return false;
			case 'If':
				if (evaluate(s.test) !== 0) return execute(s.then);
				return s.else ? execute(s.else) : false;
			case 'While':
				while (evaluate(s.test) !== 0) if (execute(s.body)) return true;
				return false;
			case 'Return':
				returned = s.value ? evaluate(s.value) : 0;
				return true;
		}
	};

	const done = (stop: StopReason, node: Node | null): InterpretResult => ({
		outputs,
		stop,
		steps,
		node: node?.id ?? null,
		span: node?.span ?? null
	});

	const main = program.decls[program.decls.length - 1];
	if (!main || main.kind !== 'FunDecl') return done('halted', null);
	try {
		depth = 1;
		const info = frameOf.get(semantic.refs.get(main.id)!);
		for (const id of info?.locals ?? []) frame.set(id, allocate(id));
		execute(main.body);
		return done('halted', null);
	} catch (e) {
		if (e instanceof Stop) return done(e.reason, e.node);
		// The JavaScript stack gave out before the call-depth limit did.
		if (e instanceof RangeError) return done('memory-error', null);
		throw e;
	}
}
