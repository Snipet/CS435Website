import { describe, expect, it } from 'vitest';
import { parseEbnf, tokenizeInput, type EbnfGrammar } from '$lib/theory/grammar';
import { generateParser } from './codegen';
import type { Program } from './program';
import {
	DEFAULT_MAX_STEPS,
	DEFAULT_NESTING,
	callNames,
	framesOf,
	runProgram,
	withEndMarker,
	type RunResult,
	type Step
} from './run';

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

function run(grammar: string, input: string, opts?: Parameters<typeof runProgram>[2]): RunResult {
	const e = ebnf(grammar);
	const { tokens, diagnostics } = tokenizeInput(input, [...e.terminals, '$']);
	if (diagnostics.length > 0) throw new Error(`input has errors: ${diagnostics[0].message}`);
	return runProgram(generateParser(e), tokens, opts);
}

/** A step as `kind line pointer`, with what it tested, matched or called. */
function show(program: Program, step: Step): string {
	const at = `${step.line} →${step.pointer}`;
	switch (step.kind) {
		case 'start':
		case 'enter':
			return `${step.kind} ${program.functions[step.fn].name} @${at}`;
		case 'leave':
			return `leave ${program.functions[step.fn].name} @${at}`;
		case 'test':
			return `${step.result ? 'yes' : 'no'} ${step.test} @${at}`;
		case 'match':
		case 'mismatch':
			return `${step.kind} ${step.terminal} @${at}`;
		case 'error':
			return `error ${step.name} @${at}`;
		default:
			return `${step.kind} @${at}`;
	}
}

const trace = (r: RunResult): string[] => r.steps.map((step) => show(r.program, step));
const stackNames = (r: RunResult, step: Step): string[] =>
	framesOf(step).map((f) => r.program.functions[f.fn].name);

const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';
const SLIDE_38 = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';

describe('the parser of slide 37 on int * int $', () => {
	const r = run(SLIDE_37, 'int * int $');

	it('succeeds', () => {
		expect(r.outcome).toBe('accept');
		expect(r.tokens).toEqual(['int', '*', 'int', '$']);
		expect(r.steps[r.steps.length - 1]).toMatchObject({
			kind: 'leave',
			fn: 0,
			to: null,
			pointer: 4
		});
	});

	it('calls main, E, T and T', () => {
		expect(callNames(r)).toEqual(['main', 'E', 'T', 'T']);
	});

	it('records every call, test, match and return with its line', () => {
		expect(trace(r)).toEqual([
			'start main @0 →0',
			'enter E @10 →0',
			'enter T @19 →0',
			"no token == '(' @20 →0",
			'yes isdigit (token) @25 →0',
			'match int @26 →1',
			"yes token == '*' @27 →1",
			'match * @28 →2',
			'enter T @19 →2',
			"no token == '(' @20 →2",
			'yes isdigit (token) @25 →2',
			'match int @26 →3',
			"no token == '*' @27 →3",
			'leave T @34 →3',
			'leave T @34 →3',
			"no token == '+' @12 →3",
			'leave E @16 →3',
			"yes token == '$' @3 →3",
			'match $ @4 →4',
			'leave main @7 →4'
		]);
	});

	it('keeps the call stack of every step, innermost first', () => {
		expect(stackNames(r, r.steps[0])).toEqual(['main']);
		expect(stackNames(r, r.steps[2])).toEqual(['T', 'E', 'main']);
		expect(stackNames(r, r.steps[8])).toEqual(['T', 'T', 'E', 'main']);
		// A function is still on the stack while it returns.
		expect(stackNames(r, r.steps[13])).toEqual(['T', 'T', 'E', 'main']);
		expect(stackNames(r, r.steps[14])).toEqual(['T', 'E', 'main']);
		expect(stackNames(r, r.steps[15])).toEqual(['E', 'main']);
		expect(stackNames(r, r.steps[19])).toEqual(['main']);
	});

	it('knows where each call was made and where the input was', () => {
		const [inner, outer, e, main] = framesOf(r.steps[8]);
		expect(inner).toMatchObject({ fn: 2, site: 29, entered: 2, depth: 4 });
		expect(outer).toMatchObject({ fn: 2, site: 11, entered: 0, depth: 3 });
		expect(e).toMatchObject({ fn: 1, site: 2, entered: 0, depth: 2 });
		expect(main).toMatchObject({ fn: 0, site: null, entered: 0, depth: 1, parent: null });
		expect(r.steps[8]).toMatchObject({ kind: 'enter', fn: 2, from: 2 });
		expect(r.steps[13]).toMatchObject({ kind: 'leave', fn: 2, to: 2, value: null });
	});

	it('says which tokens a test holds for', () => {
		expect(r.steps[4]).toMatchObject({ kind: 'test', tokens: ['int'], result: true, loop: false });
	});

	it('adds $ when the input does not end with it', () => {
		const again = run(SLIDE_37, 'int * int');
		expect(again.tokens).toEqual(['int', '*', 'int', '$']);
		expect(trace(again)).toEqual(trace(r));
		expect(withEndMarker([])).toEqual(['$']);
		expect(withEndMarker(['a', '$'])).toEqual(['a', '$']);
		expect(withEndMarker(['$', 'a'])).toEqual(['$', 'a', '$']);
	});

	it('builds no nodes', () => {
		expect(r.events).toEqual([]);
		expect(r.result).toBeNull();
		expect(r.steps.every((step) => step.heap === 0)).toBe(true);
	});
});

