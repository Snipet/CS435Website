import { describe, expect, it } from 'vitest';
import { CMINUS_BNF } from '$lib/theory/cminus';
import { parseGrammar, tokenizeInput } from '$lib/theory/grammar';
import { presetFor as conflictsPresetFor } from '$lib/tools/conflicts/presets';
import { isConflictsHash, stateFromHash as conflictsState } from '$lib/tools/conflicts/state';
import { isGrammarHash } from '$lib/tools/grammar/state';
import { presetFor as lr1PresetFor, presets as lr1Presets } from '$lib/tools/lr1/presets';
import { isLr1Hash, stateFromHash as lr1State } from '$lib/tools/lr1/state';
import { decode } from '$lib/url-state';
import { CONFLICTS_INPUT, LR1_INPUT, grammarLinks } from './grammar-links';

const stateOf = (href: string) => decode(href.split('#')[1]);

describe('grammarLinks', () => {
	const links = grammarLinks();
	const bySlug = new Map(links.map((l) => [l.slug, l]));

	it('opens the BNF in Context-Free Grammars, the LR(1) Parser Builder and Conflicts & Precedence', () => {
		expect(links.map((l) => [l.slug, l.title, l.href.split('#')[0]])).toEqual([
			['grammar', 'Context-Free Grammars', '/grammar'],
			['lr1', 'LR(1) Parser Builder', '/lr1'],
			['conflicts', 'Conflicts & Precedence', '/conflicts']
		]);
		const value = stateOf(bySlug.get('grammar')!.href);
		expect(value).toEqual({ grammar: CMINUS_BNF });
		expect(isGrammarHash(value)).toBe(true);
	});

	it('reads as a grammar with the token strings in its terminals', () => {
		const { grammar, diagnostics } = parseGrammar(CMINUS_BNF);
		expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		for (const input of [LR1_INPUT, CONFLICTS_INPUT])
			expect(tokenizeInput(input, grammar!.terminals).diagnostics).toEqual([]);
	});

	it('opens the LR(1) Parser Builder on its C- preset', () => {
		const value = stateOf(bySlug.get('lr1')!.href);
		expect(isLr1Hash(value)).toBe(true);
		const state = lr1State(value as never);
		expect(state).toMatchObject({ grammar: CMINUS_BNF, input: LR1_INPUT });
		const preset = lr1Presets.find((p) => p.value.grammar === CMINUS_BNF);
		expect(preset?.value.input).toBe(LR1_INPUT);
		expect(lr1PresetFor(state)?.id).toBe(preset!.id);
	});

	it('opens Conflicts & Precedence on its C- preset', () => {
		const value = stateOf(bySlug.get('conflicts')!.href);
		expect(isConflictsHash(value)).toBe(true);
		const state = conflictsState(value as never);
		expect(state).toMatchObject({ grammar: CMINUS_BNF, input: CONFLICTS_INPUT, precedence: '' });
		expect(conflictsPresetFor(state)?.id).toBe('cminus');
	});
});
