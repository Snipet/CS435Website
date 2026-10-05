import { describe, expect, it } from 'vitest';
import {
	bracketForm,
	leftRecursion,
	parseTrees,
	printGrammar,
	recognizes,
	treeEquals,
	yieldOf
} from '$lib/theory/grammar';
import {
	TOP_DOWN,
	TOP_DOWN_2,
	LEFT_RECURSIVE,
	grammar,
	input,
	random,
	randomGrammar,
	bruteForce
} from '$lib/theory/grammar/test-helpers';
import { nodeAtPath } from '$lib/components/grammar';
import {
	DEFAULT_DEPTH_CAP,
	DEFAULT_MAX_STEPS,
	attemptPieces,
	backtrack,
	depthCapFor,
	describeStep,
	instanceLabel,
	matchedPaths,
	type BacktrackResult,
	type BacktrackStep,
	type RdNode
} from './backtrack';
import { plainText } from './notation';

const run = (g: string, s: string, opts?: Parameters<typeof backtrack>[2]): BacktrackResult => {
	const parsed = grammar(g);
	return backtrack(parsed, input(parsed, s), opts);
};

/** The tree in the form of bracketForm, with instance numbers: E₀( T₁(int) ). */
function numbered(tree: RdNode): string {
	const label = instanceLabel(tree) ?? tree.symbol;
	const isLeaf = (n: RdNode) => n.terminal || n.production === undefined;
	if (isLeaf(tree)) return label;
	if (tree.children.length === 0) return `${label}(ε)`;
	const inner = tree.children.map(numbered).join(' ');
	return tree.children.every(isLeaf) ? `${label}(${inner})` : `${label}( ${inner} )`;
}

/** The current node of a step, as its label. */
const current = (step: BacktrackStep): string | null =>
	step.path ? nodeAtPath(step.tree, step.path)!.symbol : null;

const tries = (r: BacktrackResult, instances = true): string[] =>
	r.steps.filter((s) => s.event === 'try').map((s) => plainText(attemptPieces(s, instances)));

describe('Example 1: ( int ) (Top-Down Parsing, slides 5–16)', () => {
	const g = grammar(TOP_DOWN);
	const r = backtrack(g, input(g, '( int )'));
	const production = (text: string): number =>
		g.productions.find((p) => `${p.lhs} → ${p.rhs.join(' ')}` === text)!.id;

	it('reproduces the twelve slides', () => {
		// slide | alternative in red | tree | current node | pointer | message
		const slides: [string, string | null, string, string | null, number, string[]][] = [
			['try', 'E → T', 'E', 'E', 0, ['Try E₀ → T₁']],
			['try', 'T → int', 'E(T)', 'T', 0, ['Try T₁ → int']],
			['mismatch', null, 'E( T(int) )', 'int', 0, ['Mismatch: int is not (', 'Backtrack …']],
			['try', 'T → int * T', 'E(T)', 'T', 0, ['Try T₁ → int * T₂']],
			['mismatch', null, 'E( T(int * T) )', 'int', 0, ['Mismatch: int is not (', 'Backtrack …']],
			['try', 'T → ( E )', 'E(T)', 'T', 0, ['Try T₁ → ( E₂ )']],
			['match', null, 'E( T(( E )) )', '(', 0, ['Match! Advance input.']],
			['try', 'E → T', 'E( T(( E )) )', 'E', 1, ['Try E₂ → T₃']],
			['try', 'T → int', 'E( T( ( E(T) ) ) )', 'T', 1, ['Try T₃ → int']],
			['match', null, 'E( T( ( E( T(int) ) ) ) )', 'int', 1, ['Match! Advance input.']],
			['match', null, 'E( T( ( E( T(int) ) ) ) )', ')', 2, ['Match! Advance input.']],
			['accept', null, 'E( T( ( E( T(int) ) ) ) )', null, 3, ['End of input, accept']]
		];
		expect(r.steps).toHaveLength(12);
		r.steps.forEach((step, i) => {
			const [event, red, tree, node, pos, message] = slides[i];
			expect([i, step.event]).toEqual([i, event]);
			expect([i, step.production]).toEqual([i, red === null ? null : production(red)]);
			expect([i, bracketForm(step.tree)]).toEqual([i, tree]);
			expect([i, current(step)]).toEqual([i, node]);
			expect([i, step.pos]).toEqual([i, pos]);
			expect([i, step.message]).toEqual([i, message]);
		});
	});

	it('says which alternative a compared terminal belongs to', () => {
		// Slide 9 keeps int * T red while its int is compared.
		const within = r.steps.map((s) =>
			s.within === null
				? null
				: `${g.productions[s.within].lhs} → ${g.productions[s.within].rhs.join(' ')}`
		);
		expect(within).toEqual([
			null,
			null,
			'T → int',
			null,
			'T → int * T',
			null,
			'T → ( E )',
			null,
			null,
			'T → int',
			'T → ( E )',
			null
		]);
		for (const s of r.steps)
			expect(s.within !== null).toBe(s.event === 'match' || s.event === 'mismatch');
	});

	it('writes the messages without instance numbers when asked', () => {
		const lines = r.steps.map((s) => describeStep(s, { instances: false }).map(plainText));
		expect(lines[0]).toEqual(['Try E → T']);
		expect(lines[3]).toEqual(['Try T → int * T']);
		expect(lines[2]).toEqual(['Mismatch: int is not (', 'Backtrack …']);
	});

	it('the current node of the third slide is the int that was just added', () => {
		expect(r.steps[2].path).toEqual([0, 0]);
		expect(r.steps[4].path).toEqual([0, 0]);
		// Slide 15: the closing parenthesis.
		expect(r.steps[10].path).toEqual([0, 2]);
	});

	it('accepts with the tree of slide 16', () => {
		expect(r.outcome).toBe('accept');
		expect(r.stop).toBeNull();
		expect(bracketForm(r.tree!)).toBe('E( T( ( E( T(int) ) ) ) )');
		expect(yieldOf(r.tree!)).toEqual(['(', 'int', ')']);
		expect(treeEquals(r.tree!, parseTrees(g, ['(', 'int', ')']).trees[0])).toBe(true);
		// E → T + E is never tried: E → T succeeds for both E.
		expect(r.tries).toBe(6);
		expect(r.backtracks).toBe(2);
		// E, T, ( E ), T, int: four levels below the root.
		expect(r.depth).toBe(4);
	});

	it('marks the matched terminals from the step after their match', () => {
		expect(matchedPaths(r.steps[6].tree)).toEqual([]);
		expect(matchedPaths(r.steps[7].tree)).toEqual([[0, 0]]);
		expect(matchedPaths(r.steps[11].tree)).toEqual([
			[0, 0],
			[0, 1, 0, 0],
			[0, 2]
		]);
	});

	it('counts tries and backtracks step by step', () => {
		expect(r.steps.map((s) => s.tries)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 6, 6]);
		expect(r.steps.map((s) => s.backtracks)).toEqual([0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2]);
	});
});

