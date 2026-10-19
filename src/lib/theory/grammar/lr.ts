/**
 * LR items and LR automata as Bottom-up Parsing III presents them: the
 * augmented start symbol (slide 7), LR(1) items [X → α•β, a] (slide 5),
 * Closure (slide 10), Transition (slide 13) and the parsing DFA built from
 * them (slides 11–14), numbered as Bottom-up Parsing II draws it (slide 17).
 *
 * The decks only name LR(0), SLR and LALR(1) (Bottom-up Parsing III,
 * slide 26, the Venn diagram of grammar classes). lr0Automaton and
 * lalr1Automaton build them the standard way so that a grammar can be placed
 * in that diagram: LR(0) items have no lookahead, and LALR(1) merges the
 * LR(1) states whose items agree but for their lookaheads.
 *
 * Results are plain data (objects, arrays, Maps), so they survive a
 * structured clone.
 */
import type { Diagnostic } from '../diagnostics';
import { firstSets, reservedSymbols } from './analyze';
import { sortForDisplay, terminalRanks } from './ll1';
import { printSymbols } from './parse';
import { END_MARKER, EPSILON, type Grammar, type Production } from './types';

/** The dot of an item (Bottom-up Parsing III writes it as a red bullet). */
export const ITEM_DOT = '•';
const PRIME = '’';

// ───────────────────────────── augmentation ─────────────────────────────

/** A grammar with a new start symbol S and the production S → E (Bottom-up Parsing III, slide 7). */
export interface Augmented {
	grammar: Grammar;
	/** The new start symbol: S when the grammar has no symbol S, else S’, S’’, … (slide 25 writes S’). */
	start: string;
	/** S → E, with the id after the grammar's last production. */
	production: Production;
	/** The grammar's productions, then `production`: indexed by id. */
	productions: Production[];
}

/**
 * Adds the new start symbol. The deck says this is not needed when the start
 * symbol has one production; it is always added here, so that state 0 is
 * Closure({ [S → •E, $] }) and accepting is one item, [S → E•, $]. The
 * grammar's own productions keep their ids, so tables, trees and handles use
 * the same production numbers as the grammar.
 */
export function augment(g: Grammar): Augmented {
	const used = new Set([...g.nonterminals, ...g.terminals]);
	let start = 'S';
	while (used.has(start)) start += PRIME;
	const production: Production = { id: g.productions.length, lhs: start, rhs: [g.start] };
	return { grammar: g, start, production, productions: [...g.productions, production] };
}

// ───────────────────────────── items ─────────────────────────────

/**
 * An item [X → α•β, a]: the production X → αβ (an id of Augmented.productions),
 * the dot position |α|, and the lookahead terminal a (`$` included). An LR(0)
 * item has no lookahead (null).
 */
export interface LrItem {
	production: number;
	dot: number;
	lookahead: string | null;
}

/** Items that differ only in their lookahead, written once: E → •E + ( E ), $/+ (slide 11). */
export interface MergedItem {
	production: number;
	dot: number;
	/** `$` first, then in the order the items come in the state; null for LR(0) items. */
	lookaheads: string[] | null;
}

const itemKey = (item: LrItem): string =>
	item.lookahead === null
		? `${item.production},${item.dot}`
		: `${item.production},${item.dot},${item.lookahead}`;

/** Lookaheads with `$` first, the others in the order given. */
function endFirst(lookaheads: readonly string[]): string[] {
	const unique = [...new Set(lookaheads)];
	return unique.includes(END_MARKER)
		? [END_MARKER, ...unique.filter((t) => t !== END_MARKER)]
		: unique;
}

/**
 * Merges items that differ only in their lookahead, keeping the order in
 * which the first of each appears: S → •E, $ ; E → •E + ( E ), $/+ ;
 * E → •int, $/+ (Bottom-up Parsing III, slides 11 and 14).
 */
