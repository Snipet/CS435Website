import { describe, expect, it } from 'vitest';
import {
	chomskyType,
	firstOfSequence,
	firstSets,
	followSets,
	isEmptyLanguage,
	isFiniteLanguage,
	leftRecursion,
	nullable,
	sentenceLengths,
	unproductive,
	unreachable
} from './analyze';
import { applyStep } from './derive';
import { parseTrees, recognizes } from './earley';
import { ebnfToGrammar } from './parse';
import {
	AMBIGUOUS,
	ARITHMETIC,
	CASCADE,
	COOL,
	DANGLING_ELSE,
	EBNF_REPETITION,
	ENGLISH,
	LEFT_RECURSIVE,
	MATCHED_IF,
	TOP_DOWN,
	TOP_DOWN_2,
	bruteForce,
	ebnf,
	grammar,
	random,
	randomGrammar
} from './test-helpers';
import { END_MARKER, EPSILON, type Grammar, type ParseNode } from './types';

/** Sets as "A: x y z" lines, in the order the engine returns them. */
const show = (sets: Map<string, Set<string>>): string[] =>
	[...sets].map(([name, set]) => `${name}: ${[...set].join(' ')}`);

/** E → T E’ ; E’ → + T E’ | ε ; T → F T’ ; T’ → * F T’ | ε ; F → ( E ) | int */
const predictive = () => ebnfToGrammar(ebnf(EBNF_REPETITION));

describe('nullable', () => {
	it('finds the non-terminals that derive ε, in grammar order', () => {
		expect([...nullable(grammar('S → A B\nA → a | ε\nB → A A | b'))]).toEqual(['S', 'A', 'B']);
		expect([...nullable(grammar('A → B\nB → C\nC → ε'))]).toEqual(['A', 'B', 'C']);
		expect([...nullable(predictive())]).toEqual(['E’', 'T’']);
		expect([...nullable(grammar('S → ε | ( S )'))]).toEqual(['S']);
	});

	it('is empty without ε-productions and stops on recursion', () => {
		expect(nullable(grammar(CASCADE)).size).toBe(0);
		expect([...nullable(grammar('S → S S | A\nA → A | a'))]).toEqual([]);
		expect([...nullable(grammar('S → A a | B\nA → ε\nB → B'))]).toEqual(['A']);
	});
});

describe('firstSets', () => {
	it('computes FIRST for the predictive expression grammar', () => {
		expect(show(firstSets(predictive()))).toEqual([
			'E: ( int',
			'E’: + ε',
			'T: ( int',
			'T’: * ε',
			'F: ( int'
		]);
	});

	it('handles left recursion', () => {
		expect(show(firstSets(grammar(CASCADE)))).toEqual(['E: int (', 'T: int (', 'F: int (']);
		expect(show(firstSets(grammar('S → 1 | S 0')))).toEqual(['S: 1']);
	});

	it('looks past nullable symbols and lists ε last', () => {
		expect(show(firstSets(grammar('S → A B c\nA → a | ε\nB → b | ε')))).toEqual([
			'S: c a b',
			'A: a ε',
			'B: b ε'
		]);
		expect(show(firstSets(grammar('S → A B\nA → a | ε\nB → b | ε')))).toEqual([
			'S: a b ε',
			'A: a ε',
			'B: b ε'
		]);
		expect(show(firstSets(grammar('S → ε | ( S )')))).toEqual(['S: ( ε']);
	});

	it('has one entry per non-terminal, empty when it derives nothing', () => {
		expect(show(firstSets(grammar('S → a | A\nA → A b')))).toEqual(['S: a', 'A: ']);
	});
});

