import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'cminus',
	title: 'C- Compiler',
	summary:
		'Write a C- program and follow it through scanning, parsing, semantic analysis, three-address code, and TINY Machine code, then run it.',
	stage: 'overview',
	order: 5,
	cites: [
		{ deck: '01', slide: 4 },
		{ deck: '09', slide: 31 },
		{ deck: '10', slide: 2 },
		{ deck: '00', slide: [14, 17] }
	],
	keywords: [
		'C-',
		'C minus',
		'compiler',
		'scanner',
		'tokens',
		'parser',
		'abstract syntax tree',
		'symbol table',
		'scope',
		'type checking',
		'three-address code',
		'quads',
		'optimizer',
		'code generation',
		'peephole',
		'TINY Machine',
		'TM',
		'activation record'
	]
};
