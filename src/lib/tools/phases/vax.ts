/**
 * Code generator and peephole optimizer for a VAX-like two-operand machine
 * (Intro (cont'd), slide 4: `MOVF #2.3,r1 ; ADDF2 r1,r2 ; MOVF r2,A`).
 *
 * Instructions are `OP src,dst`. Suffix L = int (longword), F = float.
 *   MOVx s,d          d := s
 *   ADDx2 s,d         d := d + s      (also SUBx2, MULx2, DIVx2: d := d − s, d × s, d ÷ s)
 *   CVTLF s,d         d := float(s)
 *   CMPx a,b          compare a with b; then BEQL BNEQ BLSS BLEQ BGTR BGEQ branch on a ? b
 *   BRB L             branch always
 *
 * The code generator translates one quad at a time and keeps it simple: the
 * first operand of an operation goes into a register that receives the result
 * (for + and *, the operand a temporary already holds), the second operand is
 * loaded into r1, and a result that belongs to a variable is stored with a
 * MOV. Temporaries live in r2, r3, …. The peephole optimizer then removes the
 * loads the machine does not need.
 */
import type { RelOp } from './parser';
import { isRelop, isTemp, type Quad } from './tac';
import type { Type } from './semantic';

export type Instr = { kind: 'op'; op: string; args: string[] } | { kind: 'label'; label: string };

export const op = (name: string, args: string[]): Instr => ({ kind: 'op', op: name, args });

/** "ADDF2 r1,r2", or "L1:" for a label. */
export function formatInstr(i: Instr): string {
	return i.kind === 'label' ? `${i.label}:` : `${i.op} ${i.args.join(',')}`;
}

const ARITH: Record<string, string> = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV' };

/** Branch taken when the comparison is false (the jump of `if_false`). */
export const BRANCH_IF_NOT: Record<RelOp, string> = {
	'==': 'BNEQ',
	'!=': 'BEQL',
	'<': 'BGEQ',
	'<=': 'BGTR',
	'>': 'BLEQ',
	'>=': 'BLSS'
};

const suffix = (t: Type | undefined) => (t === 'float' ? 'F' : 'L');
const isRegister = (a: string) => /^r\d+$/.test(a);