describe('Example 2: int * int (Top-Down Parsing, slides 17–20)', () => {
	const g = grammar(TOP_DOWN_2);
	const r = backtrack(g, input(g, 'int * int'));

	it('tries the productions of slides 18–20 with their instance numbers', () => {
		expect(tries(r)).toEqual([
			// slide 18
			'E₀ → T₁ + E₂',
			'T₁ → ( E₃ )',
			'T₁ → int',
			// slide 19
			'T₁ → int * T₂',
			'T₂ → ( E₃ )',
			'T₂ → int',
			'T₂ → int * T₃',
			// slide 20: "Follow same steps as before for T1"
			'E₀ → T₁',
			'T₁ → ( E₂ )',
			'T₁ → int',
			'T₁ → int * T₂',
			'T₂ → ( E₃ )',
			'T₂ → int'
		]);
	});

	it('backtracks to the choice for E0 when T2 and T1 are exhausted (slide 19)', () => {
		const at = r.steps.findIndex((s) => s.event === 'exhausted');
		const step = r.steps[at];
		expect(step.message).toEqual([
			'Have exhausted the choices for T₂ and T₁',
			'so backtrack to choice for E₀'
		]);
		expect(describeStep(step, { instances: false }).map(plainText)).toEqual([
			'Have exhausted the choices for T',
			'so backtrack to choice for E'
		]);
		expect(step.exhausted).toEqual([
			{ symbol: 'T', instance: 2 },
			{ symbol: 'T', instance: 1 }
		]);
		expect(step.target).toEqual({ symbol: 'E', instance: 0 });
		expect(step.path).toEqual([]);
		// T1 is bare again; E0 still has the children of E → T + E.
		expect(numbered(step.tree)).toBe('E₀(T₁ + E₂)');
		expect(step.pos).toBe(0);
		expect(r.steps[at - 1].message).toEqual(['Mismatch: * is not end of input', 'Backtrack …']);
		expect(r.steps[at + 1].message).toEqual(['Try E₀ → T₁']);
		expect(r.steps.filter((s) => s.event === 'exhausted')).toHaveLength(1);
	});

	it('goes back into a finished T when a later token does not match', () => {
		// T1 → int matched int; then + of E0 → T1 + E2 meets *.
		const at = r.steps.findIndex((s) => s.message[0] === 'Mismatch: + is not *');
		expect(numbered(r.steps[at].tree)).toBe('E₀( T₁(int) + E₂ )');
		expect(r.steps[at].path).toEqual([1]);
		expect(r.steps[at].pos).toBe(1);
		expect(r.steps[at + 1].message).toEqual(['Try T₁ → int * T₂']);
		expect(r.steps[at + 1].pos).toBe(0);
		expect(matchedPaths(r.steps[at + 1].tree)).toEqual([]);
	});

	it('treats a complete tree with tokens left as a failure', () => {
		const at = r.steps.findIndex((s) => s.event === 'backtrack');
		expect(r.steps[at].message).toEqual(['Tokens remain after the parse: * int', 'Backtrack …']);
		expect(numbered(r.steps[at].tree)).toBe('E₀( T₁(int) )');
		expect(r.steps[at].remaining).toEqual(['*', 'int']);
		expect(r.steps[at].path).toBeNull();
		expect(r.steps[at].fringe).toEqual({
			items: [{ symbol: 'int', terminal: true }],
			matched: 1,
			next: -1
		});
		expect(r.steps[at + 1].message).toEqual(['Try T₁ → int * T₂']);
	});

	it('ends with the tree of slide 20', () => {
		expect(r.outcome).toBe('accept');
		expect(bracketForm(r.tree!)).toBe('E( T( int * T(int) ) )');
		expect(numbered(r.tree!)).toBe('E₀( T₁( int * T₂(int) ) )');
		expect(r.steps[r.steps.length - 1].message).toEqual(['End of input, accept']);
		expect(r.steps).toHaveLength(32);
		expect(r.tries).toBe(13);
		expect(r.backtracks).toBe(8);
	});

	it('lists every message in order', () => {
		expect(r.steps.map((s) => s.message.join(' / '))).toEqual([
			'Try E₀ → T₁ + E₂',
			'Try T₁ → ( E₃ )',
			'Mismatch: ( is not int / Backtrack …',
			'Try T₁ → int',
			'Match! Advance input.',
			'Mismatch: + is not * / Backtrack …',
			'Try T₁ → int * T₂',
			'Match! Advance input.',
			'Match! Advance input.',
			'Try T₂ → ( E₃ )',
			'Mismatch: ( is not int / Backtrack …',
			'Try T₂ → int',
			'Match! Advance input.',
			'Mismatch: + is not end of input / Backtrack …',
			'Try T₂ → int * T₃',
			'Match! Advance input.',
			'Mismatch: * is not end of input / Backtrack …',
			'Have exhausted the choices for T₂ and T₁ / so backtrack to choice for E₀',
			'Try E₀ → T₁',
			'Try T₁ → ( E₂ )',
			'Mismatch: ( is not int / Backtrack …',
			'Try T₁ → int',
			'Match! Advance input.',
			'Tokens remain after the parse: * int / Backtrack …',
			'Try T₁ → int * T₂',
			'Match! Advance input.',
			'Match! Advance input.',
			'Try T₂ → ( E₃ )',
			'Mismatch: ( is not int / Backtrack …',
			'Try T₂ → int',
			'Match! Advance input.',
			'End of input, accept'
		]);
	});
});

