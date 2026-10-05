import { describe, expect, it } from 'vitest';
import { answer, serveTask, READY } from '$lib/components/ui/worker-protocol';
import { bracketForm, parseGrammar, type Grammar } from '$lib/theory/grammar';
import { replay } from './builder';
import { ARITHMETIC, CASCADE, COOL, ENGLISH } from './presets';
import {
	COUNT_LIMIT,
	LIST_LIMIT,
	MAX_CHAIN_STEPS,
	MAX_CHECK_TOKENS,
	MAX_TREE_TOKENS,
	TREE_LIMIT,
	byLength,
	computeCheck,
	computeLanguage,
	computeViews,
	failureText,
	membership,
	testRows,
	type CheckRequest,
	type CheckView,
	type LanguageView
} from './views';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

const check = (grammar: string, input: string, tests: string[] = []): CheckView =>
	computeCheck({ kind: 'check', grammar, input, tests });
const language = (grammar: string, maxLength: number): LanguageView =>
	computeLanguage({ kind: 'language', grammar, maxLength });
const texts = (view: LanguageView) => view.sentences.map((s) => s.join(' '));

describe('membership', () => {
	it('gives a member its parse tree and leftmost derivation', () => {
		const m = membership(grammar(ARITHMETIC), '( int + int ) * int');
		expect(m.verdict).toBe('member');
		expect(m.tokens).toEqual(['(', 'int', '+', 'int', ')', '*', 'int']);
		expect(m.trees).toBe(1);
		expect(m.moreTrees).toBe(false);
		expect(bracketForm(m.tree!)).toBe('E( E( ( E( E(int) + E(int) ) ) ) * E(int) )');
		expect(m.derivation!.forms.map((f) => f.join(' '))).toEqual([
			'E',
			'E * E',
			'( E ) * E',
			'( E + E ) * E',
			'( int + E ) * E',
			'( int + int ) * E',
			'( int + int ) * int'
		]);
		expect(m.derivation!.steps[2]).toEqual({ index: 1, length: 3 });
		expect(m.derivation!.nonterminals).toEqual(['E']);
		// The saved steps replay to the same derivation in the builder.
		const built = replay(grammar(ARITHMETIC), m.derivation!.pairs);
		expect(built.dropped).toBe(0);
		expect(built.derivation.steps.at(-1)!.form).toEqual(m.tokens);
	});

	it('rejects ( int ) ) (slide 13)', () => {
		const m = membership(grammar(ARITHMETIC), '( int ) )');
		expect(m).toMatchObject({ verdict: 'not-member', trees: 0, tree: null, derivation: null });
		expect(m.tokens).toEqual(['(', 'int', ')', ')']);
	});

	it('counts the parse trees of an ambiguous string', () => {
		const two = membership(grammar(ARITHMETIC), 'int + int * int');
		expect(two).toMatchObject({ verdict: 'member', trees: 2, moreTrees: false });
		// The first tree of parseTrees is drawn.
		expect(bracketForm(two.tree!)).toBe('E( E(int) + E( E(int) * E(int) ) )');

		const many = membership(grammar(ARITHMETIC), Array(12).fill('int').join(' + '));
		expect(many).toMatchObject({ verdict: 'member', trees: TREE_LIMIT, moreTrees: true });

		expect(membership(grammar(CASCADE), 'int + int * int')).toMatchObject({ trees: 1 });
	});

	it('reads the empty string as ε', () => {
		expect(membership(grammar('S → ε | ( S )'), '')).toMatchObject({
			verdict: 'member',
			tokens: [],
			trees: 1
		});
		expect(membership(grammar('S → ε | ( S )'), 'ε').verdict).toBe('member');
		expect(membership(grammar(ARITHMETIC), '').verdict).toBe('not-member');
		const eps = membership(grammar('S → ε | ( S )'), '');
		expect(eps.derivation!.forms).toEqual([['S'], []]);
	});

	it('does not decide a string with symbols that are not terminals', () => {
		expect(membership(grammar(ARITHMETIC), 'int + x')).toMatchObject({
			verdict: 'invalid',
			tree: null
		});
		expect(membership(grammar(ARITHMETIC), 'E + int').verdict).toBe('invalid');
		expect(membership(grammar(ENGLISH), 'the cat sat').verdict).toBe('invalid');
		expect(membership(grammar(ENGLISH), '"the cat" sat').verdict).toBe('member');
	});

	it('writes derivation symbols as a grammar does', () => {
		const m = membership(grammar(ENGLISH), '"the cat" sat');
		expect(m.tokens).toEqual(['the cat', 'sat']);
		expect(m.derivation!.forms.at(-1)).toEqual(['"the cat"', 'sat']);
	});

	it('does not write out a derivation of very many steps', () => {
		// Four unit productions above every a: 5 steps per token, and one for each S → S a.
		const g = grammar('S → S A | A\nA → B\nB → C\nC → D\nD → a');
		const short = membership(g, Array(20).fill('a').join(' '));
		expect(short.derivation!.pairs).toHaveLength(20 * 5);
		expect(short.derivation!.forms).toHaveLength(20 * 5 + 1);
		const long = membership(g, Array(40).fill('a').join(' '));
		expect(long.tree).not.toBeNull();
		expect(long.derivation!.pairs.length).toBeGreaterThan(MAX_CHAIN_STEPS);
		expect(long.derivation).toMatchObject({
			forms: [],
			steps: [],
			nonterminals: ['S', 'A', 'B', 'C', 'D']
		});
		// The saved steps still describe the whole derivation.
		expect(replay(g, long.derivation!.pairs).derivation.steps.at(-1)!.form).toEqual(long.tokens);
	});

	it('decides long strings without drawing them, and leaves very long ones', () => {
		const g = grammar('S → a S | a');
		const long = membership(
			g,
			Array(MAX_TREE_TOKENS + 1)
				.fill('a')
				.join(' ')
		);
		expect(long).toMatchObject({ verdict: 'member', trees: 0, tree: null, derivation: null });
		const drawn = membership(g, Array(MAX_TREE_TOKENS).fill('a').join(' '));
		expect(drawn.tree).not.toBeNull();
		expect(drawn.derivation!.pairs).toHaveLength(MAX_TREE_TOKENS);

		const longest = membership(g, Array(MAX_CHECK_TOKENS).fill('a').join(' '));
		expect(longest.verdict).toBe('member');
		const tooLong = membership(
			g,
			Array(MAX_CHECK_TOKENS + 1)
				.fill('a')
				.join(' ')
		);
		expect(tooLong.verdict).toBe('too-long');
		expect(tooLong.tokens).toHaveLength(MAX_CHECK_TOKENS + 1);
	});
});

