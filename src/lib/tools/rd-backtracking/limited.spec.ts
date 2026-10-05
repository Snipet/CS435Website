import { describe, expect, it } from 'vitest';
import { leftRecursion, recognizes } from '$lib/theory/grammar';
import {
	TOP_DOWN,
	TOP_DOWN_2,
	bruteForce,
	grammar,
	input,
	random,
	randomGrammar
} from '$lib/theory/grammar/test-helpers';
import { backtrack } from './backtrack';
import {
	DEFAULT_MAX_STEPS,
	functionOf,
	functionText,
	generateProgram,
	lineText,
	listTokens,
	messageText,
	programText,
	runLimited,
	stackOf,
	type LimitedResult,
	type Program
} from './limited';
import { asciiText, plainText } from './notation';

const pad = ' '.repeat(36);

/** Top-Down Parsing, slide 34, with the production numbers as ordinary digits. */
const SLIDE_34 = [
	'bool match (TOKEN tok) { return *next++ == tok; }',
	'',
	'bool E1 () { return T (); }',
	'bool E2 () { return T () && match (PLUS) && E (); }',
	'',
	'bool E () { TOKEN* save = next; return E1 ()',
	`${pad}|| (next = save, E2 ()); }`,
	'bool T1 () { return match (INT); }',
	'bool T2 () { return match (INT) && match (TIMES) && T (); }',
	'bool T3 () { return match (OPEN) && E () && match (CLOSE); }',
	'',
	'bool T () { TOKEN* save = next; return T1 ()',
	`${pad}|| (next = save, T2 ())`,
	`${pad}|| (next = save, T3 ()); }`
];

const program = (text: string): Program => generateProgram(grammar(text));
const run = (text: string, s: string, opts?: Parameters<typeof runLimited>[2]): LimitedResult => {
	const g = grammar(text);
	return runLimited(generateProgram(g), input(g, s), opts);
};
const fname = (p: Program, fn: number): string => asciiText([p.functions[fn].name]);
/** The calls in progress: E > E1 > T. */
const callsAt = (p: Program, r: LimitedResult, i: number): string =>
	stackOf(r.steps[i])
		.map((f) => fname(p, f.fn))
		.join(' > ');

describe('the generated code (Top-Down Parsing, slide 34)', () => {
	const p = program(TOP_DOWN);

	it('is the code of the slide', () => {
		expect(programText(p).split('\n')).toEqual(SLIDE_34);
	});

	it('answers the blanks of slides 31 and 32', () => {
		const g = p.grammar;
		const of = (rhs: string) =>
			functionText(p, functionOf(p, g.productions.find((x) => x.rhs.join(' ') === rhs)!.id));
		expect(of('T + E')).toBe('bool E2 () { return T () && match (PLUS) && E (); }');
		expect(of('int * T')).toBe('bool T2 () { return match (INT) && match (TIMES) && T (); }');
		expect(of('( E )')).toBe('bool T3 () { return match (OPEN) && E () && match (CLOSE); }');
		expect(of('T')).toBe('bool E1 () { return T (); }');
		expect(functionText(p, functionOf(p, 'E')).split('\n')).toEqual(SLIDE_34.slice(5, 7));
		expect(functionOf(p, 'X')).toBe(-1);
	});

	it('names the tokens INT, OPEN, CLOSE, PLUS, TIMES (slide 28)', () => {
		// In the order of T: + is the first terminal the grammar uses.
		expect([...p.constants]).toEqual([
			['+', 'PLUS'],
			['int', 'INT'],
			['*', 'TIMES'],
			['(', 'OPEN'],
			[')', 'CLOSE']
		]);
	});

	it('numbers the functions of the productions from 1, as subscripts', () => {
		expect(p.functions.map((f) => plainText([f.name]))).toEqual([
			'match',
			'E₁',
			'E₂',
			'E',
			'T₁',
			'T₂',
			'T₃',
			'T'
		]);
		expect(p.functions.map((f) => f.kind)).toEqual([
			'match',
			'production',
			'production',
			'nonterminal',
			'production',
			'production',
			'production',
			'nonterminal'
		]);
		expect(p.functions.map((f) => f.lines)).toEqual([
			[0, 0],
			[2, 2],
			[3, 3],
			[5, 6],
			[7, 7],
			[8, 8],
			[9, 9],
			[11, 13]
		]);
		expect(p.start).toBe(3);
		expect(p.functions[2]).toMatchObject({ nonterminal: 'E', production: 1 });
	});

	it('marks the expressions a step executes', () => {
		const texts = p.sites.map((s, id) => {
			const pieces = p.lines[s.line].pieces.filter((piece) => piece.site === id);
			return `${s.kind}: ${asciiText(pieces)}`;
		});
		expect(texts).toEqual([
			'compare: *next++ == tok',
			'call: T ()',
			'call: T ()',
			'match: match (PLUS)',
			'call: E ()',
			'save: save = next',
			'call: E1 ()',
			'restore: next = save',
			'call: E2 ()',
			'match: match (INT)',
			'match: match (INT)',
			'match: match (TIMES)',
			'call: T ()',
			'match: match (OPEN)',
			'call: E ()',
			'match: match (CLOSE)',
			'save: save = next',
			'call: T1 ()',
			'restore: next = save',
			'call: T2 ()',
			'restore: next = save',
			'call: T3 ()'
		]);
		for (const s of p.sites) expect(p.lines[s.line].fn).toBe(s.fn);
		expect(p.sites[3]).toMatchObject({ constant: 'PLUS', callee: 0 });
		expect(p.sites[4].callee).toBe(functionOf(p, 'E'));
	});

	it('writes the other order of the same grammar (slide 28)', () => {
		expect(programText(program(TOP_DOWN_2)).split('\n')).toEqual([
			SLIDE_34[0],
			'',
			'bool E1 () { return T () && match (PLUS) && E (); }',
			'bool E2 () { return T (); }',
			'',
			'bool E () { TOKEN* save = next; return E1 ()',
			`${pad}|| (next = save, E2 ()); }`,
			'bool T1 () { return match (OPEN) && E () && match (CLOSE); }',
			'bool T2 () { return match (INT); }',
			'bool T3 () { return match (INT) && match (TIMES) && T (); }',
			'',
			'bool T () { TOKEN* save = next; return T1 ()',
			`${pad}|| (next = save, T2 ())`,
			`${pad}|| (next = save, T3 ()); }`
		]);
	});
});

