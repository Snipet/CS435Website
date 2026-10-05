/**
 * Grammar rewrites of Top-Down Parsing, slides 23–27 and 36–39.
 *
 * Elimination of immediate left recursion (slides 24–26):
 *
 *   S → S α1 | … | S αn | β1 | … | βm
 *
 * becomes S → β1 S’ | … | βm S’ ; S’ → α1 S’ | … | αn S’ | ε, or, with EBNF,
 * S → β { α1 | … | αn } when there is one β. With several β the EBNF form
 * would need ( β1 | … | βm ) { … }, and parentheses are terminals in this
 * notation, so the primed form is used.
 *
 * Indirect left recursion (slide 27: S → A α | δ ; A → S β) is removed with
 * the general algorithm, which the slides leave to the text: order the
 * non-terminals, substitute earlier ones at the front of later productions,
 * then remove the immediate left recursion that appears.
 *
 * Left factoring with EBNF (slides 36, 39): alternatives with a common prefix
 * of which one is the prefix itself become `prefix [ rest ]`, so
 * A → X op A | X becomes A → X [ op A ]. Other common prefixes are factored
 * with a primed non-terminal: A → α β1 | α β2 becomes A → α A’ ; A’ → β1 | β2.
 *
 * Every rewrite returns the new grammar and the list of changes it made. A
 * result without brackets is still returned as an EBNF grammar, so that all
 * results print and parse the same way.
 */
import type { Citation } from '$lib/lectures';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { leftRecursion } from '$lib/theory/grammar/analyze';
import { ebnfToGrammar, printSymbols } from '$lib/theory/grammar/parse';
import type { EbnfGrammar, Grammar } from '$lib/theory/grammar/types';
import {
	distinct,
	ebnfOf,
	freshName,
	hasBrackets,
	isSymbol,
	itemKey,
	namesOf,
	opt,
	printAlt,
	printAlts,
	printProduction,
	printRule,
	printRules,
	printSymbol,
	rep,
	rulesOf,
	sym,
	symbolsOf,
	type Alt,
	type Item,
	type Rule
} from './ebnf';

/** How the result of removing left recursion is written. */
export type ResultForm = 'ebnf' | 'bnf';
/** Order of the non-terminals in the general algorithm. */
export type NonterminalOrder = 'written' | 'reversed';

/** Alternatives one non-terminal may get by substitution before the general algorithm gives up. */
export const MAX_ALTERNATIVES = 200;

export type ChangeKind = 'left-recursion' | 'substitution' | 'left-factor' | 'dropped';

/** One step of a rewrite: the rules of a non-terminal before and after, and what was done. */
export interface Change {
	kind: ChangeKind;
	nonterminal: string;
	/** The rule before the change. */
	before: string[];
	/** The rules that replace it; a new primed non-terminal has a line of its own. */
	after: string[];
	/** What was done, in words. */
	text: string;
	/** What the recursion implies and what it becomes (slides 38–39). */
	note?: string;
	cite?: Citation;
}

/** The result of one rewrite. */
export interface Transformed {
	grammar: EbnfGrammar;
	/** The grammar as text, one rule per line. */
	text: string;
	changes: Change[];
	/** What could not be done, and why. */
	notes: Diagnostic[];
}

const LEFT_NOTE =
	'Left recursion implies left associativity. With EBNF it becomes { }: a loop in the parser.';
const LEFT_NOTE_BNF =
	'Left recursion implies left associativity. The new non-terminal is right-recursive and derives the same strings.';
const RIGHT_NOTE =
	'Right recursion implies right associativity. With EBNF it becomes [ ]: the function calls itself, which is not a problem for recursive descent.';

const note = (severity: Diagnostic['severity'], message: string): Diagnostic => ({
	severity,
	message
});

const list = (parts: readonly string[]): string =>
	new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);

const result = (rules: readonly Rule[], changes: Change[], notes: Diagnostic[]): Transformed => ({
	grammar: ebnfOf(rules),
	text: printRules(rules),
	changes,
	notes
});

// ───────────────────────────── findings ─────────────────────────────

