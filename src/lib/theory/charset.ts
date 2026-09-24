/**
 * Immutable sets of Unicode code points, stored as sorted, disjoint, non-adjacent
 * inclusive ranges. Used for regex atoms/classes and automaton transition labels.
 */

export const MAX_CODE_POINT = 0x10ffff;

export type Range = readonly [lo: number, hi: number];

function toCodePoint(c: string | number): number {
	if (typeof c === 'number') return c;
	const cp = c.codePointAt(0);
	if (cp === undefined) throw new Error('empty character');
	return cp;
}

function normalize(input: Iterable<Range>): Range[] {
	const sorted = [...input]
		.filter(([lo, hi]) => lo <= hi)
		.map(([lo, hi]): Range => [Math.max(0, lo), Math.min(MAX_CODE_POINT, hi)])
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const out: [number, number][] = [];
	for (const [lo, hi] of sorted) {
		const last = out[out.length - 1];
		if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
		else out.push([lo, hi]);
	}
	return out;
}

export class CharSet {
	/** Sorted, disjoint, non-adjacent inclusive ranges. */
	readonly ranges: readonly Range[];

	private constructor(ranges: readonly Range[]) {
		this.ranges = ranges;
	}

	static readonly EMPTY = new CharSet([]);
	static readonly ANY = new CharSet([[0, MAX_CODE_POINT]]);

	static fromRanges(ranges: Iterable<Range>): CharSet {
		const r = normalize(ranges);
		return r.length === 0 ? CharSet.EMPTY : new CharSet(r);
	}

	/** Every code point of every argument, e.g. `CharSet.of('0', '1')` or `CharSet.of('abc')`. */
	static of(...chars: string[]): CharSet {
		const cps: number[] = [];
		for (const s of chars) for (const ch of s) cps.push(ch.codePointAt(0)!);
		return CharSet.fromCodePoints(cps);
	}

	static fromCodePoints(cps: Iterable<number>): CharSet {
		return CharSet.fromRanges([...cps].map((c): Range => [c, c]));
	}

	static single(c: string | number): CharSet {
		const cp = toCodePoint(c);
		return new CharSet([[cp, cp]]);
	}

	static range(lo: string | number, hi: string | number): CharSet {
		return CharSet.fromRanges([[toCodePoint(lo), toCodePoint(hi)]]);
	}

	get isEmpty(): boolean {
		return this.ranges.length === 0;
	}

	/** Number of code points in the set. */
	get size(): number {
		let n = 0;
		for (const [lo, hi] of this.ranges) n += hi - lo + 1;
		return n;
	}

	get isSingleton(): boolean {
		return this.ranges.length === 1 && this.ranges[0][0] === this.ranges[0][1];
	}

	/** Smallest code point, or undefined when empty. */
	first(): number | undefined {
		return this.ranges[0]?.[0];
	}

	/** Smallest member as a string, or undefined when empty. */
	firstChar(): string | undefined {
		const f = this.first();
		return f === undefined ? undefined : String.fromCodePoint(f);
	}

	has(c: string | number): boolean {
		const cp = toCodePoint(c);
		let lo = 0;
		let hi = this.ranges.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const [a, b] = this.ranges[mid];
			if (cp < a) hi = mid - 1;
			else if (cp > b) lo = mid + 1;
			else return true;
		}
		return false;
	}

	union(other: CharSet): CharSet {
		if (other.isEmpty) return this;
		if (this.isEmpty) return other;
		return CharSet.fromRanges([...this.ranges, ...other.ranges]);
	}

	intersect(other: CharSet): CharSet {
		const out: Range[] = [];
		let i = 0;
		let j = 0;
		while (i < this.ranges.length && j < other.ranges.length) {
			const [a1, b1] = this.ranges[i];
			const [a2, b2] = other.ranges[j];
			const lo = Math.max(a1, a2);
			const hi = Math.min(b1, b2);
			if (lo <= hi) out.push([lo, hi]);
			if (b1 < b2) i++;
			else j++;
		}
		return out.length === 0 ? CharSet.EMPTY : new CharSet(out);
	}

	/** Complement relative to all code points. */
	complement(): CharSet {
		const out: Range[] = [];
		let next = 0;
		for (const [lo, hi] of this.ranges) {
			if (lo > next) out.push([next, lo - 1]);
			next = hi + 1;
		}
		if (next <= MAX_CODE_POINT) out.push([next, MAX_CODE_POINT]);
		return out.length === 0 ? CharSet.EMPTY : new CharSet(out);
	}

	subtract(other: CharSet): CharSet {
		if (other.isEmpty || this.isEmpty) return this;
		return this.intersect(other.complement());
	}

	overlaps(other: CharSet): boolean {
		return !this.intersect(other).isEmpty;
	}

	isSubsetOf(other: CharSet): boolean {
		return this.subtract(other).isEmpty;
	}

	equals(other: CharSet): boolean {
		if (this.ranges.length !== other.ranges.length) return false;
		return this.ranges.every(([a, b], i) => a === other.ranges[i][0] && b === other.ranges[i][1]);
	}

	/** Stable string key, suitable for Map keys. */
	key(): string {
		return this.ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
	}

	/** Code points in ascending order, stopping after `limit`. */
	*codePoints(limit = Infinity): Generator<number> {
		let n = 0;
		for (const [lo, hi] of this.ranges) {
			for (let c = lo; c <= hi; c++) {
				if (n++ >= limit) return;
				yield c;
			}
		}
	}

	/** Members as strings in ascending order, at most `limit` of them. */
	chars(limit = Infinity): string[] {
		return [...this.codePoints(limit)].map((c) => String.fromCodePoint(c));
	}

	toString(): string {
		return `CharSet(${this.key()})`;
	}
}

/**
 * Splits a family of (possibly overlapping) sets into the coarsest partition of
 * disjoint, non-empty "symbol classes" such that every input set is a union of
 * classes. Classes are ordered by their smallest code point.
 */
export function partitionCharSets(sets: Iterable<CharSet>): CharSet[] {
	let classes: CharSet[] = [];
	for (const s of sets) {
		if (s.isEmpty) continue;
		const next: CharSet[] = [];
		let rest = s;
		for (const c of classes) {
			const inside = c.intersect(s);
			if (inside.isEmpty) {
				next.push(c);
				continue;
			}
			const outside = c.subtract(s);
			next.push(inside);
			if (!outside.isEmpty) next.push(outside);
			rest = rest.subtract(c);
		}
		if (!rest.isEmpty) next.push(rest);
		classes = next;
	}
	return classes.sort((a, b) => a.first()! - b.first()!);
}
