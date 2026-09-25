import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'lexer',
	title: 'Scanner Rules',
	summary:
		'Write token rules as regular expressions and watch maximal munch split an input into (token, lexeme) pairs.',
	stage: 'lexical',
	order: 60,
	cites: [
		{ deck: '05', slide: [4, 12] },
		{ deck: '04', slide: [4, 17] },
		{ deck: '03', slide: 5 }
	],
	keywords: [
		'lexer',
		'scanner',
		'token',
		'lexeme',
		'maximal munch',
		'longest match',
		'rule priority',
		'lookahead',
		'error rule',
		'whitespace'
	]
};
