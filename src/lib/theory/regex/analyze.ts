/**
 * Structural questions about a regex AST. Definition references are followed
 * (their bodies count as part of the expression) unless noted.
 */
import { CharSet } from '../charset';
import { children, type Regex } from './ast';

/** True when ε ∈ L(r). */
export function nullable(r: Regex): boolean {
	switch (r.kind) {
		case 'empty':
		case 'chars':
		case 'any':
			return false;
		case 'epsilon':
		case 'star':
		case 'optional':
			return true;
		case 'concat':
			return r.parts.every(nullable);
		case 'alt':
			return r.options.some(nullable);
		case 'plus':
		case 'ref':
			return nullable(r.body);
		case 'repeat':
			return r.min === 0 || nullable(r.body);
	}
}

/** Union of every character set in the expression (Σ contributes nothing until resolved). */
export function symbolsOf(r: Regex): CharSet {
	let out = CharSet.EMPTY;
	walk(r, (node) => {
		if (node.kind === 'chars') out = out.union(node.set);
	});
	return out;
}

/** True when the expression uses Σ. */
export function containsAny(r: Regex): boolean {
	let found = false;
	walk(r, (node) => {
		if (node.kind === 'any') found = true;
	});
	return found;
}

/** Replaces every Σ with a class over `alphabet`. Returns `r` itself when there is no Σ. */
export function resolveAny(r: Regex, alphabet: CharSet): Regex {
	if (!containsAny(r)) return r;
	const go = (node: Regex): Regex => {
		switch (node.kind) {
			case 'any':
				return { kind: 'chars', set: alphabet, text: 'Σ', span: node.span };
			case 'concat':
				return { ...node, parts: node.parts.map(go) };
			case 'alt':
				return { ...node, options: node.options.map(go) };
			case 'star':
			case 'plus':
			case 'optional':
			case 'repeat':
			case 'ref':
				return containsAny(node.body) ? { ...node, body: go(node.body) } : node;
			default:
				return node;
		}
	};
	return go(r);
}

/** Names of the definitions used, directly or through other definitions, in order of first use. */
export function refsIn(r: Regex): string[] {
	const names = new Set<string>();
	walk(r, (node) => {
		if (node.kind === 'ref') names.add(node.name);
	});
	return [...names];
}

/**
 * Visits every node in pre-order. `path` lists child indices from the root
 * (see `children`), so it also leads into definition bodies.
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

/** Replaces every definition reference with (the expansion of) its body. */
export function expandRefs(r: Regex): Regex {
	switch (r.kind) {
		case 'ref':
			return expandRefs(r.body);
		case 'concat':
			return { ...r, parts: r.parts.map(expandRefs) };
		case 'alt':
			return { ...r, options: r.options.map(expandRefs) };
		case 'star':
		case 'plus':
		case 'optional':
		case 'repeat':
			return { ...r, body: expandRefs(r.body) };
		default:
			return r;
	}
}

/**
 * Structural equality ignoring spans and display text. Character sets compare
 * by content, quoted literals ('if') differ from plain concatenations ('i' 'f'),
 * and references compare by name and body.
 */
export function regexEquals(a: Regex, b: Regex): boolean {
	if (a === b) return true;
	switch (a.kind) {
		case 'empty':
		case 'epsilon':
		case 'any':
			return b.kind === a.kind;
		case 'chars':
			return b.kind === 'chars' && a.set.equals(b.set);
		case 'concat':
			return (
				b.kind === 'concat' &&
				!!a.quoted === !!b.quoted &&
				a.parts.length === b.parts.length &&
				a.parts.every((p, i) => regexEquals(p, b.parts[i]))
			);
		case 'alt':
			return (
				b.kind === 'alt' &&
				a.options.length === b.options.length &&
				a.options.every((o, i) => regexEquals(o, b.options[i]))
			);
		case 'star':
		case 'plus':
		case 'optional':
			return b.kind === a.kind && regexEquals(a.body, b.body);
		case 'repeat':
			return (
				b.kind === 'repeat' && a.min === b.min && a.max === b.max && regexEquals(a.body, b.body)
			);
		case 'ref':
			return b.kind === 'ref' && a.name === b.name && regexEquals(a.body, b.body);
	}
}
