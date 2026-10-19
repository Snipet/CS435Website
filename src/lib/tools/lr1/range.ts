/**
 * Which states the DFA drawings and the table show: all of a small automaton,
 * else a window of a larger one, never more than `MAX_RANGE` states at once.
 * Kept apart from the drawing code so the tool's hash state can use it.
 */

/** Automata up to this many states are drawn whole; larger ones a window at a time. */
export const DRAW_ALL = 30;
/** States in a window of a larger automaton. */
export const WINDOW = 16;
/**
 * The most states drawn and tabled at once. The item-set layout of a window
 * this size takes a few dozen milliseconds; of twice as many, seconds.
 */
export const MAX_RANGE = 2 * WINDOW;

/** The states drawn and tabled: [first, last], both included. */
export type StateRange = readonly [number, number];

/**
 * The range shown: the whole automaton when it is small, else the window the
 * state asks for, clamped to the states there are and to at most `MAX_RANGE`
 * states from its first, or the first window.
 */
export function shownRange(states: number, range: StateRange | null): StateRange {
	if (states <= 0) return [0, -1];
	if (states <= DRAW_ALL && range === null) return [0, states - 1];
	if (range === null) return [0, Math.min(states, WINDOW) - 1];
	const first = Math.max(0, Math.min(states - 1, Math.trunc(range[0])));
	const last = Math.max(first, Math.min(states - 1, Math.trunc(range[1]), first + MAX_RANGE - 1));
	return [first, last];
}

/**
 * A range whose `end` was typed: that end is kept, and the other one moves
 * when needed so the range is in order and holds at most `MAX_RANGE` states.
 */
export function rangeWith(
	range: StateRange,
	end: 'first' | 'last',
	value: number
): [number, number] {
	const v = Math.max(0, Math.trunc(value));
	if (end === 'first') return [v, Math.min(Math.max(v, range[1]), v + MAX_RANGE - 1)];
	return [Math.max(Math.min(range[0], v), v - MAX_RANGE + 1), v];
}

/** The window of `size` states that holds `state`, aligned to multiples of `size`. */
export function windowAround(state: number, states: number, size = WINDOW): StateRange {
	const first = Math.floor(state / size) * size;
	return [first, Math.min(states, first + size) - 1];
}

export const inRange = (range: StateRange, state: number) => state >= range[0] && state <= range[1];