/** A left-recursive non-terminal with the derivation V →+ V α that shows it. */
export interface RecursionFinding {
	nonterminal: string;
	/** Some production is V → V α. */
	immediate: boolean;
	/** The productions of the derivation, in order. */
	productions: string[];
	/** Its sentential forms, from V to V α. */
	forms: string[][];
	/** `steps[i]` takes `forms[i]` to `forms[i + 1]`: the first symbol is replaced by `length` symbols. */
	steps: { index: number; length: number }[];
	/** `S →+ S b a` */
	summary: string;
}

/** Alternatives of one non-terminal that begin with the same symbols. */
export interface PrefixFinding {
	nonterminal: string;
	prefix: string[];
	/** The productions that share it. */
	productions: string[];
	/** One of them is the prefix alone, so the rest of the others becomes `[ … ]`. */
	optional: boolean;
}

/** The left-recursive non-terminals of `g`, each with its derivation (Top-Down Parsing, slides 23 and 27). */
export function recursionFindings(g: Grammar): RecursionFinding[] {
	return leftRecursion(g).map((found) => {
		const forms: string[][] = [[found.nonterminal]];
		const steps: { index: number; length: number }[] = [];
		const productions: string[] = [];
		for (const id of found.chain) {
			const p = g.productions[id];
			const form = forms[forms.length - 1];
			productions.push(`${printSymbols([p.lhs])} → ${printSymbols(p.rhs)}`);
			steps.push({ index: 0, length: p.rhs.length });
			forms.push([...p.rhs, ...form.slice(1)]);
		}
		return {
			nonterminal: found.nonterminal,
			immediate: found.immediate,
			productions,
			forms,
			steps,
			summary: `${printSymbols([found.nonterminal])} →+ ${printSymbols(forms[forms.length - 1])}`
		};
	});
}

/** Number of leading items all alternatives share. */
function commonPrefix(alts: readonly Alt[]): number {
	let n = 0;
	for (;;) {
		const first = alts[0][n];
		if (first === undefined) return n;
		const key = itemKey(first);
		if (!alts.every((alt) => alt[n] !== undefined && itemKey(alt[n]) === key)) return n;
		n++;
	}
}

/** Alternatives by their first item, in order of first appearance; ε stands alone. */
function groupByFirst(alts: readonly Alt[]): Alt[][] {
	const groups = new Map<string, Alt[]>();
	const out: Alt[][] = [];
	for (const alt of alts) {
		if (alt.length === 0) {
			out.push([alt]);
			continue;
		}
		const key = itemKey(alt[0]);
		const group = groups.get(key);
		if (group) group.push(alt);
		else {
			const fresh = [alt];
			groups.set(key, fresh);
			out.push(fresh);
		}
	}
	return out;
}

function prefixesOf(rule: Rule): PrefixFinding[] {
	return groupByFirst(distinct(rule.alts))
		.filter((group) => group.length > 1)
		.map((group) => {
			const n = commonPrefix(group);
			return {
				nonterminal: rule.lhs,
				prefix: group[0].slice(0, n).map((item) => printAlt([item])),
				productions: group.map((alt) => printProduction(rule.lhs, alt)),
				optional: group.some((alt) => alt.length === n)
			};
		});
}

/** The groups of alternatives with a common prefix (Top-Down Parsing, slide 36). */
export function prefixFindings(g: Grammar | EbnfGrammar): PrefixFinding[] {
	return rulesOf(g).flatMap(prefixesOf);
}

// ───────────────────────────── left recursion ─────────────────────────────

interface Removal {
	/** The rule, then the new primed rule if one was made. */
	rules: Rule[];
	change: Change | null;
	problem: Diagnostic | null;
}

