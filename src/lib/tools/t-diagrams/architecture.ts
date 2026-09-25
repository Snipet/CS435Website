/**
 * The retargetable compiler of Intro (cont’d), slide 6: one frontend per
 * source language, one common optimizer, one backend per target ISA. With m
 * languages and n targets that is m + 1 + n components, against m × n
 * separate compilers.
 */
import type { Point } from './geometry';

/** Frontends on the slide. */
export const SLIDE_LANGUAGES: readonly string[] = ['C', 'Fortran', 'Ada'];
/** Backends on the slide. */
export const SLIDE_TARGETS: readonly string[] = ['X86', 'PowerPC', 'ARM'];

/** Most languages (and most targets) the diagram draws. */
export const MAX_ENDS = 8;
/** Longest language or target name. */
export const MAX_END_NAME = 16;

export interface Counts {
	/** m × n: a compiler for every language and target pair. */
	separate: number;
	/** m + 1 + n: frontends, the common optimizer, and backends. */
	components: number;
}

export function counts(languages: number, targets: number): Counts {
	return { separate: languages * targets, components: languages + 1 + targets };
}

/** Adds a name to a list; returns the new list or why not. */
export function addEnd(
	list: readonly string[],
	name: string
): { ok: true; list: string[] } | { ok: false; error: string } {
	const clean = name.trim().replace(/\s+/g, ' ');
	if (!clean) return { ok: false, error: 'Type a name first.' };
	if ([...clean].length > MAX_END_NAME) {
		return { ok: false, error: `Names are at most ${MAX_END_NAME} characters.` };
	}
	if (list.some((x) => x.toLowerCase() === clean.toLowerCase())) {
		return { ok: false, error: `${clean} is already listed.` };
	}
	if (list.length >= MAX_ENDS) return { ok: false, error: `Up to ${MAX_ENDS} can be listed.` };
	return { ok: true, list: [...list, clean] };
}

/** Clean names from saved state: trimmed, non-empty, unique, within the limits. */
export function sanitizeEnds(value: unknown, fallback: readonly string[]): string[] {
	if (!Array.isArray(value)) return [...fallback];
	let list: string[] = [];
	for (const v of value) {
		if (typeof v !== 'string') continue;
		const clean = [...v.trim().replace(/\s+/g, ' ')].slice(0, MAX_END_NAME).join('');
		const next = addEnd(list, clean);
		if (next.ok) list = next.list;
	}
	return list.length ? list : [...fallback];
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
	lines: string[];
}

export interface Arrow {
	from: Point;
	to: Point;
}

export interface ArchLayout {
	width: number;
	height: number;
	/** Language names left of the frontends (end-anchored at x). */
	inputs: { at: Point; text: string }[];
	frontends: Box[];
	optimizer: Box;
	backends: Box[];
	/** Target names right of the backends (start-anchored at x). */
	outputs: { at: Point; text: string }[];
	arrows: Arrow[];
}

/** Font size of the diagram's text, in px. */
export const ARCH_FONT = 13;
/** Average advance of the sans-serif UI font, in em. */
const SANS_ADVANCE = 0.56;
const BOX_H = 40;
const ROW_GAP = 14;
const LEAD = 30;
const FAN = 64;
const MIN_BOX = 124;
const OPT_W = 118;

const textWidth = (s: string) => [...s].length * ARCH_FONT * SANS_ADVANCE;

/** Positions for slide 6's diagram with the given languages and targets. */
export function archLayout(languages: readonly string[], targets: readonly string[]): ArchLayout {
	const inW = Math.ceil(Math.max(0, ...languages.map(textWidth)));
	const outW = Math.ceil(Math.max(0, ...targets.map(textWidth)));
	const fw = Math.ceil(Math.max(MIN_BOX, ...languages.map((s) => textWidth(`${s} Frontend`) + 24)));
	const bw = Math.ceil(Math.max(MIN_BOX, ...targets.map((s) => textWidth(`${s} Backend`) + 24)));
	const rows = Math.max(languages.length, targets.length, 1);
	const height = rows * BOX_H + (rows - 1) * ROW_GAP;
	const column = (count: number, i: number) => {
		const block = count * BOX_H + (count - 1) * ROW_GAP;
		return (height - block) / 2 + i * (BOX_H + ROW_GAP);
	};

	const fx = inW + LEAD;
	const ox = fx + fw + FAN;
	const bx = ox + OPT_W + FAN;
	const outX = bx + bw + LEAD;
	const mid = height / 2;
	const optH = Math.max(BOX_H + 12, Math.min(height, 64));
	const optimizer: Box = {
		x: ox,
		y: mid - optH / 2,
		width: OPT_W,
		height: optH,
		lines: ['Common', 'Optimizer']
	};

	const spread = (count: number, i: number) => (count > 1 ? (i - (count - 1) / 2) * 5 : 0);
	const arrows: Arrow[] = [];
	const inputs: ArchLayout['inputs'] = [];
	const outputs: ArchLayout['outputs'] = [];
	const frontends: Box[] = languages.map((name, i) => {
		const y = column(languages.length, i);
		const cy = y + BOX_H / 2;
		inputs.push({ at: { x: inW, y: cy }, text: name });
		arrows.push({ from: { x: inW + 5, y: cy }, to: { x: fx - 3, y: cy } });
		arrows.push({
			from: { x: fx + fw, y: cy },
			to: { x: ox - 3, y: mid + spread(languages.length, i) }
		});
		return { x: fx, y, width: fw, height: BOX_H, lines: [`${name} Frontend`] };
	});
	const backends: Box[] = targets.map((name, i) => {
		const y = column(targets.length, i);
		const cy = y + BOX_H / 2;
		arrows.push({
			from: { x: ox + OPT_W, y: mid + spread(targets.length, i) },
			to: { x: bx - 3, y: cy }
		});
		arrows.push({ from: { x: bx + bw, y: cy }, to: { x: outX - 5, y: cy } });
		outputs.push({ at: { x: outX, y: cy }, text: name });
		return { x: bx, y, width: bw, height: BOX_H, lines: [`${name} Backend`] };
	});

	return {
		width: outX + outW,
		height,
		inputs,
		frontends,
		optimizer,
		backends,
		outputs,
		arrows
	};
}
