import { describe, expect, it } from 'vitest';
import { parseGrammar, parseTrees, tokenizeInput, type Grammar } from '$lib/theory/grammar';
import { operandTerminals, orderTrees, shapeOf } from './shape';
import { evaluate, evaluationText, formatValue, parseValues, type Evaluation } from './values';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

/** Evaluates every tree of `input`, in slide order, with one value per operand token. */
function evaluations(g: Grammar, input: string, numbers: string): Evaluation[] {
	const tokens = tokenizeInput(input, g.terminals).tokens;
	const operands = operandTerminals(g);
	const { values } = parseValues(numbers);
	const places = tokens.flatMap((t, i) => (operands.has(t) ? [i] : []));
	const at = new Map(places.map((place, k) => [place, values[k]]));
	return orderTrees(parseTrees(g, tokens).trees).map((tree) =>
		evaluate(shapeOf(tree), (i) => at.get(i))
	);
}

const AMBIGUOUS = 'E → E + E | E - E | E * E | E / E | ( E ) | - E | int | id';

describe('parseValues', () => {
	it('reads numbers separated by spaces or commas', () => {
		expect(parseValues('2 3 4')).toEqual({
			values: [
				{ text: '2', value: 2 },
				{ text: '3', value: 3 },
				{ text: '4', value: 4 }
			],
			error: null
		});
		expect(parseValues(' 1.5,  -2 ;.25 ').values.map((v) => v.value)).toEqual([1.5, -2, 0.25]);
		expect(parseValues('−3').values).toEqual([{ text: '-3', value: -3 }]);
		expect(parseValues('')).toEqual({ values: [], error: null });
	});

	it('reports what is not a number', () => {
		expect(parseValues('2 x 4')).toEqual({ values: [], error: 'x is not a number.' });
		expect(parseValues('1e3').error).toBe('1e3 is not a number.');
		expect(parseValues('1.2.3').error).toBe('1.2.3 is not a number.');
	});
});

describe('formatValue', () => {
	it('writes numbers without floating-point noise', () => {
		expect(formatValue(10)).toBe('10');
		expect(formatValue(0.1 + 0.2)).toBe('0.3');
		expect(formatValue(7 / 2)).toBe('3.5');
		expect(formatValue(1 / 3)).toBe('0.333333333333');
		expect(formatValue(-0)).toBe('0');
	});
});

describe('evaluationText', () => {
	it('writes the expression and its value, or why there is none', () => {
		expect(evaluationText({ ok: true, value: 10, text: '(2 * 3) + 4' })).toBe('(2 * 3) + 4 = 10');
		expect(evaluationText({ ok: true, value: 0.1 + 0.2, text: '0.1 + 0.2' })).toBe(
			'0.1 + 0.2 = 0.3'
		);
		expect(evaluationText({ ok: false, reason: 'division-by-zero' })).toBe('Division by zero');
		expect(evaluationText({ ok: false, reason: 'not-arithmetic' })).toBeNull();
	});
});

describe('evaluate', () => {
	const g = grammar(AMBIGUOUS);

	it('gives the two trees of int * int + int two values', () => {
		expect(evaluations(g, 'int * int + int', '2 3 4')).toEqual([
			{ ok: true, value: 10, text: '(2 * 3) + 4' },
			{ ok: true, value: 14, text: '2 * (3 + 4)' }
		]);
	});

	it('gives the two trees of int + int + int the same value, and of int - int - int different ones', () => {
		expect(evaluations(g, 'int + int + int', '1 2 3').map((e) => e.ok && e.value)).toEqual([6, 6]);
		expect(evaluations(g, 'int - int - int', '5 3 2')).toEqual([
			{ ok: true, value: 0, text: '(5 - 3) - 2' },
			{ ok: true, value: 4, text: '5 - (3 - 2)' }
		]);
	});

	it('divides, and reports a division by zero', () => {
		expect(evaluations(g, 'int / int / int', '8 4 2').map((e) => e.ok && e.value)).toEqual([1, 4]);
		expect(evaluations(g, 'int / int', '1 0')).toEqual([{ ok: false, reason: 'division-by-zero' }]);
	});

	it('reads through parentheses and single productions', () => {
		const cascade = grammar('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		expect(evaluations(cascade, '( int + int ) * int', '2 3 4')).toEqual([
			{ ok: true, value: 20, text: '(2 + 3) * 4' }
		]);
		expect(evaluations(cascade, '( int )', '7')).toEqual([{ ok: true, value: 7, text: '7' }]);
	});

	it('applies a leading sign and brackets negative operands', () => {
		expect(evaluations(g, '- int', '5')).toEqual([{ ok: true, value: -5, text: '-5' }]);
		expect(evaluations(g, 'int + id', '2 -3')).toEqual([{ ok: true, value: -1, text: '2 + (-3)' }]);
	});

	it('has no value for a tree that is not arithmetic', () => {
		const ifs = grammar('E → if E then E | OTHER');
		expect(evaluations(ifs, 'if OTHER then OTHER', '1 2')).toEqual([
			{ ok: false, reason: 'not-arithmetic' }
		]);
		// An operand without a value.
		expect(evaluate(shapeOf(parseTrees(g, ['int']).trees[0]), () => undefined)).toEqual({
			ok: false,
			reason: 'not-arithmetic'
		});
		expect(evaluate(null, () => undefined).ok).toBe(false);
		// A terminal named like a method of Object is not an operator.
		const odd = grammar('E → E toString E | int');
		expect(evaluations(odd, 'int toString int', '1 2')).toEqual([
			{ ok: false, reason: 'not-arithmetic' }
		]);
	});
});
