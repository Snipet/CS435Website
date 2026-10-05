/**
 * Earley parsing for any context-free grammar: ε-productions, left and right
 * recursion, ambiguity and cycles are all fine.
 *
 * An item (A → α • β, i) in set j says that α derives tokens i … j − 1 of an
 * A that started at i. Set j is closed under prediction (the dot is before a
 * non-terminal: add its productions at j) and completion (the dot is at the
 * end: advance the items of set i that waited for A); reading token j moves
 * the dot over a terminal into set j + 1. A nullable non-terminal is stepped
 * over when it is predicted (Aycock and Horspool), which is what makes
 * ε-productions safe.
 *
 * The same sets drive three things: membership (`recognizes`), every parse
 * tree (`parseTrees`), and listing the language (`enumerateLanguage`,
 * `compareGrammars`), where the sets follow the prefixes of a walk over all
 * token strings.
 */
import { sentenceLengths } from './analyze';
import type { Grammar, ParseNode } from './types';

/** Token code that matches every terminal. */
const ANY = -2;
/** Token code of a symbol the grammar cannot read. */
const UNKNOWN = -1;

/** A grammar with its symbols numbered: non-terminals 0 … n − 1, then terminals in grammar order. */
interface Compiled {
	n: number;
	names: string[];
	codes: Map<string, number>;
	lhs: number[];
	rhs: number[][];
	byLhs: number[][];
	nullable: boolean[];
	start: number;
	/** Number of (production, dot) pairs; item keys are origin × stride + production × width + dot. */
	width: number;
	stride: number;
}

function compile(g: Grammar): Compiled {
	const names = [...g.nonterminals];
	const codes = new Map(names.map((name, i) => [name, i]));
	const n = names.length;
	const code = (symbol: string): number => {
		let c = codes.get(symbol);
		if (c === undefined) {
			c = names.length;
			codes.set(symbol, c);
			names.push(symbol);
		}
		return c;
	};
	g.terminals.forEach(code);
	const lhs = g.productions.map((p) => code(p.lhs));
	const rhs = g.productions.map((p) => p.rhs.map(code));
	const byLhs: number[][] = Array.from({ length: n }, () => []);
	lhs.forEach((a, p) => byLhs[a]?.push(p));
	const nullable = Array.from({ length: n }, () => false);
	for (let changed = true; changed;) {
		changed = false;
		rhs.forEach((symbols, p) => {
			if (nullable[lhs[p]] || !symbols.every((x) => x < n && nullable[x])) return;
			nullable[lhs[p]] = true;
			changed = true;
		});
	}
	const width = Math.max(1, ...rhs.map((symbols) => symbols.length + 1));
	return {
		n,
		names,
		codes,
		lhs,
		rhs,
		byLhs,
		nullable,
		start: codes.get(g.start) ?? 0,
		width,
		stride: Math.max(1, rhs.length) * width
	};
}

/** The code of an input token: a terminal's code, or UNKNOWN (also for the name of a non-terminal). */
const tokenCode = (c: Compiled, token: string): number => {
	const code = c.codes.get(token);
	return code === undefined || code < c.n ? UNKNOWN : code;
};

interface ItemSet {
	production: number[];
	dot: number[];
	origin: number[];
	keys: Set<number>;
	/** Items with the dot before a non-terminal, by that non-terminal. */
	waiting: Map<number, number[]>;
	/** Items with the dot before a terminal, by that terminal. */
	reading: Map<number, number[]>;
	/** Holds a finished item of the start symbol that began at 0. */
	accepted: boolean;
}

const emptySet = (): ItemSet => ({
	production: [],
	dot: [],
	origin: [],
	keys: new Set(),
	waiting: new Map(),
	reading: new Map(),
	accepted: false
});

/** Earley sets for a token string that can grow and shrink at its end. */
class Chart {
	readonly sets: ItemSet[] = [];
	/** With `record`: ends[a × n + X] lists, ascending, each b with X →* tokens a … b − 1. */
	readonly ends = new Map<number, number[]>();

	constructor(
		private readonly c: Compiled,
		private readonly record: boolean
	) {
		const set = emptySet();
		this.sets.push(set);
		for (const p of c.byLhs[c.start] ?? []) this.add(set, p, 0, 0);
		this.close(set);
	}