export function mergeItems(items: readonly LrItem[]): MergedItem[] {
	const out: MergedItem[] = [];
	const at = new Map<string, number>();
	const lookaheads: string[][] = [];
	for (const item of items) {
		const key = `${item.production},${item.dot}`;
		let k = at.get(key);
		if (k === undefined) {
			k = out.length;
			at.set(key, k);
			out.push({ production: item.production, dot: item.dot, lookaheads: null });
			lookaheads.push([]);
		}
		if (item.lookahead !== null) lookaheads[k].push(item.lookahead);
	}
	out.forEach((m, k) => {
		if (lookaheads[k].length > 0) m.lookaheads = endFirst(lookaheads[k]);
	});
	return out;
}

const symbol = (s: string): string => printSymbols([s]);

/** A production as the decks write it: `E → E + ( E )`, `S → ε`. */
export function printProduction(p: Production): string {
	return `${symbol(p.lhs)} → ${printSymbols(p.rhs)}`;
}

/**
 * An item as Bottom-up Parsing III writes it: `E → •E + ( E ), $`, with the
 * dot against the symbol after it (`E → E + ( •E ), $/+`), after the last
 * symbol at the end (`E → int•, $/+`), alone for an ε-production (`S → •, $`).
 * A merged item joins its lookaheads with `/`; an LR(0) item has none.
 * `brackets` adds the square brackets of the definitions: `[E → •int, $]`.
 */
export function printItem(
	aug: Augmented,
	item: LrItem | MergedItem,
	opts?: { brackets?: boolean }
): string {
	const p = aug.productions[item.production];
	const parts = p.rhs.map(symbol);
	let body: string;
	if (parts.length === 0) body = ITEM_DOT;
	else if (item.dot >= parts.length) body = `${parts.join(' ')}${ITEM_DOT}`;
	else {
		parts[item.dot] = ITEM_DOT + parts[item.dot];
		body = parts.join(' ');
	}
	const lookaheads =
		'lookaheads' in item ? item.lookaheads : item.lookahead === null ? null : [item.lookahead];
	const text = `${symbol(p.lhs)} → ${body}${lookaheads ? `, ${lookaheads.map(symbol).join('/')}` : ''}`;
	return opts?.brackets ? `[${text}]` : text;
}

// ───────────────────────────── closure and transition ─────────────────────────────

/** One pass of the innermost loop of Closure: add [Y → •γ, b] to Items. */
export interface LrClosureStep {
	/** Index (in the item list) of the item [X → α•Yβ, a] being extended. */
	from: number;
	/** The production Y → γ. */
	production: number;
	/** First(βa), in display order; empty for LR(0) items. */
	first: string[];
	/** [Y → •γ, b] for one b of First(βa). */
	item: LrItem;
	/** Where the item is in the list: at the end when it is new. */
	index: number;
	/** false: the item was already in Items. */
	added: boolean;
}

/**
 * Options of Closure and of the automata built with it. `closureOrder`: the
 * order in which Closure adds the productions Y → γ of a non-terminal, as
 * production ids; the ids listed come first, in that order, and the others
 * follow in grammar order (the default). Ids that are not productions of the
 * grammar are ignored. Bottom-up Parsing III writes its grammar E → int first
 * (slide 4) but lists E → •E + ( E ) before E → •int on slides 11 and 14;
 * with `closureOrder: [1, 0]` that grammar gives the items of those slides.
 */
export interface LrClosureOptions {
	closureOrder?: readonly number[];
}

/** The grammar's productions in the order Closure adds them. */
function closureProductions(g: Grammar, closureOrder?: readonly number[]): Production[] {
	if (!closureOrder || closureOrder.length === 0) return g.productions;
	const out: Production[] = [];
	const listed = new Set<number>();
	for (const id of closureOrder) {
		const p = g.productions[id];
		if (p === undefined || p.id !== id || listed.has(id)) continue;
		listed.add(id);
		out.push(p);
	}
	for (const p of g.productions) if (!listed.has(p.id)) out.push(p);
	return out;
}

