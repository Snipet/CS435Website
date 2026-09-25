/**
 * Rows for the memory views: the cells worth showing, with the runs between
 * them collapsed into gap rows.
 */
import { DADDR_SIZE, EMPTY_INSTRUCTION, IADDR_SIZE, type Instruction } from './machine';
import type { Program } from './parse';

export type Row<T> =
	{ kind: 'cell'; addr: number; cell: T } | { kind: 'gap'; from: number; to: number };

/** Rows for `addrs` (any order, duplicates allowed) within [0, size), with gaps between. */
export function withGaps<T>(
	addrs: Iterable<number>,
	size: number,
	cell: (addr: number) => T
): Row<T>[] {
	const sorted = [...new Set(addrs)].filter((a) => a >= 0 && a < size).sort((a, b) => a - b);
	const rows: Row<T>[] = [];
	let next = 0;
	for (const addr of sorted) {
		if (addr > next) rows.push({ kind: 'gap', from: next, to: addr - 1 });
		rows.push({ kind: 'cell', addr, cell: cell(addr) });
		next = addr + 1;
	}
	if (next < size) rows.push({ kind: 'gap', from: next, to: size - 1 });
	return rows;
}

export interface IMemCell {
	instr: Instruction;
	/** False for a cell no program line loaded (it holds HALT 0,0,0). */
	loaded: boolean;
	comment: string;
	/** 1-based source line. */
	line: number | null;
}

/** iMem rows: every loaded instruction plus `marks` (PC, jump target). */
export function iMemRows(program: Program, marks: Iterable<number | null>): Row<IMemCell>[] {
	const addrs = program.entries.map((e) => e.addr);
	for (const m of marks) if (m !== null) addrs.push(m);
	return withGaps(addrs, IADDR_SIZE, (addr) => {
		const e = program.at(addr);
		return e
			? { instr: e.instr, loaded: true, comment: e.comment, line: e.line }
			: { instr: EMPTY_INSTRUCTION, loaded: false, comment: '', line: null };
	});
}

/** dMem rows: cell 0, the top cell, every non-zero cell, and `marks`. */
export function dMemRows(dMem: Int32Array, marks: Iterable<number | null>): Row<number>[] {
	const addrs: number[] = [0, DADDR_SIZE - 1];
	for (let a = 0; a < dMem.length; a++) if (dMem[a] !== 0) addrs.push(a);
	for (const m of marks) if (m !== null) addrs.push(m);
	return withGaps(addrs, DADDR_SIZE, (addr) => dMem[addr]);
}

/** "5" or "3–1022". */
export function rangeText(from: number, to: number): string {
	return from === to ? `${from}` : `${from}–${to}`;
}
