/**
 * Contrast of the color tokens in src/app.css (WCAG AA), in both themes:
 * text colors reach 4.5:1 on every surface and soft fill they are drawn on,
 * --active (strokes, fills, the ↑ pointer) 3:1 on the surfaces.
 * scripts/contrast-audit.mjs checks the rendered pages.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../app.css', import.meta.url), 'utf8');

/** The `--name: #hex` declarations of the rule that starts with `selector`. */
function palette(selector: string): Record<string, string> {
	const at = css.indexOf(`${selector} {`);
	if (at < 0) throw new Error(`no rule ${selector}`);
	const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
	return Object.fromEntries(
		[...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()])
	);
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
	const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

const light = palette(':root');
const dark = palette(":root[data-theme='dark']");
const darkSystem = palette(":root:not([data-theme='light'])");

/** Colors used for text, besides --text and --text-2. */
const TEXT_COLORS = [
	'--text-3',
	'--accent',
	'--active-text',
	'--accept',
	'--reject',
	'--epsilon',
	'--info',
	'--dead',
	'--tok-0',
	'--tok-1',
	'--tok-2',
	'--tok-3',
	'--tok-4',
	'--tok-5'
];
const SURFACES = ['--bg', '--surface', '--surface-2'];

describe.each([
	['light', light],
	['dark', dark]
])('%s palette', (_, p) => {
	const fills = Object.keys(p).filter((k) => k.endsWith('-soft'));
	/** Pairs below `min`, as "fg on bg ratio". */
	const below = (fgs: string[], bgs: string[], min: number) =>
		fgs.flatMap((fg) =>
			bgs
				.filter((bg) => contrast(p[fg], p[bg]) < min)
				.map((bg) => `${fg} on ${bg} ${contrast(p[fg], p[bg]).toFixed(2)}`)
		);

	it('has every token the checks name', () => {
		for (const k of [...TEXT_COLORS, ...SURFACES, '--surface-3', '--text', '--text-2', '--active'])
			expect(p[k], k).toMatch(/^#/);
		expect(fills.length).toBeGreaterThanOrEqual(11);
	});

	it('text colors reach 4.5:1 on the surfaces and every soft fill', () => {
		expect(below(['--text', '--text-2', ...TEXT_COLORS], [...SURFACES, ...fills], 4.5)).toEqual([]);
	});

	it('--text-3 reaches 4.5:1 on --surface-3 too', () => {
		expect(below(['--text', '--text-2', '--text-3'], ['--surface-3'], 4.5)).toEqual([]);
	});

	it('--active reaches 3:1 on the surfaces (graphics)', () => {
		expect(below(['--active'], SURFACES, 3)).toEqual([]);
	});

	it('--text-3 stays quieter than --text-2', () => {
		for (const bg of SURFACES)
			expect(contrast(p['--text-2'], p[bg]) / contrast(p['--text-3'], p[bg])).toBeGreaterThan(1.3);
	});
});

it('the dark palette is the same for the system setting and the theme toggle', () => {
	expect(darkSystem).toEqual(dark);
	expect(Object.keys(dark).length).toBeGreaterThan(40);
});