/** What Closure and Transition need to know about the grammar. */
interface Context {
	aug: Augmented;
	isNonterminal: ReadonlySet<string>;
	byLhs: ReadonlyMap<string, readonly Production[]>;
	first: ReadonlyMap<string, ReadonlySet<string>>;
	rank: ReadonlyMap<string, number>;
	/** First(β) of the symbols after the one past the dot, by `${production},${dot}`. */
	rest: Map<string, { terminals: string[]; nullable: boolean }>;
}

function contextOf(aug: Augmented, opts?: LrClosureOptions): Context {
	const g = aug.grammar;
	const byLhs = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of closureProductions(g, opts?.closureOrder)) byLhs.get(p.lhs)?.push(p);
	return {
		aug,
		isNonterminal: new Set(g.nonterminals),
		byLhs,
		first: firstSets(g),
		rank: terminalRanks(g),
		rest: new Map()
	};
}

/** First(βa) for an item [X → α•Yβ, a]. */
function firstAfter(ctx: Context, item: LrItem, lookahead: string): string[] {
	const key = `${item.production},${item.dot}`;
	let rest = ctx.rest.get(key);
	if (!rest) {
		const beta = ctx.aug.productions[item.production].rhs.slice(item.dot + 1);
		const terminals = new Set<string>();
		let nullable = true;
		for (const x of beta) {
			const fx = ctx.first.get(x) ?? new Set([x]);
			for (const t of fx) if (t !== EPSILON) terminals.add(t);
			if (!fx.has(EPSILON)) {
				nullable = false;
				break;
			}
		}
		rest = { terminals: [...terminals], nullable };
		ctx.rest.set(key, rest);
	}
	return sortForDisplay(ctx.rank, rest.nullable ? [...rest.terminals, lookahead] : rest.terminals);
}

interface Closed {
	items: LrItem[];
	steps: LrClosureStep[];
}

/**
 * Closure as on slide 10, with Items as a list: each item is extended once,
 * in the order the items were added (a second pass over Items would add
 * nothing, which is when the slide's loop stops).
 */
function close(ctx: Context, seed: readonly LrItem[], trace: boolean): Closed {
	const items: LrItem[] = [];
	const index = new Map<string, number>();
	const add = (item: LrItem): { at: number; added: boolean } => {
		const key = itemKey(item);
		const at = index.get(key);
		if (at !== undefined) return { at, added: false };
		index.set(key, items.length);
		items.push(item);
		return { at: items.length - 1, added: true };
	};
	for (const item of seed) add({ ...item });
	const steps: LrClosureStep[] = [];
	for (let k = 0; k < items.length; k++) {
		const item = items[k];
		const y = ctx.aug.productions[item.production].rhs[item.dot];
		if (y === undefined || !ctx.isNonterminal.has(y)) continue;
		const first = item.lookahead === null ? null : firstAfter(ctx, item, item.lookahead);
		for (const q of ctx.byLhs.get(y) ?? []) {
			for (const b of first ?? [null]) {
				const next: LrItem = { production: q.id, dot: 0, lookahead: b };
				const { at, added } = add(next);
				if (trace)
					steps.push({
						from: k,
						production: q.id,
						first: first ?? [],
						item: next,
						index: at,
						added
					});
			}
		}
	}
	return { items, steps };
}

function checkItems(aug: Augmented, items: readonly LrItem[]): void {
	for (const item of items) {
		const p = aug.productions[item.production];
		if (!p || item.dot < 0 || item.dot > p.rhs.length)
			throw new Error(`not an item of this grammar: ${JSON.stringify(item)}`);
	}
}

/**
 * Closure(Items) (Bottom-up Parsing III, slide 10): for each [X → α•Yβ, a]
 * in Items, for each production Y → γ, for each b ∈ First(βa), add
 * [Y → •γ, b], until Items is unchanged. Items come out in the order they
 * were added (the order of slides 9 and 11), with a step per add. The
 * productions Y → γ are taken in grammar order unless `closureOrder` says
 * otherwise (LrClosureOptions).
 */