describe('computeCheck', () => {
	it('answers the token string and every test string', () => {
		const view = check(ARITHMETIC, 'int * int', ['int', '( int ) )', 'int +', 'int x', '']);
		expect(view.input.verdict).toBe('member');
		expect(view.tests).toEqual(['member', 'not-member', 'not-member', 'invalid', 'not-member']);
	});

	it('finds all five COOL strings in the language (slide 30)', () => {
		const strings = [
			'id',
			'if id then id else id fi',
			'while id loop id pool',
			'if while id loop id pool then id else id fi',
			'if if id then id else id fi then id else id fi'
		];
		expect(check(COOL, strings[3], strings).tests).toEqual(Array(5).fill('member'));
	});

	it('answers nothing for grammar text with errors', () => {
		const view = check('E → ', 'int', ['int', '']);
		expect(view.input).toMatchObject({ verdict: 'invalid', tokens: [], tree: null });
		expect(view.tests).toEqual(['invalid', 'invalid']);
	});

	it('returns plain data that survives a structured clone', () => {
		const view = check(CASCADE, 'int * int + int', ['int']);
		expect(structuredClone(view)).toEqual(view);
		expect(JSON.parse(JSON.stringify(view))).toEqual(view);
	});
});

describe('computeLanguage', () => {
	it('lists L(G) = { "0", "1" } and counts it (slide 26)', () => {
		const view = language('S → 0 | 1', 5);
		expect(view.sentences).toEqual([['0'], ['1']]);
		expect(view).toMatchObject({ more: false, cut: false, total: 2 });
	});

	it('counts a finite language even when the list stops short of its sentences', () => {
		const text = 'S → 1 A\nA → 0 | 1';
		expect(language(text, 5)).toMatchObject({
			sentences: [
				['1', '1'],
				['1', '0']
			],
			total: 2
		});
		// Both sentences have two tokens: none are listed up to length 1.
		expect(language(text, 1)).toEqual({ sentences: [], more: true, cut: false, total: 2 });
	});

	it('lists an infinite language by length, in the order of T', () => {
		const ones = language('S → 1 A\nA → 0 | 1 A', 4);
		expect(texts(ones)).toEqual(['1 0', '1 1 0', '1 1 1 0']);
		expect(ones).toMatchObject({ more: true, cut: false, total: null });

		const balanced = language('S → ε | ( S )', 4);
		expect(balanced.sentences).toEqual([[], ['(', ')'], ['(', '(', ')', ')']]);
		expect(balanced.total).toBeNull();

		expect(texts(language(ARITHMETIC, 3))).toEqual(['int', 'int + int', 'int * int', '( int )']);
		expect(texts(language(ARITHMETIC, 0))).toEqual([]);
	});

	it('cuts a long list', () => {
		const view = language(ARITHMETIC, 10);
		expect(view.sentences).toHaveLength(LIST_LIMIT);
		expect(view).toMatchObject({ more: true, cut: true, total: null });
	});

	it('reports the empty language', () => {
		expect(language('S → S a', 5)).toEqual({ sentences: [], more: false, cut: false, total: 0 });
	});

	it('does not count a finite language that is too large', () => {
		// 2¹² sentences of 12 tokens.
		const text = 'S → B B B B B B B B B B B B\nB → 0 | 1';
		const view = language(text, 3);
		expect(view).toMatchObject({ sentences: [], more: true, total: null });
		expect(2 ** 12).toBeGreaterThan(COUNT_LIMIT);
	});

	it('answers nothing for grammar text with errors', () => {
		expect(language('S →', 4)).toEqual({ sentences: [], more: false, cut: false, total: null });
	});
});

