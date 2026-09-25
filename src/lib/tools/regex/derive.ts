/**
 * One derivation of a string from a regular expression: which sub-expression
 * matched which substring, read straight off the inductive definition
 * (Lexical Analysis, slides 23–27).
 *
 * The matcher computes, for every node and start position, the set of end
 * positions the node can reach (memoized, so shared definition bodies and
 * repeated positions are handled once). A derivation is then read back from
 * those sets, preferring the longest match for earlier parts and iterations.
 *
 * Positions in the result are code-unit offsets into the input (like the
 * scanner's); symbols are whole code points.
 */
import { nullable, type Regex } from '$lib/theory/regex';

export interface Derivation {
	node: Regex;
	/** Child indices from the root (see `children`), as in the syntax tree. */
	path: number[];
	/** input.slice(start, end) is the substring this node matched. */
	start: number;
	end: number;
	/**
	 * Concatenation: one per part. Choice: the chosen option. Iterations: one
	 * per copy of the body (none for zero iterations). Optional: the body, or
	 * nothing when ε was chosen. Definition: its body.
	 */
	children: Derivation[];
}

export type DeriveResult =
	| { status: 'match'; tree: Derivation }
	| { status: 'no-match' }
	/** The input is longer than `maxLength` symbols. */
	| { status: 'too-long'; maxLength: number }
	/** The search went over its step budget. */
	| { status: 'too-complex' };

export interface DeriveOptions {
	/** Longest input (in symbols) to search; default 80. */
	maxLength?: number;
	/** Work limit; default 200 000 steps. */
	budget?: number;
}

class OverBudget extends Error {}

/**
 * Finds a derivation of `input` from `r`, or reports that there is none.
 * Σ nodes match any one symbol; resolve them first (resolveAny) to restrict
 * them to an alphabet.
 */
export function derive(r: Regex, input: string, opts: DeriveOptions = {}): DeriveResult {
	const maxLength = opts.maxLength ?? 80;
	const budget = opts.budget ?? 200_000;
	const cps: number[] = [];
	const offsets: number[] = [];
	for (let i = 0; i < input.length;) {
		const cp = input.codePointAt(i)!;
		offsets.push(i);
		cps.push(cp);
		i += cp > 0xffff ? 2 : 1;
	}
	offsets.push(input.length);
	const n = cps.length;
	if (n > maxLength) return { status: 'too-long', maxLength };

	let steps = 0;
	const tick = (k = 1) => {
		steps += k;
		if (steps > budget) throw new OverBudget();
	};

	// ends(node, i): sorted end positions j such that node derives cps[i, j).
	const endsMemo = new Map<Regex, (number[] | undefined)[]>();
	const nullMemo = new Map<Regex, boolean>();
	const isNullable = (node: Regex) => {
		let v = nullMemo.get(node);
		if (v === undefined) nullMemo.set(node, (v = nullable(node)));
		return v;
	};

	const union = (sets: number[][]): number[] => {
		const mark = new Uint8Array(n + 1);
		for (const s of sets) {
			tick(s.length);
			for (const j of s) mark[j] = 1;
		}
		const out: number[] = [];
		for (let j = 0; j <= n; j++) if (mark[j]) out.push(j);
		return out;
	};

	const ends = (node: Regex, i: number): number[] => {
		let row = endsMemo.get(node);
		if (!row) endsMemo.set(node, (row = new Array(n + 1)));
		const known = row[i];
		if (known) return known;
		tick();
		let out: number[];
		switch (node.kind) {
			case 'empty':
				out = [];
				break;
			case 'epsilon':
				out = [i];
				break;
			case 'chars':
				out = i < n && node.set.has(cps[i]) ? [i + 1] : [];
				break;
			case 'any':
				out = i < n ? [i + 1] : [];
				break;
			case 'ref':
				out = ends(node.body, i);
				break;
			case 'alt':
				out = union(node.options.map((o) => ends(o, i)));
				break;
			case 'optional':
				out = union([[i], ends(node.body, i)]);
				break;
			case 'concat': {
				let reach = [i];
				for (const part of node.parts) {
					reach = union(reach.map((p) => ends(part, p)));
					if (reach.length === 0) break;
				}
				out = reach;
				break;
			}
			case 'star':
				out = iterationEnds(node.body, 0, null, i);
				break;
			case 'plus':
				out = iterationEnds(node.body, 1, null, i);
				break;
			case 'repeat':
				out = iterationEnds(node.body, node.min, node.max, i);
				break;
		}
		row[i] = out;
		return out;
	};

	/**
	 * Iterations use non-empty copies of the body only; a nullable body can
	 * make up a missing lower count with empty copies.
	 */
	const bounds = (body: Regex, min: number, max: number | null) => {
		const lo = isNullable(body) ? 0 : min;
		const hi = max === null ? Infinity : max;
		// Counts above `cap` behave alike: at most n non-empty copies fit.
		const cap = Math.min(n, max === null ? lo : max);
		return { lo, hi, cap };
	};

	const iterationEnds = (body: Regex, min: number, max: number | null, i: number): number[] => {
		const { lo, hi, cap } = bounds(body, min, max);
		if (lo > n - i) return [];
		// seen[c][p]: position p reached with min(count, cap) = c.
		const seen: Uint8Array[] = Array.from({ length: cap + 1 }, () => new Uint8Array(n + 1));
		const out = new Uint8Array(n + 1);
		const queue: [number, number][] = [[i, 0]];
		seen[0][i] = 1;
		for (let q = 0; q < queue.length; q++) {
			const [p, c] = queue[q];
			tick();
			if (c >= lo && c <= hi) out[p] = 1;
			if (c >= hi) continue;
			const c2 = Math.min(c + 1, cap);
			for (const e of ends(body, p)) {
				if (e === p || seen[c2][e]) continue;
				seen[c2][e] = 1;
				queue.push([e, c2]);
			}
		}
		const res: number[] = [];
		for (let j = 0; j <= n; j++) if (out[j]) res.push(j);
		return res;
	};

	const has = (set: number[], j: number) => set.includes(j);

	// ---- Reading a derivation back -------------------------------------------

	const build = (node: Regex, path: number[], i: number, j: number): Derivation => {
		tick();
		const d: Derivation = { node, path, start: offsets[i], end: offsets[j], children: [] };
		switch (node.kind) {
			case 'ref':
				d.children.push(build(node.body, [...path, 0], i, j));
				break;
			case 'alt': {
				const k = node.options.findIndex((o) => has(ends(o, i), j));
				d.children.push(build(node.options[k], [...path, k], i, j));
				break;
			}
			case 'optional':
				if (!(i === j) && has(ends(node.body, i), j))
					d.children.push(build(node.body, [...path, 0], i, j));
				break;
			case 'concat': {
				const parts = node.parts;
				// ok[t]: positions from which parts[t..] can derive cps[p, j).
				const ok: Set<number>[] = new Array(parts.length + 1);
				ok[parts.length] = new Set([j]);
				for (let t = parts.length - 1; t >= 0; t--) {
					const set = new Set<number>();
					for (let p = i; p <= j; p++)
						if (ends(parts[t], p).some((e) => ok[t + 1].has(e))) set.add(p);
					ok[t] = set;
				}
				let p = i;
				parts.forEach((part, t) => {
					const choices = ends(part, p).filter((e) => e <= j && ok[t + 1].has(e));
					const e = choices[choices.length - 1];
					d.children.push(build(part, [...path, t], p, e));
					p = e;
				});
				break;
			}
			case 'star':
			case 'plus':
			case 'repeat': {
				const min = node.kind === 'star' ? 0 : node.kind === 'plus' ? 1 : node.min;
				const max = node.kind === 'repeat' ? node.max : null;
				iterations(node.body, min, max, [...path, 0], i, j, d.children);
				break;
			}
		}
		return d;
	};

	const iterations = (
		body: Regex,
		min: number,
		max: number | null,
		path: number[],
		i: number,
		j: number,
		out: Derivation[]
	) => {
		const { lo, hi, cap } = bounds(body, min, max);
		// done(p, c): from p, with min(count, cap) = c copies so far, the rest can reach j.
		const memo = new Map<number, boolean>();
		const done = (p: number, c: number): boolean => {
			if (p === j) return c >= lo && c <= hi;
			if (c >= hi) return false;
			const key = c * (n + 1) + p;
			const known = memo.get(key);
			if (known !== undefined) return known;
			tick();
			const c2 = Math.min(c + 1, cap);
			const v = ends(body, p).some((e) => e > p && e <= j && done(e, c2));
			memo.set(key, v);
			return v;
		};
		let p = i;
		let c = 0;
		let count = 0;
		while (p < j) {
			const c2 = Math.min(c + 1, cap);
			const choices = ends(body, p).filter((e) => e > p && e <= j && done(e, c2));
			const e = choices[choices.length - 1];
			out.push(build(body, path, p, e));
			p = e;
			c = c2;
			count++;
		}
		// A nullable body fills a lower count with empty copies: A^3 = A A A.
		for (; count < min; count++) out.push(build(body, path, j, j));
	};

	try {
		if (!has(ends(r, 0), n)) return { status: 'no-match' };
		return { status: 'match', tree: build(r, [], 0, n) };
	} catch (e) {
		if (e instanceof OverBudget) return { status: 'too-complex' };
		throw e;
	}
}

