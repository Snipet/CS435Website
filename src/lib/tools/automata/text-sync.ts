/**
 * Applying an edit made in the text format. The text names states, so the
 * result is matched to the previous machine by name: surviving states keep
 * their positions and decorations (notes, retract marks), and transitions
 * that survive unchanged keep a display text such as `other`. New states are
 * placed in a row under the drawing.
 */
import { parseAutomatonText } from '$lib/theory/automata/core';
import type { Automaton, Positions, StateId } from '$lib/theory/automata/types';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import { MAX_STATES, MAX_TRANSITIONS } from './model';

export const NEW_STATE_GAP = 110;

/** Pause in typing after which a Text-tab edit is applied. */
export const TEXT_APPLY_DELAY = 450;

export interface TextCheck {
	/** The parsed machine, or null when the text has errors or is too large to draw. */
	automaton: Automaton | null;
	diagnostics: Diagnostic[];
}

/** Parses machine text and enforces the editor's size limits. */
export function checkAutomatonText(text: string): TextCheck {
	const parsed = parseAutomatonText(text);
	const a = parsed.automaton;
	const tooBig = !!a && (a.states.length > MAX_STATES || a.transitions.length > MAX_TRANSITIONS);
	const diagnostics: Diagnostic[] = tooBig
		? [
				...parsed.diagnostics,
				{
					severity: 'error',
					message: `The editor draws at most ${MAX_STATES} states and ${MAX_TRANSITIONS} transitions.`
				}
			]
		: parsed.diagnostics;
	return { automaton: a && !hasErrors(diagnostics) ? a : null, diagnostics };
}

export interface TextApplier {
	/** The text changed: apply it after a pause, unless the machine changes first. */
	input(text: string): void;
	/** Drops an edit that is still waiting. */
	cancel(): void;
	readonly pending: boolean;
}

/**
 * Debounces Text-tab edits. An edit is written against the machine current
 * when it was typed; if something else replaces that machine before the pause
 * ends (a preset, New, Undo, a pasted link), the edit is dropped rather than
 * merged into the new machine.
 */
export function createTextApplier<T>(opts: {
	current: () => T;
	apply: (text: string) => void;
	delay?: number;
}): TextApplier {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
	};
	return {
		input(text) {
			cancel();
			const base = opts.current();
			timer = setTimeout(() => {
				timer = undefined;
				if (opts.current() === base) opts.apply(text);
			}, opts.delay ?? TEXT_APPLY_DELAY);
		},
		cancel,
		get pending() {
			return timer !== undefined;
		}
	};
}

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
