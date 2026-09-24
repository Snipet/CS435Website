/**
 * Thompson's construction as the tool shows it: parse the expression, guard
 * its size, run the engine (lecture variant, docs/ARCHITECTURE.md §3.9), and
 * derive what each step draws: the machine built so far with the lecture's
 * final state names, the current fragment and its finished parts, and a
 * one-line description of the step.
 */
import { formatLabel } from '$lib/theory/chars';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { children, parseDefinitions, parseRegex, printRegex, type Regex } from '$lib/theory/regex';
import {
	thompson,
	thompsonStatesThrough,
	type Automaton,
	type Positions,
	type StateId,
	type ThompsonResult
} from '$lib/theory/automata';
import type { Box } from '$lib/components/graph/geometry';
import { layoutAutomaton } from '$lib/components/graph/layout';
import type { AutomatonGroup } from '$lib/components/graph/types';

/** Largest NFA the tool builds and draws. */
export const MAX_STATES = 300;
/** Largest syntax tree (nodes, definitions expanded at each use) the tool steps through. */
export const MAX_NODES = 250;

/** Key of an AST path, e.g. "0.0.1"; the root is "". */
export const pathKey = (path: readonly number[]): string => path.join('.');

export interface Construction {
	re: string;
	defs: string;
	regex: Regex;
	result: ThompsonResult;
	/** Each step's sub-expression as written (source spelling), in step order. */
	texts: string[];
	/** Step index by AST path key. */
	stepByPath: Map<string, number>;
}

export interface Size {
	states: number;
	/** Syntax-tree nodes with definitions expanded at each use. */
	nodes: number;
}

export type BuildOutcome =
	| {
			status: 'ok';
			construction: Construction;
			diagnostics: Diagnostic[];
			defDiagnostics: Diagnostic[];
	  }
	| { status: 'invalid'; diagnostics: Diagnostic[]; defDiagnostics: Diagnostic[] }
	| {
			status: 'too-big';
			size: Size;
			diagnostics: Diagnostic[];
			defDiagnostics: Diagnostic[];
	  };

/**
 * States and tree nodes Thompson's construction makes for `r`, computed from
 * the tree alone (each node once, so shared definition bodies stay cheap).
 * Matches `thompson(r).nfa.states.length`.
 */
export function thompsonSize(r: Regex): Size {
	const memo = new Map<Regex, Size>();
	const go = (n: Regex): Size => {
		const known = memo.get(n);
		if (known) return known;
		const kids = children(n).map(go);
		const nodes = 1 + kids.reduce((sum, k) => sum + k.nodes, 0);
		const sum = kids.reduce((acc, k) => acc + k.states, 0);
		let states: number;
		switch (n.kind) {
			case 'empty':
			case 'epsilon':
			case 'chars':
			case 'any':
				states = 2;
				break;
			case 'concat':
				states = sum;
				break;
			case 'alt':
				states = sum + 2 * (n.options.length - 1);
				break;
			case 'star':
				states = sum + 2;
				break;
			case 'plus':
				states = 2 * sum + 2;
				break;
			case 'optional':
				states = sum + 4;
				break;
			case 'repeat': {
				const total = n.max === null ? n.min + 1 : n.max;
				if (total <= 0) states = 2;
				else if (n.max === null) states = (n.min + 1) * sum + 2;
				else states = n.min * sum + (n.max - n.min) * (sum + 4);
				break;
			}
			case 'ref':
				states = sum;
				break;
		}
		const size = { states, nodes };
		memo.set(n, size);
		return size;
	};
	return go(r);
}

/** A node's sub-expression as the user wrote it, or printed when it has no source text. */
export function exprText(node: Regex, re: string, defs: string): string {
	// A character of a quoted literal keeps its quotes: 'e' of 'else'.
	if (node.kind === 'chars' && node.text) return node.text;
	const span = node.span;
	if (span) {
		const text = (span.source === null ? re : defs).slice(span.start, span.end).trim();
		if (text) return text;
	}
	return printRegex(node, { symbols: 'bare' });
}

