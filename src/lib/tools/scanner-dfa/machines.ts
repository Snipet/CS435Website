/**
 * The two machines drawn in Lexical Analysis IV that the tool runs as they are:
 * the relop transition diagram (slide 16) and the S/T/U DFA (slide 14).
 */
import { CharSet } from '$lib/theory/charset';
import type { Automaton, Positions, State, Transition } from '$lib/theory/automata/types';

export type MachineId = 'relop' | 'stu';

/** relop tokens in the order of the slide's spec `< | <= | <> | > | >= | =`. */
export const RELOP_TOKENS = ['LT', 'LE', 'NE', 'GT', 'GE', 'EQ'] as const;
export type RelopToken = (typeof RELOP_TOKENS)[number];

const rule = (token: RelopToken) => RELOP_TOKENS.indexOf(token);

function accepting(id: number, token: RelopToken, retract = false): State {
	const s: State = {
		id,
		name: String(id),
		accepting: true,
		accept: { rule: rule(token), token },
		note: `return ${token}`
	};
	if (retract) s.retract = true;
	return s;
}

const plain = (id: number): State => ({ id, name: String(id), accepting: false });

/**
 * relop (Lexical Analysis IV, slide 16): states 0–8, `other` edges out of 1
 * and 6, and * (retract) on 4 and 8. `other` is every character the state has
 * no other edge for.
 */
export function relopDfa(): Automaton {
	const states: State[] = [
		plain(0),
		plain(1),
		accepting(2, 'LE'),
		accepting(3, 'NE'),
		accepting(4, 'LT', true),
		accepting(5, 'EQ'),
		plain(6),
		accepting(7, 'GE'),
		accepting(8, 'GT', true)
	];
	const edge = (id: number, from: number, to: number, label: CharSet, display?: string) => {
		const t: Transition = { id, from, to, label };
		if (display) t.display = display;
		return t;
	};
	const transitions: Transition[] = [
		edge(0, 0, 1, CharSet.single('<')),
		edge(1, 0, 5, CharSet.single('=')),
		edge(2, 0, 6, CharSet.single('>')),
		edge(3, 1, 2, CharSet.single('=')),
		edge(4, 1, 3, CharSet.single('>')),
		edge(5, 1, 4, CharSet.of('=>').complement(), 'other'),
		edge(6, 6, 7, CharSet.single('=')),
		edge(7, 6, 8, CharSet.single('=').complement(), 'other')
	];
	return { states, transitions, start: 0 };
}

/** Slide-16 arrangement: 0 → 1 → {2, 3, 4} on top, 5 and 6 below 1, 7 and 8 right of 6. */
export const RELOP_POSITIONS: Positions = new Map(
	(
		[
			[0, 0, 0],
			[1, 150, 0],
			[2, 300, 0],
			[3, 300, 62],
			[4, 300, 124],
			[5, 150, 150],
			[6, 150, 280],
			[7, 300, 280],
			[8, 300, 342]
		] as const
	).map(([id, x, y]) => [id, { x, y }])
);

/**
 * The S/T/U DFA (Lexical Analysis IV, slide 14): the subset DFA of slide 10
 * with its states renamed. U accepts; the slide gives it no token name.
 */
export function stuDfa(): Automaton {
	const zero = CharSet.single('0');
	const one = CharSet.single('1');
	return {
		states: [
			{ id: 0, name: 'S', accepting: false },
			{ id: 1, name: 'T', accepting: false },
			{ id: 2, name: 'U', accepting: true }
		],
		transitions: [
			{ id: 0, from: 0, to: 1, label: zero },
			{ id: 1, from: 0, to: 2, label: one },
			{ id: 2, from: 1, to: 1, label: zero },
			{ id: 3, from: 1, to: 2, label: one },
			{ id: 4, from: 2, to: 1, label: zero },
			{ id: 5, from: 2, to: 2, label: one }
		],
		start: 0
	};
}

export interface MachineInfo {
	id: MachineId;
	label: string;
	/** Short name for controls. */
	short: string;
	build: () => Automaton;
	positions?: Positions;
	/** Text on the start arrow. */
	startLabel?: string;
}

export const MACHINES: Record<MachineId, MachineInfo> = {
	relop: {
		id: 'relop',
		label: 'relop DFA (slide 16)',
		short: 'relop',
		build: relopDfa,
		positions: RELOP_POSITIONS,
		startLabel: 'start'
	},
	stu: {
		id: 'stu',
		label: 'S, T, U DFA (slide 14)',
		short: 'S, T, U',
		build: stuDfa
	}
};
