/**
 * T-diagrams (Intro (cont’d), slides 3–8): a compiler translates from a source
 * language S to a target language T and is written in a host language H,
 * written here as T(S → T / H).
 *
 * Composition runs one compiler (the program) through another (the
 * translator). It is legal when the program is written in the language the
 * translator reads (or in a declared subset of it) and the translator itself
 * runs directly. The result translates the same languages as the program, and
 * is written in the translator's target:
 *
 *   T(S → T / H) through T(H → Y / Z) = T(S → T / Y)   (Z runs directly)
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { MAX_LABEL, normalizeLang, spokenLang } from './labels';

export interface TDiagram {
	/** Source language S (top-left of the crossbar). */
	source: string;
	/** Target language T (top-right of the crossbar). */
	target: string;
	/** Host language H (in the stem): what the compiler is written in. */
	host: string;
}

export type TField = keyof TDiagram;
export const FIELDS: readonly TField[] = ['source', 'target', 'host'];

/** A declaration `sub ⊆ sup`, e.g. L′ ⊆ L ("L′ is simple subset of L"). */
export interface SubsetDecl {
	sub: string;
	sup: string;
}

/** What is known about the languages: subsets, and which ones run directly. */
export interface Facts {
	subsets: readonly SubsetDecl[];
	/** Machine languages that execute directly, e.g. M and M′ (inefficient M-code). */
	runnable: readonly string[];
}

/** Rich text: plain strings, language names, and whole T-diagrams. */
export type Piece = string | { lang: string } | { t: TDiagram };

const L = (lang: string): Piece => ({ lang: normalizeLang(lang) });

/** Plain-text form of rich text (languages in their canonical spelling). */
export function piecesText(pieces: readonly Piece[]): string {
	return pieces
		.map((p) => (typeof p === 'string' ? p : 'lang' in p ? p.lang || '?' : formatT(p.t)))
		.join('');
}

/**
 * Prose with subscripted names (`M_OTHER`) marked as languages, so they are
 * drawn with a real subscript; everything else stays plain text.
 */
export function richText(text: string): Piece[] {
	const out: Piece[] = [];
	let at = 0;
	for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+]*′*_[A-Za-z0-9]+/g)) {
		if (m.index > at) out.push(text.slice(at, m.index));
		out.push({ lang: m[0] });
		at = m.index + m[0].length;
	}
	if (at < text.length) out.push(text.slice(at));
	return out;
}

/** `T(L → M / L′)`; a blank name shows as `?`. */
export function formatT(t: TDiagram): string {
	const show = (s: string) => normalizeLang(s) || '?';
	return `T(${show(t.source)} → ${show(t.target)} / ${show(t.host)})`;
}

/** A diagram with every name in its canonical spelling. */
export function normalizeT(t: TDiagram): TDiagram {
	return {
		source: normalizeLang(t.source),
		target: normalizeLang(t.target),
		host: normalizeLang(t.host)
	};
}

/** Same three languages (canonical spelling). */
export function sameT(a: TDiagram, b: TDiagram): boolean {
	return FIELDS.every((f) => normalizeLang(a[f]) === normalizeLang(b[f]));
}

/** Fields left blank. */
export function blankFields(t: TDiagram): TField[] {
	return FIELDS.filter((f) => !normalizeLang(t[f]));
}

/** Language names from a comma-separated list, canonical and without repeats. */
export function parseRunnable(text: string): string[] {
	const out: string[] = [];
	for (const part of text.split(/[,;]/)) {
		const name = normalizeLang(part);
		if (name && !out.includes(name)) out.push(name);
	}
	return out;
}

/**
 * The shortest chain `a ⊆ … ⊆ b` through the declared subsets: `[a]` when a
 * and b are the same language, null when a is not a (declared) subset of b.
 */
export function subsetChain(facts: Facts, a: string, b: string): string[] | null {
	const from = normalizeLang(a);
	const to = normalizeLang(b);
	if (!from || !to) return null;
	if (from === to) return [from];
	const up = new Map<string, string[]>();
	for (const d of facts.subsets) {
		const sub = normalizeLang(d.sub);
		const sup = normalizeLang(d.sup);
		if (!sub || !sup || sub === sup) continue;
		const list = up.get(sub) ?? [];
		if (!list.includes(sup)) list.push(sup);
		up.set(sub, list);
	}
	const parent = new Map<string, string>();
	const queue = [from];
	const seen = new Set([from]);
	while (queue.length) {
		const at = queue.shift()!;
		for (const next of up.get(at) ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			parent.set(next, at);
			if (next === to) {
				const chain = [to];
				let c = to;
				while (c !== from) {
					c = parent.get(c)!;
					chain.unshift(c);
				}
				return chain;
			}
			queue.push(next);
		}
	}
	return null;
}

