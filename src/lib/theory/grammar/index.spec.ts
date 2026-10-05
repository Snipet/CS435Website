import { describe, expect, it } from 'vitest';
import * as engine from './index';

describe('grammar engine exports', () => {
	it('offers the API of docs/ARCHITECTURE.md §4.4', () => {
		const names = [
			'parseGrammar',
			'parseEbnf',
			'printGrammar',
			'printEbnf',
			'printSymbols',
			'tokenizeInput',
			'ebnfToGrammar',
			'nullable',
			'firstSets',
			'followSets',
			'firstOfSequence',
			'unreachable',
			'unproductive',
			'leftRecursion',
			'chomskyType',
			'applyStep',
			'nonterminalPositions',
			'derivationFromTree',
			'treeFromDerivation',
			'yieldOf',
			'treeEquals',
			'recognizes',
			'parseTrees',
			'enumerateLanguage',
			'compareGrammars'
		] as const;
		for (const name of names) expect(typeof engine[name], name).toBe('function');
		expect(engine.END_MARKER).toBe('$');
		expect(engine.EPSILON).toBe('ε');
	});

	it('works end to end: text to grammar to trees to derivation to text', () => {
		const { grammar } = engine.parseGrammar('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		if (!grammar) throw new Error('the grammar has errors');
		const { tokens, diagnostics } = engine.tokenizeInput('int*(int+int)', grammar.terminals);
		expect(diagnostics).toEqual([]);
		const { trees, truncated } = engine.parseTrees(grammar, tokens);
		expect(trees).toHaveLength(1);
		expect(truncated).toBe(false);
		const derivation = engine.derivationFromTree(grammar, trees[0], 'leftmost');
		const last = derivation.steps[derivation.steps.length - 1].form;
		expect(engine.printSymbols(last)).toBe('int * ( int + int )');
		expect(engine.treeEquals(engine.treeFromDerivation(grammar, derivation), trees[0])).toBe(true);
		expect(engine.printGrammar(grammar)).toBe('E → E + T | T\nT → T * F | F\nF → int | ( E )');
	});
});
