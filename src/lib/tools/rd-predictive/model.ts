/**
 * What the page computes from its state, one function per panel: the grammar
 * as written with its findings and its rewrite, the EBNF grammar with its
 * prediction analysis and its parser, the token string, and the functions
 * that build the AST. Everything here is bounded by the size of the text (the
 * runs by a step limit), so it follows every keystroke; only the comparison
 * of two languages goes to a worker (compare.ts).
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { hasErrors } from '$lib/theory/diagnostics';
import { parseEbnf, parseGrammar, printSymbols, tokenizeInput } from '$lib/theory/grammar';
import { END_MARKER, type EbnfGrammar, type Grammar } from '$lib/theory/grammar/types';
import {
	generateAst,
	runAst,
	withForm,
	writtenForm,
	type AstCode,
	type AstForm,
	type Reformed
} from './ast';
import { generateParser } from './codegen';
import {
	lookaheadOf,
	predict,
	predictionRows,
	type Lookahead,
	type Prediction,
	type PredictionRow
} from './predict';
import type { Program } from './program';
import { runProgram, withEndMarker, type RunResult } from './run';
import {
	prefixFindings,
	recursionFindings,
	recursionKinds,
	rewriteGrammar,
	type NonterminalOrder,
	type PrefixFinding,
	type RecursionFinding,
	type RecursionKind,
	type ResultForm,
	type Rewrite
} from './transform';

/** The grammar as written (BNF), what stands in the way of prediction, and its rewrite. */
export interface Source {
	grammar: Grammar | null;
	diagnostics: Diagnostic[];
	/** Left-recursive non-terminals, each with its derivation V →+ V α. */
	recursion: RecursionFinding[];
	/**
	 * Alternatives of one non-terminal with a common prefix. Alternatives that
	 * start with the non-terminal itself are left out: they are its left
	 * recursion, which `recursion` reports.
	 */
	prefixes: PrefixFinding[];
	/** The non-terminals whose rule starts or ends with the non-terminal itself. */
	kinds: RecursionKind[];
	/** Null when the grammar has errors. */
	rewrite: Rewrite | null;
}

export function readSource(
	text: string,
	opts: { form?: ResultForm; order?: NonterminalOrder } = {}
): Source {
	const { grammar, diagnostics } = parseGrammar(text);
	if (!grammar) {
		return { grammar: null, diagnostics, recursion: [], prefixes: [], kinds: [], rewrite: null };
	}
	return {
		grammar,
		diagnostics,
		recursion: recursionFindings(grammar),
		prefixes: prefixFindings(grammar).filter(
			(found) => found.prefix[0] !== printSymbols([found.nonterminal], { ebnf: true })
		),
		kinds: recursionKinds(grammar),
		rewrite: rewriteGrammar(grammar, opts)
	};
}

/** The EBNF grammar the parser is generated from, with its analysis and its code. */
export interface Parser {
	ebnf: EbnfGrammar | null;
	diagnostics: Diagnostic[];
	lookahead: Lookahead | null;
	prediction: Prediction | null;
	/** The table rule, choice, lookahead tokens. */
	rows: PredictionRow[];
	/** The parser in the style of slide 37; null when the grammar has errors. */
	program: Program | null;
}

export function readParser(text: string): Parser {
	const { grammar: ebnf, diagnostics } = parseEbnf(text);
	if (!ebnf) {
		return { ebnf: null, diagnostics, lookahead: null, prediction: null, rows: [], program: null };
	}
	const lookahead = lookaheadOf(ebnf);
	const prediction = predict(ebnf, lookahead);
	return {
		ebnf,
		diagnostics,
		lookahead,
		prediction,
		rows: predictionRows(prediction),
		program: generateParser(ebnf, lookahead)
	};
}

/** The token string, ending in `$`. */
export interface Input {
	tokens: string[];
	diagnostics: Diagnostic[];
	/** The error messages as one line, for the field: each once, the first two written out. */
	error: string;
}

/** Messages of a token string that are written out under its field. */
const ERROR_LIMIT = 2;

/**
 * Reads a token string for the grammar `e`. `$` is added at the end unless
 * it is there already; anywhere else it is an error.
 */
export function readInput(text: string, e: EbnfGrammar): Input {
	const ownMarker = e.terminals.includes(END_MARKER);
	const { tokens, spans, diagnostics } = tokenizeInput(text, [...e.terminals, END_MARKER], {
		nonterminals: e.nonterminals
	});
	const problems = [...diagnostics];
	if (!ownMarker) {
		tokens.forEach((token, i) => {
			if (token !== END_MARKER || i === tokens.length - 1) return;
			problems.push({
				severity: 'error',
				message: `${END_MARKER} marks the end of the input, so it can only be the last token.`,
				span: spans[i]
			});
		});
	}
	// Each message once; a string full of unknown symbols is summed up after the first two.
	const messages = [
		...new Set(problems.filter((d) => d.severity === 'error').map((d) => d.message))
	];
	const more = messages.length - ERROR_LIMIT;
	return {
		tokens: withEndMarker(tokens),
		diagnostics: problems,
		error:
			more > 0
				? `${messages.slice(0, ERROR_LIMIT).join(' ')} And ${more} more ${more === 1 ? 'problem' : 'problems'}.`
				: messages.join(' ')
	};
}

/** The parser run on the token string; null when either has errors. */
export function runParser(parser: Parser, input: Input | null): RunResult | null {
	if (!parser.program || !input || hasErrors(input.diagnostics)) return null;
	return runProgram(parser.program, input.tokens);
}

/** The functions that build the AST, for the grammar in one of its two forms. */
export interface AstModel {
	/** The form shown: the one asked for, or the one the grammar is written in. */
	form: AstForm;
	/** The grammar is written with rules in both forms, or in neither. */
	written: AstForm | null;
	/** The grammar the functions are for, with the rules that were rewritten for `form`. */
	reformed: Reformed;
	code: AstCode;
	/** Null when a rule has no function, or the token string has errors. */
	run: RunResult | null;
}

export function readAst(
	parser: Parser,
	input: Input | null,
	form: AstForm | null
): AstModel | null {
	if (!parser.ebnf || !parser.lookahead) return null;
	const written = writtenForm(parser.ebnf, parser.lookahead);
	const shown = form ?? written ?? 'loop';
	const reformed = withForm(parser.ebnf, shown, parser.lookahead);
	const code = generateAst(reformed.grammar);
	const run = input && !hasErrors(input.diagnostics) ? runAst(code, input.tokens) : null;
	return { form: shown, written, reformed, code, run };
}

/** A token string without the `$` at its end, as the other parsing tools take it. */
export const withoutMarker = (text: string): string => text.replace(/\s*\$\s*$/u, '').trim();

/** Two grammar texts that differ only in spacing and empty lines. */
export function sameText(a: string, b: string): boolean {
	const squash = (text: string) =>
		text
			.split('\n')
			.map((line) => line.trim().replace(/\s+/gu, ' '))
			.filter((line) => line !== '')
			.join('\n');
	return squash(a) === squash(b);
}