/**
 * Whether code in `lang` runs directly: it is listed as runnable, or it is a
 * declared subset of a runnable language. `chain` leads from `lang` to that
 * language (`[lang]` when it is listed itself).
 */
export function runsDirectly(facts: Facts, lang: string): { ok: boolean; chain: string[] | null } {
	let best: string[] | null = null;
	for (const r of facts.runnable) {
		const chain = subsetChain(facts, lang, r);
		if (chain && (!best || chain.length < best.length)) best = chain;
	}
	return { ok: best !== null, chain: best };
}

const chainPieces = (chain: readonly string[]): Piece[] =>
	chain.flatMap((lang, i) => (i === 0 ? [L(lang)] : [' ⊆ ', L(lang)]));

/** One requirement of a composition, with the sentence that explains it. */
export interface Check {
	rule: 'complete' | 'reads' | 'runs';
	ok: boolean;
	pieces: Piece[];
}

export interface Composition {
	legal: boolean;
	/** Why it is (or is not) legal, in order: complete, reads, runs. */
	checks: Check[];
	/** T(program.source → program.target / translator.target) when legal. */
	result: TDiagram | null;
}

const FIELD_NAME: Record<TField, string> = {
	source: 'source',
	target: 'target',
	host: 'host'
};

/**
 * Runs `program` through `translator`. Legal when the program's host is the
 * translator's source language (or a declared subset of it) and the
 * translator's host runs directly.
 */
export function compose(program: TDiagram, translator: TDiagram, facts: Facts): Composition {
	const checks: Check[] = [];
	const blanks = [
		...blankFields(program).map((f) => `The compiler has no ${FIELD_NAME[f]} language.`),
		...blankFields(translator).map((f) => `The translator has no ${FIELD_NAME[f]} language.`)
	];
	if (blanks.length) {
		for (const text of blanks) checks.push({ rule: 'complete', ok: false, pieces: [text] });
		return { legal: false, checks, result: null };
	}

	const reads = subsetChain(facts, program.host, translator.source);
	if (reads && reads.length === 1) {
		checks.push({
			rule: 'reads',
			ok: true,
			pieces: [
				'The compiler is written in ',
				L(program.host),
				', and the translator reads ',
				L(translator.source),
				'.'
			]
		});
	} else if (reads) {
		checks.push({
			rule: 'reads',
			ok: true,
			pieces: [
				'The compiler is written in ',
				L(program.host),
				' and the translator reads ',
				L(translator.source),
				': ',
				...chainPieces(reads),
				'.'
			]
		});
	} else {
		const reverse = subsetChain(facts, translator.source, program.host);
		checks.push({
			rule: 'reads',
			ok: false,
			pieces: [
				'This compiler is written in ',
				L(program.host),
				', but the translator reads ',
				L(translator.source),
				...(reverse ? [', a subset of ', L(program.host)] : []),
				'.'
			]
		});
	}

	const runs = runsDirectly(facts, translator.host);
	if (runs.ok && runs.chain && runs.chain.length > 1) {
		checks.push({
			rule: 'runs',
			ok: true,
			pieces: [
				'The translator is written in ',
				L(translator.host),
				', which runs directly (',
				...chainPieces(runs.chain),
				').'
			]
		});
	} else {
		checks.push({
			rule: 'runs',
			ok: runs.ok,
			pieces: [
				'The translator is written in ',
				L(translator.host),
				runs.ok ? ', which runs directly.' : ', which does not run directly.'
			]
		});
	}

	const legal = checks.every((c) => c.ok);
	return {
		legal,
		checks,
		result: legal
			? normalizeT({ source: program.source, target: program.target, host: translator.target })
			: null
	};
}

/** "= T(L → M / M′): the same L → M compiler, now written in M′." */
export function resultPieces(program: TDiagram, result: TDiagram): Piece[] {
	return [
		{ t: result },
		': the same ',
		L(program.source),
		' → ',
		L(program.target),
		' compiler, now written in ',
		L(result.host),
		'.'
	];
}

