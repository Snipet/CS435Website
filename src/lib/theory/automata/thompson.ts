/**
 * Thompson's construction, lecture variant (Lexical Analysis IV, slides 3–5).
 *
 *   ε      s →ε f
 *   a      s →a f
 *   A B    A.final →ε B.start                       (no new states)
 *   A | B  s →ε A.start, s →ε B.start, A.final →ε f, B.final →ε f
 *   A*     s →ε A.start, A.final →ε s, s →ε f        (no A.final →ε f)
 *
 * Derived forms are desugared with fresh copies: A+ = A A*, A? = A | ε,
 * A^n = n copies, A{n,m} = n copies then (m − n) copies of A?, A{n,} = n
 * copies then A*. n-ary concatenation and alternation fold left.
 *
 * The result is laid out on a grid and its states are named A, B, C, … by
 * column, then top to bottom, which reproduces the lecture's (1 | 0)*1 NFA.
 * Every fragment's start and final sit on its vertical center, so the parts of
 * a concatenation line up on one axis as on the slides. State ids follow the
 * names (A = 0); transition ids follow creation order.
 */
import type { CharSet } from '../charset';
import { formatLabel } from '../chars';
import { clauseName, type Regex } from '../regex/ast';
import { letterName } from './core';
import { regexSymbols } from './internal';
import type { Automaton, Positions, State, StateId, Transition } from './types';

/** Grid spacing of the Thompson layout, in layout units. */
export const THOMPSON_COLUMN_WIDTH = 96;
export const THOMPSON_ROW_HEIGHT = 84;

export interface ThompsonFragment {
	/** Path of the AST node (child indices from the root). */
	path: number[];
	node: Regex;
	start: StateId;
	final: StateId;
	/** Every state of the fragment, in id order. */
	states: StateId[];
}

export interface ThompsonStep {
	path: number[];
	node: Regex;
	/** Clause name as on the slides, e.g. 'Iteration (Kleene closure)'. */
	clause: string;
	fragment: ThompsonFragment;
	/** States created by this step (including fresh copies made by derived forms). */
	newStates: StateId[];
	/** Transition ids created by this step. */
	newTransitions: number[];
	/** Finals of the operand fragments that stop being final here. */
	demoted: StateId[];
	/** Totals after this step. */
	stateCount: number;
	transitionCount: number;
	note?: string;
}

export interface ThompsonResult {
	nfa: Automaton;
	/** One step per AST node, in post-order. */
	steps: ThompsonStep[];
	/** Grid positions: x = column · 96, y = row · 84 (rows may be half-rows when centered). */
	positions: Positions;
	/** `steps[i].fragment`, for outlining fragments. */
	fragments: ThompsonFragment[];
}

interface Cell {
	col: number;
	row: number;
}

/** A fragment under construction, with its grid box (relative cells). */
interface Frag {
	start: number;
	final: number;
	states: number[];
	w: number;
	h: number;
	cells: Map<number, Cell>;
}

type Namer = (id: number) => string;

interface RawStep {
	path: number[];
	node: Regex;
	frag: Frag;
	newStates: number[];
	newTransitions: number[];
	demoted: number[];
	stateCount: number;
	transitionCount: number;
	note: (n: Namer) => string;
}

