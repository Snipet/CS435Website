/**
 * The optimizer: local passes over the three-address code that keep the
 * program's behaviour (its output, and where it stops) exactly.
 *
 * Within a basic block
 *   constant   a use of a name whose value is a known constant becomes the constant
 *   copy       a use of a name that is a copy of another name becomes that name
 *   fold       an operation on two constants is computed (never a division by 0)
 *   identity   x + 0, 0 + x, x − 0, x * 1, 1 * x, x / 1 become x; x * 0 and 0 * x become 0
 *   branch     if_false on a constant becomes a goto, or disappears
 * Across the function
 *   retarget   `t := a op b` followed by `x := t`, t not used elsewhere, becomes `x := a op b`
 *   dead-temp  a temporary that is assigned and never used is removed with its quad
 *              (only the result of a call is dropped: the call stays)
 *   jump       a goto or if_false to the quad that follows it is removed
 *   label      a label no quad jumps to is removed
 *
 * The passes repeat until nothing changes. What keeps a quad in place: a
 * call, a store, a division whose divisor may be 0 and an array read whose
 * subscript may be negative all can stop the program or change memory, so
 * they are never removed, even when their result is unused. `x * 0` is
 * rewritten whatever computed x: x is a name by then, and the quads that
 * computed it (a call among them) are still there.
 *
 * A basic block starts at `begin`, at a label, and after a goto, an if_false
 * or a return. A call ends what is known about the global variables.
 */
import { isArithOp, isRelOp, type BinaryOp } from './ast';
import {
	constant,
	functionRanges,
	operandText,
	quadText,
	sameOperand,
	type IrProgram,
	type Operand,
	type Quad,
	type QuadField
} from './ir';
import { arith, compare } from './runtime';
import type { SemanticResult } from './semantic';

export type OptimizePass =
	| 'constant'
	| 'copy'
	| 'fold'
	| 'identity'
	| 'branch'
	| 'retarget'
	| 'dead-temp'
	| 'jump'
	| 'label'
	/** Not a change: an operation on constants that is left alone. */
	| 'keep';

export interface OptimizeLogEntry {
	pass: OptimizePass;
	/** 1-based round of the passes in which it happened. */
	round: number;
	/** Name of the function. */
	function: string;
	/** `Quad.id` of the quad concerned. */
	quad: number;
	/** The quad before the change, in the one-line form. */
	before: string;
	/** The quad after it; null when the quad was removed. */
	after: string | null;
	/** What was done, in words. */
	text: string;
}

export interface OptimizeResult {
	/** The optimized code. Each quad keeps the `id`, node and span of the quad it came from. */
	program: IrProgram;
	log: OptimizeLogEntry[];
	/** Rounds of the passes that ran (the last one changes nothing). */
	rounds: number;
	/** Ids of the quads that were removed. */
	removed: number[];
}

const MAX_ROUNDS = 25;

const isBinary = (op: string): op is BinaryOp => isArithOp(op) || /^(<|<=|>|>=|==|!=)$/.test(op);

/** True for the first quad of a basic block. */
export function isLeader(quads: readonly Quad[], i: number): boolean {
	if (i === 0) return true;
	const q = quads[i];
	if (q.op === 'label' || q.op === 'begin') return true;
	const before = quads[i - 1].op;
	return before === 'goto' || before === 'if_false' || before === 'return' || before === 'end';
}

/** The basic blocks of a list of quads, as index ranges [from, to). */
export function basicBlocks(quads: readonly Quad[]): { from: number; to: number }[] {
	const blocks: { from: number; to: number }[] = [];
	for (let i = 0; i < quads.length; i++) {
		if (isLeader(quads, i)) blocks.push({ from: i, to: i + 1 });
		else blocks[blocks.length - 1].to = i + 1;
	}
	return blocks;
}

/** The fields of a quad that read a value (a place where a constant or a copy can go). */
function useFields(q: Quad): ('arg1' | 'arg2')[] {
	switch (q.op) {
		case ':=':
		case 'param':
		case 'return':
		case 'if_false':
			return ['arg1'];
		case '=[]':
			return ['arg2'];
		case '[]=':
			return ['arg1', 'arg2'];
		case 'call':
		case 'label':
		case 'goto':
		case 'begin':
		case 'end':
			return [];
		default:
			return ['arg1', 'arg2'];
	}
}

