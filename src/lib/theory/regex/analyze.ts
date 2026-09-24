/**
 * Structural questions about a regex AST. Definition references are followed
 * (their bodies count as part of the expression) unless noted.
 *
 * A definition body is shared by every use, so a chain like d1 = d0 d0,
 * d2 = d1 d1, … doubles the tree at each level (and expandRefs keeps that
 * sharing). Everything here except `walk` handles each distinct node once, so
 * the cost stays linear in the number of distinct nodes.
 */
import { CharSet, type Range } from '../charset';
import { children, type Regex } from './ast';

/** Wraps `f` so it runs once per distinct node. */
function memo<T>(f: (node: Regex) => T): (node: Regex) => T {
	const cache = new Map<Regex, T>();
	return (node) => {
		if (cache.has(node)) return cache.get(node)!;
		const v = f(node);
		cache.set(node, v);
		return v;
	};
}

/** True when ε ∈ L(r). */
export function nullable(r: Regex): boolean {
	const go = memo((node: Regex): boolean => {
		switch (node.kind) {
			case 'empty':
			case 'chars':
			case 'any':
				return false;
			case 'epsilon':
			case 'star':
			case 'optional':
				return true;
			case 'concat':
				return node.parts.every(go);
			case 'alt':
				return node.options.some(go);
			case 'plus':
			case 'ref':
				return go(node.body);
			case 'repeat':
				return node.min === 0 || go(node.body);
		}
	});
	return go(r);
}

/** Calls `visit` on each distinct node in pre-order until it returns false. */
function eachNode(r: Regex, visit: (node: Regex) => boolean | void): void {
	const seen = new Set<Regex>();
	let stop = false;
	const go = (node: Regex): void => {
		if (stop || seen.has(node)) return;
		seen.add(node);
		if (visit(node) === false) {
			stop = true;
			return;
		}
		for (const c of children(node)) go(c);
	};
	go(r);
}

/** Union of every character set in the expression (Σ contributes nothing until resolved). */
export function symbolsOf(r: Regex): CharSet {
	const ranges: Range[] = [];
	eachNode(r, (node) => {
		if (node.kind === 'chars') for (const range of node.set.ranges) ranges.push(range);
	});
	return CharSet.fromRanges(ranges);
}

/** True when the expression uses Σ. */
export function containsAny(r: Regex): boolean {
	let found = false;
	eachNode(r, (node) => {
		if (node.kind === 'any') found = true;
		return !found;
	});
	return found;
}

/**
 * Replaces every Σ with a class over `alphabet`. Nodes without Σ (and `r`
 * itself, when there is none) are returned as they are, and shared nodes
 * (such as a definition body) are resolved once and stay shared.
 */
export function resolveAny(r: Regex, alphabet: CharSet): Regex {
	const go = memo((node: Regex): Regex => {
		switch (node.kind) {
			case 'any':
				return { kind: 'chars', set: alphabet, text: 'Σ', span: node.span };
			case 'concat': {
				const parts = node.parts.map(go);
				return parts.every((p, i) => p === node.parts[i]) ? node : { ...node, parts };
			}
			case 'alt': {
				const options = node.options.map(go);
				return options.every((o, i) => o === node.options[i]) ? node : { ...node, options };
			}
			case 'star':
			case 'plus':
			case 'optional':
			case 'repeat':
			case 'ref': {
				const body = go(node.body);
				return body === node.body ? node : { ...node, body };
			}
			default:
				return node;
		}
	});
	return go(r);
}

/** Names of the definitions used, directly or through other definitions, in order of first use. */
export function refsIn(r: Regex): string[] {
	const names = new Set<string>();
	eachNode(r, (node) => {
		if (node.kind === 'ref') names.add(node.name);
	});
	return [...names];
}

/**
 * Visits every node in pre-order. `path` lists child indices from the root
 * (see `children`), so it also leads into definition bodies. A definition used
 * n times is visited n times, once per path.
 */
export function walk(r: Regex, visit: (node: Regex, path: number[], depth: number) => void): void {
	const go = (node: Regex, path: number[]): void => {
		visit(node, path, path.length);
		children(node).forEach((c, i) => go(c, [...path, i]));
	};
	go(r, []);
}

/** The node reached by following child indices from the root, or undefined. */
export function nodeAtPath(r: Regex, path: readonly number[]): Regex | undefined {
	let node: Regex | undefined = r;
	for (const i of path) {
		node = node ? children(node)[i] : undefined;
		if (!node) return undefined;
	}
	return node;
}

/**
 * Replaces every definition reference with (the expansion of) its body. Each
 * body is expanded once and its uses share the result.
 */
export function expandRefs(r: Regex): Regex {
	const go = memo((node: Regex): Regex => {
		switch (node.kind) {
			case 'ref':
				return go(node.body);
			case 'concat':
				return { ...node, parts: node.parts.map(go) };
			case 'alt':
				return { ...node, options: node.options.map(go) };
			case 'star':
			case 'plus':
			case 'optional':
			case 'repeat':
				return { ...node, body: go(node.body) };
			default:
				return node;
		}
	});
	return go(r);
}

/**
 * Structural equality ignoring spans and display text. Character sets compare
 * by content, quoted literals ('if') differ from plain concatenations ('i' 'f'),
 * and references compare by name and body.
 */
export function regexEquals(a: Regex, b: Regex): boolean {
	// Pairs of compound nodes already compared.
	const pairs = new Map<Regex, Map<Regex, boolean>>();
	const eq = (a: Regex, b: Regex): boolean => {
		if (a === b) return true;
		if (a.kind !== b.kind) return false;
		const kids = children(a);
		if (kids.length === 0) return a.kind !== 'chars' || (b.kind === 'chars' && a.set.equals(b.set));
		let row = pairs.get(a);
		if (!row) pairs.set(a, (row = new Map()));
		const known = row.get(b);
		if (known !== undefined) return known;
		const other = children(b);
		const same =
			kids.length === other.length && shallowEquals(a, b) && kids.every((k, i) => eq(k, other[i]));
		row.set(b, same);
		return same;
	};
	return eq(a, b);
}

/** Compares everything but the children of two nodes of the same kind. */
function shallowEquals(a: Regex, b: Regex): boolean {
	switch (a.kind) {
		case 'concat':
			return b.kind === 'concat' && !!a.quoted === !!b.quoted;
		case 'repeat':
			return b.kind === 'repeat' && a.min === b.min && a.max === b.max;
		case 'ref':
			return b.kind === 'ref' && a.name === b.name;
		default:
			return true;
	}
}
