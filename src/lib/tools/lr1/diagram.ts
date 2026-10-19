/**
 * The parsing DFA as the tool draws it: which states are drawn (all of them,
 * or a window of a large automaton), the labels beside each state (Bottom-up
 * Parsing III, slide 12: "reduce with X → α on b", and "accept on $"), the
 * sizes the item-set layout starts from before the page measures the boxes,
 * and the circle drawing of Bottom-up Parsing II, slide 17 as an `Automaton`
 * for `AutomatonView`, with the circles placed in rows as on that slide.
 */
import {
	annotationText,
	formatItem,
	stateAnnotations,
	symbolText,
	type ItemView,
	type StateAnnotation
} from '$lib/components/grammar/lr-item';
import { NOTE_FONT_SIZE, STATE_RADIUS, stateShape, textWidth } from '$lib/components/graph/layout';
import { CharSet } from '$lib/theory/charset';
import type { Automaton, Positions, State, StateId, Transition } from '$lib/theory/automata/types';
import { followSets } from '$lib/theory/grammar/analyze';
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import { END_MARKER } from '$lib/theory/grammar/types';
import type { Method } from './build';
import { itemLines, itemView, type ItemForm } from './items';
import type { StateRange } from './range';

export {
	DRAW_ALL,
	MAX_RANGE,
	WINDOW,
	inRange,
	rangeWith,
	shownRange,
	windowAround,
	type StateRange
} from './range';

/**
 * The labels beside each state. LR(1) and LALR(1) states reduce on the
 * lookaheads of their items, an LR(0) state on every token (no "on"), and an
 * SLR(1) state on Follow(X) of the left side X. The augmented start item reads
 * "accept on $" ("accept" for LR(0)).
 */
export function stateNotes(a: LrAutomaton, method: Method): StateAnnotation[][] {
	const aug = a.augmented;
	if (method !== 'slr1')
		return a.states.map((s) =>
			stateAnnotations(
				s.items.map((item) => itemView(aug, item)),
				{ start: aug.start }
			)
		);
	const follow = followSets(aug.grammar);
	const rank = new Map(aug.grammar.terminals.map((t, i) => [t, i]));
	const ordered = (set: ReadonlySet<string>) =>
		[...set].sort((x, y) =>
			x === END_MARKER ? -1 : y === END_MARKER ? 1 : (rank.get(x) ?? 0) - (rank.get(y) ?? 0)
		);
	return a.states.map((s) =>
		s.reduces
			.map((r): StateAnnotation => ({
				kind: 'reduce',
				lhs: aug.productions[r.production].lhs,
				rhs: aug.productions[r.production].rhs,
				lookaheads: ordered(follow.get(aug.productions[r.production].lhs) ?? new Set())
			}))
			.concat(s.accept ? [{ kind: 'accept', lookaheads: [END_MARKER] }] : [])
	);
}

/** Estimated width in px of `chars` characters of the monospace font at `size` px. */
export const monoWidth = (chars: number, size = 14) => Math.ceil(chars * size * 0.6);

/** A line of LrState's item box: 14 px text at line height 1.6, and 1 px padding above and below. */
const LINE = 14 * 1.6 + 2;

/**
 * The size of a state box before the page measures it: the item box (one
 * line per item, LrState's padding and border) with the number box beside
 * it, and the labels beside that.
 */
export function estimateBox(
	lines: readonly ItemView[],
	notes: readonly string[]
): { width: number; height: number; note: { width: number; height: number } | null } {
	let longest = 1;
	for (const v of lines) longest = Math.max(longest, [...formatItem(v, 'compact')].length);
	const items = monoWidth(longest) + 2 * 10 + 3 + 3;
	const height = Math.max(31, lines.length * LINE + 12 + 3);
	let noteWidth = 0;
	for (const t of notes) noteWidth = Math.max(noteWidth, monoWidth([...t].length));
	return {
		width: items + 8 + 31,
		height: Math.ceil(height),
		note: notes.length ? { width: noteWidth, height: Math.ceil(notes.length * 21) } : null
	};
}

/** The item views of a state's box: one line per item, or per core with merged lookaheads. */
export function boxLines(a: LrAutomaton, state: number, form: ItemForm): ItemView[] {
	return itemLines(a.augmented, a.states[state].items, form).map((l) => l.view);
}

/** One private-use code point per grammar symbol, so `AutomatonView` can tell edge labels apart. */
const SYMBOL_BASE = 0xe000;

export interface CircleDrawing {
	automaton: Automaton;
	/** Automaton state id → LR state number. */
	states: number[];
	/** Automaton transition id → index in `LrAutomaton.edges`. */
	edges: number[];
}

