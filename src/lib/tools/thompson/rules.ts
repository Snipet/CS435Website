/**
 * The construction rule behind each step, drawn the way Lexical Analysis IV
 * draws it (slides 3–5): an operand's machine is an ellipse labeled A or B
 * with its start on the left edge and its one final state inside on the
 * right; new states are circles, the new final is double-circled. Derived
 * forms show their expansion (docs/ARCHITECTURE.md §3.9).
 *
 * `ruleCard` returns plain geometry (user units, y down) so the drawing is
 * unit-tested; RuleCard.svelte only renders it.
 */
import type { Citation } from '$lib/lectures';
import { letterName } from '$lib/theory/automata';
import { formatClass, formatLabel } from '$lib/theory/chars';
import type { Regex } from '$lib/theory/regex';
import { childSteps, exprText, repeatText, shorten, sup, type Construction } from './construction';

export interface Pt {
	x: number;
	y: number;
}

export interface FigState extends Pt {
	r: number;
	accepting: boolean;
}

export interface FigBox {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	label: string;
	/** The operand's final state, inside the ellipse on the right. */
	final: FigState;
}

export interface FigEdge {
	/** SVG path data; the path ends at the target's outline (an arrowhead goes there). */
	d: string;
	kind: 'eps' | 'sym' | 'start';
	label?: string;
	/** Label center. */
	lx?: number;
	ly?: number;
}

export interface RuleFigure {
	viewBox: { x: number; y: number; width: number; height: number };
	states: FigState[];
	boxes: FigBox[];
	edges: FigEdge[];
	/** Free text such as the "…" standing for elided copies. */
	texts: (Pt & { text: string })[];
}

/** A transition in slide notation: from →symbol to. */
export type RuleEdge = readonly [from: string, symbol: string, to: string];

/** What one of the rule's letters stands for in this step, e.g. A = (1 | 0). */
export interface RuleBinding {
	name: string;
	text: string;
}

/** Stands for the entries left out of a long list (the middle of a row of operands). */
export const ELIDED = '…';
export type Elided = typeof ELIDED;

export interface RuleCardModel {
	/** Clause name, as on the slides. */
	clause: string;
	/** The rule's expression, e.g. "A | B", or the expansion of a derived form, e.g. "A+ = A A*". */
	formula: string;
	/** The formula is literal text (a class, a definition name) rather than a rule. */
	mono?: boolean;
	figure: RuleFigure;
	/** New states the rule makes (s, f), if any. */
	fresh: string[];
	/** Transitions the rule adds, in the order it adds them; long rows keep the first two and the last. */
	adds: (RuleEdge | Elided)[];
	notes: string[];
	/** What the rule's letters stand for in this step, e.g. A = (1 | 0), B = 1; long lists are elided like `adds`. */
	bindings: (RuleBinding | Elided)[];
	/** Slide that states the rule; derived forms have none. */
	cite?: Citation;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const R = 12;
const RING = 3.5;
const FINAL_R = 7;
const BOX_RY = 22;
const START_LEN = 26;
const GAP = 50;
const CHAR = 7.4;
const LABEL_H = 14;
const MARGIN = 8;

const textWidth = (s: string) => [...s].length * CHAR;
const outer = (s: FigState) => s.r + (s.accepting ? RING : 0);
const fmt = (n: number) => String(Math.round(n * 10) / 10);

function toward(from: Pt, to: Pt, dist: number): Pt {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const len = Math.hypot(dx, dy) || 1;
	return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
}

class Figure {
	states: FigState[] = [];
	boxes: FigBox[] = [];
	edges: FigEdge[] = [];
	texts: (Pt & { text: string })[] = [];

	state(x: number, y: number, accepting = false): FigState {
		const s = { x, y, r: R, accepting };
		this.states.push(s);
		return s;
	}

