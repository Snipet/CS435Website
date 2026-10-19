import { describe, expect, it } from 'vitest';
import {
	MAX_HANDLE_TOKENS,
	MAX_TOKENS,
	computeParse,
	readGrammar,
	readInput,
	sameRequest,
	type ParseView
} from './model';
import { AMBIGUOUS } from './presets';
import { SLIDE_GRAMMAR, SLIDE_INPUT } from './state';

const g = readGrammar(SLIDE_GRAMMAR).grammar!;

function parse(grammar: string, input: string): ParseView {
	const r = computeParse({ grammar, input });
	if (r.kind !== 'parse') throw new Error(r.message);
	return r;
}

describe('readInput', () => {
	it('reads tokens, with or without the closing $', () => {
		expect(readInput(SLIDE_INPUT, g)).toEqual({
			tokens: ['int', '+', '(', 'int', ')', '+', '(', 'int', ')'],
			error: null
		});
		expect(readInput('int $', g)).toEqual({ tokens: ['int'], error: null });
		expect(readInput('', g)).toEqual({ tokens: [], error: null });
		expect(readInput('int + (int)', g).tokens).toEqual(['int', '+', '(', 'int', ')']);
	});

	it('reports the first problem', () => {
		expect(readInput('int - int', g).error).toBe('- is not a terminal of the grammar.');
		expect(readInput('E + int', g).error).toBe(
			'E is a non-terminal. The input is a string of terminals.'
		);
		expect(readInput('int $ int', g).error).toBe(
			'$ marks the end of the input: only the last token can be $.'
		);
		const long = Array.from({ length: MAX_TOKENS + 1 }, () => 'int').join(' + ');
		expect(readInput(long, g).error).toMatch(
			/^The token string has \d+ tokens; at most 1000 are parsed\.$/
		);
	});
});

describe('computeParse', () => {
	it('parses the slide input with the 12 states of slide 17', () => {
		const r = parse(SLIDE_GRAMMAR, SLIDE_INPUT);
		expect(r.start).toBe('S');
		expect(r.states).toBe(12);
		expect(r.conflicts).toEqual([]);
		expect(r.unresolved).toBe(0);
		expect(r.parse.outcome).toBe('accept');
		expect(r.parse.rows.map((row) => row.text)).toEqual([
			'shift 1',
			'reduce E → int',
			'shift 3',
			'shift 4',
			'shift 5',
			'reduce E → int',
			'shift 7',
			'reduce E → E + ( E )',
			'shift 3',
			'shift 4',
			'shift 5',
			'reduce E → int',
			'shift 7',
			'reduce E → E + ( E )',
			'accept'
		]);
		expect(r.handles).toHaveLength(6);
		expect(r.derivation!.steps).toHaveLength(5);
		expect(r.handlesSkipped).toBe(false);
	});

	it('records what the DFA says on every row (slide 16)', () => {
		const r = parse(SLIDE_GRAMMAR, SLIDE_INPUT);
		expect(r.decisions).toHaveLength(r.parse.rows.length);
		expect(r.decisions[0]).toEqual({
			state: 0,
			token: 'int',
			shift: 1,
			reduces: [],
			accept: false
		});
		expect(r.decisions[1]).toEqual({
			state: 1,
			token: '+',
			shift: null,
			reduces: [{ production: 1, lookaheads: ['$', '+'] }],
			accept: false
		});
		expect(r.decisions[r.decisions.length - 1]).toMatchObject({
			state: 2,
			token: '$',
			accept: true
		});
		r.parse.rows.forEach((row, k) => {
			const d = r.decisions[k];
			expect(d.state).toBe(row.lookup.state);
			if (row.action?.kind === 'shift') expect(d.shift).toBe(row.action.state);
			if (row.action?.kind === 'reduce')
				expect(d.reduces.map((x) => x.production)).toContain(row.action.production);
		});
	});

	it('lists the conflicts with their items and the action the table holds', () => {
		const r = parse(AMBIGUOUS, 'int + int');
		expect(r.conflicts).toHaveLength(4);
		expect(r.conflicts[0]).toEqual({
			state: 5,
			terminal: '+',
			kind: 'shift/reduce',
			items: [
				{ lhs: 'E', rhs: ['E', '+', 'E'], dot: 1, lookaheads: ['+'] },
				{ lhs: 'E', rhs: ['E', '+', 'E'], dot: 3, lookaheads: ['+'] }
			],
			chosen: 'shift 3',
			chosenKind: 'shift'
		});
		expect(r.unresolved).toBe(4);
	});

	it('gives no handles for a rejected input, and none for a long one', () => {
		const rejected = parse(SLIDE_GRAMMAR, 'int + int');
		expect(rejected.parse.outcome).toBe('error');
		expect(rejected.handles).toBeNull();
		expect(rejected.derivation).toBeNull();
		expect(rejected.handlesSkipped).toBe(false);
		const tokens = Math.ceil(MAX_HANDLE_TOKENS / 4) + 1;
		const long = ['int', ...Array.from({ length: tokens }, () => '+ ( int )')].join(' ');
		const r = parse(SLIDE_GRAMMAR, long);
		expect(r.parse.outcome).toBe('accept');
		expect(r.handles).toBeNull();
		expect(r.handlesSkipped).toBe(true);
	});

	it('parses the empty string when the grammar derives it', () => {
		const r = parse('S → ε | id S', '');
		expect(r.parse.outcome).toBe('accept');
		expect(r.handles!.map((h) => h.form)).toEqual([[], ['S']]);
		expect(parse(SLIDE_GRAMMAR, '').parse.outcome).toBe('error');
	});

	it('reports what it cannot parse', () => {
		expect(computeParse({ grammar: 'E → ', input: '' })).toEqual({
			kind: 'problem',
			message: 'The grammar has errors.'
		});
		expect(computeParse({ grammar: SLIDE_GRAMMAR, input: 'x' })).toEqual({
			kind: 'problem',
			message: 'x is not a terminal of the grammar.'
		});
	});

	it('returns plain data that survives a structured clone', () => {
		const r = parse(SLIDE_GRAMMAR, SLIDE_INPUT);
		expect(structuredClone(r)).toEqual(r);
	});

	it('parses a long input', () => {
		const long = ['int', ...Array.from({ length: 240 }, () => '+ ( int )')].join(' ');
		const r = parse(SLIDE_GRAMMAR, long);
		expect(r.parse.outcome).toBe('accept');
		expect(r.parse.input).toHaveLength(962);
	});
});

describe('sameRequest', () => {
	it('compares grammar and input', () => {
		const a = { grammar: 'E → int', input: 'int' };
		expect(sameRequest(a, { ...a })).toBe(true);
		expect(sameRequest(a, { ...a, input: 'int int' })).toBe(false);
		expect(sameRequest(a, null)).toBe(false);
		expect(sameRequest(null, null)).toBe(false);
	});
});
