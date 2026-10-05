/**
 * Properties of a context-free grammar: nullable non-terminals, FIRST and
 * FOLLOW sets, unreachable and unproductive non-terminals, left recursion,
 * cycles, the Chomsky type by production form, and the range of sentence
 * lengths.
 *
 * Sets and lists come out in grammar order: non-terminals in the order of N,
 * terminals in the order of T, then `$`, then `ε`.
 *
 * The analyses follow the productions with worklists, so their cost grows
 * with the size of the grammar and not with its square (leftRecursion lists
 * one chain per non-terminal, so its result alone is as large as the square
 * of the length of a cycle).
 */
import { END_MARKER, EPSILON, type Grammar, type Production } from './types';

/** The productions of a grammar by left-hand side and by the non-terminals they use. */
interface Index {
	isNonterminal: ReadonlySet<string>;
	/** The productions of each non-terminal. */
	byLhs: ReadonlyMap<string, readonly Production[]>;
	/** For each non-terminal, the productions with it on the right-hand side, each listed once. */
	users: ReadonlyMap<string, readonly Production[]>;
}

function indexOf(g: Grammar, productions: readonly Production[] = g.productions): Index {
	const byLhs = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	const users = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of productions) {
		byLhs.get(p.lhs)?.push(p);
		for (const x of new Set(p.rhs)) users.get(x)?.push(p);
	}
	return { isNonterminal: new Set(g.nonterminals), byLhs, users };
}

/**
 * A fixed point by worklist: `visit` runs on every production, and again on
 * the productions that `dependents` lists for a non-terminal each time `visit`
 * reports that non-terminal as changed.
 */
function settle(
	productions: readonly Production[],
	dependents: ReadonlyMap<string, readonly Production[]>,
	visit: (p: Production, changed: (nonterminal: string) => void) => void
): void {
	const queue = [...productions];
	const waiting = new Set(queue);
	const changed = (nonterminal: string): void => {
		for (const p of dependents.get(nonterminal) ?? []) {
			if (waiting.has(p)) continue;
			waiting.add(p);
			queue.push(p);
		}
	};
	for (let next = 0; next < queue.length; next++) {
		const p = queue[next];
		waiting.delete(p);
		visit(p, changed);
	}
}

/**
 * The strongly connected components of a graph (Tarjan's algorithm, with a
 * stack of its own instead of recursion). A component is listed after every
 * component its nodes lead to.
 */
function components(
	nodes: Iterable<string>,
	edges: ReadonlyMap<string, Iterable<string>>
): string[][] {
	const order = new Map<string, number>();
	const low = new Map<string, number>();
	const open: string[] = [];
	const isOpen = new Set<string>();
	const out: string[][] = [];
	const frames: { node: string; next: Iterator<string> }[] = [];
	const enter = (node: string): void => {
		order.set(node, order.size);
		low.set(node, order.get(node)!);
		open.push(node);
		isOpen.add(node);
		frames.push({ node, next: (edges.get(node) ?? [])[Symbol.iterator]() });
	};
	for (const root of nodes) {
		if (order.has(root)) continue;
		enter(root);
		while (frames.length > 0) {
			const { node, next } = frames[frames.length - 1];
			const step = next.next();
			if (!step.done) {
				if (!order.has(step.value)) enter(step.value);
				else if (isOpen.has(step.value))
					low.set(node, Math.min(low.get(node)!, order.get(step.value)!));
				continue;
			}
			frames.pop();
			const parent = frames[frames.length - 1]?.node;
			if (parent !== undefined) low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
			if (low.get(node) !== order.get(node)) continue;
			const component: string[] = [];
			let member: string;
			do {
				member = open.pop()!;
				isOpen.delete(member);
				component.push(member);
			} while (member !== node);
			out.push(component);
		}
	}
	return out;
}

/** The index of each node's component in the list `components` returns. */
function componentOf(parts: readonly string[][]): Map<string, number> {
	const of = new Map<string, number>();
	parts.forEach((members, k) => members.forEach((member) => of.set(member, k)));
	return of;
}

/**
 * For each nullable non-terminal, the id of a production whose right-hand
 * side was already known to be nullable, so following these productions
 * always ends.
 */
function erasers(g: Grammar, index: Index = indexOf(g)): Map<string, number> {
	const via = new Map<string, number>();
	settle(g.productions, index.users, (p, changed) => {
		if (via.has(p.lhs) || !p.rhs.every((x) => via.has(x))) return;
		via.set(p.lhs, p.id);
		changed(p.lhs);
	});
	return via;
}

/** The non-terminals that derive ε. */
export function nullable(g: Grammar): Set<string> {
	const via = erasers(g);
	return new Set(g.nonterminals.filter((n) => via.has(n)));
}