describe('other runs of the slide-37 parser', () => {
	it('( int + int ) * int is not a sentence: T → ( E ) has no [ * T ]', () => {
		const r = run(SLIDE_37, '( int + int ) * int');
		expect(r.outcome).toBe('error');
		expect(trace(r).slice(-4)).toEqual([
			"no token == '+' @12 →5",
			'leave E @16 →5',
			"no token == '$' @3 →5",
			'error main @6 →5'
		]);
		expect(r.steps[r.steps.length - 1]).toMatchObject({ kind: 'error', name: 'main', line: 6 });
	});

	it('int + ( int * int ) is accepted', () => {
		const r = run(SLIDE_37, 'int + ( int * int )');
		expect(r.outcome).toBe('accept');
		expect(callNames(r)).toEqual(['main', 'E', 'T', 'E', 'T', 'E', 'T', 'T']);
		expect(r.steps[r.steps.length - 1].pointer).toBe(8);
	});

	it('stops at error ("T") when no alternative of T starts with the token', () => {
		const r = run(SLIDE_37, 'int + *');
		expect(r.outcome).toBe('error');
		const last = r.steps[r.steps.length - 1];
		expect(last).toMatchObject({ kind: 'error', name: 'T', line: 33, pointer: 2 });
		expect(stackNames(r, last)).toEqual(['T', 'E', 'E', 'main']);
		expect(trace(r).slice(-3)).toEqual([
			"no token == '(' @20 →2",
			'no isdigit (token) @25 →2',
			'error T @33 →2'
		]);
	});

	it('stops at a match that fails', () => {
		const r = run(SLIDE_37, '( int');
		expect(r.outcome).toBe('mismatch');
		const last = r.steps[r.steps.length - 1];
		expect(last).toMatchObject({
			kind: 'mismatch',
			terminal: ')',
			text: "match (')')",
			line: 23,
			pointer: 2
		});
		expect(r.tokens[last.pointer]).toBe('$');
	});

	it('the empty input: error ("T") on $', () => {
		const r = run(SLIDE_37, '');
		expect(r.tokens).toEqual(['$']);
		expect(r.outcome).toBe('error');
		expect(r.steps[r.steps.length - 1]).toMatchObject({ kind: 'error', name: 'T' });
	});

	it('a token after the sentence: error ("main")', () => {
		const r = run(SLIDE_37, 'int int');
		expect(r.outcome).toBe('error');
		expect(r.steps[r.steps.length - 1]).toMatchObject({ kind: 'error', name: 'main', pointer: 1 });
	});
});