// ---------------------------------------------------------------------------
// Display: nested brackets under the string
// ---------------------------------------------------------------------------

export interface Bracket {
	/** The derivation node the bracket shows. */
	derivation: Derivation;
	start: number;
	end: number;
	/** 0 for brackets with nothing nested inside, else 1 + the tallest child. */
	height: number;
	children: Bracket[];
}

/**
 * The brackets drawn under a derived string. Choices and optionals show the
 * option that matched rather than themselves; empty matches are left out; a
 * literal (one symbol, a class, or a quoted literal such as 'if') that spans
 * exactly what its parent bracket spans adds nothing and is dropped
 * (digit → '7'). The root is always shown.
 */
export function brackets(d: Derivation): Bracket {
	const isLeaf = (x: Derivation) =>
		x.node.kind === 'chars' ||
		x.node.kind === 'any' ||
		(x.node.kind === 'concat' && x.node.quoted === true);
	const make = (x: Derivation, kids: Bracket[]): Bracket => ({
		derivation: x,
		start: x.start,
		end: x.end,
		height: kids.length ? 1 + Math.max(...kids.map((k) => k.height)) : 0,
		children: kids
	});
	const inside = (x: Derivation, parent: Derivation): Bracket[] =>
		isLeaf(x) ? [] : x.children.flatMap((c) => shown(c, parent));
	const shown = (x: Derivation, parent: Derivation): Bracket[] => {
		if (x.start === x.end) return [];
		if (x.node.kind === 'alt' || x.node.kind === 'optional') return inside(x, parent);
		if (isLeaf(x) && parent.start === x.start && parent.end === x.end) return [];
		return [make(x, inside(x, x))];
	};
	return make(d, inside(d, d));
}

/** Every bracket, parents before children. */
export function flattenBrackets(b: Bracket): Bracket[] {
	return [b, ...b.children.flatMap(flattenBrackets)];
}