/** `set` with its members in the order of `order`; members not listed there keep their place at the end. */
function sorted(set: ReadonlySet<string>, order: readonly string[]): Set<string> {
	const out = new Set<string>();
	for (const s of order) if (set.has(s)) out.add(s);
	for (const s of set) out.add(s);
	return out;
}

/** FIRST of a string of symbols, given the FIRST sets of the non-terminals. */
function firstOf(
	symbols: readonly string[],
	first: ReadonlyMap<string, ReadonlySet<string>>,
	into: Set<string>
): Set<string> {
	for (const x of symbols) {
		const fx = first.get(x);
		if (!fx) {
			into.add(x);
			return into;
		}
		for (const t of fx) if (t !== EPSILON) into.add(t);
		if (!fx.has(EPSILON)) return into;
	}
	into.add(EPSILON);
	return into;
}

/**
 * FIRST(A) for every non-terminal A: the terminals that begin strings derived
 * from A, plus EPSILON when A derives ε.
 *
 * The sets hold plain strings, so a terminal that is itself named `ε` cannot
 * be told from the empty string: see reservedSymbols.
 */
export function firstSets(g: Grammar): Map<string, Set<string>> {
	const first = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
	settle(g.productions, indexOf(g).users, (p, changed) => {
		const target = first.get(p.lhs)!;
		const before = target.size;
		firstOf(p.rhs, first, target);
		if (target.size !== before) changed(p.lhs);
	});
	const order = [...g.terminals, EPSILON];
	return new Map([...first].map(([n, set]) => [n, sorted(set, order)]));
}

/**
 * FIRST of a string of symbols: EPSILON is included when every symbol derives
 * ε (and for the empty string). A symbol that is not a non-terminal, such as
 * `$`, stands for itself. Pass `first` to reuse firstSets(g).
 */
export function firstOfSequence(
	g: Grammar,
	symbols: readonly string[],
	first: Map<string, Set<string>> = firstSets(g)
): Set<string> {
	return sorted(firstOf(symbols, first, new Set()), [...g.terminals, END_MARKER, EPSILON]);
}

/**
 * FOLLOW(A) for every non-terminal A: the terminals that can come right after
 * A in a sentential form, with END_MARKER in FOLLOW(S) and wherever A can end
 * one.
 *
 * The sets hold plain strings, so a terminal that is itself named `$` cannot
 * be told from the end marker: see reservedSymbols.
 */
export function followSets(g: Grammar): Map<string, Set<string>> {
	const first = firstSets(g);
	const follow = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
	follow.get(g.start)?.add(END_MARKER);
	// What follows A also follows the last symbols of A's productions: a change to FOLLOW(A) revisits them.
	settle(g.productions, indexOf(g).byLhs, (p, changed) => {
		p.rhs.forEach((x, i) => {
			const target = follow.get(x);
			if (!target) return;
			const before = target.size;
			const rest = firstOf(p.rhs.slice(i + 1), first, new Set());
			for (const t of rest) if (t !== EPSILON) target.add(t);
			if (rest.has(EPSILON)) for (const t of follow.get(p.lhs)!) target.add(t);
			if (target.size !== before) changed(x);
		});
	});
	const order = [...g.terminals, END_MARKER];
	return new Map([...follow].map(([n, set]) => [n, sorted(set, order)]));
}

/**
 * The symbols of `g`, non-terminals then terminals, that are spelled like the
 * end marker `$` or like `ε`. FIRST and FOLLOW sets, and anything built from
 * them, hold those two markers as plain strings, so in a grammar with such a
 * symbol a `$` or `ε` in a set can be either one (and firstOfSequence takes a
 * non-terminal named `$` for that non-terminal). parseGrammar and parseEbnf
 * warn about these symbols; this list is the same check for any grammar, for
 * a tool that shows FIRST or FOLLOW sets or builds a predictive parser.
 */
export function reservedSymbols(g: Grammar): string[] {
	return [...g.nonterminals, ...g.terminals].filter((s) => s === END_MARKER || s === EPSILON);
}

/** `from` and every non-terminal that its productions lead to. */
function reach(from: string, index: Index): Set<string> {
	const seen = new Set([from]);
	const stack = [from];
	while (stack.length > 0) {
		for (const p of index.byLhs.get(stack.pop()!) ?? []) {
			for (const x of p.rhs) {
				if (!index.isNonterminal.has(x) || seen.has(x)) continue;
				seen.add(x);
				stack.push(x);
			}
		}
	}
	return seen;
}

/** Non-terminals that no derivation from the start symbol reaches, in grammar order. */
export function unreachable(g: Grammar): string[] {
	const seen = reach(g.start, indexOf(g));
	return g.nonterminals.filter((n) => !seen.has(n));
}

