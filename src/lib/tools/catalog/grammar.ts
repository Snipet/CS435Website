import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'grammar',
	title: 'Context-Free Grammars',
	summary:
		'Write a grammar, derive strings one replacement at a time, and see the parse tree each derivation defines.',
	stage: 'syntax',
	order: 10,
	cites: [{ deck: '09', slide: [11, 31] }],
	keywords: [
		'CFG',
		'context-free grammar',
		'production',
		'non-terminal',
		'terminal',
		'derivation',
		'leftmost derivation',
		'rightmost derivation',
		'sentential form',
		'parse tree',
		'membership',
		'L(G)',
		'Chomsky hierarchy',
		'regular grammar'
	]
};