/** Removes the left recursion of one rule (slides 24–26). `used` holds every name taken. */
function removeImmediate(rule: Rule, form: ResultForm, used: Set<string>): Removal {
	const lhs = rule.lhs;
	const name = printSymbol(lhs);
	const isRecursive = (alt: Alt): boolean => isSymbol(alt[0], lhs);
	const recursive = rule.alts.filter(isRecursive);
	if (recursive.length === 0) return { rules: [rule], change: null, problem: null };
	const before = [printRule(rule)];
	const alphas = distinct(recursive.map((alt) => alt.slice(1)).filter((alt) => alt.length > 0));
	const betas = distinct(rule.alts.filter((alt) => !isRecursive(alt)));
	if (betas.length === 0) {
		return {
			rules: [rule],
			change: null,
			problem: note(
				'warning',
				`Every alternative of ${name} starts with ${name}, so ${name} derives no string of terminals and there is no β to start from. The rule is left as it is.`
			)
		};
	}
	if (alphas.length === 0) {
		// Only S → S: it derives nothing new.
		const kept: Rule = { lhs, alts: betas };
		return {
			rules: [kept],
			change: {
				kind: 'dropped',
				nonterminal: lhs,
				before,
				after: [printRule(kept)],
				text: `${name} → ${name} replaces ${name} by itself and adds no string, so it is dropped.`
			},
			problem: null
		};
	}
	const shape =
		`${before[0]} has the form S → S α | β with ` +
		`${alphas.length === 1 ? 'α' : 'the α'} = ${list(alphas.map(printAlt))} and ` +
		`${betas.length === 1 ? 'β' : 'the β'} = ${list(betas.map(printAlt))}.`;
	if (form === 'ebnf' && betas.length === 1) {
		const loop: Rule = { lhs, alts: [[...betas[0], rep(alphas)]] };
		return {
			rules: [loop],
			change: {
				kind: 'left-recursion',
				nonterminal: lhs,
				before,
				after: [printRule(loop)],
				text: `${shape} ${name} generates all strings of the form β { α }.`,
				note: LEFT_NOTE,
				cite: { deck: '11', slide: [24, 26] }
			},
			problem: null
		};
	}
	const primed = freshName(lhs, used);
	const head: Rule = { lhs, alts: betas.map((beta) => [...beta, sym(primed)]) };
	const tail: Rule = { lhs: primed, alts: [...alphas.map((alpha) => [...alpha, sym(primed)]), []] };
	const fallback =
		form === 'ebnf'
			? ` β { α } would need ( ${printAlts(betas)} ) in front of the braces, and parentheses are terminals in this notation, so the primed form is used.`
			: '';
	return {
		rules: [head, tail],
		change: {
			kind: 'left-recursion',
			nonterminal: lhs,
			before,
			after: [printRule(head), printRule(tail)],
			text: `${shape} Rewritten with right recursion: every β is followed by the new non-terminal ${printSymbol(primed)}, which derives any number of α.${fallback}`,
			note: LEFT_NOTE_BNF,
			cite: { deck: '11', slide: [24, 26] }
		},
		problem: null
	};
}

/** The names of the non-terminals that are still left-recursive, with their derivations. */
function remaining(rules: readonly Rule[]): RecursionFinding[] {
	const own = new Set(rules.map((rule) => rule.lhs));
	return recursionFindings(ebnfToGrammar(ebnfOf(rules))).filter((f) => own.has(f.nonterminal));
}

function remainingNote(found: readonly RecursionFinding[], general: boolean): Diagnostic {
	const names = list(found.map((f) => f.summary));
	return note(
		'warning',
		general
			? `Left recursion remains: ${names}. The general algorithm needs a grammar without ε-productions and without cycles A →+ A.`
			: `Left recursion remains: ${names}. It goes through another non-terminal, so no production has the form S → S α.`
	);
}

export interface LeftRecursionOptions {
	/** `ebnf` (default): S → β { α }; `bnf`: S → β S’ ; S’ → α S’ | ε. */
	form?: ResultForm;
}

/** The pass over every rule, with the left recursion it could not remove. */
function immediatePass(
	rules: readonly Rule[],
	form: ResultForm
): Transformed & { indirect: RecursionFinding[] } {
	const used = namesOf(rules);
	const out: Rule[] = [];
	const changes: Change[] = [];
	const notes: Diagnostic[] = [];
	/** Non-terminals without a β: their left recursion stays, and a note says why. */
	const stuck = new Set<string>();
	for (const rule of rules) {
		const removal = removeImmediate(rule, form, used);
		out.push(...removal.rules);
		if (removal.change) changes.push(removal.change);
		if (removal.problem) {
			notes.push(removal.problem);
			stuck.add(rule.lhs);
		}
	}
	const indirect = remaining(out).filter((f) => !stuck.has(f.nonterminal));
	if (indirect.length > 0) notes.push(remainingNote(indirect, false));
	return { ...result(out, changes, notes), indirect };
}