	private add(set: ItemSet, production: number, dot: number, origin: number): void {
		const key = origin * this.c.stride + production * this.c.width + dot;
		if (set.keys.has(key)) return;
		set.keys.add(key);
		set.production.push(production);
		set.dot.push(dot);
		set.origin.push(origin);
	}

	/** Prediction and completion for the newest set. */
	private close(set: ItemSet): void {
		const c = this.c;
		const j = this.sets.length - 1;
		for (let item = 0; item < set.production.length; item++) {
			const p = set.production[item];
			const dot = set.dot[item];
			const origin = set.origin[item];
			const rhs = c.rhs[p];
			if (dot < rhs.length) {
				const x = rhs[dot];
				const table = x < c.n ? set.waiting : set.reading;
				let list = table.get(x);
				if (!list) {
					list = [];
					table.set(x, list);
					if (x < c.n) for (const q of c.byLhs[x]) this.add(set, q, 0, j);
				}
				list.push(item);
				if (x < c.n && c.nullable[x]) this.add(set, p, dot + 1, origin);
				continue;
			}
			const a = c.lhs[p];
			if (a === c.start && origin === 0) set.accepted = true;
			if (this.record) {
				const key = origin * c.n + a;
				const list = this.ends.get(key);
				if (!list) this.ends.set(key, [j]);
				else if (list[list.length - 1] !== j) list.push(j);
			}
			// An A that started here derived ε; its parents were stepped over A when they predicted it.
			if (origin === j) continue;
			const from = this.sets[origin];
			for (const parent of from.waiting.get(a) ?? [])
				this.add(set, from.production[parent], from.dot[parent] + 1, from.origin[parent]);
		}
	}

	private get last(): ItemSet {
		return this.sets[this.sets.length - 1];
	}

	/** Reads one more token. Returns false, changing nothing, when no item can read it. */
	advance(token: number): boolean {
		const from = this.last;
		const set = emptySet();
		const lists = token === ANY ? from.reading.values() : [from.reading.get(token) ?? []];
		for (const list of lists)
			for (const item of list)
				this.add(set, from.production[item], from.dot[item] + 1, from.origin[item]);
		if (set.production.length === 0) return false;
		this.sets.push(set);
		this.close(set);
		return true;
	}

	/** Takes back the last token read. */
	retreat(): void {
		this.sets.pop();
	}

	/** The tokens read so far are a sentence. */
	get accepted(): boolean {
		return this.last.accepted;
	}

	/** The terminals that can come next, in grammar order. */
	expected(): number[] {
		return [...this.last.reading.keys()].sort((a, b) => a - b);
	}
}

/** The chart of a whole token string, or null when the string is not in the language. */
function chartOf(c: Compiled, codes: readonly number[], record: boolean): Chart | null {
	const chart = new Chart(c, record);
	for (const code of codes) if (!chart.advance(code)) return null;
	return chart.accepted ? chart : null;
}

/** Membership: `tokens` is a sentence of L(G). */
export function recognizes(g: Grammar, tokens: readonly string[]): boolean {
	const c = compile(g);
	return (
		chartOf(
			c,
			tokens.map((t) => tokenCode(c, t)),
			false
		) !== null
	);
}

// ───────────────────────────── parse trees ─────────────────────────────

/** A lazily evaluated list that can be walked several times. */
class Replay<T> implements Iterable<T> {
	private readonly items: T[] = [];
	private done = false;

	constructor(private readonly source: Iterator<T>) {}

	private pull(): boolean {
		if (this.done) return false;
		const next = this.source.next();
		if (next.done) {
			this.done = true;
			return false;
		}
		this.items.push(next.value);
		return true;
	}

	get empty(): boolean {
		return this.items.length === 0 && !this.pull();
	}

	*[Symbol.iterator](): Generator<T> {
		for (let i = 0; i < this.items.length || this.pull(); i++) yield this.items[i];
	}
}

/** `value` is in the ascending list `list`. */
function includesSorted(list: readonly number[], value: number): boolean {
	let low = 0;
	let high = list.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (list[middle] === value) return true;
		if (list[middle] < value) low = middle + 1;
		else high = middle - 1;
	}
	return false;
}

/** The (non-terminal, start, end) triples on the way from the root to a node. */
type Path = { key: number; up: Path } | null;

const copyTree = (node: ParseNode): ParseNode => ({
	...node,
	children: node.children.map(copyTree)
});