describe('the log of tries', () => {
	const g = grammar(TOP_DOWN_2);
	const r = backtrack(g, input(g, 'int * int'));

	it('has a line per try, per exhausted note, and for the end', () => {
		expect(r.log.map((e) => r.steps[e.step].event)).toEqual([
			...Array<string>(7).fill('try'),
			'exhausted',
			...Array<string>(6).fill('try'),
			'accept'
		]);
		r.steps.forEach((step, i) => {
			expect(step.log).toBe(r.log.filter((e) => e.step <= i).length);
		});
	});

	it('says when an alternative was removed and which failure sent the search back to it', () => {
		const line = (e: (typeof r.log)[number]) => {
			const cause = e.cause === null ? '' : ` — ${r.steps[e.cause].message[0]}`;
			return `${r.steps[e.step].message[0]} @${e.step}→${e.undone ?? 'kept'}${cause}`;
		};
		expect(r.log.map(line)).toEqual([
			'Try E₀ → T₁ + E₂ @0→18',
			'Try T₁ → ( E₃ ) @1→3 — Mismatch: ( is not int',
			'Try T₁ → int @3→6 — Mismatch: + is not *',
			'Try T₁ → int * T₂ @6→17',
			'Try T₂ → ( E₃ ) @9→11 — Mismatch: ( is not int',
			'Try T₂ → int @11→14 — Mismatch: + is not end of input',
			'Try T₂ → int * T₃ @14→17 — Mismatch: * is not end of input',
			'Have exhausted the choices for T₂ and T₁ @17→kept',
			'Try E₀ → T₁ @18→kept',
			'Try T₁ → ( E₂ ) @19→21 — Mismatch: ( is not int',
			'Try T₁ → int @21→24 — Tokens remain after the parse: * int',
			'Try T₁ → int * T₂ @24→kept',
			'Try T₂ → ( E₃ ) @27→29 — Mismatch: ( is not int',
			'Try T₂ → int @29→kept',
			'End of input, accept @31→kept'
		]);
	});

	it('keeps exactly the tries whose productions are in the parse tree', () => {
		const kept = r.log
			.filter((e) => r.steps[e.step].event === 'try' && e.undone === null)
			.map((e) => r.steps[e.step].production);
		const inTree: number[] = [];
		const walk = (n: RdNode) => {
			if (n.production !== undefined) inTree.push(n.production);
			n.children.forEach(walk);
		};
		walk(r.tree!);
		expect(kept).toEqual(inTree);
	});
});