/**
 * The states in `range` as numbered circles (Bottom-up Parsing II, slide 17):
 * no double circles, the start arrow into state 0 when it is drawn, edges
 * labeled with their grammar symbol, and each state's labels as its note.
 * Edges to states outside the range are left out.
 */
export function circleDrawing(
	a: LrAutomaton,
	notes: readonly StateAnnotation[][],
	range: StateRange,
	made: { states: number; edges: number } = { states: a.states.length, edges: a.edges.length }
): CircleDrawing {
	const last = Math.min(range[1], made.states - 1);
	const ids: number[] = [];
	for (let s = range[0]; s <= last; s++) ids.push(s);
	const idOf = new Map(ids.map((s, k) => [s, k]));
	const symbols = [
		...a.augmented.grammar.terminals,
		END_MARKER,
		...a.augmented.grammar.nonterminals
	];
	const symbolIndex = new Map(symbols.map((s, i) => [s, i]));
	const states: State[] = ids.map((s, k) => {
		const text = notes[s]?.map(annotationText).join('; ') ?? '';
		return { id: k, name: String(s), accepting: false, ...(text ? { note: text } : {}) };
	});
	const transitions: Transition[] = [];
	const edges: number[] = [];
	a.edges.slice(0, made.edges).forEach((e, k) => {
		const from = idOf.get(e.from);
		const to = idOf.get(e.to);
		if (from === undefined || to === undefined) return;
		const code = SYMBOL_BASE + (symbolIndex.get(e.symbol) ?? symbols.length);
		transitions.push({
			id: transitions.length,
			from,
			to,
			label: CharSet.single(code),
			display: symbolText(e.symbol)
		});
		edges.push(k);
	});
	// No start arrow unless state 0 is drawn (an id that is no state draws none).
	const start = idOf.get(0) ?? -1;
	return { automaton: { states, transitions, start }, states: ids, edges };
}

/** Room between two columns and between two rows of circles, for the edges and their labels. */
const CIRCLE_GAP_X = 64;
const CIRCLE_GAP_Y = 56;
/** How far a self-loop and its label reach above a circle. */
const LOOP_ROOM = 52;

export interface CirclePlacement {
	/** The states of each row, left to right (automaton state ids). */
	rows: StateId[][];
	/** The center of each state. */
	positions: Positions;
	/** The size of the drawing, notes included (without the start arrow). */
	width: number;
	height: number;
}

/**
 * Places the circles in rows, as Bottom-up Parsing II, slide 17 draws its 12
 * states. A row starts with the first state not yet placed (states are made
 * breadth first, so this is creation order) and goes on to the right with the
 * first state not yet placed that the last one has an edge to, until a state
 * has none or the row holds `columns` states; a longer chain goes on in the
 * next row. A state with no edges out ends its row, so the label `AutomatonView`
 * writes on its right never lies between two states of a row. Each row after
 * the first starts in the column that keeps its edges to the rows above short
 * and clear of the states and labels there. For E → E + ( E ) | int the rows
 * are 0 1 | 2 3 4 5 | 6 7 | 8 9 10 11, the last two starting under 4 and 3.
 */
