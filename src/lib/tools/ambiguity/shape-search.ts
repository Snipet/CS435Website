/**
 * Looks for the parse tree of a token string that has a given shape (see
 * shape.ts), without listing the trees of the string.
 *
 * The page lists the first few trees of a string. Whether a grammar has a
 * tree with the structure of some other tree must not depend on that list:
 * a string of six operands has 42 trees under E → E + E | int. So the
 * question is answered here by a search that follows the shape:
 *
 * - a node for a production `( X )` has the shape of what it encloses;
 * - any other node has the shapes of its children as its parts, so the
 *   children of a production are matched, in order, with the parts of a
 *   group, or one child takes the whole shape and the others derive nothing.
 *
 * A child always covers fewer tokens than its parent, except when it takes
 * the parent's whole shape next to children that derive ε (E → T). Those
 * steps are added afterwards as a closure, so the search cannot run in a
 * circle, and a tree it returns never repeats a non-terminal over the same
 * tokens: it is one of the trees parseTrees lists.
 *
 * Leaves are matched by token index, so the shape must come from a tree of
 * the same token string.
 */
import type { Grammar, ParseNode, Production } from '$lib/theory/grammar';
import type { Shape } from './shape';

/** A shape with what the search needs to know about it. */
interface Target {
	/** Equal for equal shapes at the same tokens. */
	key: string;
	shape: Shape | null;
	/** The parts of a group; null for a leaf and for the empty shape. */
	parts: Target[] | null;
	/** Indices of its first and last token (0 and −1 for the empty shape). */
	lo: number;
	hi: number;
}

const NOTHING: Target = { key: 'ε', shape: null, parts: null, lo: 0, hi: -1 };

/** For each non-terminal that derives ε: a production whose symbols all got theirs before it. */
function emptyProductions(g: Grammar): Map<string, Production> {
	const via = new Map<string, Production>();
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			if (via.has(p.lhs) || !p.rhs.every((symbol) => via.has(symbol))) continue;
			via.set(p.lhs, p);
			changed = true;
		}
	}
	return via;
}

/**
 * A function that returns a parse tree of `tokens` under `g` with a given
 * shape, or null when there is none. One finder shares its work between the
 * shapes it is asked for.
 */
