import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 't-diagrams',
	title: 'T-Diagrams',
	summary:
		'Compose compilers drawn as T-diagrams to model cross compilers, retargeting, and bootstrapping.',
	stage: 'overview',
	order: 20,
	cites: [{ deck: '02', slide: [3, 8] }],
	keywords: [
		'T-diagram',
		'bootstrapping',
		'cross compiler',
		'retargetable compiler',
		'host language',
		'frontend',
		'backend',
		'GCC',
		'LLVM'
	]
};
