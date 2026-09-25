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
	shortestAccepted,
	type Automaton,
	type Comparison
} from '$lib/theory/automata';
import {
	children,
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
import {
	buildLanguage,
	MAX_PRODUCT,
	productSize,
	withoutTrap,
	type LanguageBuild
} from './machines';
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
	const notes = result.entries.flatMap((e) => (e.regex ? flexSigmaNotes(e.regex) : []));
	return { ...result, diagnostics: [...split.diagnostics, ...result.diagnostics, ...notes] };
}

/**
 * flex has no Σ: a bare Σ in a flex pattern is the character Σ. One note per
 * such symbol written in `r` itself (not in the definitions it uses).
 */
export function flexSigmaNotes(r: Regex): Diagnostic[] {
	const notes: Diagnostic[] = [];
	const go = (node: Regex) => {
		if (node.kind === 'chars' && node.text === 'Σ')
			notes.push({
				severity: 'info',
				message: 'in flex, Σ is the character Σ; write the alphabet as a class such as [01]',
				span: node.span
			});
		if (node.kind !== 'ref') children(node).forEach(go);
	};
	go(r);
	return notes;
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
	diagnostics.push(...flexSigmaNotes(p.regex));
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
	/** Automata for `resolved`, or a size report; null when R or Σ has errors (or with `build: false`). */
	language: LanguageBuild | null;
	/** How sub-expressions are printed: dialect, bare symbols when R is written that way. */
	print: PrintOptions;
}