export function lrClosure(
	aug: Augmented,
	items: readonly LrItem[],
	opts?: LrClosureOptions
): { items: LrItem[]; steps: LrClosureStep[] } {
	checkItems(aug, items);
	return close(contextOf(aug, opts), items, true);
}

/** One item of Transition: [X → α•yβ, b] at `from` in the state gives [X → αy•β, b]. */
export interface LrMove {
	from: number;
	item: LrItem;
}

function moves(aug: Augmented, state: readonly LrItem[], y: string): LrMove[] {
	const out: LrMove[] = [];
	state.forEach((item, from) => {
		if (aug.productions[item.production].rhs[item.dot] === y)
			out.push({ from, item: { ...item, dot: item.dot + 1 } });
	});
	return out;
}

/**
 * Transition(state, y) (Bottom-up Parsing III, slide 13): Items ← ∅; for
 * each [X → α•yβ, b] ∈ state add [X → αy•β, b]; return Closure(Items).
 * `moved` lists the items moved over y (the kernel of the new state).
 */
export function lrTransition(
	aug: Augmented,
	state: readonly LrItem[],
	y: string,
	opts?: LrClosureOptions
): { moved: LrMove[]; items: LrItem[]; steps: LrClosureStep[] } {
	checkItems(aug, state);
	const moved = moves(aug, state, y);
	const { items, steps } = close(
		contextOf(aug, opts),
		moved.map((m) => m.item),
		true
	);
	return { moved, items, steps };
}

// ───────────────────────────── automata ─────────────────────────────

/** "reduce with X → α on b" (slide 12): a completed item's production and lookaheads. */
export interface LrReduce {
	production: number;
	/** `$` first, then in item order; null for LR(0) (no lookahead in the items). */
	lookaheads: string[] | null;
}

export interface LrState {
	id: number;
	/** The closed set of items: the kernel first, then the closure in the order it was added. */
	items: LrItem[];
	/** items[0 … kernel) are the kernel (the items Transition moved, or [S → •E, $]). */
	kernel: number;
	/** Edges in the order they were made: on terminals, then on non-terminals. */
	transitions: { symbol: string; to: number }[];
	/** Reduce labels other than the start production, in item order. */
	reduces: LrReduce[];
	/** Holds [S → E•, $]: "accept on $". */
	accept: boolean;
	/** LALR(1): the LR(1) states merged into this one. */
	merged?: number[];
}

export type LrBuildStep =
	| {
			kind: 'start';
			state: number;
			/** [S → •E, $] */
			seed: LrItem[];
			steps: LrClosureStep[];
			/** States and edges made through this step (for drawing the DFA as it grows). */
			states: number;
			edges: number;
	  }
	| {
			kind: 'transition';
			from: number;
			symbol: string;
			moved: LrMove[];
			steps: LrClosureStep[];
			/** The state Transition(from, symbol) is: a new one, or an existing state with the same items. */
			to: number;
			isNew: boolean;
			states: number;
			edges: number;
	  };

export interface LrAutomaton {
	kind: 'lr0' | 'lr1' | 'lalr1';
	augmented: Augmented;
	states: LrState[];
	/** Every edge in the order it was made. */
	edges: { from: number; symbol: string; to: number }[];
	/** The construction, step by step; empty for LALR(1) and with `trace: false`. */
	steps: LrBuildStep[];
	/** maxStates was reached: some states and edges are missing. */
	truncated: boolean;
	diagnostics: Diagnostic[];
}

/** Default limit on the number of states of lr0Automaton and lr1Automaton. */
export const DEFAULT_MAX_STATES = 5000;

/** Options of lr1Automaton and lr0Automaton. */
export interface LrAutomatonOptions extends LrClosureOptions {
	/** Record every Closure and Transition step (default true). */
	trace?: boolean;
	/** Stop making states at this many (default DEFAULT_MAX_STATES). */
	maxStates?: number;
}

