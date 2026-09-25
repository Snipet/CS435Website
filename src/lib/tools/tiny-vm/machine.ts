/**
 * The TINY Machine (TM): eight registers, instruction and data memory, and
 * `stepTM`, the fetch–decode–execute routine shown on Intro, slides 15–17
 * (tm.c). Pure TypeScript; the UI replays machines through `Trace`.
 *
 * Deviations from the printed code, all documented in the UI:
 * - The printed bounds checks `pc > IADDR_SIZE` and `m > DADDR_SIZE` let the
 *   address one past the last cell through; here that address is out of range
 *   too.
 * - IN does not block: when no input value is left the step reports `waiting`
 *   and the machine is unchanged, so the caller can ask for a value.
 * - Arithmetic wraps to 32-bit two's complement (C `int` on common targets).
 */

/** Number of registers. */
export const NO_REGS = 8;
/** reg[7] is the program counter. */
export const PC_REG = 7;
/** Instruction memory cells (addresses 0 … 1023). */
export const IADDR_SIZE = 1024;
/** Data memory cells (addresses 0 … 1023). */
export const DADDR_SIZE = 1024;

export const RR_OPS = ['HALT', 'IN', 'OUT', 'ADD', 'SUB', 'MUL', 'DIV'] as const;
export const RM_OPS = ['LD', 'ST'] as const;
export const RA_OPS = ['LDA', 'LDC', 'JLT', 'JLE', 'JGT', 'JGE', 'JEQ', 'JNE'] as const;
/** Every opcode, in tm.c's order. */
export const OPCODES = [...RR_OPS, ...RM_OPS, ...RA_OPS] as const;

export type Opcode = (typeof OPCODES)[number];
/** RR: registers r, s, t. RM: register r and data address d(s). RA: register r and value d(s). */
export type OpClass = 'RR' | 'RM' | 'RA';

const CLASS = new Map<string, OpClass>([
	...RR_OPS.map((op) => [op, 'RR'] as const),
	...RM_OPS.map((op) => [op, 'RM'] as const),
	...RA_OPS.map((op) => [op, 'RA'] as const)
]);

export function isOpcode(word: string): word is Opcode {
	return CLASS.has(word);
}

export function opClass(op: Opcode): OpClass {
	return CLASS.get(op)!;
}

/** Conditional jumps (RA). */
export const JUMP_OPS = ['JLT', 'JLE', 'JGT', 'JGE', 'JEQ', 'JNE'] as const;
export type JumpOp = (typeof JUMP_OPS)[number];

export function isJump(op: Opcode): op is JumpOp {
	return (JUMP_OPS as readonly string[]).includes(op);
}

/** The test a conditional jump applies to reg[r]. */
export function jumpTaken(op: JumpOp, value: number): boolean {
	switch (op) {
		case 'JLT':
			return value < 0;
		case 'JLE':
			return value <= 0;
		case 'JGT':
			return value > 0;
		case 'JGE':
			return value >= 0;
		case 'JEQ':
			return value === 0;
		case 'JNE':
			return value !== 0;
	}
}

/**
 * One instruction as stored in iMem: tm.c's `iop` and `iarg1`–`iarg3`.
 * RR reads them as r, s, t; RM and RA as r, d, s (`d(s)`).
 */
export interface Instruction {
	op: Opcode;
	a1: number;
	a2: number;
	a3: number;
}

/** What an empty iMem cell holds (tm.c fills iMem with it). */
export const EMPTY_INSTRUCTION: Readonly<Instruction> = Object.freeze({
	op: 'HALT',
	a1: 0,
	a2: 0,
	a3: 0
});

/** "JLE 0,6(7)", "MUL 1,1,0": the form tm.c prints. */
export function formatInstruction(i: Instruction): string {
	return opClass(i.op) === 'RR'
		? `${i.op} ${i.a1},${i.a2},${i.a3}`
		: `${i.op} ${i.a1},${i.a2}(${i.a3})`;
}

/** Instruction memory: sparse; unset cells hold `EMPTY_INSTRUCTION`. */
export interface InstructionMemory {
	get(addr: number): Instruction | undefined;
}

export type StepResult = 'srOKAY' | 'srHALT' | 'srIMEM_ERR' | 'srDMEM_ERR' | 'srZERODIVIDE';

/** Registers, data memory, and how many input values have been read. */
export interface Machine {
	reg: Int32Array;
	dMem: Int32Array;
	/** Index of the next input value IN reads. */
	inPos: number;
}

/** The machine after a reset: registers 0, dMem[0] = DADDR_SIZE − 1, other cells 0. */
export function resetMachine(): Machine {
	const dMem = new Int32Array(DADDR_SIZE);
	dMem[0] = DADDR_SIZE - 1;
	return { reg: new Int32Array(NO_REGS), dMem, inPos: 0 };
}

export function cloneMachine(m: Machine): Machine {
	return { reg: m.reg.slice(), dMem: m.dMem.slice(), inPos: m.inPos };
}

export interface RegWrite {
	reg: number;
	before: number;
	after: number;
}

