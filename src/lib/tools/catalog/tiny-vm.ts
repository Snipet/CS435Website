import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'tiny-vm',
	title: 'TINY Machine',
	summary:
		'Load and step through TINY Machine (TM) programs: registers, memory, and each fetch–decode–execute step.',
	stage: 'runtime',
	order: 10,
	cites: [{ deck: '00', slide: [14, 17] }],
	keywords: [
		'TM',
		'TINY',
		'virtual machine',
		'interpreter',
		'stepTM',
		'fetch decode execute',
		'registers',
		'instruction memory',
		'data memory',
		'assembly'
	]
};
