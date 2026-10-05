/**
 * The derivation builder: a derivation kept as (position, production) pairs,
 * replayed against the grammar, with the positions a step may replace, the
 * parse-tree nodes that belong to the symbols of the current form, and the
 * text that describes the last step.
 *
 * A derivation replaces one non-terminal per step, starting from the start
 * symbol (Introduction to Parsing, slide 18). The decks write a step with the
 * same arrow as a production: E → E * E → ( E ) * E.
 */
import type { ChainStep } from '$lib/components/grammar';
import {
	applyStep,
	derivationFromTree,
	nonterminalPositions,
	treeFromDerivation,
	type Derivation,
	type DerivationStep,
	type Grammar,
	type ParseNode,
	type Production,
	type SententialForm
} from '$lib/theory/grammar';
import { PLAIN, type Spelling } from './spelling';
import { MAX_STEPS, type ReplaceOrder, type StepPair } from './state';

export interface BuiltDerivation {
	derivation: Derivation;
	/** The saved steps that apply, in order. */
	pairs: StepPair[];
	/** Saved steps that were left out: the first one that does not apply and all after it. */
	dropped: number;
}

/**
 * The derivation that saved steps describe, from the start symbol. A step
 * applies when its position holds the left-hand side of its production; the
 * derivation stops before the first step that does not (after an edit of the
 * grammar) and at `limit` steps.
 */
export function replay(
	g: Grammar,
	pairs: readonly StepPair[],
	limit: number = MAX_STEPS
): BuiltDerivation {
	const start: SententialForm = [g.start];
	const steps: DerivationStep[] = [];
	const kept: StepPair[] = [];
	let form = start;
	for (const [index, production] of pairs) {
		if (steps.length >= limit) break;
		const p = g.productions[production];
		if (!p || form[index] !== p.lhs) break;
		form = applyStep(form, index, p);
		steps.push({ index, production: p.id, form });
		kept.push([index, p.id]);
	}
	return { derivation: { start, steps }, pairs: kept, dropped: pairs.length - kept.length };
}

/** The saved form of a derivation's steps. */
export function pairsOf(d: Derivation): StepPair[] {
	return d.steps.map((s): StepPair => [s.index, s.production]);
}

/** The last sentential form of a derivation (its start when it has no steps). */
export function currentForm(d: Derivation): SententialForm {
	return d.steps.length > 0 ? d.steps[d.steps.length - 1].form : d.start;
}

/** Every sentential form of a derivation, the start first. */
export function formsOf(d: Derivation): SententialForm[] {
	return [d.start, ...d.steps.map((s) => s.form)];
}

/**
 * The positions of `form` a step may replace: every non-terminal, or only the
 * leftmost or the rightmost one.
 */
export function allowedPositions(g: Grammar, form: SententialForm, order: ReplaceOrder): number[] {
	const all = nonterminalPositions(g, form);
	if (order === 'any' || all.length === 0) return all;
	return [order === 'leftmost' ? all[0] : all[all.length - 1]];
}

/** A position the user chose, with the sentential form it was chosen in. */
export interface PickedPosition {
	at: number;
	form: SententialForm;
}

/**
 * The position whose productions are listed: the one chosen in this very form
 * (the same array, not an equal one) when a step may replace it, otherwise
 * the only position allowed, or none. A choice made in another form does not
 * count, even if the new form has a non-terminal at the same position: after
 * a step or an undo, and after a preset, a link or an edit of the grammar put
 * another derivation in the builder.
 */
export function selectedPosition(
	picked: PickedPosition | null,
	form: SententialForm,
	allowed: readonly number[]
): number | null {
	if (picked && picked.form === form && allowed.includes(picked.at)) return picked.at;
	return allowed.length === 1 ? allowed[0] : null;
}

/** A sentence: a sentential form with only terminals (the empty form included). */
export function isSentence(g: Grammar, form: SententialForm): boolean {
	return nonterminalPositions(g, form).length === 0;
}

/** The productions of a non-terminal, in grammar order. */
export function productionsOf(g: Grammar, nonterminal: string): Production[] {
	return g.productions.filter((p) => p.lhs === nonterminal);
}

/** A production as the decks write it: `E → E + E`, `S → ε`. */
export function productionText(p: Production, write: Spelling = PLAIN): string {
	return `${write.symbol(p.lhs)} → ${write.symbols(p.rhs)}`;
}

const expanded = (node: ParseNode): boolean => !node.terminal && node.production !== undefined;

/**
 * The path (child indices from the root) of the tree node of each symbol of
 * the tree's yield, left to right: `frontier(tree)[i]` is the node of the
 * i-th symbol of the sentential form. A node of an ε-production has no symbol.
 */
export function frontier(tree: ParseNode): number[][] {
	const out: number[][] = [];
	const stack: { node: ParseNode; path: number[] }[] = [{ node: tree, path: [] }];
	while (stack.length > 0) {
		const { node, path } = stack.pop()!;
		if (node.terminal || !expanded(node)) {
			out.push(path);
			continue;
		}
		for (let i = node.children.length - 1; i >= 0; i--)
			stack.push({ node: node.children[i], path: [...path, i] });
	}
	return out;
}

/**
 * The tree nodes the last step added: the children of the node it expanded,
 * or the ε leaf that `ParseTreeView` draws under an ε-production. Empty for a
 * derivation without steps.
 */
export function freshPaths(g: Grammar, d: Derivation): number[][] {
	if (d.steps.length === 0) return [];
	const last = d.steps[d.steps.length - 1];
	const before = treeFromDerivation(g, { start: d.start, steps: d.steps.slice(0, -1) });
	const parent = frontier(before)[last.index];
	const count = Math.max(1, g.productions[last.production].rhs.length);
	return Array.from({ length: count }, (_, k) => [...parent, k]);
}

