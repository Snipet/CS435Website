import { describe, expect, it } from 'vitest';
import { hasErrors } from '$lib/theory/diagnostics';
import { DEFAULT_DEPTH_CAP } from './backtrack';
import { programText } from './limited';
import {
	MAX_TOKENS_CHECKED,
	analyze,
	leftRecursionNotes,
	showsLimitation,
	summarize
} from './session';
import { grammar } from '$lib/theory/grammar/test-helpers';

const ORDER_1 = 'E → T | T + E\nT → int | int * T | ( E )';

describe('analyze', () => {
	it('runs both parsers on a grammar and a token string without errors', () => {
		const a = analyze(ORDER_1, '( int )');
		expect(a.grammarDiagnostics).toEqual([]);
		expect(a.inputDiagnostics).toEqual([]);
		expect(a.tokens).toEqual(['(', 'int', ')']);
		const run = a.run!;
		expect(run).toMatchObject({
			grammarText: ORDER_1,
			inputText: '( int )',
			tokens: ['(', 'int', ')'],
			leftRecursion: [],
			refused: false,
			depthCap: null,
			inLanguage: true
		});
		expect(run.backtracking!.outcome).toBe('accept');
		expect(run.limited!.outcome).toBe('accept');
		expect(programText(run.program)).toContain(
			'bool T3 () { return match (OPEN) && E () && match (CLOSE); }'
		);
	});

	it('reports grammar errors and runs nothing', () => {
		const a = analyze('E → T |', 'int');
		expect(a.grammar).toBeNull();
		expect(hasErrors(a.grammarDiagnostics)).toBe(true);
		expect(a.tokens).toEqual([]);
		expect(a.inputDiagnostics).toEqual([]);
		expect(a.run).toBeNull();
		expect(analyze('', '').run).toBeNull();
	});

	it('reports a token that is not a terminal and runs nothing', () => {
		const a = analyze(ORDER_1, 'int - int');
		expect(a.grammar).not.toBeNull();
		expect(a.inputDiagnostics.map((d) => d.message)).toEqual([
			'- is not a terminal of the grammar.'
		]);
		expect(a.run).toBeNull();
		expect(analyze(ORDER_1, 'E').inputDiagnostics[0].message).toBe(
			'E is a non-terminal. The input is a string of terminals.'
		);
	});

	it('runs on the empty token string', () => {
		const run = analyze(ORDER_1, '   ').run!;
		expect(run.tokens).toEqual([]);
		expect(run.backtracking!.outcome).toBe('reject');
		expect(run.limited!.outcome).toBe('reject');
		expect(run.inLanguage).toBe(false);
	});

	it('keeps warnings and notes of the grammar without stopping the run', () => {
		const a = analyze('s → a s | a', 'a a');
		expect(a.grammarDiagnostics.map((d) => d.severity)).toEqual(['info']);
		expect(a.run!.backtracking!.outcome).toBe('accept');
	});

	it('does not check very long inputs against the language', () => {
		const tokens = Array<string>(MAX_TOKENS_CHECKED + 1)
			.fill('a')
			.join(' ');
		const run = analyze('S → a S | a', tokens).run!;
		expect(run.inLanguage).toBeNull();
		expect(run.backtracking!.outcome).toBe('accept');
	});

	it('passes the step budget on', () => {
		const run = analyze(ORDER_1, '( int )', { maxSteps: 5 }).run!;
		expect(run.backtracking!.steps).toHaveLength(5);
		expect(run.limited!.steps).toHaveLength(5);
		expect(run.backtracking!.stop).toEqual({ reason: 'steps', limit: 5 });
	});
});

