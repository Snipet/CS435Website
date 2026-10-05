/**
 * Precedence and associativity declarations (bison's %left, %right and
 * %nonassoc) applied to the parse trees of an ambiguous grammar.
 *
 * Declarations are listed one per line, lowest precedence first: operators on
 * a later line bind tighter, and operators on one line share a precedence and
 * an associativity. They apply to productions of the form A → A op A, the
 * productions that make a grammar of binary operators ambiguous. A production
 * such as E → E + T is left alone: it already fixes how + groups, and bison
 * uses declarations only where two parses are possible. A tree violates the
 * declarations when, at a node for a production A → A op A,
 *
 * - an operand is itself built with an operator that binds less tightly
 *   (`%left +` then `%left *`: a + cannot be an operand of *), or
 * - an operand on the wrong side is built with an operator of the same
 *   precedence: the right operand for %left, the left operand for %right,
 *   either operand for %nonassoc.
 *
 * An operand is looked at through single productions (E → S) but not through
 * parentheses: `( E )` is never a violation. Operators without a declaration
 * are not restricted.
 *
 * `filterTrees` checks trees that are given. `allowedTrees` finds the trees
 * the declarations allow without listing the others, which is what makes the
 * answer independent of how many trees a string has.
 */
import {
	cycles,
	makeGrammar,
	parseTrees,
	printSymbols,
	type Grammar,
	type ParseNode,
	type Production
} from '$lib/theory/grammar';
import { operatorWords, operatorsOf } from './operators';
import { foldTree } from './shape';

export { operatorsOf };

export type Assoc = 'left' | 'right' | 'nonassoc';
export const ASSOCS: readonly Assoc[] = ['left', 'right', 'nonassoc'];

/** One declaration line: `%left + -`. */
export interface Declaration {
	assoc: Assoc;
	/** Operators separated by spaces (`+ -`, `== !=`); see operators.ts. */
	ops: string;
}

export interface OperatorRule {
	/** 0 for the first line; a larger level binds tighter. */
	level: number;
	assoc: Assoc;
	/** 1-based number of the declaration line. */
	line: number;
}

export interface Precedence {
	rules: Map<string, OperatorRule>;
	problems: string[];
}

/**
 * `%left + -`, as bison writes a declaration. An operator of several
 * characters is in quotes, as it is in the grammar: `%left "==" "!="`.
 */
export function printDeclaration(d: Declaration): string {
	const ops = operatorsOf(d.ops);
	return ops.length === 0 ? `%${d.assoc}` : `%${d.assoc} ${printSymbols(ops)}`;
}

/**
 * The precedence level and associativity of every declared operator. An
 * operator declared again keeps its first declaration. With a grammar, an
 * operator that is not one of its terminals is reported.
 */
export function readDeclarations(lines: readonly Declaration[], g?: Grammar | null): Precedence {
	const rules = new Map<string, OperatorRule>();
	const problems: string[] = [];
	const terminals = g ? new Set(g.terminals) : null;
	lines.forEach((decl, level) => {
		const line = level + 1;
		const words = operatorWords(decl.ops);
		if (words.length === 0) problems.push(`Line ${line} declares no operator.`);
		const listed = new Set<string>();
		for (const { name: op, parts } of words) {
			// Listed twice on one line: once is enough.
			if (listed.has(op)) continue;
			listed.add(op);
			const earlier = rules.get(op);
			if (earlier) {
				problems.push(
					`${op} is already declared on line ${earlier.line}; line ${line} does not change it.`
				);
				continue;
			}
			rules.set(op, { level, assoc: decl.assoc, line });
			if (terminals && !terminals.has(op)) {
				// `+-` for the two operators + and -: say how to write them.
				const split =
					new Set(parts).size === parts.length &&
					parts.length > 1 &&
					parts.every((part) => terminals.has(part));
				problems.push(
					`${op} on line ${line} is not a terminal of the grammar.` +
						(split ? ` Write ${parts.join(' ')} with spaces.` : '')
				);
			}
		}
	});
	return { rules, problems };
}