describe('code for other grammars', () => {
	it('returns true for ε and closes a single production on one line', () => {
		expect(programText(program('S → a S | ε\nA → b')).split('\n')).toEqual([
			SLIDE_34[0],
			'',
			// The terminal a would be A, which is the function of the non-terminal A.
			'bool S1 () { return match (A_) && S (); }',
			'bool S2 () { return true; }',
			'',
			'bool S () { TOKEN* save = next; return S1 ()',
			`${pad}|| (next = save, S2 ()); }`,
			'bool A1 () { return match (B); }',
			'',
			'bool A () { TOKEN* save = next; return A1 (); }'
		]);
	});

	it('names digits, punctuation, words and quoted terminals in upper case', () => {
		const p = program(
			'S → 1 | S 0 | "42" | id "==" id | if-stmt | "the cat" | while | - | ; | x1 | "é" | _'
		);
		expect([...p.constants.values()]).toEqual([
			'ONE',
			'ZERO',
			'NUM_42',
			'ID',
			'EQ',
			'IF_STMT',
			'THE_CAT',
			'WHILE',
			'MINUS',
			'SEMI',
			'X1',
			'UE9',
			'TOKEN_'
		]);
	});

	it('keeps every name apart', () => {
		// A terminal named like a function, a non-terminal named like a keyword or like E's first function.
		const p = program('E → e1 | E1 | match\nE1 → e | E | int\nint → x | e_');
		const names = [
			...p.functions.map((f) => asciiText([f.name])),
			...p.constants.values(),
			'next',
			'save',
			'tok'
		];
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual([
			'match',
			// E1 is the non-terminal's function, so the productions of E are E_1 …
			'E_1',
			'E_2',
			'E_3',
			'E',
			'E1_1',
			'E1_2',
			'E1_3',
			'E1',
			'int_1',
			'int_2',
			'int_',
			'E1_',
			'MATCH',
			'E_',
			'X',
			'E__',
			'next',
			'save',
			'tok'
		]);
		expect(lineText(p, 2)).toBe('bool E_1 () { return match (E1_); }');
	});

	it('writes primes and hyphens as underscores', () => {
		const p = program("S → 1 S’\nS' → 0 S’ | ε\nif-stmt → x");
		expect(p.functions.map((f) => asciiText([f.name]))).toEqual([
			'match',
			'S1',
			'S',
			'S_1',
			'S_2',
			'S_',
			'if_stmt1',
			'if_stmt'
		]);
		expect(lineText(p, 2)).toBe('bool S1 () { return match (ONE) && S_ (); }');
	});
});

