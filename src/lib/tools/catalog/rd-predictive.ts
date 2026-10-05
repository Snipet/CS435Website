import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'rd-predictive',
	title: 'Predictive Recursive Descent',
	summary:
		'Rewrite a grammar with EBNF so one token of lookahead picks each rule, then run the generated recursive-descent parser.',
	stage: 'syntax',
	order: 40,
	cites: [
		{ deck: '11', slide: [23, 27] },
		{ deck: '11', slide: [36, 41] }
	],
	keywords: [
		'recursive descent',
		'predictive parsing',
		'lookahead',
		'left recursion',
		'left factoring',
		'EBNF',
		'top-down parsing',
		'associativity',
		'AST',
		'match'
	]
};