/**
 * Removes immediate left recursion from every rule (Top-Down Parsing, slides
 * 24–26). Left recursion through other non-terminals is left in place and
 * named in `notes`.
 */
export function eliminateImmediateLeftRecursion(
	g: Grammar | EbnfGrammar,
	opts: LeftRecursionOptions = {}
): Transformed {
	const { grammar, text, changes, notes } = immediatePass(rulesOf(g), opts.form ?? 'ebnf');
	return { grammar, text, changes, notes };
}

export interface GeneralOptions extends LeftRecursionOptions {
	/** Order A1 … An of the non-terminals: as written (default) or reversed. */
	order?: NonterminalOrder;
}

/**
 * The general algorithm for left recursion, which Top-Down Parsing, slide 27
 * leaves to the text. With the non-terminals in the order A1 … An: for each
 * Ai, every alternative Ai → Aj γ with j < i is replaced by δ1 γ | … | δk γ,
 * where Aj → δ1 | … | δk are the alternatives of Aj at that time; then the
 * immediate left recursion of Ai is removed. An Aj that does not lead back to
 * Ai is not substituted, so rules outside the recursion stay as written. A
 * rule that the start symbol no longer reaches after a substitution is
 * dropped (S → A a | d ; A → S b in the order A, S becomes S → d { b a }).
 */
export function eliminateLeftRecursion(
	g: Grammar | EbnfGrammar,
	opts: GeneralOptions = {}
): Transformed {
	const form = opts.form ?? 'ebnf';
	const rules = rulesOf(g);
	const used = namesOf(rules);
	const changes: Change[] = [];
	const notes: Diagnostic[] = [];
	/** The rule of each non-terminal as it stands, with the primed rule made for it. */
	const current = new Map(rules.map((rule) => [rule.lhs, { rule, extra: [] as Rule[] }]));
	const sequence = rules.map((rule) => rule.lhs);
	if (opts.order === 'reversed') sequence.reverse();
	const stuck = new Set<string>();
	/** `from` derives a string that starts with `to`, following first symbols of the rules as they stand. */
	const leadsTo = (from: string, to: string): boolean => {
		const seen = new Set([from]);
		const queue = [from];
		for (let next = 0; next < queue.length; next++) {
			for (const alt of current.get(queue[next])?.rule.alts ?? []) {
				const first = alt[0];
				if (first?.kind !== 'sym') continue;
				if (first.name === to) return true;
				if (seen.has(first.name)) continue;
				seen.add(first.name);
				queue.push(first.name);
			}
		}
		return false;
	};
	let gaveUp = false;
	sequence.forEach((ai, i) => {
		const entry = current.get(ai)!;
		for (let j = 0; j < i && !gaveUp; j++) {
			const aj = sequence[j];
			const source = current.get(aj)!.rule;
			if (!entry.rule.alts.some((alt) => isSymbol(alt[0], aj))) continue;
			// Ai → Aj γ is part of a left recursion only when Aj leads back to Ai.
			if (!leadsTo(aj, ai)) continue;
			const before = printRule(entry.rule);
			const alts = distinct(
				entry.rule.alts.flatMap((alt) =>
					isSymbol(alt[0], aj) ? source.alts.map((delta) => [...delta, ...alt.slice(1)]) : [alt]
				)
			);
			if (alts.length > MAX_ALTERNATIVES) {
				gaveUp = true;
				notes.push(
					note(
						'warning',
						`Substituting ${printSymbol(aj)} into ${printSymbol(ai)} gives more than ${MAX_ALTERNATIVES} alternatives. The general algorithm stops here.`
					)
				);
				break;
			}
			entry.rule = { lhs: ai, alts };
			changes.push({
				kind: 'substitution',
				nonterminal: ai,
				before: [before],
				after: [printRule(entry.rule)],
				text: `${printSymbol(aj)} comes before ${printSymbol(ai)} in the order ${sequence.map(printSymbol).join(', ')}. Where an alternative of ${printSymbol(ai)} starts with ${printSymbol(aj)}, that ${printSymbol(aj)} is replaced by each of its alternatives: ${printAlts(source.alts)}.`,
				cite: { deck: '11', slide: 27 }
			});
		}
		if (gaveUp) return;
		const removal = removeImmediate(entry.rule, form, used);
		entry.rule = removal.rules[0];
		entry.extra = removal.rules.slice(1);
		if (removal.change) changes.push(removal.change);
		if (removal.problem) {
			notes.push(removal.problem);
			stuck.add(ai);
		}
	});
	let out = rules.flatMap((rule) => {
		const entry = current.get(rule.lhs)!;
		return [entry.rule, ...entry.extra];
	});
	// A rule that was substituted everywhere it was used is not needed any more.
	if (changes.some((change) => change.kind === 'substitution')) {
		const before = reachableFrom(rules);
		const after = reachableFrom(out);
		const start = printSymbol(rules[0].lhs);
		out = out.filter((rule) => {
			if (after.has(rule.lhs) || !before.has(rule.lhs)) return true;
			const name = printSymbol(rule.lhs);
			changes.push({
				kind: 'dropped',
				nonterminal: rule.lhs,
				before: [printRule(rule)],
				after: [],
				text: `After the substitution no rule that ${start} reaches uses ${name}, so the rule of ${name} is dropped.`
			});
			return false;
		});
	}
	const left = remaining(out).filter((f) => !stuck.has(f.nonterminal));
	if (left.length > 0 && !gaveUp) notes.push(remainingNote(left, true));
	return result(out, changes, notes);
}