describe('followSets', () => {
	it('computes FOLLOW for the predictive expression grammar, with $ in FOLLOW(S)', () => {
		expect(show(followSets(predictive()))).toEqual([
			'E: ) $',
			'E’: ) $',
			'T: + ) $',
			'T’: + ) $',
			'F: + * ) $'
		]);
	});

	it('computes FOLLOW for the left-recursive expression grammar', () => {
		expect(show(followSets(grammar(CASCADE)))).toEqual(['E: + ) $', 'T: + * ) $', 'F: + * ) $']);
	});

	it('looks past nullable symbols and passes FOLLOW of the left-hand side on', () => {
		expect(show(followSets(grammar('S → A B c\nA → a | ε\nB → b | ε')))).toEqual([
			'S: $',
			'A: c b',
			'B: c'
		]);
		expect(show(followSets(grammar('S → A B\nA → a | ε\nB → b | ε')))).toEqual([
			'S: $',
			'A: b $',
			'B: $'
		]);
		expect(show(followSets(grammar('S → ε | ( S )')))).toEqual(['S: ) $']);
	});

	it('leaves FOLLOW of an unreachable non-terminal empty', () => {
		expect(show(followSets(grammar('S → a\nA → b')))).toEqual(['S: $', 'A: ']);
	});
});

describe('firstOfSequence', () => {
	const g = predictive();

	it('computes FIRST of a string of symbols', () => {
		expect([...firstOfSequence(g, ['T', 'E’'])]).toEqual(['(', 'int']);
		expect([...firstOfSequence(g, ['E’', ')'])]).toEqual(['+', ')']);
		expect([...firstOfSequence(g, ['T’', 'E’'])]).toEqual(['+', '*', 'ε']);
		expect([...firstOfSequence(g, ['int', 'E'])]).toEqual(['int']);
		expect([...firstOfSequence(g, [])]).toEqual(['ε']);
	});

	it('takes a symbol that is not a non-terminal, such as $, as itself', () => {
		expect([...firstOfSequence(g, ['T’', 'E’', '$'])]).toEqual(['+', '*', '$']);
		expect([...firstOfSequence(g, ['E’', 'x'])]).toEqual(['+', 'x']);
	});

	it('reuses FIRST sets passed in', () => {
		const first = new Map([['E’', new Set(['q', 'ε'])]]);
		expect([...firstOfSequence(g, ['E’', ')'], first)]).toEqual([')', 'q']);
	});
});

describe('unreachable and unproductive', () => {
	it('lists non-terminals the start symbol cannot reach', () => {
		expect(unreachable(grammar('S → a T\nT → b\nA → B\nB → c | A'))).toEqual(['A', 'B']);
		expect(unreachable(grammar('S → A\nA → B\nB → C\nC → c'))).toEqual([]);
		expect(unreachable(grammar(MATCHED_IF))).toEqual([]);
	});

	it('lists non-terminals that derive no terminal string', () => {
		expect(unproductive(grammar('S → a | A\nA → A b\nB → B'))).toEqual(['A', 'B']);
		expect(unproductive(grammar('S → S a | B\nB → S'))).toEqual(['S', 'B']);
		expect(unproductive(grammar('S → A B\nA → ε\nB → A A'))).toEqual([]);
		expect(unproductive(grammar(ENGLISH))).toEqual([]);
	});
});

