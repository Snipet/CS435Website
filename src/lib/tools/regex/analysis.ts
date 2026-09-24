/**
 * Everything the Regular Expressions page computes from its inputs, as plain
 * functions: parsing R, R₂ and the definitions in either dialect, settling Σ,
 * building the automata, and answering the questions each view asks.
 */
import { CharSet } from '$lib/theory/charset';
import { showChar, type NamedSet } from '$lib/theory/chars';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	accepts,
	compareLanguages,
	countByLength,
	enumerate,
	formatAutomatonText,
	isEmptyLanguage,
	isFiniteLanguage,
	type Automaton,
	type Comparison
} from '$lib/theory/automata';
import {
	containsAny,
	parseDefinitions,
	parseFlexDefinitions,
	parseFlexPattern,
	parseRegex,
	printRegex,
	resolveAny,
	symbolsOf,
	type DefinitionsResult,
	type FlexDefinitionLine,
	type PrintOptions,
	type Regex
} from '$lib/theory/regex';
import type { LinkStates } from '$lib/tools/links';
import { parseAlphabet } from './alphabet';
import { derive, type DeriveResult } from './derive';
import { explainRejection, type Rejection } from './explain';
import { buildLanguage, withoutTrap, type LanguageBuild } from './machines';
import type { Dialect } from './state';

/** Span source of line-level problems in the definitions editor. */
export const DEFS_SOURCE = '<definitions>';

/** A name lecture notation can refer to (flex names may also contain -). */
const LECTURE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

/**
 * Splits a flex definitions section into `NAME pattern` lines. Blank lines
 * and comments that open a line (`/* … *\/`, which may span lines) are
 * skipped.
 */
export function splitFlexDefinitions(text: string): {
	lines: FlexDefinitionLine[];
	diagnostics: Diagnostic[];
} {
	const lines: FlexDefinitionLine[] = [];
	const diagnostics: Diagnostic[] = [];
	let offset = 0;
	// Offset of an open /* whose */ has not been seen yet.
	let comment: number | null = null;
	text.split('\n').forEach((raw, idx) => {
		// `content` is the rest of the line still to read; `base` is its offset in `text`.
		let base = offset;
		let content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		offset += raw.length + 1;
		if (comment !== null) {
			const close = content.indexOf('*/');
			if (close < 0) return;
			comment = null;
			base += close + 2;
			content = content.slice(close + 2);
		}
		for (;;) {
			const lead = content.length - content.trimStart().length;
			if (!content.startsWith('/*', lead)) break;
			const close = content.indexOf('*/', lead + 2);
			if (close < 0) {
				comment = base + lead;
				return;
			}
			base += close + 2;
			content = content.slice(close + 2);
		}
		const m = /^(\s*)(\S+)([ \t]*)(.*?)\s*$/.exec(content);
		if (!m) return;
		const nameStart = base + m[1].length;
		lines.push({
			name: m[2],
			text: m[4],
			line: idx + 1,
			nameStart,
			textStart: nameStart + m[2].length + m[3].length
		});
	});
	if (comment !== null)
		diagnostics.push({
			severity: 'error',
			message: 'comment /* is never closed',
			span: { start: comment, end: comment + 2, source: DEFS_SOURCE }
		});
	return { lines, diagnostics };
}

/** Regular definitions in either dialect; spans index into `text`. */
export function parseDefs(text: string, dialect: Dialect): DefinitionsResult {
	if (dialect === 'lecture') return parseDefinitions(text);
	const split = splitFlexDefinitions(text);
	const result = parseFlexDefinitions(split.lines);
	return { ...result, diagnostics: [...split.diagnostics, ...result.diagnostics] };
}

// ---------------------------------------------------------------------------
// R and R₂
// ---------------------------------------------------------------------------

export interface ParsedExpression {
	/** Null when there are errors (or nothing was typed). */
	regex: Regex | null;
	diagnostics: Diagnostic[];
}

