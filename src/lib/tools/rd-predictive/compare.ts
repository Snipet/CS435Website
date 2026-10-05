/**
 * The bounded check that a rewrite keeps the language: every sentence of up
 * to `maxLength` tokens of the grammar as written (BNF) and of the rewritten
 * grammar (EBNF) is listed and the two lists are compared. Listing takes long
 * enough to be felt, so the page runs it in a Web Worker through WorkerTask:
 * the request and the result are plain data.
 */
import {
	compareGrammars,
	ebnfToGrammar,
	parseEbnf,
	parseGrammar,
	printSymbols
} from '$lib/theory/grammar';

/** Longest sentence compared, in tokens. */
export const COMPARE_LENGTH = 7;
/** Sentences listed per side when the grammars differ. */
export const LIST_LIMIT = 8;

export interface CompareRequest {
	/** The grammar as written, in BNF. */
	original: string;
	/** The rewritten grammar, in EBNF. */
	rewritten: string;
	maxLength: number;
}

export type CompareResult =
	/** A grammar is missing or has errors: nothing to compare. */
	| { status: 'none' }
	| {
			status: 'done';
			/** Longest length compared completely; below `maxLength` when the work limit was reached. */
			checkedUpTo: number;
			maxLength: number;
			/** Sentences only the grammar as written generates: how many, and the first few as text. */
			onlyOriginal: { count: number; examples: string[] };
			onlyRewritten: { count: number; examples: string[] };
	  };

const side = (sentences: string[][]) => ({
	count: sentences.length,
	examples: sentences.slice(0, LIST_LIMIT).map((s) => printSymbols(s))
});

/** Compares the two grammars up to `maxLength` tokens. */
export function compareTexts(request: CompareRequest): CompareResult {
	if (request.original.trim() === '' || request.rewritten.trim() === '') return { status: 'none' };
	const a = parseGrammar(request.original).grammar;
	const b = parseEbnf(request.rewritten).grammar;
	if (!a || !b) return { status: 'none' };
	const maxLength = Math.max(1, Math.min(12, Math.round(request.maxLength) || COMPARE_LENGTH));
	const result = compareGrammars(a, ebnfToGrammar(b), { maxLength });
	return {
		status: 'done',
		checkedUpTo: result.checkedUpTo,
		maxLength,
		onlyOriginal: side(result.onlyA),
		onlyRewritten: side(result.onlyB)
	};
}

export const sameRequest = (a: CompareRequest | null, b: CompareRequest): boolean =>
	a !== null &&
	a.original === b.original &&
	a.rewritten === b.rewritten &&
	a.maxLength === b.maxLength;

/** The result in words, and whether the two grammars agree. */
export function compareSummary(result: CompareResult): {
	same: boolean | null;
	text: string;
} {
	if (result.status === 'none')
		return { same: null, text: 'The grammars are compared once both are free of errors.' };
	if (result.checkedUpTo < 1)
		return { same: null, text: 'The grammars have too many strings to compare.' };
	const upTo = `${result.checkedUpTo} ${result.checkedUpTo === 1 ? 'token' : 'tokens'}`;
	if (result.onlyOriginal.count === 0 && result.onlyRewritten.count === 0)
		return { same: true, text: `Both grammars generate the same strings of up to ${upTo}.` };
	return {
		same: false,
		text: `The grammars do not generate the same strings of up to ${upTo}.`
	};
}
