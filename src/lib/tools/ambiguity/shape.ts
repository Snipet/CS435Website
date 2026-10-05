/**
 * The operator structure of a parse tree: its "shape".
 *
 * Two grammars for one language give different parse trees for the same
 * string (`E( E( E(int) * E(int) ) + E(int) )` under the ambiguous expression
 * grammar, `E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )` under the
 * precedence cascade), yet both group the tokens as (int * int) + int. The
 * shape keeps only that grouping:
 *
 * - a non-terminal with a single child is replaced by the child (E → T,
 *   T → F, F → int, E → OTHER),
 * - a parenthesized node `( X )` is replaced by X,
 * - an ε-production contributes nothing,
 * - every other non-terminal is a group of its children's shapes.
 *
 * Leaves carry the index of their token, so two trees of one token string
 * have the same shape exactly when their keys are equal.
 */
import type { Grammar, ParseNode } from '$lib/theory/grammar';

export type Shape =
	/** A token of the string: `at` is its index. */
	| { kind: 'leaf'; symbol: string; at: number }
	/** Two or more parts grouped by one production of `symbol`. */
	| { kind: 'group'; symbol: string; parts: Shape[] };

/**
 * Folds a tree bottom-up without recursion: `visit` gets each node after its
 * children, left to right, with the children's results.
 */
export function foldTree<T>(tree: ParseNode, visit: (node: ParseNode, children: T[]) => T): T {
	const open: { node: ParseNode; done: T[] }[] = [{ node: tree, done: [] }];
	for (;;) {
		const top = open[open.length - 1];
		if (top.done.length < top.node.children.length) {
			open.push({ node: top.node.children[top.done.length], done: [] });
			continue;
		}
		const value = visit(top.node, top.done);
		open.pop();
		if (open.length === 0) return value;
		open[open.length - 1].done.push(value);
	}
}

const isParenthesized = (node: ParseNode): boolean =>
	node.children.length === 3 &&
	node.children[0].terminal &&
	node.children[0].symbol === '(' &&
	node.children[2].terminal &&
	node.children[2].symbol === ')';

/**
 * The shape of a parse tree, or null when the tree derives the empty string.
 * Tokens are numbered from 0 in the order of the tree's leaves.
 */
export function shapeOf(tree: ParseNode): Shape | null {
	let at = 0;
	return foldTree<Shape | null>(tree, (node, children) => {
		if (node.terminal) return { kind: 'leaf', symbol: node.symbol, at: at++ };
		// The parentheses were counted as tokens above; only what they enclose is kept.
		if (isParenthesized(node)) return children[1];
		const parts = children.filter((c) => c !== null);
		if (parts.length === 0) return null;
		if (parts.length === 1) return parts[0];
		return { kind: 'group', symbol: node.symbol, parts };
	});
}

/**
 * The shape with every group in square brackets: `[[int * int] + int]`.
 * Equal keys mean equal shapes for two trees of the same token string.
 */
export function shapeKey(shape: Shape | null): string {
	if (shape === null) return 'ε';
	if (shape.kind === 'leaf') return shape.symbol;
	return `[${shape.parts.map(shapeKey).join(' ')}]`;
}

/**
 * The shape as a grouped string, the outermost group without parentheses:
 * `(int * int) + int`, `if E₁ then (if E₂ then E₃) else E₄`. `label` names
 * the token at an index (default: its symbol).
 */
export function shapeText(
	shape: Shape | null,
	label?: (at: number, symbol: string) => string
): string {
	if (shape === null) return 'ε';
	const text = (s: Shape, top: boolean): string => {
		if (s.kind === 'leaf') return label ? label(s.at, s.symbol) : s.symbol;
		const inner = s.parts.map((p) => text(p, false)).join(' ');
		return top ? inner : `(${inner})`;
	};
	return text(shape, true);
}

/**
 * The operand terminals of a grammar: the terminals that are a whole
 * right-hand side (`int` in E → int, `OTHER` in MIF → OTHER). Every other
 * terminal is an operator, a keyword or punctuation.
 */
export function operandTerminals(g: Grammar): Set<string> {
	const terminals = new Set(g.terminals);
	return new Set(
		g.productions.filter((p) => p.rhs.length === 1 && terminals.has(p.rhs[0])).map((p) => p.rhs[0])
	);
}

/**
 * The abbreviated tree of a shape, as on the dangling-else slides: a group is
 * drawn as its first keyword or operator (`if`, `+`) with only its
 * sub-expressions as children, so an `if` with two children is an if-then and
 * one with three an if-then-else. The other keywords and operators of the
 * group (`then`, `else`) are left out. A group without a keyword keeps the
 * name of its non-terminal.
 *
 * Leaves carry the token index in `start`, so the same labels apply as in the
 * full tree.
 */
export function abbreviate(shape: Shape, operands: ReadonlySet<string>): ParseNode {
	if (shape.kind === 'leaf')
		return {
			symbol: shape.symbol,
			terminal: true,
			children: [],
			start: shape.at,
			end: shape.at + 1
		};
	const isWord = (p: Shape) => p.kind === 'leaf' && !operands.has(p.symbol);
	const head = shape.parts.find(isWord);
	const children = shape.parts.filter((p) => !isWord(p)).map((p) => abbreviate(p, operands));
	const symbol = head ? head.symbol : shape.symbol;
	// A group of keywords only (`begin end`) is a leaf.
	if (children.length === 0) return { symbol, terminal: true, children: [] };
	return { symbol, terminal: false, children };
}

/** Number of nodes of each subtree. */
function sizes(tree: ParseNode): Map<ParseNode, number> {
	const out = new Map<ParseNode, number>();
	foldTree<number>(tree, (node, children) => {
		const size = children.reduce((sum, n) => sum + n, 1);
		out.set(node, size);
		return size;
	});
	return out;
}

/**
 * Orders the parse trees of one string as the slides draw them: the tree
 * whose leftmost subtree is larger comes first (the left-nested tree of
 * int + int + int before the right-nested one). When the leftmost subtrees
 * are equally large, the tree whose rightmost subtree is smaller comes first
 * (the dangling else: the tree with the else on the outer if), and after
 * that the children are compared the same way, left to right. Trees that
 * still tie keep their order.
 */
export function orderTrees(trees: readonly ParseNode[]): ParseNode[] {
	const size = new Map<ParseNode, number>();
	for (const tree of trees) for (const [node, n] of sizes(tree)) size.set(node, n);
	const edge = (node: ParseNode, last: boolean): number => {
		const child = node.children[last ? node.children.length - 1 : 0];
		return child ? size.get(child)! : 0;
	};
	const compare = (a: ParseNode, b: ParseNode): number => {
		const pairs: [ParseNode, ParseNode][] = [[a, b]];
		while (pairs.length > 0) {
			const [x, y] = pairs.pop()!;
			const left = edge(y, false) - edge(x, false);
			if (left !== 0) return left;
			const right = edge(x, true) - edge(y, true);
			if (right !== 0) return right;
			// Pushed right to left, so the leftmost children are compared next.
			for (let i = Math.min(x.children.length, y.children.length) - 1; i >= 0; i--)
				pairs.push([x.children[i], y.children[i]]);
		}
		return 0;
	};
	return trees
		.map((tree, index) => ({ tree, index }))
		.sort((a, b) => compare(a.tree, b.tree) || a.index - b.index)
		.map(({ tree }) => tree);
}
