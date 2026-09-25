/**
 * Positions in a run and what the machine looks like at each one.
 *
 * A position `t` counts phases from reset: each stepTM call has three
 * (fetch, decode, execute), so after `k` complete calls `t = 3k`, and
 * `3k + 1` / `3k + 2` show call `k` fetched / decoded. A call that stops early
 * (pc outside iMem at fetch, m outside dMem at decode) has fewer phases; it is
 * always the last call of a run. Stepping by instruction moves between
 * multiples of 3.
 */
import {
	DADDR_SIZE,
	IADDR_SIZE,
	PC_REG,
	cloneMachine,
	formatInstruction,
	isJump,
	type ExecRecord,
	type Machine,
	type RegWrite,
	type StepResult,
	type WaitRecord
} from './machine';
import { MAX_TRACE, RUN_BUDGET, type Trace } from './trace';

export type Granularity = 'instruction' | 'phase';

export const PHASES = ['Fetch', 'Decode', 'Execute'] as const;
export type PhaseName = (typeof PHASES)[number];

/** Last position the run reaches, or null while it has not stopped. */
export function lastPosition(trace: Trace): number | null {
	const end = trace.end;
	if (!end) return null;
	switch (end.kind) {
		case 'stopped':
			return 3 * (trace.count - 1) + end.record.phases;
		case 'waiting':
			// Fetch and decode of the waiting IN can be shown; execute needs a value.
			return 3 * trace.count + 2;
		case 'limit':
			return 3 * trace.count;
	}
}

/** Runs the trace as far as `t` needs and clamps `t` to what the run reaches. */
export function clampPosition(trace: Trace, t: number): number {
	let pos = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
	pos = Math.min(pos, 3 * MAX_TRACE);
	trace.runTo(Math.ceil(pos / 3));
	const last = lastPosition(trace);
	return last === null ? pos : Math.min(pos, last);
}

/** Where an IN with no input left stops each kind of stepping, or null. */
export function waitPosition(trace: Trace, mode: Granularity): number | null {
	if (trace.end?.kind !== 'waiting') return null;
	return 3 * trace.count + (mode === 'phase' ? 2 : 0);
}

/** The position one step forward (the same position when the run cannot go on). */
export function forward(trace: Trace, t: number, mode: Granularity): number {
	const target = mode === 'phase' ? t + 1 : 3 * Math.floor(t / 3) + 3;
	let next = clampPosition(trace, target);
	const wait = waitPosition(trace, mode);
	if (wait !== null && next > wait) next = wait;
	return Math.max(next, t);
}

/** The position one step back. */
export function back(t: number, mode: Granularity): number {
	if (t <= 0) return 0;
	if (mode === 'phase') return t - 1;
	return t % 3 ? t - (t % 3) : t - 3;
}

/**
 * Runs up to `budget` instructions from `t`: to HALT or an error, to an IN
 * that needs a value, or until the budget is spent (`budgetSpent`).
 */
export function run(
	trace: Trace,
	t: number,
	mode: Granularity,
	budget = RUN_BUDGET
): { t: number; budgetSpent: boolean } {
	const cap = 3 * (Math.floor(t / 3) + budget);
	trace.runTo(Math.floor(t / 3) + budget);
	const end = trace.end;
	let reach: number;
	if (end?.kind === 'stopped') reach = lastPosition(trace)!;
	else if (end?.kind === 'waiting') reach = waitPosition(trace, mode)!;
	else reach = 3 * trace.count;
	const next = Math.max(t, Math.min(cap, reach));
	return { t: next, budgetSpent: next === cap && end?.kind !== 'stopped' };
}

/** Moves `t` onto an instruction boundary for instruction stepping. */
export function snapToInstruction(trace: Trace, t: number): number {
	if (t % 3 === 0) return t;
	const f = forward(trace, t, 'instruction');
	if (f > t && (f % 3 === 0 || f === lastPosition(trace))) return f;
	if (t === lastPosition(trace) && trace.end?.kind === 'stopped') return t;
	return t - (t % 3);
}

export type ViewStatus = 'ready' | 'running' | 'waiting' | StepResult;

export interface MachineView {
	t: number;
	/** stepTM calls complete in this view. */
	executed: number;
	/** The call this view shows (in progress or just finished); null at reset. */
	record: ExecRecord | WaitRecord | null;
	/** Phases of `record` shown: 1 fetch, 2 decode, 3 execute (0 at reset). */
	phase: 0 | 1 | 2 | 3;
	/** Registers and memory as shown. */
	machine: Machine;
	/** Registers written by the step that led here (one write per register). */
	written: RegWrite[];
	/** dMem cell ST wrote in the step that led here. */
	memWrite: { addr: number; before: number; after: number } | null;
	status: ViewStatus;
	/** The IN waiting for a value, when this view is where the run stopped for it. */
	waiting: WaitRecord | null;
}

