/**
 * Server-renders the T-diagram components: the markup and stylesheets that
 * keep them readable on phones and in browsers without `field-sizing`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Bench from './Bench.svelte';
import BootstrapFigure from './BootstrapFigure.svelte';
import { BENCH_METRICS, equationLayout, minFitWidth, tGeometry } from './geometry';
import LangInput from './LangInput.svelte';
import { compose } from './model';
import Tray from './Tray.svelte';
import {
	BOOTSTRAP_FACTS,
	bootstrapFigure,
	bootstrapSteps,
	COMPILER_IN_SUBSET,
	FIGURE_NARROW_BELOW,
	figureViewWidth,
	QUICK_COMPILER
} from './walkthrough';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const svgTags = (html: string) => html.match(/<svg\b[^>]*>/g) ?? [];

describe('LangInput', () => {
	const input = (value: string, placeholder?: string) =>
		render(LangInput, { props: { value, label: 'Diagram 1: host language', placeholder } }).body;

	it('carries its length in ch for browsers without field-sizing', () => {
		expect(input('M_NATIVE')).toMatch(/style="--chars: 8;?"/);
		expect(input("L''")).toMatch(/style="--chars: 3;?"/);
		expect(input('', 'L′')).toMatch(/style="--chars: 2;?"/);
		expect(input('')).toMatch(/style="--chars: 1;?"/);
	});

	it('sizes the field from --chars, and lets field-sizing take over where supported', () => {
		const css = source('./LangInput.svelte');
		expect(css).toMatch(/width: calc\(var\(--chars, 1\) \* 1ch \+ \d+px\)/);
		expect(css).toMatch(
			/@supports \(field-sizing: content\)\s*{\s*\.lang-input\s*{\s*width: auto;/
		);
	});
});

describe('BootstrapFigure', () => {
	const steps = bootstrapSteps();
	const html = render(BootstrapFigure, { props: { step: steps[4] } }).body;

	it('renders the slide’s layout and the narrow one', () => {
		const tags = svgTags(html);
		expect(tags).toHaveLength(2);
		expect(tags[0]).toMatch(/class="figure slide\b/);
		expect(tags[1]).toMatch(/class="figure narrow\b/);
		const widths = tags.map((t) => Number(/viewBox="\S+ \S+ (\S+)/.exec(t)![1]));
		expect(widths).toEqual([
			figureViewWidth(bootstrapFigure()),
			figureViewWidth(bootstrapFigure(undefined, 'narrow'))
		]);
	});

	it('gives each drawing its own arrowhead marker', () => {
		const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
		for (const id of ids) expect(html).toContain(`url(#${id})`);
	});

	it('switches layouts with a container query at FIGURE_NARROW_BELOW', () => {
		const css = source('./BootstrapFigure.svelte');
		expect(css).toContain('container-type: inline-size');
		expect(css).toContain(`@container (width < ${FIGURE_NARROW_BELOW}px)`);
		expect(FIGURE_NARROW_BELOW).toBe(457);
	});

	it('describes the figure the same way in both layouts', () => {
		const labels = svgTags(html).map((t) => /aria-label="([^"]+)"/.exec(t)![1]);
		expect(labels[0]).toBe(labels[1]);
		expect(labels[0]).toContain('The goal is reached.');
	});
});

describe('Bench', () => {
	it('never draws its labels under 15 px: a drawing too wide for that scrolls', () => {
		const composition = compose(COMPILER_IN_SUBSET, QUICK_COMPILER, BOOTSTRAP_FACTS);
		const { body } = render(Bench, {
			props: {
				program: COMPILER_IN_SUBSET,
				translator: QUICK_COMPILER,
				composition,
				sample: null
			}
		});
		const M = BENCH_METRICS;
		const lay = equationLayout(
			tGeometry(COMPILER_IN_SUBSET, M),
			tGeometry(QUICK_COMPILER, M),
			tGeometry(composition.result!, M),
			{ snapped: true, apart: 40, gap: 20 }
		);
		const vw = lay.width + 20;
		expect(body).toContain(`max-width: ${vw}px; min-width: ${minFitWidth(vw, M.font)}px`);
	});

	it('does the same for a single diagram', () => {
		const { body } = render(Bench, {
			props: { program: null, translator: null, composition: null, sample: QUICK_COMPILER }
		});
		expect(body).toMatch(/style="max-width: \d+px; min-width: \d+px;?"/);
	});
});

describe('Tray', () => {
	const props = {
		items: [
			{ id: 't1', t: COMPILER_IN_SUBSET },
			{ id: 't2', t: QUICK_COMPILER }
		],
		facts: BOOTSTRAP_FACTS,
		program: null,
		translator: null,
		goal: null,
		onpick: () => {},
		oncompose: () => {}
	};

	it('draws no drag preview until a diagram is dragged', () => {
		const { body } = render(Tray, { props });
		expect(svgTags(body)).toHaveLength(1);
		expect(body).not.toContain('ghost');
	});

	it('draws the drag preview as a fixed overlay outside the canvas’s scroll box', () => {
		const tray = source('./Tray.svelte');
		const markup = tray.slice(tray.indexOf('</script>'), tray.indexOf('<style>'));
		// The canvas's scroll box closes before the overlay opens.
		expect(markup.indexOf('class="ghost"')).toBeGreaterThan(
			markup.lastIndexOf('</svg>\n\t\t</div>')
		);
		expect(tray).toMatch(/\.ghost\s*{[^}]*position: fixed;/);
	});
});
