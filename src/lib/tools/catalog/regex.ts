import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'regex',
	title: 'Regular Expressions',
	summary:
		'Parse a regular expression, see its structure, list the strings it denotes, and test or compare strings and expressions.',
	stage: 'lexical',
	order: 10,
	cites: [
		{ deck: '04', slide: [19, 34] },
		{ deck: '05', slide: 4 }
	],
	keywords: [
		'regular expression',
		'regex',
		'RE',
		'language',
		'L(R)',
		'syntax tree',
		'regular definitions',
		'membership',
		'equivalence',
		'flex'
	]
};