/** The non-terminals the rules reach from the first one, the start symbol. */
function reachableFrom(rules: readonly Rule[]): Set<string> {
	const byName = new Map(rules.map((rule) => [rule.lhs, rule]));
	const seen = new Set([rules[0].lhs]);
	const queue = [rules[0].lhs];
	for (let next = 0; next < queue.length; next++) {
		for (const name of symbolsOf(byName.get(queue[next])?.alts ?? [])) {
			if (seen.has(name) || !byName.has(name)) continue;
			seen.add(name);
			queue.push(name);
		}
	}
	return seen;
}

// ───────────────────────────── left factoring ─────────────────────────────

interface Factoring {
	/** The non-terminal whose rule is factored: new names are its name with primes. */
	base: string;
	used: Set<string>;
	/** Primed rules made on the way, in order. */
	extra: Rule[];
	/** What was done to each group of alternatives. */
	parts: string[];
	/** A rest that became `[ … ]` ends with the non-terminal itself. */
	rightRecursive: boolean;
	/** Some group became `prefix [ rest ]`. */
	bracketed: boolean;
}

/** Left-factors a list of alternatives; brackets inside them are factored too. */
function factorAlts(alts: readonly Alt[], ctx: Factoring): Alt[] {
	const inside = (item: Item): Item =>
		item.kind === 'sym' ? item : { kind: item.kind, alts: factorAlts(item.alts, ctx) };
	return groupByFirst(distinct(alts)).map((group) => {
		if (group.length === 1) return group[0].map(inside);
		const n = commonPrefix(group);
		const prefix = group[0].slice(0, n);
		const rests = group.map((alt) => alt.slice(n));
		const others = distinct(rests.filter((rest) => rest.length > 0));
		const shown = `${list(group.map(printAlt))} share the prefix ${printAlt(prefix)}`;
		if (rests.some((rest) => rest.length === 0)) {
			if (others.some((rest) => isSymbol(rest[rest.length - 1], ctx.base)))
				ctx.rightRecursive = true;
			ctx.bracketed = true;
			const tail = opt(factorAlts(others, ctx));
			ctx.parts.push(
				`${shown}, and ${printAlt(prefix)} is an alternative by itself: what follows it in the ${others.length === 1 ? 'other' : 'others'} becomes optional, ${printAlt([tail])}.`
			);
			return [...prefix.map(inside), tail];
		}
		const primed = freshName(ctx.base, ctx.used);
		// Reserve the rule's place before the rules its own factoring makes.
		const rule: Rule = { lhs: primed, alts: [] };
		ctx.extra.push(rule);
		rule.alts = factorAlts(others, ctx);
		ctx.parts.push(
			`${shown}. None of them is the prefix alone, and a choice after the prefix would need parentheses, so the rests ${printAlts(others)} become the alternatives of the new non-terminal ${printSymbol(primed)}.`
		);
		return [...prefix.map(inside), sym(primed)];
	});
}

