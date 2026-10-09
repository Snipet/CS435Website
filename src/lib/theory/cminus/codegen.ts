/**
 * The code generator: three-address code in, TINY Machine (TM) code out.
 *
 * Every quad is translated on its own, through the accumulator. Operands are
 * loaded from memory into ac (and ac1), the operation runs, and the result is
 * stored back, so no value is kept in a register from one quad to the next.
 * The run-time conventions (registers, activation records, the calling
 * sequence) are described in runtime.ts.
 *
 * Layout of the code
 *
 *   prelude     gp = dMem[0]; fp = the record of main, just below the globals;
 *               call main; HALT. A second HALT follows: a negative subscript
 *               jumps to it.
 *   input       IN into ac, return
 *   output      OUT its parameter, return
 *   functions   in the order of the source
 *
 *   t := a + b            LD ac,a · LD ac1,b · ADD ac,ac,ac1 · ST ac,t
 *   t := a < b            both loaded, then 1 or 0 into ac by jumps. The signs
 *                         are tested first, so the subtraction that decides
 *                         cannot overflow.
 *   x := a                LD ac,a · ST ac,x
 *   t := a[i]             LD ac,i · JLT ac,(halt) · address of a[0] into ac1 ·
 *                         ADD ac1,ac1,ac · LD ac,0(ac1) · ST ac,t
 *   a[i] := v             the same address, then LD ac,v · ST ac,0(ac1)
 *   param a               LD ac,a · ST ac into the parameter's cell of the new record
 *   t := call f, n        ST fp at the base of the new record · LDA fp to it ·
 *                         LDA ac,(return address) · jump to f · LD fp,0(fp) · ST ac,t
 *   return a              LD ac,a · LD pc,-1(fp)
 *   if_false a goto L     LD ac,a · JEQ ac,L
 *   goto L                LDA pc,L
 *
 * Jumps are pc-relative (`LDA 7,d(7)`, `JEQ 0,d(7)`).
 *
 * The peephole pass then removes a load that follows a store of the same
 * register and cell (the value is still in the register) and a jump to the
 * next instruction. Both versions of the code are returned.
 *
 * What does not fit the machine is an error, each with a span:
 * - the code after the peephole pass is longer than instruction memory (at
 *   the name of main);
 * - the global variables and the record of a function are more than data
 *   memory holds (at the name of the function);
 * - a function is called, and on the shortest chain of calls from main to it
 *   the global variables and the records on the stack are more than data
 *   memory holds (at the call that ends that chain). Recursion is not counted:
 *   how deep it goes is only known when the program runs.
 */
import {
	DADDR_SIZE,
	IADDR_SIZE,
	formatInstruction,
	opClass,
	type Instruction,
	type Opcode
} from '$lib/tools/tiny-vm/machine';
import { isArithOp, type RelOp } from './ast';
import {
	functionRanges,
	quadText,
	temporariesOf,
	type IrProgram,
	type Operand,
	type Quad
} from './ir';
import {
	AC,
	AC1,
	FP,
	FRAME_HEADER,
	GP,
	OLD_FP_OFFSET,
	PC,
	RETURN_OFFSET,
	registerName
} from './runtime';
import type { SemanticResult, SymbolInfo } from './semantic';
import type { SourceDiagnostic, SourceSpan } from './tokens';

export interface TmInstruction {
	/** Address in instruction memory. */
	addr: number;
	/** The instruction, as the TINY Machine stores it. */
	instr: Instruction;
	/** What the instruction does. */
	comment: string;
	/**
	 * Index, in the quads the code was generated from, of the quad it
	 * implements; null in the prelude and in input and output.
	 */
	quad: number | null;
	/** The source text that quad came from. */
	span: SourceSpan | null;
	/** Name of the function it belongs to; null in the prelude. */
	function: string | null;
	/** Comment lines the listing prints above it. */
	header: string[];
	/** 1-based line of the instruction in the listing. */
	line: number;
	/** Its address before the peephole pass (equal to `addr` in the code that pass has not touched). */
	origin: number;
}

export interface TmCode {
	/** `instructions[a].addr === a`. */
	instructions: TmInstruction[];
	/** The program as TM text: a `* …` line per quad, then `N:  OP  r,d(s)  comment` lines. */
	listing: string;
	/** Function name → address of its first instruction (input and output included). */
	entries: Map<string, number>;
	/** Address of the HALT main returns to. */
	haltAddress: number;
	/** Address of the HALT a negative subscript jumps to. */
	negativeSubscriptAddress: number;
}