/** True when the quad writes its result field (a temporary or a variable). */
function definesResult(q: Quad): boolean {
	return (
		q.result !== null && (q.op === ':=' || q.op === '=[]' || q.op === 'call' || isBinary(q.op))
	);
}

export function optimize(ir: IrProgram, semantic: SemanticResult): OptimizeResult {
	const log: OptimizeLogEntry[] = [];
	const removed: number[] = [];
	const kept = new Set<number>();
	let rounds = 0;

	/** A name whose value can be tracked: a temporary, or an int variable or parameter. */
	const trackable = (o: Operand | null): o is Operand & { kind: 'var' | 'temp' } => {
		if (o === null) return false;
		if (o.kind === 'temp') return true;
		if (o.kind !== 'var') return false;
		const kind = semantic.symbols[o.symbol].kind;
		return kind === 'variable' || kind === 'parameter';
	};
	const isGlobal = (o: Operand): boolean =>
		o.kind === 'var' && semantic.symbols[o.symbol].depth === 0;
	const key = (o: Operand & { kind: 'var' | 'temp' }): string =>
		o.kind === 'temp' ? `t:${o.name}` : `v:${o.symbol}`;

	const out: Quad[] = [];
	for (const range of functionRanges(ir.quads)) {
		out.push(...optimizeFunction(ir.quads.slice(range.from, range.to), range.name));
	}

	/** Runs the passes over one function's quads until none of them changes anything. */
	function optimizeFunction(input: readonly Quad[], fnName: string): Quad[] {
		let round = 0;
		const note = (
			pass: OptimizePass,
			q: Quad,
			before: string,
			after: string | null,
			text: string
		) => {
			log.push({ pass, round, function: fnName, quad: q.id, before, after, text });
		};

		let quads = input.map((q) => ({ ...q }));
		for (let changed = true; changed && round < MAX_ROUNDS;) {
			round++;
			changed = false;
			for (const pass of [propagate, retarget, deadTemporaries, jumpsToNext, unusedLabels]) {
				const next = pass(quads);
				if (next) {
					quads = next;
					changed = true;
				}
			}
		}
		rounds = Math.max(rounds, round);
		return quads;

		// --- Passes: each returns the new list, or null when it changed nothing. ---

		function propagate(list: Quad[]): Quad[] | null {
			let changed = false;
			const result: Quad[] = [];
			/** Name → the constant or name it is known to equal at this point of the block. */
			const known = new Map<string, Operand>();
			/** Name → the names known to be copies of it. */
			const copies = new Map<string, Set<string>>();
			/** The names a call ends the knowledge of: globals, and copies of globals. */
			const globals = new Set<string>();
			const unlink = (k: string) => {
				const value = known.get(k);
				if (value && trackable(value)) copies.get(key(value))?.delete(k);
				known.delete(k);
				globals.delete(k);
			};
			/** A new value for `o`: what was known of it, and of its copies, ends. */
			const forget = (o: Operand) => {
				if (!trackable(o)) return;
				const k = key(o);
				unlink(k);
				const dependents = copies.get(k);
				if (!dependents) return;
				copies.delete(k);
				for (const d of dependents) unlink(d);
			};
			const learn = (target: Operand & { kind: 'var' | 'temp' }, value: Operand) => {
				const k = key(target);
				known.set(k, value);
				if (trackable(value)) {
					const of = key(value);
					const set = copies.get(of);
					if (set) set.add(k);
					else copies.set(of, new Set([k]));
				}
				if (isGlobal(target) || isGlobal(value)) globals.add(k);
			};

			for (let i = 0; i < list.length; i++) {
				let q = list[i];
				if (isLeader(list, i)) {
					known.clear();
					copies.clear();
					globals.clear();
				}

				// Constant and copy propagation.
				for (const field of useFields(q)) {
					const o = q[field];
					if (!trackable(o)) continue;
					const value = known.get(key(o));
					if (!value) continue;
					const before = quadText(q);
					q = { ...q, [field]: value };
					changed = true;
					note(
						value.kind === 'const' ? 'constant' : 'copy',
						q,
						before,
						quadText(q),
						value.kind === 'const'
							? `${o.name} is ${value.value} here.`
							: `${o.name} is a copy of ${operandText(value)} here.`
					);
				}

				// Folding and identities.
				const simpler = simplify(q);
				if (simpler === 'remove') {
					changed = true;
					removed.push(q.id);
					continue;
				}
				if (simpler) {
					q = simpler;
					changed = true;
				}

				// What the quad makes known, and what it ends.
				if (definesResult(q)) {
					const target = q.result!;
					forget(target);
					// A variable is not replaced by a temporary: `x := t1` stays the definition of x.
					if (
						q.op === ':=' &&
						trackable(target) &&
						q.arg1 !== null &&
						(q.arg1.kind === 'const' ||
							(trackable(q.arg1) && (q.arg1.kind === 'var' || target.kind === 'temp'))) &&
						!sameOperand(q.arg1, target)
					) {
						learn(target, q.arg1);
					}
				}
				if (q.op === 'call') {
					// The function called may assign to any global variable.
					for (const k of [...globals]) unlink(k);
				}
				result.push(q);
			}
			return changed ? result : null;
		}

		/** Folds or simplifies one quad; 'remove' for an if_false that never jumps. */
		function simplify(q: Quad): Quad | 'remove' | null {
			const before = quadText(q);
			const a = q.arg1;
			const b = q.arg2;
			if (q.op === 'if_false' && a?.kind === 'const') {
				if (a.value === 0) {
					const jump: Quad = { ...q, op: 'goto', arg1: null };
					note(
						'branch',
						q,
						before,
						quadText(jump),
						'The condition is 0: the jump is always taken.'
					);
					return jump;
				}
				note('branch', q, before, null, `The condition is ${a.value}: the jump is never taken.`);
				return 'remove';
			}
			if (!isBinary(q.op) || a === null || b === null) return null;
			const copy = (value: Operand, text: string): Quad => {
				const next: Quad = { ...q, op: ':=', arg1: value, arg2: null };
				note('identity', q, before, quadText(next), text);
				return next;
			};
			if (a.kind === 'const' && b.kind === 'const') {
				const value = isArithOp(q.op)
					? arith(q.op, a.value, b.value)
					: isRelOp(q.op)
						? compare(q.op, a.value, b.value)
						: null;
				if (value === null) {
					if (!kept.has(q.id)) {
						kept.add(q.id);
						note(
							'keep',
							q,
							before,
							before,
							`${a.value} / 0 is not computed: the division stops the program when it runs.`
						);
					}
					return null;
				}
				const next: Quad = { ...q, op: ':=', arg1: constant(value), arg2: null };
				note(
					'fold',
					q,
					before,
					quadText(next),
					`${a.value} ${q.op} ${b.value} is ${value}, computed at compile time.`
				);
				return next;
			}
			const isConst = (o: Operand, v: number) => o.kind === 'const' && o.value === v;
			const name = (o: Operand) => (o.kind === 'const' ? String(o.value) : operandText(o));
			switch (q.op) {
				case '+':
					if (isConst(b, 0)) return copy(a, `${name(a)} + 0 is ${name(a)}.`);
					if (isConst(a, 0)) return copy(b, `0 + ${name(b)} is ${name(b)}.`);
					return null;
				case '-':
					return isConst(b, 0) ? copy(a, `${name(a)} - 0 is ${name(a)}.`) : null;
				case '*':
					if (isConst(b, 1)) return copy(a, `${name(a)} * 1 is ${name(a)}.`);
					if (isConst(a, 1)) return copy(b, `1 * ${name(b)} is ${name(b)}.`);
					if (isConst(b, 0)) return copy(constant(0), `${name(a)} * 0 is 0.`);
					if (isConst(a, 0)) return copy(constant(0), `0 * ${name(b)} is 0.`);
					return null;
				case '/':
					return isConst(b, 1) ? copy(a, `${name(a)} / 1 is ${name(a)}.`) : null;
				default:
					return null;
			}
		}

		/** How many times each temporary is read. */
		function temporaryUses(list: readonly Quad[]): Map<string, number> {
			const uses = new Map<string, number>();
			for (const q of list) {
				// The result field of []= is the array it stores into, never a temporary.
				for (const o of [q.arg1, q.arg2])
					if (o?.kind === 'temp') uses.set(o.name, (uses.get(o.name) ?? 0) + 1);
			}
			return uses;
		}

		function retarget(list: Quad[]): Quad[] | null {
			const uses = temporaryUses(list);
			const result: Quad[] = [];
			let changed = false;
			for (const q of list) {
				const prev = result[result.length - 1];
				if (
					prev &&
					q.op === ':=' &&
					q.arg1?.kind === 'temp' &&
					q.result !== null &&
					trackable(q.result) &&
					definesResult(prev) &&
					sameOperand(prev.result, q.arg1) &&
					uses.get(q.arg1.name) === 1
				) {
					const before = quadText(prev);
					const next: Quad = { ...prev, result: q.result };
					result[result.length - 1] = next;
					note(
						'retarget',
						prev,
						before,
						quadText(next),
						`${q.arg1.name} is only copied to ${operandText(q.result)}: the result goes there directly.`
					);
					note('retarget', q, quadText(q), null, `${quadText(q)} is no longer needed.`);
					removed.push(q.id);
					changed = true;
					continue;
				}
				result.push(q);
			}
			return changed ? result : null;
		}

		/** True when running the quad can do nothing but write its result. */
		function isPure(q: Quad): boolean {
			if (q.op === ':=') return true;
			if (q.op === '/') return q.arg2?.kind === 'const' && q.arg2.value !== 0;
			if (q.op === '=[]') return q.arg2?.kind === 'const' && q.arg2.value >= 0;
			return isBinary(q.op);
		}

		function deadTemporaries(list: Quad[]): Quad[] | null {
			const uses = temporaryUses(list);
			const keep: (Quad | null)[] = [...list];
			let changed = false;
			// Backward, so that a chain of unused temporaries goes in one sweep.
			for (let i = list.length - 1; i >= 0; i--) {
				const q = list[i];
				if (!definesResult(q) || q.result?.kind !== 'temp') continue;
				if ((uses.get(q.result.name) ?? 0) > 0) continue;
				const before = quadText(q);
				if (q.op === 'call') {
					const next: Quad = { ...q, result: null };
					keep[i] = next;
					note(
						'dead-temp',
						q,
						before,
						quadText(next),
						`${q.result.name} is never used: the call keeps no result.`
					);
					changed = true;
					continue;
				}
				if (!isPure(q)) continue;
				keep[i] = null;
				removed.push(q.id);
				for (const o of [q.arg1, q.arg2])
					if (o?.kind === 'temp') uses.set(o.name, (uses.get(o.name) ?? 1) - 1);
				note('dead-temp', q, before, null, `${q.result.name} is never used.`);
				changed = true;
			}
			return changed ? keep.filter((q): q is Quad => q !== null) : null;
		}

		function jumpsToNext(list: Quad[]): Quad[] | null {
			const result: Quad[] = [];
			let changed = false;
			for (let i = 0; i < list.length; i++) {
				const q = list[i];
				if ((q.op === 'goto' || q.op === 'if_false') && q.result?.kind === 'label') {
					let j = i + 1;
					let next = false;
					for (; j < list.length && list[j].op === 'label'; j++) {
						if (sameOperand(list[j].result, q.result)) next = true;
					}
					if (next) {
						note('jump', q, quadText(q), null, `${q.result.name} is the next quad.`);
						removed.push(q.id);
						changed = true;
						continue;
					}
				}
				result.push(q);
			}
			return changed ? result : null;
		}

		function unusedLabels(list: Quad[]): Quad[] | null {
			const targets = new Set<string>();
			for (const q of list)
				if ((q.op === 'goto' || q.op === 'if_false') && q.result?.kind === 'label')
					targets.add(q.result.name);
			const result = list.filter((q) => {
				if (q.op !== 'label' || q.result?.kind !== 'label' || targets.has(q.result.name)) {
					return true;
				}
				note('label', q, quadText(q), null, `No quad jumps to ${q.result.name}.`);
				removed.push(q.id);
				return false;
			});
			return result.length < list.length ? result : null;
		}
	}

	// Mark the fields that differ from the quad each one came from.
	const fields: QuadField[] = ['op', 'arg1', 'arg2', 'result'];
	const given = new Map(ir.quads.map((q) => [q.id, q] as const));
	const quads = out.map((q) => {
		const origin = given.get(q.id)!;
		const changed = fields.filter(
			(f) =>
				origin.changed?.includes(f) ||
				(f === 'op' ? q.op !== origin.op : !sameOperand(q[f], origin[f]))
		);
		return { ...q, changed };
	});
	const names = new Map(ir.functions.map((f) => [f.symbol, f.names] as const));
	return {
		program: {
			quads,
			functions: functionRanges(quads).map((r) => ({
				...r,
				names: names.get(r.symbol) ?? new Map()
			}))
		},
		log,
		rounds,
		removed: removed.sort((x, y) => x - y)
	};
}
