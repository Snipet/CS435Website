import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'rd-backtracking',
	title: 'Recursive Descent with Backtracking',
	summary:
		'Step through recursive-descent parsing as it tries each production in order, matches tokens, and backtracks.',
	stage: 'syntax',
	order: 30,
	cites: [{ deck: '11', slide: [2, 35] }],
	keywords: [
		'recursive descent',
		'backtracking',
		'top-down parsing',
		'parse tree',
		'fringe',
		'left recursion',
		'bool functions',
		'match'
	]
};
