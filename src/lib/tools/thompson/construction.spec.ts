import { describe, expect, it } from 'vitest';
import { formatLabel } from '$lib/theory/chars';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { accepts, thompson, type Automaton } from '$lib/theory/automata';
import {
	MAX_STATES,
	acceptingThrough,
	andList,
	buildConstruction,
	childSteps,
	constructionExtent,
	describeStep,
	formulaText,
	formulaTotal,
	repeatText,
	sizeStats,
	sourceMarks,
	stepText,
	stepView,
	thompsonSize,
	type Construction
} from './construction';

function build(re: string, defs = ''): Construction {
	const o = buildConstruction(re, defs);
	if (o.status !== 'ok') throw new Error(`${re}: ${o.status} ${JSON.stringify(o.diagnostics)}`);
	return o.construction;
}

const edges = (a: Automaton) =>
	a.transitions.map(
		(t) =>
			`${a.states[t.from].name}-${t.label ? formatLabel(t.label) : 'ε'}->${a.states[t.to].name}`
	);
const names = (a: Automaton, ids: Iterable<number>) => [...ids].map((i) => a.states[i].name);

describe('(1 | 0)*1, step by step (Lexical Analysis IV, slide 6)', () => {
	const c = build('(1 | 0)*1');
	const { nfa } = c.result;

	it('has one step per node, with the sub-expressions as written', () => {
		expect(c.texts).toEqual(['1', '0', '(1 | 0)', '(1 | 0)*', '1', '(1 | 0)*1']);
		expect(c.result.steps.map((s) => s.clause)).toEqual([
			'Atomic',
			'Atomic',
			'Choice/Alternation',
			'Iteration (Kleene closure)',
			'Atomic',
			'Concatenation'
		]);
	});

	it('describes each step in the lecture’s terms', () => {
		const text = c.result.steps.map((_, i) => stepText(describeStep(c, i)));
		expect(text).toEqual([
			'Step 1 of 6 · 1 — Atomic: new start C and new final E; transition C → E on 1.',
			'Step 2 of 6 · 0 — Atomic: new start D and new final F; transition D → F on 0.',
			'Step 3 of 6 · (1 | 0) — Choice/Alternation: new start B and new final G; ε-moves B → C, B → D, E → G, F → G. E and F are no longer accepting.',
			'Step 4 of 6 · (1 | 0)* — Iteration (Kleene closure): new start A and new final H; ε-moves A → B, G → A, A → H. G is no longer accepting.',
			'Step 5 of 6 · 1 — Atomic: new start I and new final J; transition I → J on 1.',
			'Step 6 of 6 · (1 | 0)*1 — Concatenation: no new states; ε-move H → I. H is no longer accepting.'
		]);
	});

	it('draws only what exists so far, named as in the finished NFA', () => {
		const views = c.result.steps.map((_, i) => stepView(c, i));
		expect(
			views.map((v) =>
				names(
					v.automaton,
					v.automaton.states.map((s) => s.id)
				).join('')
			)
		).toEqual(['CE', 'CDEF', 'BCDEFG', 'ABCDEFGH', 'ABCDEFGHIJ', 'ABCDEFGHIJ']);
		expect(
			views.map((v) =>
				v.automaton.states
					.filter((s) => s.accepting)
					.map((s) => s.name)
					.join('')
			)
		).toEqual(['E', 'EF', 'G', 'H', 'HJ', 'J']);
		expect(views.map((v) => v.automaton.states[v.automaton.start].name)).toEqual([
			'C',
			'D',
			'B',
			'A',
			'I',
			'A'
		]);
		expect(views.map((v) => v.automaton.transitions.length)).toEqual([1, 2, 6, 9, 10, 11]);
		for (const v of views) v.automaton.states.forEach((s, i) => expect(s.id).toBe(i));
	});

	it('ends with exactly the slide’s NFA', () => {
		const last = stepView(c, 5).automaton;
		expect(edges(last)).toEqual(edges(nfa));
		expect(new Set(edges(last))).toEqual(
			new Set([
				'A-ε->B',
				'A-ε->H',
				'B-ε->C',
				'B-ε->D',
				'C-1->E',
				'D-0->F',
				'E-ε->G',
				'F-ε->G',
				'G-ε->A',
				'H-ε->I',
				'I-1->J'
			])
		);
	});

	it('keeps every state at its place in the finished layout', () => {
		const v = stepView(c, 2);
		for (const s of v.automaton.states) {
			const nfaId = nfa.states.findIndex((n) => n.name === s.name);
			expect(v.positions.get(s.id)).toEqual(c.result.positions.get(nfaId));
		}
	});

	it('highlights the new states and transitions', () => {
		const v = stepView(c, 2);
		expect(names(v.automaton, v.newStates)).toEqual(['B', 'G']);
		expect(v.newTransitions).toEqual([2, 3, 4, 5]);
		expect(stepView(c, 5).newStates).toEqual([]);
	});

	it('outlines the current fragment and, faintly, its operands', () => {
		const v = stepView(c, 2);
		expect(
			v.groups.map((g) => [g.label, names(v.automaton, g.states).join(''), !!g.faint])
		).toEqual([
			['(1 | 0)', 'BCDEFG', false],
			['1', 'CE', true],
			['0', 'DF', true]
		]);
		const star = stepView(c, 3);
		expect(star.groups.map((g) => g.label)).toEqual(['(1 | 0)*', '(1 | 0)']);
		expect(stepView(c, 0).groups).toHaveLength(1);
		expect(childSteps(c, 5)).toEqual([3, 4]);
	});

	it('knows which finals are still accepting', () => {
		const acc = (i: number) => names(nfa, acceptingThrough(c.result, i)).sort().join('');
		expect([0, 1, 2, 3, 4, 5].map(acc)).toEqual(['E', 'EF', 'G', 'H', 'HJ', 'J']);
	});

	it('counts states against 2 × (symbols + | + *)', () => {
		const s = sizeStats(c);
		expect(s).toMatchObject({ states: 10, transitions: 11, epsilonMoves: 8, derived: [] });
		expect(formulaText(s.formula!)).toBe('2 × (3 symbols + 1 | + 1 *)');
		expect(formulaTotal(s.formula!)).toBe(10);
	});

	it('marks where each sub-expression is written', () => {
		expect(sourceMarks(c, 2)).toEqual({ main: { start: 0, end: 7 }, def: null });
		expect(sourceMarks(c, 4)).toEqual({ main: { start: 8, end: 9 }, def: null });
	});

	it('gives a fit extent around the finished drawing', () => {
		const e = constructionExtent(c);
		const xs = [...c.result.positions.values()].map((p) => p.x);
		expect(e.x).toBeLessThan(Math.min(...xs));
		expect(e.x + e.width).toBeGreaterThan(Math.max(...xs));
		expect(e.height).toBeGreaterThan(84);
	});
});