/**
 * Every parse tree of `tokens`, up to `opts.limit` (default 50); `truncated`
 * says there are more. Nodes carry the production applied and the token range
 * [start, end) they cover.
 *
 * Order: at each node, earlier productions first; within a production,
 * shorter spans for the symbols on the left first (so `int + int + int`
 * under E → E + E | int lists int + (int + int) before (int + int) + int).
 *
 * A grammar with a cycle (A → A | a, or A → B, B → A) has infinitely many
 * derivations for one string. Trees in which a node repeats the non-terminal
 * and token range of one of its ancestors are left out, which keeps the list
 * finite and still includes every tree without such a loop.
 *
 * Meant for token strings of up to a few hundred tokens. Trees are built
 * recursively, so a tree many hundreds of levels deep (a chain of about a
 * thousand operators) throws an Error saying the input is too long.
 */
export function parseTrees(
	g: Grammar,
	tokens: readonly string[],
	opts?: { limit?: number }
): { trees: ParseNode[]; truncated: boolean } {
	const limit = Math.max(0, Math.floor(opts?.limit ?? 50));
	const c = compile(g);
	const input = tokens.map((t) => tokenCode(c, t));
	const chart = chartOf(c, input, true);
	if (!chart) return { trees: [], truncated: false };
	const n = input.length;
	const size = n + 1;
	const endsOf = (x: number, a: number): readonly number[] => chart.ends.get(a * c.n + x) ?? [];

	/** rhs[dot …] of production p derives tokens a … b − 1. */
	const fits = new Map<number, boolean>();
	const canSpan = (p: number, dot: number, a: number, b: number): boolean => {
		const rhs = c.rhs[p];
		if (dot === rhs.length) return a === b;
		const x = rhs[dot];
		if (x >= c.n) return a < b && input[a] === x && canSpan(p, dot + 1, a + 1, b);
		const ends = endsOf(x, a);
		if (dot === rhs.length - 1) return includesSorted(ends, b);
		const key = ((p * c.width + dot) * size + a) * size + b;
		let result = fits.get(key);
		if (result === undefined) {
			result = false;
			for (let i = 0; i < ends.length && ends[i] <= b && !result; i++)
				result = canSpan(p, dot + 1, ends[i], b);
			fits.set(key, result);
		}
		return result;
	};

	/** Trees of non-terminal x over tokens a … b − 1 that repeat no triple of `path`. */
	function* treesOf(x: number, a: number, b: number, path: Path): Generator<ParseNode> {
		const key = (x * size + a) * size + b;
		for (let at = path; at; at = at.up) if (at.key === key) return;
		const here: Path = { key, up: path };
		for (const p of c.byLhs[x]) {
			if (!canSpan(p, 0, a, b)) continue;
			for (const children of childrenOf(p, 0, a, b, here))
				yield { symbol: c.names[x], terminal: false, children, production: p, start: a, end: b };
		}
	}

	/** Child lists for rhs[dot …] of production p over tokens a … b − 1. */
	function* childrenOf(
		p: number,
		dot: number,
		a: number,
		b: number,
		path: Path
	): Generator<ParseNode[]> {
		const rhs = c.rhs[p];
		if (dot === rhs.length) {
			yield [];
			return;
		}
		const x = rhs[dot];
		if (x >= c.n) {
			const leaf: ParseNode = {
				symbol: c.names[x],
				terminal: true,
				children: [],
				start: a,
				end: a + 1
			};
			for (const rest of childrenOf(p, dot + 1, a + 1, b, path)) yield [leaf, ...rest];
			return;
		}
		for (const m of endsOf(x, a)) {
			if (m > b) break;
			if (!canSpan(p, dot + 1, m, b)) continue;
			// The symbols to the right do not depend on the tree chosen for x: list them once.
			const rests = new Replay(childrenOf(p, dot + 1, m, b, path));
			if (rests.empty) continue;
			for (const tree of treesOf(x, a, m, path)) for (const rest of rests) yield [tree, ...rest];
		}
	}

	const trees: ParseNode[] = [];
	let truncated = false;
	try {
		for (const tree of treesOf(c.start, 0, n, null)) {
			if (trees.length >= limit) {
				truncated = true;
				break;
			}
			// Subtrees are shared while enumerating; each tree handed out is its own copy.
			trees.push(copyTree(tree));
		}
	} catch (error) {
		// Trees are built recursively: one that is thousands of levels deep runs out of stack.
		if (error instanceof RangeError)
			throw new Error('The input is too long: its parse tree is too deep to build.', {
				cause: error
			});
		throw error;
	}
	return { trees, truncated };
}

