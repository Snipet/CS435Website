import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'minimize',
	title: 'DFA Minimization',
	summary:
		'Merge equivalent DFA states by partition refinement and find strings that tell two states apart.',
	stage: 'lexical',
	order: 50,
	cites: [{ deck: '08', slide: 11 }],
	keywords: [
		'minimize',
		'minimal DFA',
		'partition refinement',
		'equivalent states',
		'distinguishing string',
		'Moore'
	]
};
