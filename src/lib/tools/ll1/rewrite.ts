/**
 * Rewriting a grammar for LL(1) without EBNF (Table-based Predictive Parsing,
 * slides 5–6): remove left recursion (right recursion is okay) and left-factor,
 * with every right-hand side a plain string of symbols, because "RHS
 * production choices must NOT contain meta-characters".
 *
 * Left recursion (Top-Down Parsing, slides 24–26):
 *
 *   A → A α1 | … | A αn | β1 | … | βm
 *
 * becomes A → β1 A’ | … | βm A’ ; A’ → α1 A’ | … | αn A’ | ε. Left recursion
 * through other non-terminals (slide 27) is removed with the general
 * algorithm: with the non-terminals in grammar order, an alternative Ai → Aj γ
 * with j < i (where Aj leads back to Ai) is replaced by δ1 γ | … | δk γ for
 * the alternatives Aj → δ1 | … | δk, then the immediate left recursion of Ai is
 * removed.
 *
 * Left factoring (Table-based Predictive Parsing, slide 6): A → αβ | αγ
 * becomes A → α A’ ; A’ → β | γ, with α the longest prefix the alternatives
 * share. A rest that is empty becomes ε, written last: E → T + E | T becomes
 * E → T X ; X → + E | ε.
 *
 * New non-terminals are named A’, A’’, … after the non-terminal they come
 * from (their key), unless `names` gives another name for that key; the
 * lecture names them X and Y.
 */
import type { Citation } from '$lib/lectures';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { leftRecursion } from '$lib/theory/grammar/analyze';
import { makeGrammar, printGrammar, printSymbols, scanGrammar } from '$lib/theory/grammar/parse';
import { END_MARKER, EPSILON, type Grammar } from '$lib/theory/grammar/types';

const PRIME = '’';

/** Alternatives one non-terminal may get by substitution before the general algorithm stops. */
export const MAX_ALTERNATIVES = 200;

type Alt = readonly string[];

interface Rule {
	lhs: string;
	alts: Alt[];
}

export type RewriteKind = 'left-recursion' | 'substitution' | 'left-factor' | 'dropped';

/** One step of the rewrite: the rules of a non-terminal before and after, and what was done. */
export interface RewriteChange {
	kind: RewriteKind;
	nonterminal: string;
	/** The rule before the step, as text (`E → T + E | T`). */
	before: string[];
	/** The rules that replace it; a new non-terminal has a line of its own. */
	after: string[];
	/** What was done, in words. */
	text: string;
	cite?: Citation;
}

/** A non-terminal the rewrite made. */
export interface FreshName {
	/** Its default name (`E’`), also the key of `names`. */
	key: string;
	/** The non-terminal it was made for. */
	base: string;
	/** The name it has in the result. */
	name: string;
	/** Why the name asked for in `names` was not used; null when it was (or none was asked for). */
	error: string | null;
}

export interface LL1Rewrite {
	/** The rewritten grammar. */
	grammar: Grammar;
	/** The rewritten grammar as text, one non-terminal per line. */
	text: string;
	/** The grammar before, in the same form. */
	before: string;
	changes: RewriteChange[];
	fresh: FreshName[];
	/** What could not be done, and why. */
	notes: Diagnostic[];
}

const list = (parts: readonly string[]): string =>
	new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);

const sameAlt = (a: Alt, b: Alt): boolean => a.length === b.length && a.every((s, i) => s === b[i]);

function distinct(alts: readonly Alt[]): Alt[] {
	const out: Alt[] = [];
	for (const alt of alts) if (!out.some((seen) => sameAlt(seen, alt))) out.push(alt);
	return out;
}

/** One rule per non-terminal, in grammar order, alternatives in the order written. */
function rulesOf(g: Grammar): Rule[] {
	return g.nonterminals.map((lhs) => ({
		lhs,
		alts: distinct(g.productions.filter((p) => p.lhs === lhs).map((p) => p.rhs))
	}));
}

/** `E → T X | ε`, with the names of `rename`. */
function ruleText(rule: Rule, rename: (s: string) => string = (s) => s): string {
	const alt = (a: Alt) => printSymbols(a.map(rename));
	return `${printSymbols([rename(rule.lhs)])} → ${rule.alts.map(alt).join(' | ')}`;
}

/**
 * The name typed for a new non-terminal, read as grammar text reads a symbol
 * (`X'` is `X’`), or why it cannot be used. `taken` holds the symbols it must
 * not be.
 */