function productiveSet(g: Grammar): Set<string> {
	const { isNonterminal, users } = indexOf(g);
	const productive = new Set<string>();
	settle(g.productions, users, (p, changed) => {
		if (productive.has(p.lhs)) return;
		if (!p.rhs.every((x) => !isNonterminal.has(x) || productive.has(x))) return;
		productive.add(p.lhs);
		changed(p.lhs);
	});
	return productive;
}

/** Non-terminals that derive no string of terminals, in grammar order. */
export function unproductive(g: Grammar): string[] {
	const productive = productiveSet(g);
	return g.nonterminals.filter((n) => !productive.has(n));
}

export interface LeftRecursion {
	nonterminal: string;
	/** Some production has the form V → V α. */
	immediate: boolean;
	/**
	 * Production ids of a derivation V →+ V α, each applied to the first symbol
	 * of the sentential form: `[id of V → V α]` when immediate; for
	 * S → A α | δ ; A → S β the chain of S is S → A α then A → S β. A nullable
	 * non-terminal in front of the recursive one is erased by the ids that
	 * follow the production that introduced it.
	 */
	chain: number[];
}

/**
 * The left-recursive non-terminals (V →+ V α for some α), in grammar order:
 * immediate (V → V α), through other non-terminals, and through nullable
 * prefixes (V → N V with N →* ε). Each comes with a shortest chain of
 * productions, preferring the immediate one.
 */
export function leftRecursion(g: Grammar): LeftRecursion[] {
	const index = indexOf(g);
	const { isNonterminal } = index;
	const via = erasers(g, index);
	interface Step {
		to: string;
		production: number;
		/** Nullable symbols in front of `to` in that production. */
		erased: string[];
	}
	// A → X1 … Xk B β with X1 … Xk nullable: A can start with B.
	const steps = new Map<string, Step[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of g.productions) {
		for (let k = 0; k < p.rhs.length; k++) {
			const x = p.rhs[k];
			if (!isNonterminal.has(x)) break;
			steps.get(p.lhs)!.push({ to: x, production: p.id, erased: p.rhs.slice(0, k) });
			if (!via.has(x)) break;
		}
	}
	// A cycle of steps stays inside one strongly connected component.
	const part = componentOf(
		components(g.nonterminals, new Map([...steps].map(([n, list]) => [n, list.map((s) => s.to)])))
	);
	/** Adds the productions that erase `symbol`, in the order of a leftmost derivation. */
	const erase = (symbol: string, out: number[]): void => {
		const todo = [symbol];
		while (todo.length > 0) {
			const id = via.get(todo.pop()!)!;
			out.push(id);
			const rhs = g.productions[id].rhs;
			for (let i = rhs.length - 1; i >= 0; i--) todo.push(rhs[i]);
		}
	};
	/** A shortest path of steps from `v` back to `v`. */
	const cycle = (v: string): Step[] | null => {
		const own = steps.get(v)!.filter((s) => s.to === v);
		if (own.length > 0) return [own.find((s) => s.erased.length === 0) ?? own[0]];
		const reached = new Map<string, { step: Step; from: string }>();
		const queue = [v];
		for (let next = 0; next < queue.length; next++) {
			const a = queue[next];
			for (const step of steps.get(a)!) {
				if (step.to === v) {
					const path = [step];
					for (let at = a; at !== v; at = reached.get(at)!.from)
						path.unshift(reached.get(at)!.step);
					return path;
				}
				if (reached.has(step.to) || part.get(step.to) !== part.get(v)) continue;
				reached.set(step.to, { step, from: a });
				queue.push(step.to);
			}
		}
		return null;
	};
	const out: LeftRecursion[] = [];
	for (const v of g.nonterminals) {
		const path = cycle(v);
		if (!path) continue;
		const chain: number[] = [];
		for (const step of path) {
			chain.push(step.production);
			for (const x of step.erased) erase(x, chain);
		}
		out.push({
			nonterminal: v,
			immediate: index.byLhs.get(v)!.some((p) => p.rhs[0] === v),
			chain
		});
	}
	return out;
}

/**
 * The groups of non-terminals that derive each other and nothing else:
 * A →+ B and B →+ A, or A →+ A for a group of one. A → A | a and
 * A → B ; B → A are the plain cases; nullable symbols may stand around the
 * non-terminal (A → N A with N →* ε). A sentence that uses such a
 * non-terminal has infinitely many derivations, so parseTrees leaves out the
 * trees that go round. Groups and their members are in grammar order.
 */
export function cycles(g: Grammar): string[][] {
	const index = indexOf(g);
	const via = erasers(g, index);
	// A → α B β with α and β nullable: A can become B alone.
	const edges = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
	for (const p of g.productions) {
		const lasting = p.rhs.filter((x) => !via.has(x)).length;
		if (lasting > 1) continue;
		for (const x of p.rhs)
			if (index.isNonterminal.has(x) && (lasting === 0 || !via.has(x))) edges.get(p.lhs)!.add(x);
	}
	const place = new Map(g.nonterminals.map((n, i) => [n, i]));
	return components(g.nonterminals, edges)
		.filter((members) => members.length > 1 || edges.get(members[0])!.has(members[0]))
		.map((members) => members.sort((a, b) => place.get(a)! - place.get(b)!))
		.sort((a, b) => place.get(a[0])! - place.get(b[0])!);
}

