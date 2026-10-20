import { describe, expect, it } from 'vitest';
import { parseGrammar, tokenizeInput } from '$lib/theory/grammar';
import { isConflictsHash, stateFromHash as conflictsState } from '$lib/tools/conflicts/state';
import { isLL1Hash, stateFromHash as ll1State } from '$lib/tools/ll1/state';
import { isLr1Hash, stateFromHash as lr1State } from '$lib/tools/lr1/state';
import { toolBySlug } from '$lib/tools/registry';
import {
	isShiftReduceHash,
	stateFromHash as shiftReduceState
} from '$lib/tools/shift-reduce/state';
import { decode } from '$lib/url-state';
import { PARSING_TOOLS, parsingLinks, type ParsingTool } from './parsing-links';

/** What each tool makes of a link: its grammar and token string, or null when it refuses the hash. */
const opens: Record<ParsingTool, (value: unknown) => { grammar: string; input: string } | null> = {
	ll1: (v) => (isLL1Hash(v) ? ll1State(v) : null),
	'shift-reduce': (v) => (isShiftReduceHash(v) ? shiftReduceState(v) : null),
	lr1: (v) => (isLr1Hash(v) ? lr1State(v) : null),
	conflicts: (v) => (isConflictsHash(v) ? conflictsState(v) : null)
};

function opened(link: { slug: ParsingTool; href: string }) {
	const [path, hash] = link.href.split('#');
	expect(path).toBe(`/${link.slug}`);
	return opens[link.slug](decode(hash));
}

describe('parsingLinks', () => {
	const grammar = 'E → E + T | T\nT → int | ( E )';

	it('links to the four parsing tools, by their titles, in order', () => {
		const links = parsingLinks(grammar, null);
		expect(links.map((l) => l.slug)).toEqual([...PARSING_TOOLS]);
		expect(links.map((l) => l.title)).toEqual(PARSING_TOOLS.map((s) => toolBySlug(s)!.title));
	});

	it('opens each tool on the grammar alone without a token string', () => {
		for (const tokens of [null, []]) {
			for (const link of parsingLinks(grammar, tokens)) {
				expect(opened(link), link.slug).toMatchObject({ grammar, input: '' });
				expect(decode(link.href.split('#')[1])).toEqual({ grammar });
			}
		}
	});

	it('writes the token string as the grammar writes its terminals', () => {
		const text = 'S → "the cat" sat | ( S )';
		const g = parseGrammar(text).grammar!;
		const typed = tokenizeInput('( "the cat" sat )', g.terminals);
		expect(typed.diagnostics).toEqual([]);
		for (const link of parsingLinks(text, typed.tokens)) {
			const state = opened(link);
			expect(state, link.slug).toMatchObject({ grammar: text, input: '( "the cat" sat )' });
			expect(tokenizeInput(state!.input, g.terminals)).toMatchObject({
				tokens: typed.tokens,
				diagnostics: []
			});
		}
	});
});
