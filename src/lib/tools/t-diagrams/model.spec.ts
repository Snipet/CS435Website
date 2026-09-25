import { describe, expect, it } from 'vitest';
import {
	blankFields,
	checkWorkbench,
	compose,
	composeMessage,
	describeT,
	formatT,
	goalMet,
	normalizeT,
	parseRunnable,
	piecesText,
	resultPieces,
	richText,
	runsDirectly,
	sameT,
	subsetChain,
	type Facts,
	type TDiagram
} from './model';

const T = (source: string, target: string, host: string): TDiagram => ({ source, target, host });
const text = (c: ReturnType<typeof compose>, rule: string) =>
	piecesText(c.checks.find((x) => x.rule === rule)!.pieces);

const boot: Facts = { subsets: [{ sub: 'L′', sup: 'L' }], runnable: ['M', 'M′'] };

describe('formatT / sameT / normalizeT', () => {
	it('prints T(S → T / H) with canonical names', () => {
		expect(formatT(T('L', 'M', "L'"))).toBe('T(L → M / L′)');
		expect(formatT(T('L', 'M_{OTHER}', 'M_NATIVE'))).toBe('T(L → M_OTHER / M_NATIVE)');
		expect(formatT(T('', 'M', ' '))).toBe('T(? → M / ?)');
	});

	it('compares diagrams by canonical names', () => {
		expect(sameT(T('L', 'M', "L'"), T(' L', 'M ', 'L′'))).toBe(true);
		expect(sameT(T('L', 'M', 'M'), T('L', 'M', 'M′'))).toBe(false);
		expect(normalizeT(T(" L'", 'M_{X}', 'M'))).toEqual(T('L′', 'M_X', 'M'));
	});

	it('lists blank fields', () => {
		expect(blankFields(T('', 'M', ' '))).toEqual(['source', 'host']);
		expect(blankFields(T('S', 'T', 'H'))).toEqual([]);
	});

	it('describes a diagram for screen readers', () => {
		expect(describeT(T('L', 'M_OTHER', 'M_NATIVE'))).toBe('from L to M OTHER, written in M NATIVE');
	});
});

describe('parseRunnable', () => {
	it('splits on commas, normalizes, and drops repeats and blanks', () => {
		expect(parseRunnable("M, M', ,M")).toEqual(['M', 'M′']);
		expect(parseRunnable('')).toEqual([]);
		expect(parseRunnable('x86; ARMv9')).toEqual(['x86', 'ARMv9']);
	});
});

describe('subsetChain', () => {
	const facts: Facts = {
		subsets: [
			{ sub: 'L″', sup: 'L′' },
			{ sub: "L'", sup: 'L' }
		],
		runnable: []
	};

	it('is reflexive', () => {
		expect(subsetChain(facts, 'C', ' C ')).toEqual(['C']);
	});

	it('follows declarations transitively', () => {
		expect(subsetChain(facts, 'L′', 'L')).toEqual(['L′', 'L']);
		expect(subsetChain(facts, 'L″', 'L')).toEqual(['L″', 'L′', 'L']);
	});

	it('does not go the other way', () => {
		expect(subsetChain(facts, 'L', 'L′')).toBeNull();
		expect(subsetChain(facts, '', 'L')).toBeNull();
	});

	it('survives cycles', () => {
		const cyclic: Facts = {
			subsets: [
				{ sub: 'A', sup: 'B' },
				{ sub: 'B', sup: 'A' }
			],
			runnable: []
		};
		expect(subsetChain(cyclic, 'A', 'B')).toEqual(['A', 'B']);
		expect(subsetChain(cyclic, 'A', 'C')).toBeNull();
	});
});

describe('runsDirectly', () => {
	it('accepts listed languages and subsets of them', () => {
		const facts: Facts = { subsets: [{ sub: 'M′', sup: 'M' }], runnable: ['M'] };
		expect(runsDirectly(facts, 'M')).toEqual({ ok: true, chain: ['M'] });
		expect(runsDirectly(facts, 'M′')).toEqual({ ok: true, chain: ['M′', 'M'] });
		expect(runsDirectly(facts, 'L')).toEqual({ ok: false, chain: null });
	});
});

