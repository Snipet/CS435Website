import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'ambiguity',
	title: 'Ambiguity and Precedence',
	summary:
		'List every parse tree of a string, then remove the ambiguity by rewriting the grammar or by declaring precedence and associativity.',
	stage: 'syntax',
	order: 20,
	cites: [{ deck: '10', slide: [2, 19] }],
	keywords: [
		'ambiguous grammar',
		'parse tree',
		'precedence',
		'associativity',
		'precedence cascade',
		'dangling else',
		'%left',
		'bison',
		'leftmost derivation'
	]
};
