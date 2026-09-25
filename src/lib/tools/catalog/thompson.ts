import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'thompson',
	title: "Thompson's Construction",
	summary: 'Build an NFA from a regular expression one fragment at a time.',
	stage: 'lexical',
	order: 30,
	cites: [{ deck: '08', slide: [3, 6] }],
	keywords: ['Thompson', 'NFA', 'regular expression', 'ε-moves', 'fragment', 'syntax tree']
};