export function shapeFinder(
	g: Grammar,
	tokens: readonly string[]
): (shape: Shape | null) => ParseNode | null {
	const n = tokens.length;
	const isNonterminal = new Set(g.nonterminals);
	const empty = emptyProductions(g);
	/** parens[i]: how many of the first i tokens are parentheses. */
	const parens = [0];
	for (const token of tokens) parens.push(parens[parens.length - 1] + (isParen(token) ? 1 : 0));
	/** Tokens a … b − 1 are all parentheses: the only tokens a shape leaves out. */
	const onlyParens = (a: number, b: number): boolean => parens[b] - parens[a] === b - a;

	const targets = new Map<string, Target>();
	const targetOf = (shape: Shape | null): Target => {
		if (shape === null) return NOTHING;
		let made: Target;
		if (shape.kind === 'leaf')
			made = {
				key: `${shape.at}:${shape.symbol}`,
				shape,
				parts: null,
				lo: shape.at,
				hi: shape.at
			};
		else {
			const parts = shape.parts.map(targetOf);
			made = {
				key: `[${parts.map((part) => part.key).join(' ')}]`,
				shape,
				parts,
				lo: parts[0].lo,
				hi: parts[parts.length - 1].hi
			};
		}
		const known = targets.get(made.key);
		if (known) return known;
		targets.set(made.key, made);
		return made;
	};

	const leaf = (symbol: string, at: number): ParseNode => ({
		symbol,
		terminal: true,
		children: [],
		start: at,
		end: at + 1
	});
	const node = (p: Production, children: ParseNode[], a: number, b: number): ParseNode => ({
		symbol: p.lhs,
		terminal: false,
		children,
		production: p.id,
		start: a,
		end: b
	});
	/** A tree of `symbol` that derives ε, at token `at`. */
	const emptyTree = (symbol: string, at: number): ParseNode => {
		const p = empty.get(symbol)!;
		return node(
			p,
			p.rhs.map((child) => emptyTree(child, at)),
			at,
			at
		);
	};

	/** Tokens a … b − 1 can be what a tree of shape `t` covers: its tokens and parentheses around them. */
	const fits = (t: Target, a: number, b: number): boolean =>
		t.shape === null
			? a < b && onlyParens(a, b)
			: a <= t.lo && t.hi < b && onlyParens(a, t.lo) && onlyParens(t.hi + 1, b);

	/** A tree of `symbol` over tokens a … b − 1 with shape `t`. */
	const child = (symbol: string, t: Target, a: number, b: number): ParseNode | null => {
		if (!isNonterminal.has(symbol)) {
			const ok =
				t.shape?.kind === 'leaf' && t.shape.symbol === symbol && t.shape.at === a && b === a + 1;
			return ok && tokens[a] === symbol ? leaf(symbol, a) : null;
		}
		if (t.shape === null && a === b) return empty.has(symbol) ? emptyTree(symbol, a) : null;
		return fits(t, a, b) ? (derivers(t, a, b).get(symbol) ?? null) : null;
	};

	/**
	 * Children for production `p` over tokens a … b − 1 whose shapes are, in
	 * order, `parts` (children without a shape may stand anywhere between
	 * them). A child with the node's own shape and tokens is not tried: that is
	 * the closure in `derivers`.
	 */
	const sequence = (
		p: Production,
		parts: readonly Target[],
		a: number,
		b: number
	): ParseNode[] | null => {
		const rhs = p.rhs;
		const whole = (from: number, to: number): boolean => from === a && to === b;
		const made: ParseNode[] = [];
		const from = (i: number, j: number, at: number): boolean => {
			if (i === rhs.length) return j === parts.length && at === b;
			const tryChild = (t: Target, end: number, next: number): boolean => {
				const tree = child(rhs[i], t, at, end);
				if (!tree) return false;
				made.push(tree);
				if (from(i + 1, next, end)) return true;
				made.pop();
				return false;
			};
			const part: Target | undefined = parts[j];
			if (!isNonterminal.has(rhs[i])) return part !== undefined && tryChild(part, at + 1, j + 1);
			// The child has the next part as its shape: it ends after the part's last
			// token, or after closing parentheses that follow it …
			if (part)
				for (let end = Math.max(at, part.hi + 1); end <= b; end++) {
					if (end > part.hi + 1 && !isParen(tokens[end - 1])) break;
					if (parts.length === 1 && whole(at, end)) continue;
					if (tryChild(part, end, j + 1)) return true;
				}
			// … or it has no shape: it derives no token, or parentheses around nothing.
			for (let end = at; end <= b; end++) {
				if (end > at && !isParen(tokens[end - 1])) break;
				if (parts.length === 0 && whole(at, end)) continue;
				if (tryChild(NOTHING, end, j)) return true;
			}
			return false;
		};
		return from(0, 0, a) ? made : null;
	};

	/** Children for production `p` at a node over tokens a … b − 1 with shape `t`, none of which is the node over again. */
	const childrenFor = (p: Production, t: Target, a: number, b: number): ParseNode[] | null => {
		const rhs = p.rhs;
		const parenthesized =
			rhs.length === 3 &&
			rhs[0] === '(' &&
			rhs[2] === ')' &&
			!isNonterminal.has('(') &&
			!isNonterminal.has(')');
		if (parenthesized) {
			if (b - a < 2 || tokens[a] !== '(' || tokens[b - 1] !== ')') return null;
			const inner = child(rhs[1], t, a + 1, b - 1);
			return inner && [leaf('(', a), inner, leaf(')', b - 1)];
		}
		// The children's shapes are the parts of the group, or one child has the whole shape.
		if (t.parts) {
			const grouped = sequence(p, t.parts, a, b);
			if (grouped) return grouped;
		}
		return sequence(p, t.shape === null ? [] : [t], a, b);
	};

	const memo = new Map<string, Map<string, ParseNode>>();
	/**
	 * The non-terminals that derive tokens a … b − 1 with a tree of shape `t`,
	 * each with such a tree. Not asked for the empty shape over no tokens
	 * (that is `empty`).
	 */
	const derivers = (t: Target, a: number, b: number): Map<string, ParseNode> => {
		const key = `${t.key}|${a}|${b}`;
		const known = memo.get(key);
		if (known) return known;
		const found = new Map<string, ParseNode>();
		for (const p of g.productions) {
			if (found.has(p.lhs)) continue;
			const children = childrenFor(p, t, a, b);
			if (children) found.set(p.lhs, node(p, children, a, b));
		}
		// A → α B β with a B found and α, β deriving ε: A has B's shape over the same tokens.
		for (let changed = found.size > 0; changed;) {
			changed = false;
			for (const p of g.productions) {
				if (found.has(p.lhs)) continue;
				const at = p.rhs.findIndex(
					(symbol, i) => found.has(symbol) && p.rhs.every((other, j) => j === i || empty.has(other))
				);
				if (at < 0) continue;
				const children = p.rhs.map((symbol, i) =>
					i === at ? found.get(symbol)! : emptyTree(symbol, i < at ? a : b)
				);
				found.set(p.lhs, node(p, children, a, b));
				changed = true;
			}
		}
		memo.set(key, found);
		return found;
	};

	return (shape) => {
		const t = targetOf(shape);
		if (t.shape === null && n === 0) return empty.has(g.start) ? emptyTree(g.start, 0) : null;
		return fits(t, 0, n) ? (derivers(t, 0, n).get(g.start) ?? null) : null;
	};
}

function isParen(token: string): boolean {
	return token === '(' || token === ')';
}

/** A parse tree of `tokens` under `g` with the shape given, or null when there is none. */
export function treeWithShape(
	g: Grammar,
	tokens: readonly string[],
	shape: Shape | null
): ParseNode | null {
	return shapeFinder(g, tokens)(shape);
}