describe('compose', () => {
	it('reproduces bootstrapping step 1) of slide 8', () => {
		const c = compose(T('L', 'M', 'L′'), T('L′', 'M′', 'M'), boot);
		expect(c.legal).toBe(true);
		expect(c.result).toEqual(T('L', 'M', 'M′'));
		expect(text(c, 'reads')).toBe('The compiler is written in L′, and the translator reads L′.');
		expect(text(c, 'runs')).toBe('The translator is written in M, which runs directly.');
	});

	it('reproduces bootstrapping step 2), which relies on L′ ⊆ L', () => {
		const c = compose(T('L', 'M', 'L′'), T('L', 'M', 'M′'), boot);
		expect(c.legal).toBe(true);
		expect(c.result).toEqual(T('L', 'M', 'M'));
		expect(text(c, 'reads')).toBe(
			'The compiler is written in L′ and the translator reads L: L′ ⊆ L.'
		);
		expect(text(c, 'runs')).toBe('The translator is written in M′, which runs directly.');
	});

	it('explains a host that the translator does not read', () => {
		const c = compose(T('L', 'M', 'L′'), T('C', 'x86', 'x86'), {
			subsets: [],
			runnable: ['x86']
		});
		expect(c.legal).toBe(false);
		expect(c.result).toBeNull();
		expect(text(c, 'reads')).toBe('This compiler is written in L′, but the translator reads C.');
	});

	it('names the subset when the translator reads only part of the host language', () => {
		const c = compose(T('L', 'M', 'L'), T('L′', 'M′', 'M'), boot);
		expect(c.legal).toBe(false);
		expect(text(c, 'reads')).toBe(
			'This compiler is written in L, but the translator reads L′, a subset of L.'
		);
	});

	it('requires the translator to run directly', () => {
		const c = compose(T('C', 'ARMv9', 'C++'), T('C++', 'x86', 'C++'), {
			subsets: [],
			runnable: ['x86']
		});
		expect(c.legal).toBe(false);
		expect(text(c, 'reads')).toBe('The compiler is written in C++, and the translator reads C++.');
		expect(text(c, 'runs')).toBe('The translator is written in C++, which does not run directly.');
	});

	it('accepts a translator written in a subset of a runnable language', () => {
		const c = compose(T('L', 'M', 'L′'), T('L′', 'M′', 'M′'), {
			subsets: [
				{ sub: 'L′', sup: 'L' },
				{ sub: 'M′', sup: 'M' }
			],
			runnable: ['M']
		});
		expect(c.legal).toBe(true);
		expect(text(c, 'runs')).toBe('The translator is written in M′, which runs directly (M′ ⊆ M).');
	});

	it('stops at blank fields', () => {
		const c = compose(T('L', '', 'L′'), T('L′', 'M′', ''), boot);
		expect(c.legal).toBe(false);
		expect(c.checks.map((x) => x.rule)).toEqual(['complete', 'complete']);
		expect(c.checks.map((x) => piecesText(x.pieces))).toEqual([
			'The compiler has no target language.',
			'The translator has no host language.'
		]);
	});

	it('writes the result in canonical spelling', () => {
		const c = compose(T('L', 'M_{OTHER}', 'L'), T('L', 'M_NATIVE', 'M_NATIVE'), {
			subsets: [],
			runnable: ['M_NATIVE']
		});
		expect(c.result).toEqual(T('L', 'M_OTHER', 'M_NATIVE'));
	});

	it('does not mutate its inputs', () => {
		const p = T('L', 'M', "L'");
		const t = T("L'", 'M′', 'M');
		const before = JSON.stringify([p, t, boot]);
		compose(p, t, boot);
		expect(JSON.stringify([p, t, boot])).toBe(before);
	});
});

describe('resultPieces', () => {
	it('says what changed', () => {
		expect(piecesText(resultPieces(T('L', 'M', 'L′'), T('L', 'M', 'M′')))).toBe(
			'T(L → M / M′): the same L → M compiler, now written in M′.'
		);
	});
});

describe('goalMet', () => {
	const goal = T('L', 'M', 'M');
	it('finds the goal among the diagrams', () => {
		expect(goalMet(goal, [T('L', 'M', 'L′'), null, T('L', 'M', 'M')])).toBe(true);
		expect(goalMet(goal, [T('L', 'M', 'M′')])).toBe(false);
		expect(goalMet(null, [goal])).toBe(false);
		expect(goalMet(T('', '', ''), [T('', '', '')])).toBe(false);
	});
});