/**
 * What Compose announces: the result, and that the goal is reached when the
 * result is the goal; or why the pair does not compose.
 */
export function composeMessage(
	program: TDiagram,
	translator: TDiagram,
	c: Composition,
	goal: TDiagram | null
): string {
	const pair = `${formatT(program)} compiled with ${formatT(translator)}`;
	if (c.result) {
		const reached = goalMet(goal, [c.result]) ? ' The goal is reached.' : '';
		return `${pair} gives ${formatT(c.result)}.${reached}`;
	}
	const failed = c.checks.find((x) => !x.ok);
	const why = failed ? ` ${piecesText(failed.pieces)}` : '';
	return `${formatT(program)} does not compose with ${formatT(translator)}.${why}`;
}

/** Whether `goal` is one of `diagrams` (a goal with blanks is never met). */
export function goalMet(goal: TDiagram | null, diagrams: readonly (TDiagram | null)[]): boolean {
	if (!goal || blankFields(goal).length) return false;
	return diagrams.some((d) => d !== null && sameT(d, goal));
}

/** "compiler from L to M, written in L′" (for screen readers). */
export function describeT(t: TDiagram): string {
	return `from ${spokenLang(t.source)} to ${spokenLang(t.target)}, written in ${spokenLang(t.host)}`;
}

/** Where a workbench problem is, so the editor can mark the field. */
export type IssueTarget =
	| { kind: 'diagram'; index: number; field?: TField }
	| { kind: 'subset'; index: number; side?: 'sub' | 'sup' }
	| { kind: 'goal'; field?: TField }
	| { kind: 'runnable' };

export interface WorkbenchIssue extends Diagnostic {
	target: IssueTarget;
}

export interface WorkbenchInput {
	toolbox: readonly TDiagram[];
	subsets: readonly SubsetDecl[];
	runnable: string;
	goal: TDiagram | null;
}

const FIELD_WORD: Record<TField, string> = {
	source: 'a source language',
	target: 'a target language',
	host: 'a host language'
};

/** Problems with the toolbox, the language facts, and the goal. */
export function checkWorkbench(input: WorkbenchInput): WorkbenchIssue[] {
	const issues: WorkbenchIssue[] = [];
	const long = (s: string) => [...s.trim()].length > MAX_LABEL;
	input.toolbox.forEach((t, index) => {
		for (const field of FIELDS) {
			if (!normalizeLang(t[field])) {
				issues.push({
					severity: 'warning',
					message: `Diagram ${index + 1} needs ${FIELD_WORD[field]}.`,
					target: { kind: 'diagram', index, field }
				});
			} else if (long(t[field])) {
				issues.push({
					severity: 'error',
					message: `Diagram ${index + 1}: names are at most ${MAX_LABEL} characters.`,
					target: { kind: 'diagram', index, field }
				});
			}
		}
	});
	input.subsets.forEach((d, index) => {
		const sub = normalizeLang(d.sub);
		const sup = normalizeLang(d.sup);
		if (!sub || !sup) {
			// A half-filled declaration points at its blank side; a new, empty one at neither.
			const side = sub ? 'sup' : sup ? 'sub' : undefined;
			issues.push({
				severity: 'warning',
				message: `Subset ${index + 1} needs a language on both sides of ⊆.`,
				target: side ? { kind: 'subset', index, side } : { kind: 'subset', index }
			});
		} else if (sub === sup) {
			issues.push({
				severity: 'warning',
				message: `${sub} ⊆ ${sup} adds nothing: every language is a subset of itself.`,
				target: { kind: 'subset', index }
			});
		} else if (subsetChain({ subsets: input.subsets, runnable: [] }, sup, sub)) {
			issues.push({
				severity: 'warning',
				message: `${sub} ⊆ ${sup} and ${sup} ⊆ ${sub}: each one reads the other.`,
				target: { kind: 'subset', index }
			});
		}
	});
	if (input.goal) {
		for (const field of FIELDS) {
			if (!normalizeLang(input.goal[field])) {
				issues.push({
					severity: 'warning',
					message: `The goal needs ${FIELD_WORD[field]}.`,
					target: { kind: 'goal', field }
				});
			}
		}
	}
	return issues;
}