function labels(aug: Augmented, items: readonly LrItem[]): Pick<LrState, 'reduces' | 'accept'> {
	const order: number[] = [];
	const lookaheads = new Map<number, string[]>();
	let accept = false;
	let lr0 = false;
	for (const item of items) {
		const p = aug.productions[item.production];
		if (item.dot !== p.rhs.length) continue;
		if (p.id === aug.production.id) {
			accept = true;
			continue;
		}
		if (!lookaheads.has(p.id)) {
			lookaheads.set(p.id, []);
			order.push(p.id);
		}
		if (item.lookahead === null) lr0 = true;
		else lookaheads.get(p.id)!.push(item.lookahead);
	}
	return {
		reduces: order.map((production) => ({
			production,
			lookaheads: lr0 ? null : endFirst(lookaheads.get(production)!)
		})),
		accept
	};
}

function reservedWarnings(g: Grammar): Diagnostic[] {
	return reservedSymbols(g).map((s) => ({
		severity: 'warning',
		message: `The grammar has a symbol named ${s}: it cannot be told from the ${
			s === END_MARKER ? 'end marker $' : 'empty string ε'
		} in the items and the table.`
	}));
}

const kernelKey = (items: readonly LrItem[]): string => JSON.stringify(items.map(itemKey).sort());

function build(g: Grammar, kind: 'lr0' | 'lr1', opts?: LrAutomatonOptions): LrAutomaton {
	const aug = augment(g);
	const ctx = contextOf(aug, opts);
	const trace = opts?.trace ?? true;
	const maxStates = Math.max(1, Math.floor(opts?.maxStates ?? DEFAULT_MAX_STATES));
	const states: LrState[] = [];
	const edges: LrAutomaton['edges'] = [];
	const steps: LrBuildStep[] = [];
	const byKernel = new Map<string, number>();
	const create = (kernel: readonly LrItem[], closed: Closed): number => {
		const id = states.length;
		states.push({
			id,
			items: closed.items,
			kernel: kernel.length,
			transitions: [],
			...labels(aug, closed.items)
		});
		byKernel.set(kernelKey(kernel), id);
		return id;
	};
	const seed: LrItem = {
		production: aug.production.id,
		dot: 0,
		lookahead: kind === 'lr1' ? END_MARKER : null
	};
	const start = close(ctx, [seed], trace);
	create([seed], start);
	if (trace)
		steps.push({ kind: 'start', state: 0, seed: [seed], steps: start.steps, states: 1, edges: 0 });
	let truncated = false;
	for (let s = 0; s < states.length; s++) {
		const state = states[s];
		const terminals: string[] = [];
		const nonterminals: string[] = [];
		const seen = new Set<string>();
		for (const item of state.items) {
			const y = aug.productions[item.production].rhs[item.dot];
			if (y === undefined || seen.has(y)) continue;
			seen.add(y);
			(ctx.isNonterminal.has(y) ? nonterminals : terminals).push(y);
		}
		for (const y of [...terminals, ...nonterminals]) {
			const moved = moves(aug, state.items, y);
			const kernel = moved.map((m) => m.item);
			let to = byKernel.get(kernelKey(kernel));
			const isNew = to === undefined;
			if (isNew && states.length >= maxStates) {
				truncated = true;
				continue;
			}
			const closed = isNew || trace ? close(ctx, kernel, trace) : null;
			if (to === undefined) to = create(kernel, closed!);
			state.transitions.push({ symbol: y, to });
			edges.push({ from: s, symbol: y, to });
			if (trace)
				steps.push({
					kind: 'transition',
					from: s,
					symbol: y,
					moved,
					steps: closed!.steps,
					to,
					isNew,
					states: states.length,
					edges: edges.length
				});
		}
	}
	const diagnostics = reservedWarnings(g);
	if (truncated)
		diagnostics.push({
			severity: 'error',
			message: `The ${kind === 'lr1' ? 'LR(1)' : 'LR(0)'} automaton has more than ${maxStates} states; it was cut off there.`
		});
	return { kind, augmented: aug, states, edges, steps, truncated, diagnostics };
}

