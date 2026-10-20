/** Tone colors: strokes and fills in `fg`, text in `text` (darker for the active tone). */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Badge from './Badge.svelte';
import { paletteIndex, toneColors, toneStyle } from './tones';

describe('toneColors', () => {
	it('writes active text in --active-text, its strokes in --active', () => {
		expect(toneColors('active')).toEqual({
			fg: 'var(--active)',
			bg: 'var(--active-soft)',
			text: 'var(--active-text)'
		});
	});

	it('writes the other tones in their own color', () => {
		for (const tone of ['accept', 'reject', 'info', 'epsilon', 'accent'] as const)
			expect(toneColors(tone)).toEqual({
				fg: `var(--${tone})`,
				bg: `var(--${tone}-soft)`,
				text: `var(--${tone})`
			});
		expect(toneColors('muted')).toEqual({
			fg: 'var(--text-3)',
			bg: 'var(--surface-3)',
			text: 'var(--text-3)'
		});
		expect(toneColors(8)).toEqual({
			fg: 'var(--tok-2)',
			bg: 'var(--tok-2-soft)',
			text: 'var(--tok-2)'
		});
		expect(toneColors(Number.NaN).fg).toBe('var(--tok-0)');
		expect(paletteIndex(-1)).toBe(5);
	});

	it('sets the three custom properties', () => {
		expect(toneStyle('active')).toBe(
			'--tone-fg: var(--active); --tone-bg: var(--active-soft); --tone-text: var(--active-text);'
		);
		expect(toneStyle(1)).toBe(
			'--tone-fg: var(--tok-1); --tone-bg: var(--tok-1-soft); --tone-text: var(--tok-1);'
		);
	});
});

describe('Badge', () => {
	it('carries the text color of its tone', () => {
		const { body } = render(Badge, { props: { tone: 'active' } });
		expect(body).toContain('--tone-text: var(--active-text);');
		expect(body).toContain('--tone-fg: var(--active);');
	});

	it('keeps the neutral colors from its stylesheet', () => {
		const { body } = render(Badge, { props: {} });
		expect(body).not.toContain('--tone-');
		expect(body).toMatch(/class="badge soft neutral/);
	});
});
