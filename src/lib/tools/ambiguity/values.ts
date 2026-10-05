/**
 * The value a parse tree computes when its operands are numbers.
 *
 * The "operand values" field holds one number per operand token of the string
 * (per `int` or `id`: the operand terminals of the grammar), in order. A tree
 * has a value when its shape is built from those operands with the binary
 * operators + - * / (and a leading + or -); parentheses are already gone from
 * the shape. Two trees of an ambiguous string can then be told apart by what
 * they compute: (2 * 3) + 4 = 10 and 2 * (3 + 4) = 14.
 */
import type { Shape } from './shape';

export interface OperandValue {
	/** The number as typed. */
	text: string;
	value: number;
}

export interface ValuesInput {
	values: OperandValue[];
	/** What is wrong with the field, when it cannot be read. */
	error: string | null;
}

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const MINUS = /^[−–]/;

/** Reads numbers separated by spaces or commas. An empty field has no values and no error. */
export function parseValues(text: string): ValuesInput {
	const values: OperandValue[] = [];
	for (const raw of text.split(/[\s,;]+/u)) {
		if (raw === '') continue;
		const word = raw.replace(MINUS, '-');
		if (!NUMBER.test(word)) return { values: [], error: `${raw} is not a number.` };
		values.push({ text: word, value: Number(word) });
	}
	return { values, error: null };
}

/** A number without floating-point noise: 0.1 + 0.2 is written 0.3. */
export function formatValue(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	const rounded = Number(value.toPrecision(12));
	return String(Object.is(rounded, -0) ? 0 : rounded);
}

export type Evaluation =
	| {
			ok: true;
			value: number;
			/** The grouped expression with the numbers in place: `(2 * 3) + 4`. */
			text: string;
	  }
	| { ok: false; reason: 'not-arithmetic' | 'division-by-zero' };

/**
 * An evaluation as text: `(2 * 3) + 4 = 10`, `1 / 0: division by zero`; null
 * for a tree that is not built from numbers and + - * /.
 */
export function evaluationText(e: Evaluation): string | null {
	if (e.ok) return `${e.text} = ${formatValue(e.value)}`;
	return e.reason === 'division-by-zero' ? 'Division by zero' : null;
}

const BINARY: Record<string, (a: number, b: number) => number> = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
	'*': (a, b) => a * b,
	'/': (a, b) => a / b
};

/**
 * Evaluates a shape. `operandAt` gives the number for the token at an index
 * (undefined for a token that is not an operand).
 */
export function evaluate(
	shape: Shape | null,
	operandAt: (at: number) => OperandValue | undefined
): Evaluation {
	const fail: Evaluation = { ok: false, reason: 'not-arithmetic' };
	if (shape === null) return fail;
	const operator = (s: Shape): string | null =>
		s.kind === 'leaf' && operandAt(s.at) === undefined && Object.hasOwn(BINARY, s.symbol)
			? s.symbol
			: null;
	const walk = (s: Shape, top: boolean): Evaluation => {
		if (s.kind === 'leaf') {
			const operand = operandAt(s.at);
			if (!operand) return fail;
			const negative = operand.value < 0 || Object.is(operand.value, -0);
			return {
				ok: true,
				value: operand.value,
				text: negative && !top ? `(${operand.text})` : operand.text
			};
		}
		const wrap = (text: string) => (top ? text : `(${text})`);
		if (s.parts.length === 2) {
			const sign = operator(s.parts[0]);
			if (sign !== '+' && sign !== '-') return fail;
			const operand = walk(s.parts[1], false);
			if (!operand.ok) return operand;
			return {
				ok: true,
				value: sign === '-' ? -operand.value : operand.value,
				text: wrap(`${sign}${operand.text}`)
			};
		}
		if (s.parts.length !== 3) return fail;
		const op = operator(s.parts[1]);
		if (!op) return fail;
		const left = walk(s.parts[0], false);
		if (!left.ok) return left;
		const right = walk(s.parts[2], false);
		if (!right.ok) return right;
		if (op === '/' && right.value === 0) return { ok: false, reason: 'division-by-zero' };
		return {
			ok: true,
			value: BINARY[op](left.value, right.value),
			text: wrap(`${left.text} ${op} ${right.text}`)
		};
	};
	return walk(shape, true);
}