/**
 * The canonical LR(1) parsing DFA (Bottom-up Parsing III, slides 11–14):
 * state 0 is Closure({ [S → •E, $] }); states are processed in the order
 * they are made; within a state the transitions on terminals come first,
 * then those on non-terminals, each in the order the symbols first appear
 * after • in the state's items; a Transition result with the same items as
 * an existing state is that state. For E → E + ( E ) | int this numbers the
 * 12 states exactly as Bottom-up Parsing II, slide 17 does.
 *
 * `trace` (default true) records every Closure and Transition step;
 * `maxStates` (default DEFAULT_MAX_STATES) bounds the construction, which
 * can grow quickly for large grammars; `closureOrder` changes the order of
 * the items Closure adds (LrClosureOptions), and with it the order of the
 * transitions that follow from it.
 */
export function lr1Automaton(g: Grammar, opts?: LrAutomatonOptions): LrAutomaton {
	return build(g, 'lr1', opts);
}

/**
 * The LR(0) automaton: the same construction with items without lookahead.
 * Not in the decks, which only name LR(0) (Bottom-up Parsing III, slide 26);
 * used for the LR(0) and SLR(1) tables of grammarClasses.
 */
export function lr0Automaton(g: Grammar, opts?: LrAutomatonOptions): LrAutomaton {
	return build(g, 'lr0', opts);
}

/**
 * The LALR(1) automaton: the LR(1) states with the same items but for their
 * lookaheads (the same core) become one state, with the lookaheads of all
 * of them. Not in the decks, which only name LALR(1) (Bottom-up Parsing III,
 * slide 26); bison builds this automaton by default. Merged states are
 * numbered in the order of their lowest LR(1) state and list their LR(1)
 * states in `merged`. There are no construction steps.
 */
export function lalr1Automaton(lr1: LrAutomaton): LrAutomaton {
	if (lr1.kind !== 'lr1') throw new Error('lalr1Automaton: expects an LR(1) automaton');
	const aug = lr1.augmented;
	const coreOf = (state: LrState): string =>
		JSON.stringify([...new Set(state.items.map((i) => `${i.production},${i.dot}`))].sort());
	const groups = new Map<string, number[]>();
	const newId = new Map<number, number>();
	for (const state of lr1.states) {
		const core = coreOf(state);
		let members = groups.get(core);
		if (!members) groups.set(core, (members = []));
		members.push(state.id);
	}
	[...groups.values()].forEach((members, id) => members.forEach((m) => newId.set(m, id)));
	const states: LrState[] = [...groups.values()].map((members, id) => {
		const kernel: LrItem[] = [];
		const rest: LrItem[] = [];
		const seen = new Set<string>();
		for (const m of members) {
			const source = lr1.states[m];
			source.items.forEach((item, k) => {
				const key = itemKey(item);
				if (seen.has(key)) return;
				seen.add(key);
				(k < source.kernel ? kernel : rest).push(item);
			});
		}
		const items = [...kernel, ...rest];
		return {
			id,
			items,
			kernel: kernel.length,
			transitions: lr1.states[members[0]].transitions.map((t) => ({
				symbol: t.symbol,
				to: newId.get(t.to)!
			})),
			...labels(aug, items),
			merged: members
		};
	});
	const edges = states.flatMap((s) =>
		s.transitions.map((t) => ({ from: s.id, symbol: t.symbol, to: t.to }))
	);
	return {
		kind: 'lalr1',
		augmented: aug,
		states,
		edges,
		steps: [],
		truncated: lr1.truncated,
		diagnostics: [...lr1.diagnostics]
	};
}

/**
 * A state's reduce label as Bottom-up Parsing II, slide 17 writes it:
 * "E → int on $, +"; for an LR(0) state just the production.
 */
export function reduceLabel(aug: Augmented, reduce: LrReduce): string {
	const p = printProduction(aug.productions[reduce.production]);
	return reduce.lookaheads ? `${p} on ${reduce.lookaheads.map(symbol).join(', ')}` : p;
}
