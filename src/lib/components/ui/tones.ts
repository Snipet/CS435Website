import type { Tone } from './types';

export interface ToneColors {
	/** Strong color: strokes, underlines, outlines. */
	fg: string;
	/** Soft background. */
	bg: string;
	/**
	 * Text in the tone: `fg`, or a darker shade of it where `fg` is too light
	 * for text (the active tone, `--active-text`).
	 */
	text: string;
}

const semantic = (name: string, text = `var(--${name})`): ToneColors => ({
	fg: `var(--${name})`,
	bg: `var(--${name}-soft)`,
	text
});

const SEMANTIC: Record<Exclude<Tone, number>, ToneColors> = {
	active: semantic('active', 'var(--active-text)'),
	accept: semantic('accept'),
	reject: semantic('reject'),
	info: semantic('info'),
	epsilon: semantic('epsilon'),
	accent: semantic('accent'),
	muted: { fg: 'var(--text-3)', bg: 'var(--surface-3)', text: 'var(--text-3)' }
};

/** Index into the six-color token palette for any integer (negative numbers wrap too). */
export function paletteIndex(n: number): number {
	const i = Math.trunc(n) % 6;
	return i < 0 ? i + 6 : i;
}

/** CSS color values for a tone. */
export function toneColors(tone: Tone): ToneColors {
	if (typeof tone === 'number') {
		const i = Number.isFinite(tone) ? paletteIndex(tone) : 0;
		return { fg: `var(--tok-${i})`, bg: `var(--tok-${i}-soft)`, text: `var(--tok-${i})` };
	}
	return SEMANTIC[tone] ?? SEMANTIC.muted;
}

/** Inline style that sets `--tone-fg` / `--tone-bg` / `--tone-text` for a tone. */
export function toneStyle(tone: Tone): string {
	const { fg, bg, text } = toneColors(tone);
	return `--tone-fg: ${fg}; --tone-bg: ${bg}; --tone-text: ${text};`;
}