/** Merges writes so each register appears once (first before, last after). */
function mergeWrites(writes: readonly (RegWrite | null)[]): RegWrite[] {
	const out: RegWrite[] = [];
	for (const w of writes) {
		if (!w) continue;
		const prev = out.find((x) => x.reg === w.reg);
		if (prev) prev.after = w.after;
		else out.push({ ...w });
	}
	return out;
}

/** What the machine looks like at position `t` (clamped to the run). */
export function viewAt(trace: Trace, t: number, mode: Granularity): MachineView {
	const pos = clampPosition(trace, t);
	const k = Math.floor(pos / 3);
	const p = pos % 3;

	if (p === 0) {
		// Try the next call so an IN waiting for a value is known here.
		trace.runTo(k + 1);
		const view: MachineView = {
			t: pos,
			executed: k,
			record: null,
			phase: 0,
			machine: trace.machineAt(k),
			written: [],
			memWrite: null,
			status: 'ready',
			waiting: null
		};
		if (k > 0) {
			const { record, after } = trace.step(k - 1);
			view.record = record;
			view.phase = 3;
			view.machine = after;
			view.written = mergeWrites(
				mode === 'phase' ? record.writes : [record.pcWrite, ...record.writes]
			);
			view.memWrite = record.mem;
			view.status = record.result;
		}
		const end = trace.end;
		if (end?.kind === 'waiting' && k === trace.count && mode === 'instruction') {
			view.status = 'waiting';
			view.waiting = end.wait;
		}
		return view;
	}

	const phase = p as 1 | 2;
	if (k < trace.count) {
		const { before, record, after } = trace.step(k);
		const stopped = record.phases === phase;
		const machine = stopped ? after : before;
		if (!stopped && record.pcWrite) machine.reg[PC_REG] = record.pcWrite.after;
		return {
			t: pos,
			executed: stopped ? k + 1 : k,
			record,
			phase,
			machine,
			written: phase === 1 && record.pcWrite ? [{ ...record.pcWrite }] : [],
			memWrite: null,
			status: stopped ? record.result : 'running',
			waiting: null
		};
	}

	// Fetch or decode of an IN that is waiting for a value.
	const end = trace.end;
	if (end?.kind !== 'waiting') throw new Error('Position past the end of the run');
	const wait = end.wait;
	const machine = cloneMachine(trace.machineAt(k));
	machine.reg[PC_REG] = wait.pc + 1;
	return {
		t: pos,
		executed: k,
		record: wait,
		phase,
		machine,
		written: phase === 1 ? [{ reg: PC_REG, before: wait.pc, after: wait.pc + 1 }] : [],
		memWrite: null,
		status: phase === 2 ? 'waiting' : 'running',
		waiting: phase === 2 ? wait : null
	};
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

/** A second operand in a sum: 6 + 2, 6 + (-2). */
const operand = (n: number) => (n < 0 ? `(${n})` : `${n}`);

const IMEM_RANGE = `iMem (0 … ${IADDR_SIZE - 1})`;
const DMEM_RANGE = `dMem (0 … ${DADDR_SIZE - 1})`;

export function fetchText(rec: ExecRecord | WaitRecord): string {
	const instr = rec.instr;
	if (!instr) {
		return `pc = reg[7] = ${rec.pc}, outside ${IMEM_RANGE}, so stepTM returns srIMEM_ERR`;
	}
	return `pc = reg[7] = ${rec.pc}; reg[7] = ${rec.pc + 1}; instruction ${formatInstruction(instr)}`;
}

function mText(rec: ExecRecord): string {
	return `m = ${rec.d} + reg[${rec.s}] = ${rec.d} + ${operand(rec.sValue)} = ${rec.m}`;
}

export function decodeText(rec: ExecRecord | WaitRecord): string {
	if (rec.kind === 'waiting' || rec.cls === 'RR') {
		return `RR class; r = ${rec.r}, s = ${rec.s}, t = ${rec.t}`;
	}
	if (rec.result === 'srDMEM_ERR') {
		return `RM class; r = ${rec.r}, ${mText(rec)}, outside ${DMEM_RANGE}, so stepTM returns srDMEM_ERR`;
	}
	return `${rec.cls} class; r = ${rec.r}, ${mText(rec)}`;
}

const REL: Record<string, string> = {
	JLT: '< 0',
	JLE: '≤ 0',
	JGT: '> 0',
	JGE: '≥ 0'
};

function arith(rec: ExecRecord, sign: string): string {
	const { r, s, t, values } = rec;
	const result = rec.writes[0]?.after;
	return `reg[${r}] = reg[${s}] ${sign} reg[${t}] = ${values.s} ${sign} ${operand(values.t)} = ${result}`;
}

export function executeText(rec: ExecRecord): string {
	const instr = rec.instr;
	if (!instr) return fetchText(rec);
	const { r, t, values } = rec;
	switch (instr.op) {
		case 'HALT':
			return `HALT prints "${rec.output}"; stepTM returns srHALT`;
		case 'IN':
			return `IN reads ${rec.input?.value} into reg[${r}]`;
		case 'OUT':
			return `OUT prints reg[${r}] = ${values.r}`;
		case 'ADD':
			return arith(rec, '+');
		case 'SUB':
			return arith(rec, '-');
		case 'MUL':
			return arith(rec, '*');
		case 'DIV':
			if (rec.result === 'srZERODIVIDE') {
				return `reg[${t}] = 0, so stepTM returns srZERODIVIDE`;
			}
			return arith(rec, '/');
		case 'LD':
			return `reg[${r}] = dMem[${rec.m}] = ${rec.memRead?.value}`;
		case 'ST':
			return `dMem[${rec.m}] = reg[${r}] = ${values.r}`;
		case 'LDA':
			return `reg[${r}] = m = ${rec.m}`;
		case 'LDC':
			return `reg[${r}] = ${rec.d}`;
		default: {
			const taken = rec.jump?.taken;
			const v = values.r;
			const to = `reg[7] = m = ${rec.m}`;
			if (instr.op === 'JEQ') {
				return taken ? `reg[${r}] = 0, so ${to}` : `reg[${r}] = ${v} is not 0, so no jump`;
			}
			if (instr.op === 'JNE') {
				return taken ? `reg[${r}] = ${v} ≠ 0, so ${to}` : `reg[${r}] = 0, so no jump`;
			}
			const rel = REL[instr.op];
			return taken
				? `reg[${r}] = ${v} ${rel}, so ${to}`
				: `reg[${r}] = ${v} is not ${rel}, so no jump`;
		}
	}
}

/** One sentence for a whole instruction (instruction stepping). */
export function summaryText(rec: ExecRecord): string {
	const instr = rec.instr;
	if (!instr) return fetchText(rec);
	if (rec.result === 'srDMEM_ERR') {
		return `${mText(rec)}, outside ${DMEM_RANGE}, so stepTM returns srDMEM_ERR`;
	}
	const showM = rec.cls === 'RM' || (rec.cls === 'RA' && instr.op !== 'LDC');
	return showM ? `${mText(rec)}; ${executeText(rec)}` : executeText(rec);
}

export interface Caption {
	/** 'phase': Fetch/Decode/Execute; 'instruction': "1: JLE 0,6(7)"; 'reset'. */
	kind: 'phase' | 'instruction' | 'reset';
	label: string;
	text: string;
}

export const RESET_TEXT =
	'all registers are 0 (so the PC, reg[7], is 0); dMem[0] = 1023 and every other dMem cell is 0';

/** The caption for a view. */
export function describe(view: MachineView, mode: Granularity): Caption {
	const rec = view.record;
	if (!rec || view.phase === 0) return { kind: 'reset', label: 'Reset', text: RESET_TEXT };
	if (mode === 'phase' || view.phase < 3 || rec.kind === 'waiting') {
		const label = PHASES[view.phase - 1];
		const text =
			view.phase === 1
				? fetchText(rec)
				: view.phase === 2
					? decodeText(rec)
					: executeText(rec as ExecRecord);
		return { kind: 'phase', label, text };
	}
	if (!rec.instr) return { kind: 'phase', label: 'Fetch', text: fetchText(rec) };
	return {
		kind: 'instruction',
		label: `${rec.pc}: ${formatInstruction(rec.instr)}`,
		text: summaryText(rec)
	};
}

export function captionString(c: Caption): string {
	return `${c.label}: ${c.text}`;
}

/** The instruction the view is about (address), if it is in iMem. */
export function currentAddress(view: MachineView): number | null {
	const rec = view.record;
	if (!rec || view.phase === 0) return null;
	return rec.pc >= 0 && rec.pc < IADDR_SIZE ? rec.pc : null;
}

/** Jump target m to mark in iMem (decode and execute of a jump, or LDA into the PC). */
export function jumpTarget(view: MachineView): number | null {
	const rec = view.record;
	if (!rec || rec.kind !== 'step' || !rec.instr || view.phase < 2 || rec.m === null) return null;
	const op = rec.instr.op;
	if (isJump(op) || (op === 'LDA' && rec.r === PC_REG)) return rec.m;
	return null;
}

/** dMem cell the current instruction reads or writes (LD, ST), from decode on. */
export function memoryAddress(view: MachineView): number | null {
	const rec = view.record;
	if (!rec || rec.kind !== 'step' || rec.cls !== 'RM' || view.phase < 2 || rec.m === null) {
		return null;
	}
	return rec.m >= 0 && rec.m < DADDR_SIZE ? rec.m : null;
}

export const STATUS_TEXT: Record<ViewStatus, string> = {
	ready: 'Ready',
	running: 'In progress',
	waiting: 'Waiting for input',
	srOKAY: 'OK',
	srHALT: 'Halted',
	srIMEM_ERR: 'pc outside iMem',
	srDMEM_ERR: 'm outside dMem',
	srZERODIVIDE: 'Division by zero'
};