describe('the fringe (Top-Down Parsing, slide 22)', () => {
	const g = grammar(TOP_DOWN_2);
	const r = backtrack(g, input(g, 'int * int'));
	const show = (f: { items: { symbol: string; instance?: number }[] }) =>
		f.items
			.map((i) => (i.instance === undefined ? i.symbol : `${i.symbol}${i.instance}`))
			.join(' ');

	it('is t1 … tk A … at a try, and the production replaces A', () => {
		// Try T1 → int * T2 after backtracking: nothing matched yet.
		const first = r.steps[6];
		expect(show(first.fringe)).toBe('T1 + E2');
		expect(first.fringe.matched).toBe(0);
		expect(first.fringe.next).toBe(0);
		expect(show(first.newFringe!)).toBe('int * T2 + E2');
		expect(first.newFringe!.added).toEqual([0, 3]);
		expect(first.newFringe!.next).toBe(2);
		// Try T2 → ( E3 ): int * are matched, T2 is the leftmost non-terminal.
		const second = r.steps[9];
		expect(show(second.fringe)).toBe('int * T2 + E2');
		expect(second.fringe.matched).toBe(2);
		expect(second.fringe.next).toBe(2);
		expect(show(second.newFringe!)).toBe('int * ( E3 ) + E2');
		expect(second.newFringe!.added).toEqual([2, 5]);
		expect(second.newFringe!.next).toBe(3);
	});

	it('is the fringe of the tree of the next step', () => {
		r.steps.forEach((step, i) => {
			if (step.event !== 'try') {
				expect(step.newFringe).toBeUndefined();
				return;
			}
			const { added, ...rest } = step.newFringe!;
			expect(added[0]).toBe(step.fringe.next);
			expect(rest).toEqual(r.steps[i + 1].fringe);
		});
	});

	it('is the sentence when the input is accepted', () => {
		const last = r.steps[r.steps.length - 1];
		expect(show(last.fringe)).toBe('int * int');
		expect(last.fringe.matched).toBe(3);
		expect(last.fringe.next).toBe(-1);
	});

	it('always matches the tree', () => {
		for (const step of r.steps) {
			expect(step.fringe.items.map((i) => i.symbol)).toEqual(yieldOf(step.tree));
			const before = step.event === 'match' ? step.pos : step.fringe.matched;
			expect(step.fringe.matched).toBe(before);
		}
	});
});

describe('rejecting', () => {
	it('ends with "No more choices, reject" and a bare root', () => {
		const r = run(TOP_DOWN, 'int +');
		expect(r.outcome).toBe('reject');
		expect(r.tree).toBeNull();
		const last = r.steps[r.steps.length - 1];
		expect(last.event).toBe('reject');
		expect(last.message).toEqual(['No more choices, reject']);
		expect(bracketForm(last.tree)).toBe('E');
		expect(last.path).toBeNull();
		expect(last.pos).toBe(0);
		expect(last.exhausted![last.exhausted!.length - 1]).toEqual({ symbol: 'E', instance: 0 });
		expect(r.log.every((e) => r.steps[e.step].event !== 'try' || e.undone !== null)).toBe(true);
	});

	it('compares with the end of the input', () => {
		const r = run(TOP_DOWN, '(');
		expect(r.steps.map((s) => s.message[0])).toContain('Mismatch: int is not end of input');
		expect(r.outcome).toBe('reject');
	});

	it('rejects the empty input of a grammar without ε', () => {
		const r = run(TOP_DOWN, '');
		expect(r.outcome).toBe('reject');
		expect(r.steps[2].message).toEqual(['Mismatch: int is not end of input', 'Backtrack …']);
	});

	it('lists a long tail of leftover tokens with an ellipsis', () => {
		const r = run('S → a', 'a a a a a a a a a a a');
		const step = r.steps.find((s) => s.event === 'backtrack')!;
		expect(step.message[0]).toBe('Tokens remain after the parse: a a a a a a a a …');
		expect(step.remaining).toHaveLength(10);
	});

	it('names many exhausted instances briefly', () => {
		const r = backtrack(grammar('S → A\nA → B\nB → C\nC → D\nD → E\nE → a | b'), ['c']);
		const last = r.steps[r.steps.length - 1];
		expect(last.exhausted).toHaveLength(6);
		expect(last.event).toBe('reject');
		// The same wording on an `exhausted` step with many names:
		const many = { ...last, event: 'exhausted' as const, target: { symbol: 'S', instance: 0 } };
		expect(describeStep(many).map(plainText)).toEqual([
			'Have exhausted the choices for E₅, D₄, C₃ and 3 more',
			'so backtrack to choice for S₀'
		]);
	});
});

