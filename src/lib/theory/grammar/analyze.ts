/**
 * Properties of a context-free grammar: nullable non-terminals, FIRST and
 * FOLLOW sets, unreachable and unproductive non-terminals, left recursion,
 * the Chomsky type by production form, and the range of sentence lengths.
 *
 * Sets and lists come out in grammar order: non-terminals in the order of N,
 * terminals in the order of T, then `$`, then `ε`.
 */
import { END_MARKER, EPSILON, type Grammar } from './types';

/**
 * For each nullable non-terminal, the id of a production whose right-hand
 * side was already known to be nullable, so following these productions
 * always ends.
 */
function erasers(g: Grammar): Map<string, number> {
	const via = new Map<string, number>();
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			if (via.has(p.lhs) || !p.rhs.every((x) => via.has(x))) continue;
			via.set(p.lhs, p.id);
			changed = true;
		}
	}
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
 */
export function firstSets(g: Grammar): Map<string, Set<string>> {
	const first = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			const target = first.get(p.lhs)!;
			const before = target.size;
			firstOf(p.rhs, first, target);
			if (target.size !== before) changed = true;
		}
	}
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
 */
export function followSets(g: Grammar): Map<string, Set<string>> {
	const first = firstSets(g);
	const follow = new Map(g.nonterminals.map((n) => [n, new Set<string>()]));
	follow.get(g.start)?.add(END_MARKER);
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			p.rhs.forEach((x, i) => {
				const target = follow.get(x);
				if (!target) return;
				const before = target.size;
				const rest = firstOf(p.rhs.slice(i + 1), first, new Set());
				for (const t of rest) if (t !== EPSILON) target.add(t);
				if (rest.has(EPSILON)) for (const t of follow.get(p.lhs)!) target.add(t);
				if (target.size !== before) changed = true;
			});
		}
	}
	const order = [...g.terminals, END_MARKER];
	return new Map([...follow].map(([n, set]) => [n, sorted(set, order)]));
}

/** Non-terminals that no derivation from the start symbol reaches, in grammar order. */
export function unreachable(g: Grammar): string[] {
	const isNonterminal = new Set(g.nonterminals);
	const seen = new Set([g.start]);
	const stack = [g.start];
	while (stack.length > 0) {
		const a = stack.pop()!;
		for (const p of g.productions) {
			if (p.lhs !== a) continue;
			for (const x of p.rhs) {
				if (!isNonterminal.has(x) || seen.has(x)) continue;
				seen.add(x);
				stack.push(x);
			}
		}
	}
	return g.nonterminals.filter((n) => !seen.has(n));
}

function productiveSet(g: Grammar): Set<string> {
	const isNonterminal = new Set(g.nonterminals);
	const productive = new Set<string>();
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			if (productive.has(p.lhs)) continue;
			if (!p.rhs.every((x) => !isNonterminal.has(x) || productive.has(x))) continue;
			productive.add(p.lhs);
			changed = true;
		}
	}
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
	const isNonterminal = new Set(g.nonterminals);
	const via = erasers(g);
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
	const erase = (symbol: string, out: number[]): void => {
		const id = via.get(symbol)!;
		out.push(id);
		for (const x of g.productions[id].rhs) erase(x, out);
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
				if (reached.has(step.to)) continue;
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
			immediate: g.productions.some((p) => p.lhs === v && p.rhs[0] === v),
			chain
		});
	}
	return out;
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
	const isNonterminal = new Set(g.nonterminals);
	// Shortest terminal string of each non-terminal (absent: it derives none).
	const min = new Map<string, number>();
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			let total = 0;
			for (const x of p.rhs) total += isNonterminal.has(x) ? (min.get(x) ?? Infinity) : 1;
			if (total < (min.get(p.lhs) ?? Infinity)) {
				min.set(p.lhs, total);
				changed = true;
			}
		}
	}
	if (!min.has(g.start)) return null;

	// Only productions that can take part in deriving a sentence matter from here on.
	const useful = g.productions.filter((p) =>
		p.rhs.every((x) => !isNonterminal.has(x) || min.has(x))
	);
	const reached = new Set([g.start]);
	const stack = [g.start];
	while (stack.length > 0) {
		const a = stack.pop()!;
		for (const p of useful) {
			if (p.lhs !== a) continue;
			for (const x of p.rhs) {
				if (!isNonterminal.has(x) || reached.has(x)) continue;
				reached.add(x);
				stack.push(x);
			}
		}
	}
	const live = useful.filter((p) => reached.has(p.lhs));

	// Non-terminals that derive some non-empty terminal string.
	const nonEmpty = new Set<string>();
	for (let changed = true; changed;) {
		changed = false;
		for (const p of live) {
			if (nonEmpty.has(p.lhs)) continue;
			if (!p.rhs.some((x) => !isNonterminal.has(x) || nonEmpty.has(x))) continue;
			nonEmpty.add(p.lhs);
			changed = true;
		}
	}
	// A → α B β is a growing edge when α β derives a non-empty string. L(G) is
	// infinite exactly when a growing edge lies on a cycle.
	const edges = new Map<string, Set<string>>([...reached].map((n) => [n, new Set<string>()]));
	const growing: [string, string][] = [];
	for (const p of live) {
		p.rhs.forEach((b, i) => {
			if (!isNonterminal.has(b)) return;
			edges.get(p.lhs)!.add(b);
			if (p.rhs.some((x, j) => j !== i && (!isNonterminal.has(x) || nonEmpty.has(x))))
				growing.push([p.lhs, b]);
		});
	}
	const reaches = (from: string, to: string): boolean => {
		const seen = new Set([from]);
		const todo = [from];
		while (todo.length > 0) {
			const a = todo.pop()!;
			if (a === to) return true;
			for (const b of edges.get(a)!) {
				if (seen.has(b)) continue;
				seen.add(b);
				todo.push(b);
			}
		}
		return false;
	};
	const shortest = min.get(g.start)!;
	if (growing.some(([a, b]) => reaches(b, a))) return { min: shortest, max: Infinity };

	// Finite language: the longest strings settle within |N| rounds.
	const max = new Map<string, number>();
	for (let round = 0, changed = true; changed && round <= reached.size + 1; round++) {
		changed = false;
		for (const p of live) {
			let total = 0;
			for (const x of p.rhs) total += isNonterminal.has(x) ? (max.get(x) ?? -Infinity) : 1;
			if (total > (max.get(p.lhs) ?? -Infinity)) {
				max.set(p.lhs, total);
				changed = true;
			}
		}
	}
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