export function generateCode(quads: readonly Quad[]): Instr[] {
	const out: Instr[] = [];
	const regOf = new Map<string, string>();
	const busy = new Set<number>();
	const pending = new Map<string, RelOp>();

	const alloc = () => {
		let n = 2;
		while (busy.has(n)) n++;
		busy.add(n);
		return `r${n}`;
	};
	const free = (r: string) => busy.delete(Number(r.slice(1)));
	/** The register holding a temporary; the temporary is used up. */
	const take = (a: string | null): string | null => {
		if (a === null) return null;
		const r = regOf.get(a) ?? null;
		if (r) regOf.delete(a);
		return r;
	};
	const store = (result: string, reg: string, s: string) => {
		if (isTemp(result)) regOf.set(result, reg);
		else {
			out.push(op(`MOV${s}`, [reg, result]));
			free(reg);
		}
	};

	for (const q of quads) {
		const s = suffix(q.type);
		switch (q.op) {
			case 'label':
				out.push({ kind: 'label', label: q.result! });
				break;
			case 'goto':
				out.push(op('BRB', [q.result!]));
				break;
			case 'if_false': {
				const rel = pending.get(q.arg1!);
				if (rel) {
					pending.delete(q.arg1!);
					out.push(op(BRANCH_IF_NOT[rel], [q.result!]));
				} else {
					// Not produced by the generator; branch when the value is 0.
					const r = take(q.arg1);
					out.push(op('CMPL', [r ?? q.arg1!, '#0']));
					if (r) free(r);
					out.push(op('BEQL', [q.result!]));
				}
				break;
			}
			case ':=': {
				const r = take(q.arg1);
				out.push(op(`MOV${s}`, [r ?? q.arg1!, q.result!]));
				if (r) free(r);
				break;
			}
			case 'int2fp': {
				const r = take(q.arg1);
				const dst = r ?? alloc();
				out.push(op('CVTLF', [r ?? q.arg1!, dst]));
				store(q.result!, dst, 'F');
				break;
			}
			default: {
				let [a, b] = [q.arg1!, q.arg2!];
				// + and * commute: compute into the register a temporary already holds.
				if ((q.op === '+' || q.op === '*') && !regOf.has(a) && regOf.has(b)) [a, b] = [b, a];
				let dst = take(a);
				if (!dst) {
					dst = alloc();
					out.push(op(`MOV${s}`, [a, dst]));
				}
				const held = take(b);
				if (!held) out.push(op(`MOV${s}`, [b, 'r1']));
				const src = held ?? 'r1';
				if (isRelop(q.op)) {
					out.push(op(`CMP${s}`, [dst, src]));
					free(dst);
					pending.set(q.result!, q.op as RelOp);
				} else {
					out.push(op(`${ARITH[q.op]}${s}2`, [src, dst]));
					store(q.result!, dst, s);
				}
				if (held) free(held);
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Peephole optimizer
// ---------------------------------------------------------------------------

export type PeepholeRule = 'fold' | 'self-move' | 'jump';

export interface Rewrite {
	rule: PeepholeRule;
	/** The window before and after, formatted. */
	before: string[];
	after: string[];
	reason: string;
}

export interface PeepholeOutput {
	code: Instr[];
	/** Per instruction of `code`: produced by a rewrite. */
	rewritten: boolean[];
	rewrites: Rewrite[];
}

const TWO_OPERAND = /^(ADD|SUB|MUL|DIV)([LF])2$/;
const BRANCHES = new Set(['BRB', 'BEQL', 'BNEQ', 'BLSS', 'BLEQ', 'BGTR', 'BGEQ']);

/** Operand positions an instruction only reads, with the type it reads them as. */
function readOnly(i: Instr): { index: number; type: string }[] {
	if (i.kind !== 'op') return [];
	const m = TWO_OPERAND.exec(i.op);
	if (m) return [{ index: 0, type: m[2] }];
	if (i.op === 'MOVL' || i.op === 'MOVF') return [{ index: 0, type: i.op[3] }];
	if (i.op === 'CVTLF') return [{ index: 0, type: 'L' }];
	if (i.op === 'CMPL' || i.op === 'CMPF')
		return [
			{ index: 0, type: i.op[3] },
			{ index: 1, type: i.op[3] }
		];
	return [];
}

function uses(i: Instr): string[] {
	if (i.kind !== 'op' || BRANCHES.has(i.op)) return [];
	if (TWO_OPERAND.test(i.op) || i.op.startsWith('CMP')) return i.args.filter(isRegister);
	return i.args.slice(0, 1).filter(isRegister);
}

function defs(i: Instr): string[] {
	if (i.kind !== 'op' || BRANCHES.has(i.op) || i.op.startsWith('CMP')) return [];
	return i.args.slice(1, 2).filter(isRegister);
}

/** Registers live after each instruction (backward dataflow over the branches). */
export function liveAfter(code: readonly Instr[]): Set<string>[] {
	const labelAt = new Map<string, number>();
	code.forEach((i, k) => {
		if (i.kind === 'label') labelAt.set(i.label, k);
	});
	const succ = code.map((i, k) => {
		const next = k + 1 < code.length ? [k + 1] : [];
		if (i.kind !== 'op' || !BRANCHES.has(i.op)) return next;
		const target = labelAt.get(i.args[0]);
		const jump = target === undefined ? [] : [target];
		return i.op === 'BRB' ? jump : [...next, ...jump];
	});
	const liveIn = code.map(() => new Set<string>());
	const liveOut = code.map(() => new Set<string>());
	let changed = true;
	while (changed) {
		changed = false;
		for (let k = code.length - 1; k >= 0; k--) {
			const out = new Set<string>();
			for (const s of succ[k]) for (const r of liveIn[s]) out.add(r);
			const inn = new Set(out);
			for (const r of defs(code[k])) inn.delete(r);
			for (const r of uses(code[k])) inn.add(r);
			if (inn.size !== liveIn[k].size || out.size !== liveOut[k].size) changed = true;
			liveIn[k] = inn;
			liveOut[k] = out;
		}
	}
	return liveOut;
}

/**
 * Rules, applied until none applies:
 * - fold: `MOVx s,rX ; OP rX,d` → `OP s,d` when OP only reads rX and rX is not
 *   used afterwards (`MOVF #2.3,r1 ; ADDF2 r1,r2` → `ADDF2 #2.3,r2`);
 * - self-move: drop `MOVx a,a`;
 * - jump: drop a branch to the instruction right after it.
 */
export function peephole(input: readonly Instr[]): PeepholeOutput {
	const code = input.map((i) => (i.kind === 'op' ? { ...i, args: [...i.args] } : { ...i }));
	const rewritten = code.map(() => false);
	const rewrites: Rewrite[] = [];
	// Registers live after each instruction, computed once per pass. A rewrite
	// only shortens live ranges before it, so the table stays safe to use.
	let live = new Map<Instr, Set<string>>();

	const tryAt = (k: number): boolean => {
		const a = code[k];
		if (a.kind !== 'op') return false;

		if ((a.op === 'MOVL' || a.op === 'MOVF') && a.args[0] === a.args[1]) {
			rewrites.push({
				rule: 'self-move',
				before: [formatInstr(a)],
				after: [],
				reason: `it moves ${a.args[0]} to itself`
			});
			code.splice(k, 1);
			rewritten.splice(k, 1);
			return true;
		}

		if (BRANCHES.has(a.op)) {
			for (let j = k + 1; j < code.length; j++) {
				const next = code[j];
				if (next.kind !== 'label') break;
				if (next.label === a.args[0]) {
					rewrites.push({
						rule: 'jump',
						before: [formatInstr(a)],
						after: [],
						reason: `${a.args[0]} is the next instruction`
					});
					code.splice(k, 1);
					rewritten.splice(k, 1);
					return true;
				}
			}
			return false;
		}

		const b = code[k + 1];
		if ((a.op !== 'MOVL' && a.op !== 'MOVF') || !b || b.kind !== 'op') return false;
		const [src, reg] = a.args;
		if (!isRegister(reg) || src === reg) return false;
		if (b.args.filter((x) => x === reg).length !== 1) return false;
		const at = readOnly(b).find((p) => b.args[p.index] === reg);
		if (!at || at.type !== a.op[3]) return false;
		if (live.get(b)?.has(reg) ?? true) return false;
		const folded: Instr = op(
			b.op,
			b.args.map((x, n) => (n === at.index ? src : x))
		);
		live.set(folded, live.get(b)!);
		rewrites.push({
			rule: 'fold',
			before: [formatInstr(a), formatInstr(b)],
			after: [formatInstr(folded)],
			reason: `${reg} is not used afterwards`
		});
		code.splice(k, 2, folded);
		rewritten.splice(k, 2, true);
		return true;
	};

	let changed = true;
	while (changed) {
		changed = false;
		const after = liveAfter(code);
		live = new Map(code.map((i, k) => [i, after[k]]));
		for (let k = 0; k < code.length; k++) {
			if (tryAt(k)) {
				changed = true;
				k = Math.max(-1, k - 2);
			}
		}
	}
	return { code, rewritten, rewrites };
}
