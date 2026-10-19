/**
 * Table-driven LL(1) parsing as Table-based Predictive Parsing presents it:
 * First and Follow sets by the deck's own rules (slides 20 and 22), the
 * parsing table T[A, b] (slide 24) and the stack driver (slide 11).
 *
 * Everything returned is plain data (objects, arrays, Maps), so it survives a
 * structured clone and can be computed in a worker. Sets come out in display
 * order (`displayOrder`): `$` first, then terminals in grammar order, then ε.
 *
 * firstSets and followSets (analyze.ts) compute the same sets with a
 * worklist; firstFollow repeats passes over the productions, as the slides
 * do, so that every rule application can be shown.
 */
import type { Diagnostic } from '../diagnostics';
import { reservedSymbols } from './analyze';
import { printSet, printSymbols } from './parse';
import { END_MARKER, EPSILON, type Grammar, type ParseNode } from './types';

// ───────────────────────────── display order ─────────────────────────────

/** Rank of each terminal in grammar order. */
export function terminalRanks(g: Grammar): Map<string, number> {
	return new Map(g.terminals.map((t, i) => [t, i]));
}

/** `symbols` in display order, given the terminal ranks of the grammar. */
export function sortForDisplay(
	rank: ReadonlyMap<string, number>,
	symbols: Iterable<string>
): string[] {
	const set = new Set(symbols);
	const key = (s: string): number =>
		s === END_MARKER ? -1 : s === EPSILON ? Infinity : (rank.get(s) ?? rank.size);
	return [...set].sort((a, b) => key(a) - key(b));
}

/**
 * A set of terminals in the order the decks write FIRST and FOLLOW sets:
 * `$` first, then terminals in grammar order, then `ε` last; anything else
 * (not a terminal of `g`) after the terminals, in the order given.
 * `{ $, +, ) }`, `{ (, int }`, `{ +, ε }`.
 */
export function displayOrder(g: Grammar, symbols: Iterable<string>): string[] {
	return sortForDisplay(terminalRanks(g), symbols);
}

// ───────────────────────────── First and Follow ─────────────────────────────

export type FirstFollowRule =
	/** First(b) = { b } for a terminal b (slide 20, rule 1). */
	| 'first-terminal'
	/** Add First(Ai) – { ε } to First(X). */
	| 'first-add'
	/** Ai is X itself: ignore it (adding First(X) to First(X) changes nothing). */
	| 'first-self'
	/** Stop: ε ∉ First(Ai). */
	| 'first-stop'
	/** Add ε to First(X): every Ai can derive ε (X → ε included). */
	| 'first-epsilon'
	/** Add $ to Follow(S) (slide 22, rule 2). */
	| 'follow-end'
	/** Add First(Ai) – { ε } to Follow(X) for Y → … X A1 … An. */
	| 'follow-add'
	/** Stop: ε ∉ First(Ai). */
	| 'follow-stop'
	/** Add Follow(Y) to Follow(X): every Ai can derive ε (X last included). */
	| 'follow-follow';

/** One application of a rule of slide 20 (First) or slide 22 (Follow). */
export interface FirstFollowStep {
	rule: FirstFollowRule;
	/**
	 * 0 for the rules applied once (First(b) = { b }, Add $ to Follow(S));
	 * 1, 2, … for the passes over the productions.
	 */
	pass: number;
	/** The production the rule is applied to (null in pass 0). */
	production: number | null;
	/** Follow: the position of X in the right-hand side; null for First. */
	position: number | null;
	/** i of Ai (1-based): the right-hand side for First, the symbols after X for Follow. */
	index: number | null;
	/** Ai for add, self and stop; Y for follow-follow; null otherwise. */
	symbol: string | null;
	/** X: the symbol whose set the rule adds to. */
	target: string;
	/** The members that were new to the set, in display order (empty: the set did not change). */
	added: string[];
	/** The rule in the deck's words with the symbols filled in: "Add First( T ) – { ε } to First( E )". */
	text: string;
}

