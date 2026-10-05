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
 *
 * Nothing here recurses on the input: sets, trees and walks keep stacks of
 * their own, so a long token string or a deep tree cannot run out of call
 * stack.
 */
import { cycles, nullable as nullableOf, sentenceLengths } from './analyze';
import type { Grammar, ParseNode } from './types';

/** Token code that matches every terminal. */
const ANY = -2;
/** Token code of a symbol the grammar cannot read. */
const UNKNOWN = -1;

/**
 * Default work limit of enumerateLanguage and compareGrammars, in Earley
 * items: about a second of work.
 */
export const DEFAULT_MAX_STEPS = 10_000_000;

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
	const nulls = nullableOf(g);
	let width = 1;
	for (const symbols of rhs) width = Math.max(width, symbols.length + 1);
	return {
		n,
		names,
		codes,
		lhs,
		rhs,
		byLhs,
		nullable: g.nonterminals.map((name) => nulls.has(name)),
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

/** Counts the Earley items made during one call against a limit. */
class Meter {
	items = 0;
	/** Some work was given up because the limit was passed. */
	stopped = false;

	constructor(private readonly limit = Infinity) {}

	/** The limit is passed: the caller gives up what it was doing. */
	giveUp(): boolean {
		if (this.items > this.limit) this.stopped = true;
		return this.stopped;
	}
}

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
		private readonly record: boolean,
		private readonly meter: Meter = new Meter()
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
		this.meter.items++;
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

/** The non-terminals from the root down to a node, each with the tokens it covers. */
type Path = { x: number; a: number; b: number; up: Path } | null;

/**
 * What is left to derive, first to last: the non-terminal `x` over tokens
 * a … b − 1, or (x = −1) the right-hand side of production `p` from `dot` on
 * over those tokens; then `next`. Goals are never changed, so the search can
 * return to one.
 */
interface Goal {
	x: number;
	p: number;
	dot: number;
	a: number;
	b: number;
	/** The ancestors of the nodes this goal makes. */
	path: Path;
	next: Goal | null;
}

/** A goal that can be met in several ways, and how far the search has got with them. */
interface Choice {
	goal: Goal;
	/**
	 * The next option to try: an index into the productions of `goal.x`, or
	 * into the places where the non-terminal at `goal.dot` can end.
	 */
	option: number;
	/** Length of the list of nodes when the choice came up. */
	made: number;
}

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
 * The trees are found by a search that picks, top-down and left to right, a
 * production for each node and an end for each non-terminal child, and goes
 * back to the newest pick that has another option. A pick is made only when
 * a tree can be completed with it, so the time per tree grows with the size
 * of the tree and not with the number of picks that lead nowhere. It never
 * throws on a long input; the time to set up grows with about the cube of
 * the number of tokens for an ambiguous grammar.
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

	/** Answers of canSpan for a non-terminal that is not the last symbol. */
	const fits = new Map<number, boolean>();
	const fitKey = (p: number, dot: number, a: number, b: number): number =>
		((p * c.width + dot) * size + a) * size + b;
	/** Where `direct` stopped without an answer. */
	let stopDot = 0;
	let stopAt = 0;
	/**
	 * canSpan when it takes no search: terminals are matched, and the question
	 * ends at the end of the right-hand side, at its last symbol, or at a
	 * non-terminal that was asked about before. Otherwise undefined, with the
	 * non-terminal's place in stopDot and stopAt.
	 */
	const direct = (p: number, dot: number, a: number, b: number): boolean | undefined => {
		const rhs = c.rhs[p];
		for (; dot < rhs.length && rhs[dot] >= c.n; dot++, a++)
			if (a >= b || input[a] !== rhs[dot]) return false;
		if (dot === rhs.length) return a === b;
		if (dot === rhs.length - 1) return includesSorted(endsOf(rhs[dot], a), b);
		stopDot = dot;
		stopAt = a;
		return fits.get(fitKey(p, dot, a, b));
	};
	/** rhs[dot …] of production p derives tokens a … b − 1. */
	const canSpan = (p: number, dot: number, a: number, b: number): boolean => {
		let answer = direct(p, dot, a, b);
		if (answer !== undefined) return answer;
		const rhs = c.rhs[p];
		// Open questions (dot, a), innermost last. Each is at a non-terminal and
		// holds when the rest of the right-hand side fits after one of its ends.
		const dots = [stopDot];
		const starts = [stopAt];
		const tried = [0];
		while (dots.length > 0) {
			const top = dots.length - 1;
			if (answer !== true) {
				const ends = endsOf(rhs[dots[top]], starts[top]);
				const i = tried[top];
				if (i < ends.length && ends[i] <= b) {
					tried[top] = i + 1;
					answer = direct(p, dots[top] + 1, ends[i], b);
					if (answer === undefined) {
						dots.push(stopDot);
						starts.push(stopAt);
						tried.push(0);
					}
					continue;
				}
				answer = false;
			}
			fits.set(fitKey(p, dots[top], starts[top], b), answer);
			dots.pop();
			starts.pop();
			tried.pop();
		}
		return answer === true;
	};

	// A tree may not hold a node that repeats an ancestor. Only a non-terminal
	// that can derive itself can do that (a member of a group of cycles(g)), and
	// only below ancestors of its own group over the same tokens. There, a
	// child that canSpan allows may have no tree left; `alive` says whether it
	// has one, so the search below never takes a pick that leads nowhere.

	/** The group of cycles(g) each non-terminal is in, or −1. */
	const group: number[] = new Array(c.n).fill(-1);
	const members = cycles(g).map((names) => names.map((name) => c.codes.get(name)!));
	members.forEach((codes, k) => codes.forEach((code) => (group[code] = k)));

	/**
	 * rhs[k …] of production q can derive tokens s … b − 1, for a node over
	 * tokens a … b − 1 whose symbols before k derived a … s − 1, in such a way
	 * that every child over all of the node's tokens is `ok`.
	 */
	const viable = (
		q: number,
		k: number,
		s: number,
		a: number,
		b: number,
		ok: (child: number) => boolean
	): boolean => {
		const rhs = c.rhs[q];
		// A token is read already: no child can cover all of the node's tokens.
		if (s > a) return canSpan(q, k, s, b);
		if (a === b) {
			// No tokens: every child covers what the node covers.
			if (!canSpan(q, k, a, a)) return false;
			for (; k < rhs.length; k++) if (!ok(rhs[k])) return false;
			return true;
		}
		for (; k < rhs.length; k++) {
			const y = rhs[k];
			if (y >= c.n) return input[a] === y && canSpan(q, k + 1, a + 1, b);
			let empty = false;
			for (const m of endsOf(y, a)) {
				if (m > b) break;
				if (m === a) empty = true;
				else if (m < b ? canSpan(q, k + 1, m, b) : canSpan(q, k + 1, b, b) && ok(y)) return true;
			}
			// Otherwise y derives no tokens here, and a later symbol takes them.
			if (!empty) return false;
		}
		return false;
	};

	/** For a group, a token range and ancestors ruled out: the members that still have a tree. */
	const aliveSets = new Map<string, Set<number>>();
	const aliveSet = (gr: number, a: number, b: number, bans: readonly number[]): Set<number> => {
		const key = `${gr} ${a} ${b} ${bans.join(' ')}`;
		let set = aliveSets.get(key);
		if (!set) {
			// The least set closed under the productions: a member is in when one
			// of its productions works with the members found so far.
			const found = new Set<number>();
			const ok = (child: number): boolean => group[child] !== gr || found.has(child);
			const open = members[gr].filter((y) => !bans.includes(y) && includesSorted(endsOf(y, a), b));
			for (let changed = true; changed;) {
				changed = false;
				for (const y of open) {
					if (found.has(y)) continue;
					if (!c.byLhs[y].some((q) => canSpan(q, 0, a, b) && viable(q, 0, a, a, b, ok))) continue;
					found.add(y);
					changed = true;
				}
				// The next pass runs the other way, so a chain of members settles in two passes.
				open.reverse();
			}
			set = found;
			aliveSets.set(key, set);
		}
		return set;
	};

	/**
	 * Non-terminal y, which derives tokens a … b − 1, has a tree for them below
	 * the ancestors `path` in which no node repeats an ancestor.
	 */
	const alive = (y: number, a: number, b: number, path: Path): boolean => {
		const gr = group[y];
		if (gr < 0) return true;
		const bans: number[] = [];
		for (let at = path; at && at.a === a && at.b === b; at = at.up)
			if (group[at.x] === gr) bans.push(at.x);
		// Without such ancestors there is always a tree: one with a repeat can be cut short.
		if (bans.length === 0) return true;
		return aliveSet(
			gr,
			a,
			b,
			bans.sort((p, q) => p - q)
		).has(y);
	};

	/** The nodes picked so far, in preorder: production, start and end of each. */
	const made: number[] = [];
	/** The tree of the nodes picked. */
	const build = (): ParseNode => {
		let k = 0;
		const node = (): ParseNode => {
			const p = made[k];
			const start = made[k + 1];
			const end = made[k + 2];
			k += 3;
			return {
				symbol: c.names[c.lhs[p]],
				terminal: false,
				children: [],
				production: p,
				start,
				end
			};
		};
		const root = node();
		const open = [root];
		while (open.length > 0) {
			const parent = open[open.length - 1];
			const rhs = c.rhs[parent.production!];
			const at = parent.children.length;
			if (at === rhs.length) {
				open.pop();
			} else if (rhs[at] < c.n) {
				const child = node();
				parent.children.push(child);
				open.push(child);
			} else {
				const start = at === 0 ? parent.start! : parent.children[at - 1].end!;
				parent.children.push({
					symbol: c.names[rhs[at]],
					terminal: true,
					children: [],
					start,
					end: start + 1
				});
			}
		}
		return root;
	};

	/**
	 * A node repeats an ancestor. The token ranges only grow on the way up, so
	 * the ancestors with the node's own range come first.
	 */
	const repeats = ({ x, a, b, path }: Goal): boolean => {
		for (let at = path; at && at.a === a && at.b === b; at = at.up) if (at.x === x) return true;
		return false;
	};

	/**
	 * Takes the next option of a choice: the goals that follow from it, or
	 * undefined when none is left. An option is taken only when a tree can be
	 * completed with it.
	 */
	const take = (choice: Choice): Goal | undefined => {
		const { x, p, dot, a, b, path, next } = choice.goal;
		if (x >= 0) {
			const productions = c.byLhs[x];
			const here: Path = { x, a, b, up: path };
			const ok = (child: number): boolean => alive(child, a, b, here);
			for (let k = choice.option; k < productions.length; k++) {
				const q = productions[k];
				if (!canSpan(q, 0, a, b)) continue;
				if (group[x] >= 0 && !viable(q, 0, a, a, b, ok)) continue;
				choice.option = k + 1;
				made.push(q, a, b);
				return { x: -1, p: q, dot: 0, a, b, path: here, next };
			}
			return undefined;
		}
		const child = c.rhs[p][dot];
		const ends = endsOf(child, a);
		// The node these are the children of. While none of its tokens are read,
		// a child may still cover all of them, and has to be alive then.
		const node = path!;
		const open = group[node.x] >= 0 && a === node.a && a < b;
		const ok = (y: number): boolean => alive(y, a, b, node);
		for (let i = choice.option; i < ends.length && ends[i] <= b; i++) {
			const m = ends[i];
			if (!canSpan(p, dot + 1, m, b)) continue;
			if (open && m === a && !viable(p, dot + 1, a, a, b, ok)) continue;
			if (open && m === b && !ok(child)) continue;
			choice.option = i + 1;
			const rest: Goal = { x: -1, p, dot: dot + 1, a: m, b, path, next };
			return { x: child, p: -1, dot: 0, a, b: m, path, next: rest };
		}
		return undefined;
	};

	const trees: ParseNode[] = [];
	let truncated = false;
	const choices: Choice[] = [];
	/** The goal to work on; null when every goal is met (a tree), undefined when one cannot be. */
	let goal: Goal | null | undefined = {
		x: c.start,
		p: -1,
		dot: 0,
		a: 0,
		b: n,
		path: null,
		next: null
	};
	for (;;) {
		while (goal) {
			let choice: Choice;
			if (goal.x >= 0) {
				// `take` keeps the search away from repeats; this is the rule itself.
				if (group[goal.x] >= 0 && repeats(goal)) {
					goal = undefined;
					break;
				}
				choice = { goal, option: 0, made: made.length };
			} else {
				const from: Goal = goal;
				const rhs = c.rhs[from.p];
				let { dot, a } = from;
				for (; dot < rhs.length && rhs[dot] >= c.n; dot++) a++;
				if (dot === rhs.length) {
					goal = from.next;
					continue;
				}
				if (dot === rhs.length - 1) {
					// The last symbol takes all the tokens that are left.
					goal = { x: rhs[dot], p: -1, dot: 0, a, b: from.b, path: from.path, next: from.next };
					continue;
				}
				choice = { goal: { ...from, dot, a }, option: 0, made: made.length };
			}
			choices.push(choice);
			goal = take(choice);
			if (!goal) choices.pop();
		}
		if (goal === null) {
			if (trees.length >= limit) {
				truncated = true;
				break;
			}
			trees.push(build());
		}
		// Back to the newest choice that has another option.
		goal = undefined;
		while (goal === undefined && choices.length > 0) {
			const choice = choices[choices.length - 1];
			made.length = choice.made;
			goal = take(choice);
			if (!goal) choices.pop();
		}
		if (goal === undefined) break;
	}
	return { trees, truncated };
}

