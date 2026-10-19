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

/** Rough box of a label: 15px monospace, about 9px a character, centered on (lx, ly). */
const labelBox = (label: string, lx: number, ly: number) => ({
	x0: lx - (label.length * 9) / 2,
	x1: lx + (label.length * 9) / 2,
	y0: ly - 12,
	y1: ly + 3
});
const labels = [
	...[...LR_REGIONS, ...LL_REGIONS].map((r) => labelBox(r.label, r.lx, r.ly)),
	labelBox(LL0_REGION.label, LL0_REGION.cx, LL0_REGION.cy + 5)
];

describe('classPoint', () => {
	it('puts an LR(1) grammar in exactly its classes, inside or outside the LL ovals', () => {
		for (const lr of LR)
			for (const ll of [null, 'll1'] as (LlPlace | null)[]) {
				const place: GrammarPlace = { lr, ll, ambiguous: false };
				const p = classPoint(place)!;
				expect(p, `${lr} ${ll}`).not.toBeNull();
				for (const q of halo(p)) {
					const at = classesAt(q);
					expect(at.lr, `${lr} ${ll}`).toEqual(LR_LABELS[lr]);
					expect(at.ll, `${lr} ${ll}`).toEqual(ll ? ['LL(k)', 'LL(1)'] : []);
					expect(at.ambiguous).toBe(false);
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
		const p = classPoint({ lr: null, ll: null, ambiguous: true })!;
		for (const q of halo(p)) {
			const at = classesAt(q);
			expect(at).toEqual({ lr: [], ll: [], ambiguous: true });
		}
	});

	it('keeps the marker clear of every label', () => {
		const places: GrammarPlace[] = [
			...LR.flatMap((lr) =>
				[null, 'll1'].map((ll) => ({ lr, ll: ll as LlPlace | null, ambiguous: false }))
			),
			{ lr: 'lr0', ll: 'll0', ambiguous: false },
			{ lr: null, ll: null, ambiguous: true }
		];
		for (const place of places) {
			const p = classPoint(place)!;
			for (const box of labels) {
				const clear =
					p.x + MARKER_RADIUS < box.x0 ||
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
		expect(classPoint({ lr: 'lr1', ll: null, ambiguous: true })).toBeNull();
	});
});

describe('placeText', () => {
	it('says where the marker stands', () => {
		expect(placeText({ lr: 'lalr1', ll: null, ambiguous: false })).toBe(
			'Marked: a grammar that is LALR(1) but not SLR, and not LL(1).'
		);
		expect(placeText({ lr: 'slr', ll: 'll1', ambiguous: false })).toBe(
			'Marked: a grammar that is SLR but not LR(0), and LL(1) but not LL(0).'
		);
		expect(placeText({ lr: 'lr0', ll: 'll0', ambiguous: false })).toBe(
			'Marked: a grammar that is LR(0), and LL(0).'
		);
		expect(placeText({ lr: 'lr1', ll: null, ambiguous: false })).toBe(
			'Marked: a grammar that is LR(1) but not LALR(1), and not LL(1).'
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
			props: { highlight: { lr: 'lalr1', ll: null, ambiguous: false } }
		});
		expect(body).toContain('class="marker"');
		expect(body).toContain('Marked: a grammar that is LALR(1) but not SLR, and not LL(1).');
		const none = render(GrammarClasses, {
			props: { highlight: { lr: null, ll: null, ambiguous: false } }
		}).body;
		expect(none).not.toContain('class="marker"');
	});
});