describe('running the code on ( int ) (slide 34)', () => {
	const g = grammar(TOP_DOWN);
	const p = generateProgram(g);
	const r = runLimited(p, input(g, '( int )'));

	it('accepts: E () returns true and next points to end-of-stream (slide 30)', () => {
		expect(r.outcome).toBe('accept');
		expect(r.returned).toBe(true);
		expect(r.next).toBe(3);
		expect(r.leftover).toEqual([]);
		expect(r.stop).toBeNull();
		expect(messageText(r.steps[r.steps.length - 1])).toEqual([
			'E () returned true and next points to end-of-stream: accept'
		]);
	});

	it('starts as slide 33 says', () => {
		expect(messageText(r.steps[0])).toEqual([
			'Initialize next to point to first token',
			'Invoke E ()'
		]);
		expect(r.steps[0]).toMatchObject({ event: 'start', next: 0, top: null, line: null });
	});

	it('records every call, match, return and next = save', () => {
		const trace = r.steps.map(
			(s, i) => `${s.event} next=${s.next} ${messageText(s)[0]} [${callsAt(p, r, i)}]`
		);
		expect(trace).toEqual([
			'start next=0 Initialize next to point to first token []',
			'call next=0 Call E () [E]',
			'call next=0 Call E₁ () [E > E1]',
			'call next=0 Call T () [E > E1 > T]',
			'call next=0 Call T₁ () [E > E1 > T > T1]',
			'match next=1 match (INT): *next is OPEN, not INT [E > E1 > T > T1]',
			'return next=1 T₁ () returns false [E > E1 > T]',
			'restore next=0 next = save [E > E1 > T]',
			'call next=0 Call T₂ () [E > E1 > T > T2]',
			'match next=1 match (INT): *next is OPEN, not INT [E > E1 > T > T2]',
			'return next=1 T₂ () returns false [E > E1 > T]',
			'restore next=0 next = save [E > E1 > T]',
			'call next=0 Call T₃ () [E > E1 > T > T3]',
			'match next=1 match (OPEN): *next is OPEN [E > E1 > T > T3]',
			'call next=1 Call E () [E > E1 > T > T3 > E]',
			'call next=1 Call E₁ () [E > E1 > T > T3 > E > E1]',
			'call next=1 Call T () [E > E1 > T > T3 > E > E1 > T]',
			'call next=1 Call T₁ () [E > E1 > T > T3 > E > E1 > T > T1]',
			'match next=2 match (INT): *next is INT [E > E1 > T > T3 > E > E1 > T > T1]',
			'return next=2 T₁ () returns true [E > E1 > T > T3 > E > E1 > T]',
			'return next=2 T () returns true [E > E1 > T > T3 > E > E1]',
			'return next=2 E₁ () returns true [E > E1 > T > T3 > E]',
			'return next=2 E () returns true [E > E1 > T > T3]',
			'match next=3 match (CLOSE): *next is CLOSE [E > E1 > T > T3]',
			'return next=3 T₃ () returns true [E > E1 > T]',
			'return next=3 T () returns true [E > E1]',
			'return next=3 E₁ () returns true [E]',
			'return next=3 E () returns true []',
			'accept next=3 E () returned true and next points to end-of-stream: accept []'
		]);
	});

	it('match advances next even when the comparison fails', () => {
		const failed = r.steps[5];
		expect(failed).toMatchObject({
			event: 'match',
			result: false,
			next: 1,
			compare: { constant: 'INT', at: 0, found: '(' }
		});
		expect(messageText(failed)).toEqual([
			'match (INT): *next is OPEN, not INT',
			'Returns false; next advances'
		]);
		// The function of T puts next back before its second production.
		expect(r.steps[7]).toMatchObject({ event: 'restore', next: 0 });
		expect(messageText(r.steps[7])).toEqual(['next = save', 'next points to OPEN again']);
	});

	it('gives each function of a non-terminal its own save', () => {
		expect(stackOf(r.steps[1])).toEqual([{ fn: 3, entry: 0, save: 0, site: 5 }]);
		expect(r.steps[1].top!.depth).toBe(1);
		const inner = stackOf(r.steps[16]);
		expect(r.steps[16].top!.depth).toBe(7);
		expect(inner.map((f) => f.save)).toEqual([0, null, 0, null, 1, null, 1]);
		expect(inner.map((f) => f.entry)).toEqual([0, 0, 0, 0, 1, 1, 1]);
	});

	it('points at the line and the expression being executed', () => {
		const where = (i: number) => {
			const s = r.steps[i];
			const line = s.line === null ? null : lineText(p, s.line).trim();
			const pieces =
				s.site === null ? [] : p.lines[s.line!].pieces.filter((x) => x.site === s.site);
			return [line, asciiText(pieces)];
		};
		// Entering a function: its first line; for a non-terminal, the save.
		expect(where(1)).toEqual(['bool E () { TOKEN* save = next; return E1 ()', 'save = next']);
		expect(where(2)).toEqual(['bool E1 () { return T (); }', '']);
		// A match is executed where it is called.
		expect(where(5)).toEqual(['bool T1 () { return match (INT); }', 'match (INT)']);
		// A return shows the call in the caller.
		expect(where(6)).toEqual(['bool T () { TOKEN* save = next; return T1 ()', 'T1 ()']);
		expect(where(7)).toEqual(['|| (next = save, T2 ())', 'next = save']);
		expect(where(22)).toEqual([
			'bool T3 () { return match (OPEN) && E () && match (CLOSE); }',
			'E ()'
		]);
		expect(where(27)).toEqual([null, '']);
		// The calls in progress remember where they are.
		const sites = stackOf(r.steps[13]).map((f) =>
			f.site === null
				? null
				: asciiText(p.lines[p.sites[f.site].line].pieces.filter((x) => x.site === f.site))
		);
		expect(sites).toEqual(['E1 ()', 'T ()', 'T3 ()', 'match (OPEN)']);
	});

	it('says which productions a successful function never calls', () => {
		expect(messageText(r.steps[20])).toEqual([
			'T () returns true',
			'T₂ () and T₃ () are not called'
		]);
		expect(messageText(r.steps[22])).toEqual(['E () returns true', 'E₂ () is not called']);
		// T3 is the last production of T: nothing is left out.
		expect(messageText(r.steps[25])).toEqual(['T () returns true']);
	});

	it('lists the calls with their results', () => {
		const list = r.calls.map(
			(c) =>
				`${'  '.repeat(c.depth)}${c.fn === 0 ? `match (${c.constant})` : `${fname(p, c.fn)} ()`} ` +
				`${c.result} ${c.entry}→${c.exit} @${c.start}–${c.end}`
		);
		expect(list).toEqual([
			'E () true 0→3 @1–27',
			'  E1 () true 0→3 @2–26',
			'    T () true 0→3 @3–25',
			'      T1 () false 0→1 @4–6',
			'        match (INT) false 0→1 @5–5',
			'      T2 () false 0→1 @8–10',
			'        match (INT) false 0→1 @9–9',
			'      T3 () true 0→3 @12–24',
			'        match (OPEN) true 0→1 @13–13',
			'        E () true 1→2 @14–22',
			'          E1 () true 1→2 @15–21',
			'            T () true 1→2 @16–20',
			'              T1 () true 1→2 @17–19',
			'                match (INT) true 1→2 @18–18',
			'        match (CLOSE) true 2→3 @23–23'
		]);
		r.steps.forEach((s, i) => expect(s.calls).toBe(r.calls.filter((c) => c.start <= i).length));
	});

	it('counts the productions tried and the times next was put back', () => {
		expect(r.tried).toBe(6);
		expect(r.restores).toBe(2);
		expect(r.steps.map((s) => s.tried)).toEqual([
			0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6
		]);
		expect(r.steps[7].restores).toBe(1);
		expect(r.steps[11].restores).toBe(2);
	});
});