describe('the worker computation', () => {
	it('answers both kinds of request', () => {
		expect(computeViews({ kind: 'check', grammar: 'S → a', input: 'a', tests: [] })).toEqual(
			check('S → a', 'a')
		);
		expect(computeViews({ kind: 'language', grammar: 'S → a', maxLength: 2 })).toEqual(
			language('S → a', 2)
		);
	});

	it('serves requests through the worker protocol', () => {
		const posted: unknown[] = [];
		const scope = {
			onmessage: null as ((event: MessageEvent) => void) | null,
			postMessage: (message: unknown) => void posted.push(structuredClone(message))
		};
		serveTask(computeViews, scope);
		expect(posted).toEqual([READY]);
		const input: CheckRequest = { kind: 'check', grammar: ARITHMETIC, input: 'int', tests: ['+'] };
		scope.onmessage!({ data: { id: 7, input } } as MessageEvent);
		expect(posted[1]).toEqual(answer(7, () => computeCheck(input)));
		expect(posted[1]).toMatchObject({ id: 7, ok: true, output: { tests: ['not-member'] } });
	});

	it('words a computation that did not finish', () => {
		expect(failureText('idle', null)).toBeNull();
		expect(failureText('working', null)).toBeNull();
		expect(failureText('timed-out', null)).toBe('This takes too long to compute for this grammar.');
		expect(failureText('error', 'boom')).toBe('This could not be computed (boom).');
		expect(failureText('error', null)).toBe('This could not be computed.');
	});
});

describe('what the page shows of a result', () => {
	const input: CheckRequest = {
		kind: 'check',
		grammar: 'S → a',
		input: '',
		tests: ['a', 'a a', 'b']
	};
	const done = { input, output: computeCheck(input) };

	it('shows each verdict with the string it was computed for', () => {
		expect(testRows(['a', 'a a', 'b'], 'S → a', done)).toEqual([
			{ verdict: 'member', stale: false },
			{ verdict: 'not-member', stale: false },
			{ verdict: 'invalid', stale: false }
		]);
	});

	it('shows no verdict next to a string that changed, or before the first result', () => {
		expect(testRows(['a', 'a', 'b', 'a'], 'S → a', done)).toEqual([
			{ verdict: 'member', stale: false },
			{ verdict: null, stale: false },
			{ verdict: 'invalid', stale: false },
			{ verdict: null, stale: false }
		]);
		expect(testRows(['a'], 'S → a', null)).toEqual([{ verdict: null, stale: false }]);
	});

	it('marks verdicts for an earlier grammar as stale', () => {
		expect(testRows(['a', 'a a'], 'S → a a', done)).toEqual([
			{ verdict: 'member', stale: true },
			{ verdict: 'not-member', stale: true }
		]);
	});

	it('groups sentences by length', () => {
		const { sentences } = language(ARITHMETIC, 3);
		expect(byLength(sentences).map((g) => [g.length, g.items.length])).toEqual([
			[1, 1],
			[3, 3]
		]);
		expect(byLength(language('S → ε | ( S )', 2).sentences)).toEqual([
			{ length: 0, items: [[]] },
			{ length: 2, items: [['(', ')']] }
		]);
		expect(byLength([])).toEqual([]);
	});
});
