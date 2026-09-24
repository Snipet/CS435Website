import { describe, expect, it } from 'vitest';
import { alt, cat, star, sym } from '../regex/ast';
import { automatonFromText } from './core';
import { accepts, pathTree, runDfa, runNfa, type PathNode } from './simulate';
import { names } from './test-helpers';
import { thompson } from './thompson';

const dfa = automatonFromText(`
	start: q0
	accept: q1
	q0 1 q0
	q0 0 q1
`);

const nfa = automatonFromText(`
	states: q0 q1 q2
	start: q0
	accept: q2
	q0 0,1 q0
	q0 0 q1
	q1 1 q2
`);

describe('runDfa', () => {
	it('accepts "1110"', () => {
		const run = runDfa(dfa, '1110');
		expect(run.outcome).toBe('accept');
		expect(run.accepted).toBe(true);
		expect(run.steps.map((s) => s.state)).toEqual([0, 0, 0, 0, 1]);
		expect(run.steps.map((s) => s.pos)).toEqual([0, 1, 2, 3, 4]);
		expect(run.steps.map((s) => s.char)).toEqual([undefined, '1', '1', '1', '0']);
		expect(run.steps[4].via).toBe(1);
	});

	it('gets stuck on "1101" (missing transition)', () => {
		const run = runDfa(dfa, '1101');
		expect(run.outcome).toBe('stuck');
		expect(run.accepted).toBe(false);
		expect(run.stuckAt).toBe(3);
		expect(run.steps.at(-1)).toEqual({ pos: 4, state: null, char: '1' });
	});

	it('rejects ""', () => {
		const run = runDfa(dfa, '');
		expect(run.outcome).toBe('reject');
		expect(run.steps).toEqual([{ pos: 0, state: 0 }]);
	});

	it('reads whole code points', () => {
		const a = automatonFromText(`
			start: A
			accept: B
			A 😀 B
		`);
		const run = runDfa(a, '😀');
		expect(run.accepted).toBe(true);
		expect(run.steps[1]).toMatchObject({ pos: 2, char: '😀' });
	});
});

describe('runNfa', () => {
	it('tracks active sets on "101": {q0}, {q0}, {q0, q1}, {q0, q2} → accept', () => {
		const run = runNfa(nfa, '101');
		expect(run.steps.map((s) => names(nfa, s.active).sort())).toEqual([
			['q0'],
			['q0'],
			['q0', 'q1'],
			['q0', 'q2']
		]);
		expect(run.accepted).toBe(true);
		expect(run.steps[2].taken).toEqual([0, 1]);
		expect(run.steps[2].moved).toEqual([0, 1]);
		expect(run.steps[0]).toEqual({ pos: 0, moved: [0], active: [0], taken: [], closure: [] });
	});

	it('rejects when the active set empties', () => {
		const run = runNfa(nfa, '1x0');
		expect(run.steps[2].active).toEqual([]);
		expect(run.steps[3].active).toEqual([]);
		expect(run.accepted).toBe(false);
	});

	it('follows ε-closures and reports the ε-transitions used', () => {
		const { nfa: t } = thompson(cat(star(alt(sym('1'), sym('0'))), sym('1')));
		const run = runNfa(t, '01');
		expect(names(t, run.steps[0].active).join('')).toBe('ABCDHI');
		expect(names(t, run.steps[1].active).join('')).toBe('FGABCDHI');
		expect(names(t, run.steps[2].active).join('')).toBe('EJGABCDHI');
		expect(run.steps[0].closure).toEqual([6, 2, 3, 8, 10]);
		expect(run.steps[2].taken).toEqual([0, 9]);
		expect(run.accepted).toBe(true);
	});
});

describe('pathTree', () => {
	const count = (n: PathNode): number => 1 + n.children.reduce((s, c) => s + count(c), 0);

	it('lists every computation path', () => {
		const { root, truncated } = pathTree(nfa, '01');
		expect(truncated).toBe(false);
		expect(root).toMatchObject({ state: 0, pos: 0, accepting: false, dead: false });
		expect(root.children.map((c) => c.state)).toEqual([0, 1]);
		const [stay, go] = root.children;
		expect(stay.children.map((c) => [c.state, c.accepting])).toEqual([[0, false]]);
		expect(stay.children[0].dead).toBe(true);
		expect(go.children.map((c) => [c.state, c.accepting, c.dead])).toEqual([[2, true, false]]);
	});

	it('marks paths that cannot continue as dead', () => {
		const { root } = pathTree(nfa, '11');
		const leaves: PathNode[] = [];
		const walk = (n: PathNode) => (n.children.length ? n.children.forEach(walk) : leaves.push(n));
		walk(root);
		expect(leaves.every((l) => l.dead)).toBe(true);
	});

	it('cuts ε-cycles', () => {
		const { nfa: t } = thompson(star(star(sym('a'))));
		const { root, truncated } = pathTree(t, 'a', { maxNodes: 1000 });
		expect(truncated).toBe(false);
		expect(count(root)).toBeLessThan(100);
		const accepting: PathNode[] = [];
		const walk = (n: PathNode) => {
			if (n.accepting) accepting.push(n);
			n.children.forEach(walk);
		};
		walk(root);
		expect(accepting.length).toBeGreaterThan(0);
	});

	it('stops at maxNodes', () => {
		const wide = automatonFromText(`
			start: A
			accept: A B
			A a A
			A a B
			B a A
			B a B
		`);
		const { root, truncated } = pathTree(wide, 'aaaaaaaaaa', { maxNodes: 50 });
		expect(truncated).toBe(true);
		expect(count(root)).toBe(50);
	});
});

describe('accepts', () => {
	it('works for DFAs and NFAs', () => {
		expect(accepts(dfa, '1110')).toBe(true);
		expect(accepts(dfa, '1101')).toBe(false);
		expect(accepts(nfa, '101')).toBe(true);
		expect(accepts(nfa, '110')).toBe(false);
		expect(accepts(thompson(star(sym('a'))).nfa, '')).toBe(true);
	});
});
