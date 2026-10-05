/**
 * Derivations and parse trees.
 *
 * A derivation replaces one non-terminal per step (Introduction to Parsing,
 * slides 18–19); the strings along the way are sentential forms. A parse tree
 * records the same replacements without their order, so one tree has one
 * leftmost and one rightmost derivation.
 *
 * Trees may be partial: a non-terminal node without `production` has not been
 * expanded yet and counts as a leaf.
 *
 * Nothing here recurses on the tree, so a tree of any depth is fine.
 */
import {
	EPSILON,
	type Derivation,
	type DerivationStep,
	type Grammar,
	type ParseNode,
	type Production,
	type SententialForm
} from './types';

/**
 * One derivation step: `form` with the non-terminal at `index` replaced by the
 * right-hand side of `p`. Throws when that position does not hold `p.lhs`.
 */
export function applyStep(form: SententialForm, index: number, p: Production): SententialForm {
	if (form[index] !== p.lhs)
		throw new Error(`applyStep: position ${index} holds ${form[index] ?? 'nothing'}, not ${p.lhs}`);
	return [...form.slice(0, index), ...p.rhs, ...form.slice(index + 1)];
}

/** Positions of the non-terminals in a sentential form, left to right. */
export function nonterminalPositions(g: Grammar, form: SententialForm): number[] {
	const isNonterminal = new Set(g.nonterminals);
	return form.flatMap((symbol, i) => (isNonterminal.has(symbol) ? [i] : []));
}

const expanded = (node: ParseNode): boolean => !node.terminal && node.production !== undefined;

/**
 * The leftmost or rightmost derivation that builds `tree`, starting from its
 * root symbol. Unexpanded non-terminals of a partial tree stay in the forms.
 */
export function derivationFromTree(
	g: Grammar,
	tree: ParseNode,
	order: 'leftmost' | 'rightmost'
): Derivation {
	const frontier: ParseNode[] = [tree];
	let form: SententialForm = [tree.symbol];
	const steps: DerivationStep[] = [];
	const leftmost = order === 'leftmost';
	let i = 0;
	while (i >= 0 && i < frontier.length) {
		const node = frontier[i];
		if (!expanded(node)) {
			i += leftmost ? 1 : -1;
			continue;
		}
		const p = g.productions[node.production!];
		if (!p || p.lhs !== node.symbol || p.rhs.length !== node.children.length)
			throw new Error(
				`derivationFromTree: node ${node.symbol} does not match production ${node.production}`
			);
		form = applyStep(form, i, p);
		frontier.splice(i, 1, ...node.children);
		steps.push({ index: i, production: p.id, form });
		// Leftmost: the first new symbol is next. Rightmost: the last new symbol is next.
		if (!leftmost) i += p.rhs.length - 1;
	}
	return { start: [tree.symbol], steps };
}

/** Sets the token range of every node of a tree whose leaves are all terminals. */
function numberLeaves(root: ParseNode): void {
	let at = 0;
	/** The nodes being numbered, root first, each with the number of its children that are done. */
	const open: { node: ParseNode; done: number }[] = [];
	const enter = (node: ParseNode): void => {
		node.start = at;
		if (node.terminal) node.end = ++at;
		else open.push({ node, done: 0 });
	};
	enter(root);
	while (open.length > 0) {
		const top = open[open.length - 1];
		if (top.done < top.node.children.length) enter(top.node.children[top.done++]);
		else {
			top.node.end = at;
			open.pop();
		}
	}
}

/**
 * The parse tree a derivation builds. The derivation starts from one symbol
 * and may stop early: non-terminals it has not replaced are leaves without a
 * `production`. When it reaches a sentence, nodes carry their token ranges.
 * Throws on a step that does not fit (wrong position or production).
 */
export function treeFromDerivation(g: Grammar, d: Derivation): ParseNode {
	if (d.start.length !== 1)
		throw new Error('treeFromDerivation: the derivation must start from a single symbol');
	const isNonterminal = new Set(g.nonterminals);
	const leaf = (symbol: string): ParseNode => ({
		symbol,
		terminal: !isNonterminal.has(symbol),
		children: []
	});
	const root = leaf(d.start[0]);
	const frontier = [root];
	d.steps.forEach((step, n) => {
		const node = frontier[step.index];
		const p = g.productions[step.production];
		if (!node || !p || node.symbol !== p.lhs)
			throw new Error(`treeFromDerivation: step ${n + 1} does not apply to the form before it`);
		node.production = p.id;
		node.children = p.rhs.map(leaf);
		frontier.splice(step.index, 1, ...node.children);
	});
	if (frontier.every((node) => node.terminal)) numberLeaves(root);
	return root;
}

/**
 * The leaves of a tree, left to right: its sentence, or for a partial tree
 * its fringe with the unexpanded non-terminals. A node for an ε-production
 * contributes nothing.
 */
export function yieldOf(tree: ParseNode): string[] {
	const out: string[] = [];
	const stack = [tree];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.terminal || !expanded(node)) out.push(node.symbol);
		else for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
	}
	return out;
}

/** Same shape, symbols and productions; token ranges are not compared. */
export function treeEquals(a: ParseNode, b: ParseNode): boolean {
	const pairs: [ParseNode, ParseNode][] = [[a, b]];
	while (pairs.length > 0) {
		const [x, y] = pairs.pop()!;
		if (
			x.symbol !== y.symbol ||
			x.terminal !== y.terminal ||
			x.production !== y.production ||
			x.children.length !== y.children.length
		)
			return false;
		x.children.forEach((child, i) => pairs.push([child, y.children[i]]));
	}
	return true;
}

/**
 * A tree on one line: `E( E(int) + E( E(int) + E(int) ) )`. A node whose
 * children are all leaves is written tight, `E(int)`; an ε-production is
 * `S(ε)`; an unexpanded non-terminal is just its name.
 */
export function bracketForm(tree: ParseNode): string {
	const isLeaf = (node: ParseNode): boolean => node.terminal || !expanded(node);
	if (isLeaf(tree)) return tree.symbol;
	/** The nodes being written, root first, each with the text of the children that are done. */
	const open: { node: ParseNode; done: number; inner: string }[] = [
		{ node: tree, done: 0, inner: '' }
	];
	for (;;) {
		const top = open[open.length - 1];
		const { node } = top;
		let text: string;
		if (top.done < node.children.length) {
			const child = node.children[top.done];
			if (!isLeaf(child)) {
				open.push({ node: child, done: 0, inner: '' });
				continue;
			}
			text = child.symbol;
		} else {
			if (node.children.length === 0) text = `${node.symbol}(${EPSILON})`;
			else if (node.children.every(isLeaf)) text = `${node.symbol}(${top.inner})`;
			else text = `${node.symbol}( ${top.inner} )`;
			open.pop();
			if (open.length === 0) return text;
		}
		const parent = open[open.length - 1];
		parent.inner += parent.done === 0 ? text : ` ${text}`;
		parent.done++;
	}
}