export function readName(
	text: string,
	taken: ReadonlySet<string>
): { name: string; error: null } | { name: null; error: string } {
	const trimmed = text.trim();
	if (trimmed === '') return { name: null, error: 'Write a name for the new non-terminal.' };
	const tokens = scanGrammar(trimmed).filter((t) => t.kind !== 'comment');
	const only = tokens.length === 1 ? tokens[0] : null;
	if (only?.kind === 'epsilon') return { name: null, error: `${EPSILON} is the empty string.` };
	if (
		!only ||
		(only.kind !== 'terminal' && only.kind !== 'nonterminal') ||
		only.name === undefined ||
		only.span.start !== 0 ||
		only.span.end !== trimmed.length
	)
		return { name: null, error: 'A name is one symbol, such as X or E’.' };
	const name = only.name;
	if (name === END_MARKER)
		return { name: null, error: `${END_MARKER} marks the end of the input.` };
	if (!/[\p{L}\p{N}]/u.test(name))
		return { name: null, error: 'A name has a letter or a digit, such as X or E’.' };
	if (taken.has(name))
		return { name: null, error: `${printSymbols([name])} is already a symbol of the grammar.` };
	return { name, error: null };
}

interface Draft {
	kind: RewriteKind;
	nonterminal: string;
	before: Rule[];
	after: Rule[];
	text: (name: (s: string) => string) => string;
	cite?: Citation;
}

const LEFT_RECURSION_CITE: Citation = { deck: '11', slide: [24, 26] };
const SUBSTITUTION_CITE: Citation = { deck: '11', slide: 27 };
const LEFT_FACTOR_CITE: Citation = { deck: '12', slide: 6 };

/**
 * Removes left recursion and left-factors `g` without EBNF (Table-based
 * Predictive Parsing, slides 5–6). `names` maps the default name of a new
 * non-terminal (`E’`) to the name it should have (`X`); a name that is not a
 * single symbol, or that the grammar or another new non-terminal already
 * uses, is not taken (`fresh[i].error` says why).
 */
export function rewriteForLL1(
	g: Grammar,
	opts: { names?: Readonly<Record<string, string>> } = {}
): LL1Rewrite {
	const rules = rulesOf(g);
	const symbols = new Set([...g.nonterminals, ...g.terminals]);
	const used = new Set(symbols);
	const fresh: { key: string; base: string }[] = [];
	const freshName = (base: string): string => {
		let name = base + PRIME;
		while (used.has(name)) name += PRIME;
		used.add(name);
		fresh.push({ key: name, base });
		return name;
	};
	const drafts: Draft[] = [];
	const notes: Diagnostic[] = [];

	// ── left recursion ──
	let current = rules;
	if (leftRecursion(g).length > 0) current = removeLeftRecursion(rules, freshName, drafts, notes);

	// ── left factoring ──
	const factored: Rule[] = [];
	const factor = (rule: Rule): void => {
		const groups: Alt[][] = [];
		const byFirst = new Map<string, Alt[]>();
		for (const alt of rule.alts) {
			if (alt.length === 0) {
				groups.push([alt]);
				continue;
			}
			const group = byFirst.get(alt[0]);
			if (group) group.push(alt);
			else {
				const fresh = [alt];
				byFirst.set(alt[0], fresh);
				groups.push(fresh);
			}
		}
		if (groups.every((group) => group.length === 1)) {
			factored.push(rule);
			return;
		}
		const made: Rule[] = [];
		const parts: ((name: (s: string) => string) => string)[] = [];
		const alts = groups.map((group) => {
			if (group.length === 1) return group[0];
			let n = 0;
			while (group.every((alt) => n < alt.length && alt[n] === group[0][n])) n++;
			const prefix = group[0].slice(0, n);
			const rests = group.map((alt) => alt.slice(n));
			const tail: Rule = {
				lhs: freshName(rule.lhs),
				alts: [
					...distinct(rests.filter((r) => r.length > 0)),
					...(rests.some((r) => r.length === 0) ? [[]] : [])
				]
			};
			made.push(tail);
			parts.push(
				(name) =>
					`${list(group.map((alt) => printSymbols(alt.map(name))))} share the prefix ${printSymbols(prefix.map(name))}: they become ${printSymbols([...prefix, tail.lhs].map(name))}, and the new non-terminal ${printSymbols([name(tail.lhs)])} derives what follows the prefix.`
			);
			return [...prefix, tail.lhs];
		});
		const head: Rule = { lhs: rule.lhs, alts };
		drafts.push({
			kind: 'left-factor',
			nonterminal: rule.lhs,
			before: [rule],
			after: [head, ...made],
			text: (name) => parts.map((part) => part(name)).join(' '),
			cite: LEFT_FACTOR_CITE
		});
		factored.push(head);
		for (const tail of made) factor(tail);
	};
	for (const rule of current) factor(rule);

	// ── names ──
	const names = finalNames(fresh, symbols, opts.names ?? {});
	const rename = (s: string): string => names.get(s)?.name ?? s;

	const productions = factored.flatMap((rule) =>
		rule.alts.map((alt) => ({ lhs: rename(rule.lhs), rhs: alt.map(rename) }))
	);
	const grammar = makeGrammar(productions);
	const remaining = leftRecursion(grammar);
	if (remaining.length > 0)
		notes.push({
			severity: 'warning',
			message: `Left recursion remains: ${list(remaining.map((r) => printSymbols([r.nonterminal])))}. It goes through a non-terminal that derives ε, or the general algorithm stopped.`
		});
	return {
		grammar,
		text: printGrammar(grammar),
		before: printGrammar(g),
		changes: drafts.map((d) => {
			const change: RewriteChange = {
				kind: d.kind,
				nonterminal: rename(d.nonterminal),
				before: d.before.map((r) => ruleText(r, rename)),
				after: d.after.map((r) => ruleText(r, rename)),
				text: d.text(rename)
			};
			if (d.cite) change.cite = d.cite;
			return change;
		}),
		fresh: fresh.map(({ key, base }) => ({
			key,
			base: rename(base),
			name: rename(key),
			error: names.get(key)?.error ?? null
		})),
		notes
	};
}

