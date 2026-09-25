/**
 * "What happens if we remove all whitespace and all comments prior to
 * lexing?" (Lexical Analysis, slide 12). Stripping first deletes every lexeme
 * of a dropped rule, then scans what is left; the token streams are compared
 * to show where tokens fused.
 */
import type { ScanToken } from '$lib/theory/automata';
import { formatTokenPair, type TokenFormat } from '$lib/components/ui/token-format';
import type { LexRun } from './scan';

export interface Stripped {
	/** The input with every dropped lexeme removed. */
	text: string;
	/** Ranges of the input that were removed, in order. */
	removed: { start: number; end: number }[];
}

/**
 * Removes every lexeme that `run` matched with a dropped rule. Text after the
 * point where the scan got stuck is kept as it is.
 */
export function stripDropped(run: LexRun): Stripped {
	let text = '';
	const removed: Stripped['removed'] = [];
	let last = 0;
	for (const t of run.tokens) {
		if (t.skipped) {
			text += run.text.slice(last, t.start);
			removed.push({ start: t.start, end: t.end });
			last = t.end;
		}
	}
	text += run.text.slice(last);
	return { text, removed };
}

const key = (t: ScanToken) => `${t.name}\u0000${t.lexeme}`;

/**
 * Compares two token streams (reported tokens only) by (name, lexeme) with a
 * longest common subsequence. `changedA[i]` / `changedB[i]` flag the tokens
 * (indices into `a` / `b`) that are not part of it; dropped tokens are never
 * flagged.
 */
export function diffTokens(
	a: readonly ScanToken[],
	b: readonly ScanToken[]
): { changedA: boolean[]; changedB: boolean[]; same: boolean } {
	const ia = a.flatMap((t, i) => (t.skipped ? [] : [i]));
	const ib = b.flatMap((t, i) => (t.skipped ? [] : [i]));
	const n = ia.length;
	const m = ib.length;
	// lcs[i][j] = LCS length of ia[i:] and ib[j:].
	const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] =
				key(a[ia[i]]) === key(b[ib[j]])
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const changedA = a.map(() => false);
	const changedB = b.map(() => false);
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (key(a[ia[i]]) === key(b[ib[j]])) {
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			changedA[ia[i++]] = true;
		} else {
			changedB[ib[j++]] = true;
		}
	}
	while (i < n) changedA[ia[i++]] = true;
	while (j < m) changedB[ib[j++]] = true;
	return { changedA, changedB, same: !changedA.some(Boolean) && !changedB.some(Boolean) };
}

/** Diffs of more tokens than this are not computed (the table is quadratic). */
export const MAX_DIFF_TOKENS = 600;

/**
 * One sentence about the difference, e.g. `(Keyword, "int"), (Identifier,
 * "a"), (Integer, "2") become (Identifier, "inta2").`
 */
export function describeDiff(
	a: readonly ScanToken[],
	b: readonly ScanToken[],
	diff: ReturnType<typeof diffTokens>,
	format: TokenFormat,
	max = 6
): string {
	if (diff.same) return 'Both give the same tokens.';
	const list = (tokens: readonly ScanToken[], changed: boolean[]) => {
		const picked = tokens.filter((_, i) => changed[i]);
		const shown = picked.slice(0, max).map((t) => formatTokenPair(t, format));
		if (picked.length > max) shown.push(`${picked.length - max} more`);
		return { text: shown.join(', '), count: picked.length };
	};
	const before = list(a, diff.changedA);
	const after = list(b, diff.changedB);
	if (before.count === 0) return `Stripping first adds ${after.text}.`;
	if (after.count === 0) return `Stripping first loses ${before.text}.`;
	return `${before.text} ${before.count === 1 ? 'becomes' : 'become'} ${after.text}.`;
}
