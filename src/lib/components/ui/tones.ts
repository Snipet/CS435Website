import type { Tone } from './types';

export interface ToneColors {
	/** Strong color: text, strokes, underlines. */
	fg: string;
	/** Soft background. */
	bg: string;
}

const SEMANTIC: Record<Exclude<Tone, number>, ToneColors> = {
	active: { fg: 'var(--active)', bg: 'var(--active-soft)' },
	accept: { fg: 'var(--accept)', bg: 'var(--accept-soft)' },
	reject: { fg: 'var(--reject)', bg: 'var(--reject-soft)' },
	info: { fg: 'var(--info)', bg: 'var(--info-soft)' },
	epsilon: { fg: 'var(--epsilon)', bg: 'var(--epsilon-soft)' },
	accent: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
	muted: { fg: 'var(--text-3)', bg: 'var(--surface-3)' }
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
		return { fg: `var(--tok-${i})`, bg: `var(--tok-${i}-soft)` };
	}
	return SEMANTIC[tone] ?? SEMANTIC.muted;
}

/** Inline style that sets `--tone-fg` / `--tone-bg` for a tone. */
export function toneStyle(tone: Tone): string {
	const { fg, bg } = toneColors(tone);
	return `--tone-fg: ${fg}; --tone-bg: ${bg};`;
}