// ───────────────────────────── languages ─────────────────────────────

/**
 * The sentences of exactly `length` tokens, as terminal codes, in the order
 * of the grammar's terminals. A prefix is extended only when some sentence of
 * that length starts with it, so the work is in proportion to the sentences
 * produced.
 */
function* sentencesOfLength(c: Compiled, length: number): Generator<number[]> {
	const chart = new Chart(c, false);
	const prefix: number[] = [];
	/** Some sentence continues the tokens read so far with exactly `more` tokens. */
	const reaches = (more: number): boolean => {
		let read = 0;
		while (read < more && chart.advance(ANY)) read++;
		const ok = read === more && chart.accepted;
		while (read-- > 0) chart.retreat();
		return ok;
	};
	function* walk(): Generator<number[]> {
		if (prefix.length === length) {
			yield [...prefix];
			return;
		}
		for (const token of chart.expected()) {
			if (!chart.advance(token)) continue;
			if (reaches(length - prefix.length - 1)) {
				prefix.push(token);
				yield* walk();
				prefix.pop();
			}
			chart.retreat();
		}
	}
	if (reaches(length)) yield* walk();
}

/**
 * The sentences of L(G) with at most `maxLength` tokens, shortest first and,
 * within one length, in the order of the grammar's terminals; at most `limit`
 * of them. The empty sentence is `[]`.
 *
 * `truncated` is true when L(G) has sentences that are not listed, over the
 * limit or longer than `maxLength` (as for `enumerate` on automata).
 * `limited` is true only for the first reason: the limit cut the list short.
 */
export function enumerateLanguage(
	g: Grammar,
	opts: { maxLength: number; limit: number }
): { strings: string[][]; truncated: boolean; limited: boolean } {
	const range = sentenceLengths(g);
	if (!range) return { strings: [], truncated: false, limited: false };
	const maxLength = Math.floor(opts.maxLength);
	const limit = Math.max(0, Math.floor(opts.limit));
	const c = compile(g);
	const strings: string[][] = [];
	let more = false;
	const last = Math.min(maxLength, range.max);
	for (let length = range.min; length <= last && !more; length++) {
		for (const sentence of sentencesOfLength(c, length)) {
			if (strings.length >= limit) {
				more = true;
				break;
			}
			strings.push(sentence.map((code) => c.names[code]));
		}
	}
	return { strings, truncated: more || range.max > maxLength, limited: more };
}

/**
 * A bounded comparison of two languages: the sentences of at most
 * `maxLength` tokens that one grammar generates and the other does not, each
 * list in its own grammar's enumeration order. Both lists empty means the
 * grammars agree on every sentence up to `checkedUpTo` tokens.
 *
 * `checkedUpTo` is `maxLength` unless a language has more than
 * `opts.maxSentences` sentences (default 20000) within the bound; the
 * comparison then stops at the last length it could finish.
 */
export function compareGrammars(
	a: Grammar,
	b: Grammar,
	opts: { maxLength: number; maxSentences?: number }
): { onlyA: string[][]; onlyB: string[][]; checkedUpTo: number } {
	const bound = Math.max(-1, Math.floor(opts.maxLength));
	const budget = opts.maxSentences ?? 20000;
	const sides = [a, b].map((g) => ({ c: compile(g), range: sentenceLengths(g), count: 0 }));
	const [onlyA, onlyB]: string[][][] = [[], []];
	// Beyond the longest sentence of two finite languages there is nothing left to compare.
	const longest = Math.max(...sides.map((side) => side.range?.max ?? -1));
	for (let length = 0; length <= Math.min(bound, longest); length++) {
		const levels = sides.map((side) => {
			const level = new Map<string, string[]>();
			if (!side.range || length < side.range.min || length > side.range.max) return level;
			for (const sentence of sentencesOfLength(side.c, length)) {
				if (++side.count > budget) break;
				const names = sentence.map((code) => side.c.names[code]);
				level.set(JSON.stringify(names), names);
			}
			return level;
		});
		if (sides.some((side) => side.count > budget)) return { onlyA, onlyB, checkedUpTo: length - 1 };
		for (const [key, names] of levels[0]) if (!levels[1].has(key)) onlyA.push(names);
		for (const [key, names] of levels[1]) if (!levels[0].has(key)) onlyB.push(names);
	}
	return { onlyA, onlyB, checkedUpTo: bound };
}