	/** An operand's machine; `left` is the x of its left edge. */
	box(left: number, cy: number, label: string, accepting = false): FigBox {
		const rx = Math.max(42, textWidth(label) / 2 + 32);
		const cx = left + rx;
		const b: FigBox = {
			cx,
			cy,
			rx,
			ry: BOX_RY,
			label,
			final: { x: cx + rx - 17, y: cy, r: FINAL_R, accepting }
		};
		this.boxes.push(b);
		return b;
	}

	startInto(p: Pt): void {
		this.edges.push({
			d: `M${fmt(p.x - START_LEN)} ${fmt(p.y)}L${fmt(p.x)} ${fmt(p.y)}`,
			kind: 'start'
		});
	}

	/** Straight edge; the label sits beside the midpoint, on the side `side` points to. */
	line(a: Pt, b: Pt, kind: 'eps' | 'sym', label: string, side: -1 | 1 = -1): void {
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		// Unit normal pointing up (for side -1) on a left-to-right edge.
		let nx = dy / len;
		let ny = -dx / len;
		if (side === 1) {
			nx = -nx;
			ny = -ny;
		}
		const off = 10;
		this.edges.push({
			d: `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`,
			kind,
			label,
			lx: mx + nx * off,
			ly: my + ny * off
		});
	}

	curve(a: Pt, c1: Pt, c2: Pt, b: Pt, label: string, at: Pt): void {
		this.edges.push({
			d: `M${fmt(a.x)} ${fmt(a.y)}C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(b.x)} ${fmt(b.y)}`,
			kind: 'eps',
			label,
			lx: at.x,
			ly: at.y
		});
	}

	/** From one state's outline to another's. */
	join(from: FigState, to: FigState, kind: 'eps' | 'sym', label: string, side: -1 | 1 = -1): void {
		this.line(toward(from, to, outer(from)), toward(to, from, outer(to)), kind, label, side);
	}

	/** From a state (or an operand's final) to an operand's start on its left edge. */
	enter(from: FigState, box: FigBox, side: -1 | 1 = -1): void {
		const target = { x: box.cx - box.rx, y: box.cy };
		this.line(toward(from, target, outer(from)), target, 'eps', 'ε', side);
	}

