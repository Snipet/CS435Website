/**
 * Links that open the BNF of C- (`CMINUS_BNF`, readable by parseGrammar as it
 * is) in the grammar tools: Context-Free Grammars on the grammar alone, and
 * the LR(1) Parser Builder and Conflicts & Precedence on the token strings of
 * their own C- presets, so that each opens on that preset.
 */
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import { toolLink } from '$lib/tools/links';
import { toolBySlug } from '$lib/tools/registry';

/** The token string of the LR(1) Parser Builder's preset "C- grammar". */
export const LR1_INPUT = 'int ID ; void ID ( void ) { ID = NUM ; }';
/** The token string of the Conflicts & Precedence preset "C- grammar": a dangling else. */
export const CONFLICTS_INPUT = 'void ID ( void ) { if ( ID ) if ( ID ) ; else ; }';

export interface GrammarLink {
	slug: 'grammar' | 'lr1' | 'conflicts';
	title: string;
	href: string;
}

/** The links, in this order, to the tools that are part of the site. */
export function grammarLinks(): GrammarLink[] {
	const links: [GrammarLink['slug'], string | null][] = [
		['grammar', toolLink('grammar', { grammar: CMINUS_BNF })],
		['lr1', toolLink('lr1', { grammar: CMINUS_BNF, input: LR1_INPUT })],
		['conflicts', toolLink('conflicts', { grammar: CMINUS_BNF, input: CONFLICTS_INPUT })]
	];
	return links.flatMap(([slug, href]) => {
		const title = toolBySlug(slug)?.title;
		return title && href ? [{ slug, title, href }] : [];
	});
}
