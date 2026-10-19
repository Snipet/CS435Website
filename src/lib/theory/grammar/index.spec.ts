import { describe, expect, it } from 'vitest';
import * as engine from './index';

describe('grammar engine exports', () => {
	it('offers the API of docs/ARCHITECTURE.md §4.4', () => {
		const names = [
			'parseGrammar',
			'parseEbnf',
			'makeGrammar',
			'printGrammar',
			'printEbnf',
			'printSymbols',
			'printSet',
			'tokenizeInput',
			'ebnfToGrammar',
			'scanGrammar',
			'nullable',
			'firstSets',
			'followSets',
			'firstOfSequence',
			'reservedSymbols',
			'unreachable',
			'unproductive',
			'leftRecursion',
			'cycles',
			'chomskyType',
			'sentenceLengths',
			'isEmptyLanguage',
			'isFiniteLanguage',
			'applyStep',
			'nonterminalPositions',
			'derivationFromTree',
			'treeFromDerivation',
			'yieldOf',
			'treeEquals',
			'bracketForm',
			'recognizes',
			'parseTrees',
			'enumerateLanguage',
			'compareGrammars',
			'displayOrder',
			'terminalRanks',
			'sortForDisplay',
			'printTight',
			'firstFollow',
			'firstOfString',
			'll1Table',
			'll1Cell',
			'endInput',
			'replaceAt',
			'withRanges',
			'll1Parse',
			'augment',
			'mergeItems',
			'printProduction',
			'printItem',
			'lrClosure',
			'lrTransition',
			'lr1Automaton',
			'lr0Automaton',
			'lalr1Automaton',
			'reduceLabel',
			'readPrecedence',
			'rulePrecedence',
			'lrTable',
			'printAction',
			'lrParse',
			'printStack',
			'shiftReduceRows',
			'collapseShifts',
			'printCompact',
			'printConfiguration',
			'handlesFromTree',
			'handlesFromParse',
			'grammarClasses'
		] as const;
		for (const name of names) expect(typeof engine[name], name).toBe('function');
		expect(engine.END_MARKER).toBe('$');
		expect(engine.EPSILON).toBe('ε');
		expect(engine.DEFAULT_MAX_STEPS).toBe(10_000_000);
		expect(engine.DEFAULT_PARSE_STEPS).toBe(20_000);
		expect(engine.PARSE_STACK_BUDGET).toBe(4_000_000);
		expect(engine.DEFAULT_MAX_STATES).toBe(5000);
		expect(engine.ITEM_DOT).toBe('•');
		expect(engine.STACK_BOTTOM).toBe('dummy');
	});

	it('runs both parsers on one grammar', () => {
		const { grammar } = engine.parseGrammar('E → T X\nX → + E | ε\nT → ( E ) | int Y\nY → * T | ε');
		if (!grammar) throw new Error('the grammar has errors');
		const tokens = engine.tokenizeInput('int * ( int + int )', grammar.terminals).tokens;
		const ll = engine.ll1Parse(engine.ll1Table(grammar), tokens);
		const lr = engine.lrParse(engine.lrTable(engine.lr1Automaton(grammar)), tokens);
		expect(ll.outcome).toBe('accept');
		expect(lr.outcome).toBe('accept');
		expect(engine.treeEquals(ll.tree!, lr.tree!)).toBe(true);
		expect(engine.handlesFromParse(lr)).toEqual(engine.handlesFromTree(grammar, ll.tree!));
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
