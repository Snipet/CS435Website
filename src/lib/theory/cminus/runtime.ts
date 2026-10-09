/**
 * The run-time conventions of compiled C- programs on the TINY Machine, and
 * the integer arithmetic every phase agrees on.
 *
 * Registers
 *   ac  = 0   accumulator: operands, results, and the value a function returns
 *   ac1 = 1   second operand, and the address of an array element
 *   fp  = 5   frame pointer: the base of the running function's activation record
 *   gp  = 6   global pointer: the highest data address, where the globals start
 *   pc  = 7   program counter
 *
 * Data memory (dMem[0] holds the highest address when the machine starts)
 *
 *   high addresses   globals, the first one at 0(gp), the next ones below it
 *                    activation record of main
 *                    activation record of the function main called
 *   low addresses    …                        (the stack grows downward)
 *
 * Activation record, at fixed offsets from fp
 *
 *    0(fp)   the caller's fp
 *   -1(fp)   the return address
 *   -2(fp)   the first parameter, then the other parameters
 *            the local variables, in the order they are declared
 *            the temporaries, t1 first
 *
 * An array takes one cell per element; element 0 has the lowest address, so
 * element i is at (address of element 0) + i. An array parameter is one cell
 * that holds the address of element 0 of the argument.
 *
 * Calling sequence. The caller stores each argument where the callee will find
 * its parameter (below the caller's own record), stores its fp at the base of
 * the new record, moves fp there, puts the return address in ac, and jumps.
 * The callee first stores ac at -1(fp). To return it leaves the result in ac
 * and loads pc from -1(fp); the caller then reloads its own fp from 0(fp).
 */
import type { ArithOp, RelOp } from './ast';

export const AC = 0;
export const AC1 = 1;
export const FP = 5;
export const GP = 6;
export const PC = 7;

/** "ac", "fp", …: the name the listings use for a register ("r2" for the unnamed ones). */
export function registerName(r: number): string {
	switch (r) {
		case AC:
			return 'ac';
		case AC1:
			return 'ac1';
		case FP:
			return 'fp';
		case GP:
			return 'gp';
		case PC:
			return 'pc';
		default:
			return `r${r}`;
	}
}

/** Offset from fp of the cell that holds the caller's fp. */
export const OLD_FP_OFFSET = 0;
/** Offset from fp of the cell that holds the return address. */
export const RETURN_OFFSET = -1;
/** Cells at the base of every activation record (caller's fp, return address). */
export const FRAME_HEADER = 2;

/** An int is 32 bits, two's complement, as a TINY Machine register. */
export const INT_MIN = -(2 ** 31);
export const INT_MAX = 2 ** 31 - 1;

/**
 * `a op b` as the machine computes it: + - * wrap around at 32 bits and /
 * truncates toward zero. Null for a division by zero.
 */
export function arith(op: ArithOp, a: number, b: number): number | null {
	switch (op) {
		case '+':
			return (a + b) | 0;
		case '-':
			return (a - b) | 0;
		case '*':
			return Math.imul(a, b);
		case '/':
			return b === 0 ? null : (a / b) | 0;
	}
}

/** `a op b` for a relational operator: 1 when it holds, 0 when it does not. */
export function compare(op: RelOp, a: number, b: number): 0 | 1 {
	let holds: boolean;
	switch (op) {
		case '<':
			holds = a < b;
			break;
		case '<=':
			holds = a <= b;
			break;
		case '>':
			holds = a > b;
			break;
		case '>=':
			holds = a >= b;
			break;
		case '==':
			holds = a === b;
			break;
		case '!=':
			holds = a !== b;
			break;
	}
	return holds ? 1 : 0;
}
