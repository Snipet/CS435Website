import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import GrammarClasses from './GrammarClasses.svelte';
import {
	AMBIGUOUS_X,
	LL0_REGION,
	LL_REGIONS,
	LR_REGIONS,
	MARKER_RADIUS,
	classPoint,
	insideLl0,
	insideRegion,
	placeText,
	type GrammarPlace,
	type LlPlace,
	type LrPlace
} from './grammar-classes';

const LR: readonly LrPlace[] = ['lr0', 'slr', 'lalr1', 'lr1'];
/** Labels of the LR regions, outermost first, that a grammar of each place is in. */
const LR_LABELS: Record<LrPlace, string[]> = {
	lr1: ['LR(k)', 'LR(1)'],
	lalr1: ['LR(k)', 'LR(1)', 'LALR(1)'],
	slr: ['LR(k)', 'LR(1)', 'LALR(1)', 'SLR'],
	lr0: ['LR(k)', 'LR(1)', 'LALR(1)', 'SLR', 'LR(0)']
};
/** Labels of the LL regions a grammar of each LL place is in. */
const LL_LABELS: Record<'ll1' | 'llk' | 'none', string[]> = {
	ll1: ['LL(k)', 'LL(1)'],
	llk: ['LL(k)'],
	none: []
};

/** The classes a point of the diagram lies in. */
function classesAt(p: { x: number; y: number }) {
	return {
		lr: LR_REGIONS.filter((r) => insideRegion(r, false, p)).map((r) => r.label),
		ll: [
			...LL_REGIONS.filter((r) => insideRegion(r, true, p)).map((r) => r.label),
			...(insideLl0(p) ? ['LL(0)'] : [])
		],
		ambiguous: p.x > AMBIGUOUS_X
	};
}

/** The center and points around the marker's halo. */
const halo = (p: { x: number; y: number }) => [
	p,
	...Array.from({ length: 16 }, (_, i) => ({
		x: p.x + MARKER_RADIUS * Math.cos((i * Math.PI) / 8),
		y: p.y + MARKER_RADIUS * Math.sin((i * Math.PI) / 8)
	}))
];

/**
 * Rough box of a label with its baseline centered on (lx, ly), in monospace
 * of 15px (as drawn) or 18px (in a narrow box): 0.6em a character, 0.8em
 * above the baseline and 0.2em below.
 */
const labelBox = (label: string, lx: number, ly: number, size: 15 | 18) => ({
	x0: lx - (label.length * 0.6 * size) / 2,
	x1: lx + (label.length * 0.6 * size) / 2,
	y0: ly - 0.8 * size,
	y1: ly + 0.2 * size
});
const labels = ([15, 18] as const).flatMap((size) => [
	...[...LR_REGIONS, ...LL_REGIONS].map((r) => labelBox(r.label, r.lx, r.ly, size)),
	labelBox(LL0_REGION.label, LL0_REGION.cx, LL0_REGION.cy + 5, size)
]);

const places: GrammarPlace[] = [
	...LR.flatMap((lr) =>
		([null, 'll1', 'llk', 'none'] as (LlPlace | null)[]).map((ll) => ({
			lr,
			ll,
			ambiguous: false
		}))
	),
	{ lr: 'lr0', ll: 'll0', ambiguous: false },
	{ lr: null, ll: null, ambiguous: true },
	{ lr: null, ll: 'none', ambiguous: true }
];

describe('labels', () => {
	it('stand inside their own class and outside the next one in, at both sizes', () => {
		for (const size of [15, 18] as const)
			for (const [list, oval] of [
				[LR_REGIONS, false],
				[LL_REGIONS, true]
			] as const)
				list.forEach((r, i) => {
					const box = labelBox(r.label, r.lx, r.ly, size);
					const corners = [
						{ x: box.x0, y: box.y0 },
						{ x: box.x1, y: box.y0 },
						{ x: box.x0, y: box.y1 },
						{ x: box.x1, y: box.y1 }
					];
					const inner = list[i + 1];
					for (const c of corners) {
						expect(insideRegion(r, oval, c), `${r.label} at ${size}px`).toBe(true);
						if (inner) expect(insideRegion(inner, oval, c), `${r.label} at ${size}px`).toBe(false);
						else if (oval) expect(insideLl0(c)).toBe(false);
					}
				});
	});
});