// ───────────────────────────── languages ─────────────────────────────

/**
 * The sentences of exactly `length` tokens, as terminal codes, in the order
 * of the grammar's terminals: a walk over token strings that keeps the Earley
 * sets of the prefix read so far. A prefix is extended only when some sentence
 * of that length starts with it (checked by reading on with a token that
 * matches every terminal), so no branch of the walk is taken in vain. The
 * walk ends early when `meter` gives up.
 */
function* sentencesOfLength(c: Compiled, length: number, meter: Meter): Generator<number[]> {
	const chart = new Chart(c, false, meter);
	/** Some sentence continues the tokens read so far with exactly `more` tokens. */
	const reaches = (more: number): boolean => {
		let read = 0;
		while (read < more && !meter.giveUp() && chart.advance(ANY)) read++;
		const ok = read === more && chart.accepted;
		while (read-- > 0) chart.retreat();
		return ok;
	};
	if (!reaches(length)) return;
	if (length === 0) {
		yield [];
		return;
	}
	const prefix: number[] = [];
	// For each token of the prefix and for the place after it: the tokens that can come there, and how many were tried.
	const options = [chart.expected()];
	const tried = [0];
	while (options.length > 0) {
		if (meter.giveUp()) return;
		const depth = options.length - 1;
		if (tried[depth] === options[depth].length) {
			options.pop();
			tried.pop();
			if (depth > 0) {
				prefix.pop();
				chart.retreat();
			}
			continue;
		}
		const token = options[depth][tried[depth]++];
		if (!chart.advance(token)) continue;
		if (!reaches(length - depth - 1)) {
			chart.retreat();
			continue;
		}
		if (depth + 1 === length) {
			yield [...prefix, token];
			chart.retreat();
			continue;
		}
		prefix.push(token);
		options.push(chart.expected());
		tried.push(0);
	}
}