describe('thompsonSize', () => {
	const exprs: [string, string?][] = [
		['ε'],
		['ɸ'],
		['a'],
		['a b c'],
		['a | b | c | d'],
		['(a | b)*'],
		['a+'],
		['(a b)+'],
		['a?'],
		['a^0'],
		['a^1'],
		['(a | b)^3'],
		['a^{2,4}'],
		['a^{0,2}'],
		['a^{2,}'],
		['a^{0,}'],
		['[a-z] Σ'],
		["'if' | 'then' | 'else'"],
		['digit digit* d2', "digit = '0' | '1' | '2' | … | '9'\nd2 = digit digit"]
	];
	it.each(exprs)('matches the engine for %s', (re, defs = '') => {
		const d = parseDefinitions(defs);
		const p = parseRegex(re, { defs: d.defs, invalid: d.invalid });
		if (!p.ok) throw new Error(JSON.stringify(p.diagnostics));
		expect(thompsonSize(p.regex).states).toBe(thompson(p.regex).nfa.states.length);
	});

	it('counts tree nodes with definitions expanded at each use', () => {
		const d = parseDefinitions('x = a b');
		const p = parseRegex('x x', { defs: d.defs });
		if (!p.ok) throw new Error('parse');
		// concat, 2 × (ref, concat, a, b)
		expect(thompsonSize(p.regex).nodes).toBe(9);
	});

	it('stays fast on definitions that double at every level', () => {
		const lines = ['d0 = a'];
		for (let i = 1; i <= 40; i++) lines.push(`d${i} = d${i - 1} d${i - 1}`);
		const o = buildConstruction('d40', lines.join('\n'));
		expect(o.status).toBe('too-big');
		if (o.status === 'too-big') expect(o.size.states).toBe(2 ** 41);
	});
});

