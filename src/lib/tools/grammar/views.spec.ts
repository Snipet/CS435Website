import { describe, expect, it } from 'vitest';
import { answer, serveTask, READY } from '$lib/components/ui/worker-protocol';
import {
	bracketForm,
	cycles,
	enumerateLanguage,
	parseGrammar,
	parseTrees,
	type Grammar
} from '$lib/theory/grammar';
import { random, randomGrammar } from '$lib/theory/grammar/test-helpers';
import { replay } from './builder';
import { ARITHMETIC, CASCADE, COOL, ENGLISH } from './presets';
import { spellingOf } from './spelling';
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
	cycleIn,
	failureText,
	membership,
	parsesThrough,
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

	it('writes them as the grammar text does when it is given its spelling (slide 25)', () => {
		const m = membership(grammar(ENGLISH), '"the cat" sat', spellingOf(ENGLISH));
		// Tokens and tree hold the names; the chain is text.
		expect(m.tokens).toEqual(['the cat', 'sat']);
		expect(m.tree!.children[1].children[0].children[0].symbol).toBe('sat');
		expect(m.derivation!.forms.at(-1)).toEqual(['"the cat"', '"sat"']);
		expect(m.derivation!.nonterminals).toContain('VerbPhrase');
		// The worker reads the spelling off the grammar text of the request.
		const view = check(ENGLISH, '"the cat" "on" "the mat" "sat"');
		expect(view.input.derivation!.forms.at(-1)).toEqual([
			'"the cat"',
			'"on"',
			'"the mat"',
			'"sat"'
		]);
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

/**
 * What the definition of a parse tree says about `tokens`, without a parser: a
 * tree for X over a stretch of the tokens is a production of X with a tree
 * for each non-terminal of its right-hand side over consecutive parts of the
 * stretch. Trees are built level by level up to `height` non-terminals on a
 * path. `count`: how many there are (up to a cap; they can be very many).
 * `heights[h]`: one of them has exactly h non-terminals on its longest path.
 */
function treesByHeight(
	g: Grammar,
	tokens: readonly string[],
	height: number
): { count: number; heights: boolean[] } {
	const CAP = 1e12;
	const isNonterminal = new Set(g.nonterminals);
	const n = tokens.length;
	const key = (x: string, i: number, j: number) => `${i} ${j} ${x}`;
	/** Of at most h − 1 levels: how many trees each root and stretch has, and which have one of exactly h − 1. */
	let lower = new Map<string, number>();
	let lowerExact = new Set<string>();
	/**
	 * rhs[k…] over tokens[i…j) with trees of at most h − 1 levels: how many
	 * ways, and whether one of them uses a tree of exactly h − 1 levels.
	 */
	const ways = (
		rhs: readonly string[],
		k: number,
		i: number,
		j: number
	): { all: number; tall: boolean } => {
		if (k === rhs.length) return { all: i === j ? 1 : 0, tall: false };
		const y = rhs[k];
		if (!isNonterminal.has(y))
			return i < j && tokens[i] === y ? ways(rhs, k + 1, i + 1, j) : { all: 0, tall: false };
		let all = 0;
		let tall = false;
		for (let m = i; m <= j; m++) {
			const trees = lower.get(key(y, i, m)) ?? 0;
			if (trees === 0) continue;
			const rest = ways(rhs, k + 1, m, j);
			all = Math.min(CAP, all + trees * rest.all);
			if (rest.tall || (rest.all > 0 && lowerExact.has(key(y, i, m)))) tall = true;
		}
		return { all, tall };
	};
	const heights = [false];
	for (let h = 1; h <= height; h++) {
		const level = new Map<string, number>();
		const exact = new Set<string>();
		for (const p of g.productions)
			for (let i = 0; i <= n; i++)
				for (let j = i; j <= n; j++) {
					const at = key(p.lhs, i, j);
					const { all, tall } = ways(p.rhs, 0, i, j);
					level.set(at, Math.min(CAP, (level.get(at) ?? 0) + all));
					// On the first level every tree is one production without non-terminals.
					if (h === 1 ? all > 0 : tall) exact.add(at);
				}
		lower = level;
		lowerExact = exact;
		heights.push(exact.has(key(g.start, 0, n)));
	}
	return { count: lower.get(key(g.start, 0, n)) ?? 0, heights };
}

describe('a string with infinitely many parse trees', () => {
	it('names a non-terminal that derives itself and stands in a parse tree', () => {
		// S → S → … → S → a, with as many steps S → S as one likes.
		expect(membership(grammar('S → S | a'), 'a')).toMatchObject({
			verdict: 'member',
			trees: 1,
			moreTrees: false,
			cycle: 'S'
		});
		// S → S S → S → …: the other S derives ε.
		expect(membership(grammar('S → S S | ε'), '')).toMatchObject({ trees: 1, cycle: 'S' });
		// A cycle through two non-terminals.
		expect(membership(grammar('S → A\nA → S | ε'), '')).toMatchObject({ trees: 1, cycle: 'S' });
		// Next to a non-terminal that derives ε: A → N A with N →* ε.
		expect(membership(grammar('S → A\nA → N A | a\nN → ε'), 'a').cycle).toBe('A');
	});

	it('finds the non-terminal in a tree that is not the one drawn', () => {
		const m = membership(grammar('S → a | A\nA → A | a'), 'a');
		expect(bracketForm(m.tree!)).toBe('S(a)');
		expect(m).toMatchObject({ trees: 2, moreTrees: false, cycle: 'A' });
	});

	it('finds it beyond the trees that are counted', () => {
		// The first TREE_LIMIT trees all start with S → E; C → C is in later ones only.
		const g = grammar('S → E | C\nE → E + E | int\nC → C | E');
		const tokens = Array(7).fill('int');
		const listed = parseTrees(g, tokens.join(' + ').split(' '), { limit: TREE_LIMIT });
		expect(listed.trees.every((t) => t.children[0].symbol === 'E')).toBe(true);
		expect(membership(g, tokens.join(' + '))).toMatchObject({
			trees: TREE_LIMIT,
			moreTrees: true,
			cycle: 'C'
		});
	});

	it('is null when no parse tree of the string goes through a cycle', () => {
		// A → A is in the grammar, but a is derived without A.
		const g = grammar('S → a | b A\nA → A | c');
		expect(cycles(g)).toEqual([['A']]);
		expect(membership(g, 'a')).toMatchObject({ trees: 1, cycle: null });
		expect(membership(g, 'b c')).toMatchObject({ trees: 1, cycle: 'A' });
		expect(membership(g, 'b')).toMatchObject({ verdict: 'not-member', cycle: null });
		// Left recursion and ambiguity are not cycles.
		expect(membership(grammar(CASCADE), 'int + int * int').cycle).toBeNull();
		expect(membership(grammar(ARITHMETIC), 'int + int * int')).toMatchObject({
			trees: 2,
			cycle: null
		});
	});

	it('names the first group in grammar order that a tree goes through', () => {
		const g = grammar('S → A | B | C | D\nA → A | a\nB → B | b\nC → C | b\nD → D | d');
		expect(cycles(g)).toEqual([['A'], ['B'], ['C'], ['D']]);
		expect(cycleIn(g, ['a'])).toBe('A');
		expect(cycleIn(g, ['b'])).toBe('B');
		expect(cycleIn(g, ['d'])).toBe('D');
		expect(cycleIn(g, ['a', 'a'])).toBeNull();
		// The first member of a group of several.
		const pair = grammar('S → x T\nT → U | y\nU → T');
		expect(cycles(pair)).toEqual([['T', 'U']]);
		expect(cycleIn(pair, ['x', 'y'])).toBe('T');
	});

	it('finds the one group among many that the string goes through', () => {
		// A0 … A39, each with its own terminal and its own cycle.
		const count = 40;
		const names = Array.from({ length: count }, (_, i) => `A${i}`);
		const many = grammar(
			[`S → ${names.join(' | ')}`, ...names.map((a, i) => `${a} → ${a} | t${i}`)].join('\n')
		);
		expect(cycles(many)).toHaveLength(count);
		for (let i = 0; i < count; i++) expect(cycleIn(many, [`t${i}`])).toBe(`A${i}`);
		expect(cycleIn(many, ['t0', 't1'])).toBeNull();
	});

	it('decides whether a tree goes through given non-terminals', () => {
		const g = grammar('S → a | b A\nA → c');
		expect(parsesThrough(g, ['a'], new Set(['A']))).toBe(false);
		expect(parsesThrough(g, ['b', 'c'], new Set(['A']))).toBe(true);
		expect(parsesThrough(g, ['a'], new Set(['S']))).toBe(true);
		expect(parsesThrough(g, ['a'], new Set())).toBe(false);
		// Not a sentence: no tree at all.
		expect(parsesThrough(g, ['c'], new Set(['S', 'A']))).toBe(false);
		// Every tree of the cascade goes through all three non-terminals.
		const cascade = grammar(CASCADE);
		for (const x of cascade.nonterminals)
			expect(parsesThrough(cascade, ['int'], new Set([x]))).toBe(true);
	});

	it('is not misled by symbols named like its own', () => {
		// S′ and S′′ are symbols of the grammar already.
		const g = grammar('S → "S′" | S | "S′′" a\n"S′" → b');
		expect(g.nonterminals).toEqual(['S', 'S′']);
		expect(cycleIn(g, ['b'])).toBe('S');
		expect(cycleIn(g, ['S′′', 'a'])).toBe('S');
		expect(parsesThrough(g, ['S′′', 'a'], new Set(['S′']))).toBe(false);
		expect(parsesThrough(g, ['b'], new Set(['S′']))).toBe(true);
	});

	it('agrees with the definition of a parse tree on random grammars', () => {
		// The definition, on the three trees of S → S | a for a with up to three levels.
		const loop = treesByHeight(grammar('S → S | a'), ['a'], 3);
		expect(loop).toEqual({ count: 3, heights: [false, true, true, true] });
		expect(treesByHeight(grammar(ARITHMETIC), ['int', '+', 'int', '*', 'int'], 9)).toEqual({
			count: 2,
			heights: [false, false, false, true, false, false, false, false, false, false]
		});

		let infinite = 0;
		let finite = 0;
		for (let seed = 1; seed <= 400; seed++) {
			const g = randomGrammar(random(seed));
			const { strings } = enumerateLanguage(g, { maxLength: 3, limit: 5 });
			for (const tokens of strings) {
				const n = tokens.length;
				// A path without a repeated node has at most this many non-terminals: one per
				// non-terminal and stretch of the tokens.
				const distinct = (g.nonterminals.length * (n + 1) * (n + 2)) / 2;
				// A taller tree repeats a node, and then there are infinitely many. Going round a
				// cycle once more adds less than two rounds of the non-terminals to a path, so
				// if any tree is taller, one is within that range.
				const top = distinct + 2 * g.nonterminals.length;
				const expected = treesByHeight(g, tokens, top)
					.heights.slice(distinct + 1)
					.some((tall) => tall);
				const rules = g.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`);
				const label = `seed ${seed}: ${rules.join('; ')} on "${tokens.join(' ')}"`;
				expect(cycleIn(g, tokens) !== null, label).toBe(expected);
				if (expected) infinite++;
				else {
					finite++;
					// No tree repeats a node: the trees that are listed are all there are.
					const listed = parseTrees(g, tokens, { limit: 500 });
					if (!listed.truncated)
						expect(listed.trees.length, label).toBe(treesByHeight(g, tokens, distinct).count);
				}
			}
		}
		expect(infinite).toBeGreaterThan(50);
		expect(finite).toBeGreaterThan(50);
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