describe('ε-productions', () => {
	it('draws the ε leaf from the step after the try', () => {
		const r = run('S → a B\nB → b | ε', 'a');
		expect(r.steps.map((s) => `${s.message[0]} | ${bracketForm(s.tree)}`)).toEqual([
			'Try S₀ → a B₁ | S',
			'Match! Advance input. | S(a B)',
			'Try B₁ → b | S(a B)',
			'Mismatch: b is not end of input | S( a B(b) )',
			'Try B₁ → ε | S(a B)',
			'End of input, accept | S( a B(ε) )'
		]);
		expect(r.steps[4].newFringe).toEqual({
			items: [{ symbol: 'a', terminal: true }],
			matched: 1,
			next: -1,
			added: [1, 1]
		});
		expect(r.depth).toBe(2);
	});

	it('accepts the empty input', () => {
		const r = run('S → a S | ε', '');
		expect(r.outcome).toBe('accept');
		expect(bracketForm(r.tree!)).toBe('S(ε)');
		expect(r.steps[r.steps.length - 1].fringe).toEqual({ items: [], matched: 0, next: -1 });
	});

	it('quotes symbols the way the grammar notation does', () => {
		const r = run('S → "the cat" | "|"', '"|"');
		expect(r.steps[0].message).toEqual(['Try S₀ → "the cat"']);
		expect(r.steps[1].message[0]).toBe('Mismatch: "the cat" is not "|"');
	});
});

describe('instance numbers', () => {
	it('gives every instance in a tree its own name', () => {
		for (const [text, s] of [
			[TOP_DOWN, '( int + int ) * int'],
			[TOP_DOWN_2, 'int * ( int + int * int )'],
			['S → A B C\nA → C | a\nB → A b | b\nC → c', 'c b c']
		]) {
			const r = run(text, s);
			for (const step of r.steps) {
				const names: string[] = [];
				const walk = (n: RdNode) => {
					if (!n.terminal) names.push(`${n.symbol}${n.instance}`);
					n.children.forEach(walk);
				};
				walk(step.tree);
				if (step.attempt)
					for (const item of step.attempt.rhs)
						if (!item.terminal) names.push(`${item.symbol}${item.instance}`);
				expect(new Set(names).size).toBe(names.length);
			}
		}
	});

	it('numbers upward along the tree and reuses numbers freed by backtracking', () => {
		const r = run('S → A B C\nA → C | a\nB → A b | b\nC → c', 'a b c');
		expect(tries(r)).toEqual([
			'S₀ → A₁ B₂ C₃',
			// 2 is above A1 and C2 is not in use; C3 is.
			'A₁ → C₂',
			'C₂ → c',
			'A₁ → a',
			// Above B2: A3 (no A is 3), then again after it is freed.
			'B₂ → A₃ b',
			'A₃ → C₄',
			'C₄ → c',
			'A₃ → a',
			'B₂ → b',
			'C₃ → c'
		]);
		expect(numbered(r.tree!)).toBe('S₀( A₁(a) B₂(b) C₃(c) )');
	});

	it('labels non-terminals only', () => {
		const r = run(TOP_DOWN, 'int');
		const tree = r.tree!;
		expect(instanceLabel(tree)).toBe('E₀');
		expect(instanceLabel(tree.children[0])).toBe('T₁');
		expect(instanceLabel(tree.children[0].children[0])).toBeNull();
	});
});