describe('classPoint', () => {
	it('puts an LR(1) grammar in exactly its classes, inside LL(1), LL(k) or neither', () => {
		for (const lr of LR)
			for (const ll of ['ll1', 'llk', 'none'] as const) {
				const place: GrammarPlace = { lr, ll, ambiguous: false };
				const p = classPoint(place)!;
				expect(p, `${lr} ${ll}`).not.toBeNull();
				expect(p.x2).toBeUndefined();
				for (const q of halo(p)) {
					const at = classesAt(q);
					expect(at.lr, `${lr} ${ll}`).toEqual(LR_LABELS[lr]);
					expect(at.ll, `${lr} ${ll}`).toEqual(LL_LABELS[ll]);
					expect(at.ambiguous).toBe(false);
				}
			}
	});

	it('marks a grammar whose LL(k) membership is not decided by a bar across the LL(k) border', () => {
		for (const lr of LR) {
			const p = classPoint({ lr, ll: null, ambiguous: false })!;
			expect(p.x2, lr).toBeGreaterThan(p.x);
			// One end inside LL(k) and not LL(1), the other outside both.
			for (const q of halo(p)) expect(classesAt(q).ll, lr).toEqual(['LL(k)']);
			for (const q of halo({ x: p.x2!, y: p.y })) expect(classesAt(q).ll, lr).toEqual([]);
			// The whole bar stays in the grammar's LR classes and out of LL(1).
			for (let x = p.x - MARKER_RADIUS; x <= p.x2! + MARKER_RADIUS; x += 2)
				for (const y of [p.y - MARKER_RADIUS, p.y, p.y + MARKER_RADIUS]) {
					const at = classesAt({ x, y });
					expect(at.lr, `${lr} at ${x}, ${y}`).toEqual(LR_LABELS[lr]);
					expect(at.ll).not.toContain('LL(1)');
				}
		}
	});

	it('puts an LL(0) grammar in the LL(0) ellipse inside LR(0)', () => {
		const p = classPoint({ lr: 'lr0', ll: 'll0', ambiguous: false })!;
		for (const q of halo(p)) {
			const at = classesAt(q);
			expect(at.lr).toEqual(LR_LABELS.lr0);
			expect(at.ll).toEqual(['LL(k)', 'LL(1)', 'LL(0)']);
		}
		expect(classPoint({ lr: 'slr', ll: 'll0', ambiguous: false })).toBeNull();
	});

	it('puts an ambiguous grammar among the ambiguous grammars', () => {
		for (const ll of [null, 'none'] as const) {
			const p = classPoint({ lr: null, ll, ambiguous: true })!;
			for (const q of halo(p)) {
				const at = classesAt(q);
				expect(at).toEqual({ lr: [], ll: [], ambiguous: true });
			}
		}
	});

	it('keeps the marker clear of every label, at both label sizes', () => {
		for (const place of places) {
			const p = classPoint(place)!;
			const x1 = p.x2 ?? p.x;
			for (const box of labels) {
				const clear =
					x1 + MARKER_RADIUS < box.x0 ||
					p.x - MARKER_RADIUS > box.x1 ||
					p.y + MARKER_RADIUS < box.y0 ||
					p.y - MARKER_RADIUS > box.y1;
				expect(clear, `${JSON.stringify(place)} and ${JSON.stringify(box)}`).toBe(true);
			}
		}
	});

	it('has no point for what the diagram cannot place', () => {
		// Not LR(1) and not known to be ambiguous: it may be LR(k) for a larger k.
		expect(classPoint({ lr: null, ll: null, ambiguous: false })).toBeNull();
		// LL(1) without LR(1), or LR(1) and ambiguous: only grammars with useless non-terminals.
		expect(classPoint({ lr: null, ll: 'll1', ambiguous: true })).toBeNull();
		expect(classPoint({ lr: null, ll: 'llk', ambiguous: true })).toBeNull();
		expect(classPoint({ lr: 'lr1', ll: null, ambiguous: true })).toBeNull();
	});
});

describe('placeText', () => {
	it('says where the marker stands', () => {
		expect(placeText({ lr: 'lalr1', ll: 'none', ambiguous: false })).toBe(
			'Marked: a grammar that is LALR(1) but not SLR, and not LL(k).'
		);
		expect(placeText({ lr: 'slr', ll: 'll1', ambiguous: false })).toBe(
			'Marked: a grammar that is SLR but not LR(0), and LL(1) but not LL(0).'
		);
		expect(placeText({ lr: 'lr0', ll: 'll0', ambiguous: false })).toBe(
			'Marked: a grammar that is LR(0), and LL(0).'
		);
		expect(placeText({ lr: 'lr1', ll: 'llk', ambiguous: false })).toBe(
			'Marked: a grammar that is LR(1) but not LALR(1), and LL(k) but not LL(1).'
		);
		expect(placeText({ lr: 'lr1', ll: null, ambiguous: false })).toBe(
			'Marked: a grammar that is LR(1) but not LALR(1), and not LL(1); whether it is LL(k) is not decided.'
		);
		expect(placeText({ lr: null, ll: null, ambiguous: true })).toBe(
			'Marked: an ambiguous grammar.'
		);
		expect(placeText({ lr: null, ll: null, ambiguous: false })).toBe('');
	});
});

describe('GrammarClasses', () => {
	it('draws the diagram without a marker by default', () => {
		const { body } = render(GrammarClasses);
		for (const label of ['LR(k)', 'LR(1)', 'LALR(1)', 'SLR', 'LR(0)', 'LL(k)', 'LL(1)', 'LL(0)'])
			expect(body).toContain(`>${label}</text>`);
		expect(body).not.toContain('class="marker"');
		expect(body).not.toContain('Marked:');
	});

	it('marks where a grammar falls and names it', () => {
		const { body } = render(GrammarClasses, {
			props: { highlight: { lr: 'lalr1', ll: 'none', ambiguous: false } }
		});
		expect(body).toContain('class="marker"');
		expect(body.match(/class="dot[ "]/g)).toHaveLength(1);
		expect(body).toContain('Marked: a grammar that is LALR(1) but not SLR, and not LL(k).');
		const none = render(GrammarClasses, {
			props: { highlight: { lr: null, ll: null, ambiguous: false } }
		}).body;
		expect(none).not.toContain('class="marker"');
	});

	it('draws a bar with a dot at either end when LL(k) is not decided', () => {
		const { body } = render(GrammarClasses, {
			props: { highlight: { lr: 'lr1', ll: null, ambiguous: false } }
		});
		expect(body).toContain('class="halo undecided');
		expect(body).toContain('class="bar');
		expect(body.match(/class="dot[ "]/g)).toHaveLength(2);
		expect(body).toContain('whether it is LL(k) is not decided.');
	});

	it('scales with its box instead of scrolling', () => {
		const { body } = render(GrammarClasses);
		expect(body).not.toMatch(/min-width/);
	});
});