describe('leftRecursion', () => {
	/** Applies the chain to V, always at the first symbol. */
	const replay = (g: Grammar, v: string, chain: number[]): string[] =>
		chain.reduce((form, id) => applyStep(form, 0, g.productions[id]), [v]);

	it('finds E and T, immediate, in E → E + T | T ; T → T * F | F ; F → int | ( E )', () => {
		expect(leftRecursion(grammar(CASCADE))).toEqual([
			{ nonterminal: 'E', immediate: true, chain: [0] },
			{ nonterminal: 'T', immediate: true, chain: [2] }
		]);
		expect(leftRecursion(grammar(LEFT_RECURSIVE)).map((r) => r.nonterminal)).toEqual(['E', 'T']);
	});

	it('finds the immediate left recursion of S → 1 | S 0 (Top-Down Parsing, slide 25)', () => {
		expect(leftRecursion(grammar('S → 1 | S 0'))).toEqual([
			{ nonterminal: 'S', immediate: true, chain: [1] }
		]);
	});

	it('finds the indirect left recursion of S → A α | δ ; A → S β (slide 27)', () => {
		const g = grammar('S → A α | δ\nA → S β');
		expect(leftRecursion(g)).toEqual([
			{ nonterminal: 'S', immediate: false, chain: [0, 2] },
			{ nonterminal: 'A', immediate: false, chain: [2, 0] }
		]);
		// S → A α → S β α
		expect(replay(g, 'S', [0, 2])).toEqual(['S', 'β', 'α']);
		expect(replay(g, 'A', [2, 0])).toEqual(['A', 'α', 'β']);
	});

	it('reports nothing for grammars without left recursion', () => {
		for (const text of [
			TOP_DOWN,
			TOP_DOWN_2,
			COOL,
			DANGLING_ELSE,
			MATCHED_IF,
			ENGLISH,
			'S → ε | ( S )'
		])
			expect(leftRecursion(grammar(text))).toEqual([]);
		expect(leftRecursion(predictive())).toEqual([]);
	});

	it('finds the ambiguous expression grammars left-recursive', () => {
		expect(leftRecursion(grammar(AMBIGUOUS))).toEqual([
			{ nonterminal: 'E', immediate: true, chain: [0] }
		]);
		expect(leftRecursion(grammar(ARITHMETIC))).toEqual([
			{ nonterminal: 'E', immediate: true, chain: [1] }
		]);
	});

	it('follows longer cycles and reports each non-terminal on them', () => {
		const g = grammar('A → B a\nB → C b\nC → A c | d');
		expect(leftRecursion(g)).toEqual([
			{ nonterminal: 'A', immediate: false, chain: [0, 1, 2] },
			{ nonterminal: 'B', immediate: false, chain: [1, 2, 0] },
			{ nonterminal: 'C', immediate: false, chain: [2, 0, 1] }
		]);
		expect(replay(g, 'A', [0, 1, 2])).toEqual(['A', 'c', 'b', 'a']);
	});

	it('prefers the immediate production and leaves out non-terminals that only reach a cycle', () => {
		expect(leftRecursion(grammar('A → B x | A y | z\nB → A w'))).toEqual([
			{ nonterminal: 'A', immediate: true, chain: [1] },
			{ nonterminal: 'B', immediate: false, chain: [3, 0] }
		]);
		expect(leftRecursion(grammar('S → A\nA → A a | b'))).toEqual([
			{ nonterminal: 'A', immediate: true, chain: [1] }
		]);
		expect(leftRecursion(grammar('A → A | a'))).toEqual([
			{ nonterminal: 'A', immediate: true, chain: [0] }
		]);
	});

	it('sees through nullable prefixes and lists the productions that erase them', () => {
		const hidden = grammar('S → A S b | c\nA → ε | a');
		expect(leftRecursion(hidden)).toEqual([{ nonterminal: 'S', immediate: false, chain: [0, 2] }]);
		// S → A S b → S b
		expect(replay(hidden, 'S', [0, 2])).toEqual(['S', 'b']);

		const deeper = grammar('S → A B S | c\nA → B B\nB → ε');
		expect(leftRecursion(deeper)).toEqual([
			{ nonterminal: 'S', immediate: false, chain: [0, 2, 3, 3, 3] }
		]);
		expect(replay(deeper, 'S', [0, 2, 3, 3, 3])).toEqual(['S']);

		// A prefix that is not nullable hides nothing.
		expect(leftRecursion(grammar('S → A S b | c\nA → a'))).toEqual([]);
	});

	it('gives chains that replay to a form starting with the non-terminal', () => {
		const texts = [
			CASCADE,
			AMBIGUOUS,
			'S → A α | δ\nA → S β',
			'S → A B S | c\nA → B B | S a\nB → ε | B b',
			'A → B a | C\nB → C b | ε\nC → B A c | d'
		];
		let checked = 0;
		for (const text of texts) {
			const g = grammar(text);
			for (const { nonterminal, immediate, chain } of leftRecursion(g)) {
				expect(chain.length).toBeGreaterThan(0);
				expect(g.productions[chain[0]].lhs).toBe(nonterminal);
				expect(replay(g, nonterminal, chain)[0]).toBe(nonterminal);
				if (immediate) expect(chain).toHaveLength(1);
				checked++;
			}
		}
		expect(checked).toBe(11);
	});
});