/** Parses R (or R₂) in the dialect, with the definitions in scope. */
export function parseExpression(
	text: string,
	dialect: Dialect,
	defs: DefinitionsResult
): ParsedExpression {
	const scope = { defs: defs.defs, invalid: defs.invalid };
	if (dialect === 'lecture') {
		const res = parseRegex(text, scope);
		return { regex: res.ok ? res.regex : null, diagnostics: res.diagnostics };
	}
	const res = parseFlexPattern(text, scope);
	if (!res.ok) return { regex: null, diagnostics: res.diagnostics };
	const diagnostics = [...res.diagnostics];
	const at = (start: number, end: number) => ({ start, end, source: null });
	const p = res.pattern;
	if (p.bol)
		diagnostics.push({
			severity: 'error',
			message: '^ ties a flex rule to the start of a line; anchors are not part of an RE here',
			span: at(0, 1)
		});
	if (p.eol) {
		const end = text.trimEnd().length;
		diagnostics.push({
			severity: 'error',
			message: '$ ties a flex rule to the end of a line; anchors are not part of an RE here',
			span: at(end - 1, end)
		});
	}
	if (p.trailing) {
		const slash = text.lastIndexOf('/', p.trailing.span?.start ?? text.length);
		diagnostics.push({
			severity: 'error',
			message: 'trailing context r/s belongs in a flex rule; it is not part of an RE here',
			span: at(Math.max(0, slash), p.trailing.span?.end ?? text.length)
		});
	}
	return { regex: hasErrors(diagnostics) ? null : p.regex, diagnostics };
}

// ---------------------------------------------------------------------------
// The whole expression: definitions, R, Σ, automata
// ---------------------------------------------------------------------------

export interface ExpressionInput {
	re: string;
	defs: string;
	dialect: Dialect;
	alphabet: string;
}

export interface Sigma {
	set: CharSet;
	/** Typed in the Σ field (otherwise inferred from R). */
	declared: boolean;
}

export interface ExpressionAnalysis {
	dialect: Dialect;
	defs: DefinitionsResult;
	re: ParsedExpression;
	/** Problems with Σ: its own syntax, Σ needed but missing, symbols of R not in Σ. */
	alphabetDiagnostics: Diagnostic[];
	/** Null when Σ has errors, or is needed (R uses Σ) but not given. */
	sigma: Sigma | null;
	/** Symbols of R (shown greyed when Σ is not typed). */
	inferred: CharSet | null;
	/** R with Σ replaced by the alphabet; null when R or Σ has errors. */
	resolved: Regex | null;
	/** Automata for `resolved`, or a size report. */
	language: LanguageBuild | null;
	/** How sub-expressions are printed: dialect, bare symbols when R is written that way. */
	print: PrintOptions;
}