/** The name of each new non-terminal: the one asked for when it can be used, else its key. */
function finalNames(
	fresh: readonly { key: string; base: string }[],
	symbols: ReadonlySet<string>,
	asked: Readonly<Record<string, string>>
): Map<string, { name: string; error: string | null }> {
	const wanted = fresh.map(({ key }) => {
		const text = Object.hasOwn(asked, key) ? asked[key] : undefined;
		if (text === undefined || text === key)
			return { name: key, error: null as string | null, asked: false };
		const read = readName(text, symbols);
		return read.name === null
			? { name: key, error: read.error as string | null, asked: false }
			: { name: read.name, error: null as string | null, asked: true };
	});
	const askedLater = (i: number, name: string): boolean =>
		wanted.slice(i + 1).some((w) => w.asked && w.name === name);
	const out = new Map<string, { name: string; error: string | null }>();
	const taken = new Set(symbols);
	fresh.forEach(({ key }, i) => {
		let { name, error, asked: own } = wanted[i];
		// Two new non-terminals cannot share a name: the first one keeps it.
		if (own && taken.has(name)) {
			error = `${printSymbols([name])} is the name of another new non-terminal.`;
			name = key;
			own = false;
		}
		// A default name can be one that another new non-terminal asked for.
		if (!own) while (taken.has(name) || askedLater(i, name)) name += PRIME;
		taken.add(name);
		out.set(key, { name, error });
	});
	return out;
}

/** The general algorithm (with the rule of slides 24–26 for each non-terminal in turn). */
function removeLeftRecursion(
	rules: readonly Rule[],
	freshName: (base: string) => string,
	drafts: Draft[],
	notes: Diagnostic[]
): Rule[] {
	const current = new Map(rules.map((rule) => [rule.lhs, { rule, extra: [] as Rule[] }]));
	const sequence = rules.map((rule) => rule.lhs);
	/** `from` derives a string that starts with `to`, following first symbols of the rules as they stand. */
	const leadsTo = (from: string, to: string): boolean => {
		const seen = new Set([from]);
		const queue = [from];
		for (let next = 0; next < queue.length; next++) {
			for (const alt of current.get(queue[next])?.rule.alts ?? []) {
				const first = alt[0];
				if (first === undefined) continue;
				if (first === to) return true;
				if (seen.has(first) || !current.has(first)) continue;
				seen.add(first);
				queue.push(first);
			}
		}
		return false;
	};
	let stopped = false;
	let substituted = false;
	for (let i = 0; i < sequence.length && !stopped; i++) {
		const ai = sequence[i];
		const entry = current.get(ai)!;
		for (let j = 0; j < i; j++) {
			const aj = sequence[j];
			const source = current.get(aj)!.rule;
			if (!entry.rule.alts.some((alt) => alt[0] === aj)) continue;
			if (!leadsTo(aj, ai)) continue;
			const alts = distinct(
				entry.rule.alts.flatMap((alt) =>
					alt[0] === aj ? source.alts.map((delta) => [...delta, ...alt.slice(1)]) : [alt]
				)
			);
			if (alts.length > MAX_ALTERNATIVES) {
				stopped = true;
				notes.push({
					severity: 'warning',
					message: `Substituting ${printSymbols([aj])} into ${printSymbols([ai])} gives more than ${MAX_ALTERNATIVES} alternatives. The rewrite stops removing left recursion here.`
				});
				break;
			}
			const before = entry.rule;
			entry.rule = { lhs: ai, alts };
			substituted = true;
			drafts.push({
				kind: 'substitution',
				nonterminal: ai,
				before: [before],
				after: [entry.rule],
				text: (name) =>
					`${printSymbols([name(aj)])} comes before ${printSymbols([name(ai)])} and leads back to it. Where an alternative of ${printSymbols([name(ai)])} starts with ${printSymbols([name(aj)])}, that ${printSymbols([name(aj)])} is replaced by each of its alternatives: ${source.alts.map((a) => printSymbols(a.map(name))).join(' | ')}.`,
				cite: SUBSTITUTION_CITE
			});
		}
		if (stopped) break;
		const removal = removeImmediate(entry.rule, freshName);
		if (removal.draft) drafts.push(removal.draft);
		if (removal.note) notes.push(removal.note);
		entry.rule = removal.rules[0];
		entry.extra = removal.rules.slice(1);
	}
	let out = rules.flatMap((rule) => {
		const entry = current.get(rule.lhs)!;
		return [entry.rule, ...entry.extra];
	});
	// A rule that was substituted everywhere it was used is not needed any more.
	if (substituted) {
		const before = reachable(rules);
		const after = reachable(out);
		out = out.filter((rule) => {
			if (after.has(rule.lhs) || !before.has(rule.lhs)) return true;
			drafts.push({
				kind: 'dropped',
				nonterminal: rule.lhs,
				before: [rule],
				after: [],
				text: (name) =>
					`No rule that ${printSymbols([name(rules[0].lhs)])} reaches uses ${printSymbols([name(rule.lhs)])} any more, so its rule is dropped.`
			});
			return false;
		});
	}
	return out;
}

