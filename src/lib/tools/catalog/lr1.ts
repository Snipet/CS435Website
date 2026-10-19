import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'lr1',
	title: 'LR(1) Parser Builder',
	summary:
		'Build the LR(1) parsing DFA of a grammar with Closure and Transition, fill in its action/goto table, and run the LR parsing algorithm on a token string.',
	stage: 'syntax',
	order: 70,
	cites: [
		{ deck: '14', slide: [16, 21] },
		{ deck: '15', slide: [5, 14] }
	],
	keywords: [
		'LR(1)',
		'LR parsing',
		'bottom-up parsing',
		'LR(1) items',
		'closure',
		'transition',
		'parsing DFA',
		'action table',
		'goto table',
		'shift',
		'reduce',
		'lookahead',
		'LALR(1)',
		'SLR(1)',
		'LR(0)'
	]
};
