import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { tool } from '$lib/tools/catalog/t-diagrams';
import {
	checkWorkbench,
	compose,
	formatT,
	goalMet,
	parseRunnable,
	piecesText,
	type Facts,
	type TDiagram
} from './model';
import { DEFAULT_PRESET_ID, presetById, presets } from './presets';
import { defaultState, matchPreset, stateFromPreset } from './state';

const factsOf = (v: (typeof presets)[number]['value']): Facts => ({
	subsets: v.subsets,
	runnable: parseRunnable(v.runnable)
});

describe('presets', () => {
	it('have unique ids and cite Intro (cont’d) slides 3–8', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.cite?.deck).toBe('02');
			const slide = p.cite?.slide;
			expect(typeof slide).toBe('number');
			expect(slide).toBeGreaterThanOrEqual(3);
			expect(slide).toBeLessThanOrEqual(8);
		}
		expect(presets.map((p) => formatCitation(p.cite!))).toEqual([
			'Intro (cont’d): Preprocessors, bootstrapping, history · slide 3',
			'Intro (cont’d): Preprocessors, bootstrapping, history · slide 4',
			'Intro (cont’d): Preprocessors, bootstrapping, history · slide 5',
			'Intro (cont’d): Preprocessors, bootstrapping, history · slide 8'
		]);
	});

	it('load without errors', () => {
		for (const p of presets) {
			const issues = checkWorkbench(p.value);
			expect(issues, p.id).toEqual([]);
		}
	});

	it('are recognized after loading', () => {
		for (const p of presets) expect(matchPreset(stateFromPreset(p.value))?.id).toBe(p.id);
	});

	it('default to bootstrapping with its walkthrough', () => {
		expect(DEFAULT_PRESET_ID).toBe('bootstrap');
		const s = defaultState();
		expect(matchPreset(s)?.id).toBe('bootstrap');
		expect(s.guide).toBe('bootstrap');
		expect(s.step).toBe(0);
	});

	it('stay within the tool’s citation range', () => {
		const [from, to] = tool.cites[0].slide as readonly [number, number];
		for (const p of presets) {
			expect(p.cite!.slide as number).toBeGreaterThanOrEqual(from);
			expect(p.cite!.slide as number).toBeLessThanOrEqual(to);
		}
	});

	it('use plain copy', () => {
		const banned =
			/help(s)? you|learn|intuition|explore to|discover|common mistake|misconception|understand/i;
		for (const p of presets) {
			const words = [
				p.label,
				p.description ?? '',
				p.question?.prompt ?? '',
				p.question?.answer ?? ''
			];
			for (const w of words) expect(w, p.id).not.toMatch(banned);
		}
	});
});

describe('generic compiler (slide 3)', () => {
	it('is the single diagram T(S → T / H)', () => {
		const p = presetById('generic')!;
		expect(p.value.toolbox.map(formatT)).toEqual(['T(S → T / H)']);
		expect(p.value.goal).toBeNull();
	});
});

describe('cross compiler (slide 4)', () => {
	const p = presetById('cross')!;

	it('asks the slide’s question', () => {
		expect(p.question?.prompt).toBe('Example?');
	});

	it('has the slide’s diagram as its goal, reachable in one composition', () => {
		expect(formatT(p.value.goal!)).toBe('T(L → M_OTHER / M_NATIVE)');
		const [a, b] = p.value.toolbox;
		const c = compose(a, b, factsOf(p.value));
		expect(c.legal).toBe(true);
		expect(goalMet(p.value.goal, [c.result])).toBe(true);
		expect(goalMet(p.value.goal, p.value.toolbox)).toBe(false);
	});
});

describe('retargetable compiler (slide 5)', () => {
	const p = presetById('retargetable')!;
	const [x86, arm, cpp] = p.value.toolbox;
	const facts = factsOf(p.value);

	it('has the slide’s two diagrams and its examples', () => {
		expect([x86, arm].map(formatT)).toEqual(['T(C → x86 / C++)', 'T(C → ARMv9 / C++)']);
		expect(p.question).toMatchObject({
			prompt: 'Examples?',
			answer: 'GNU Compiler Collection (GCC), LLVM.'
		});
	});

	it('builds either one with the C++ compiler', () => {
		expect(formatT(compose(x86, cpp, facts).result!)).toBe('T(C → x86 / x86)');
		expect(formatT(compose(arm, cpp, facts).result!)).toBe('T(C → ARMv9 / x86)');
	});

	it('does not compile a C++ compiler with a C compiler', () => {
		const c = compose(arm, x86, facts);
		expect(c.legal).toBe(false);
		const reads = c.checks.find((x) => x.rule === 'reads')!;
		expect(piecesText(reads.pieces)).toBe(
			'This compiler is written in C++, but the translator reads C.'
		);
	});
});

describe('bootstrapping (slide 8)', () => {
	const p = presetById('bootstrap')!;
	const facts = factsOf(p.value);
	const [inSubset, quick] = p.value.toolbox;

	it('starts from T(L → M / L′), T(L′ → M′ / M), L′ ⊆ L, and runnable M, M′', () => {
		expect(p.value.toolbox.map(formatT)).toEqual(['T(L → M / L′)', 'T(L′ → M′ / M)']);
		expect(p.value.subsets).toEqual([{ sub: 'L′', sup: 'L' }]);
		expect(facts.runnable).toEqual(['M', 'M′']);
		expect(formatT(p.value.goal!)).toBe('T(L → M / M)');
		expect(p.value.guide).toBe('bootstrap');
	});

	it('reaches the goal in the slide’s two steps', () => {
		const one = compose(inSubset, quick, facts);
		expect(formatT(one.result!)).toBe('T(L → M / M′)');
		const two = compose(inSubset, one.result as TDiagram, facts);
		expect(formatT(two.result!)).toBe('T(L → M / M)');
		expect(goalMet(p.value.goal, [two.result])).toBe(true);
	});

	it('cannot skip step 1', () => {
		expect(compose(quick, inSubset, facts).legal).toBe(false);
		expect(goalMet(p.value.goal, p.value.toolbox)).toBe(false);
	});
});
