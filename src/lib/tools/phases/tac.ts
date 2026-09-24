/**
 * Three-address code (quads: op, arg1, arg2, result) and the optimizer
 * (Intro (cont'd), slide 4).
 *
 * Addresses are variable names, immediates `#2.3`, temporaries `t1, t2, …`,
 * and labels `L1, L2, …`. An `if` becomes
 *
 *   relop a b t   ·   if_false t _ L1   ·   <then>   ·   goto _ _ L2   ·   L1:   ·   <else>   ·   L2:
 *
 * (the same shape without an else part, so `goto L2` then jumps to the next
 * instruction).
 */
import type { BinOp, RelOp } from './parser';
import { formatConstant, type DeclInfo, type TExpr, type TStmt, type Type } from './semantic';

export type QuadOp = BinOp | RelOp | 'int2fp' | ':=' | 'if_false' | 'goto' | 'label';

export interface Quad {
	op: QuadOp;
	arg1: string | null;
	arg2: string | null;
	result: string | null;
	/** Operand type of arithmetic, comparisons, conversions, and copies. */
	type?: Type;
}

export type QuadField = 'op' | 'arg1' | 'arg2' | 'result';

const ARITH = new Set<QuadOp>(['+', '-', '*', '/']);
const RELOPS = new Set<QuadOp>(['==', '!=', '<', '<=', '>', '>=']);

export const isArith = (op: QuadOp) => ARITH.has(op);
export const isRelop = (op: QuadOp) => RELOPS.has(op);
export const isTemp = (a: string | null): a is string => a !== null && /^t\d+$/.test(a);
export const isImmediate = (a: string | null): a is string => a !== null && a.startsWith('#');

/** "int2fp B1 _ t1": the four columns, `_` for an empty one. */
export function formatQuad(q: Quad): string {
	return [q.op, q.arg1 ?? '_', q.arg2 ?? '_', q.result ?? '_'].join(' ');
}

export function generateTac(stmts: readonly TStmt[]): Quad[] {
	const out: Quad[] = [];
	let temps = 0;
	let labels = 0;
	const temp = () => `t${++temps}`;
	const label = () => `L${++labels}`;

	function expr(e: TExpr): string {
		switch (e.kind) {
			case 'id':
				return e.name;
			case 'num':
				return `#${e.text}`;
			case 'int2fp': {
				const a = expr(e.arg);
				const t = temp();
				out.push({ op: 'int2fp', arg1: a, arg2: null, result: t, type: 'float' });
				return t;
			}
			case 'bin': {
				const a = expr(e.left);
				const b = expr(e.right);
				const t = temp();
				out.push({ op: e.op, arg1: a, arg2: b, result: t, type: e.type ?? 'int' });
				return t;
			}
		}
	}

	function stmt(s: TStmt) {
		if (s.kind === 'assign') {
			const a = expr(s.value);
			out.push({
				op: ':=',
				arg1: a,
				arg2: null,
				result: s.target.name,
				type: s.target.type ?? 'int'
			});
			return;
		}
		const a = expr(s.cond.left);
		const b = expr(s.cond.right);
		const t = temp();
		out.push({ op: s.cond.op, arg1: a, arg2: b, result: t, type: s.cond.operandType ?? 'int' });
		const l1 = label();
		const l2 = label();
		out.push({ op: 'if_false', arg1: t, arg2: null, result: l1 });
		stmt(s.then);
		out.push({ op: 'goto', arg1: null, arg2: null, result: l2 });
		out.push({ op: 'label', arg1: null, arg2: null, result: l1 });
		if (s.else) stmt(s.else);
		out.push({ op: 'label', arg1: null, arg2: null, result: l2 });
	}

	for (const s of stmts) stmt(s);
	return out;
}

// ---------------------------------------------------------------------------
// Optimizer
// ---------------------------------------------------------------------------

export interface OptimizedQuad extends Quad {
	/** Fields the optimizer rewrote (highlighted in the table). */
	changed: QuadField[];
}

export interface Change {
	kind: 'propagate' | 'fold' | 'copy';
	text: string;
}