/** Parses the expression and its definitions and, when it is small enough, builds the NFA. */
export function buildConstruction(re: string, defs: string): BuildOutcome {
	const d = parseDefinitions(defs);
	const defDiagnostics = d.diagnostics;
	const parsed = parseRegex(re, { defs: d.defs, invalid: d.invalid });
	if (!parsed.ok) return { status: 'invalid', diagnostics: parsed.diagnostics, defDiagnostics };
	const diagnostics = parsed.diagnostics;
	const size = thompsonSize(parsed.regex);
	if (size.states > MAX_STATES || size.nodes > MAX_NODES)
		return { status: 'too-big', size, diagnostics, defDiagnostics };
	const result = thompson(parsed.regex);
	const stepByPath = new Map(result.steps.map((s, i) => [pathKey(s.path), i]));
	const texts = result.steps.map((s) => exprText(s.node, re, defs));
	return {
		status: 'ok',
		construction: { re, defs, regex: parsed.regex, result, texts, stepByPath },
		diagnostics,
		defDiagnostics
	};
}

// ---------------------------------------------------------------------------
// One step as drawn
// ---------------------------------------------------------------------------

/** NFA states that are accepting once step `index` is done (fragment finals not yet joined into a parent). */
export function acceptingThrough(result: ThompsonResult, index: number): Set<StateId> {
	const out = new Set<StateId>();
	for (const step of result.steps.slice(0, index + 1)) {
		out.add(step.fragment.final);
		for (const d of step.demoted) out.delete(d);
	}
	return out;
}

/** Steps that build the direct operands of step `index`, in operand order. */
export function childSteps(c: Construction, index: number): number[] {
	const path = c.result.steps[index].path;
	const out: number[] = [];
	for (let k = 0; ; k++) {
		const j = c.stepByPath.get(pathKey([...path, k]));
		if (j === undefined) break;
		out.push(j);
	}
	return out;
}

export interface StepView {
	/** The states and transitions created through this step, with the final NFA's names. */
	automaton: Automaton;
	positions: Positions;
	/** NFA state id → id in `automaton`. */
	toView: Map<StateId, StateId>;
	/** Ids in `automaton` of the states this step created. */
	newStates: StateId[];
	/** Transition ids this step created (the same in the NFA and in `automaton`). */
	newTransitions: number[];
	/** Current fragment, then its finished operands (faint). Ids in `automaton`. */
	groups: AutomatonGroup[];
}

const shorten = (text: string, max = 32) =>
	[...text].length <= max ? text : `${[...text].slice(0, max - 1).join('')}…`;

/**
 * The machine as it stands after step `index`: only the states and
 * transitions created so far, accepting states as of this step, the current
 * fragment's start as the start, and outlines for the current fragment and
 * its operands.
 */
export function stepView(c: Construction, index: number): StepView {
	const { result, texts } = c;
	const { nfa } = result;
	const step = result.steps[index];
	const kept = [...thompsonStatesThrough(result, index)].sort((a, b) => a - b);
	const toView = new Map(kept.map((id, i) => [id, i]));
	const view = (id: StateId) => toView.get(id)!;
	const accepting = acceptingThrough(result, index);
	const automaton: Automaton = {
		states: kept.map((id, i) => ({
			id: i,
			name: nfa.states[id].name,
			accepting: accepting.has(id)
		})),
		transitions: nfa.transitions
			.filter((t) => t.id < step.transitionCount)
			.map((t) => ({ id: t.id, from: view(t.from), to: view(t.to), label: t.label })),
		start: view(step.fragment.start)
	};
	const positions: Positions = new Map(kept.map((id, i) => [i, result.positions.get(id)!]));
	const own = new Set(step.fragment.states);
	const groups: AutomatonGroup[] = [
		{ id: 'current', label: shorten(texts[index]), states: step.fragment.states.map(view), tone: 0 }
	];
	for (const j of childSteps(c, index)) {
		const states = result.steps[j].fragment.states;
		// A definition use or A¹ is its operand: the outline would coincide.
		if (states.length === own.size && states.every((s) => own.has(s))) continue;
		groups.push({
			id: `part-${j}`,
			label: shorten(texts[j], 24),
			states: states.map(view),
			tone: 0,
			faint: true
		});
	}
	return {
		automaton,
		positions,
		toView,
		newStates: step.newStates.map(view),
		newTransitions: step.newTransitions,
		groups
	};
}