export function placeCircles(a: Automaton, columns: number): CirclePlacement {
	const k = Math.max(1, Math.trunc(columns) || 1);
	const out = new Map<StateId, StateId[]>(a.states.map((s) => [s.id, []]));
	const loops = new Set<StateId>();
	for (const t of a.transitions) {
		if (t.from === t.to) loops.add(t.from);
		else out.get(t.from)?.push(t.to);
	}
	const placed = new Set<StateId>();
	const rows: StateId[][] = [];
	for (const s of a.states) {
		if (placed.has(s.id)) continue;
		let row: StateId[] = [];
		let at: StateId | undefined = s.id;
		while (at !== undefined) {
			if (row.length === k) {
				rows.push(row);
				row = [];
			}
			row.push(at);
			placed.add(at);
			at = (out.get(at) ?? []).find((v) => !placed.has(v));
		}
		rows.push(row);
	}

	// What each state takes up around its center: the circle, a loop above, its note.
	const byId = new Map(a.states.map((s) => [s.id, s]));
	const noteRight = (id: StateId) => {
		const s = byId.get(id)!;
		return s.note && (out.get(id)?.length ?? 0) === 0 ? textWidth(s.note, NOTE_FONT_SIZE) : 0;
	};

	// Each row after the first starts in the column that keeps its edges to the rows above
	// short (straight down when it can) and clear of the states and labels there.
	const rowOf = new Map<StateId, number>();
	const colOf = new Map<StateId, number>();
	/** About one column per state width plus the gap. */
	const unit = 2 * STATE_RADIUS + CIRCLE_GAP_X;
	const blocked = (from: StateId, to: StateId): boolean => {
		const [r1, c1, r2, c2] = [rowOf.get(from)!, colOf.get(from)!, rowOf.get(to)!, colOf.get(to)!];
		for (const [id, rp] of rowOf) {
			if (id === from || id === to) continue;
			const cp = colOf.get(id)!;
			if (r1 === r2) {
				if (rp === r1 && cp > Math.min(c1, c2) && cp < Math.max(c1, c2)) return true;
				continue;
			}
			if (rp <= Math.min(r1, r2) || rp >= Math.max(r1, r2)) continue;
			const x = c1 + ((c2 - c1) * (rp - r1)) / (r2 - r1);
			const reach = noteRight(id) > 0 ? 0.3 + (8 + noteRight(id)) / unit : 0.45;
			if (x > cp - 0.45 && x < cp + reach) return true;
		}
		return false;
	};
	const links = a.transitions.filter((t) => t.from !== t.to);
	rows.forEach((row, r) => {
		let best = 0;
		let bestCost = Infinity;
		for (let start = 0; start === 0 || start + row.length <= k; start++) {
			row.forEach((id, i) => {
				rowOf.set(id, r);
				colOf.set(id, start + i);
			});
			let cost = 0;
			for (const t of links) {
				const here = rowOf.get(t.from) === r;
				const there = rowOf.get(t.to) === r;
				if (here === there) continue;
				const other = here ? t.to : t.from;
				if (!rowOf.has(other) || rowOf.get(other)! > r) continue;
				cost += Math.abs(colOf.get(t.from)! - colOf.get(t.to)!);
				if (blocked(t.from, t.to)) cost += 100;
			}
			if (cost < bestCost) {
				bestCost = cost;
				best = start;
			}
		}
		row.forEach((id, i) => colOf.set(id, best + i));
	});
	const extent = (id: StateId) => {
		const s = byId.get(id)!;
		const r = stateShape(s.name).rx;
		const noteWidth = s.note ? textWidth(s.note, NOTE_FONT_SIZE) : 0;
		const below = !!s.note && (out.get(id)?.length ?? 0) > 0;
		return {
			left: below ? Math.max(r, noteWidth / 2) : r,
			// A note on the right only ends a row; it widens no column.
			right: below ? Math.max(r, noteWidth / 2) : r,
			note: !below && s.note ? r + 8 + noteWidth : 0,
			up: loops.has(id) ? Math.max(r, LOOP_ROOM) : r,
			down: below ? r + 5 + NOTE_FONT_SIZE + 6 : r
		};
	};
	let cols = 0;
	for (const c of colOf.values()) cols = Math.max(cols, c + 1);
	const colLeft = new Array<number>(cols).fill(STATE_RADIUS);
	const colRight = new Array<number>(cols).fill(STATE_RADIUS);
	for (const row of rows)
		for (const id of row) {
			const e = extent(id);
			const c = colOf.get(id)!;
			colLeft[c] = Math.max(colLeft[c], e.left);
			colRight[c] = Math.max(colRight[c], e.right);
		}
	const xs: number[] = [];
	for (let c = 0; c < cols; c++)
		xs.push(c === 0 ? colLeft[0] : xs[c - 1] + colRight[c - 1] + CIRCLE_GAP_X + colLeft[c]);
	const positions: Positions = new Map();
	let y = 0;
	let width = 0;
	let height = 0;
	rows.forEach((row, r) => {
		const es = row.map(extent);
		const up = Math.max(...es.map((e) => e.up));
		const down = Math.max(...es.map((e) => e.down));
		const cy = (r === 0 ? 0 : y + CIRCLE_GAP_Y) + up;
		row.forEach((id, i) => {
			const x = xs[colOf.get(id)!];
			positions.set(id, { x, y: cy });
			width = Math.max(width, x + Math.max(es[i].right, es[i].note));
		});
		y = cy + down;
		height = y;
	});
	return { rows, positions, width, height };
}

/**
 * The most states a row of `placeCircles` holds, from 2 to 6, for a drawing
 * that is to fit `width` px at its natural size (4 when the width is not known).
 */
export function circleColumns(a: Automaton, width: number): number {
	if (!(width > 0)) return 4;
	for (let k = 6; k > 2; k--) if (placeCircles(a, k).width <= width) return k;
	return 2;
}
