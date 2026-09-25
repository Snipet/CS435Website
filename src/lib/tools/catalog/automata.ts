import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'automata',
	title: 'Finite Automata',
	summary:
		'Draw or load a DFA or NFA, check whether it is deterministic, and run strings through it step by step.',
	stage: 'lexical',
	order: 20,
	cites: [{ deck: '06', slide: [3, 16] }],
	keywords: [
		'DFA',
		'NFA',
		'finite automaton',
		'state diagram',
		'transition table',
		'trap state',
		'epsilon',
		'simulation'
	]
};
