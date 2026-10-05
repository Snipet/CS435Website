/**
 * Whatever is typed, the page gets diagnostics and results, never an
 * exception: every function of the pipeline is run on grammars and token
 * strings that are empty, cyclic, left-recursive, nullable, oddly spelled or
 * deeply nested.
 */
import { describe, expect, it } from 'vitest';
import { compareGrammars, ebnfToGrammar, leftRecursion, printEbnf } from '$lib/theory/grammar';
import { readAst, readInput, readParser, readSource, runParser } from './model';
import { programText } from './program';
import type { RunResult } from './run';
import { describeStep, forestAt, outcomeText, stackRows, tokenHighlights } from './view';

const BNF = [
	'',
	'   ',
	'E',
	'E →',
	'E → |',
	'S → ε',
	'S → S',
	'S → S | ε',
	'S → S S | a',
	'S → S a',
	'S → A\nA → S',
	'S → A | a\nA → S | b',
	'A → A | a',
	'S → a S b | ε',
	'S → ( S ) S | ε',
	'E → E + E | E * E | ( E ) | int',
	'E → E + T | E - T | T\nT → T * F | T / F | F\nF → ( E ) | int | id | - F',
	'S → if E then S | if E then S else S | other\nE → b',
	'S → A B C\nA → a | ε\nB → b | ε\nC → c | ε',
	'S → A S a | b\nA → ε',
	'A → B a | A a | c\nB → B b | A b | d',
	'A → a b c | a b d | a e | a',
	'S’ → S $\nS → a',
	'S → "ε" a',
	'S → { S } | [ S ] | x',
	'if-stmt → if expr then if-stmt | other\nexpr → id "==" id',
	'S → "the cat" S | \'->\' | "|"',
	'main → int main | token\ntoken → match error',
	'S → a\nS → b\nT → c',
	'E → E + T | T\nT → T * F | F\nF → ( E ) | int\nG → G',
	`S → ${Array.from({ length: 40 }, (_, i) => `S t${i}`).join(' | ')} | u`
];

const EBNF = [
	'S → { }',
	'S → { a',
	'S → { a } { a }',
	'S → { { a } }',
	'S → [ [ [ a ] ] ] b',
	'S → { A } b\nA → a | ε',
	'S → { S }',
	'S → [ S ] a',
	'E → E { + T }\nT → int',
	'E → T { + T | - T } [ ; ]\nT → F { * F }\nF → ( E ) | int | id',
	'E → T [ + E | - E ]\nT → int [ * T ]',
	'A → X [ op A ]',
	'S → { a | b [ c { d } ] } e',
	'S → "{" S "}" | ε',
	'L → id { , id }',
	'S → int { + int }',
	'E → { + } T\nT → int'
];

const INPUTS = ['', '$', 'a', 'a a a', 'int + int * int', '( int )', 'id , id', 'x $ y', 'b a a $'];

function exercise(run: RunResult | null | undefined) {
	if (!run) return;
	const at = [0, 1, Math.floor(run.steps.length / 2), run.steps.length - 2, run.steps.length - 1];
	for (const i of at) {
		if (i < 0 || i >= run.steps.length) continue;
		expect(describeStep(run, i).title).not.toBe('');
		tokenHighlights(run, i);
		stackRows(run, i);
		forestAt(run, i);
	}
	expect(outcomeText(run).title).not.toBe('');
}

function pipeline(parserText: string, inputs: readonly string[]) {
	const parser = readParser(parserText);
	if (!parser.ebnf) {
		expect(parser.diagnostics.some((d) => d.severity === 'error')).toBe(true);
		return;
	}
	expect(programText(parser.program!)).toContain('main () {');
	for (const text of inputs) {
		const input = readInput(text, parser.ebnf);
		exercise(runParser(parser, input));
		for (const form of [null, 'loop', 'recursion'] as const) {
			exercise(readAst(parser, input, form)?.run);
		}
	}
}

describe('no input makes the pipeline throw', () => {
	it.each(BNF.map((text) => [text.split('\n')[0].slice(0, 40), text] as const))(
		'grammar %s',
		(_, text) => {
			for (const form of ['ebnf', 'bnf'] as const)
				for (const order of ['written', 'reversed'] as const) {
					const source = readSource(text, { form, order });
					if (!source.rewrite) {
						expect(source.diagnostics.some((d) => d.severity === 'error')).toBe(true);
						continue;
					}
					pipeline(source.rewrite.text, INPUTS);
				}
			// The grammar itself may be put into the Parser panel as it is.
			pipeline(text, INPUTS.slice(0, 4));
		}
	);

	it.each(EBNF.map((text) => [text.split('\n')[0], text] as const))('EBNF %s', (_, text) => {
		pipeline(text, INPUTS);
	});

	it('reads a rewrite back as the grammar it printed', () => {
		for (const text of BNF) {
			const source = readSource(text);
			if (!source.rewrite) continue;
			const parser = readParser(source.rewrite.text);
			expect(parser.ebnf, text).not.toBeNull();
			expect(printEbnf(parser.ebnf!), text).toBe(source.rewrite.text);
			expect(parser.ebnf!.nonterminals).toEqual(source.rewrite.grammar.nonterminals);
			expect(parser.ebnf!.terminals).toEqual(source.rewrite.grammar.terminals);
		}
	});

	it('keeps the language of every grammar it rewrites', () => {
		for (const text of BNF) {
			const source = readSource(text);
			// A grammar that uses $ or ε as a symbol has no reliable comparison.
			if (!source.rewrite || !source.grammar || /[$ε]/.test(text.replace(/→ ε|\| ε/g, '')))
				continue;
			const compared = compareGrammars(source.grammar, ebnfToGrammar(source.rewrite.grammar), {
				maxLength: 5
			});
			expect(compared.onlyA, text).toEqual([]);
			expect(compared.onlyB, text).toEqual([]);
			if (source.rewrite.notes.length === 0) {
				expect(leftRecursion(ebnfToGrammar(source.rewrite.grammar)), text).toEqual([]);
			}
		}
	});
});