describe('left recursion (Top-Down Parsing, slide 23)', () => {
	it('grows the tree down its left edge without consuming input, then stops', () => {
		const g = grammar('S → S 0 | 1');
		expect(leftRecursion(g).map((l) => l.nonterminal)).toEqual(['S']);
		const r = backtrack(g, input(g, '1 0'), { depthCap: 4 });
		expect(r.outcome).toBe('stopped');
		expect(r.stop).toEqual({ reason: 'depth', limit: 4, symbol: 'S' });
		expect(r.steps.map((s) => s.message[0])).toEqual([
			'Try S₀ → S₁ 0',
			'Try S₁ → S₂ 0',
			'Try S₂ → S₃ 0',
			'Try S₃ → S₄ 0',
			'Stopped: 4 instances of S nested, no input consumed'
		]);
		const last = r.steps[r.steps.length - 1];
		expect(last.event).toBe('stop');
		expect(numbered(last.tree)).toBe('S₀( S₁( S₂( S₃(S₄ 0) 0 ) 0 ) 0 )');
		expect(last.path).toEqual([0, 0, 0, 0]);
		expect(r.steps.every((s) => s.pos === 0)).toBe(true);
		expect(r.tree).toBeNull();
		expect(r.depth).toBe(4);
	});

	it('finds 1 0 when the rule that is not recursive comes first', () => {
		const g = grammar('S → 1 | S 0');
		const r = backtrack(g, input(g, '1 0'), { depthCap: DEFAULT_DEPTH_CAP });
		expect(r.steps.map((s) => s.message[0])).toEqual([
			'Try S₀ → 1',
			'Match! Advance input.',
			'Tokens remain after the parse: 0',
			'Try S₀ → S₁ 0',
			'Try S₁ → 1',
			'Match! Advance input.',
			'Match! Advance input.',
			'End of input, accept'
		]);
		expect(bracketForm(r.tree!)).toBe('S( S(1) 0 )');
	});

	it('but never ends on a string outside the language', () => {
		const g = grammar('S → 1 | S 0');
		const r = backtrack(g, input(g, '0'), { depthCap: 5 });
		expect(r.outcome).toBe('stopped');
		expect(r.stop).toEqual({ reason: 'depth', limit: 5, symbol: 'S' });
		expect(r.steps[r.steps.length - 1].path).toEqual([0, 0, 0, 0, 0]);
	});

	it('stops on indirect left recursion and on the expression grammar', () => {
		const indirect = grammar('S → A a | d\nA → S b');
		const round = backtrack(indirect, ['d', 'b', 'a'], { depthCap: 3 });
		// Three S are nested, with an A between each two: the A are not counted.
		expect(round.stop).toEqual({ reason: 'depth', limit: 3, symbol: 'S' });
		expect(tries(round)).toEqual([
			'S₀ → A₁ a',
			'A₁ → S₂ b',
			'S₂ → A₃ a',
			'A₃ → S₄ b',
			'S₄ → A₅ a',
			'A₅ → S₆ b'
		]);
		expect(round.steps[round.steps.length - 1].message).toEqual([
			'Stopped: 3 instances of S nested, no input consumed'
		]);
		const e = grammar(LEFT_RECURSIVE);
		const r = backtrack(e, input(e, 'int + int'), { depthCap: DEFAULT_DEPTH_CAP });
		expect(r.stop?.reason).toBe('depth');
		// T2 is waiting to the right of E1, and no E is numbered 2: slide 19 writes T2 beside E2 too.
		expect(tries(r).slice(0, 3)).toEqual(['E₀ → E₁ + T₂', 'E₁ → E₂ + T₃', 'E₂ → E₃ + T₄']);
	});

	it('does not count instances with a token matched between them', () => {
		// Nine nested S, each one token further on.
		const g = grammar('S → ( S ) | x');
		const s = input(g, '( ( ( ( ( ( ( ( x ) ) ) ) ) ) ) )');
		const r = backtrack(g, s, { depthCap: 1 });
		expect(r.outcome).toBe('accept');
	});

	// Ten non-terminals in a row before the first token, and a left-recursive Z that a is parsed without.
	const CHAIN =
		'A → B\nB → C\nC → D\nD → F\nF → G\nG → H\nH → I\nI → J\nJ → K\nK → a | Z\nZ → Z b | b';

	it('does not count the instances of other non-terminals', () => {
		const g = grammar(CHAIN);
		expect(leftRecursion(g).map((l) => l.nonterminal)).toEqual(['Z']);
		// K is the tenth instance at the first token, and no non-terminal is there twice.
		for (const depthCap of [1, DEFAULT_DEPTH_CAP]) {
			const r = backtrack(g, ['a'], { depthCap });
			expect(r.outcome).toBe('accept');
			expect(r.stop).toBeNull();
			expect(r.tries).toBe(10);
			expect(bracketForm(r.tree!)).toBe('A( B( C( D( F( G( H( I( J( K(a) ) ) ) ) ) ) ) ) )');
			expect(r.steps.map((s) => s.message)).toEqual(
				backtrack(g, ['a']).steps.map((s) => s.message)
			);
		}
	});

	it('stops at the left-recursive non-terminal below them', () => {
		const g = grammar(CHAIN);
		const r = backtrack(g, ['b'], { depthCap: 3 });
		expect(r.stop).toEqual({ reason: 'depth', limit: 3, symbol: 'Z' });
		expect(tries(r, false).slice(-5)).toEqual(['K → a', 'K → Z', 'Z → Z b', 'Z → Z b', 'Z → Z b']);
		const last = r.steps[r.steps.length - 1];
		expect(last.message).toEqual(['Stopped: 3 instances of Z nested, no input consumed']);
		expect(plainText(describeStep(last, { instances: false })[0])).toBe(
			'Stopped: 3 instances of Z nested, no input consumed'
		);
		// Thirteen instances are above the next Z at the first token; three of them are Z.
		expect(last.path).toHaveLength(13);
	});

	it('without a cap the step budget ends the run', () => {
		const g = grammar('S → S 0 | 1');
		const r = backtrack(g, ['1'], { maxSteps: 40 });
		expect(r.steps).toHaveLength(40);
		expect(r.stop).toEqual({ reason: 'steps', limit: 40 });
		expect(r.steps[39].message).toEqual(['Stopped after 40 steps']);
		expect(r.steps[39].event).toBe('stop');
		expect(r.depth).toBe(39);
	});
});

