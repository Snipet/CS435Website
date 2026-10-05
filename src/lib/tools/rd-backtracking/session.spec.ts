import { describe, expect, it } from 'vitest';
import { hasErrors } from '$lib/theory/diagnostics';
import { bracketForm } from '$lib/theory/grammar';
import { DEFAULT_DEPTH_CAP } from './backtrack';
import { functionOf, programText } from './limited';
import {
	MAX_TOKENS_CHECKED,
	analyze,
	anywayApplies,
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
		expect(reversed.backtracking!.stop).toEqual({ reason: 'depth', limit: 5, symbol: 'S' });
		expect(reversed.limited!.stop).toEqual({
			reason: 'depth',
			limit: 5,
			fn: functionOf(reversed.program, 'S')
		});
	});

	it('runs the part of a grammar that the left recursion is not in', () => {
		// Ten non-terminals are expanded before the first token; the left-recursive Z is not one of them.
		const chain =
			'A → B\nB → C\nC → D\nD → F\nF → G\nG → H\nH → I\nI → J\nJ → K\nK → a | Z\nZ → Z b | b';
		const refused = analyze(chain, 'a').run!;
		expect(refused.leftRecursion.map((l) => l.nonterminal)).toEqual(['Z']);
		expect(refused.refused).toBe(true);

		const run = analyze(chain, 'a', { anyway: true }).run!;
		expect(run.depthCap).toBe(DEFAULT_DEPTH_CAP);
		expect(run.inLanguage).toBe(true);
		expect(run.backtracking!.stop).toBeNull();
		expect(run.backtracking!.outcome).toBe('accept');
		expect(bracketForm(run.backtracking!.tree!)).toBe(
			'A( B( C( D( F( G( H( I( J( K(a) ) ) ) ) ) ) ) ) )'
		);
		expect(run.limited!.stop).toBeNull();
		expect(run.limited!.outcome).toBe('accept');
		expect(summarize(run).map((row) => [row.verdict, row.note, row.tried])).toEqual([
			['accept', null, 10],
			['accept', null, 10]
		]);

		// b is reached through Z, which is stopped: Z b is tried for every new Z.
		const through = analyze(chain, 'b', { anyway: true }).run!;
		expect(through.backtracking!.stop).toEqual({
			reason: 'depth',
			limit: DEFAULT_DEPTH_CAP,
			symbol: 'Z'
		});
		expect(through.limited!.stop).toEqual({
			reason: 'depth',
			limit: DEFAULT_DEPTH_CAP,
			fn: functionOf(through.program, 'Z')
		});
	});

	it('raises the cap with the token string, so a parse that ends is not stopped', () => {
		// 1 followed by nine 0: ten S are nested at the first token, one for every token.
		const tokens = '1 0 0 0 0 0 0 0 0 0';
		const run = analyze('S → 1 | S 0', tokens, { anyway: true }).run!;
		expect(run.depthCap).toBe(11);
		expect(run.inLanguage).toBe(true);
		expect(run.backtracking!.outcome).toBe('accept');
		expect(run.backtracking!.stop).toBeNull();
		// The functions return after S → 1, as on the shorter string.
		expect(run.limited!.outcome).toBe('reject');
		expect(run.limited!.leftover).toHaveLength(9);

		const reversed = analyze('S → S 0 | 1', tokens, { anyway: true }).run!;
		expect(reversed.backtracking!.stop).toEqual({ reason: 'depth', limit: 11, symbol: 'S' });
		expect(summarize(reversed).map((row) => row.note)).toEqual([
			'depth cap of 11',
			'depth cap of 11'
		]);
		// A short string keeps the default.
		expect(analyze('S → S 0 | 1', '1 0 0 0 0 0 0', { anyway: true }).run!.depthCap).toBe(
			DEFAULT_DEPTH_CAP
		);
		expect(analyze('S → S 0 | 1', '1 0 0 0 0 0 0 0', { anyway: true }).run!.depthCap).toBe(9);
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

describe('"Run anyway"', () => {
	it('stays on while the grammar is left-recursive', () => {
		expect(anywayApplies(analyze('E → E + T | T\nT → int', 'int + int', { anyway: true }))).toBe(
			true
		);
		expect(anywayApplies(analyze('S → A a | d\nA → S b', 'd', { anyway: true }))).toBe(true);
		// The grammar is what counts: an error in the token stream changes nothing.
		const tokenError = analyze('S → S 0 | 1', '1 2', { anyway: true });
		expect(tokenError.run).toBeNull();
		expect(tokenError.leftRecursion.map((l) => l.nonterminal)).toEqual(['S']);
		expect(anywayApplies(tokenError)).toBe(true);
	});

	it('goes off when the grammar has no left recursion any more', () => {
		const a = analyze('E → T + E | T\nT → int', 'int + int', { anyway: true });
		expect(a.leftRecursion).toEqual([]);
		expect(anywayApplies(a)).toBe(false);
		expect(anywayApplies(analyze(ORDER_1, '( int )', { anyway: true }))).toBe(false);
		expect(anywayApplies(analyze(ORDER_1, 'int -', { anyway: true }))).toBe(false);
	});

	it('is left alone while the grammar has an error', () => {
		const a = analyze('E → E + T |', 'int', { anyway: true });
		expect(a.grammar).toBeNull();
		expect(a.leftRecursion).toEqual([]);
		expect(anywayApplies(a)).toBe(true);
		expect(anywayApplies(analyze('', '', { anyway: true }))).toBe(true);
	});

	it('gives the left recursion of the grammar with and without a run', () => {
		const a = analyze('S → 1 | S 0', '1 0');
		expect(a.leftRecursion).toEqual(a.run!.leftRecursion);
		expect(a.leftRecursion).toEqual([
			{ nonterminal: 'S', immediate: true, productions: ['S → S 0'] }
		]);
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