export interface ChomskyReport {
	/** 3 when every production has the regular form, otherwise 2 (every CFG production is V → α). */
	type: 2 | 3;
	/** Per production: it has the form V → w or V → w U with w ∈ T* and U ∈ N. */
	regular: boolean[];
}

/**
 * The grammar's type by the form of its productions (Introduction to Parsing,
 * slide 23): type 3 when each is V → w | wU with w a string of terminals, so
 * a non-terminal may only be the last symbol of a right-hand side.
 */
export function chomskyType(g: Grammar): ChomskyReport {
	const isNonterminal = new Set(g.nonterminals);
	const regular = g.productions.map((p) =>
		p.rhs.every((x, i) => i === p.rhs.length - 1 || !isNonterminal.has(x))
	);
	return { type: regular.every(Boolean) ? 3 : 2, regular };
}

/**
 * The lengths (in tokens) of the shortest and longest sentences of L(G):
 * `max` is Infinity when L(G) is infinite; the result is null when L(G) is
 * empty.
 */
export function sentenceLengths(g: Grammar): { min: number; max: number } | null {
	const all = indexOf(g);
	const { isNonterminal } = all;
	// Shortest terminal string of each non-terminal (absent: it derives none).
	const min = new Map<string, number>();
	settle(g.productions, all.users, (p, changed) => {
		let total = 0;
		for (const x of p.rhs) total += isNonterminal.has(x) ? (min.get(x) ?? Infinity) : 1;
		if (total >= (min.get(p.lhs) ?? Infinity)) return;
		min.set(p.lhs, total);
		changed(p.lhs);
	});
	if (!min.has(g.start)) return null;

	// Only productions that can take part in deriving a sentence matter from here on.
	const useful = g.productions.filter((p) =>
		p.rhs.every((x) => !isNonterminal.has(x) || min.has(x))
	);
	const reached = reach(g.start, indexOf(g, useful));
	const liveProductions = useful.filter((p) => reached.has(p.lhs));
	const live = indexOf(g, liveProductions);

	// Non-terminals that derive some non-empty terminal string.
	const nonEmpty = new Set<string>();
	const lasting = (x: string): boolean => !isNonterminal.has(x) || nonEmpty.has(x);
	settle(liveProductions, live.users, (p, changed) => {
		if (nonEmpty.has(p.lhs) || !p.rhs.some(lasting)) return;
		nonEmpty.add(p.lhs);
		changed(p.lhs);
	});
	// A → α B β is a growing edge when α β derives a non-empty string. L(G) is
	// infinite exactly when a growing edge lies on a cycle, that is, inside one
	// strongly connected component.
	const edges = new Map<string, Set<string>>([...reached].map((n) => [n, new Set<string>()]));
	const growing: [string, string][] = [];
	for (const p of liveProductions) {
		const lastingSymbols = p.rhs.filter(lasting).length;
		for (const b of p.rhs) {
			if (!isNonterminal.has(b)) continue;
			edges.get(p.lhs)!.add(b);
			if (lastingSymbols > (nonEmpty.has(b) ? 1 : 0)) growing.push([p.lhs, b]);
		}
	}
	const parts = components(reached, edges);
	const part = componentOf(parts);
	const shortest = min.get(g.start)!;
	if (growing.some(([a, b]) => part.get(a) === part.get(b)))
		return { min: shortest, max: Infinity };

	// Finite language: the non-terminals of one component derive the same
	// strings, and a production that stays inside the component adds none.
	// The components a production leads to come earlier in the list.
	const max = new Map<string, number>();
	parts.forEach((members, k) => {
		let longest = 0;
		for (const a of members) {
			for (const p of live.byLhs.get(a)!) {
				let total = 0;
				for (const x of p.rhs)
					total += !isNonterminal.has(x) ? 1 : part.get(x) === k ? 0 : max.get(x)!;
				longest = Math.max(longest, total);
			}
		}
		for (const a of members) max.set(a, longest);
	});
	return { min: shortest, max: max.get(g.start)! };
}

/** L(G) = { }: the start symbol derives no string of terminals. */
export function isEmptyLanguage(g: Grammar): boolean {
	return !productiveSet(g).has(g.start);
}

/** L(G) has finitely many sentences (the empty language included). */
export function isFiniteLanguage(g: Grammar): boolean {
	const range = sentenceLengths(g);
	return range === null || range.max !== Infinity;
}