const nonterminalSets = new WeakMap<Grammar, Set<string>>();
function nonterminalsOf(g: Grammar): Set<string> {
	let set = nonterminalSets.get(g);
	if (!set) nonterminalSets.set(g, (set = new Set(g.nonterminals)));
	return set;
}

/** The operator of a production of the form A → A op A (op a terminal); null for any other. */
export function binaryOperator(g: Grammar, p: Production | undefined): string | null {
	if (!p || p.rhs.length !== 3) return null;
	const [left, op, right] = p.rhs;
	return left === p.lhs && right === p.lhs && !nonterminalsOf(g).has(op) ? op : null;
}

/** The operators of the grammar's productions of the form A → A op A, in grammar order. */
export function binaryOperators(g: Grammar): string[] {
	return [...new Set(g.productions.map((p) => binaryOperator(g, p)).filter((op) => op !== null))];
}

export interface Violation {
	kind: 'precedence' | 'associativity';
	/** Path of the node whose operand is not allowed. */
	path: number[];
	/** The operator at that node and the operator of the offending operand. */
	operator: string;
	operand: string;
	side: 'left' | 'right';
	message: string;
	/** Paths of the two operator leaves, for marking them in the tree. */
	marks: number[][];
}

const ASSOC_WORD: Record<Assoc, string> = {
	left: 'left-associative',
	right: 'right-associative',
	nonassoc: 'non-associative'
};

function associativityMessage(op: string, operand: string, assoc: Assoc, side: string): string {
	const where = assoc === 'nonassoc' ? `an operand of ${op}` : `the ${side} operand of ${op}`;
	if (op === operand) return `${op} is ${ASSOC_WORD[assoc]}, so ${where} cannot be another ${op}`;
	return `${op} and ${operand} have the same precedence and are ${ASSOC_WORD[assoc]}, so ${where} cannot be a ${operand}`;
}

/**
 * What is wrong with an operand built with an operator of rule `inner` on
 * `side` of an operator of rule `outer`, if anything.
 */
function clash(
	outer: OperatorRule,
	inner: OperatorRule,
	side: 'left' | 'right'
): Violation['kind'] | null {
	if (inner.level < outer.level) return 'precedence';
	if (inner.level > outer.level) return null;
	return outer.assoc === 'nonassoc' || (outer.assoc === 'left') === (side === 'right')
		? 'associativity'
		: null;
}

/**
 * Every place where `tree` breaks the declarations, top-down and left to
 * right. An empty list means the declarations allow the tree.
 */
export function violations(g: Grammar, tree: ParseNode, precedence: Precedence): Violation[] {
	const out: Violation[] = [];
	const operatorOf = (node: ParseNode): string | null =>
		node.terminal || node.production === undefined
			? null
			: binaryOperator(g, g.productions[node.production]);
	/** The node an operand is built at: below any chain of single productions. */
	const operandNode = (node: ParseNode, path: number[]): { node: ParseNode; path: number[] } => {
		let at = node;
		let where = path;
		while (!at.terminal && at.children.length === 1 && !at.children[0].terminal) {
			at = at.children[0];
			where = [...where, 0];
		}
		return { node: at, path: where };
	};
	const stack: { node: ParseNode; path: number[] }[] = [{ node: tree, path: [] }];
	while (stack.length > 0) {
		const { node, path } = stack.pop()!;
		for (let i = node.children.length - 1; i >= 0; i--)
			stack.push({ node: node.children[i], path: [...path, i] });
		const op = operatorOf(node);
		const rule = op === null ? undefined : precedence.rules.get(op);
		if (op === null || !rule) continue;
		for (const side of ['left', 'right'] as const) {
			const index = side === 'left' ? 0 : 2;
			const operand = operandNode(node.children[index], [...path, index]);
			const inner = operatorOf(operand.node);
			const innerRule = inner === null ? undefined : precedence.rules.get(inner);
			if (inner === null || !innerRule) continue;
			const kind = clash(rule, innerRule, side);
			if (kind === null) continue;
			out.push({
				kind,
				path,
				operator: op,
				operand: inner,
				side,
				message:
					kind === 'precedence'
						? `${op} binds tighter than ${inner}, so ${inner} cannot be an operand of ${op}`
						: associativityMessage(op, inner, rule.assoc, side),
				marks: [
					[...path, 1],
					[...operand.path, 1]
				]
			});
		}
	}
	return out;
}

