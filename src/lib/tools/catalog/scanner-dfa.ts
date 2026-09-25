import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'scanner-dfa',
	title: 'Scanner DFAs',
	summary:
		"Run a scanner's DFA from its transition table with the table-driven loop, or as hand-coded switch statements.",
	stage: 'lexical',
	order: 70,
	cites: [
		{ deck: '08', slide: [13, 20] },
		{ deck: '05', slide: 13 }
	],
	keywords: [
		'transition table',
		'table-driven',
		'driver',
		'getToken',
		'relop',
		'switch',
		'retract',
		'ungetc',
		'longest match',
		'accept',
		'tokenFor'
	]
};