describe('loops', () => {
	it('tests the token again after every round of { }', () => {
		const r = run(SLIDE_38, 'int + int + int');
		expect(r.outcome).toBe('accept');
		expect(callNames(r)).toEqual(['main', 'E', 'T', 'F', 'T', 'F', 'T', 'F']);
		const tests = r.steps.filter((s) => s.kind === 'test' && s.loop && s.test === "token == '+'");
		expect(tests.map((s) => (s.kind === 'test' ? s.result : null))).toEqual([true, true, false]);
		expect(tests.map((s) => s.pointer)).toEqual([1, 3, 5]);
	});

	it('runs the default example: int + int * int', () => {
		const r = run(SLIDE_38, 'int + int * int');
		expect(r.outcome).toBe('accept');
		expect(callNames(r)).toEqual(['main', 'E', 'T', 'F', 'T', 'F', 'F']);
		expect(r.steps.filter((s) => s.kind === 'match').map((s) => s.pointer)).toEqual([
			1, 2, 3, 4, 5, 6
		]);
	});

	it('S → 1 { 0 } on 1 0 0 (slide 25)', () => {
		const r = run('S → 1 { 0 }', '1 0 0');
		expect(r.outcome).toBe('accept');
		expect(trace(r)).toEqual([
			'start main @0 →0',
			'enter S @10 →0',
			'match 1 @11 →1',
			"yes token == '0' @12 →1",
			'match 0 @13 →2',
			"yes token == '0' @12 →2",
			'match 0 @13 →3',
			"no token == '0' @12 →3",
			'leave S @15 →3',
			"yes token == '$' @3 →3",
			'match $ @4 →4',
			'leave main @7 →4'
		]);
	});

	it('the same language with S’ → 0 S’ | ε: a call for every 0', () => {
		const r = run('S → 1 S’\nS’ → 0 S’ | ε', '1 0 0');
		expect(r.outcome).toBe('accept');
		expect(callNames(r)).toEqual(['main', 'S', 'S_', 'S_', 'S_']);
	});
});

describe('a left-recursive rule (slide 23)', () => {
	const r = run('V → V a | b', 'b a a');

	it('is stopped when the calls are nested with no token matched', () => {
		expect(r.outcome).toBe('loop');
		expect(DEFAULT_NESTING).toBe(8);
		expect(callNames(r)).toEqual(['main', ...Array.from({ length: DEFAULT_NESTING }, () => 'V')]);
		const last = r.steps[r.steps.length - 1];
		expect(last).toMatchObject({ kind: 'loop', fn: 1, nested: 8, pointer: 0 });
		expect(framesOf(last)).toHaveLength(9);
		expect(r.steps.every((step) => step.pointer === 0)).toBe(true);
	});

	it('takes the nesting from the options', () => {
		const short = run('V → V a | b', 'b a a', { nesting: 3 });
		expect(trace(short)).toEqual([
			'start main @0 →0',
			'enter V @10 →0',
			"yes token == 'b' @11 →0",
			'enter V @10 →0',
			"yes token == 'b' @11 →0",
			'enter V @10 →0',
			'loop @10 →0'
		]);
	});

	it('also through another non-terminal (slide 27)', () => {
		const indirect = run('S → A a | d\nA → S b', 'd b a', { nesting: 2 });
		expect(indirect.outcome).toBe('loop');
		expect(callNames(indirect)).toEqual(['main', 'S', 'A', 'S']);
	});

	it('does not stop a rule that calls itself after matching a token', () => {
		const nested = run(SLIDE_37, '( ( ( ( ( ( ( ( ( ( int ) ) ) ) ) ) ) ) ) )');
		expect(nested.outcome).toBe('accept');
	});
});

describe('limits', () => {
	it('stops after maxSteps steps', () => {
		const r = run(SLIDE_38, 'int + int + int', { maxSteps: 10 });
		expect(r.outcome).toBe('limit');
		expect(r.steps).toHaveLength(11);
		expect(r.steps[10]).toMatchObject({ kind: 'limit', limit: 10 });
		expect(r.steps[10].line).toBe(r.steps[9].line);
		expect(DEFAULT_MAX_STEPS).toBe(20000);
	});

	it('runs deeply nested input without using the stack of the engine', () => {
		const depth = 20000;
		const tokens = [
			...Array.from({ length: depth }, () => '('),
			'int',
			...Array.from({ length: depth }, () => ')')
		];
		const r = runProgram(generateParser(ebnf(SLIDE_37)), tokens, { maxSteps: 1e6 });
		expect(r.outcome).toBe('accept');
		expect(r.steps.reduce((deepest, s) => Math.max(deepest, s.stack.depth), 0)).toBe(2 * depth + 3);
	});

	it('does nothing for code without a function to start with', () => {
		const empty: Program = { kind: 'ast', lines: [], functions: [], main: -1, start: -1 };
		expect(runProgram(empty, ['int'])).toMatchObject({ outcome: 'done', steps: [], calls: [] });
	});
});
