/**
 * The bounded check "do both grammars generate the same strings?" (the
 * question the dangling-else rewrite poses). It lists every sentence of up to
 * `maxLength` tokens of both grammars, which takes long enough to be felt, so
 * the page runs it in a Web Worker through WorkerTask: the request and the
 * result are plain data.
 */
import { compareGrammars, parseGrammar, printSymbols } from '$lib/theory/grammar';

export const MIN_LENGTH = 1;
export const MAX_LENGTH = 9;
export const DEFAULT_LENGTH = 7;
/** Sentences listed per side when the grammars differ. */
export const LIST_LIMIT = 12;

export interface CompareRequest {
	/** The original grammar's text. */
	original: string;
	/** The rewritten grammar's text. */
	rewritten: string;
	maxLength: number;
}

export type CompareResult =
	/** A grammar is missing or has errors: nothing to compare. */
	| { status: 'none' }
	| {
			status: 'done';
			/** Longest sentence length that was compared completely; below `maxLength` when the work limit was reached. */
			checkedUpTo: number;
			maxLength: number;
			/** Sentences only the original grammar generates: how many, and the first few as text. */
			onlyOriginal: { count: number; examples: string[] };
			onlyRewritten: { count: number; examples: string[] };
	  };

export const clampLength = (n: number): number =>
	Number.isFinite(n) ? Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(n))) : DEFAULT_LENGTH;

const side = (sentences: string[][]) => ({
	count: sentences.length,
	examples: sentences.slice(0, LIST_LIMIT).map((s) => printSymbols(s))
});

/** Compares the two grammars up to `maxLength` tokens. */
export function compareTexts(request: CompareRequest): CompareResult {
	if (request.original.trim() === '' || request.rewritten.trim() === '') return { status: 'none' };
	const a = parseGrammar(request.original).grammar;
	const b = parseGrammar(request.rewritten).grammar;
	if (!a || !b) return { status: 'none' };
	const maxLength = clampLength(request.maxLength);
	const result = compareGrammars(a, b, { maxLength });
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