describe('buildConstruction', () => {
	it('refuses machines over the limit without building them', () => {
		const o = buildConstruction('a^400', '');
		expect(o.status).toBe('too-big');
		if (o.status === 'too-big') expect(o.size.states).toBe(800);
		expect(MAX_STATES).toBeGreaterThanOrEqual(200);
	});

	it('reports parse errors', () => {
		const o = buildConstruction('(1 |', '');
		expect(o.status).toBe('invalid');
		expect(o.diagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(buildConstruction('', '').status).toBe('invalid');
	});

	it('reports definition problems separately', () => {
		const o = buildConstruction('digit', 'digit = (');
		expect(o.defDiagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(o.status).toBe('invalid');
	});
});

describe('describeStep: other clauses', () => {
	const detail = (re: string, i: number, defs = '') => describeStep(build(re, defs), i).detail;

	it('ε, ɸ, classes and Σ', () => {
		expect(detail('ε', 0)).toBe('new start A and new final B; ε-move A → B.');
		expect(detail('ɸ', 0)).toBe('new start A and new final B; no transition, since L(ɸ) = { }.');
		expect(detail('[a-z]', 0)).toBe('new start A and new final B; transition A → B on a–z.');
		expect(detail('a Σ', 1)).toBe('new start C and new final D; transition C → D on a.');
	});

	it('keeps the quotes of a literal’s characters', () => {
		expect(build("'if' | x").texts).toEqual(["'i'", "'f'", "'if'", 'x', "'if' | x"]);
	});

	it('concatenation of several parts and multi-character literals', () => {
		expect(detail("'if'", 2)).toBe('no new states; ε-move B → C. B is no longer accepting.');
		expect(detail('a b c', 3)).toBe(
			'no new states; ε-moves B → C, D → E. B and D are no longer accepting.'
		);
	});

	it('derived forms say what they expand to', () => {
		expect(detail('a+', 1)).toBe(
			'A+ = A A*, with a fresh copy of A; new states C, D, E, and F; ε-moves C → D, E → C, C → F, B → C; transition D → E on a. B is no longer accepting.'
		);
		expect(detail('a?', 1)).toMatch(/^A\? = A \| ε; new states /);
		expect(detail('a^2', 1)).toBe(
			'A² = 2 copies of A; new states C and D; ε-move B → C; transition C → D on a. B is no longer accepting.'
		);
		expect(detail('a^1', 1)).toBe('A¹ is A itself; no new states.');
		expect(detail('a^0', 0)).toBe('A⁰ = ε; new start A and new final B; ε-move A → B.');
		expect(detail('a^{1,2}', 1)).toMatch(/^A\{1,2\} = 1 copy of A, then 1 of A\?;/);
		expect(detail('a^{2,}', 1)).toMatch(/^A\{2,\} = 2 copies of A, then A\*;/);
		expect(detail('a | b | c', 3)).toMatch(/^\(A \| B\) \| C: two options at a time/);
		expect(detail('digit', 1, "digit = '0' | … | '9'")).toBe(
			'digit stands for its definition; no new states.'
		);
	});

	it('lists and repeat notation', () => {
		expect(andList(['E'])).toBe('E');
		expect(andList(['E', 'F'])).toBe('E and F');
		expect(andList(['B', 'D', 'F'])).toBe('B, D, and F');
		expect(repeatText(3, 3)).toBe('A³');
		expect(repeatText(12, 12)).toBe('A¹²');
		expect(repeatText(2, null)).toBe('A{2,}');
		expect(repeatText(1, 3, 'B')).toBe('B{1,3}');
	});
});

describe('definitions', () => {
	const c = build('digit digit*', "digit = '0' | '1' | '2' | … | '9'");

	it('marks the use in the expression and the node in its definition', () => {
		const inside = c.result.steps.findIndex((s) => s.node.kind === 'chars');
		const m = sourceMarks(c, inside);
		expect(m.main).toEqual({ start: 0, end: 5 });
		expect(m.def?.name).toBe('digit');
		expect(m.def?.line.slice(m.def.start, m.def.end)).toBe("'0' | '1' | '2' | … | '9'");
	});

	it('does not outline a definition use twice', () => {
		const ref = c.result.steps.findIndex((s) => s.node.kind === 'ref');
		expect(stepView(c, ref).groups).toHaveLength(1);
	});

	it('accepts numbers', () => {
		for (const s of ['0', '42', '2026']) expect(accepts(c.result.nfa, s)).toBe(true);
		for (const s of ['', 'x', '4a']) expect(accepts(c.result.nfa, s)).toBe(false);
	});

	it('uses derived forms in the size note instead of the formula', () => {
		const s = sizeStats(c);
		expect(s.formula).toBeNull();
		expect(s.derived).toEqual(['definitions']);
		expect(sizeStats(build('a+ b?')).derived).toEqual(['A+', 'A?']);
	});
});