describe('richText', () => {
	it('marks subscripted names as languages', () => {
		expect(richText('L to M_OTHER on M_NATIVE.')).toEqual([
			'L to ',
			{ lang: 'M_OTHER' },
			' on ',
			{ lang: 'M_NATIVE' },
			'.'
		]);
		expect(richText('plain')).toEqual(['plain']);
		expect(richText('')).toEqual([]);
	});
});

describe('checkWorkbench', () => {
	it('is quiet for a complete workbench', () => {
		expect(
			checkWorkbench({
				toolbox: [T('L', 'M', 'L′'), T('L′', 'M′', 'M')],
				subsets: [{ sub: 'L′', sup: 'L' }],
				runnable: 'M, M′',
				goal: T('L', 'M', 'M')
			})
		).toEqual([]);
	});

	it('points at blank fields, blank subsets, and a blank goal', () => {
		const issues = checkWorkbench({
			toolbox: [T('L', '', 'L′')],
			subsets: [{ sub: 'L′', sup: '' }],
			runnable: '',
			goal: T('L', 'M', '')
		});
		expect(issues.map((d) => [d.severity, d.message, d.target])).toEqual([
			[
				'warning',
				'Diagram 1 needs a target language.',
				{ kind: 'diagram', index: 0, field: 'target' }
			],
			[
				'warning',
				'Subset 1 needs a language on both sides of ⊆.',
				{ kind: 'subset', index: 0, side: 'sup' }
			],
			['warning', 'The goal needs a host language.', { kind: 'goal', field: 'host' }]
		]);
	});

	it('points a half-filled subset at its blank side, and a new one at neither', () => {
		const issues = checkWorkbench({
			toolbox: [],
			subsets: [
				{ sub: '', sup: 'L' },
				{ sub: 'L′', sup: ' ' },
				{ sub: '', sup: '' }
			],
			runnable: '',
			goal: null
		});
		expect(issues.map((d) => d.target)).toEqual([
			{ kind: 'subset', index: 0, side: 'sub' },
			{ kind: 'subset', index: 1, side: 'sup' },
			{ kind: 'subset', index: 2 }
		]);
	});

	it('flags names that are too long as errors', () => {
		const issues = checkWorkbench({
			toolbox: [T('L'.repeat(30), 'M', 'M')],
			subsets: [],
			runnable: '',
			goal: null
		});
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('error');
	});

	it('notes subsets that say nothing or go both ways', () => {
		const issues = checkWorkbench({
			toolbox: [],
			subsets: [
				{ sub: 'L', sup: 'L' },
				{ sub: 'A', sup: 'B' },
				{ sub: 'B', sup: 'A' }
			],
			runnable: '',
			goal: null
		});
		expect(issues.map((d) => d.message)).toEqual([
			'L ⊆ L adds nothing: every language is a subset of itself.',
			'A ⊆ B and B ⊆ A: each one reads the other.',
			'B ⊆ A and A ⊆ B: each one reads the other.'
		]);
		expect(issues.every((d) => d.severity === 'warning')).toBe(true);
	});
});

describe('composeMessage', () => {
	const inSubset = T('L', 'M', 'L′');
	const quick = T('L′', 'M′', 'M');
	const goal = T('L', 'M', 'M');

	it('says what the composition gives', () => {
		const c = compose(inSubset, quick, boot);
		expect(composeMessage(inSubset, quick, c, goal)).toBe(
			'T(L → M / L′) compiled with T(L′ → M′ / M) gives T(L → M / M′).'
		);
	});

	it('says when the result is the goal', () => {
		const step1 = compose(inSubset, quick, boot).result!;
		const c = compose(inSubset, step1, boot);
		expect(composeMessage(inSubset, step1, c, goal)).toBe(
			'T(L → M / L′) compiled with T(L → M / M′) gives T(L → M / M). The goal is reached.'
		);
		expect(composeMessage(inSubset, step1, c, null)).not.toContain('goal');
	});

	it('says why a pair does not compose', () => {
		const c = compose(quick, inSubset, boot);
		expect(composeMessage(quick, inSubset, c, goal)).toBe(
			'T(L′ → M′ / M) does not compose with T(L → M / L′). This compiler is written in M, but the translator reads L.'
		);
	});
});