describe('left recursion', () => {
	it('is not run unless asked to', () => {
		const run = analyze('S → 1 | S 0', '1 0').run!;
		expect(run.refused).toBe(true);
		expect(run.backtracking).toBeNull();
		expect(run.limited).toBeNull();
		expect(run.leftRecursion).toEqual([
			{ nonterminal: 'S', immediate: true, productions: ['S → S 0'] }
		]);
		// The code is still generated, and the language is still known.
		expect(programText(run.program)).toContain('bool S2 () { return S () && match (ZERO); }');
		expect(run.inLanguage).toBe(true);
		expect(run.depthCap).toBe(DEFAULT_DEPTH_CAP);
	});

	it('runs anyway with a depth cap', () => {
		const first = analyze('S → 1 | S 0', '1 0', { anyway: true }).run!;
		expect(first.refused).toBe(false);
		expect(first.depthCap).toBe(DEFAULT_DEPTH_CAP);
		expect(first.backtracking!.outcome).toBe('accept');
		expect(first.backtracking!.steps).toHaveLength(8);
		// The functions return true after S → 1 with 0 left over.
		expect(first.limited!.leftover).toEqual(['0']);

		const reversed = analyze('S → S 0 | 1', '1 0', { anyway: true, depthCap: 5 }).run!;
		expect(reversed.backtracking!.stop).toEqual({ reason: 'depth', limit: 5 });
		expect(reversed.limited!.stop).toEqual({ reason: 'depth', limit: 5 });
	});

	it('names the productions of an indirect left recursion (slide 27)', () => {
		expect(leftRecursionNotes(grammar('S → A a | d\nA → S b'))).toEqual([
			{ nonterminal: 'S', immediate: false, productions: ['S → A a', 'A → S b'] },
			{ nonterminal: 'A', immediate: false, productions: ['A → S b', 'S → A a'] }
		]);
		expect(leftRecursionNotes(grammar(ORDER_1))).toEqual([]);
		expect(
			leftRecursionNotes(grammar('E → E + T | T\nT → T * F | F\nF → ( E ) | int')).map(
				(n) => `${n.nonterminal}: ${n.productions.join(', ')}`
			)
		).toEqual(['E: E → E + T', 'T: T → T * F']);
	});
});

describe('summarize', () => {
	it('compares the two parsers', () => {
		expect(summarize(analyze(ORDER_1, '( int )').run!)).toEqual([
			{ parser: 'backtracking', verdict: 'accept', note: null, tried: 6, backtracks: 2 },
			{ parser: 'functions', verdict: 'accept', note: null, tried: 6, backtracks: 2 }
		]);
	});

	it('shows the limitation of slide 33 on int * int', () => {
		const run = analyze(ORDER_1, 'int * int').run!;
		expect(summarize(run)).toEqual([
			{ parser: 'backtracking', verdict: 'accept', note: null, tried: 4, backtracks: 1 },
			{ parser: 'functions', verdict: 'reject', note: 'input left over', tried: 2, backtracks: 0 }
		]);
		expect(showsLimitation(run)).toBe(true);
		expect(showsLimitation(analyze(ORDER_1, '( int )').run!)).toBe(false);
		// Rejected, and rightly so.
		expect(showsLimitation(analyze(ORDER_1, 'int int').run!)).toBe(false);
	});

	it('says when a parser was not run or was stopped', () => {
		expect(summarize(analyze('S → S 0 | 1', '1 0').run!)).toEqual([
			{ parser: 'backtracking', verdict: 'not-run', note: null, tried: null, backtracks: null },
			{ parser: 'functions', verdict: 'not-run', note: null, tried: null, backtracks: null }
		]);
		expect(summarize(analyze('S → S 0 | 1', '1 0', { anyway: true }).run!)).toEqual([
			{
				parser: 'backtracking',
				verdict: 'stopped',
				note: `depth cap of ${DEFAULT_DEPTH_CAP}`,
				tried: 8,
				backtracks: 0
			},
			{
				parser: 'functions',
				verdict: 'stopped',
				note: `depth cap of ${DEFAULT_DEPTH_CAP}`,
				tried: 8,
				backtracks: 0
			}
		]);
		const budget = summarize(analyze(ORDER_1, '( int )', { maxSteps: 4 }).run!);
		expect(budget.map((r) => r.note)).toEqual(['after 4 steps', 'after 4 steps']);
	});
});
