import type { Citation } from '$lib/lectures';

/**
 * Where a tool sits in the compiler pipeline. The home page groups tools by
 * stage; later lectures add tools to the later stages.
 */
export type Stage =
	'overview' | 'lexical' | 'syntax' | 'semantic' | 'intermediate' | 'codegen' | 'runtime';

export interface ToolMeta {
	/** URL path without leading slash, e.g. 'regex' → /regex. Must match the route folder. */
	slug: string;
	title: string;
	/** One plain sentence describing what the tool does (no teaching claims). */
	summary: string;
	stage: Stage;
	/** Sort order within the stage (ascending). */
	order: number;
	/** Lecture material the tool follows. */
	cites: Citation[];
	/** Search keywords. */
	keywords?: string[];
}
