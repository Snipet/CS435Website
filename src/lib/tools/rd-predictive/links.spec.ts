import { describe, expect, it } from 'vitest';
import { compareGrammars, ll1Table, parseGrammar } from '$lib/theory/grammar';
import { isLL1Hash, stateFromHash as ll1State } from '$lib/tools/ll1/state';
import { toolLink } from '$lib/tools/links';
import { isRdHash } from '$lib/tools/rd-backtracking/state';
import { decode } from '$lib/url-state';
import { rewriteBnf, rewriteTargets } from './links';
import { readSource } from './model';
import { presets, presetState, SLIDE_25, SLIDE_36 } from './presets';

const rewriteOf = (text: string, form: 'ebnf' | 'bnf' = 'ebnf') =>
	readSource(text, { form }).rewrite!;

describe('rewriteBnf', () => {
	it('writes the brackets of slide 37 as new non-terminals: the grammar of the LL(1) slides', () => {
		const rewrite = rewriteOf(SLIDE_36);
		expect(rewrite.text).toBe('E → T [ + E ]\nT → ( E ) | int [ * T ]');
		const bnf = rewriteBnf(rewrite);
		expect(bnf).toBe('E → T E’\nE’ → + E | ε\nT → ( E ) | int T’\nT’ → * T | ε');
		const g = parseGrammar(bnf!);
		expect(g.diagnostics).toEqual([]);
		expect(ll1Table(g.grammar!).ll1).toBe(true);
	});

	it('keeps a result without brackets as it is', () => {
		const rewrite = rewriteOf(SLIDE_25, 'bnf');
		expect(rewrite.brackets).toBe(false);
		expect(rewriteBnf(rewrite)).toBe(rewrite.text);
	});
});

describe('rewriteTargets', () => {
	it('opens a plain result in both tools and a bracketed one in the LL(1) table only', () => {
		const plain = rewriteOf(SLIDE_25, 'bnf');
		expect(rewriteTargets(plain)).toEqual([
			{ slug: 'rd-backtracking', grammar: plain.text, converted: false },
			{ slug: 'll1', grammar: plain.text, converted: false }
		]);
		const bracketed = rewriteOf(SLIDE_36);
		expect(rewriteTargets(bracketed)).toEqual([
			{ slug: 'll1', grammar: rewriteBnf(bracketed), converted: true }
		]);
	});

	it('has nothing for a grammar the rewrite leaves alone', () => {
		expect(rewriteTargets(rewriteOf('S → a S | b'))).toEqual([]);
	});

	it.each(presets.map((p) => [p.id, p] as const))(
		'%s: opens the tools on BNF for the same strings',
		(_, preset) => {
			const state = presetState(preset);
			const source = readSource(state.grammar, { form: state.form, order: state.order });
			const original = source.grammar!;
			for (const target of rewriteTargets(source.rewrite!)) {
				const g = parseGrammar(target.grammar);
				expect(g.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
				const same = compareGrammars(original, g.grammar!, { maxLength: 6 });
				expect([same.onlyA, same.onlyB]).toEqual([[], []]);

				const href = toolLink(target.slug, { grammar: target.grammar, input: state.input })!;
				const value = decode(href.split('#')[1]);
				if (target.slug === 'll1') {
					expect(isLL1Hash(value)).toBe(true);
					expect(ll1State(value as never)).toMatchObject({ grammar: target.grammar });
				} else expect(isRdHash(value)).toBe(true);
			}
		}
	);
});
