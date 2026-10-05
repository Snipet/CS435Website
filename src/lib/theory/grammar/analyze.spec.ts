import { describe, expect, it } from 'vitest';
import {
	chomskyType,
	cycles,
	firstOfSequence,
	firstSets,
	followSets,
	isEmptyLanguage,
	isFiniteLanguage,
	leftRecursion,
	nullable,
	reservedSymbols,
	sentenceLengths,
	unproductive,
	unreachable
} from './analyze';
import { applyStep } from './derive';
import { parseTrees, recognizes } from './earley';
import { ebnfToGrammar, makeGrammar, parseGrammar } from './parse';
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

describe('reservedSymbols', () => {
	it('is empty for the lecture grammars', () => {
		for (const text of [ARITHMETIC, AMBIGUOUS, CASCADE, COOL, DANGLING_ELSE, ENGLISH, TOP_DOWN])
			expect(reservedSymbols(grammar(text))).toEqual([]);
		expect(reservedSymbols(predictive())).toEqual([]);
	});

	it('lists a terminal named $: in FOLLOW sets it looks like the end marker', () => {
		// The augmented grammar of many textbooks.
		const g = grammar('S’ → S $\nS → a S | ε');
		expect(reservedSymbols(g)).toEqual(['$']);
		// FOLLOW(S’) holds the end marker and FOLLOW(S) the terminal: the same string.
		expect(show(followSets(g))).toEqual(['S’: $', 'S: $']);
		expect(END_MARKER).toBe('$');
	});

	it('lists a terminal named ε: in FIRST sets it looks like the empty string', () => {
		const g = grammar('T → S b\nS → "ε" a');
		expect(g.terminals).toEqual(['b', 'ε', 'a']);
		expect(reservedSymbols(g)).toEqual(['ε']);
		// S is not nullable, but its FIRST set reads as if it were.
		expect([...nullable(g)]).toEqual([]);
		expect(firstSets(g).get('S')!.has(EPSILON)).toBe(true);
	});

	it('lists non-terminals with those names too, before the terminals', () => {
		const g = makeGrammar([
			{ lhs: 'S', rhs: ['ε', '$', 'x'] },
			{ lhs: '$', rhs: ['a'] }
		]);
		expect(g.nonterminals).toEqual(['S', '$']);
		expect(reservedSymbols(g)).toEqual(['$', 'ε']);
		expect(reservedSymbols(makeGrammar([{ lhs: 'S', rhs: ['epsilon', '$$', 'ϵ'] }]))).toEqual([]);
	});

	it('is what parseGrammar warns about', () => {
		for (const text of ['S’ → S $\nS → a S | ε', 'T → S b\nS → "ε" a', CASCADE]) {
			const { grammar: g, diagnostics } = parseGrammar(text);
			const warned = diagnostics.filter((d) => d.message.includes('is spelled like')).length;
			expect(warned).toBe(reservedSymbols(g!).length);
		}
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

	it('erases a nullable prefix through a chain of 12000 unit productions', () => {
		const n = 12000;
		// S → N0 S a | b ; N0 → N1 ; … ; N12000 → ε
		const g = makeGrammar([
			{ lhs: 'S', rhs: ['N0', 'S', 'a'] },
			{ lhs: 'S', rhs: ['b'] },
			...Array.from({ length: n }, (_, i) => ({ lhs: `N${i}`, rhs: [`N${i + 1}`] })),
			{ lhs: `N${n}`, rhs: [] }
		]);
		const found = leftRecursion(g);
		expect(found.map((r) => [r.nonterminal, r.immediate])).toEqual([['S', false]]);
		const { chain } = found[0];
		// S → N0 S a, then N0 → N1 … N11999 → N12000, then N12000 → ε.
		expect(chain).toHaveLength(n + 2);
		expect(chain.slice(0, 3)).toEqual([0, 2, 3]);
		expect(chain[chain.length - 1]).toBe(n + 2);
		expect(replay(g, 'S', chain)).toEqual(['S', 'a']);
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

describe('cycles', () => {
	it('finds the non-terminals that derive themselves', () => {
		expect(cycles(grammar('A → A | a'))).toEqual([['A']]);
		expect(cycles(grammar('A → B | a\nB → A'))).toEqual([['A', 'B']]);
		expect(cycles(grammar('S → A\nA → B | a\nB → A | a'))).toEqual([['A', 'B']]);
		expect(cycles(grammar('S → x A\nA → B\nB → C | b\nC → A'))).toEqual([['A', 'B', 'C']]);
	});

	it('sees through nullable symbols around the non-terminal', () => {
		// S → S S is S → S once the other S is erased.
		expect(cycles(grammar('S → S S | a | ε'))).toEqual([['S']]);
		expect(cycles(grammar('S → N S | a\nN → ε'))).toEqual([['S']]);
		expect(cycles(grammar('S → A A\nA → S | ε | a'))).toEqual([['S', 'A']]);
		expect(cycles(grammar('S → N S N M | a\nN → ε | n\nM → N N'))).toEqual([['S']]);
		// Something is left besides the non-terminal: no cycle.
		expect(cycles(grammar('S → A S b | c\nA → ε | a'))).toEqual([]);
		expect(cycles(grammar('S → N S | a\nN → n'))).toEqual([]);
	});

	it('lists separate groups in grammar order, members too', () => {
		expect(cycles(grammar('S → C A B\nA → A | a\nB → C | b\nC → B'))).toEqual([['A'], ['B', 'C']]);
		expect(cycles(grammar('S → B | A\nB → B | b\nA → A | a'))).toEqual([['B'], ['A']]);
	});

	it('finds none in the lecture grammars: recursion is not a cycle', () => {
		for (const text of [
			ARITHMETIC,
			AMBIGUOUS,
			CASCADE,
			LEFT_RECURSIVE,
			COOL,
			DANGLING_ELSE,
			MATCHED_IF,
			ENGLISH,
			TOP_DOWN,
			'S → ε | ( S )',
			'S → 1 | S 0'
		])
			expect(cycles(grammar(text))).toEqual([]);
		expect(cycles(predictive())).toEqual([]);
	});

	it('agrees with a search for A →+ A on random grammars', () => {
		const next = random(11);
		let cyclic = 0;
		for (let round = 0; round < 1000; round++) {
			const g = randomGrammar(next);
			const isNonterminal = new Set(g.nonterminals);
			const empty = nullable(g);
			// Forms of non-terminals only, reached from A by rewriting: is the form "A" among them?
			// At most one symbol of such a form stays, so the others are nullable; erasing them
			// one at a time keeps a form well under eight symbols.
			const derivesItself = (start: string): boolean => {
				const seen = new Set<string>();
				const todo = [[start]];
				while (todo.length > 0) {
					const form = todo.pop()!;
					for (let i = 0; i < form.length; i++) {
						for (const p of g.productions) {
							if (p.lhs !== form[i] || !p.rhs.every((x) => isNonterminal.has(x))) continue;
							const to = applyStep(form, i, p);
							if (to.length === 1 && to[0] === start) return true;
							if (to.length > 7 || to.filter((x) => !empty.has(x)).length > 1) continue;
							const key = to.join(' ');
							if (seen.has(key)) continue;
							seen.add(key);
							todo.push(to);
						}
					}
				}
				return false;
			};
			const expected = g.nonterminals.filter(derivesItself);
			expect(
				cycles(g).flat().sort(),
				g.productions.map((p) => `${p.lhs}→${p.rhs}`).join(' ')
			).toEqual([...expected].sort());
			if (expected.length > 0) cyclic++;
		}
		expect(cyclic).toBeGreaterThan(150);
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

describe('the analyses on a grammar of 20000 rules', () => {
	const n = 20000;
	const names = Array.from({ length: n + 1 }, (_, i) => `A${i}`);
	// A0 → a A1 | b ; … ; A20000 → c
	const growing = makeGrammar([
		...names.slice(0, n).flatMap((lhs, i) => [
			{ lhs, rhs: ['a', names[i + 1]] },
			{ lhs, rhs: ['b'] }
		]),
		{ lhs: names[n], rhs: ['c'] }
	]);
	// A0 → A1 ; … ; A20000 → a: everything depends on the last rule.
	const units = makeGrammar([
		...names.slice(0, n).map((lhs, i) => ({ lhs, rhs: [names[i + 1]] })),
		{ lhs: names[n], rhs: ['a'] }
	]);
	// A0 → A1 B ; … ; A20000 → ε ; B → ε
	const empties = makeGrammar([
		...names.slice(0, n).map((lhs, i) => ({ lhs, rhs: [names[i + 1], 'B'] })),
		{ lhs: names[n], rhs: [] },
		{ lhs: 'B', rhs: [] }
	]);

	it('finds the sentence lengths', () => {
		expect(sentenceLengths(growing)).toEqual({ min: 1, max: n + 1 });
		expect(sentenceLengths(units)).toEqual({ min: 1, max: 1 });
		expect(sentenceLengths(empties)).toEqual({ min: 0, max: 0 });
		expect(isFiniteLanguage(growing)).toBe(true);
	});

	it('finds reachability, productivity, nullability and left recursion', () => {
		for (const g of [growing, units, empties]) {
			expect(unreachable(g)).toEqual([]);
			expect(unproductive(g)).toEqual([]);
			expect(isEmptyLanguage(g)).toBe(false);
			expect(leftRecursion(g)).toEqual([]);
			expect(chomskyType(g).regular).toHaveLength(g.productions.length);
		}
		expect(nullable(growing).size).toBe(0);
		expect(nullable(empties).size).toBe(n + 2);
		expect(unreachable(makeGrammar([...units.productions, { lhs: 'Z', rhs: ['z'] }]))).toEqual([
			'Z'
		]);
	});

	it('finds a cycle of 300 non-terminals from each of them', () => {
		const size = 300;
		// A0 → A1 x ; … ; A299 → A0 x
		const loop = makeGrammar(
			names.slice(0, size).map((lhs, i) => ({ lhs, rhs: [names[(i + 1) % size], 'x'] }))
		);
		const found = leftRecursion(loop);
		expect(found.map((r) => r.nonterminal)).toEqual(names.slice(0, size));
		expect(found.every((r) => !r.immediate && r.chain.length === size)).toBe(true);
		expect(found[7].chain.slice(0, 3)).toEqual([7, 8, 9]);
		expect(found[7].chain[size - 1]).toBe(6);
	});

	it('finds FIRST and FOLLOW', () => {
		expect([...firstSets(growing).get('A0')!]).toEqual(['a', 'b']);
		expect([...firstSets(growing).get(names[n])!]).toEqual(['c']);
		expect([...firstSets(units).get('A0')!]).toEqual(['a']);
		expect([...firstSets(empties).get('A0')!]).toEqual([EPSILON]);
		for (const g of [growing, units, empties])
			expect([...followSets(g).get(names[n])!]).toEqual([END_MARKER]);
		expect([...followSets(empties).get('B')!]).toEqual([END_MARKER]);
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

	it('puts in FOLLOW(A) the tokens that come after an A in a parse tree, and hardly any other', () => {
		const next = random(21);
		let useful = 0;
		let exact = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const follow = followSets(g);
			const seen = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
			for (const tokens of bruteForce(g, 6).slice(0, 150)) {
				for (const tree of parseTrees(g, tokens, { limit: 30 }).trees) {
					const stack: ParseNode[] = [tree];
					while (stack.length > 0) {
						const node = stack.pop()!;
						if (node.terminal) continue;
						seen.get(node.symbol)!.add(tokens[node.end!] ?? END_MARKER);
						stack.push(...node.children);
					}
				}
			}
			for (const name of g.nonterminals)
				expect(subset(seen.get(name)!, follow.get(name)!), JSON.stringify(g.productions)).toBe(
					true
				);
			// With every non-terminal in use, short sentences already show nearly all of FOLLOW;
			// what is missing needs a sentence longer than six tokens.
			if (unreachable(g).length > 0 || unproductive(g).length > 0) continue;
			useful++;
			if (g.nonterminals.every((name) => seen.get(name)!.size === follow.get(name)!.size)) exact++;
		}
		expect(useful).toBeGreaterThan(400);
		expect(exact / useful).toBeGreaterThan(0.9);
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