describe('the limitation (Top-Down Parsing, slide 33)', () => {
	const g = grammar(TOP_DOWN);
	const p = generateProgram(g);
	const r = runLimited(p, input(g, 'int * int'));

	it('returns true with input left over, so int * int is rejected', () => {
		expect(r.returned).toBe(true);
		expect(r.next).toBe(1);
		expect(r.leftover).toEqual(['*', 'int']);
		expect(r.outcome).toBe('reject');
		expect(messageText(r.steps[r.steps.length - 1])).toEqual([
			'E () returned true, but next does not point to end-of-stream: reject',
			'Left over: * int'
		]);
		// The sentence is in the language, and backtracking finds its tree.
		expect(recognizes(g, ['int', '*', 'int'])).toBe(true);
		expect(backtrack(g, ['int', '*', 'int']).outcome).toBe('accept');
	});

	it('never enters T again once T1 has succeeded', () => {
		expect(r.steps.map((s) => messageText(s).join(' / '))).toEqual([
			'Initialize next to point to first token / Invoke E ()',
			'Call E () / save = next',
			'Call E₁ () / for production E → T',
			'Call T () / save = next',
			'Call T₁ () / for production T → int',
			'match (INT): *next is INT / Returns true; next advances',
			'T₁ () returns true',
			'T () returns true / T₂ () and T₃ () are not called',
			'E₁ () returns true',
			'E () returns true / E₂ () is not called',
			'E () returned true, but next does not point to end-of-stream: reject / Left over: * int'
		]);
		expect(r.calls.filter((c) => fname(p, c.fn) === 'T')).toHaveLength(1);
		expect(r.tried).toBe(2);
		expect(r.restores).toBe(0);
	});

	it('is the same in the order of Example 2', () => {
		const other = run(TOP_DOWN_2, 'int * int');
		expect(other.returned).toBe(true);
		expect(other.leftover).toEqual(['*', 'int']);
		expect(other.outcome).toBe('reject');
		// E1 = T + E fails at +, then E2 = T succeeds on int alone.
		expect(other.restores).toBe(3);
	});

	it('accepts int * int when int * T is tried before int', () => {
		const first = run('E → T + E | T\nT → ( E ) | int * T | int', 'int * int');
		expect(first.outcome).toBe('accept');
		expect(first.leftover).toEqual([]);
	});

	it('lists a long tail of leftover tokens with an ellipsis', () => {
		const r = run('S → a', 'a a a a a a a a a a a');
		expect(r.leftover).toHaveLength(10);
		expect(messageText(r.steps[r.steps.length - 1])[1]).toBe('Left over: a a a a a a a a …');
		expect(listTokens(['(', 'the cat', ')'])).toBe('( "the cat" )');
		expect(listTokens([])).toBe('');
	});

	it('rejects when the start function returns false', () => {
		const none = run(TOP_DOWN, ') int');
		expect(none.returned).toBe(false);
		expect(none.outcome).toBe('reject');
		expect(none.leftover).toEqual([]);
		expect(messageText(none.steps[none.steps.length - 1])).toEqual(['E () returned false: reject']);
		expect(messageText(none.steps[none.steps.length - 2])).toEqual([
			'E () returns false',
			'No production succeeded'
		]);
	});
});