/**
 * The sentences of L(G) with at most `maxLength` tokens, shortest first and,
 * within one length, in the order of the grammar's terminals; at most `limit`
 * of them. The empty sentence is `[]`.
 *
 * `truncated` is true when L(G) has sentences that are not listed, over the
 * limit or longer than `maxLength` (as for `enumerate` on automata).
 * `limited` is true only when the list itself was cut short: by `limit`, or
 * by the work limit `opts.maxSteps` (in Earley items, default
 * DEFAULT_MAX_STEPS), in which case there may be more sentences within
 * `maxLength`.
 *
 * Finding one sentence costs about the cube of its length, so the bounds are
 * meant to be a few dozen tokens; the work limit keeps a call with larger
 * bounds to about a second.
 */
export function enumerateLanguage(
	g: Grammar,
	opts: { maxLength: number; limit: number; maxSteps?: number }
): { strings: string[][]; truncated: boolean; limited: boolean } {
	const range = sentenceLengths(g);
	if (!range) return { strings: [], truncated: false, limited: false };
	const maxLength = Math.floor(opts.maxLength);
	const limit = Math.max(0, Math.floor(opts.limit));
	const c = compile(g);
	const meter = new Meter(opts.maxSteps ?? DEFAULT_MAX_STEPS);
	const strings: string[][] = [];
	let more = false;
	const last = Math.min(maxLength, range.max);
	for (let length = range.min; length <= last && !more; length++) {
		for (const sentence of sentencesOfLength(c, length, meter)) {
			if (strings.length >= limit) {
				more = true;
				break;
			}
			strings.push(sentence.map((code) => c.names[code]));
		}
		if (meter.stopped) more = true;
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
 * `opts.maxSentences` sentences (default 20000) within the bound, or the
 * work passes `opts.maxSteps` Earley items (default DEFAULT_MAX_STEPS, for
 * both grammars together); the comparison then stops at the last length it
 * could finish (−1 when it could not finish length 0). Like
 * enumerateLanguage, it is meant for bounds of a few dozen tokens.
 */
export function compareGrammars(
	a: Grammar,
	b: Grammar,
	opts: { maxLength: number; maxSentences?: number; maxSteps?: number }
): { onlyA: string[][]; onlyB: string[][]; checkedUpTo: number } {
	const bound = Math.max(-1, Math.floor(opts.maxLength));
	const budget = opts.maxSentences ?? 20000;
	const meter = new Meter(opts.maxSteps ?? DEFAULT_MAX_STEPS);
	const sides = [a, b].map((g) => ({ c: compile(g), range: sentenceLengths(g), count: 0 }));
	const [onlyA, onlyB]: string[][][] = [[], []];
	// Beyond the longest sentence of two finite languages there is nothing left to compare.
	const longest = Math.max(...sides.map((side) => side.range?.max ?? -1));
	for (let length = 0; length <= Math.min(bound, longest); length++) {
		const levels = sides.map((side) => {
			const level = new Map<string, string[]>();
			if (!side.range || length < side.range.min || length > side.range.max) return level;
			for (const sentence of sentencesOfLength(side.c, length, meter)) {
				if (++side.count > budget) break;
				const names = sentence.map((code) => side.c.names[code]);
				level.set(JSON.stringify(names), names);
			}
			return level;
		});
		if (meter.stopped || sides.some((side) => side.count > budget))
			return { onlyA, onlyB, checkedUpTo: length - 1 };
		for (const [key, names] of levels[0]) if (!levels[1].has(key)) onlyA.push(names);
		for (const [key, names] of levels[1]) if (!levels[0].has(key)) onlyB.push(names);
	}
	return { onlyA, onlyB, checkedUpTo: bound };
}