export interface Filtered {
	/** Per tree, in the order given: its violations (none: the tree is kept). */
	violations: Violation[][];
	/** Indices of the trees the declarations allow. */
	kept: number[];
	/** Operators of A → A op A productions that no line declares. */
	undeclared: string[];
	problems: string[];
}

/** Applies declarations that have been read to the trees given. */
export function filterWith(
	g: Grammar,
	trees: readonly ParseNode[],
	precedence: Precedence
): Filtered {
	const found = trees.map((tree) => violations(g, tree, precedence));
	return {
		violations: found,
		kept: found.flatMap((v, i) => (v.length === 0 ? [i] : [])),
		undeclared: binaryOperators(g).filter((op) => !precedence.rules.has(op)),
		problems: precedence.problems
	};
}

/** Applies the declarations to the trees given. */
export function filterTrees(
	g: Grammar,
	trees: readonly ParseNode[],
	lines: readonly Declaration[]
): Filtered {
	return filterWith(g, trees, readDeclarations(lines, g));
}

/** The distinct reasons a tree is crossed out, in order. */
export function reasons(found: readonly Violation[]): string[] {
	return [...new Set(found.map((v) => v.message))];
}

// ─────────────────────── the trees the declarations allow ───────────────────────

/**
 * A grammar whose parse trees are the trees of another grammar that the
 * declarations allow.
 */
export interface Restricted {
	grammar: Grammar;
	/** Per production of `grammar`: the id of the production of the original grammar it stands for. */
	origin: number[];
	/** Per non-terminal of `grammar`: the non-terminal of the original grammar it stands for. */
	names: Map<string, string>;
}

/**
 * The declarations written into the grammar. A non-terminal is copied once
 * for each set of productions it may not be built with: the operands of
 * A → A op A get the copies of A without the productions whose operator
 * binds less tightly, or equally tightly on the wrong side, and a single
 * production (E → S) hands its restriction on to S. Everything else refers to
 * the unrestricted non-terminals, which keep their names.
 *
 * Returns null when the declarations restrict nothing: no production of the
 * form A → A op A has a declared operator.
 */
