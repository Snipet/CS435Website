import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { automatonFromText } from '$lib/theory/automata/core';
import { decodeMachine, decodePositions, encodeMachine, encodePositions } from './codec';
import { presetById } from './presets';

describe('machine codec', () => {
	it('keeps notes, retract marks, other labels and the declared alphabet', () => {
		const relop = presetById('08-16')!.value.machine;
		const json = JSON.parse(JSON.stringify(encodeMachine(relop)));
		expect(decodeMachine(json)).toEqual(relop);
		const withSigma = automatonFromText('alphabet: 0,1\nstart: A\nA 1 A');
		expect(decodeMachine(encodeMachine(withSigma))!.alphabet!.equals(CharSet.of('01'))).toBe(true);
	});

	it('keeps ε-moves and renumbers transitions', () => {
		const a = automatonFromText('start: A\naccept: B\nA ε B\nB 0 A');
		const back = decodeMachine(encodeMachine(a))!;
		expect(back.transitions.map((t) => [t.id, t.label === null])).toEqual([
			[0, true],
			[1, false]
		]);
	});

	it('accepts an empty machine', () => {
		expect(decodeMachine({ s: [], t: [], start: 0 })).toEqual({
			states: [],
			transitions: [],
			start: 0
		});
	});

	it('rejects malformed values', () => {
		const ok = { s: [{ n: 'A' }], t: [[0, 0, [48, 49]]], start: 0 };
		expect(decodeMachine(ok)).not.toBeNull();
		for (const bad of [
			null,
			[],
			{ ...ok, s: 'A' },
			{ ...ok, start: 1 },
			{ ...ok, start: -1 },
			{ ...ok, t: [[0, 1, [48, 49]]] },
			{ ...ok, t: [[0, 0, [49, 48]]] },
			{ ...ok, t: [[0, 0, [48]]] },
			{ ...ok, t: [[0, 0, [0, 0x110000]]] },
			{ ...ok, s: [{ n: 3 }] },
			{ ...ok, sigma: 'x' },
			{ s: Array.from({ length: 201 }, () => ({ n: 'A' })), t: [], start: 0 }
		])
			expect(decodeMachine(bad)).toBeNull();
	});
});

describe('positions codec', () => {
	const a = automatonFromText('start: A\nA 0 B');

	it('round-trips positions by state id', () => {
		const p = new Map([
			[0, { x: 0, y: 0 }],
			[1, { x: 130.26, y: -4 }]
		]);
		const json = encodePositions(a, p);
		expect(json).toEqual([
			[0, 0],
			[130.3, -4]
		]);
		expect(decodePositions(json, 2)).toEqual(
			new Map([
				[0, { x: 0, y: 0 }],
				[1, { x: 130.3, y: -4 }]
			])
		);
	});

	it('means automatic layout when missing or incomplete', () => {
		expect(encodePositions(a, null)).toBeNull();
		expect(encodePositions(a, new Map([[0, { x: 0, y: 0 }]]))).toBeNull();
		expect(decodePositions(null, 2)).toBeNull();
		expect(decodePositions([[0, 0]], 2)).toBeNull();
		expect(
			decodePositions(
				[
					[0, 0],
					[NaN, 1]
				],
				2
			)
		).toBeNull();
		expect(
			decodePositions(
				[
					[0, 0],
					['1', 1]
				],
				2
			)
		).toBeNull();
	});
});