describe('the depth cap for a token string', () => {
	it('is at least the default, and more than the tokens', () => {
		expect([0, 1, 6, 7, 8, 40].map(depthCapFor)).toEqual([
			DEFAULT_DEPTH_CAP,
			DEFAULT_DEPTH_CAP,
			DEFAULT_DEPTH_CAP,
			DEFAULT_DEPTH_CAP,
			9,
			41
		]);
	});

	it('lets a parse end that nests one S for every token', () => {
		const g = grammar('S → 1 | S 0');
		const s = input(g, '1 0 0 0 0 0 0 0 0 0');
		// Ten S start at the first token, each ending one 0 further on.
		expect(backtrack(g, s, { depthCap: DEFAULT_DEPTH_CAP }).stop?.reason).toBe('depth');
		const r = backtrack(g, s, { depthCap: depthCapFor(s.length) });
		expect(r.outcome).toBe('accept');
		expect(yieldOf(r.tree!)).toEqual(s);
		expect(r.depth).toBe(10);
		expect(r.steps.map((x) => x.message)).toEqual(backtrack(g, s).steps.map((x) => x.message));
	});

	it('stops the same grammar in the other order, and on a string outside the language', () => {
		const s = ['1', ...Array<string>(9).fill('0')];
		const reversed = backtrack(grammar('S → S 0 | 1'), s, { depthCap: depthCapFor(s.length) });
		expect(reversed.stop).toEqual({ reason: 'depth', limit: 11, symbol: 'S' });
		expect(reversed.tries).toBe(11);
		const outside = backtrack(grammar('S → 1 | S 0'), ['1', '1'], { depthCap: depthCapFor(2) });
		expect(outside.stop).toEqual({ reason: 'depth', limit: DEFAULT_DEPTH_CAP, symbol: 'S' });
	});

	it('only stops runs that do not end', () => {
		// The cap of a string of n tokens is n + 1 here, without the floor of the default.
		const next = random(5);
		const budget = 1200;
		let stopped = 0;
		let ended = 0;
		let accepted = 0;
		for (let n = 0; n < 400 && stopped + ended < 320; n++) {
			const g = randomGrammar(next);
			if (leftRecursion(g).length === 0) continue;
			const alphabet = g.terminals.slice(0, 2);
			const strings: string[][] = [[]];
			for (let len = 1; len <= 3; len++)
				for (const s of strings.filter((x) => x.length === len - 1))
					for (const t of alphabet) strings.push([...s, t]);
			for (const s of strings) {
				const capped = backtrack(g, s, { depthCap: s.length + 1, maxSteps: budget });
				const free = backtrack(g, s, { maxSteps: budget });
				const what = [printGrammar(g), s.join(' ')];
				if (capped.stop?.reason === 'depth') {
					stopped++;
					// Without the cap the run is still going when the steps are used up.
					expect([...what, free.outcome]).toEqual([...what, 'stopped']);
					expect(capped.steps.length).toBeLessThan(free.steps.length);
					continue;
				}
				// With the cap out of the way the run is the same, step for step.
				expect([...what, capped.outcome, capped.steps.length]).toEqual([
					...what,
					free.outcome,
					free.steps.length
				]);
				if (capped.outcome === 'stopped') continue;
				ended++;
				if (capped.outcome === 'accept') accepted++;
				expect([...what, capped.outcome === 'accept']).toEqual([...what, recognizes(g, s)]);
			}
		}
		expect(stopped).toBeGreaterThan(100);
		expect(ended).toBeGreaterThan(60);
		expect(accepted).toBeGreaterThan(15);
	});
});

describe('the step budget', () => {
	it('bounds an exponential search', () => {
		// Each a is read as A → a or as A → a a, and the b at the end fits neither.
		const g = grammar('S → A S | A\nA → a | a a');
		const s = [...Array<string>(40).fill('a'), 'b'];
		const r = backtrack(g, s);
		expect(r.steps).toHaveLength(DEFAULT_MAX_STEPS);
		expect(r.outcome).toBe('stopped');
		expect(r.stop).toEqual({ reason: 'steps', limit: DEFAULT_MAX_STEPS });
		expect(r.steps[r.steps.length - 1].event).toBe('stop');
		expect(r.steps.slice(0, -1).every((step) => step.event !== 'stop')).toBe(true);
		expect(backtrack(g, s, { maxSteps: 500 }).steps).toHaveLength(500);
	});

	it('still reports an accept that is the next step', () => {
		const g = grammar(TOP_DOWN);
		const full = backtrack(g, input(g, '( int )'));
		const tight = backtrack(g, input(g, '( int )'), { maxSteps: full.steps.length });
		expect(tight.outcome).toBe('accept');
		const short = backtrack(g, input(g, '( int )'), { maxSteps: full.steps.length - 1 });
		expect(short.outcome).toBe('stopped');
		expect(short.steps).toHaveLength(full.steps.length - 1);
		expect(short.steps.slice(0, -1).map((s) => s.message)).toEqual(
			full.steps.slice(0, short.steps.length - 1).map((s) => s.message)
		);
	});

	it('records at least two steps', () => {
		const g = grammar(TOP_DOWN);
		expect(backtrack(g, ['int'], { maxSteps: 0 }).steps).toHaveLength(2);
	});
});