describe('end-of-stream', () => {
	it('compares with end-of-stream and still advances', () => {
		const r = run(TOP_DOWN, '(');
		// T3: match (OPEN), then E () with next at end-of-stream.
		const eos = r.steps.find((s) => s.event === 'match' && s.compare!.found === null)!;
		expect(eos.compare).toEqual({ constant: 'INT', at: 1, found: null });
		expect(eos.next).toBe(2);
		expect(messageText(eos)[0]).toBe('match (INT): *next is end-of-stream, not INT');
		// One past end-of-stream is as far as next gets, and nothing is read there.
		expect(Math.max(...r.steps.map((s) => s.next))).toBe(2);
		const back = r.steps[r.steps.indexOf(eos) + 2];
		expect(messageText(back)).toEqual(['next = save', 'next points to end-of-stream again']);
		expect(back.next).toBe(1);
		expect(r.outcome).toBe('reject');
		expect(r.returned).toBe(false);
	});

	it('accepts the empty input of S → a S | ε without a match', () => {
		const r = run('S → a S | ε', '');
		expect(r.outcome).toBe('accept');
		expect(r.steps.map((s) => messageText(s)[0])).toEqual([
			'Initialize next to point to first token',
			'Call S ()',
			'Call S₁ ()',
			'match (A): *next is end-of-stream, not A',
			'S₁ () returns false',
			'next = save',
			'Call S₂ ()',
			'S₂ () returns true',
			'S () returns true',
			'S () returned true and next points to end-of-stream: accept'
		]);
	});
});