/** The steps of a derivation as `DerivationChain` marks them. */
export function chainSteps(g: Grammar, d: Derivation): ChainStep[] {
	return d.steps.map((s) => ({ index: s.index, length: g.productions[s.production].rhs.length }));
}

export interface ChainView {
	/** The forms with every symbol written as in the grammar (`"the cat"` in quotes). */
	forms: string[][];
	steps: ChainStep[];
	/** The non-terminals, written the same way. */
	nonterminals: string[];
}

/** A derivation as the props of `DerivationChain`. */
export function chainOf(g: Grammar, d: Derivation, write: Spelling = PLAIN): ChainView {
	return {
		forms: formsOf(d).map((form) => form.map(write.symbol)),
		steps: chainSteps(g, d),
		nonterminals: g.nonterminals.map(write.symbol)
	};
}

/** Symbols a chain writes out in full; a longer one leaves out its first steps. */
export const CHAIN_SYMBOLS = 1200;
/** Stands for the forms left out, as the decks write E → E * E → … → ( int + int ) * int. */
export const ELLIPSIS = '…';
/** A step next to the ellipsis: `DerivationChain` marks nothing for it. */
const NO_STEP: ChainStep = { index: -1, length: 0 };

export interface AbridgedChain extends ChainView {
	/** Forms left out after the start; 0 when the chain is whole. */
	omitted: number;
}

/**
 * A chain of more than `budget` symbols without its first steps: the start,
 * `…`, and the last forms, as many as fit (the last two always, so the last
 * step is there with the symbol it replaced). Writing every form of a long
 * derivation takes a number of symbols that grows with the square of its
 * length, 20 000 for 200 steps of S → S S, and all of them are laid out again
 * with every step.
 */
export function abridgeChain(chain: ChainView, budget: number = CHAIN_SYMBOLS): AbridgedChain {
	const { forms, steps } = chain;
	const whole: AbridgedChain = { ...chain, omitted: 0 };
	// An empty form is written as ε.
	const size = (form: readonly string[]) => Math.max(1, form.length);
	const last = forms.length - 1;
	let total = 0;
	for (const form of forms) total += size(form);
	if (total <= budget || last < 3) return whole;
	// The tail starts at `first`; the start and the ellipsis come before it.
	let first = last;
	let used = size(forms[0]) + 1 + size(forms[last]);
	while (first > 1 && (first === last || used + size(forms[first - 1]) <= budget)) {
		first--;
		used += size(forms[first]);
	}
	if (first <= 1) return whole;
	return {
		forms: [forms[0], [ELLIPSIS], ...forms.slice(first)],
		steps: [NO_STEP, NO_STEP, ...steps.slice(first)],
		nonterminals: chain.nonterminals,
		omitted: first - 1
	};
}

export interface DerivationKind {
	/** Every step replaced the leftmost non-terminal. */
	leftmost: boolean;
	/** Every step replaced the rightmost non-terminal. */
	rightmost: boolean;
}

/** Whether a derivation is a leftmost and whether it is a rightmost derivation. */
export function derivationKind(g: Grammar, d: Derivation): DerivationKind {
	let leftmost = true;
	let rightmost = true;
	let form = d.start;
	for (const step of d.steps) {
		const positions = nonterminalPositions(g, form);
		if (step.index !== positions[0]) leftmost = false;
		if (step.index !== positions[positions.length - 1]) rightmost = false;
		form = step.form;
	}
	return { leftmost, rightmost };
}

/** "leftmost derivation", "rightmost derivation", or null when it is neither (or has no steps). */
export function kindLabel(g: Grammar, d: Derivation): string | null {
	if (d.steps.length === 0) return null;
	const { leftmost, rightmost } = derivationKind(g, d);
	if (leftmost && rightmost) return 'leftmost and rightmost derivation';
	if (leftmost) return 'leftmost derivation';
	if (rightmost) return 'rightmost derivation';
	return null;
}

/** The leftmost and the rightmost derivation of the tree a derivation builds. */
export function bothDerivations(
	g: Grammar,
	d: Derivation
): { tree: ParseNode; leftmost: Derivation; rightmost: Derivation } {
	const tree = treeFromDerivation(g, d);
	return {
		tree,
		leftmost: derivationFromTree(g, tree, 'leftmost'),
		rightmost: derivationFromTree(g, tree, 'rightmost')
	};
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "0 steps", "1 step", "6 steps". */
export function stepCount(d: Derivation): string {
	return plural(d.steps.length, 'step');
}

/**
 * What the last step did, for the line under the sentential form: the
 * production and the symbol it replaced.
 */
export function lastStepText(g: Grammar, d: Derivation, write: Spelling = PLAIN): string {
	const n = d.steps.length;
	if (n === 0) return `Start: the start symbol ${write.symbol(g.start)}.`;
	const step = d.steps[n - 1];
	const before = n === 1 ? d.start : d.steps[n - 2].form;
	const p = g.productions[step.production];
	const where =
		before.length === 1
			? write.symbol(p.lhs)
			: `symbol ${step.index + 1} of ${write.symbols(before)}`;
	return `Step ${n}: production ${p.id + 1}, ${productionText(p, write)}, replaces ${where}.`;
}

/**
 * The same with the form the step gave, as it is read out after each step
 * (a screen reader does not see the form change).
 */
export function describeLastStep(g: Grammar, d: Derivation, write: Spelling = PLAIN): string {
	const form = currentForm(d);
	if (d.steps.length === 0) return lastStepText(g, d, write);
	const sentence = isSentence(g, form) ? ' Only terminals remain.' : '';
	return `${lastStepText(g, d, write)} Sentential form: ${write.symbols(form)}.${sentence}`;
}
