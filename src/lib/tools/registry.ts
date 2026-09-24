import type { Stage, ToolMeta } from './types';

/**
 * Each tool registers itself by adding `src/lib/tools/catalog/<slug>.ts` that
 * exports `const tool: ToolMeta`. No shared file needs editing.
 */
const modules = import.meta.glob<{ tool: ToolMeta }>('./catalog/*.ts', { eager: true });

export const tools: ToolMeta[] = Object.values(modules)
	.map((m) => m.tool)
	.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export function toolBySlug(slug: string): ToolMeta | undefined {
	return tools.find((t) => t.slug === slug);
}

export const stages: { id: Stage; title: string; blurb: string }[] = [
	{
		id: 'overview',
		title: 'The big picture',
		blurb: 'Compilers, interpreters, and how they are built'
	},
	{ id: 'lexical', title: 'Lexical analysis', blurb: 'Characters → tokens' },
	{ id: 'syntax', title: 'Syntax analysis', blurb: 'Tokens → parse trees' },
	{ id: 'semantic', title: 'Semantic analysis', blurb: 'Scopes, types, meaning' },
	{ id: 'intermediate', title: 'Intermediate code', blurb: 'IR and optimization' },
	{ id: 'codegen', title: 'Code generation', blurb: 'IR → target code' },
	{ id: 'runtime', title: 'Execution', blurb: 'Machines that run the result' }
];

export function toolsForStage(stage: Stage): ToolMeta[] {
	return tools.filter((t) => t.stage === stage);
}
