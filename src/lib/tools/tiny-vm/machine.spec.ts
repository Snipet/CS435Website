import { describe, expect, it } from 'vitest';
import {
	DADDR_SIZE,
	EMPTY_INSTRUCTION,
	IADDR_SIZE,
	OPCODES,
	PC_REG,
	formatInstruction,
	isOpcode,
	jumpTaken,
	opClass,
	resetMachine,
	stepTM,
	type ExecRecord,
	type Instruction,
	type InstructionMemory,
	type Opcode
} from './machine';

function mem(...list: [Opcode, number, number, number][]): InstructionMemory {
	const cells = new Map<number, Instruction>();
	list.forEach(([op, a1, a2, a3], i) => cells.set(i, { op, a1, a2, a3 }));
	return { get: (a) => cells.get(a) };
}

function exec(
	iMem: InstructionMemory,
	setup: (m: ReturnType<typeof resetMachine>) => void = () => {},
	inputs: number[] = []
) {
	const m = resetMachine();
	setup(m);
	const rec = stepTM(m, iMem, inputs);
	return { m, rec: rec as ExecRecord };
}

describe('machine layout', () => {
	it('matches tm.c: 8 registers, PC in reg 7, 1024-cell memories', () => {
		expect(PC_REG).toBe(7);
		expect(IADDR_SIZE).toBe(1024);
		expect(DADDR_SIZE).toBe(1024);
	});

	it('resets registers to 0 and dMem[0] to DADDR_SIZE - 1', () => {
		const m = resetMachine();
		expect([...m.reg]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
		expect(m.dMem[0]).toBe(1023);
		expect(m.dMem.slice(1).every((v) => v === 0)).toBe(true);
		expect(m.inPos).toBe(0);
	});

	it('classifies opcodes as RR, RM, RA', () => {
		expect(OPCODES).toHaveLength(17);
		expect(
			['HALT', 'IN', 'OUT', 'ADD', 'SUB', 'MUL', 'DIV'].map((o) => opClass(o as Opcode))
		).toEqual(Array(7).fill('RR'));
		expect(opClass('LD')).toBe('RM');
		expect(opClass('ST')).toBe('RM');
		for (const op of ['LDA', 'LDC', 'JLT', 'JLE', 'JGT', 'JGE', 'JEQ', 'JNE'] as const) {
			expect(opClass(op)).toBe('RA');
		}
		expect(isOpcode('JNE')).toBe(true);
		expect(isOpcode('jne')).toBe(false);
		expect(isOpcode('JMP')).toBe(false);
	});

	it('prints instructions as tm.c does', () => {
		expect(formatInstruction({ op: 'JLE', a1: 0, a2: 6, a3: 7 })).toBe('JLE 0,6(7)');
		expect(formatInstruction({ op: 'JNE', a1: 0, a2: -3, a3: 7 })).toBe('JNE 0,-3(7)');
		expect(formatInstruction({ op: 'MUL', a1: 1, a2: 1, a3: 0 })).toBe('MUL 1,1,0');
		expect(formatInstruction(EMPTY_INSTRUCTION)).toBe('HALT 0,0,0');
	});

	it('tests reg[r] against 0 for each jump', () => {
		expect([-1, 0, 1].map((v) => jumpTaken('JLT', v))).toEqual([true, false, false]);
		expect([-1, 0, 1].map((v) => jumpTaken('JLE', v))).toEqual([true, true, false]);
		expect([-1, 0, 1].map((v) => jumpTaken('JGT', v))).toEqual([false, false, true]);
		expect([-1, 0, 1].map((v) => jumpTaken('JGE', v))).toEqual([false, true, true]);
		expect([-1, 0, 1].map((v) => jumpTaken('JEQ', v))).toEqual([false, true, false]);
		expect([-1, 0, 1].map((v) => jumpTaken('JNE', v))).toEqual([true, false, true]);
	});
});

describe('stepTM', () => {
	it('increments the PC before executing, so d(7) is relative to the next instruction', () => {
		// Slide 14, instruction 1: JLE 0,6(7) with reg[7] = 1.
		const iMem = mem(['IN', 0, 0, 0], ['JLE', 0, 6, 7]);
		const { m, rec } = exec(iMem, (m) => {
			m.reg[PC_REG] = 1;
			m.reg[0] = 3;
		});
		expect(rec.pc).toBe(1);
		expect(rec.pcWrite).toEqual({ reg: 7, before: 1, after: 2 });
		expect(rec.cls).toBe('RA');
		expect(rec.sValue).toBe(2);
		expect(rec.m).toBe(8);
		expect(rec.jump).toEqual({ taken: false, target: 8 });
		expect(m.reg[PC_REG]).toBe(2);
		expect(rec.result).toBe('srOKAY');
		expect(rec.phases).toBe(3);
	});

	it('jumps by setting reg[PC_REG] = m', () => {
		const iMem = mem(['JLE', 0, 6, 7]);
		const { m, rec } = exec(iMem);
		expect(rec.jump).toEqual({ taken: true, target: 7 });
		expect(rec.writes).toEqual([{ reg: 7, before: 1, after: 7 }]);
		expect(m.reg[PC_REG]).toBe(7);
	});

	it('runs RR arithmetic on reg[s] and reg[t]', () => {
		const cases: [Opcode, number, number, number][] = [
			['ADD', 7, 5, 12],
			['SUB', 7, 5, 2],
			['MUL', 7, 5, 35],
			['DIV', 7, 2, 3],
			['DIV', -7, 2, -3]
		];
		for (const [op, a, b, want] of cases) {
			const { m, rec } = exec(mem([op, 3, 1, 2]), (m) => {
				m.reg[1] = a;
				m.reg[2] = b;
			});
			expect(m.reg[3], `${op} ${a} ${b}`).toBe(want);
			expect(rec.values).toEqual({ r: 0, s: a, t: b });
			expect(rec.writes).toEqual([{ reg: 3, before: 0, after: want }]);
		}
	});

	it('wraps arithmetic to 32 bits', () => {
		const { m } = exec(mem(['ADD', 0, 1, 2]), (m) => {
			m.reg[1] = 2 ** 31 - 1;
			m.reg[2] = 1;
		});
		expect(m.reg[0]).toBe(-(2 ** 31));
		const mul = exec(mem(['MUL', 0, 1, 1]), (m) => (m.reg[1] = 65536));
		expect(mul.m.reg[0]).toBe(0);
	});

	it('returns srZERODIVIDE when reg[t] is 0 and leaves reg[r] alone', () => {
		const { m, rec } = exec(mem(['DIV', 0, 1, 2]), (m) => {
			m.reg[0] = 9;
			m.reg[1] = 7;
		});
		expect(rec.result).toBe('srZERODIVIDE');
		expect(rec.writes).toEqual([]);
		expect(m.reg[0]).toBe(9);
		expect(m.reg[PC_REG]).toBe(1);
	});

	it('loads and stores through m = d + reg[s]', () => {
		const st = exec(mem(['ST', 1, -2, 6]), (m) => {
			m.reg[1] = 42;
			m.reg[6] = 1023;
		});
		expect(st.rec.cls).toBe('RM');
		expect(st.rec.m).toBe(1021);
		expect(st.rec.mem).toEqual({ addr: 1021, before: 0, after: 42 });
		expect(st.m.dMem[1021]).toBe(42);

		const ld = exec(mem(['LD', 2, 0, 0]));
		expect(ld.rec.memRead).toEqual({ addr: 0, value: 1023 });
		expect(ld.m.reg[2]).toBe(1023);
	});

	it('LDA loads m; LDC loads d and ignores reg[s]', () => {
		const lda = exec(mem(['LDA', 1, 5, 2]), (m) => (m.reg[2] = 10));
		expect(lda.m.reg[1]).toBe(15);
		const ldc = exec(mem(['LDC', 1, 5, 2]), (m) => (m.reg[2] = 10));
		expect(ldc.rec.m).toBe(15);
		expect(ldc.m.reg[1]).toBe(5);
	});

	it('LDA into reg 7 is an unconditional jump', () => {
		const iMem = mem(['HALT', 0, 0, 0], ['HALT', 0, 0, 0], ['LDA', 7, -3, 7]);
		const { m } = exec(iMem, (m) => (m.reg[PC_REG] = 2));
		expect(m.reg[PC_REG]).toBe(0);
	});

	it('reads IN values in order and waits when none is left', () => {
		const iMem = mem(['IN', 3, 0, 0]);
		const { m, rec } = exec(iMem, () => {}, [5, 6]);
		expect(rec.input).toEqual({ index: 0, value: 5 });
		expect(m.reg[3]).toBe(5);
		expect(m.inPos).toBe(1);

		const idle = resetMachine();
		const wait = stepTM(idle, iMem, []);
		expect(wait).toEqual({
			kind: 'waiting',
			index: 0,
			pc: 0,
			instr: iMem.get(0),
			r: 3,
			s: 0,
			t: 0
		});
		expect([...idle.reg]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
	});

	it('prints OUT and HALT lines as tm.c does', () => {
		const out = exec(mem(['OUT', 1, 0, 0]), (m) => (m.reg[1] = -6));
		expect(out.rec.output).toBe('OUT instruction prints: -6');
		const halt = exec(mem(['HALT', 1, 2, 3]));
		expect(halt.rec.output).toBe('HALT: 1,2,3');
		expect(halt.rec.result).toBe('srHALT');
	});

	it('treats an empty iMem cell as HALT 0,0,0', () => {
		const { rec } = exec(mem());
		expect(rec.instr).toEqual(EMPTY_INSTRUCTION);
		expect(rec.result).toBe('srHALT');
	});

	it('returns srIMEM_ERR when pc is outside iMem, before touching the PC', () => {
		for (const pc of [-1, IADDR_SIZE, IADDR_SIZE + 5]) {
			const { m, rec } = exec(mem(), (m) => (m.reg[PC_REG] = pc));
			expect(rec.result).toBe('srIMEM_ERR');
			expect(rec.phases).toBe(1);
			expect(rec.instr).toBeNull();
			expect(m.reg[PC_REG]).toBe(pc);
		}
	});

	it('returns srDMEM_ERR for m outside dMem, including m = DADDR_SIZE', () => {
		for (const d of [-1, DADDR_SIZE, 5000]) {
			const { m, rec } = exec(mem(['LD', 0, d, 0]));
			expect(rec.result, `m = ${d}`).toBe('srDMEM_ERR');
			expect(rec.phases).toBe(2);
			expect(m.reg[PC_REG]).toBe(1);
			expect(m.reg[0]).toBe(0);
		}
		expect(exec(mem(['ST', 0, 1023, 0])).rec.result).toBe('srOKAY');
	});

	it('does not bounds-check RA addresses at decode', () => {
		const { m, rec } = exec(mem(['LDA', 7, 5000, 0]));
		expect(rec.result).toBe('srOKAY');
		expect(m.reg[PC_REG]).toBe(5000);
		const next = stepTM(m, mem(), []) as ExecRecord;
		expect(next.result).toBe('srIMEM_ERR');
	});
});