/** The non-terminals the rules reach from the first one, the start symbol. */
function reachable(rules: readonly Rule[]): Set<string> {
	const byName = new Map(rules.map((rule) => [rule.lhs, rule]));
	const seen = new Set([rules[0].lhs]);
	const queue = [rules[0].lhs];
	for (let next = 0; next < queue.length; next++)
		for (const alt of byName.get(queue[next])?.alts ?? [])
			for (const s of alt)
				if (byName.has(s) && !seen.has(s)) {
					seen.add(s);
					queue.push(s);
				}
	return seen;
}

/** A → A α | β becomes A → β A’ ; A’ → α A’ | ε (Top-Down Parsing, slides 24–26). */
function removeImmediate(
	rule: Rule,
	freshName: (base: string) => string
): { rules: Rule[]; draft: Draft | null; note: Diagnostic | null } {
	const lhs = rule.lhs;
	const recursive = rule.alts.filter((alt) => alt[0] === lhs);
	if (recursive.length === 0) return { rules: [rule], draft: null, note: null };
	const alphas = distinct(recursive.map((alt) => alt.slice(1)).filter((alt) => alt.length > 0));
	const betas = rule.alts.filter((alt) => alt[0] !== lhs);
	if (betas.length === 0)
		return {
			rules: [rule],
			draft: null,
			note: {
				severity: 'warning',
				message: `Every alternative of ${printSymbols([lhs])} starts with ${printSymbols([lhs])}, so it derives no string of terminals and there is no β to start from. Its rule is left as it is.`
			}
		};
	if (alphas.length === 0) {
		// Only A → A: it replaces A by itself and adds no string.
		const kept: Rule = { lhs, alts: betas };
		return {
			rules: [kept],
			draft: {
				kind: 'dropped',
				nonterminal: lhs,
				before: [rule],
				after: [kept],
				text: (name) =>
					`${printSymbols([name(lhs)])} → ${printSymbols([name(lhs)])} replaces ${printSymbols([name(lhs)])} by itself and adds no string, so it is dropped.`
			},
			note: null
		};
	}
	const primed = freshName(lhs);
	const head: Rule = { lhs, alts: betas.map((beta) => [...beta, primed]) };
	const tail: Rule = { lhs: primed, alts: [...alphas.map((alpha) => [...alpha, primed]), []] };
	return {
		rules: [head, tail],
		draft: {
			kind: 'left-recursion',
			nonterminal: lhs,
			before: [rule],
			after: [head, tail],
			text: (name) => {
				const show = (alts: readonly Alt[]) => list(alts.map((a) => printSymbols(a.map(name))));
				const a = printSymbols([name(lhs)]);
				return `${a} has the form A → A α | β with ${alphas.length === 1 ? 'α' : 'the α'} = ${show(alphas)} and ${betas.length === 1 ? 'β' : 'the β'} = ${show(betas)}. Each β is followed by the new non-terminal ${printSymbols([name(primed)])}, which derives any number of α with right recursion.`;
			},
			cite: LEFT_RECURSION_CITE
		},
		note: null
	};
}
