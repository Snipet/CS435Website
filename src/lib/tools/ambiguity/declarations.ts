/**
 * Precedence and associativity declarations (bison's %left, %right and
 * %nonassoc) applied to the parse trees of an ambiguous grammar.
 *
 * Declarations are listed one per line, lowest precedence first: operators on
 * a later line bind tighter, and operators on one line share a precedence and
 * an associativity. They apply to productions of the form A → A op A. A tree
 * violates the declarations when, at a node for such a production,
 *
 * - an operand is itself built with an operator that binds less tightly
 *   (`%left +` then `%left *`: a + cannot be an operand of *), or
 * - an operand on the wrong side is built with an operator of the same
 *   precedence: the right operand for %left, the left operand for %right,
 *   either operand for %nonassoc.
 *
 * An operand is looked at through single productions (E → T) but not through
 * parentheses: `( E )` is never a violation. Operators without a declaration
 * are not restricted.
 */
import { tokenizeInput, type Grammar, type ParseNode, type Production } from '$lib/theory/grammar';

export type Assoc = 'left' | 'right' | 'nonassoc';
export const ASSOCS: readonly Assoc[] = ['left', 'right', 'nonassoc'];

/** One declaration line: `%left + -`. */
export interface Declaration {
	assoc: Assoc;
	/** Operators separated by spaces, written as in a grammar (`+ -`, `"=="`). */
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

/** The operators of one line, read with the lexing of grammar symbols (`+-` is + and -). */
export function operatorsOf(text: string): string[] {
	return tokenizeInput(text, []).tokens;
}

/** `%left + -`, as bison writes a declaration. */
export function printDeclaration(d: Declaration): string {
	return `%${d.assoc} ${operatorsOf(d.ops).join(' ')}`.trimEnd();
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
		const ops = operatorsOf(decl.ops);
		if (ops.length === 0) problems.push(`Line ${line} declares no operator.`);
		for (const op of new Set(ops)) {
			const earlier = rules.get(op);
			if (earlier) {
				problems.push(
					earlier.line === line
						? `${op} is listed twice on line ${line}.`
						: `${op} is already declared on line ${earlier.line}; line ${line} does not change it.`
				);
				continue;
			}
			rules.set(op, { level, assoc: decl.assoc, line });
			if (terminals && !terminals.has(op))
				problems.push(`${op} on line ${line} is not a terminal of the grammar.`);
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

/** The operator of a production of the form A → B op C (B and C non-terminals, op a terminal). */
export function binaryOperator(g: Grammar, p: Production | undefined): string | null {
	if (!p || p.rhs.length !== 3) return null;
	const n = nonterminalsOf(g);
	const [left, op, right] = p.rhs;
	return n.has(left) && !n.has(op) && n.has(right) ? op : null;
}

/** The operators of the grammar's productions of the form A → B op C, in grammar order. */
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
			const marks = [
				[...path, 1],
				[...operand.path, 1]
			];
			if (innerRule.level < rule.level) {
				out.push({
					kind: 'precedence',
					path,
					operator: op,
					operand: inner,
					side,
					message: `${op} binds tighter than ${inner}, so ${inner} cannot be an operand of ${op}`,
					marks
				});
			} else if (
				innerRule.level === rule.level &&
				(rule.assoc === 'nonassoc' || (rule.assoc === 'left') === (side === 'right'))
			) {
				out.push({
					kind: 'associativity',
					path,
					operator: op,
					operand: inner,
					side,
					message: associativityMessage(op, inner, rule.assoc, side),
					marks
				});
			}
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

/** Applies the declarations to every tree of a string. */
export function filterTrees(
	g: Grammar,
	trees: readonly ParseNode[],
	lines: readonly Declaration[]
): Filtered {
	const precedence = readDeclarations(lines, g);
	const found = trees.map((tree) => violations(g, tree, precedence));
	return {
		violations: found,
		kept: found.flatMap((v, i) => (v.length === 0 ? [i] : [])),
		undeclared: binaryOperators(g).filter((op) => !precedence.rules.has(op)),
		problems: precedence.problems
	};
}

/** The distinct reasons a tree is crossed out, in order. */
export function reasons(found: readonly Violation[]): string[] {
	return [...new Set(found.map((v) => v.message))];
}