describe('left recursion and the step budget', () => {
	it('calls S again and again without moving next, until the cap', () => {
		const g = grammar('S → S 0 | 1');
		const p = generateProgram(g);
		const r = runLimited(p, ['1', '0'], { depthCap: 4 });
		expect(r.outcome).toBe('stopped');
		expect(r.returned).toBeNull();
		expect(r.stop).toEqual({ reason: 'depth', limit: 4 });
		const last = r.steps[r.steps.length - 1];
		expect(last.event).toBe('stop');
		expect(messageText(last)).toEqual(['Stopped: 4 calls nested and next has not moved']);
		expect(callsAt(p, r, r.steps.length - 1)).toBe('S > S1 > S > S1 > S > S1 > S > S1');
		expect(r.steps.every((s) => s.next === 0)).toBe(true);
		expect(r.calls.every((c) => c.end === null)).toBe(true);
		// The step points at the call that would come next.
		expect(lineText(p, last.line!)).toBe('bool S1 () { return S () && match (ZERO); }');
	});

	it('returns true on 1 0 when S → 1 comes first, with 0 left over', () => {
		const r = run('S → 1 | S 0', '1 0', { depthCap: 8 });
		expect(r.returned).toBe(true);
		expect(r.leftover).toEqual(['0']);
		expect(r.outcome).toBe('reject');
	});

	it('does not count calls with a token matched between them', () => {
		const g = grammar('S → ( S ) | x');
		const s = input(g, '( ( ( ( x ) ) ) )');
		expect(runLimited(generateProgram(g), s, { depthCap: 1 }).outcome).toBe('accept');
	});

	it('stops at the step budget', () => {
		const g = grammar('S → S 0 | 1');
		const r = runLimited(generateProgram(g), ['1'], { maxSteps: 50 });
		expect(r.steps).toHaveLength(50);
		expect(r.stop).toEqual({ reason: 'steps', limit: 50 });
		expect(messageText(r.steps[49])).toEqual(['Stopped after 50 steps']);
		expect(runLimited(generateProgram(g), ['1']).steps).toHaveLength(DEFAULT_MAX_STEPS);
		expect(runLimited(generateProgram(g), ['1'], { maxSteps: 0 }).steps).toHaveLength(3);
	});

	it('takes a recursion of a hundred thousand calls without running out of stack', () => {
		const g = grammar('S → S 0 | 1');
		const r = runLimited(generateProgram(g), ['1'], { maxSteps: 100000 });
		expect(r.steps).toHaveLength(100000);
		expect(r.steps[99999].top!.depth).toBe(99998);
		// The steps share the stack: each one adds a frame or two.
		expect(r.steps[99999].top!.below!.below).toBe(r.steps[99997].top!.below);
	});

	it('keeps a run that fits the budget exactly', () => {
		const g = grammar(TOP_DOWN);
		const s = input(g, '( int )');
		const full = runLimited(generateProgram(g), s);
		expect(runLimited(generateProgram(g), s, { maxSteps: full.steps.length }).outcome).toBe(
			'accept'
		);
		const short = runLimited(generateProgram(g), s, { maxSteps: full.steps.length - 1 });
		expect(short.outcome).toBe('stopped');
		expect(short.steps).toHaveLength(full.steps.length - 1);
	});
});

describe('agreement with the grammar engine', () => {
	it('accepts only sentences, and backtracking accepts everything it accepts', () => {
		const next = random(5);
		let checked = 0;
		let missed = 0;
		for (let n = 0; n < 400 && checked < 40; n++) {
			const g = randomGrammar(next);
			if (leftRecursion(g).length > 0) continue;
			checked++;
			const p = generateProgram(g);
			const sentences = new Set(bruteForce(g, 4).map((s) => s.join(' ')));
			const strings: string[][] = [[]];
			for (let len = 1; len <= 4; len++)
				for (const s of strings.filter((x) => x.length === len - 1))
					for (const t of g.terminals.slice(0, 2)) strings.push([...s, t]);
			for (const s of strings) {
				const r = runLimited(p, s);
				if (r.outcome === 'stopped') continue;
				if (r.outcome === 'accept') expect(sentences.has(s.join(' '))).toBe(true);
				else if (sentences.has(s.join(' '))) missed++;
				// What the start function returns is "some prefix is a sentence it found".
				if (r.returned) expect(r.next).toBeLessThanOrEqual(s.length);
			}
		}
		expect(checked).toBeGreaterThan(10);
		// The limitation is real: some sentences are rejected.
		expect(missed).toBeGreaterThan(0);
	});

	it('does not change the program or the tokens', () => {
		const g = grammar(TOP_DOWN);
		const p = generateProgram(g);
		const before = programText(p);
		const sites = JSON.stringify(p.sites);
		runLimited(p, Object.freeze(['(', 'int', ')']));
		expect(programText(p)).toBe(before);
		expect(JSON.stringify(p.sites)).toBe(sites);
	});
});
