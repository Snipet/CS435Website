import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'phases',
	title: 'Compiler Phases',
	summary:
		'Follow a statement through scanning, parsing, type checking, three-address code, optimization, and code generation.',
	stage: 'overview',
	order: 10,
	cites: [
		{ deck: '01', slide: [3, 11] },
		{ deck: '03', slide: [2, 9] },
		{ deck: '04', slide: 3 }
	],
	keywords: [
		'phases',
		'compiler structure',
		'scanner',
		'parser',
		'abstract syntax tree',
		'semantic analysis',
		'type checking',
		'three-address code',
		'quads',
		'optimizer',
		'code generation',
		'peephole',
		'front end',
		'back end',
		'passes',
		'toolchain'
	]
};
