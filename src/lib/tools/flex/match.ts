/**
 * Pattern matching for the flex runtime: a regex AST is compiled to a small
 * NFA (one labeled edge per state, plus ε-edges) and run as a lazily built
 * DFA, so scanning the same rule at many positions stays fast.
 *
 * Positions are JavaScript string indices; a character is one code point.
 */
import { CharSet } from '$lib/theory/charset';
import type { Regex } from '$lib/theory/regex';

/** NFA size limit per pattern; `r{1000}` of a large class stays below it. */
export const MAX_NFA_STATES = 60_000;
/** Cached DFA states per matcher before the cache is dropped and rebuilt. */
const MAX_DFA_STATES = 4_000;

/** Thrown when a pattern compiles to more NFA states than MAX_NFA_STATES. */
export class PatternTooLarge extends Error {
	constructor() {
		super(`pattern is too large to run (more than ${MAX_NFA_STATES} automaton states)`);
	}
}

/** Thrown when a shared `MatchBudget` runs out. */
export class MatchBudgetExceeded extends Error {
	constructor() {
		super('matching budget exceeded');
	}
}

/** Characters the matchers may still examine; shared by every matcher of one run. */
export class MatchBudget {
	constructor(public left: number) {}
	spend(): void {
		if (--this.left < 0) throw new MatchBudgetExceeded();
	}
}

interface DState {
	/** Sorted NFA state ids (ε-closed). */
	states: number[];
	accept: boolean;
	next: Map<number, DState | null>;
}

class Nfa {
	eps: number[][] = [];
	label: (CharSet | null)[] = [];
	to: number[] = [];
	start = 0;
	accept = 0;

	add(): number {
		if (this.label.length >= MAX_NFA_STATES) throw new PatternTooLarge();
		this.eps.push([]);
		this.label.push(null);
		this.to.push(-1);
		return this.label.length - 1;
	}

	edge(from: number, set: CharSet, to: number): void {
		this.label[from] = set;
		this.to[from] = to;
	}

	build(r: Regex): [number, number] {
		switch (r.kind) {
			case 'empty': {
				return [this.add(), this.add()];
			}
			case 'epsilon': {
				const s = this.add();
				const f = this.add();
				this.eps[s].push(f);
				return [s, f];
			}
			case 'chars':
			case 'any': {
				const s = this.add();
				const f = this.add();
				this.edge(s, r.kind === 'any' ? CharSet.ANY : r.set, f);
				return [s, f];
			}
			case 'ref':
				return this.build(r.body);
			case 'concat': {
				const [s, first] = this.build(r.parts[0]);
				let f = first;
				for (let i = 1; i < r.parts.length; i++) {
					const [s2, f2] = this.build(r.parts[i]);
					this.eps[f].push(s2);
					f = f2;
				}
				return [s, f];
			}
			case 'alt': {
				const s = this.add();
				const f = this.add();
				for (const o of r.options) {
					const [a, b] = this.build(o);
					this.eps[s].push(a);
					this.eps[b].push(f);
				}
				return [s, f];
			}
			case 'star':
			case 'plus':
			case 'optional': {
				const s = this.add();
				const f = this.add();
				const [a, b] = this.build(r.body);
				this.eps[s].push(a);
				this.eps[b].push(f);
				if (r.kind !== 'plus') this.eps[s].push(f);
				if (r.kind !== 'optional') this.eps[b].push(a);
				return [s, f];
			}
			case 'repeat': {
				const s = this.add();
				let f = s;
				for (let i = 0; i < r.min; i++) {
					const [a, b] = this.build(r.body);
					this.eps[f].push(a);
					f = b;
				}
				if (r.max === null) {
					const [a, b] = this.build({ kind: 'star', body: r.body });
					this.eps[f].push(a);
					f = b;
				} else {
					for (let i = r.min; i < r.max; i++) {
						const [a, b] = this.build({ kind: 'optional', body: r.body });
						this.eps[f].push(a);
						f = b;
					}
				}
				return [s, f];
			}
		}
	}
}

/** Runs one regex from any position: every end, or the longest end. */
export class Matcher {
	private readonly nfa = new Nfa();
	private readonly cache = new Map<string, DState>();
	private readonly startState: DState;
	private mark: Int32Array;
	private gen = 0;