export type SlotKind =
	| 'old-fp'
	| 'return-address'
	| 'parameter'
	| 'array-parameter'
	| 'variable'
	| 'array'
	| 'temporary';

export interface FrameSlot {
	/** The name the quads use. */
	name: string;
	kind: SlotKind;
	/** Offset from fp of the cell (of element 0 for an array). */
	offset: number;
	/** Cells taken. */
	size: number;
	/** Symbol id; null for the two cells at the base and for temporaries. */
	symbol: number | null;
}

/** The activation record of one function. */
export interface FrameLayout {
	function: string;
	/** Cells in the record. */
	size: number;
	/** In order of decreasing offset: the caller's fp, the return address, parameters, locals, temporaries. */
	slots: FrameSlot[];
}

export interface GlobalSlot {
	name: string;
	kind: 'variable' | 'array';
	/** Offset from gp of the cell (of element 0 for an array). */
	offset: number;
	/** The address that offset is on the machine (gp = DADDR_SIZE − 1). */
	address: number;
	size: number;
	symbol: number;
}

export interface GlobalLayout {
	size: number;
	slots: GlobalSlot[];
}

export interface PeepholeChange {
	rule: 'store-load' | 'jump-to-next';
	/** Address of the removed instruction in the code before the pass. */
	addr: number;
	/** The removed instruction, e.g. "LD 0,-4(5)". */
	instruction: string;
	/** Why it is not needed. */
	text: string;
}

export interface CodegenResult {
	/** The code straight from the quads. */
	code: TmCode;
	/** The code after the peephole pass (the one to run), and what the pass removed. */
	peephole: { code: TmCode; changes: PeepholeChange[] };
	globals: GlobalLayout;
	/** input, output, then the program's functions in order. */
	frames: FrameLayout[];
	/** What does not fit the machine; every one has a span. */
	diagnostics: SourceDiagnostic[];
	/** True when the code and its data fit in the machine. */
	ok: boolean;
}

/** A call: the symbol ids of the calling and the called function, and the source text of the call. */
interface CallSite {
	from: number;
	to: number;
	span: SourceSpan | null;
}

/** One instruction before addresses are known: a jump names its target label. */
interface Asm {
	op: Opcode;
	a1: number;
	a2: number;
	a3: number;
	/** For a pc-relative operand: the label whose address d(pc) must give. */
	target: string | null;
	/** Labels that stand for this instruction's address. */
	labels: string[];
	comment: string;
	quad: number | null;
	span: SourceSpan | null;
	fn: string | null;
	header: string[];
	/** Never removed by the peephole pass (the jump of a call). */
	pinned: boolean;
	origin: number;
}

