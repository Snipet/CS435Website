/**
 * Links from Context-Free Grammars to the parsing tools: the LL(1) table, the
 * shift-reduce parser, the LR(1) parser builder and the conflicts tool open on
 * the grammar and, when it has tokens and no errors, the token string.
 */
import { printSymbols } from '$lib/theory/grammar';
import { toolLink } from '$lib/tools/links';
import { toolBySlug } from '$lib/tools/registry';

/** The tools linked to, in the order the links are listed. */
export const PARSING_TOOLS = ['ll1', 'shift-reduce', 'lr1', 'conflicts'] as const;

export type ParsingTool = (typeof PARSING_TOOLS)[number];

export interface ParsingLink {
	slug: ParsingTool;
	title: string;
	href: string;
}

/**
 * A link per parsing tool that is part of the site. `tokens` are the token
 * string's terminals (null or empty: no token string); each is written as a
 * grammar writes it, quoted where it needs quotes.
 */
export function parsingLinks(grammar: string, tokens: readonly string[] | null): ParsingLink[] {
	const state =
		tokens && tokens.length > 0
			? { grammar, input: tokens.map((t) => printSymbols([t])).join(' ') }
			: { grammar };
	return PARSING_TOOLS.flatMap((slug) => {
		const title = toolBySlug(slug)?.title;
		const href = toolLink(slug, state);
		return title && href ? [{ slug, title, href }] : [];
	});
}
