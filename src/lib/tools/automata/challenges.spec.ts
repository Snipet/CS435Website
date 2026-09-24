import { describe, expect, it } from 'vitest';
import { automatonFromText } from '$lib/theory/automata/core';
import { regexToNfa } from '$lib/theory/automata/language';
import { parseRegex } from '$lib/theory/regex/lecture';
import {
	BUILD_CHALLENGES,
	buildMessage,
	challengeById,
	checkBuild,
	checkGuess,
	guessMessage
} from './challenges';
import { compareBounded, estimateNfaSize } from './compare';
import { presetById } from './presets';

const machine = (id: string) => presetById(id)!.value.machine;
const nfa = (text: string) => {
	const r = parseRegex(text);
	if (!r.ok) throw new Error('bad RE');
	return regexToNfa(r.regex);
};

describe('compareBounded', () => {
	it('finds equal languages', () => {
		expect(compareBounded(machine('06-8'), nfa('(0 | 1)*00'))).toEqual({ kind: 'same' });
		expect(compareBounded(machine('06-15'), machine('06-8'))).toEqual({ kind: 'same' });
	});

	it('returns the shortest strings in each difference', () => {
		expect(compareBounded(machine('06-8'), nfa('(0 | 1)*0'))).toEqual({
			kind: 'differ',
			onlyA: null,
			onlyB: '0'
		});
		expect(compareBounded(nfa('1*0 | 11'), nfa('1*0'))).toEqual({
			kind: 'differ',
			onlyA: '11',
			onlyB: null
		});
		expect(compareBounded(nfa('ε'), nfa('1'))).toEqual({ kind: 'differ', onlyA: '', onlyB: '1' });
	});

	it('gives up on machines that blow up', () => {
		const big = nfa('(0 | 1)* 1 (0|1)^14');
		expect(compareBounded(big, nfa('(0 | 1)* 1 (0 | 1)^14'), { maxStates: 500 })).toEqual({
			kind: 'too-large'
		});
	});

	it('estimates Thompson sizes', () => {
		const r = parseRegex('(0 | 1)^1000');
		if (!r.ok) throw new Error('bad RE');
		expect(estimateNfaSize(r.regex, 5000)).toBe(5000);
		const small = parseRegex('(1 | 0)*1');
		if (!small.ok) throw new Error('bad RE');
		expect(estimateNfaSize(small.regex)).toBeGreaterThanOrEqual(10);
	});
});

describe('What language?', () => {
	it('answers slide 8 with (0 | 1)*00', () => {
		expect(checkGuess(machine('06-8'), '(0 | 1)*00').kind).toBe('same');
	});

	it('names a string on which the RE and the machine differ', () => {
		const r = checkGuess(machine('06-7'), '1*0 | 111');
		expect(r).toMatchObject({ kind: 'differ', onlyMachine: null, onlyRegex: '111' });
		expect(guessMessage('110', false)).toBe('"110" is in L(R) but is not accepted by the machine.');
		const s = checkGuess(machine('06-8'), '(0 | 1)*000');
		expect(s).toMatchObject({ kind: 'differ', onlyMachine: '00' });
		expect(guessMessage('110', true)).toBe('"110" is accepted by the machine but is not in L(R).');
	});

	it('reports parse errors and empty input', () => {
		expect(checkGuess(machine('06-8'), '  ').kind).toBe('empty');
		const bad = checkGuess(machine('06-8'), '(0 | 1');
		expect(bad.kind).toBe('invalid');
		expect(bad.kind === 'invalid' && bad.diagnostics.length).toBeGreaterThan(0);
	});

	it('reads Σ as the machine alphabet', () => {
		expect(checkGuess(machine('06-8'), 'Σ*00').kind).toBe('same');
	});

	it('refuses huge expressions', () => {
		expect(checkGuess(machine('06-8'), '(0 | 1)^1000').kind).toBe('too-large');
	});
});

describe('Build a DFA', () => {
	it('has six tasks with parseable reference REs', () => {
		expect(BUILD_CHALLENGES).toHaveLength(6);
		for (const c of BUILD_CHALLENGES) expect(parseRegex(c.regex).ok).toBe(true);
		expect(challengeById('ends-00')?.cite).toEqual({ deck: '06', slide: 8 });
	});

	it('accepts the slide machines for their tasks', () => {
		const pairs: [string, string][] = [
			['06-6', 'exactly-1'],
			['06-7', 'ones-then-0'],
			['06-8', 'ends-00']
		];
		for (const [preset, task] of pairs)
			expect(checkBuild(machine(preset), challengeById(task)!)).toMatchObject({
				kind: 'checked',
				correct: true,
				determinism: expect.stringMatching(/dfa/)
			});
	});

	it('flags an NFA that has the right language', () => {
		expect(checkBuild(machine('06-16'), challengeById('third-from-end')!)).toMatchObject({
			kind: 'checked',
			correct: true,
			determinism: 'nfa'
		});
	});

	it('reports the first wrong string', () => {
		const evenZeros = challengeById('even-zeros')!;
		const acceptsAll = automatonFromText('start: A\naccept: A\nA 0,1 A');
		expect(checkBuild(acceptsAll, evenZeros)).toMatchObject({
			correct: false,
			witness: '0',
			shouldAccept: false
		});
		const onlyEmpty = automatonFromText('start: A\naccept: A');
		expect(checkBuild(onlyEmpty, evenZeros)).toMatchObject({
			correct: false,
			witness: '1',
			shouldAccept: true
		});
		expect(buildMessage('1', true)).toBe('"1" is in the language, but the machine rejects it.');
		expect(buildMessage('0', false)).toBe(
			'"0" is not in the language, but the machine accepts it.'
		);
	});

	it('needs a machine', () => {
		expect(checkBuild({ states: [], transitions: [], start: 0 }, BUILD_CHALLENGES[0])).toEqual({
			kind: 'no-machine'
		});
	});
});