function shiftInto(into: Map<number, Cell>, cells: Map<number, Cell>, dc: number, dr: number) {
	for (const [id, c] of cells) into.set(id, { col: c.col + dc, row: c.row + dr });
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

function times(n: number): string {
	return n === 1 ? 'one copy' : `${n} copies`;
}

/**
 * Builds the lecture-variant Thompson NFA for `r`. Σ (AnyNode) becomes one
 * transition labeled with `opts.alphabet`, or with the symbols used in `r`
 * when no alphabet is given.
 */
export function thompson(r: Regex, opts: { alphabet?: CharSet } = {}): ThompsonResult {
	const sigma = opts.alphabet ?? regexSymbols(r);
	let stateCount = 0;
	const edges: { from: number; to: number; label: CharSet | null }[] = [];
	const raw: RawStep[] = [];

	const newState = () => stateCount++;
	const edge = (from: number, to: number, label: CharSet | null) => edges.push({ from, to, label });

	function atom(label: CharSet | null | 'none'): Frag {
		const s = newState();
		const f = newState();
		if (label !== 'none') edge(s, f, label);
		const cells = new Map<number, Cell>([
			[s, { col: 0, row: 0 }],
			[f, { col: 1, row: 0 }]
		]);
		return { start: s, final: f, states: [s, f], w: 2, h: 1, cells };
	}

	// Operands are centered vertically, so their starts and finals share one
	// horizontal axis (Lexical Analysis IV, slides 4 and 6).
	function concat2(a: Frag, b: Frag): Frag {
		edge(a.final, b.start, null);
		const h = Math.max(a.h, b.h);
		const cells = new Map<number, Cell>();
		shiftInto(cells, a.cells, 0, (h - a.h) / 2);
		shiftInto(cells, b.cells, a.w, (h - b.h) / 2);
		return {
			start: a.start,
			final: b.final,
			states: [...a.states, ...b.states],
			w: a.w + b.w,
			h,
			cells
		};
	}

	function union2(a: Frag, b: Frag): Frag {
		const s = newState();
		const f = newState();
		edge(s, a.start, null);
		edge(s, b.start, null);
		edge(a.final, f, null);
		edge(b.final, f, null);
		const h = a.h + b.h;
		const w = Math.max(a.w, b.w) + 2;
		const mid = (h - 1) / 2;
		const cells = new Map<number, Cell>([[s, { col: 0, row: mid }]]);
		shiftInto(cells, a.cells, 1, 0);
		shiftInto(cells, b.cells, 1, a.h);
		cells.set(f, { col: w - 1, row: mid });
		return { start: s, final: f, states: [s, ...a.states, ...b.states, f], w, h, cells };
	}

	function star1(a: Frag): Frag {
		const s = newState();
		const f = newState();
		edge(s, a.start, null);
		edge(a.final, s, null);
		edge(s, f, null);
		const mid = (a.h - 1) / 2;
		const cells = new Map<number, Cell>([[s, { col: 0, row: mid }]]);
		shiftInto(cells, a.cells, 1, 0);
		cells.set(f, { col: a.w + 1, row: mid });
		return { start: s, final: f, states: [s, ...a.states, f], w: a.w + 2, h: a.h, cells };
	}

	function build(node: Regex, path: number[], record: boolean): Frag {
		let mark = { s: stateCount, t: edges.length };
		const begin = () => (mark = { s: stateCount, t: edges.length });
		const finish = (frag: Frag, demoted: number[], note: (n: Namer) => string): Frag => {
			if (record)
				raw.push({
					path,
					node,
					frag,
					newStates: range(mark.s, stateCount),
					newTransitions: range(mark.t, edges.length),
					demoted,
					stateCount,
					transitionCount: edges.length,
					note
				});
			return frag;
		};
		const child = (i: number, body: Regex) => build(body, [...path, i], record);
		const copy = (body: Regex) => build(body, [...path, 0], false);

		switch (node.kind) {
			case 'empty': {
				const f = atom('none');
				return finish(
					f,
					[],
					(n) => `New states ${n(f.start)} and ${n(f.final)} with no transition: L(ɸ) = { }.`
				);
			}
			case 'epsilon': {
				const f = atom(null);
				return finish(f, [], (n) => `ε-transition from ${n(f.start)} to ${n(f.final)}.`);
			}
			case 'chars': {
				const f = atom(node.set.isEmpty ? 'none' : node.set);
				return finish(f, [], (n) =>
					node.set.isEmpty
						? `The class is empty, so ${n(f.start)} has no transition to ${n(f.final)}.`
						: `Transition on ${formatLabel(node.set)} from ${n(f.start)} to ${n(f.final)}.`
				);
			}
			case 'any': {
				const f = atom(sigma.isEmpty ? 'none' : sigma);
				return finish(f, [], (n) =>
					sigma.isEmpty
						? `Σ is empty, so ${n(f.start)} has no transition to ${n(f.final)}.`
						: `One transition on every symbol of Σ = { ${formatLabel(sigma, { separator: ', ' })} } from ${n(f.start)} to ${n(f.final)}.`
				);
			}
			case 'concat': {
				const parts = node.parts.map((p, i) => child(i, p));
				begin();
				let acc = parts[0];
				const joins: [number, number][] = [];
				for (const part of parts.slice(1)) {
					joins.push([acc.final, part.start]);
					acc = concat2(acc, part);
				}
				return finish(
					acc,
					joins.map(([x]) => x),
					(n) =>
						`ε-transition ${joins.map(([x, y]) => `${n(x)} → ${n(y)}`).join(', ')} joins the parts.`
				);
			}
			case 'alt': {
				const options = node.options.map((o, i) => child(i, o));
				begin();
				let acc = options[0];
				for (const o of options.slice(1)) acc = union2(acc, o);
				const result = acc;
				return finish(
					result,
					options.map((o) => o.final),
					(n) =>
						options.length === 2
							? `New start ${n(result.start)} with ε to ${n(options[0].start)} and ${n(options[1].start)}; ε from ${n(options[0].final)} and ${n(options[1].final)} to new final ${n(result.final)}.`
							: `The options are combined two at a time, left to right: (A | B) | C. New start ${n(result.start)}, new final ${n(result.final)}.`
				);
			}
			case 'star': {
				const body = child(0, node.body);
				begin();
				const f = star1(body);
				return finish(
					f,
					[body.final],
					(n) =>
						`New start ${n(f.start)} with ε to ${n(body.start)} and to new final ${n(f.final)}; ε from ${n(body.final)} back to ${n(f.start)}.`
				);
			}
			case 'plus': {
				const body = child(0, node.body);
				begin();
				const loop = star1(copy(node.body));
				const f = concat2(body, loop);
				return finish(
					f,
					[body.final],
					(n) =>
						`A+ = A A*: a fresh copy of the operand inside a new iteration (${n(loop.start)} … ${n(loop.final)}) follows ${n(body.final)}.`
				);
			}
			case 'optional': {
				const body = child(0, node.body);
				begin();
				const f = union2(body, atom(null));
				return finish(
					f,
					[body.final],
					(n) =>
						`A? = A | ε: new start ${n(f.start)} and new final ${n(f.final)} around the operand and an ε-fragment.`
				);
			}
			case 'repeat': {
				const { min, max } = node;
				const total = max === null ? min + 1 : max;
				if (total <= 0) {
					begin();
					const f = atom(null);
					return finish(f, [], () => `Zero copies: the fragment for ε.`);
				}
				const first = child(0, node.body);
				begin();
				let used = false;
				const next = () => {
					if (used) return copy(node.body);
					used = true;
					return first;
				};
				const pieces: Frag[] = [];
				for (let i = 0; i < min; i++) pieces.push(next());
				if (max === null) pieces.push(star1(next()));
				else for (let i = min; i < max; i++) pieces.push(union2(next(), atom(null)));
				let acc = pieces[0];
				for (const p of pieces.slice(1)) acc = concat2(acc, p);
				const what =
					max === null
						? `${times(min)} of the operand, then A*`
						: max === min
							? `${times(min)} of the operand`
							: `${times(min)} of the operand, then ${times(max - min)} of A?`;
				// A{1} is the operand itself, whose final stays final.
				return finish(acc, acc === first ? [] : [first.final], () =>
					pieces.length === 1 && max === min
						? 'One copy: the operand itself.'
						: `${what}, joined by ε.`
				);
			}
			case 'ref': {
				const body = child(0, node.body);
				begin();
				return finish(body, [], () => `${node.name} stands for its definition.`);
			}
		}
	}

	const root = build(r, [], true);

	// Name by column, then row, then creation order; ids follow the names.
	const order = [...root.cells.entries()].sort(
		([a, ca], [b, cb]) => ca.col - cb.col || ca.row - cb.row || a - b
	);
	const idOf = new Map<number, StateId>(order.map(([prov], i) => [prov, i]));
	const map = (prov: number) => idOf.get(prov)!;
	const name: Namer = (prov) => letterName(map(prov));
	const sorted = (ids: number[]) => ids.map(map).sort((a, b) => a - b);

	const final = map(root.final);
	const states: State[] = order.map((_, id) => ({
		id,
		name: letterName(id),
		accepting: id === final
	}));
	const transitions: Transition[] = edges.map((e, id) => ({
		id,
		from: map(e.from),
		to: map(e.to),
		label: e.label
	}));
	const positions: Positions = new Map(
		order.map(([, c], id) => [
			id,
			{ x: c.col * THOMPSON_COLUMN_WIDTH, y: c.row * THOMPSON_ROW_HEIGHT }
		])
	);
	const steps: ThompsonStep[] = raw.map((s) => ({
		path: s.path,
		node: s.node,
		clause: clauseName(s.node),
		fragment: {
			path: s.path,
			node: s.node,
			start: map(s.frag.start),
			final: map(s.frag.final),
			states: sorted(s.frag.states)
		},
		newStates: sorted(s.newStates),
		newTransitions: s.newTransitions,
		demoted: s.demoted.map(map),
		stateCount: s.stateCount,
		transitionCount: s.transitionCount,
		note: s.note(name)
	}));
	const nfa: Automaton = { states, transitions, start: map(root.start) };
	if (opts.alphabet) nfa.alphabet = opts.alphabet;
	return { nfa, steps, positions, fragments: steps.map((s) => s.fragment) };
}

/** States created up to and including step `index` (for drawing a partial construction). */
export function thompsonStatesThrough(result: ThompsonResult, index: number): Set<StateId> {
	const out = new Set<StateId>();
	for (const s of result.steps.slice(0, index + 1)) for (const id of s.newStates) out.add(id);
	return out;
}