describe('agreement with the grammar engine', () => {
	it('accepts exactly the sentences of grammars without left recursion', () => {
		const next = random(11);
		let checked = 0;
		for (let n = 0; n < 400 && checked < 40; n++) {
			const g = randomGrammar(next);
			if (leftRecursion(g).length > 0) continue;
			checked++;
			const sentences = new Set(bruteForce(g, 4).map((s) => s.join(' ')));
			const alphabet = g.terminals.slice(0, 2);
			const strings: string[][] = [[]];
			for (let len = 1; len <= 4; len++)
				for (const s of strings.filter((x) => x.length === len - 1))
					for (const t of alphabet) strings.push([...s, t]);
			for (const s of strings) {
				const r = backtrack(g, s, { maxSteps: 20000 });
				if (r.outcome === 'stopped') continue;
				expect([s.join(' '), r.outcome]).toEqual([
					s.join(' '),
					sentences.has(s.join(' ')) ? 'accept' : 'reject'
				]);
				expect(r.outcome === 'accept').toBe(recognizes(g, s));
				if (r.tree) expect(yieldOf(r.tree)).toEqual(s);
			}
		}
		expect(checked).toBeGreaterThan(10);
	});

	it('finds the first tree in production order', () => {
		const g = grammar(TOP_DOWN);
		for (const text of ['int', 'int * int', 'int + int', '( int + int ) + int', 'int * ( int )']) {
			const s = input(g, text);
			const r = backtrack(g, s);
			expect(r.outcome).toBe('accept');
			expect(bracketForm(r.tree!)).toBe(bracketForm(parseTrees(g, s).trees[0]));
		}
	});

	it('does not change its inputs', () => {
		const g = grammar(TOP_DOWN);
		const copy = JSON.stringify(g);
		const s = Object.freeze(['(', 'int', ')']);
		backtrack(g, s);
		expect(JSON.stringify(g)).toBe(copy);
	});
});

describe('what a step draws is computed when it is read', () => {
	const g = grammar(TOP_DOWN_2);
	const s = input(g, 'int * ( int + int ) + int');
	const draw = (step: BacktrackStep) =>
		JSON.stringify([step.tree, step.path, step.fringe, step.newFringe ?? null]);

	it('gives the same drawing in whatever order the steps are read', () => {
		const forward = backtrack(g, s).steps.map(draw);
		const r = backtrack(g, s);
		const n = r.steps.length;
		expect(n).toBeGreaterThan(40);
		// Backward, then jumping about: every step is played again from the start or from another step.
		for (let i = n - 1; i >= 0; i--) expect([i, draw(r.steps[i])]).toEqual([i, forward[i]]);
		const next = random(3);
		for (let k = 0; k < 200; k++) {
			const i = Math.floor(next() * n);
			expect([i, draw(r.steps[i])]).toEqual([i, forward[i]]);
		}
	});

	it('gives the same objects when a step is read twice', () => {
		const r = backtrack(g, s);
		const step = r.steps[20];
		expect(step.tree).toBe(step.tree);
		expect(step.fringe).toBe(step.fringe);
		expect(step.path).toBe(step.path);
		expect(r.outcome).toBe('accept');
		expect(r.tree).toBe(r.steps[r.steps.length - 1].tree);
	});

	it('shares unchanged subtrees between steps read in order', () => {
		const e = grammar(TOP_DOWN);
		const r = backtrack(e, input(e, '( int ) + int'));
		const before = r.steps[r.steps.length - 2].tree;
		const last = r.steps[r.steps.length - 1].tree;
		// The left operand did not change in the last step.
		expect(last.children[0]).toBe(before.children[0]);
		expect(last).not.toBe(before);
	});

	it('keeps a step small however deep the tree is', () => {
		// 1400 nested S: the tree of the last steps is 1400 levels deep.
		const deep = grammar('S → a S | ε');
		const r = backtrack(deep, Array<string>(1400).fill('a'));
		expect(r.outcome).toBe('accept');
		// A try and a match per a; then S → a S against the end of the input, S → ε, accept.
		expect(r.steps).toHaveLength(2 * 1400 + 4);
		expect(r.depth).toBe(1401);
		for (const step of r.steps) {
			expect(Object.keys(step)).not.toContain('tree');
			expect(JSON.stringify(step).length).toBeLessThan(400);
		}
		const last = r.steps[r.steps.length - 1];
		expect(last.fringe.items).toHaveLength(1400);
		expect(last.fringe.matched).toBe(1400);
		expect(yieldOf(r.tree!)).toHaveLength(1400);
		const matched = matchedPaths(r.tree!);
		expect(matched).toHaveLength(1400);
		expect(matched[0]).toEqual([0]);
		expect(matched[2]).toEqual([1, 1, 0]);
		expect(matched[1399]).toHaveLength(1400);
		// The current node of the last try is at the bottom of the tree.
		expect(r.steps[r.steps.length - 2].path).toHaveLength(1400);
	});

	it('lists the tokens left over without keeping them in the step', () => {
		const one = grammar('S → a');
		const r = backtrack(one, ['a', 'a', 'a']);
		const step = r.steps.find((x) => x.event === 'backtrack')!;
		expect(step.remaining).toEqual(['a', 'a']);
		expect(Object.keys(step)).not.toContain('remaining');
		expect(r.steps[0].remaining).toBeUndefined();
	});

	it('is not changed by what the caller does to the tokens afterwards', () => {
		const one = grammar('S → a');
		const tokens = ['a', 'a', 'a'];
		const r = backtrack(one, tokens);
		tokens.length = 0;
		expect(r.steps.find((x) => x.event === 'backtrack')!.remaining).toEqual(['a', 'a']);
	});
});