/**
 * The finished machine's bounds with room for fragment outlines and their
 * labels. Passed to AutomatonView as its fit extent, so every step is drawn
 * at the same scale with each state where it ends up.
 */
export function constructionExtent(c: Construction): Box {
	const v = stepView(c, c.result.steps.length - 1);
	const b = layoutAutomaton(v.automaton, { positions: v.positions }).bounds;
	return { x: b.x - 28, y: b.y - 46, width: b.width + 56, height: b.height + 86 };
}

export interface SourceMarks {
	/** Span in the main expression: the step's node, or the definition use it sits in. */
	main: { start: number; end: number } | null;
	/** For a node inside a definition: that definition's line and the node's span within it. */
	def: { name: string; line: string; start: number; end: number } | null;
}

/** Where step `index`'s sub-expression is written. */
export function sourceMarks(c: Construction, index: number): SourceMarks {
	const path = c.result.steps[index].path;
	let node: Regex = c.regex;
	let main = node.span?.source === null ? node.span : null;
	for (const k of path) {
		node = children(node)[k];
		if (node.span?.source === null) main = node.span;
	}
	let def: SourceMarks['def'] = null;
	const span = node.span;
	if (span && span.source !== null) {
		const lineStart = c.defs.lastIndexOf('\n', span.start - 1) + 1;
		const nl = c.defs.indexOf('\n', span.start);
		const lineEnd = nl < 0 ? c.defs.length : nl;
		const line = c.defs.slice(lineStart, lineEnd).replace(/\r$/, '');
		def = {
			name: span.source,
			line,
			start: span.start - lineStart,
			end: Math.min(span.end - lineStart, line.length)
		};
	}
	return { main: main ? { start: main.start, end: main.end } : null, def };
}

// ---------------------------------------------------------------------------
// Step text
// ---------------------------------------------------------------------------

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
/** "E", "E and F", "B, D, and F". */
export const andList = (items: readonly string[]): string => listFormat.format(items);

const sup = (n: number) =>
	String(n)
		.split('')
		.map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])
		.join('');

/** "A³", "A{2,3}", "A{2,}" as written for a repeat node. */
export function repeatText(min: number, max: number | null, operand = 'A'): string {
	if (max === min) return `${operand}${sup(min)}`;
	return `${operand}{${min},${max ?? ''}}`;
}

function leadFor(node: Regex): string | null {
	switch (node.kind) {
		case 'plus':
			return 'A+ = A A*, with a fresh copy of A';
		case 'optional':
			return 'A? = A | ε';
		case 'repeat': {
			const { min, max } = node;
			const total = max === null ? min + 1 : max;
			if (total <= 0) return `${repeatText(min, max)} = ε`;
			if (max === min)
				return min === 1 ? 'A¹ is A itself' : `${repeatText(min, max)} = ${min} copies of A`;
			return max === null
				? `${repeatText(min, max)} = ${min} ${min === 1 ? 'copy' : 'copies'} of A, then A*`
				: `${repeatText(min, max)} = ${min} ${min === 1 ? 'copy' : 'copies'} of A, then ${max - min} of A?`;
		}
		case 'alt':
			return node.options.length > 2 ? '(A | B) | C: two options at a time, left to right' : null;
		case 'ref':
			return `${node.name} stands for its definition`;
		default:
			return null;
	}
}

export interface StepDescription {
	index: number;
	total: number;
	/** The sub-expression, as written. */
	expr: string;
	/** Clause name as on the slides. */
	clause: string;
	/** What the step adds, e.g. "new start B and new final G; ε-moves B → C, …". */
	detail: string;
}