export function restrictGrammar(g: Grammar, precedence: Precedence): Restricted | null {
	const rules = g.productions.map((p) => {
		const op = binaryOperator(g, p);
		return op === null ? undefined : precedence.rules.get(op);
	});
	if (rules.every((rule) => rule === undefined)) return null;
	const isNonterminal = nonterminalsOf(g);
	const byLhs = new Map<string, Production[]>(g.nonterminals.map((name) => [name, []]));
	for (const p of g.productions) byLhs.get(p.lhs)!.push(p);

	/** The productions an operand on `side` of production `p` may not be built with. */
	const banned = (p: number, side: 'left' | 'right'): number[] =>
		rules.flatMap((inner, q) => (inner && clash(rules[p]!, inner, side) !== null ? [q] : []));

	interface Copy {
		name: string;
		of: string;
		banned: readonly number[];
	}
	const copies = new Map<string, Copy>();
	const queue: Copy[] = [];
	const used = new Set([...g.nonterminals, ...g.terminals]);
	const copyOf = (of: string, without: readonly number[]): string => {
		const key = JSON.stringify([of, without]);
		let copy = copies.get(key);
		if (!copy) {
			let name = of;
			if (without.length > 0) for (name = `${of}·${copies.size}`; used.has(name);) name += '·';
			used.add(name);
			copy = { name, of, banned: without };
			copies.set(key, copy);
			queue.push(copy);
		}
		return copy.name;
	};

	const productions: { lhs: string; rhs: string[] }[] = [];
	const originOf = new Map<string, number>();
	copyOf(g.start, []);
	// The queue grows as copies are referred to; the start symbol's productions come first.
	for (let next = 0; next < queue.length; next++) {
		const copy = queue[next];
		for (const p of byLhs.get(copy.of)!) {
			if (copy.banned.includes(p.id)) continue;
			let rhs: string[];
			if (rules[p.id])
				rhs = [copyOf(p.lhs, banned(p.id, 'left')), p.rhs[1], copyOf(p.lhs, banned(p.id, 'right'))];
			else if (p.rhs.length === 1 && isNonterminal.has(p.rhs[0]))
				rhs = [copyOf(p.rhs[0], copy.banned)];
			else rhs = p.rhs.map((symbol) => (isNonterminal.has(symbol) ? copyOf(symbol, []) : symbol));
			productions.push({ lhs: copy.name, rhs });
			originOf.set(JSON.stringify([copy.name, rhs]), p.id);
		}
	}
	const grammar = makeGrammar(productions);
	return {
		grammar,
		origin: grammar.productions.map((p) => originOf.get(JSON.stringify([p.lhs, p.rhs]))!),
		names: new Map(queue.map((copy) => [copy.name, copy.of]))
	};
}

/**
 * A node of the tree has the non-terminal and the tokens of one of its
 * ancestors: parseTrees leaves such trees out (they exist only for a grammar
 * with a cycle).
 */
function repeatsAncestor(tree: ParseNode): boolean {
	interface Step {
		node: ParseNode;
		up: Step | null;
	}
	const open: Step[] = [{ node: tree, up: null }];
	while (open.length > 0) {
		const step = open.pop()!;
		const { node } = step;
		if (node.terminal) continue;
		for (
			let up = step.up;
			up && up.node.start === node.start && up.node.end === node.end;
			up = up.up
		)
			if (up.node.symbol === node.symbol) return true;
		for (const child of node.children) open.push({ node: child, up: step });
	}
	return false;
}

/**
 * The parse trees of `tokens` that the declarations allow, up to `limit`, in
 * no particular order; `truncated` says there are more. They are the trees
 * `filterWith` keeps out of all the trees of the string, found by parsing
 * with the restricted grammar, so the time does not grow with the number of
 * trees that are crossed out.
 *
 * Returns null when the declarations restrict nothing (every tree is allowed).
 */
export function allowedTrees(
	g: Grammar,
	tokens: readonly string[],
	precedence: Precedence,
	limit: number
): { trees: ParseNode[]; truncated: boolean } | null {
	const restricted = restrictGrammar(g, precedence);
	if (!restricted) return null;
	const found = parseTrees(restricted.grammar, tokens, { limit });
	let trees = found.trees.map((tree) =>
		foldTree<ParseNode>(tree, (node, children) =>
			node.terminal
				? node
				: {
						...node,
						symbol: restricted.names.get(node.symbol) ?? node.symbol,
						production: restricted.origin[node.production!],
						children
					}
		)
	);
	// Copies of one non-terminal count as different symbols for the parser.
	if (cycles(g).length > 0) trees = trees.filter((tree) => !repeatsAncestor(tree));
	return { trees, truncated: found.truncated };
}

/**
 * The trees of `tokens` in which no right operand of an operator is built
 * with an operator: the left-nested tree of `int + int * int + int`. Empty
 * for a grammar without productions of the form A → A op A.
 */
export function leftNestedTrees(g: Grammar, tokens: readonly string[], limit: number): ParseNode[] {
	const rule: OperatorRule = { level: 0, assoc: 'left', line: 1 };
	const rules = new Map(binaryOperators(g).map((op) => [op, rule]));
	return allowedTrees(g, tokens, { rules, problems: [] }, limit)?.trees ?? [];
}
