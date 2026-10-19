import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'll1',
	title: 'LL(1) Parsing Table',
	summary:
		'Compute First and Follow sets, build the LL(1) parsing table of a grammar, rewrite a grammar that is not LL(1), and trace the table-driven parser on a token string.',
	stage: 'syntax',
	order: 50,
	cites: [
		{ deck: '12', slide: [5, 12] },
		{ deck: '12', slide: [18, 26] }
	],
	keywords: [
		'LL(1)',
		'parsing table',
		'predictive parsing',
		'table-driven parsing',
		'First',
		'Follow',
		'FIRST set',
		'FOLLOW set',
		'multiply defined',
		'left factoring',
		'left recursion',
		'stack',
		'top-down parsing',
		'end marker'
	]
};
