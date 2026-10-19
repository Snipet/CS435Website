/**
 * The Venn diagram of grammar classes (Bottom-up Parsing III, slide 26) that
 * GrammarClasses.svelte draws, and where a grammar falls in it: the point its
 * `highlight` marker stands at, and the same in words.
 *
 * The diagram nests LR(k) ⊃ LR(1) ⊃ LALR(1) ⊃ SLR ⊃ LR(0) and crosses them
 * with LL(k) ⊃ LL(1) ⊃ LL(0); ambiguous grammars are in none of them.
 */

/** A class drawn as a rounded rectangle, in the diagram's 640 × 460 viewBox. */
export interface ClassRegion {
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Where the label stands. */
	lx: number;
	ly: number;
}

/** The LR classes, outermost first. */
export const LR_REGIONS: readonly ClassRegion[] = [
	{ label: 'LR(k)', x: 22, y: 54, width: 436, height: 390, lx: 352, ly: 84 },
	{ label: 'LR(1)', x: 36, y: 102, width: 408, height: 328, lx: 352, ly: 132 },
	{ label: 'LALR(1)', x: 50, y: 168, width: 380, height: 248, lx: 352, ly: 198 },
	{ label: 'SLR', x: 64, y: 222, width: 352, height: 180, lx: 352, ly: 252 },
	{ label: 'LR(0)', x: 78, y: 270, width: 300, height: 118, lx: 316, ly: 336 }
];

/** LL(k) and LL(1), drawn as tall ovals. */
export const LL_REGIONS: readonly ClassRegion[] = [
	{ label: 'LL(k)', x: 104, y: 64, width: 132, height: 346, lx: 170, ly: 90 },
	{ label: 'LL(1)', x: 118, y: 112, width: 104, height: 284, lx: 170, ly: 144 }
];

/** LL(0), an ellipse; its label stands at its center. */
export const LL0_REGION = { label: 'LL(0)', cx: 170, cy: 330, rx: 40, ry: 27 } as const;

/** The ambiguous grammars: right of the vertical line at x = 474. */
export const AMBIGUOUS_X = 474;

/** Corner radius: an LL class is an oval (half its width), an LR class a rounded rectangle. */
export const cornerRadius = (r: ClassRegion, oval: boolean): number =>
	oval ? Math.min(r.width, r.height) / 2 : Math.min(56, r.height / 2);

/** Whether a point lies inside a region (its rounded corners taken into account). */
export function insideRegion(r: ClassRegion, oval: boolean, p: { x: number; y: number }): boolean {
	if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height) return false;
	const c = cornerRadius(r, oval);
	const cx = Math.min(Math.max(p.x, r.x + c), r.x + r.width - c);
	const cy = Math.min(Math.max(p.y, r.y + c), r.y + r.height - c);
	return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= c * c;
}

/** Whether a point lies inside the LL(0) ellipse. */
export const insideLl0 = (p: { x: number; y: number }): boolean =>
	((p.x - LL0_REGION.cx) / LL0_REGION.rx) ** 2 + ((p.y - LL0_REGION.cy) / LL0_REGION.ry) ** 2 <= 1;

/** The smallest LR class drawn that a grammar is in. */
export type LrPlace = 'lr0' | 'slr' | 'lalr1' | 'lr1';
/** The smallest LL class drawn that a grammar is in. */
export type LlPlace = 'll0' | 'll1';

export interface GrammarPlace {
	/** The smallest LR class the grammar is in; null: not LR(1). */
	lr: LrPlace | null;
	/** LL(0) or LL(1); null: not LL(1). */
	ll: LlPlace | null;
	/** A string of the grammar has two parse trees. */
	ambiguous: boolean;
}

/** Radius of the marker's halo; the whole halo lies in the marked classes' band. */
export const MARKER_RADIUS = 8;

/** The y of each LR class's own band: below its top border, above the next class's. */
const LR_BAND: Record<LrPlace, number> = { lr1: 135, lalr1: 195, slr: 246, lr0: 300 };
/** The x of a point outside the LL ovals, right of them and left of the LR labels. */
const OUTSIDE_LL = 290;
/** The x of the LL ovals' axis. */
const LL_AXIS = 170;

/**
 * The point of the diagram where a grammar of this place falls, or null when
 * the diagram has no region for it: a grammar that is not LR(1) but not known
 * to be ambiguous (it may be LR(k) for a larger k), an LR(1) grammar called
 * ambiguous, or one placed in LL(1) but not in LR(1), LL(0) but not LR(0),
 * which happens only for a grammar with non-terminals that derive nothing.
 */
export function classPoint(place: GrammarPlace): { x: number; y: number } | null {
	if (place.lr === null) {
		if (place.ll !== null || !place.ambiguous) return null;
		return { x: 554, y: 250 };
	}
	if (place.ambiguous) return null;
	if (place.ll === 'll0') return place.lr === 'lr0' ? { x: LL_AXIS, y: 347 } : null;
	if (place.ll === 'll1') {
		// In the LL(1) oval: in the LR(0) band above the LL(0) ellipse, in the LR(1) band under
		// the LL(1) label.
		const y = place.lr === 'lr0' ? 287 : place.lr === 'lr1' ? 158 : LR_BAND[place.lr];
		return { x: LL_AXIS, y };
	}
	return { x: OUTSIDE_LL, y: LR_BAND[place.lr] };
}

const LR_TEXT: Record<LrPlace, string> = {
	lr0: 'LR(0)',
	slr: 'SLR but not LR(0)',
	lalr1: 'LALR(1) but not SLR',
	lr1: 'LR(1) but not LALR(1)'
};

/**
 * The place in words, for the diagram's accessible name: "Marked: a grammar
 * that is LALR(1) but not SLR, and not LL(1)." Empty when `classPoint` has no
 * point for it.
 */
export function placeText(place: GrammarPlace): string {
	if (classPoint(place) === null) return '';
	if (place.lr === null) return 'Marked: an ambiguous grammar.';
	const ll =
		place.ll === 'll0' ? 'LL(0)' : place.ll === 'll1' ? 'LL(1) but not LL(0)' : 'not LL(1)';
	return `Marked: a grammar that is ${LR_TEXT[place.lr]}, and ${ll}.`;
}