	result(): RuleFigure {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		const add = (x: number, y: number) => {
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		};
		for (const s of this.states) {
			add(s.x - outer(s), s.y - outer(s));
			add(s.x + outer(s), s.y + outer(s));
		}
		for (const b of this.boxes) {
			add(b.cx - b.rx, b.cy - b.ry);
			add(b.cx + b.rx, b.cy + b.ry);
		}
		for (const e of this.edges) {
			for (const m of e.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) add(Number(m[1]), Number(m[2]));
			if (e.label !== undefined && e.lx !== undefined && e.ly !== undefined) {
				const w = textWidth(e.label) / 2 + 2;
				add(e.lx - w, e.ly - LABEL_H / 2);
				add(e.lx + w, e.ly + LABEL_H / 2);
			}
		}
		for (const t of this.texts) {
			add(t.x - 10, t.y - 10);
			add(t.x + 10, t.y + 10);
		}
		return {
			viewBox: {
				x: x0 - MARGIN,
				y: y0 - MARGIN,
				width: x1 - x0 + 2 * MARGIN,
				height: y1 - y0 + 2 * MARGIN
			},
			states: this.states,
			boxes: this.boxes,
			edges: this.edges,
			texts: this.texts
		};
	}
}

/** s → f on `label` (ε, a symbol, a set), or no edge at all for ɸ. */
export function atomFigure(label: string | null, kind: 'eps' | 'sym' = 'sym'): RuleFigure {
	const fig = new Figure();
	const len = Math.max(84, textWidth(label ?? '') + 44);
	const s = fig.state(0, 0);
	const f = fig.state(2 * R + len, 0, true);
	fig.startInto({ x: -R, y: 0 });
	if (label !== null) fig.join(s, f, kind, label);
	return fig.result();
}

/** Operands in a row joined by ε (concatenation); "…" stands for elided operands. */
export function chainFigure(labels: readonly string[]): RuleFigure {
	const fig = new Figure();
	let x = 0;
	let prev: FigState | Pt | null = null;
	labels.forEach((label, i) => {
		const last = i === labels.length - 1;
		if (label === '…') {
			fig.texts.push({ x: x + 12, y: 0, text: '…' });
			if (prev) fig.line(prev, { x, y: 0 }, 'eps', 'ε');
			prev = { x: x + 24, y: 0 };
			x += 24 + GAP;
			return;
		}
		const b = fig.box(x, 0, label, last);
		if (prev === null) fig.startInto({ x, y: 0 });
		else if ('r' in prev) fig.enter(prev, b);
		else fig.line(prev, { x, y: 0 }, 'eps', 'ε');
		prev = b.final;
		x += 2 * b.rx + GAP;
	});
	return fig.result();
}

/** The choice rule: new s and f around two operands stacked top and bottom. */
export function unionFigure(top: string, bottom: string): RuleFigure {
	const fig = new Figure();
	const s = fig.state(0, 0);
	fig.startInto({ x: -R, y: 0 });
	const left = R + 58;
	const bt = fig.box(left, -46, top);
	const bb = fig.box(left, 46, bottom);
	const f = fig.state(Math.max(bt.cx + bt.rx, bb.cx + bb.rx) + 46 + R, 0, true);
	fig.enter(s, bt, -1);
	fig.enter(s, bb, 1);
	fig.join(bt.final, f, 'eps', 'ε', -1);
	fig.join(bb.final, f, 'eps', 'ε', 1);
	return fig.result();
}

/**
 * The lecture's iteration rule on an operand whose left edge is at `x` (after
 * `before`, a machine that joins the new start by ε): new s and f,
 * s →ε A.start, A.final →ε s (over the top), s →ε f (underneath).
 */
function starInto(fig: Figure, x: number, label: string, before: FigState | null): void {
	const s = fig.state(x + R, 0);
	if (before) fig.join(before, s, 'eps', 'ε');
	else fig.startInto({ x, y: 0 });
	const b = fig.box(s.x + R + GAP - 8, 0, label);
	const f = fig.state(b.cx + b.rx + GAP - 8 + R, 0, true);
	fig.enter(s, b);
	const fx = b.final.x;
	fig.curve({ x: fx, y: -FINAL_R }, { x: fx, y: -66 }, { x: s.x, y: -66 }, { x: s.x, y: -R }, 'ε', {
		x: (fx + s.x) / 2,
		y: -61
	});
	fig.curve({ x: s.x, y: R }, { x: s.x, y: 68 }, { x: f.x, y: 68 }, { x: f.x, y: R + RING }, 'ε', {
		x: (s.x + f.x) / 2,
		y: 62
	});
}

export function starFigure(label: string): RuleFigure {
	const fig = new Figure();
	starInto(fig, 0, label, null);
	return fig.result();
}

/** A+ = A A*: the operand, then the iteration rule on a fresh copy. */
export function plusFigure(): RuleFigure {
	const fig = new Figure();
	const a = fig.box(0, 0, 'A');
	fig.startInto({ x: 0, y: 0 });
	starInto(fig, 2 * a.rx + GAP - 12, 'A', a.final);
	return fig.result();
}

// ---------------------------------------------------------------------------
// Rule cards
// ---------------------------------------------------------------------------

/** Operand letters: A, B, …, Z, then AA, AB, … (the site's letter names). */
const letter = letterName;

/** Longer lists keep their first two entries and their last, with ELIDED between. */
export function elide<T>(items: readonly T[], max: number): (T | Elided)[] {
	return items.length <= max ? [...items] : [items[0], items[1], ELIDED, items[items.length - 1]];
}

/** At most four operands are drawn. */
const FIGURE_MAX = 4;
/** At most five operands, moves or bindings are written out. */
const TEXT_MAX = 5;
/** Longest sub-expression written in a binding. */
const BINDING_MAX = 24;

/** The formula's operands, elided like the figure: "A B … F", "A | B | … | P". */
const row = (letters: readonly string[], sep: string) => elide(letters, TEXT_MAX).join(sep);

/**
 * The expansion of A{min,max}, written out when short (A³ = A A A) and with
 * powers when long: A¹² = A A … A, A{12,20} = A¹² (A?)⁸, A{5,} = A⁵ A*.
 */
export function repeatExpansion(min: number, max: number | null): string {
	const labels = repeatLabels(min, max);
	if (labels.length <= TEXT_MAX) return labels.join(' ');
	if (max === min) return 'A A … A';
	const parts: string[] = [];
	if (min > 0) parts.push(min <= 2 ? Array(min).fill('A').join(' ') : `A${sup(min)}`);
	if (max === null) parts.push('A*');
	else {
		const k = max - min;
		parts.push(k <= 2 ? Array(k).fill('A?').join(' ') : `(A?)${sup(k)}`);
	}
	return parts.join(' ');
}

function repeatLabels(min: number, max: number | null): string[] {
	const labels: string[] = Array.from({ length: min }, () => 'A');
	if (max === null) labels.push('A*');
	else for (let i = min; i < max; i++) labels.push('A?');
	return labels;
}

const BASE_CITE = { deck: '08' } as const;

function modelFor(
	node: Regex,
	symbolLabel: string | null
): Omit<RuleCardModel, 'clause' | 'bindings'> {
	switch (node.kind) {
		case 'epsilon':
			return {
				formula: 'ε',
				figure: atomFigure('ε', 'eps'),
				fresh: ['s', 'f'],
				adds: [['s', 'ε', 'f']],
				notes: [],
				cite: { ...BASE_CITE, slide: 3 }
			};
		case 'empty':
			return {
				formula: 'ɸ',
				figure: atomFigure(null),
				fresh: ['s', 'f'],
				adds: [],
				notes: ['No transition: L(ɸ) = { }, so f cannot be reached.']
			};
		case 'chars':
			if (node.set.isSingleton)
				return {
					formula: 'a ∈ Σ',
					figure: atomFigure('a'),
					fresh: ['s', 'f'],
					adds: [['s', 'a', 'f']],
					notes: [],
					cite: { ...BASE_CITE, slide: 3 }
				};
			return {
				formula: formatClass(node.set),
				mono: true,
				figure: atomFigure(node.set.isEmpty ? null : formatLabel(node.set)),
				fresh: ['s', 'f'],
				adds: node.set.isEmpty ? [] : [['s', formatLabel(node.set), 'f']],
				notes: ['A class is one transition labeled with the whole set.']
			};
		case 'any':
			return {
				formula: 'Σ',
				figure: atomFigure(symbolLabel),
				fresh: ['s', 'f'],
				adds: symbolLabel === null ? [] : [['s', 'Σ', 'f']],
				notes: ['Σ is one transition labeled with every symbol of the alphabet.']
			};
		case 'concat': {
			const n = node.parts.length;
			const letters = Array.from({ length: n }, (_, i) => letter(i));
			return {
				formula: row(letters, ' '),
				figure: chainFigure(elide(letters, FIGURE_MAX)),
				fresh: [],
				adds: elide(
					letters.slice(1).map((l, i) => [`${letters[i]}.final`, 'ε', `${l}.start`] as const),
					TEXT_MAX
				),
				notes: [
					n === 2
						? 'No new states. A’s final is no longer accepting; only B’s final is.'
						: `No new states. Longer concatenations are joined left to right: (A B) C. Only ${letters[n - 1]}’s final stays accepting.`
				],
				cite: { ...BASE_CITE, slide: 4 }
			};
		}
		case 'alt': {
			const k = node.options.length;
			const letters = Array.from({ length: k }, (_, i) => letter(i));
			const top =
				k === 2 ? 'A' : k <= 4 ? letters.slice(0, -1).join(' | ') : `A | … | ${letters[k - 2]}`;
			return {
				formula: row(letters, ' | '),
				figure: unionFigure(top, letters[k - 1]),
				fresh: ['s', 'f'],
				adds: [
					['s', 'ε', 'A.start'],
					['s', 'ε', 'B.start'],
					['A.final', 'ε', 'f'],
					['B.final', 'ε', 'f']
				],
				notes:
					k === 2
						? ['A’s and B’s finals are no longer accepting.']
						: [
								'The rule takes two options at a time, left to right: (A | B) | C. Each extra option adds another new start and new final.',
								'The options’ finals are no longer accepting.'
							],
				cite: { ...BASE_CITE, slide: 4 }
			};
		}
		case 'star':
			return {
				formula: 'A*',
				figure: starFigure('A'),
				fresh: ['s', 'f'],
				adds: [
					['s', 'ε', 'A.start'],
					['A.final', 'ε', 's'],
					['s', 'ε', 'f']
				],
				notes: [
					'A’s final goes back to the new start s, which is the only state with an ε-move to f. There is no ε-move from A’s final to f.'
				],
				cite: { ...BASE_CITE, slide: 5 }
			};
		case 'plus':
			return {
				formula: 'A+ = A A*',
				figure: plusFigure(),
				fresh: ['s', 'f'],
				adds: [],
				notes: [
					'The operand, then the iteration rule on a fresh copy of it, joined by the concatenation rule.'
				]
			};
		case 'optional':
			return {
				formula: 'A? = A | ε',
				figure: unionFigure('A', 'ε'),
				fresh: ['s', 'f'],
				adds: [],
				notes: ['The choice rule, with an ε-machine as the second option.']
			};
		case 'repeat': {
			const { min, max } = node;
			const total = max === null ? min + 1 : max;
			const head = repeatText(min, max);
			if (total <= 0)
				return {
					formula: `${head} = ε`,
					figure: atomFigure('ε', 'eps'),
					fresh: ['s', 'f'],
					adds: [['s', 'ε', 'f']],
					notes: ['Zero copies: the machine for ε. The operand is not built.']
				};
			const labels = repeatLabels(min, max);
			return {
				formula: `${head} = ${repeatExpansion(min, max)}`,
				figure: chainFigure(elide(labels, FIGURE_MAX)),
				fresh: [],
				adds: [],
				notes: [
					labels.length === 1 && max === min
						? 'One copy: the operand itself.'
						: 'Each copy is built fresh; the copies are joined by the concatenation rule.'
				]
			};
		}
		case 'ref':
			return {
				formula: node.name,
				mono: true,
				figure: chainFigure([node.name]),
				fresh: [],
				adds: [],
				notes: [
					`${node.name} stands for its definition; each use builds a fresh copy of its machine.`
				]
			};
	}
}

/** The rule card for step `index`. */
export function ruleCard(c: Construction, index: number): RuleCardModel {
	const step = c.result.steps[index];
	const node = step.node;
	const firstLabel = step.newTransitions
		.map((id) => c.result.nfa.transitions[id].label)
		.find((l) => l !== null);
	const model = modelFor(node, firstLabel ? formatLabel(firstLabel) : null);

	const kids = childSteps(c, index);
	const bindings: RuleBinding[] = [];
	const bind = (name: string, text: string) =>
		bindings.push({ name, text: shorten(text, BINDING_MAX) });
	if (node.kind === 'chars' && node.set.isSingleton) bind('a', c.texts[index]);
	else if (node.kind === 'any' && firstLabel)
		bind('Σ', `{ ${formatLabel(firstLabel, { separator: ', ' })} }`);
	else if (node.kind === 'ref') {
		if (kids.length) bind(node.name, c.texts[kids[0]]);
	} else if (node.kind === 'repeat' && kids.length === 0)
		// A⁰: the operand is never built, so it has no step of its own.
		bind('A', exprText(node.body, c.re, c.defs));
	else kids.forEach((j, i) => bind(letter(i), c.texts[j]));
	return { clause: step.clause, bindings: elide(bindings, TEXT_MAX), ...model };
}