export interface OptimizeOutput {
	quads: OptimizedQuad[];
	changes: Change[];
}

/** Value of an immediate operand, `#2.3` → 2.3. */
const immediateValue = (a: string) => Number(a.slice(1));

function fold(op: QuadOp, x: number, y: number, type: Type): number | null {
	let v: number;
	switch (op) {
		case '+':
			v = x + y;
			break;
		case '-':
			v = x - y;
			break;
		case '*':
			v = x * y;
			break;
		case '/':
			if (y === 0) return null;
			v = type === 'int' ? Math.trunc(x / y) : x / y;
			break;
		default:
			return null;
	}
	if (!Number.isFinite(v) || (type === 'int' && !Number.isSafeInteger(v))) return null;
	return v;
}

/**
 * 1. Constant propagation: a use of a declared constant becomes its value (C → #2.3).
 * 2. Constant folding: an operation whose operands are all immediates is computed
 *    at compile time, and its temporary is replaced by the value.
 * 3. Copy elimination: `op a b t` followed by `:= t _ x` becomes `op a b x`.
 */
export function optimizeTac(
	quads: readonly Quad[],
	table: ReadonlyMap<string, DeclInfo>
): OptimizeOutput {
	const changes: Change[] = [];
	const propagated = new Set<string>();

	// 1 and 2 in one forward pass: temporaries are assigned once, before use.
	const known = new Map<string, string>();
	const pass: OptimizedQuad[] = [];
	for (const q of quads) {
		const out: OptimizedQuad = { ...q, changed: [] };
		for (const field of ['arg1', 'arg2'] as const) {
			const a = q[field];
			if (a === null) continue;
			const info = table.get(a);
			if (info && info.constant !== null && !isTemp(a)) {
				out[field] = `#${formatConstant(info.constant, info.type)}`;
				out.changed.push(field);
				if (!propagated.has(a)) {
					propagated.add(a);
					changes.push({
						kind: 'propagate',
						text: `${a} is the constant ${formatConstant(info.constant, info.type)}: ${a} → ${out[field]}.`
					});
				}
			} else if (known.has(a)) {
				out[field] = known.get(a)!;
				out.changed.push(field);
			}
		}
		if (isTemp(out.result) && out.type) {
			if (out.op === 'int2fp' && isImmediate(out.arg1)) {
				const value = `#${formatConstant(immediateValue(out.arg1), 'float')}`;
				known.set(out.result, value);
				changes.push({ kind: 'fold', text: `int2fp ${out.arg1} folded to ${value}.` });
				continue;
			}
			if (isArith(out.op) && isImmediate(out.arg1) && isImmediate(out.arg2)) {
				const v = fold(out.op, immediateValue(out.arg1), immediateValue(out.arg2), out.type);
				if (v !== null) {
					const value = `#${formatConstant(v, out.type)}`;
					known.set(out.result, value);
					changes.push({
						kind: 'fold',
						text: `${out.arg1} ${out.op} ${out.arg2} folded to ${value}.`
					});
					continue;
				}
			}
		}
		pass.push(out);
	}

	// 3. Copy elimination.
	const uses = new Map<string, number>();
	for (const q of pass)
		for (const a of [q.arg1, q.arg2]) if (isTemp(a)) uses.set(a, (uses.get(a) ?? 0) + 1);
	const result: OptimizedQuad[] = [];
	for (const q of pass) {
		const prev = result[result.length - 1];
		if (
			q.op === ':=' &&
			isTemp(q.arg1) &&
			prev &&
			prev.result === q.arg1 &&
			uses.get(q.arg1) === 1 &&
			(isArith(prev.op) || prev.op === 'int2fp')
		) {
			changes.push({
				kind: 'copy',
				text: `${q.arg1} removed: ${prev.op} writes ${q.result} directly instead of copying ${q.arg1} to it.`
			});
			prev.result = q.result;
			if (!prev.changed.includes('result')) prev.changed.push('result');
			continue;
		}
		result.push(q);
	}
	return { quads: result, changes };
}