	constructor(regex: Regex) {
		const [s, f] = this.nfa.build(regex);
		this.nfa.start = s;
		this.nfa.accept = f;
		this.mark = new Int32Array(this.nfa.label.length);
		this.startState = this.dstate([s]);
	}

	get size(): number {
		return this.nfa.label.length;
	}

	/** ε-closure of `seeds` as a cached DFA state. */
	private dstate(seeds: number[]): DState {
		const gen = ++this.gen;
		const out: number[] = [];
		const stack = seeds.slice();
		for (const s of seeds) this.mark[s] = gen;
		while (stack.length) {
			const s = stack.pop()!;
			out.push(s);
			for (const t of this.nfa.eps[s]) {
				if (this.mark[t] !== gen) {
					this.mark[t] = gen;
					stack.push(t);
				}
			}
		}
		out.sort((a, b) => a - b);
		const key = out.join(',');
		let d = this.cache.get(key);
		if (!d) {
			if (this.cache.size >= MAX_DFA_STATES) {
				// Start over from the start state; states still in use are rebuilt on demand.
				this.cache.clear();
				this.startState.next.clear();
				this.cache.set(this.startState.states.join(','), this.startState);
			}
			d = { states: out, accept: out.includes(this.nfa.accept), next: new Map() };
			this.cache.set(key, d);
		}
		return d;
	}

	private step(d: DState, cp: number): DState | null {
		const known = d.next.get(cp);
		if (known !== undefined) return known;
		const targets: number[] = [];
		for (const s of d.states) {
			const set = this.nfa.label[s];
			if (set && set.has(cp)) targets.push(this.nfa.to[s]);
		}
		const next = targets.length ? this.dstate(targets) : null;
		d.next.set(cp, next);
		return next;
	}

	/**
	 * Every position `e ≥ pos` such that the regex matches `input[pos, e)`,
	 * ascending. Includes `pos` itself when the regex matches the empty string.
	 */
	ends(input: string, pos: number, budget?: MatchBudget): number[] {
		const out: number[] = [];
		let d: DState | null = this.startState;
		let i = pos;
		if (d.accept) out.push(i);
		while (d && i < input.length) {
			budget?.spend();
			const cp = input.codePointAt(i)!;
			d = this.step(d, cp);
			i += cp > 0xffff ? 2 : 1;
			if (d?.accept) out.push(i);
		}
		return out;
	}

	/** The longest end (see `ends`), or -1 when the regex matches no prefix. */
	longest(input: string, pos: number, budget?: MatchBudget): number {
		let best = -1;
		let d: DState | null = this.startState;
		let i = pos;
		if (d.accept) best = i;
		while (d && i < input.length) {
			budget?.spend();
			const cp = input.codePointAt(i)!;
			d = this.step(d, cp);
			i += cp > 0xffff ? 2 : 1;
			if (d?.accept) best = i;
		}
		return best;
	}

	/** True when the regex matches all of `text`. */
	matchesAll(text: string): boolean {
		return this.ends(text, 0).includes(text.length);
	}
}

/** Where one flex rule matches at a position: total length (with trailing context) and yytext length. */
export interface RuleMatch {
	/** End of the whole match, trailing context included. */
	end: number;
	/** End of yytext (the part before the trailing context). */
	textEnd: number;
}

/**
 * A compiled flex rule body: `head` is the regex, `tail` the trailing context
 * (for `r/s`, and `\n` for `r$`).
 */
export class RuleMatcher {
	readonly head: Matcher;
	readonly tail: Matcher | null;

	constructor(head: Regex, tail: Regex | null) {
		this.head = new Matcher(head);
		this.tail = tail ? new Matcher(tail) : null;
	}

	/**
	 * The longest match at `pos`, or null. With trailing context the whole
	 * `r s` must match; the longest total wins, and among splits with that total
	 * the longest `r` becomes yytext.
	 */
	match(input: string, pos: number, budget?: MatchBudget): RuleMatch | null {
		if (!this.tail) {
			const end = this.head.longest(input, pos, budget);
			return end > pos ? { end, textEnd: end } : null;
		}
		const heads = this.head.ends(input, pos, budget);
		let best: RuleMatch | null = null;
		for (let k = heads.length - 1; k >= 0; k--) {
			const h = heads[k];
			const end = this.tail.longest(input, h, budget);
			if (end < 0) continue;
			if (!best || end > best.end) best = { end, textEnd: h };
		}
		return best && best.end > pos ? best : null;
	}
}