describe('chomskyType', () => {
	it('finds S → 1 A ; A → 0 | 1 A regular: type 3 (Introduction to Parsing, slides 23 and 27)', () => {
		expect(chomskyType(grammar('S → 1 A\nA → 0 | 1 A'))).toEqual({
			type: 3,
			regular: [true, true, true]
		});
	});

	it('finds S → ε | ( S ) context free: type 2', () => {
		expect(chomskyType(grammar('S → ε | ( S )'))).toEqual({ type: 2, regular: [true, false] });
	});

	it('accepts V → w and V → w U with w a string of terminals, ε included', () => {
		expect(chomskyType(grammar('S → 0 | 1')).type).toBe(3);
		expect(chomskyType(grammar('S → 1 A\nA → 0 | 1')).type).toBe(3);
		expect(chomskyType(grammar('S → a b A | B | a b c\nA → ε\nB → b'))).toEqual({
			type: 3,
			regular: [true, true, true, true, true]
		});
	});

	it('flags productions with a non-terminal anywhere but at the end', () => {
		expect(chomskyType(grammar('S → 1 | S 0'))).toEqual({ type: 2, regular: [true, false] });
		expect(chomskyType(grammar('S → a A b | A B | a\nA → a\nB → b')).regular).toEqual([
			false,
			false,
			true,
			true,
			true
		]);
		expect(chomskyType(grammar(AMBIGUOUS))).toEqual({
			type: 2,
			regular: [false, false, false, true]
		});
		expect(chomskyType(grammar(COOL)).type).toBe(2);
	});
});

describe('sentenceLengths, isEmptyLanguage, isFiniteLanguage', () => {
	const lengths = (text: string) => sentenceLengths(grammar(text));

	it('gives the shortest and longest sentence of a finite language', () => {
		expect(lengths('S → 0 | 1')).toEqual({ min: 1, max: 1 });
		expect(lengths('S → 1 A\nA → 0 | 1')).toEqual({ min: 2, max: 2 });
		expect(lengths('S → a b | c')).toEqual({ min: 1, max: 2 });
		expect(lengths('S → A A B\nA → a a | a\nB → b | ε')).toEqual({ min: 2, max: 5 });
		expect(lengths('S → ε')).toEqual({ min: 0, max: 0 });
	});

	it('gives Infinity for an infinite language', () => {
		expect(lengths('S → 1 A\nA → 0 | 1 A')).toEqual({ min: 2, max: Infinity });
		expect(lengths('S → ε | ( S )')).toEqual({ min: 0, max: Infinity });
		expect(lengths(AMBIGUOUS)).toEqual({ min: 1, max: Infinity });
		expect(lengths(ENGLISH)).toEqual({ min: 2, max: Infinity });
		expect(lengths('S → A\nA → B\nB → S b | c')).toEqual({ min: 1, max: Infinity });
	});

	it('gives null for the empty language', () => {
		expect(lengths('S → S a')).toBeNull();
		expect(lengths('S → A\nA → S | A a')).toBeNull();
		expect(isEmptyLanguage(grammar('S → S a'))).toBe(true);
		expect(isEmptyLanguage(grammar('S → S a | ε'))).toBe(false);
		expect(isFiniteLanguage(grammar('S → S a'))).toBe(true);
	});

	it('does not count cycles that add no tokens', () => {
		expect(lengths('S → A | a b\nA → S')).toEqual({ min: 2, max: 2 });
		expect(lengths('S → S | A\nA → ε')).toEqual({ min: 0, max: 0 });
		expect(lengths('S → A S | a\nA → ε')).toEqual({ min: 1, max: 1 });
		expect(lengths('S → A S A | a\nA → ε | A')).toEqual({ min: 1, max: 1 });
		expect(lengths('S → A S | a\nA → ε | b')).toEqual({ min: 1, max: Infinity });
	});

	it('ignores non-terminals that take no part in a sentence', () => {
		// B is infinite but unreachable; C derives nothing, so S → S C never finishes.
		expect(lengths('S → a\nB → b B | b')).toEqual({ min: 1, max: 1 });
		expect(lengths('S → a | S C\nC → C c')).toEqual({ min: 1, max: 1 });
		expect(lengths('S → a | b C\nC → C c | S C')).toEqual({ min: 1, max: 1 });
	});

	it('says whether the language is finite', () => {
		expect(isFiniteLanguage(grammar('S → 0 | 1'))).toBe(true);
		expect(isFiniteLanguage(grammar('S → 1 A\nA → 0 | 1'))).toBe(true);
		expect(isFiniteLanguage(grammar('S → 1 A\nA → 0 | 1 A'))).toBe(false);
		expect(isFiniteLanguage(grammar(COOL))).toBe(false);
	});
});