export interface FirstFollow {
	/** First of every symbol: non-terminals in grammar order, then terminals; sets in display order. */
	first: Map<string, string[]>;
	/** Follow of every symbol, terminals included (slide 23 asks Follow( int )). */
	follow: Map<string, string[]>;
	firstSteps: FirstFollowStep[];
	followSteps: FirstFollowStep[];
	/** Passes over the productions, the last one changing nothing. */
	firstPasses: number;
	followPasses: number;
	/** A warning when the grammar has a symbol named `$` or `ε` (see reservedSymbols). */
	diagnostics: Diagnostic[];
}

/** `X` as the argument of First( X ): the spaced form of the slides' questions. */
const arg = (symbols: readonly string[]): string => `( ${printTight(symbols)} )`;

/**
 * Symbols written the way slide 25 writes First( *T ): a space only between
 * two symbols that would otherwise run together (`int Y`, `T X`), none next
 * to punctuation (`*T`, `(E)`). `ε` for the empty string.
 */
export function printTight(symbols: readonly string[]): string {
	if (symbols.length === 0) return EPSILON;
	const parts = symbols.map((s) => printSymbols([s]));
	// A hyphen between two names would join them into one name (`E-T`), so it keeps its spaces.
	const word = /[\p{L}\p{N}_’'"-]/u;
	let out = parts[0];
	for (let i = 1; i < parts.length; i++) {
		const before = out[out.length - 1];
		const after = parts[i][0];
		out += word.test(before) && word.test(after) ? ` ${parts[i]}` : parts[i];
	}
	return out;
}

function reservedWarning(g: Grammar): Diagnostic[] {
	return reservedSymbols(g).map((s) => ({
		severity: 'warning',
		message: `The grammar has a symbol named ${s}: in the sets it cannot be told from the ${
			s === END_MARKER ? 'end marker $' : 'empty string ε'
		}.`
	}));
}

/**
 * First and Follow of every symbol by the rules of Table-based Predictive
 * Parsing, slides 20 and 22, with a step for each rule application.
 *
 * First: First(b) = { b } for each terminal (pass 0); then, pass after pass,
 * for each production X → A1 … An in grammar order: add First(Ai) – { ε } to
 * First(X) for i = 1, 2, …, stopping at the first Ai with ε ∉ First(Ai), and
 * add ε when no Ai stops it; an Ai that is X is ignored (its add changes
 * nothing, but ε ∉ First(X) still stops). Follow: add $ to Follow(S)
 * (pass 0); then, pass after pass, for each occurrence of a symbol X in a
 * production Y → … X A1 … An (terminals too, as slide 23 asks): add
 * First(Ai) – { ε } to Follow(X), stopping at the first Ai with ε ∉ First(Ai),
 * and add Follow(Y) when none stops it. Passes repeat until one changes
 * nothing; that last pass is in the trace too.
 *
 * The trace has a step per symbol per production per pass, so it is meant
 * for grammars the size of a slide; firstSets and followSets compute the
 * sets alone for any grammar.
 */
export function firstFollow(g: Grammar): FirstFollow {
	const rank = terminalRanks(g);
	const isNonterminal = new Set(g.nonterminals);
	const first = new Map<string, Set<string>>();
	for (const n of g.nonterminals) first.set(n, new Set());
	for (const t of g.terminals) if (!isNonterminal.has(t)) first.set(t, new Set([t]));
	const firstOfSymbol = (x: string): ReadonlySet<string> => first.get(x) ?? new Set([x]);
	const addAll = (target: Set<string>, members: Iterable<string>): string[] => {
		const added: string[] = [];
		for (const m of members) {
			if (target.has(m)) continue;
			target.add(m);
			added.push(m);
		}
		return sortForDisplay(rank, added);
	};

	const firstSteps: FirstFollowStep[] = g.terminals.map((t) => ({
		rule: 'first-terminal',
		pass: 0,
		production: null,
		position: null,
		index: null,
		symbol: null,
		target: t,
		added: [t],
		text: `First${arg([t])} = ${printSet([t])}`
	}));
	let firstPasses = 0;
	for (let changed = true; changed;) {
		changed = false;
		const pass = ++firstPasses;
		for (const p of g.productions) {
			const x = p.lhs;
			const target = first.get(x)!;
			const step = (
				rule: FirstFollowRule,
				index: number | null,
				symbol: string | null,
				added: string[],
				text: string
			): void => {
				if (added.length > 0) changed = true;
				firstSteps.push({
					rule,
					pass,
					production: p.id,
					position: null,
					index,
					symbol,
					target: x,
					added,
					text
				});
			};
			let stopped = false;
			for (let i = 0; i < p.rhs.length && !stopped; i++) {
				const a = p.rhs[i];
				const fa = firstOfSymbol(a);
				if (a === x) step('first-self', i + 1, a, [], `Ignore A${i + 1}: it is ${printTight([x])}`);
				else {
					const added = addAll(
						target,
						[...fa].filter((s) => s !== EPSILON)
					);
					step(
						'first-add',
						i + 1,
						a,
						added,
						`Add First${arg([a])} – { ${EPSILON} } to First${arg([x])}`
					);
				}
				if (!fa.has(EPSILON)) {
					step('first-stop', i + 1, a, [], `Stop: ${EPSILON} ∉ First${arg([a])}`);
					stopped = true;
				}
			}
			if (!stopped)
				step(
					'first-epsilon',
					null,
					null,
					addAll(target, [EPSILON]),
					`Add ${EPSILON} to First${arg([x])}`
				);
		}
	}

	const follow = new Map<string, Set<string>>();
	for (const s of [...g.nonterminals, ...g.terminals]) follow.set(s, new Set());
	const followSteps: FirstFollowStep[] = [
		{
			rule: 'follow-end',
			pass: 0,
			production: null,
			position: null,
			index: null,
			symbol: null,
			target: g.start,
			added: addAll(follow.get(g.start)!, [END_MARKER]),
			text: `Add ${END_MARKER} to Follow${arg([g.start])}`
		}
	];
	let followPasses = 0;
	for (let changed = true; changed;) {
		changed = false;
		const pass = ++followPasses;
		for (const p of g.productions) {
			p.rhs.forEach((x, position) => {
				const target = follow.get(x)!;
				const step = (
					rule: FirstFollowRule,
					index: number | null,
					symbol: string | null,
					added: string[],
					text: string
				): void => {
					if (added.length > 0) changed = true;
					followSteps.push({
						rule,
						pass,
						production: p.id,
						position,
						index,
						symbol,
						target: x,
						added,
						text
					});
				};
				for (let i = 1; position + i < p.rhs.length; i++) {
					const a = p.rhs[position + i];
					const fa = firstOfSymbol(a);
					step(
						'follow-add',
						i,
						a,
						addAll(
							target,
							[...fa].filter((s) => s !== EPSILON)
						),
						`Add First${arg([a])} – { ${EPSILON} } to Follow${arg([x])}`
					);
					if (!fa.has(EPSILON)) {
						step('follow-stop', i, a, [], `Stop: ${EPSILON} ∉ First${arg([a])}`);
						return;
					}
				}
				step(
					'follow-follow',
					null,
					p.lhs,
					addAll(target, follow.get(p.lhs)!),
					`Add Follow${arg([p.lhs])} to Follow${arg([x])}`
				);
			});
		}
	}

	const ordered = (sets: Map<string, Set<string>>): Map<string, string[]> => {
		const out = new Map<string, string[]>();
		for (const s of [...g.nonterminals, ...g.terminals])
			if (sets.has(s) && !out.has(s)) out.set(s, sortForDisplay(rank, sets.get(s)!));
		return out;
	};
	return {
		first: ordered(first),
		follow: ordered(follow),
		firstSteps,
		followSteps,
		firstPasses,
		followPasses,
		diagnostics: reservedWarning(g)
	};
}

/** First(α) of a string of symbols from computed sets: ε included when every symbol derives ε. */
export function firstOfString(ff: FirstFollow, g: Grammar, symbols: readonly string[]): string[] {
	const out = new Set<string>();
	for (const x of symbols) {
		const fx = ff.first.get(x) ?? [x];
		for (const t of fx) if (t !== EPSILON) out.add(t);
		if (!fx.includes(EPSILON)) return displayOrder(g, out);
	}
	out.add(EPSILON);
	return displayOrder(g, out);
}

// ───────────────────────────── the table ─────────────────────────────

/** Why a production is in a row of the table (slide 25). */
export interface LL1Placement {
	production: number;
	/** 'first': b ∈ First(α). 'follow': α →* ε and b ∈ Follow(A). */
	rule: 'first' | 'follow';
	/** First(α), ε included when α →* ε; or Follow(A). Display order. */
	set: string[];
	/** The columns the production goes in: `set` without ε. */
	columns: string[];
	/** "in columns of First( *T ) = { * }", "in columns of Follow( Y ) = { $, +, ) }". */
	text: string;
}

export interface LL1Cell {
	/** The productions in T[A, b], in grammar order; more than one is a conflict. */
	productions: number[];
	/** The placements that put them there (a production may come in by both rules). */
	placements: LL1Placement[];
}

export interface LL1Conflict {
	nonterminal: string;
	terminal: string;
	productions: number[];
}

export interface LL1Table {
	grammar: Grammar;
	/** Row headers: N in grammar order. */
	rows: string[];
	/** Column headers: T in grammar order, then $. */
	columns: string[];
	/** cells[row][column]; a blank entry (error) has no productions. */
	cells: LL1Cell[][];
	/** Where each production went, in grammar order: its First placement, then its Follow one. */
	placements: LL1Placement[];
	/** Multiply-defined entries, row by row: G is not LL(1) when there is one. */
	conflicts: LL1Conflict[];
	ll1: boolean;
	firstFollow: FirstFollow;
	diagnostics: Diagnostic[];
}

/**
 * The LL(1) parsing table (Table-based Predictive Parsing, slide 24): for
 * each production A → α, T[A, b] gets α for every terminal b ∈ First(α), and
 * when α →* ε also for every b ∈ Follow(A), $ included. Each placement says
 * which rule made it, in the words of slide 25. An entry with two or more
 * productions is multiply defined, and then G is not LL(1) (slide 26).
 * A cell holds production ids; the slides show only the right-hand side.
 */
export function ll1Table(g: Grammar, ff: FirstFollow = firstFollow(g)): LL1Table {
	const rows = [...g.nonterminals];
	const columns = [...g.terminals.filter((t) => t !== END_MARKER), END_MARKER];
	const rowOf = new Map(rows.map((n, i) => [n, i]));
	const columnOf = new Map(columns.map((t, i) => [t, i]));
	const cells: LL1Cell[][] = rows.map(() =>
		columns.map(() => ({ productions: [], placements: [] }))
	);
	const placements: LL1Placement[] = [];
	const place = (placement: LL1Placement, lhs: string): void => {
		placements.push(placement);
		const row = cells[rowOf.get(lhs)!];
		for (const b of placement.columns) {
			const cell = row[columnOf.get(b)!];
			if (!cell) continue;
			if (!cell.productions.includes(placement.production))
				cell.productions.push(placement.production);
			cell.placements.push(placement);
		}
	};
	for (const p of g.productions) {
		const fa = firstOfString(ff, g, p.rhs);
		const terminals = fa.filter((s) => s !== EPSILON);
		if (terminals.length > 0) {
			const name = `First( ${printTight(p.rhs)} )`;
			place(
				{
					production: p.id,
					rule: 'first',
					set: fa,
					columns: terminals,
					text: `in columns of ${fa.includes(EPSILON) ? `${name} – { ${EPSILON} }` : name} = ${printSet(terminals)}`
				},
				p.lhs
			);
		}
		if (fa.includes(EPSILON)) {
			const set = ff.follow.get(p.lhs) ?? [];
			place(
				{
					production: p.id,
					rule: 'follow',
					set,
					columns: set,
					text: `in columns of Follow${arg([p.lhs])} = ${printSet(set)}`
				},
				p.lhs
			);
		}
	}
	const conflicts: LL1Conflict[] = [];
	cells.forEach((row, r) =>
		row.forEach((cell, c) => {
			cell.productions.sort((a, b) => a - b);
			if (cell.productions.length > 1)
				conflicts.push({
					nonterminal: rows[r],
					terminal: columns[c],
					productions: [...cell.productions]
				});
		})
	);
	return {
		grammar: g,
		rows,
		columns,
		cells,
		placements,
		conflicts,
		ll1: conflicts.length === 0,
		firstFollow: ff,
		diagnostics: [...ff.diagnostics]
	};
}

/** T[A, b], or null when A is not a row or b not a column. */
export function ll1Cell(table: LL1Table, nonterminal: string, terminal: string): LL1Cell | null {
	const r = table.rows.indexOf(nonterminal);
	const c = table.columns.indexOf(terminal);
	return r < 0 || c < 0 ? null : table.cells[r][c];
}

// ───────────────────────────── the input ─────────────────────────────

/**
 * The input array I = w $ of a driver. A closing `$` in `tokens` is taken as
 * the end marker (unless `$` is a terminal of g); a `$` anywhere else is an
 * error, because it would end the input early.
 */
export function endInput(
	g: Grammar,
	tokens: readonly string[]
): { input: string[]; diagnostics: Diagnostic[] } {
	const words = [...tokens];
	if (!g.terminals.includes(END_MARKER)) {
		if (words[words.length - 1] === END_MARKER) words.pop();
		if (words.includes(END_MARKER))
			return {
				input: [],
				diagnostics: [
					{
						severity: 'error',
						message: `${END_MARKER} marks the end of the input: only the last token can be ${END_MARKER}.`
					}
				]
			};
	}
	return { input: [...words, END_MARKER], diagnostics: [] };
}

// ───────────────────────────── trees that share parts ─────────────────────────────

/**
 * `root` with the node at `path` replaced by `change(node)`: the nodes on the
 * path are copied and every other subtree is shared, so each step of a
 * driver keeps its own tree at the cost of one path.
 */
export function replaceAt(
	root: ParseNode,
	path: readonly number[],
	change: (node: ParseNode) => ParseNode
): ParseNode {
	const chain = [root];
	for (const i of path) chain.push(chain[chain.length - 1].children[i]);
	let node = change(chain[chain.length - 1]);
	for (let k = path.length - 1; k >= 0; k--) {
		const parent = chain[k];
		const children = parent.children.slice();
		children[path[k]] = node;
		node = { ...parent, children };
	}
	return node;
}

/** A copy of a complete tree (every leaf a terminal or an ε node) with every node's token range. */
export function withRanges(root: ParseNode): ParseNode {
	let at = 0;
	const copy = (node: ParseNode): ParseNode => ({ ...node, children: [] });
	const top = copy(root);
	const open: { node: ParseNode; source: ParseNode; done: number }[] = [];
	const enter = (target: ParseNode, source: ParseNode): void => {
		target.start = at;
		if (source.terminal) target.end = ++at;
		else open.push({ node: target, source, done: 0 });
	};
	enter(top, root);
	while (open.length > 0) {
		const frame = open[open.length - 1];
		if (frame.done < frame.source.children.length) {
			const child = frame.source.children[frame.done++];
			const target = copy(child);
			frame.node.children.push(target);
			enter(target, child);
		} else {
			frame.node.end = at;
			open.pop();
		}
	}
	return top;
}

// ───────────────────────────── the driver ─────────────────────────────

export type LL1Action =
	/** Replace the non-terminal on top by the right-hand side in T[N, *next]. */
	| { kind: 'expand'; production: number }
	/** The terminal on top is the next token: pop it and advance. */
	| { kind: 'match'; terminal: string }
	| { kind: 'accept' }
	/** T[N, *next] is blank. */
	| { kind: 'blank'; nonterminal: string; terminal: string }
	/** The terminal on top is not the next token. */
	| { kind: 'mismatch'; expected: string; found: string }
	/**
	 * The run stopped at maxSteps, PARSE_STACK_BUDGET or MAX_TREE_DEPTH (only a
	 * grammar that is not LL(1) can loop; a very long input can get there too).
	 */
	| { kind: 'limit' };

export interface LL1Row {
	/** The stack, top first, `$` at the bottom (slide 12 writes it left to right). */
	stack: string[];
	/** The remaining input with the trailing `$`. */
	input: string[];
	/** What is done to this row's stack and input. */
	action: LL1Action;
	/**
	 * The Action column: the right-hand side pushed ("T X", "ε"), "terminal", "ACCEPT", the
	 * error, or why the run stopped ("stopped after 5 steps", TREE_DEPTH_TEXT).
	 */
	text: string;
	/** The parse tree for this row's stack: non-terminals still on the stack are unexpanded leaves. */
	tree: ParseNode;
	/** Path in `tree` of the node on top of the stack; null when `$` is on top. */
	focus: number[] | null;
	/** The table entry this row looks up (expand and blank rows). */
	cell: { row: number; column: number } | null;
}

export interface LL1Parse {
	rows: LL1Row[];
	outcome: 'accept' | 'error' | 'limit';
	/** The complete tree, with token ranges, when the input is accepted. */
	tree: ParseNode | null;
	diagnostics: Diagnostic[];
}

/**
 * Default step limit of ll1Parse and lrParse. The two other limits,
 * MAX_TREE_DEPTH and PARSE_STACK_BUDGET, are what bound long inputs: a run
 * accepts a sentence when its parse tree is at most MAX_TREE_DEPTH levels
 * deep, so a list of up to about 500 items (S → id S | ε takes 499 ids) or a
 * few hundred nested parentheses (165 in E → E + T | T ; T → T * F | F ;
 * F → int | ( E )); a longer one stops with outcome 'limit'.
 */
export const DEFAULT_PARSE_STEPS = 20_000;

/**
 * ll1Parse and lrParse also stop (outcome 'limit') once their rows hold this
 * many stack entries in all (for ll1Parse, together with the tree nodes each
 * row copies). Each row keeps its own stack (an array of shared entries), so
 * a run's memory grows with its steps times its stack depth, and a run whose
 * stack keeps growing stops long before it fills memory.
 */
export const PARSE_STACK_BUDGET = 4_000_000;

/**
 * The deepest parse tree ll1Parse and lrParse build, in levels (the root is
 * level 1). A structured clone, which carries a result out of a worker
 * (docs/ARCHITECTURE.md §5.4), copies nested objects recursively, and
 * Chrome's workers run out of stack at about 900 levels of ParseNode; every
 * tree in the drivers' results is at most this deep, so the results survive
 * the clone. A run whose tree would grow deeper stops with outcome 'limit'
 * (a left-recursive production chosen for ever, or a very long input).
 */
export const MAX_TREE_DEPTH = 500;

/** The text of the row where a driver stops at MAX_TREE_DEPTH. */
export const TREE_DEPTH_TEXT = `stopped: the parse tree would be more than ${MAX_TREE_DEPTH} levels deep`;

/**
 * Runs the LL(1) algorithm of Table-based Predictive Parsing, slide 11, on
 * `tokens` (without or with the closing `$`): the stack starts as < S $ >; a
 * non-terminal N on top is replaced by T[N, *next] (an error when it is
 * blank); a terminal on top must be the next token, and is popped while the
 * input advances. The slide 12 trace ends with ACCEPT when the stack and the
 * input are both `$`.
 *
 * When the table has multiply-defined entries the parser takes the first
 * production of the entry (with a warning). A run stops with outcome 'limit'
 * after `maxSteps` rows (default DEFAULT_PARSE_STEPS), at PARSE_STACK_BUDGET,
 * or before an expansion that would make the tree deeper than
 * MAX_TREE_DEPTH: a left-recursive production chosen for ever (only a grammar
 * that is not LL(1) can loop) or a very long input.
 */
export function ll1Parse(
	table: LL1Table,
	tokens: readonly string[],
	opts?: { maxSteps?: number }
): LL1Parse {
	const g = table.grammar;
	const { input, diagnostics } = endInput(g, tokens);
	if (input.length === 0) return { rows: [], outcome: 'error', tree: null, diagnostics };
	if (table.conflicts.length > 0)
		diagnostics.push({
			severity: 'warning',
			message:
				'G is not LL(1): the parser uses the first production of each multiply-defined entry.'
		});
	const maxSteps = Math.max(1, Math.floor(opts?.maxSteps ?? DEFAULT_PARSE_STEPS));
	const rowOf = new Map(table.rows.map((n, i) => [n, i]));
	const columnOf = new Map(table.columns.map((t, i) => [t, i]));

	let tree: ParseNode = { symbol: g.start, terminal: false, children: [] };
	/** Top at the end; `$` has no node. */
	const stack: { symbol: string; path: number[] | null }[] = [
		{ symbol: END_MARKER, path: null },
		{ symbol: g.start, path: [] }
	];
	const rows: LL1Row[] = [];
	let j = 0;
	// What the rows keep: each its stack, its focus path and the path of nodes it copies.
	let cells = 0;
	const cost = (): number => stack.length + (stack[stack.length - 1].path?.length ?? 0);
	const row = (action: LL1Action, text: string, cell: LL1Row['cell'] = null): void => {
		const top = stack[stack.length - 1];
		cells += cost();
		rows.push({
			stack: stack.map((e) => e.symbol).reverse(),
			input: input.slice(j),
			action,
			text,
			tree,
			focus: top.path ? [...top.path] : null,
			cell
		});
	};
	for (;;) {
		if (rows.length === maxSteps - 1 || cells + cost() > PARSE_STACK_BUDGET) {
			row({ kind: 'limit' }, `stopped after ${rows.length} steps`);
			return { rows, outcome: 'limit', tree: null, diagnostics };
		}
		const top = stack[stack.length - 1];
		const next = input[j];
		if (top.path === null) {
			if (next === END_MARKER) {
				tree = withRanges(tree);
				row({ kind: 'accept' }, 'ACCEPT');
				return { rows, outcome: 'accept', tree, diagnostics };
			}
			row(
				{ kind: 'mismatch', expected: END_MARKER, found: next },
				`Mismatch: ${printSymbols([next])} is not ${END_MARKER}`
			);
			return { rows, outcome: 'error', tree: null, diagnostics };
		}
		const r = rowOf.get(top.symbol);
		if (r !== undefined) {
			const c = columnOf.get(next);
			const productions = c === undefined ? [] : table.cells[r][c].productions;
			const cell = c === undefined ? null : { row: r, column: c };
			if (productions.length === 0) {
				row(
					{ kind: 'blank', nonterminal: top.symbol, terminal: next },
					`[${printSymbols([top.symbol])},${printSymbols([next])}] is blank`,
					cell
				);
				return { rows, outcome: 'error', tree: null, diagnostics };
			}
			const p = g.productions[productions[0]];
			// The node on top is at level path + 1; its children would be one level below.
			if (p.rhs.length > 0 && top.path.length + 2 > MAX_TREE_DEPTH) {
				row({ kind: 'limit' }, TREE_DEPTH_TEXT);
				return { rows, outcome: 'limit', tree: null, diagnostics };
			}
			row({ kind: 'expand', production: p.id }, printSymbols(p.rhs), cell);
			cells += p.rhs.length * (top.path.length + 1);
			tree = replaceAt(tree, top.path, (node) => ({
				...node,
				production: p.id,
				children: p.rhs.map((symbol) => ({
					symbol,
					terminal: !rowOf.has(symbol),
					children: []
				}))
			}));
			stack.pop();
			for (let i = p.rhs.length - 1; i >= 0; i--)
				stack.push({ symbol: p.rhs[i], path: [...top.path, i] });
			continue;
		}
		if (top.symbol !== next) {
			row(
				{ kind: 'mismatch', expected: top.symbol, found: next },
				`Mismatch: ${printSymbols([next])} is not ${printSymbols([top.symbol])}`
			);
			return { rows, outcome: 'error', tree: null, diagnostics };
		}
		row({ kind: 'match', terminal: next }, 'terminal');
		const at = j;
		tree = replaceAt(tree, top.path, (node) => ({ ...node, start: at, end: at + 1 }));
		stack.pop();
		j++;
	}
}
