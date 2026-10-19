import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'conflicts',
	title: 'Conflicts & Precedence',
	summary:
		'List the shift/reduce and reduce/reduce conflicts of an LR(1) table, settle them with bison’s %left, %right and %nonassoc, compare the parse trees, and read the Parser.output bison writes.',
	stage: 'syntax',
	order: 80,
	cites: [
		{ deck: '15', slide: [16, 25] },
		{ deck: '15', slide: [26, 28] }
	],
	keywords: [
		'shift/reduce conflict',
		'reduce/reduce conflict',
		'precedence',
		'associativity',
		'bison',
		'%left',
		'%right',
		'%nonassoc',
		'dangling else',
		'LALR(1)',
		'SLR',
		'LR(0)',
		'grammar classes',
		'Parser.output'
	]
};