export function describeStep(c: Construction, index: number): StepDescription {
	const { result } = c;
	const { nfa } = result;
	const step = result.steps[index];
	const name = (id: StateId) => nfa.states[id].name;
	const added = step.newTransitions.map((id) => nfa.transitions[id]);
	const eps = added.filter((t) => t.label === null);
	const sym = added.filter((t) => t.label !== null);

	const parts: string[] = [];
	const lead = leadFor(step.node);
	if (lead) parts.push(lead);

	const fresh = step.newStates;
	const { start, final } = step.fragment;
	if (fresh.length === 0) parts.push('no new states');
	else if (fresh.length === 2 && fresh.includes(start) && fresh.includes(final))
		parts.push(`new start ${name(start)} and new final ${name(final)}`);
	else parts.push(`new states ${andList(fresh.map(name))}`);

	if (eps.length)
		parts.push(
			`ε-move${eps.length === 1 ? '' : 's'} ${eps.map((t) => `${name(t.from)} → ${name(t.to)}`).join(', ')}`
		);
	if (sym.length)
		parts.push(
			`transition${sym.length === 1 ? '' : 's'} ${sym
				.map((t) => `${name(t.from)} → ${name(t.to)} on ${formatLabel(t.label!)}`)
				.join(', ')}`
		);
	if (added.length === 0 && fresh.length > 0) {
		const node = step.node;
		parts.push(
			node.kind === 'empty'
				? 'no transition, since L(ɸ) = { }'
				: node.kind === 'any'
					? 'no transition, since Σ is empty'
					: 'no transition, since the class is empty'
		);
	}

	let detail = `${parts.join('; ')}.`;
	if (step.demoted.length) {
		const names = step.demoted.map(name);
		detail += ` ${andList(names)} ${names.length === 1 ? 'is' : 'are'} no longer accepting.`;
	}
	return {
		index,
		total: result.steps.length,
		expr: c.texts[index],
		clause: step.clause,
		detail
	};
}

/** "Step 3 of 6 · (1 | 0) — Choice/Alternation: new start B and new final G; …" */
export function stepText(d: StepDescription): string {
	return `Step ${d.index + 1} of ${d.total} · ${d.expr} — ${d.clause}: ${d.detail}`;
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export interface FormulaTerms {
	/** Symbols, classes and Σ: one transition each. */
	symbols: number;
	epsilons: number;
	empties: number;
	/** Each | between two options. */
	bars: number;
	stars: number;
}

export interface SizeStats {
	states: number;
	transitions: number;
	epsilonMoves: number;
	/** Terms of 2 × (symbols + | + *), or null when the expression uses a derived form. */
	formula: FormulaTerms | null;
	/** Derived forms used (which make fresh copies), e.g. ['A+', 'definitions']. */
	derived: string[];
}

export function sizeStats(c: Construction): SizeStats {
	const { nfa } = c.result;
	const terms: FormulaTerms = { symbols: 0, epsilons: 0, empties: 0, bars: 0, stars: 0 };
	const derived = new Set<string>();
	const visit = (n: Regex) => {
		switch (n.kind) {
			case 'chars':
			case 'any':
				terms.symbols++;
				break;
			case 'epsilon':
				terms.epsilons++;
				break;
			case 'empty':
				terms.empties++;
				break;
			case 'alt':
				terms.bars += n.options.length - 1;
				break;
			case 'star':
				terms.stars++;
				break;
			case 'plus':
				derived.add('A+');
				break;
			case 'optional':
				derived.add('A?');
				break;
			case 'repeat':
				derived.add(n.max === n.min ? 'Aⁿ' : 'A{n,m}');
				break;
			case 'ref':
				derived.add('definitions');
				break;
			default:
				break;
		}
		for (const k of children(n)) visit(k);
	};
	visit(c.regex);
	return {
		states: nfa.states.length,
		transitions: nfa.transitions.length,
		epsilonMoves: nfa.transitions.filter((t) => t.label === null).length,
		formula: derived.size ? null : terms,
		derived: [...derived]
	};
}

/** "2 × (3 symbols + 1 | + 1 *)", listing only the terms that occur. */
export function formulaText(t: FormulaTerms): string {
	const terms: string[] = [];
	if (t.symbols) terms.push(`${t.symbols} symbol${t.symbols === 1 ? '' : 's'}`);
	if (t.epsilons) terms.push(`${t.epsilons} ε`);
	if (t.empties) terms.push(`${t.empties} ɸ`);
	if (t.bars) terms.push(`${t.bars} |`);
	if (t.stars) terms.push(`${t.stars} *`);
	return `2 × (${terms.join(' + ')})`;
}

export const formulaTotal = (t: FormulaTerms): number =>
	2 * (t.symbols + t.epsilons + t.empties + t.bars + t.stars);