const QUOTE = /['‘’"“”]/;

export function analyzeExpression(input: ExpressionInput): ExpressionAnalysis {
	const { dialect } = input;
	const defs = parseDefs(input.defs, dialect);
	const re = parseExpression(input.re, dialect, defs);
	const typed = parseAlphabet(input.alphabet, defs.defs);
	const alphabetDiagnostics = [...typed.diagnostics];
	const regex = re.regex;
	const print: PrintOptions = {
		dialect,
		symbols:
			dialect === 'lecture' && !QUOTE.test(input.re) && !QUOTE.test(input.defs) ? 'bare' : 'quoted',
		names: [...defs.defs.keys()]
	};

	const inferred = regex ? symbolsOf(regex) : null;
	const usesAny = regex ? containsAny(regex) : false;
	let sigma: Sigma | null = null;
	if (typed.set) sigma = { set: typed.set, declared: true };
	else if (typed.blank && inferred && !usesAny) sigma = { set: inferred, declared: false };
	if (usesAny && typed.blank)
		alphabetDiagnostics.push({
			severity: 'error',
			message: 'R uses Σ, so Σ must be given, e.g. { 0, 1 }'
		});
	if (sigma?.declared && inferred) {
		const outside = inferred.subtract(sigma.set);
		if (!outside.isEmpty)
			alphabetDiagnostics.push({
				severity: 'warning',
				message: `R uses ${listSymbols(outside)}, not in Σ`
			});
	}
	const resolved = regex && sigma ? (usesAny ? resolveAny(regex, sigma.set) : regex) : null;
	const language = resolved
		? buildLanguage(resolved, { alphabet: sigma?.declared ? sigma.set : undefined })
		: null;
	return { dialect, defs, re, alphabetDiagnostics, sigma, inferred, resolved, language, print };
}

/** 3224 → "3,224" (the same on the server and in every browser locale). */
export function groupDigits(n: bigint | number): string {
	return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `' ', '\t'`, or `'a', 'b', 'c', 'd' and 4 more`. */
export function listSymbols(set: CharSet, max = 4): string {
	const text = [...set.codePoints(max)].map((cp) => `'${showChar(cp, 'quoted')}'`).join(', ');
	return set.size > max ? `${text} and ${set.size - max} more` : text;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface LanguageListing {
	strings: string[];
	/** More strings exist than are listed. */
	truncated: boolean;
	empty: boolean;
	finite: boolean;
	/** Number of strings when the language is finite. */
	total: bigint | null;
	/** counts[k] = number of strings of length k, k = 0 … COUNT_LENGTH. */
	counts: bigint[];
}

export const LIST_LIMIT = 200;
export const COUNT_LENGTH = 8;

/** L(M) in shortlex order up to `maxLength`, plus its size and counts per length. */
export function listLanguage(
	min: Automaton,
	maxLength: number,
	limit = LIST_LIMIT
): LanguageListing {
	const { strings, truncated } = enumerate(min, { maxLength, limit });
	const empty = isEmptyLanguage(min);
	const finite = isFiniteLanguage(min);
	// Strings of a finite language are shorter than the number of states.
	const total = finite
		? countByLength(min, min.states.length).reduce((sum, x) => sum + x, 0n)
		: null;
	return { strings, truncated, empty, finite, total, counts: countByLength(min, COUNT_LENGTH) };
}

export type Sample =
	{ ok: true; strings: string[]; truncated: boolean } | { ok: false; reason: 'sigma' | 'size' };

/** Up to `limit` strings of L(node) in shortlex order, for the selected tree node. */
export function sampleOf(node: Regex, sigma: Sigma | null, limit = 12, maxLength = 8): Sample {
	const usesAny = containsAny(node);
	if (usesAny && !sigma) return { ok: false, reason: 'sigma' };
	const r = usesAny && sigma ? resolveAny(node, sigma.set) : node;
	const built = buildLanguage(r);
	if (!built.ok) return { ok: false, reason: 'size' };
	return { ok: true, ...enumerate(built.min, { maxLength, limit }) };
}

export interface TestResult {
	member: boolean;
	/** For members: one derivation (or why none is shown). */
	derivation: DeriveResult | null;
	/** For non-members: where the string goes wrong. */
	rejection: Rejection | null;
	/** Symbols of the string not in a typed Σ. */
	outside: CharSet;
}

/** Membership of one test string, with a derivation or an explanation. */
export function evaluateTest(a: ExpressionAnalysis, s: string): TestResult | null {
	if (!a.language?.ok || !a.resolved) return null;
	const min = a.language.min;
	const member = accepts(min, s);
	const outside = a.sigma?.declared ? CharSet.of(s).subtract(a.sigma.set) : CharSet.EMPTY;
	return {
		member,
		derivation: member ? derive(a.resolved, s) : null,
		rejection: member ? null : explainRejection(min, s),
		outside
	};
}

export interface CompareAnalysis {
	r2: ParsedExpression;
	/** Automata for R₂ (or a size report); null when R₂ has errors. */
	language: LanguageBuild | null;
	/** Null unless both R and R₂ were built. */
	comparison: Comparison | null;
}

export const EXAMPLE_LIMIT = 8;

/** R₂ parsed with R's definitions and compared with R; null when R₂ is blank. */
export function analyzeCompare(a: ExpressionAnalysis, text: string): CompareAnalysis | null {
	if (text.trim() === '') return null;
	const r2 = parseExpression(text, a.dialect, a.defs);
	if (!r2.regex) return { r2, language: null, comparison: null };
	const usesAny = containsAny(r2.regex);
	if (usesAny && !a.sigma?.declared) {
		const diagnostics: Diagnostic[] = [
			...r2.diagnostics,
			{ severity: 'error', message: 'R₂ uses Σ, so Σ must be given above' }
		];
		return { r2: { regex: null, diagnostics }, language: null, comparison: null };
	}
	const resolved = usesAny && a.sigma ? resolveAny(r2.regex, a.sigma.set) : r2.regex;
	const language = buildLanguage(resolved, {
		alphabet: a.sigma?.declared ? a.sigma.set : undefined
	});
	const comparison =
		language.ok && a.language?.ok
			? compareLanguages(a.language.min, language.min, {
					exampleLimit: EXAMPLE_LIMIT,
					maxLength: COUNT_LENGTH
				})
			: null;
	return { r2, language, comparison };
}

// ---------------------------------------------------------------------------
// Switching notation
// ---------------------------------------------------------------------------

export interface DialectText {
	re: string;
	defs: string;
	compare: string;
}

/**
 * R, the definitions and R₂ rewritten in the other notation. Each part that
 * has errors (or cannot be written in the target notation) is kept as typed;
 * definitions are rewritten only when all of them are fine.
 */
export function convertDialect(text: DialectText, from: Dialect, to: Dialect): DialectText {
	if (from === to) return text;
	const defs = parseDefs(text.defs, from);
	const defsOk = !hasErrors(defs.diagnostics);
	const names = [...defs.defs.keys()];
	const canName = to === 'flex' || names.every((n) => LECTURE_NAME.test(n));
	const print = (r: Regex) => printRegex(r, { dialect: to });
	const convert = (s: string) => {
		if (s.trim() === '' || !defsOk || !canName) return s;
		const parsed = parseExpression(s, from, defs);
		return parsed.regex ? print(parsed.regex) : s;
	};
	const width = Math.max(0, ...names.map((n) => n.length)) + 2;
	const newDefs =
		defsOk && canName && text.defs.trim() !== ''
			? defs.entries
					.filter((e) => e.regex)
					.map((e) =>
						to === 'flex'
							? `${e.name.padEnd(width)}${print(e.regex!)}`
							: `${e.name} = ${print(e.regex!)}`
					)
					.join('\n')
			: text.defs;
	return { re: convert(text.re), defs: newDefs, compare: convert(text.compare) };
}

/** Definitions whose strings are single symbols (digit, letter), for naming sets of symbols. */
export function namedSymbolSets(defs: DefinitionsResult): NamedSet[] {
	const single = (r: Regex): boolean =>
		r.kind === 'chars' ||
		(r.kind === 'alt' && r.options.every(single)) ||
		(r.kind === 'ref' && single(r.body));
	return [...defs.defs]
		.filter(([, body]) => single(body))
		.map(([name, body]) => ({ name, set: symbolsOf(body) }));
}

// ---------------------------------------------------------------------------
// Links to other tools
// ---------------------------------------------------------------------------

/**
 * R and its definitions in lecture notation, for Thompson's construction: the
 * text as typed when it already is, otherwise printed from the parsed trees
 * (flex patterns, or Σ replaced by a typed alphabet). Null when R has errors.
 */
export function thompsonState(
	input: ExpressionInput,
	a: ExpressionAnalysis
): LinkStates['thompson'] | null {
	if (!a.resolved || !a.re.regex) return null;
	const usesAny = containsAny(a.re.regex);
	if (input.dialect === 'lecture' && !usesAny)
		return input.defs.trim() ? { re: input.re, defs: input.defs } : { re: input.re };
	const defs: string[] = [];
	for (const entry of a.defs.entries) {
		if (!entry.regex || a.defs.defs.get(entry.name) !== entry.regex) continue;
		if (!LECTURE_NAME.test(entry.name)) return null;
		const body = a.sigma ? resolveAny(entry.regex, a.sigma.set) : entry.regex;
		defs.push(`${entry.name} = ${printRegex(body)}`);
	}
	const re = printRegex(a.resolved);
	return defs.length ? { re, defs: defs.join('\n') } : { re };
}

/** The minimal DFA (without its trap state) in the automaton text format. */
export function automataState(
	a: ExpressionAnalysis,
	firstTest?: string
): LinkStates['automata'] | null {
	if (!a.language?.ok) return null;
	const text = formatAutomatonText(withoutTrap(a.language.min));
	return firstTest === undefined ? { text } : { text, input: firstTest };
}