/** One call of stepTM. */
export interface ExecRecord {
	kind: 'step';
	/** 0-based number of this stepTM call. */
	index: number;
	/** reg[PC_REG] when the call started. */
	pc: number;
	/** The fetched instruction; null when pc was outside iMem. */
	instr: Instruction | null;
	cls: OpClass | null;
	/** Decoded operands. RR: r, s, t. RM/RA: r, s, and d = iarg2. */
	r: number;
	s: number;
	t: number;
	d: number;
	/** reg[s] when m was computed (after the PC increment). */
	sValue: number;
	/** Effective address or value d + reg[s] (RM, RA). */
	m: number | null;
	result: StepResult;
	/** Phases carried out: 1 fetch (srIMEM_ERR), 2 fetch + decode (srDMEM_ERR), 3 all. */
	phases: 1 | 2 | 3;
	/** The fetch's reg[PC_REG] = pc + 1. */
	pcWrite: RegWrite | null;
	/** Register writes of the execute phase (a jump writes reg[PC_REG]). */
	writes: RegWrite[];
	mem: { addr: number; before: number; after: number } | null;
	/** dMem cell LD read. */
	memRead: { addr: number; value: number } | null;
	input: { index: number; value: number } | null;
	/** What the step prints: "OUT instruction prints: 6", "HALT: 0,0,0". */
	output: string | null;
	jump: { taken: boolean; target: number } | null;
	/** Operand values for descriptions: reg[r], reg[s], reg[t] before execution. */
	values: { r: number; s: number; t: number };
}

/** An IN with no input left: nothing has changed; fetch and decode are described. */
export interface WaitRecord {
	kind: 'waiting';
	index: number;
	pc: number;
	instr: Instruction;
	r: number;
	s: number;
	t: number;
}

export const inRange = (addr: number, size: number) => addr >= 0 && addr < size;

/**
 * Runs one stepTM call on `machine` (mutated), reading IN values from
 * `inputs`. Returns a record of what happened, or a `WaitRecord` (machine
 * untouched) when the instruction is IN and every input value has been read.
 */
export function stepTM(
	machine: Machine,
	iMem: InstructionMemory,
	inputs: readonly number[],
	index = 0
): ExecRecord | WaitRecord {
	const { reg, dMem } = machine;
	const pc = reg[PC_REG];
	const rec: ExecRecord = {
		kind: 'step',
		index,
		pc,
		instr: null,
		cls: null,
		r: 0,
		s: 0,
		t: 0,
		d: 0,
		sValue: 0,
		m: null,
		result: 'srOKAY',
		phases: 3,
		pcWrite: null,
		writes: [],
		mem: null,
		memRead: null,
		input: null,
		output: null,
		jump: null,
		values: { r: 0, s: 0, t: 0 }
	};

	// Fetch.
	if (!inRange(pc, IADDR_SIZE)) {
		rec.result = 'srIMEM_ERR';
		rec.phases = 1;
		return rec;
	}
	const instr = iMem.get(pc) ?? EMPTY_INSTRUCTION;
	if (instr.op === 'IN' && machine.inPos >= inputs.length) {
		return {
			kind: 'waiting',
			index,
			pc,
			instr,
			r: instr.a1,
			s: instr.a2,
			t: instr.a3
		};
	}
	reg[PC_REG] = pc + 1;
	rec.pcWrite = { reg: PC_REG, before: pc, after: pc + 1 };
	rec.instr = instr;
	const cls = opClass(instr.op);
	rec.cls = cls;

	// Decode.
	let r: number, s: number, t: number;
	let m = 0;
	if (cls === 'RR') {
		r = instr.a1;
		s = instr.a2;
		t = instr.a3;
	} else {
		r = instr.a1;
		s = instr.a3;
		t = 0;
		rec.d = instr.a2;
		rec.sValue = reg[s];
		m = (instr.a2 + reg[s]) | 0;
		rec.m = m;
	}
	rec.r = r;
	rec.s = s;
	rec.t = t;
	rec.values = { r: reg[r], s: reg[s], t: reg[t] };
	if (cls === 'RM' && !inRange(m, DADDR_SIZE)) {
		rec.result = 'srDMEM_ERR';
		rec.phases = 2;
		return rec;
	}

	// Execute.
	const write = (to: number, value: number) => {
		rec.writes.push({ reg: to, before: reg[to], after: value | 0 });
		reg[to] = value;
	};
	switch (instr.op) {
		case 'HALT':
			rec.output = `HALT: ${r},${s},${t}`;
			rec.result = 'srHALT';
			break;
		case 'IN': {
			const value = inputs[machine.inPos] | 0;
			rec.input = { index: machine.inPos, value };
			machine.inPos++;
			write(r, value);
			break;
		}
		case 'OUT':
			rec.output = `OUT instruction prints: ${reg[r]}`;
			break;
		case 'ADD':
			write(r, (reg[s] + reg[t]) | 0);
			break;
		case 'SUB':
			write(r, (reg[s] - reg[t]) | 0);
			break;
		case 'MUL':
			write(r, Math.imul(reg[s], reg[t]));
			break;
		case 'DIV':
			if (reg[t] !== 0) write(r, (reg[s] / reg[t]) | 0);
			else rec.result = 'srZERODIVIDE';
			break;
		case 'LD':
			rec.memRead = { addr: m, value: dMem[m] };
			write(r, dMem[m]);
			break;
		case 'ST':
			rec.mem = { addr: m, before: dMem[m], after: reg[r] };
			dMem[m] = reg[r];
			break;
		case 'LDA':
			write(r, m);
			break;
		case 'LDC':
			write(r, instr.a2);
			break;
		default: {
			const taken = jumpTaken(instr.op, reg[r]);
			rec.jump = { taken, target: m };
			if (taken) write(PC_REG, m);
		}
	}
	return rec;
}
