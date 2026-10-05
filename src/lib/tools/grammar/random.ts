/**
 * A random sentence of L(G): the start symbol is expanded with productions
 * chosen at random down to a depth bound, and below it every non-terminal
 * takes its shortest expansion. The same grammar and seed always give the
 * same sentence, so a link reproduces it.
 *
 * The work is bounded whatever the grammar is: a production is only chosen
 * when a sentence of at most `maxLength` tokens can still be reached, the
 * random choices stop after `maxChoices` expansions, and a tree of more than
 * `maxNodes` expansions is given up.
 */
import {
	derivationFromTree,
	yieldOf,
	type Derivation,
	type Grammar,
	type ParseNode,
	type Production
} from '$lib/theory/grammar';

export interface RandomOptions {
	/** Depth (the root is 0) below which non-terminals take their shortest expansion. */
	maxDepth?: number;
	/** Longest sentence aimed for, in tokens. */
	maxLength?: number;
	/** Random choices made before the rest takes its shortest expansion. */
	maxChoices?: number;
	/** Expansions after which the attempt is given up. */
	maxNodes?: number;
}

export const RANDOM_DEFAULTS: Required<RandomOptions> = {
	maxDepth: 6,
	maxLength: 16,
	maxChoices: 60,
	maxNodes: 400
};

export type RandomSentence =
	| {
			ok: true;
			sentence: string[];
			tree: ParseNode;
			/** The leftmost derivation of `tree`. */
			derivation: Derivation;
	  }
	/** `empty`: L(G) = { }. `too-large`: the tree passed `maxNodes` expansions. */
	| { ok: false; reason: 'empty' | 'too-large' };

/** A small deterministic generator (mulberry32): numbers in [0, 1). */
export function generator(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The cheapest way to turn a non-terminal into terminals. */
interface Shortest {
	/** Tokens of its shortest terminal string. */
	length: number;
	/** Expansions of the smallest tree for a string of that length. */
	nodes: number;
	/** The production at the root of that tree. */
	production: Production;
}

/**
 * For each non-terminal that derives a terminal string: the length of its
 * shortest one, and the production that starts the smallest tree for it.
 * Following these productions always ends: each one was recorded when the
 * non-terminals on its right-hand side already had their final entries.
 */
export function shortestExpansions(g: Grammar): Map<string, Shortest> {
	const isNonterminal = new Set(g.nonterminals);
	/** For each non-terminal, the productions with it on the right-hand side. */
	const users = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of g.productions) for (const x of new Set(p.rhs)) users.get(x)?.push(p);
	const best = new Map<string, Shortest>();
	// A worklist: a production is looked at again when a non-terminal it uses got a better entry.
	const queue = [...g.productions];
	const waiting = new Set(queue);
	for (let at = 0; at < queue.length; at++) {
		const p = queue[at];
		waiting.delete(p);
		let length = 0;
		let nodes = 1;
		let known = true;
		for (const x of p.rhs) {
			if (!isNonterminal.has(x)) length += 1;
			else {
				const sub = best.get(x);
				if (!sub) {
					known = false;
					break;
				}
				length += sub.length;
				nodes += sub.nodes;
			}
		}
		if (!known) continue;
		const now = best.get(p.lhs);
		if (now && (length > now.length || (length === now.length && nodes >= now.nodes))) continue;
		best.set(p.lhs, { length, nodes, production: p });
		for (const user of users.get(p.lhs)!) {
			if (waiting.has(user)) continue;
			waiting.add(user);
			queue.push(user);
		}
	}
	return best;
}

export function randomSentence(g: Grammar, seed: number, opts: RandomOptions = {}): RandomSentence {
	const { maxDepth, maxLength, maxChoices, maxNodes } = { ...RANDOM_DEFAULTS, ...opts };
	const shortest = shortestExpansions(g);
	const start = shortest.get(g.start);
	if (!start) return { ok: false, reason: 'empty' };

	const isNonterminal = new Set(g.nonterminals);
	const byLhs = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of g.productions) byLhs.get(p.lhs)!.push(p);
	/** Tokens of the shortest sentence a production leads to; Infinity when it leads to none. */
	const reach = (p: Production): number => {
		let total = 0;
		for (const x of p.rhs)
			total += isNonterminal.has(x) ? (shortest.get(x)?.length ?? Infinity) : 1;
		return total;
	};

	const next = generator(seed);
	const leaf = (symbol: string): ParseNode => ({
		symbol,
		terminal: !isNonterminal.has(symbol),
		children: []
	});
	const tree = leaf(g.start);
	/** Unexpanded non-terminals, the leftmost on top. */
	const open: { node: ParseNode; depth: number }[] = [{ node: tree, depth: 0 }];
	/** Tokens of the shortest sentence the tree built so far can still become. */
	let floor = start.length;
	let expansions = 0;
	while (open.length > 0) {
		const { node, depth } = open.pop()!;
		const least = shortest.get(node.symbol)!;
		let production = least.production;
		if (depth < maxDepth && expansions < maxChoices) {
			const room = Math.max(floor, maxLength) - (floor - least.length);
			const options = byLhs.get(node.symbol)!.filter((p) => reach(p) <= room);
			if (options.length > 0) production = options[Math.floor(next() * options.length)];
		}
		floor += reach(production) - least.length;
		if (++expansions > maxNodes) return { ok: false, reason: 'too-large' };
		node.production = production.id;
		node.children = production.rhs.map(leaf);
		for (let i = node.children.length - 1; i >= 0; i--)
			if (!node.children[i].terminal) open.push({ node: node.children[i], depth: depth + 1 });
	}
	return {
		ok: true,
		sentence: yieldOf(tree),
		tree,
		derivation: derivationFromTree(g, tree, 'leftmost')
	};
}

/** A fresh seed for the "Random sentence" button: an unsigned 32-bit integer. */
export function freshSeed(random: () => number = Math.random): number {
	return Math.floor(random() * 0x1_0000_0000) >>> 0;
}
