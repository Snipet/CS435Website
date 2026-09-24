/**
 * Hand-built lecture machines used by the graph component tests. They mirror
 * the slide figures so the renderer can be checked without the automata engine.
 */
import { CharSet } from '$lib/theory/charset';
import type { Automaton, Positions, State, Transition } from '$lib/theory/automata/types';

type Edge = [from: number, label: string | null, to: number, display?: string];

function build(
	names: string[],
	edges: Edge[],
	opts: { accepting?: number[]; start?: number; extra?: Partial<State>[] } = {}
): Automaton {
	const states: State[] = names.map((name, id) => ({
		id,
		name,
		accepting: opts.accepting?.includes(id) ?? false,
		...(opts.extra?.[id] ?? {})
	}));
	const transitions: Transition[] = edges.map(([from, label, to, display], id) => ({
		id,
		from,
		to,
		label: label === null ? null : CharSet.of(label),
		...(display ? { display } : {})
	}));
	return { states, transitions, start: opts.start ?? 0 };
}

/** DFA for (0 | 1)*00 (Lexical Analysis III, slide 8), states named A–C. */
export const dfaEndsIn00 = build(
	['A', 'B', 'C'],
	[
		[0, '1', 0],
		[0, '0', 1],
		[1, '0', 2],
		[1, '1', 0],
		[2, '0', 2],
		[2, '1', 0]
	],
	{ accepting: [2] }
);

/** Thompson NFA for (1 | 0)*1 with the slide's 11 edges (Lexical Analysis IV, slide 6). */
export const thompsonNfa = build(
	['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
	[
		[0, null, 1],
		[1, null, 2],
		[1, null, 3],
		[2, '1', 4],
		[3, '0', 5],
		[4, null, 6],
		[5, null, 6],
		[6, null, 0],
		[0, null, 7],
		[7, null, 8],
		[8, '1', 9]
	],
	{ accepting: [9] }
);

/** Thompson grid: x = column · 96, y = row · 84, C/E half a row up and D/F half a row down. */
export const thompsonPositions: Positions = new Map(
	(
		[
			[0, 0, 0],
			[1, 1, 0],
			[2, 2, -0.5],
			[3, 2, 0.5],
			[4, 3, -0.5],
			[5, 3, 0.5],
			[6, 4, 0],
			[7, 5, 0],
			[8, 6, 0],
			[9, 7, 0]
		] as const
	).map(([id, col, row]) => [id, { x: col * 96, y: row * 84 }])
);

/** Subset-construction DFA for (1 | 0)*1 (Lexical Analysis IV, slide 10). */
export const subsetDfa = build(
	['ABCDHI', 'FGABCDHI', 'EJGABCDHI'],
	[
		[0, '0', 1],
		[0, '1', 2],
		[1, '0', 1],
		[1, '1', 2],
		[2, '0', 1],
		[2, '1', 2]
	],
	{ accepting: [2] }
);

const notEq = CharSet.single('=').complement();
const notEqGt = CharSet.of('=>').complement();

/** relop transition diagram (Lexical Analysis IV, slide 16). */
export const relopDfa: Automaton = {
	states: [
		{ id: 0, name: '0', accepting: false },
		{ id: 1, name: '1', accepting: false },
		{ id: 2, name: '2', accepting: true, note: 'return LE' },
		{ id: 3, name: '3', accepting: true, note: 'return NE' },
		{ id: 4, name: '4', accepting: true, note: 'return LT', retract: true },
		{ id: 5, name: '5', accepting: true, note: 'return EQ' },
		{ id: 6, name: '6', accepting: false },
		{ id: 7, name: '7', accepting: true, note: 'return GE' },
		{ id: 8, name: '8', accepting: true, note: 'return GT', retract: true }
	],
	transitions: [
		{ id: 0, from: 0, to: 1, label: CharSet.single('<') },
		{ id: 1, from: 0, to: 5, label: CharSet.single('=') },
		{ id: 2, from: 0, to: 6, label: CharSet.single('>') },
		{ id: 3, from: 1, to: 2, label: CharSet.single('=') },
		{ id: 4, from: 1, to: 3, label: CharSet.single('>') },
		{ id: 5, from: 1, to: 4, label: notEqGt, display: 'other' },
		{ id: 6, from: 6, to: 7, label: CharSet.single('=') },
		{ id: 7, from: 6, to: 8, label: notEq, display: 'other' }
	],
	start: 0
};

/** Small NFA with a doubled edge, an ε self-loop and parallel ε/symbol edges. */
export const mixedNfa = build(
	['S', 'T', 'U'],
	[
		[0, '0', 1],
		[0, '1', 1],
		[0, null, 1],
		[1, '1', 1],
		[1, null, 1],
		[1, '0', 2],
		[2, null, 0]
	],
	{ accepting: [2] }
);