describe('the analyses against the definitions, on random grammars', () => {
	const ROUNDS = 1000;
	const subset = (a: Iterable<string>, b: ReadonlySet<string>): boolean =>
		[...a].every((x) => b.has(x));

	it('gives FIRST and FOLLOW sets that satisfy their defining rules', () => {
		const next = random(5);
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const isNonterminal = new Set(g.nonterminals);
			const empty = nullable(g);
			const first = firstSets(g);
			const follow = followSets(g);
			expect([...first.keys()]).toEqual(g.nonterminals);
			expect([...follow.keys()]).toEqual(g.nonterminals);
			expect(follow.get(g.start)!.has(END_MARKER)).toBe(true);
			for (const name of g.nonterminals) {
				expect(first.get(name)!.has(EPSILON)).toBe(empty.has(name));
				expect(follow.get(name)!.has(EPSILON)).toBe(false);
				expect(first.get(name)!.has(END_MARKER)).toBe(false);
			}
			for (const p of g.productions) {
				expect(subset(firstOfSequence(g, p.rhs, first), first.get(p.lhs)!)).toBe(true);
				p.rhs.forEach((x, i) => {
					if (!isNonterminal.has(x)) return;
					const rest = firstOfSequence(g, p.rhs.slice(i + 1), first);
					const target = follow.get(x)!;
					expect(
						subset(
							[...rest].filter((t) => t !== EPSILON),
							target
						)
					).toBe(true);
					if (rest.has(EPSILON)) expect(subset(follow.get(p.lhs)!, target)).toBe(true);
				});
			}
		}
	});

	/** Stands for the symbols cut off the end of a long form. */
	const REST = '⋯';

	/**
	 * Rewrites the first symbol of a form, breadth first, and reports each form
	 * reached (long forms end in REST). Stops when `visit` returns true; returns
	 * false when cut off.
	 */
	const searchFronts = (g: Grammar, from: string, visit: (form: string[]) => boolean): boolean => {
		const isNonterminal = new Set(g.nonterminals);
		const seen = new Set<string>();
		const queue: string[][] = [];
		const expand = (form: string[]): void => {
			for (const p of g.productions) {
				if (p.lhs !== form[0]) continue;
				const whole = [...p.rhs, ...form.slice(1)].filter((x) => x !== REST);
				const cut = whole.length > 16 || form.includes(REST);
				const next = cut ? [...whole.slice(0, 16), REST] : whole;
				const key = next.join(' ');
				if (seen.has(key)) continue;
				seen.add(key);
				queue.push(next);
			}
		};
		expand([from]);
		for (let at = 0; at < queue.length; at++) {
			if (at > 3000) return false;
			const form = queue[at];
			if (visit(form)) return true;
			if (form.length > 0 && isNonterminal.has(form[0])) expand(form);
		}
		return true;
	};

	it('finds in FIRST(A) exactly the terminals a search finds at the front of a form', () => {
		const next = random(6);
		let checked = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const isNonterminal = new Set(g.nonterminals);
			const first = firstSets(g);
			for (const name of g.nonterminals) {
				const expected = new Set<string>();
				const finished = searchFronts(g, name, (form) => {
					if (form.length === 0) expected.add(EPSILON);
					else if (form[0] !== REST && !isNonterminal.has(form[0])) expected.add(form[0]);
					return false;
				});
				if (!finished) continue;
				expect(new Set(first.get(name)), `${name} in ${JSON.stringify(g.productions)}`).toEqual(
					expected
				);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(1500);
	});

	it('puts in FIRST(S) every token that begins a sentence', () => {
		const next = random(6);
		let sentences = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const begins = bruteForce(g, 5).map((s) => s[0] ?? EPSILON);
			expect(subset(begins, firstSets(g).get(g.start)!)).toBe(true);
			expect(nullable(g).has(g.start)).toBe(recognizes(g, []));
			sentences += begins.length;
		}
		expect(sentences).toBeGreaterThan(2500);
	});

	it('puts in FOLLOW(A) every token that comes after an A in a parse tree', () => {
		const next = random(12);
		let seen = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const follow = followSets(g);
			const missing: string[] = [];
			for (const tokens of bruteForce(g, 4).slice(0, 10)) {
				for (const tree of parseTrees(g, tokens, { limit: 5 }).trees) {
					const stack: ParseNode[] = [tree];
					while (stack.length > 0) {
						const node = stack.pop()!;
						if (node.terminal) continue;
						const after = tokens[node.end!] ?? END_MARKER;
						if (!follow.get(node.symbol)!.has(after)) missing.push(`${after} after ${node.symbol}`);
						stack.push(...node.children);
						seen++;
					}
				}
			}
			expect(missing, JSON.stringify(g.productions)).toEqual([]);
		}
		expect(seen).toBeGreaterThan(5000);
	});

	/** V →+ V α by search: null when the search is cut off. */
	const leftRecursiveBySearch = (g: Grammar, v: string): boolean | null => {
		let found = false;
		const finished = searchFronts(g, v, (form) => (found = form[0] === v));
		return finished ? found : null;
	};

	it('reports exactly the non-terminals that a search finds left-recursive', () => {
		const next = random(8);
		let recursive = 0;
		let hidden = 0;
		let plain = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const found = new Map(leftRecursion(g).map((r) => [r.nonterminal, r]));
			for (const v of g.nonterminals) {
				const expected = leftRecursiveBySearch(g, v);
				if (expected === null) continue;
				expect(found.has(v), `${v} in ${JSON.stringify(g.productions)}`).toBe(expected);
				const report = found.get(v);
				if (!report) {
					plain++;
					continue;
				}
				recursive++;
				const form = report.chain.reduce((f, id) => applyStep(f, 0, g.productions[id]), [v]);
				expect(form[0]).toBe(v);
				expect(report.immediate).toBe(g.productions.some((p) => p.lhs === v && p.rhs[0] === v));
				if (report.immediate) expect(report.chain).toHaveLength(1);
				else if (report.chain.some((id) => g.productions[id].rhs.length === 0)) hidden++;
			}
		}
		expect(recursive).toBeGreaterThan(300);
		expect(hidden).toBeGreaterThan(10);
		expect(plain).toBeGreaterThan(300);
	});

	it('classifies productions by the form V → w | wU', () => {
		const next = random(9);
		let regular = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const report = chomskyType(g);
			const isNonterminal = new Set(g.nonterminals);
			const expected = g.productions.map((p) => {
				const inner = p.rhs.slice(0, -1);
				return inner.every((x) => !isNonterminal.has(x));
			});
			expect(report.regular).toEqual(expected);
			expect(report.type).toBe(expected.includes(false) ? 2 : 3);
			if (report.type === 3) regular++;
		}
		expect(regular).toBeGreaterThan(50);
	});
});
