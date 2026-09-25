import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'subset',
	title: 'Subset Construction',
	summary: 'Convert an NFA to a DFA using ε-closures, one table row at a time.',
	stage: 'lexical',
	order: 40,
	cites: [
		{ deck: '06', slide: [14, 16] },
		{ deck: '08', slide: [8, 12] }
	],
	keywords: [
		'NFA to DFA',
		'subset construction',
		'powerset construction',
		'epsilon closure',
		'ε-closure',
		'move',
		'worklist',
		'determinize'
	]
};
