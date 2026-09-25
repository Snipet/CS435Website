/**
 * The Regular Expressions page's DFA-based views as one computation that runs
 * in a worker (views.worker.ts): L(R) listed and counted, the test strings,
 * the comparison with R₂, and the strings of the selected tree node. Parsing,
 * diagnostics and the syntax tree stay on the page (`analyzeExpression` with
 * `build: false`), which is cheap enough for every keystroke.
 *
 * Results are plain data (they are copied between threads); `testRows` turns
 * the test results back into engine objects against the page's own parse.
 */
import {
	charSetFromPlain,
	charSetToPlain,
	formatAutomatonText,
	type Comparison,
	type PlainCharSet
} from '$lib/theory/automata';
import { nodeAtPath, type Regex } from '$lib/theory/regex';
import {
	analyzeCompare,
	analyzeExpression,
	evaluateTest,
	listLanguage,
	sampleOf,
	type ExpressionAnalysis,
	type ExpressionInput,
	type LanguageListing,
	type Sample,
	type TestResult
} from './analysis';
import type { Derivation, DeriveResult } from './derive';
import type { Rejection } from './explain';
import { withoutTrap, type LanguageStatus } from './machines';

export interface ViewsRequest extends ExpressionInput {
	/** R₂ as typed. */
	compare: string;
	tests: string[];
	/** Longest string listed in the Language view. */
	maxLength: number;
	/** Path of the selected tree node, whose strings are listed. */
	node: number[];
}

/** L(R) for the Language view, or why it was not built. */
export type LanguageSummary =
	| {
			ok: true;
			/** States of the minimal DFA, without its trap state. */
			states: number;
			listing: LanguageListing;
			/** The minimal DFA (without its trap state) in the automaton text format. */
			automataText: string;
	  }
	| Extract<LanguageStatus, { ok: false }>;

/** The comparison of L(R) with L(R₂), without the automata. */
export interface CompareSummary {
	/** Whether L(R₂) was built; null when R₂ has errors or L(R) was not built. */
	language: LanguageStatus | null;
	comparison: Comparison | null;
	tooLarge: boolean;
}

export interface PlainDerivation {
	/** Child indices from the root, as in the syntax tree (the node itself is not sent). */
	path: number[];
	start: number;
	end: number;
	children: PlainDerivation[];
}

export type PlainDeriveResult =
	Exclude<DeriveResult, { status: 'match' }> | { status: 'match'; tree: PlainDerivation };

type WithPlainAllowed<R> = R extends { allowed: unknown }
	? Omit<R, 'allowed'> & { allowed: PlainCharSet }
	: R;
export type PlainRejection = WithPlainAllowed<Rejection>;

export interface PlainTestResult {
	member: boolean;
	derivation: PlainDeriveResult | null;
	rejection: PlainRejection | null;
	outside: PlainCharSet;
}

/** What the worker sends back for a `ViewsRequest`. */
export interface ViewsData {
	/** Null when R or Σ has problems (the page shows why). */
	language: LanguageSummary | null;
	/** One per test string; null entries when L(R) was not built. */
	tests: (PlainTestResult | null)[];
	/** Null when R₂ is blank. */
	compare: CompareSummary | null;
	/** Strings of the node at `node`; null when there is no such node. */
	sample: Sample | null;
}

// ---------------------------------------------------------------------------
// Plain forms
// ---------------------------------------------------------------------------

function derivationToPlain(d: Derivation): PlainDerivation {
	return { path: d.path, start: d.start, end: d.end, children: d.children.map(derivationToPlain) };
}

/**
 * The derivation with its nodes looked up by path in `root` (the resolved R
 * it was derived from), or null when a path does not lead to a node.
 */
export function derivationFromPlain(p: PlainDerivation, root: Regex): Derivation | null {
	const node = nodeAtPath(root, p.path);
	if (!node) return null;
	const children: Derivation[] = [];
	for (const c of p.children) {
		const child = derivationFromPlain(c, root);
		if (!child) return null;
		children.push(child);
	}
	return { node, path: p.path, start: p.start, end: p.end, children };
}

export function testToPlain(r: TestResult): PlainTestResult {
	const d = r.derivation;
	const rej = r.rejection;
	return {
		member: r.member,
		derivation: d?.status === 'match' ? { status: 'match', tree: derivationToPlain(d.tree) } : d,
		rejection: rej && 'allowed' in rej ? { ...rej, allowed: charSetToPlain(rej.allowed) } : rej,
		outside: charSetToPlain(r.outside)
	};
}

/** A test result with its CharSets and derivation nodes back; `root` is the resolved R. */
export function testFromPlain(p: PlainTestResult, root: Regex | null): TestResult {
	const d = p.derivation;
	let derivation: DeriveResult | null;
	if (d?.status === 'match') {
		const tree = root ? derivationFromPlain(d.tree, root) : null;
		derivation = tree ? { status: 'match', tree } : null;
	} else derivation = d;
	const rej = p.rejection;
	return {
		member: p.member,
		derivation,
		rejection: rej && 'allowed' in rej ? { ...rej, allowed: charSetFromPlain(rej.allowed) } : rej,
		outside: charSetFromPlain(p.outside)
	};
}

