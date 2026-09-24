/**
 * Applying an edit made in the text format. The text names states, so the
 * result is matched to the previous machine by name: surviving states keep
 * their positions and decorations (notes, retract marks), and transitions
 * that survive unchanged keep a display text such as `other`. New states are
 * placed in a row under the drawing.
 */
import type { Automaton, Positions, StateId } from '$lib/theory/automata/types';

export const NEW_STATE_GAP = 110;

export function mergeTextEdit(
	prev: Automaton,
	prevPositions: Positions | null,
	next: Automaton
): { machine: Automaton; positions: Positions | null } {
	const byName = new Map<string, StateId>();
	for (const s of prev.states) if (!byName.has(s.name)) byName.set(s.name, s.id);
	const oldId = (id: StateId) => byName.get(next.states[id].name);

	const states = next.states.map((s) => {
		const o = oldId(s.id);
		if (o === undefined) return s;
		const old = prev.states[o];
		const out = { ...s };
		if (old.note) out.note = old.note;
		if (old.retract) out.retract = true;
		if (old.accept && s.accepting) out.accept = old.accept;
		return out;
	});

	const transitions = next.transitions.map((t) => {
		if (t.label === null) return t;
		const from = oldId(t.from);
		const to = oldId(t.to);
		if (from === undefined || to === undefined) return t;
		const old = prev.transitions.find(
			(u) => u.display && u.from === from && u.to === to && u.label?.equals(t.label!)
		);
		return old ? { ...t, display: old.display } : t;
	});

	const machine: Automaton = { ...next, states, transitions };
	if (!prevPositions) return { machine, positions: null };

	const positions: Positions = new Map();
	for (const s of next.states) {
		const o = oldId(s.id);
		const p = o === undefined ? undefined : prevPositions.get(o);
		if (p) positions.set(s.id, p);
	}
	// New states go in a row below everything that stays, so they never cover it.
	const kept = [...positions.values()];
	const minX = kept.length ? Math.min(...kept.map((p) => p.x)) : 0;
	const row = kept.length ? Math.max(...kept.map((p) => p.y)) + NEW_STATE_GAP : 0;
	let placed = 0;
	for (const s of next.states) {
		if (positions.has(s.id)) continue;
		positions.set(s.id, { x: minX + placed * NEW_STATE_GAP, y: row });
		placed++;
	}
	return { machine, positions };
}
