import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'shift-reduce',
	title: 'Shift-Reduce Parsing',
	summary:
		'Parse a token string bottom-up with the LR(1) table of a grammar: the shift-reduce trace with its divider, the parse tree growing over the tokens, and the handle of every reduction.',
	stage: 'syntax',
	order: 60,
	cites: [
		{ deck: '13', slide: [4, 11] },
		{ deck: '14', slide: [2, 16] }
	],
	keywords: [
		'shift-reduce',
		'bottom-up parsing',
		'LR parsing',
		'handle',
		'reduction',
		'rightmost derivation',
		'reverse rightmost derivation',
		'shift',
		'reduce',
		'stack',
		'LR(1)'
	]
};