// ---------------------------------------------------------------------------
// The computation
// ---------------------------------------------------------------------------

/** R, the definitions, the dialect and Σ: the inputs L(R) depends on. */
export function sameExpression(a: ExpressionInput, b: ExpressionInput): boolean {
	return a.re === b.re && a.defs === b.defs && a.dialect === b.dialect && a.alphabet === b.alphabet;
}

const MEMO_LIMIT = 200;

function memo<K, V>(map: Map<K, V>, key: K, make: () => V): V {
	if (map.has(key)) return map.get(key)!;
	if (map.size >= MEMO_LIMIT) map.clear();
	const value = make();
	map.set(key, value);
	return value;
}

/** Everything the views need from one expression, each part computed once. */
class ExpressionViews {
	readonly #listings = new Map<number, LanguageListing>();
	readonly #tests = new Map<string, PlainTestResult | null>();
	readonly #compares = new Map<string, CompareSummary | null>();
	readonly #samples = new Map<string, Sample | null>();
	#summary: { states: number; automataText: string } | null = null;

	constructor(
		readonly input: ExpressionInput,
		readonly analysis: ExpressionAnalysis
	) {}

	language(maxLength: number): LanguageSummary | null {
		const built = this.analysis.language;
		if (!built) return null;
		if (!built.ok) return { ok: false, stage: built.stage, limit: built.limit };
		const trimmed = (this.#summary ??= (() => {
			const dfa = withoutTrap(built.min);
			return { states: dfa.states.length, automataText: formatAutomatonText(dfa) };
		})());
		const listing = memo(this.#listings, maxLength, () => listLanguage(built.min, maxLength));
		return { ok: true, ...trimmed, listing };
	}

	test(s: string): PlainTestResult | null {
		return memo(this.#tests, s, () => {
			const r = evaluateTest(this.analysis, s);
			return r ? testToPlain(r) : null;
		});
	}

	compare(text: string): CompareSummary | null {
		return memo(this.#compares, text, () => {
			const c = analyzeCompare(this.analysis, text);
			if (!c) return null;
			const language: LanguageStatus | null = c.language
				? c.language.ok
					? { ok: true }
					: { ok: false, stage: c.language.stage, limit: c.language.limit }
				: null;
			return { language, comparison: c.comparison, tooLarge: c.tooLarge };
		});
	}

	sample(path: number[]): Sample | null {
		return memo(this.#samples, path.join('.'), () => {
			const root = this.analysis.re.regex;
			const node = root ? nodeAtPath(root, path) : undefined;
			return node ? sampleOf(node, this.analysis.sigma) : null;
		});
	}
}

/**
 * A `computeViews` that remembers the last expression: requests that change
 * only the test strings, R₂, the length or the selected node reuse its automata.
 */
export function viewsComputer(): (req: ViewsRequest) => ViewsData {
	let views: ExpressionViews | null = null;
	return (req) => {
		if (!views || !sameExpression(views.input, req)) {
			const input: ExpressionInput = {
				re: req.re,
				defs: req.defs,
				dialect: req.dialect,
				alphabet: req.alphabet
			};
			views = new ExpressionViews(input, analyzeExpression(input));
		}
		const v = views;
		return {
			language: v.language(req.maxLength),
			tests: req.tests.map((s) => v.test(s)),
			compare: v.compare(req.compare),
			sample: v.sample(req.node)
		};
	};
}

/** Everything the DFA-based views show for `req`. */
export function computeViews(req: ViewsRequest): ViewsData {
	return viewsComputer()(req);
}

// ---------------------------------------------------------------------------
// On the page
// ---------------------------------------------------------------------------

/** A test string's result as shown: `text` is the string it is for. */
export interface TestRow {
	text: string;
	result: TestResult;
	/** Computed for another string or another R: shown dimmed until the new result arrives. */
	stale: boolean;
}

/**
 * The result to show on each test row. A row shows the result for its own
 * string when there is one, otherwise the one it had (marked stale, drawn with
 * the string it is for). `root` is the resolved R that `done` was computed
 * for; `current` says whether that R is still the one typed.
 */
export function testRows(
	tests: readonly string[],
	done: { input: ViewsRequest; data: ViewsData } | null,
	root: Regex | null,
	current: boolean
): (TestRow | null)[] {
	if (!done) return tests.map(() => null);
	const sent = done.input.tests;
	const first = new Map<string, number>();
	sent.forEach((t, i) => {
		if (!first.has(t)) first.set(t, i);
	});
	const revived = new Map<number, TestResult | null>();
	const resultAt = (j: number) =>
		memo(revived, j, () => {
			const plain = done.data.tests[j];
			return plain ? testFromPlain(plain, root) : null;
		});
	return tests.map((s, i) => {
		const j = sent[i] === s ? i : (first.get(s) ?? (i < sent.length ? i : -1));
		const result = j < 0 ? null : resultAt(j);
		if (!result) return null;
		return { text: sent[j], result, stale: !current || sent[j] !== s };
	});
}
