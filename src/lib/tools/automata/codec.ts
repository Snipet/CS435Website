/**
 * JSON form of a machine and its pinned positions for the URL hash.
 *
 * The plain-text automaton format cannot carry state notes (`return LE`),
 * retract marks, or labels shown as `other`, so the tool saves this compact
 * form instead and accepts the text format from links (`LinkStates.automata`).
 */
import { CharSet, MAX_CODE_POINT, type Range } from '$lib/theory/charset';
import type { Automaton, Positions, State, Transition } from '$lib/theory/automata/types';
import { MAX_STATES, MAX_TRANSITIONS } from './model';

export interface StateJson {
	n: string;
	/** Accepting. */
	a?: 1;
	/** Retract one character (drawn *). */
	r?: 1;
	note?: string;
}

/** [from, to, label as flat ranges [lo, hi, lo, hi, …] or null for ε, display text]. */
export type TransitionJson = [number, number, number[] | null] | [number, number, number[], string];

export interface MachineJson {
	s: StateJson[];
	t: TransitionJson[];
	start: number;
	/** Declared alphabet as flat ranges. */
	sigma?: number[];
}

/** [x, y] per state id, or null for automatic layout. */
export type PositionsJson = [number, number][] | null;

const flat = (set: CharSet): number[] => set.ranges.flatMap(([lo, hi]) => [lo, hi]);

function unflat(v: unknown): CharSet | null {
	if (!Array.isArray(v) || v.length % 2 !== 0 || v.length > 2000) return null;
	const ranges: Range[] = [];
	for (let i = 0; i < v.length; i += 2) {
		const lo = v[i];
		const hi = v[i + 1];
		if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
		if (lo < 0 || hi > MAX_CODE_POINT || lo > hi) return null;
		ranges.push([lo, hi]);
	}
	return CharSet.fromRanges(ranges);
}

export function encodeMachine(a: Automaton): MachineJson {
	const out: MachineJson = {
		s: a.states.map((s) => {
			const j: StateJson = { n: s.name };
			if (s.accepting) j.a = 1;
			if (s.retract) j.r = 1;
			if (s.note) j.note = s.note;
			return j;
		}),
		t: a.transitions.map((t): TransitionJson => {
			if (t.label === null) return [t.from, t.to, null];
			return t.display ? [t.from, t.to, flat(t.label), t.display] : [t.from, t.to, flat(t.label)];
		}),
		start: a.start
	};
	if (a.alphabet) out.sigma = flat(a.alphabet);
	return out;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a machine back; null when the value is malformed or too large. */
export function decodeMachine(v: unknown): Automaton | null {
	if (!isObject(v) || !Array.isArray(v.s) || !Array.isArray(v.t)) return null;
	if (v.s.length > MAX_STATES || v.t.length > MAX_TRANSITIONS) return null;
	const states: State[] = [];
	for (const [id, raw] of v.s.entries()) {
		if (!isObject(raw) || typeof raw.n !== 'string' || raw.n.length > 200) return null;
		const s: State = { id, name: raw.n, accepting: raw.a === 1 };
		if (raw.r === 1) s.retract = true;
		if (typeof raw.note === 'string' && raw.note) s.note = raw.note.slice(0, 200);
		states.push(s);
	}
	const n = states.length;
	const inRange = (x: unknown): x is number =>
		Number.isInteger(x) && (x as number) >= 0 && (x as number) < n;
	const transitions: Transition[] = [];
	for (const raw of v.t) {
		if (!Array.isArray(raw) || raw.length < 3 || raw.length > 4) return null;
		const [from, to, label, display] = raw;
		if (!inRange(from) || !inRange(to)) return null;
		const t: Transition = { id: transitions.length, from, to, label: null };
		if (label !== null) {
			const set = unflat(label);
			if (!set) return null;
			t.label = set;
			if (typeof display === 'string' && display) t.display = display.slice(0, 40);
		}
		transitions.push(t);
	}
	const start = v.start;
	if (n > 0 ? !inRange(start) : start !== 0) return null;
	const a: Automaton = { states, transitions, start: start as number };
	if (v.sigma !== undefined) {
		const sigma = unflat(v.sigma);
		if (!sigma) return null;
		a.alphabet = sigma;
	}
	return a;
}

export function encodePositions(a: Automaton, p: Positions | null): PositionsJson {
	if (!p) return null;
	const out: [number, number][] = [];
	for (const s of a.states) {
		const q = p.get(s.id);
		if (!q) return null;
		out.push([Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]);
	}
	return out;
}

/** Positions for a machine with `count` states; null when missing or malformed. */
export function decodePositions(v: unknown, count: number): Positions | null {
	if (!Array.isArray(v) || v.length !== count) return null;
	const out: Positions = new Map();
	for (const [id, q] of v.entries()) {
		if (!Array.isArray(q) || q.length !== 2) return null;
		const [x, y] = q;
		if (typeof x !== 'number' || typeof y !== 'number') return null;
		if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6)
			return null;
		out.set(id, { x, y });
	}
	return out;
}