/** "a", "a and b", "a, b and c". */
function listText(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const MAIN_HALT = 'halt:main';
const SUBSCRIPT_HALT = 'halt:subscript';
const entryLabel = (name: string) => `fn:${name}`;

function listingLine(i: TmInstruction): string {
	const operands =
		opClass(i.instr.op) === 'RR'
			? `${i.instr.a1},${i.instr.a2},${i.instr.a3}`
			: `${i.instr.a1},${i.instr.a2}(${i.instr.a3})`;
	return `${String(i.addr).padStart(3)}:  ${i.instr.op.padEnd(4)} ${operands.padEnd(10)} ${i.comment}`.trimEnd();
}

/**
 * The TM text of a list of instructions (what `TmCode.listing` holds).
 * `trailer` lines are comments printed after the last instruction.
 */
export function formatListing(
	instructions: readonly TmInstruction[],
	trailer: readonly string[] = []
): string {
	const lines: string[] = [];
	for (const i of instructions) {
		for (const h of i.header) lines.push(`* ${h}`);
		lines.push(listingLine(i));
	}
	for (const h of trailer) lines.push(`* ${h}`);
	return lines.join('\n');
}

/** Gives every instruction its address and every pc-relative operand its offset. */
function assemble(asm: readonly Asm[], trailer: readonly string[]): TmCode {
	const address = new Map<string, number>();
	asm.forEach((a, addr) => a.labels.forEach((l) => address.set(l, addr)));
	let line = 0;
	const instructions = asm.map((a, addr): TmInstruction => {
		line += a.header.length + 1;
		let a2 = a.a2;
		if (a.target !== null) {
			const to = address.get(a.target);
			if (to === undefined) throw new Error(`codegen: label ${a.target} is not placed`);
			// The pc already points at the next instruction when d(pc) is computed.
			a2 = to - (addr + 1);
		}
		return {
			addr,
			instr: { op: a.op, a1: a.a1, a2, a3: a.a3 },
			comment: a.comment,
			quad: a.quad,
			span: a.span,
			function: a.fn,
			header: a.header,
			line,
			origin: a.origin
		};
	});
	const entries = new Map<string, number>();
	for (const [l, addr] of address) if (l.startsWith('fn:')) entries.set(l.slice(3), addr);
	return {
		instructions,
		listing: formatListing(instructions, trailer),
		entries,
		haltAddress: address.get(MAIN_HALT) ?? -1,
		negativeSubscriptAddress: address.get(SUBSCRIPT_HALT) ?? -1
	};
}

const isJump = (a: Asm) =>
	a.target !== null && ((a.op === 'LDA' && a.a1 === PC) || a.op.startsWith('J'));

/**
 * The peephole pass over symbolic instructions:
 * - `ST r,d(s)` then `LD r,d(s)`: the load is removed, unless a jump lands on it;
 * - a jump to the instruction that follows it is removed.
 */
function peephole(input: readonly Asm[]): { asm: Asm[]; changes: PeepholeChange[] } {
	let asm = input.map((a) => ({ ...a, labels: [...a.labels], header: [...a.header] }));
	const changes: PeepholeChange[] = [];
	const text = (a: Asm, d: number) => formatInstruction({ op: a.op, a1: a.a1, a2: d, a3: a.a3 });
	for (let changed = true; changed;) {
		changed = false;
		const next: Asm[] = [];
		/** Labels some instruction still refers to: a jump may land there. */
		const targets = new Set(asm.map((a) => a.target));
		/** Labels and comment lines of a removed instruction, for the one that follows. */
		let carry: { labels: string[]; header: string[] } | null = null;
		const push = (a: Asm) => {
			if (carry) {
				a.labels.unshift(...carry.labels);
				a.header.unshift(...carry.header);
				carry = null;
			}
			next.push(a);
		};
		for (let i = 0; i < asm.length; i++) {
			const a = asm[i];
			const before = next[next.length - 1];
			if (
				!carry &&
				before &&
				before.op === 'ST' &&
				a.op === 'LD' &&
				a.a1 !== PC &&
				a.target === null &&
				before.target === null &&
				!a.labels.some((l) => targets.has(l)) &&
				a.a1 === before.a1 &&
				a.a2 === before.a2 &&
				a.a3 === before.a3
			) {
				changes.push({
					rule: 'store-load',
					addr: a.origin,
					instruction: text(a, a.a2),
					text: `${registerName(a.a1)} still holds the value the instruction before it stored.`
				});
				carry = { labels: a.labels, header: a.header };
				changed = true;
				continue;
			}
			const following = asm[i + 1];
			if (isJump(a) && !a.pinned && following && following.labels.includes(a.target!)) {
				changes.push({
					rule: 'jump-to-next',
					addr: a.origin,
					instruction: text(a, 0),
					text: 'It jumps to the instruction that follows it.'
				});
				const c: { labels: string[]; header: string[] } = carry ?? { labels: [], header: [] };
				carry = { labels: [...c.labels, ...a.labels], header: [...c.header, ...a.header] };
				changed = true;
				continue;
			}
			push(a);
		}
		asm = next;
	}
	changes.sort((x, y) => x.addr - y.addr);
	return { asm, changes };
}

/** Jump taken when `x op 0` holds, for the two operators decided by one subtraction. */
const EQUALITY_JUMP: Partial<Record<RelOp, Opcode>> = { '==': 'JEQ', '!=': 'JNE' };

/**
 * Generates TM code for three-address code (optimized or not) of a checked
 * program. `semantic` gives every variable its place.
 */
export function generateCode(ir: IrProgram, semantic: SemanticResult): CodegenResult {
	const diagnostics: SourceDiagnostic[] = [];
	const asm: Asm[] = [];
	let pendingLabels: string[] = [];
	let pendingHeader: string[] = [];
	let quadIndex: number | null = null;
	let quadSpan: SourceSpan | null = null;
	let fnName: string | null = null;
	let locals = 0;

	const put = (
		op: Opcode,
		a1: number,
		a2: number,
		a3: number,
		comment: string,
		target: string | null = null,
		pinned = false
	) => {
		asm.push({
			op,
			a1,
			// Never -0: the operand is compared and printed as a plain 0.
			a2: a2 + 0,
			a3,
			target,
			labels: pendingLabels,
			comment,
			quad: quadIndex,
			span: quadSpan,
			fn: fnName,
			header: pendingHeader,
			pinned,
			origin: asm.length
		});
		pendingLabels = [];
		pendingHeader = [];
	};
	/** `op r,s,t` */
	const rr = (op: Opcode, r: number, s: number, t: number, comment: string) =>
		put(op, r, s, t, comment);
	/** `op r,d(s)` */
	const rm = (op: Opcode, r: number, d: number, s: number, comment: string) =>
		put(op, r, d, s, comment);
	/** `op r,d(pc)` with d chosen so that d(pc) is the address of `target`. */
	const rel = (op: Opcode, r: number, target: string, comment: string, pinned = false) =>
		put(op, r, 0, PC, comment, target, pinned);
	const bind = (name: string) => pendingLabels.push(name);
	const head = (line: string) => pendingHeader.push(line);
	const localLabel = () => `@${++locals}`;
	const reg = registerName;

	// --- Prelude and the predefined functions -------------------------------

	head('C- program compiled for the TINY Machine');
	head('registers: ac = 0, ac1 = 1, fp = 5, gp = 6, pc = 7');
	head('prelude');
	rm('LD', GP, 0, AC, 'gp = dMem[0], the highest address');
	rm('ST', AC, 0, AC, 'clear dMem[0]');
	rm('LDA', FP, -semantic.globalsSize, GP, 'fp = the record of main, below the globals');
	rel('LDA', AC, MAIN_HALT, 'ac = return address');
	rel('LDA', PC, entryLabel('main'), 'call main', true);
	bind(MAIN_HALT);
	rr('HALT', 0, 0, 0, 'main returned: stop');
	bind(SUBSCRIPT_HALT);
	rr('HALT', 1, 0, 0, 'negative subscript: stop');

	fnName = 'input';
	head('int input(void)');
	bind(entryLabel('input'));
	rm('ST', AC, RETURN_OFFSET, FP, 'save the return address');
	rr('IN', AC, 0, 0, 'ac = the integer read');
	rm('LD', PC, RETURN_OFFSET, FP, 'return to the caller');

	fnName = 'output';
	head('void output(int x)');
	bind(entryLabel('output'));
	rm('ST', AC, RETURN_OFFSET, FP, 'save the return address');
	rm('LD', AC, -FRAME_HEADER, FP, 'ac = x');
	rr('OUT', AC, 0, 0, 'print ac');
	rm('LD', PC, RETURN_OFFSET, FP, 'return to the caller');

	const base = (): FrameSlot[] => [
		{ name: "caller's fp", kind: 'old-fp', offset: OLD_FP_OFFSET, size: 1, symbol: null },
		{ name: 'return address', kind: 'return-address', offset: RETURN_OFFSET, size: 1, symbol: null }
	];
	const frames: FrameLayout[] = [
		{ function: 'input', size: FRAME_HEADER, slots: base() },
		{
			function: 'output',
			size: FRAME_HEADER + 1,
			slots: [
				...base(),
				{ name: 'x', kind: 'parameter', offset: -FRAME_HEADER, size: 1, symbol: null }
			]
		}
	];
	const labelName = (o: Operand | null): string => {
		if (o?.kind !== 'label') throw new Error('codegen: a jump without a label');
		return o.name;
	};
	/** Symbol id of a function → the cells of its record (input and output included). */
	const recordSize = new Map<number, number>();
	for (const s of semantic.symbols) {
		const frame = s.builtin ? frames.find((f) => f.function === s.name) : undefined;
		if (frame) recordSize.set(s.id, frame.size);
	}
	/** Symbol id of a function → its first call of each function it calls, in the order of its code. */
	const callSites = new Map<number, CallSite[]>();

	// --- Functions ----------------------------------------------------------

	const names = new Map(ir.functions.map((f) => [f.symbol, f.names] as const));
	for (const range of functionRanges(ir.quads)) {
		const info = semantic.functions.find((f) => f.symbol === range.symbol);
		if (!info) throw new Error(`codegen: function ${range.name} is not in the symbol table`);
		const irNames = names.get(range.symbol);
		const quads = ir.quads.slice(range.from, range.to);

		// The record: header, parameters and locals (placed by the analyzer), then temporaries.
		const tempOffset = new Map<string, number>();
		let size = info.frameSize;
		for (const t of temporariesOf(quads)) tempOffset.set(t, -size++);
		const slotOf = (id: number): FrameSlot => {
			const s = semantic.symbols[id];
			return {
				name: irNames?.get(id) ?? s.name,
				kind: s.kind as SlotKind,
				offset: s.location!.offset,
				size: s.kind === 'array' ? (s.size ?? 1) : 1,
				symbol: id
			};
		};
		frames.push({
			function: range.name,
			size,
			slots: [
				...base(),
				...info.params.map(slotOf),
				...info.locals.map(slotOf),
				...[...tempOffset].map(([name, offset]): FrameSlot => ({
					name,
					kind: 'temporary',
					offset,
					size: 1,
					symbol: null
				}))
			]
		});
		recordSize.set(range.symbol, size);
		const called = new Map<number, CallSite>();
		for (const q of quads) {
			if (q.op === 'call' && q.arg1?.kind === 'function' && !called.has(q.arg1.symbol)) {
				called.set(q.arg1.symbol, { from: range.symbol, to: q.arg1.symbol, span: q.span });
			}
		}
		callSites.set(range.symbol, [...called.values()]);
		if (semantic.globalsSize + size > DADDR_SIZE) {
			diagnostics.push({
				severity: 'error',
				message:
					semantic.globalsSize > 0
						? `The global variables (${semantic.globalsSize} cells) and the activation record of ${range.name} (${size} cells) do not fit in the ${DADDR_SIZE} cells of data memory.`
						: `The activation record of ${range.name} (${size} cells) does not fit in the ${DADDR_SIZE} cells of data memory.`,
				span: semantic.symbols[range.symbol].declSpan ?? undefined
			});
		}

		const place = (o: Operand): { base: number; offset: number; symbol: SymbolInfo | null } => {
			if (o.kind === 'temp') {
				const offset = tempOffset.get(o.name);
				if (offset === undefined) throw new Error(`codegen: ${o.name} has no cell`);
				return { base: FP, offset, symbol: null };
			}
			if (o.kind !== 'var') throw new Error(`codegen: ${o.kind} operand has no cell`);
			const symbol = semantic.symbols[o.symbol];
			const loc = symbol.location;
			if (!loc) throw new Error(`codegen: ${symbol.name} has no location`);
			return { base: loc.base === 'gp' ? GP : FP, offset: loc.offset, symbol };
		};
		/** Loads the value of an operand (the address of element 0 for an array) into a register. */
		const load = (o: Operand, r: number) => {
			if (o.kind === 'const') {
				rm('LDC', r, o.value, 0, `${reg(r)} = ${o.value}`);
				return;
			}
			const p = place(o);
			const name = o.kind === 'temp' || o.kind === 'var' ? o.name : '';
			if (p.symbol?.kind === 'array') {
				rm('LDA', r, p.offset, p.base, `${reg(r)} = address of ${name}[0]`);
			} else if (p.symbol?.kind === 'array-parameter') {
				rm('LD', r, p.offset, p.base, `${reg(r)} = address of ${name}[0] (the parameter holds it)`);
			} else {
				rm('LD', r, p.offset, p.base, `${reg(r)} = ${name}`);
			}
		};
		const store = (o: Operand, r: number, what = reg(r)) => {
			const p = place(o);
			const name = o.kind === 'temp' || o.kind === 'var' ? o.name : '';
			rm('ST', r, p.offset, p.base, `${name} = ${what}`);
		};
		/** ac = subscript, ac1 = address of the element; a negative subscript jumps to the HALT. */
		const element = (array: Operand, subscript: Operand) => {
			load(subscript, AC);
			rel('JLT', AC, SUBSCRIPT_HALT, 'a negative subscript stops the program');
			load(array, AC1);
			rr('ADD', AC1, AC1, AC, 'ac1 = address of the element');
		};
		/** ac = 1 when `x < y` (x in ac, y in ac1), else 0; `flip` swaps the two results. */
		const lessThan = (flip: boolean) => {
			const negative = localLabel();
			const sameSign = localLabel();
			const no = localLabel();
			const yes = localLabel();
			const done = localLabel();
			const [whenLess, whenNot] = flip ? [0, 1] : [1, 0];
			rel('JLT', AC, negative, 'is ac negative?');
			rel('JLT', AC1, no, 'ac is not negative and ac1 is: ac is the larger');
			rel('LDA', PC, sameSign, 'neither is negative');
			bind(negative);
			rel('JGE', AC1, yes, 'ac is negative and ac1 is not: ac is the smaller');
			bind(sameSign);
			rr('SUB', AC, AC, AC1, 'ac = ac - ac1 (same sign: no overflow)');
			rel('JLT', AC, yes, 'negative: ac was the smaller');
			bind(no);
			rm('LDC', AC, whenNot, 0, `ac = ${whenNot}`);
			rel('LDA', PC, done, 'skip');
			bind(yes);
			rm('LDC', AC, whenLess, 0, `ac = ${whenLess}`);
			bind(done);
		};

		let argument = 0;
		fnName = range.name;
		quads.forEach((q, k) => {
			quadIndex = range.from + k;
			quadSpan = q.span;
			if (q.op === 'begin') head(`function ${range.name}: activation record of ${size} cells`);
			head(quadText(q));
			// After a return the end of the function cannot be reached: no second return.
			if (q.op === 'end' && k > 0 && quads[k - 1].op === 'return') return;
			translate(q);
		});
		quadIndex = null;
		quadSpan = null;

		function translate(q: Quad): void {
			switch (q.op) {
				case 'begin':
					bind(entryLabel(range.name));
					rm('ST', AC, RETURN_OFFSET, FP, 'save the return address');
					return;
				case 'end':
					rm('LD', PC, RETURN_OFFSET, FP, 'return to the caller');
					return;
				case 'return':
					if (q.arg1) load(q.arg1, AC);
					rm('LD', PC, RETURN_OFFSET, FP, 'return to the caller');
					return;
				case 'label':
					bind(labelName(q.result));
					return;
				case 'goto':
					rel('LDA', PC, labelName(q.result), `go to ${labelName(q.result)}`);
					return;
				case 'if_false':
					load(q.arg1!, AC);
					rel('JEQ', AC, labelName(q.result), `if ac == 0, go to ${labelName(q.result)}`);
					return;
				case ':=':
					load(q.arg1!, AC);
					store(q.result!, AC);
					return;
				case '=[]':
					element(q.arg1!, q.arg2!);
					rm('LD', AC, 0, AC1, 'ac = the element');
					store(q.result!, AC);
					return;
				case '[]=':
					element(q.result!, q.arg2!);
					load(q.arg1!, AC);
					rm('ST', AC, 0, AC1, 'the element = ac');
					return;
				case 'param':
					load(q.arg1!, AC);
					rm(
						'ST',
						AC,
						-(size + FRAME_HEADER + argument),
						FP,
						`argument ${argument + 1}, in the new record`
					);
					argument++;
					return;
				case 'call': {
					const callee = q.arg1!.kind === 'function' ? q.arg1!.name : '';
					const back = localLabel();
					argument = 0;
					rm('ST', FP, -size + OLD_FP_OFFSET, FP, 'save fp at the base of the new record');
					rm('LDA', FP, -size, FP, 'fp = the new record');
					rel('LDA', AC, back, 'ac = return address');
					rel('LDA', PC, entryLabel(callee), `call ${callee}`, true);
					bind(back);
					rm('LD', FP, OLD_FP_OFFSET, FP, `back in ${range.name}: restore fp`);
					if (q.result) store(q.result, AC, 'the value returned');
					return;
				}
				default:
					binary(q);
			}
		}

		function binary(q: Quad): void {
			const { arg1, arg2, result } = q;
			if (!arg1 || !arg2 || !result) throw new Error(`codegen: incomplete quad ${quadText(q)}`);
			const op = q.op;
			if (isArithOp(op)) {
				const tm = ({ '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV' } as const)[op];
				load(arg1, AC);
				load(arg2, AC1);
				rr(tm, AC, AC, AC1, `ac = ac ${op} ac1`);
				store(result, AC);
				return;
			}
			const equality = EQUALITY_JUMP[op as RelOp];
			if (equality) {
				const yes = localLabel();
				const done = localLabel();
				load(arg1, AC);
				load(arg2, AC1);
				rr('SUB', AC, AC, AC1, 'ac = ac - ac1 (0 exactly when they are equal)');
				rel(equality, AC, yes, op === '==' ? 'equal?' : 'different?');
				rm('LDC', AC, 0, 0, 'ac = 0');
				rel('LDA', PC, done, 'skip');
				bind(yes);
				rm('LDC', AC, 1, 0, 'ac = 1');
				bind(done);
				store(result, AC);
				return;
			}
			// a > b is b < a; a >= b is not (a < b); a <= b is not (b < a).
			const swap = op === '>' || op === '<=';
			load(swap ? arg2 : arg1, AC);
			load(swap ? arg1 : arg2, AC1);
			lessThan(op === '>=' || op === '<=');
			store(result, AC);
		}
	}

	// --- Globals ------------------------------------------------------------

	const globals: GlobalLayout = {
		size: semantic.globalsSize,
		slots: semantic.scopes[0].symbols
			.map((id) => semantic.symbols[id])
			.filter((s) => s.kind === 'variable' || s.kind === 'array')
			.map((s) => ({
				name: s.name,
				kind: s.kind as 'variable' | 'array',
				offset: s.location!.offset,
				address: DADDR_SIZE - 1 + s.location!.offset,
				size: s.kind === 'array' ? (s.size ?? 1) : 1,
				symbol: s.id
			}))
	};

	// --- Data memory: the stack under each function that is called ------------

	const main = semantic.functions.find((f) => f.name === 'main');
	const mainSpan = (main ? semantic.symbols[main.symbol].declSpan : null) ?? undefined;
	if (main) {
		const cells = (id: number) => recordSize.get(id) ?? 0;
		/** Symbol id → the fewest cells in use (globals and records) when the function runs. */
		const need = new Map<number, number>([
			[main.symbol, semantic.globalsSize + cells(main.symbol)]
		]);
		/** Symbol id → the call that ends the shortest chain of calls from main to the function. */
		const reached = new Map<number, CallSite>();
		// A function calls only itself and functions declared before it, so going
		// through the functions from main backward, each one's number is final
		// before its own calls are looked at.
		for (let i = semantic.functions.length - 1; i >= 0; i--) {
			const caller = semantic.functions[i].symbol;
			const base = need.get(caller);
			if (base === undefined) continue;
			for (const site of callSites.get(caller) ?? []) {
				const total = base + cells(site.to);
				if (total < (need.get(site.to) ?? Infinity)) {
					need.set(site.to, total);
					reached.set(site.to, site);
				}
			}
		}
		const chains: SourceDiagnostic[] = [];
		for (const [callee, site] of reached) {
			// One report per chain: none where the function's own record is already
			// reported above, and none where its caller is out of memory itself.
			if (
				need.get(callee)! <= DADDR_SIZE ||
				semantic.globalsSize + cells(callee) > DADDR_SIZE ||
				need.get(site.from)! > DADDR_SIZE
			) {
				continue;
			}
			const chain: number[] = [];
			for (let id: number | undefined = callee; id !== undefined; id = reached.get(id)?.from) {
				chain.unshift(id);
			}
			const records = listText(
				chain.map((id) => `${semantic.symbols[id].name} (${cells(id)} cells)`)
			);
			chains.push({
				severity: 'error',
				message:
					semantic.globalsSize > 0
						? `The global variables (${semantic.globalsSize} cells) and the activation records of ${records} do not fit in the ${DADDR_SIZE} cells of data memory.`
						: `The activation records of ${records} do not fit in the ${DADDR_SIZE} cells of data memory.`,
				span: site.span ?? mainSpan
			});
		}
		chains.sort((x, y) => (x.span?.start ?? 0) - (y.span?.start ?? 0));
		diagnostics.push(...chains);
	}

	// Comment lines of quads that produced no instruction at the very end.
	const trailer = pendingHeader;
	const code = assemble(asm, trailer);
	const improved = peephole(asm);
	const final = assemble(improved.asm, trailer);
	if (final.instructions.length > IADDR_SIZE) {
		diagnostics.push({
			severity: 'error',
			message: `The program needs ${final.instructions.length} instruction cells; the TINY Machine has ${IADDR_SIZE}.`,
			span: mainSpan
		});
	}
	return {
		code,
		peephole: { code: final, changes: improved.changes },
		globals,
		frames,
		diagnostics,
		ok: diagnostics.length === 0
	};
}