/**
 * Left factoring (Top-Down Parsing, slides 36 and 39): A → X op A | X becomes
 * A → X [ op A ]. A common prefix that is no alternative by itself is factored
 * with a primed non-terminal instead.
 */
export function leftFactor(g: Grammar | EbnfGrammar): Transformed {
	const rules = rulesOf(g);
	const used = namesOf(rules);
	const out: Rule[] = [];
	const changes: Change[] = [];
	for (const rule of rules) {
		const ctx: Factoring = {
			base: rule.lhs,
			used,
			extra: [],
			parts: [],
			rightRecursive: false,
			bracketed: false
		};
		const factored: Rule = { lhs: rule.lhs, alts: factorAlts(rule.alts, ctx) };
		out.push(factored, ...ctx.extra);
		if (ctx.parts.length === 0) continue;
		const change: Change = {
			kind: 'left-factor',
			nonterminal: rule.lhs,
			before: [printRule(rule)],
			after: [factored, ...ctx.extra].map(printRule),
			text: ctx.parts.join(' ')
		};
		// The slides factor with [ ] only; the primed form is the usual rule for the other cases.
		if (ctx.bracketed) change.cite = { deck: '11', slide: [36, 39] };
		if (ctx.rightRecursive) change.note = RIGHT_NOTE;
		changes.push(change);
	}
	return result(out, changes, []);
}

// ───────────────────────────── the whole rewrite ─────────────────────────────

/** How left recursion was removed: not at all, by the rule of slides 24–26, or by the general algorithm. */
export type RecursionMethod = 'none' | 'immediate' | 'general';

export interface Rewrite extends Transformed {
	method: RecursionMethod;
	/** The result uses `{ }` or `[ ]`. */
	brackets: boolean;
	/** The grammar before the rewrite, one rule per non-terminal. */
	before: string;
}

export interface RewriteOptions extends GeneralOptions {
	/** Skip left factoring. */
	factor?: boolean;
}

/**
 * The recipe of Top-Down Parsing, slide 41: eliminate left recursion, then
 * left factor. Immediate left recursion is removed by the rule of slides
 * 24–26; when left recursion through other non-terminals remains, the general
 * algorithm is used on the whole grammar instead.
 */
export function rewriteGrammar(g: Grammar | EbnfGrammar, opts: RewriteOptions = {}): Rewrite {
	const rules = rulesOf(g);
	let method: RecursionMethod = 'none';
	let step: Transformed = result(rules, [], []);
	if (remaining(rules).length > 0) {
		const pass = immediatePass(rules, opts.form ?? 'ebnf');
		step = pass;
		method = 'immediate';
		// Left recursion through other non-terminals: the general algorithm, on the whole grammar.
		if (pass.indirect.length > 0) {
			step = eliminateLeftRecursion(g, opts);
			method = 'general';
		}
	}
	const factored =
		opts.factor === false ? result(rulesOf(step.grammar), [], []) : leftFactor(step.grammar);
	return {
		grammar: factored.grammar,
		text: factored.text,
		changes: [...step.changes, ...factored.changes],
		notes: [...step.notes, ...factored.notes],
		method,
		brackets: hasBrackets(rulesOf(factored.grammar)),
		before: printRules(rules)
	};
}

/** What the recursion of each directly recursive non-terminal implies (slides 38–39). */
export interface RecursionKind {
	nonterminal: string;
	/** Some alternative starts with the non-terminal: left associativity, `{ }`. */
	left: boolean;
	/** Some alternative ends with it: right associativity, `[ ]`. */
	right: boolean;
}

/** The non-terminals with an alternative that starts or ends with the non-terminal itself. */
export function recursionKinds(g: Grammar | EbnfGrammar): RecursionKind[] {
	return rulesOf(g)
		.map((rule) => ({
			nonterminal: rule.lhs,
			left: rule.alts.some((alt) => alt.length > 1 && isSymbol(alt[0], rule.lhs)),
			right: rule.alts.some((alt) => alt.length > 1 && isSymbol(alt[alt.length - 1], rule.lhs))
		}))
		.filter((kind) => kind.left || kind.right);
}