const QUOTE = /['‘’"“”]/;

/**
 * Parses the inputs and settles Σ; with `build` (the default) also builds the
 * automata for L(R). Without it the result only carries the parse and its
 * diagnostics, which is cheap enough for every keystroke.
 */
export function analyzeExpression(
	input: ExpressionInput,
	{ build = true }: { build?: boolean } = {}
): ExpressionAnalysis {
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
	const language = build && regex && sigma ? languageFor(regex, sigma) : null;
	return { dialect, defs, re, alphabetDiagnostics, sigma, inferred, resolved, language, print };
}

/** Builds per node and Σ, so R and the tree node at its root share one. */
const builds = new WeakMap<Regex, Map<string, LanguageBuild>>();

/**
 * The automata for L(node) with Σ resolved, or null when the node uses Σ and
 * Σ is not settled. Results are cached per node object (a definition use
 * shares its body's), so asking again for R or a node of its tree is free.
 */
export function languageFor(node: Regex, sigma: Sigma | null): LanguageBuild | null {
	const target = node.kind === 'ref' ? node.body : node;
	const usesAny = containsAny(target);
	if (usesAny && !sigma) return null;
	const alphabet = sigma?.declared ? sigma.set : undefined;
	const key = `${usesAny ? sigma!.set.key() : ''}|${alphabet?.key() ?? '-'}`;
	let byKey = builds.get(target);
	if (!byKey) builds.set(target, (byKey = new Map()));
	const known = byKey.get(key);
	if (known) return known;
	const built = buildLanguage(usesAny ? resolveAny(target, sigma!.set) : target, { alphabet });
	byKey.set(key, built);
	return built;
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
	/** The shortest string (shortlex-first), or null when L = { }. */
	shortest: string | null;
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
	return {
		strings,
		truncated,
		empty,
		finite,
		total,
		counts: countByLength(min, COUNT_LENGTH),
		shortest: shortestAccepted(min)
	};
}

export type Sample =
	{ ok: true; strings: string[]; truncated: boolean } | { ok: false; reason: 'sigma' | 'size' };

/**
 * Up to `limit` strings of L(node) in shortlex order, for the selected tree
 * node: strings of up to `window` symbols or, when every string is longer,
 * strings of up to `window` symbols more than the shortest one.
 */
export function sampleOf(node: Regex, sigma: Sigma | null, limit = 12, window = 8): Sample {
	const built = languageFor(node, sigma);
	if (!built) return { ok: false, reason: 'sigma' };
	if (!built.ok) return { ok: false, reason: 'size' };
	const first = enumerate(built.min, { maxLength: window, limit });
	if (first.strings.length > 0 || !first.truncated) return { ok: true, ...first };
	const shortest = [...(shortestAccepted(built.min) ?? '')].length;
	return { ok: true, ...enumerate(built.min, { maxLength: shortest + window, limit }) };
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
	/** Automata for R₂ (or a size report); null when R₂ has errors or L(R) was not built. */
	language: LanguageBuild | null;
	/** Null unless both R and R₂ were built (and are small enough to compare). */
	comparison: Comparison | null;
	/** The comparison would need more than MAX_PRODUCT pairs of states, so it is not made. */
	tooLarge: boolean;
}

export const EXAMPLE_LIMIT = 8;

/** R₂ parsed with R's definitions (Σ must be typed when R₂ uses it); null when R₂ is blank. */
export function parseCompare(a: ExpressionAnalysis, text: string): ParsedExpression | null {
	if (text.trim() === '') return null;
	const r2 = parseExpression(text, a.dialect, a.defs);
	if (r2.regex && containsAny(r2.regex) && !a.sigma?.declared) {
		const diagnostics: Diagnostic[] = [
			...r2.diagnostics,
			{ severity: 'error', message: 'R₂ uses Σ, so Σ must be given above' }
		];
		return { regex: null, diagnostics };
	}
	return r2;
}

/** R₂ parsed with R's definitions and compared with R; null when R₂ is blank. */
export function analyzeCompare(a: ExpressionAnalysis, text: string): CompareAnalysis | null {
	const r2 = parseCompare(a, text);
	if (!r2) return null;
	// Without L(R) there is nothing to compare with, so R₂ is not built either.
	if (!r2.regex || !a.language?.ok)
		return { r2, language: null, comparison: null, tooLarge: false };
	const language = languageFor(r2.regex, a.sigma);
	if (!language?.ok) return { r2, language, comparison: null, tooLarge: false };
	const [ma, mb] = [a.language.min, language.min];
	if (productSize(ma, mb) > MAX_PRODUCT) return { r2, language, comparison: null, tooLarge: true };
	const comparison = compareLanguages(ma, mb, {
		exampleLimit: EXAMPLE_LIMIT,
		maxLength: COUNT_LENGTH
	});
	return { r2, language, comparison, tooLarge: false };
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
 * R, the definitions and R₂ rewritten in the other notation, with the same
 * languages. A part that has errors (or cannot be written in the target
 * notation) is kept as typed; definitions are rewritten only when all of them
 * can be, and R and R₂ only when the definitions are. flex has no Σ: a part
 * that uses Σ is written with the typed alphabet as a class (`Σ* 1` with
 * Σ = { 0, 1 } becomes `[01]*1`), or kept as typed when no valid Σ is typed.
 */
export function convertDialect(
	text: DialectText,
	from: Dialect,
	to: Dialect,
	alphabet = ''
): DialectText {
	if (from === to) return text;
	const defs = parseDefs(text.defs, from);
	const names = [...defs.defs.keys()];
	const canName = to === 'flex' || names.every((n) => LECTURE_NAME.test(n));
	const sigma = to === 'flex' ? parseAlphabet(alphabet, defs.defs).set : null;
	/** The tree to print in `to`; null when it uses Σ and there is no Σ to write it with. */
	const writable = (r: Regex): Regex | null =>
		to !== 'flex' || !containsAny(r) ? r : sigma ? resolveAny(r, sigma) : null;
	const bodies = defs.entries.flatMap((e) =>
		e.regex ? [[e.name, writable(e.regex)] as const] : []
	);
	const defsOk =
		!hasErrors(defs.diagnostics) && canName && bodies.every(([, body]) => body !== null);
	const print = (r: Regex) => printRegex(r, { dialect: to });
	const convert = (s: string) => {
		if (s.trim() === '' || !defsOk) return s;
		const parsed = parseExpression(s, from, defs);
		const tree = parsed.regex ? writable(parsed.regex) : null;
		return tree ? print(tree) : s;
	};
	const width = Math.max(0, ...names.map((n) => n.length)) + 2;
	const newDefs =
		defsOk && text.defs.trim() !== ''
			? bodies
					.map(([name, body]) =>
						to === 'flex' ? `${name.padEnd(width)}${print(body!)}` : `${name} = ${print(body!)}`
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
