/**
 * The abstract syntax tree of a C- program.
 *
 * Every node has a span and an id. Ids are numbered from 0 in preorder (a node
 * before its children, children left to right), so the same source text always
 * gives the same ids and the id of a node is also its line in `astLines`.
 * Parentheses leave no node: `(a + b) * c` is a `*` whose left child is the `+`.
 */
import type { SourceSpan } from './tokens';

export type TypeSpec = 'int' | 'void';
export type ArithOp = '+' | '-' | '*' | '/';
export type RelOp = '<' | '<=' | '>' | '>=' | '==' | '!=';
export type BinaryOp = ArithOp | RelOp;

interface NodeBase {
	id: number;
	span: SourceSpan;
}

export interface Program extends NodeBase {
	kind: 'Program';
	decls: Decl[];
}

/** `int x;` (size null) or `int x[10];`. */
export interface VarDecl extends NodeBase {
	kind: 'VarDecl';
	typeSpec: TypeSpec;
	name: string;
	nameSpan: SourceSpan;
	/** The NUM of an array declaration; null for a simple variable. */
	size: number | null;
	sizeSpan: SourceSpan | null;
}

export interface FunDecl extends NodeBase {
	kind: 'FunDecl';
	returnType: TypeSpec;
	name: string;
	nameSpan: SourceSpan;
	/** From the type specifier through the closing parenthesis of the parameters. */
	headSpan: SourceSpan;
	/** Empty for a parameter list written `void`. */
	params: Param[];
	body: Compound;
}

/** `int x` or `int x[]`. */
export interface Param extends NodeBase {
	kind: 'Param';
	typeSpec: TypeSpec;
	name: string;
	nameSpan: SourceSpan;
	isArray: boolean;
}

export interface Compound extends NodeBase {
	kind: 'Compound';
	locals: VarDecl[];
	body: Stmt[];
	/** The closing brace. */
	closeSpan: SourceSpan;
}

export interface If extends NodeBase {
	kind: 'If';
	test: Expr;
	then: Stmt;
	else: Stmt | null;
	/** `if ( expression )`. */
	headSpan: SourceSpan;
	/** The `else` keyword. */
	elseSpan: SourceSpan | null;
}

export interface While extends NodeBase {
	kind: 'While';
	test: Expr;
	body: Stmt;
	/** `while ( expression )`. */
	headSpan: SourceSpan;
}

export interface Return extends NodeBase {
	kind: 'Return';
	value: Expr | null;
}

/** `expression ;`, or the empty statement `;` (expr null). */
export interface ExprStmt extends NodeBase {
	kind: 'ExprStmt';
	expr: Expr | null;
}

export interface Assign extends NodeBase {
	kind: 'Assign';
	target: Var | Index;
	value: Expr;
}

export interface Binary extends NodeBase {
	kind: 'Binary';
	op: BinaryOp;
	opSpan: SourceSpan;
	left: Expr;
	right: Expr;
}

/** A name used alone: a variable, or a whole array passed as an argument. */
export interface Var extends NodeBase {
	kind: 'Var';
	name: string;
}

/** `name [ index ]`. */
export interface Index extends NodeBase {
	kind: 'Index';
	name: string;
	nameSpan: SourceSpan;
	index: Expr;
}

export interface Call extends NodeBase {
	kind: 'Call';
	name: string;
	nameSpan: SourceSpan;
	args: Expr[];
}

export interface Num extends NodeBase {
	kind: 'Num';
	value: number;
	/** The digits as written. */
	text: string;
}

export type Decl = VarDecl | FunDecl;
export type Stmt = Compound | If | While | Return | ExprStmt;
export type Expr = Assign | Binary | Var | Index | Call | Num;
export type AstNode = Program | Decl | Param | Stmt | Expr;
export type NodeKind = AstNode['kind'];

const ARITH = new Set<string>(['+', '-', '*', '/']);
export const isArithOp = (op: string): op is ArithOp => ARITH.has(op);
export const isRelOp = (op: BinaryOp): op is RelOp => !ARITH.has(op);

/** The children of a node, in source order. */
export function childrenOf(node: AstNode): AstNode[] {
	switch (node.kind) {
		case 'Program':
			return node.decls;
		case 'FunDecl':
			return [...node.params, node.body];
		case 'Compound':
			return [...node.locals, ...node.body];
		case 'If':
			return node.else ? [node.test, node.then, node.else] : [node.test, node.then];
		case 'While':
			return [node.test, node.body];
		case 'Return':
			return node.value ? [node.value] : [];
		case 'ExprStmt':
			return node.expr ? [node.expr] : [];
		case 'Assign':
			return [node.target, node.value];
		case 'Binary':
			return [node.left, node.right];
		case 'Index':
			return [node.index];
		case 'Call':
			return node.args;
		case 'VarDecl':
		case 'Param':
		case 'Var':
		case 'Num':
			return [];
	}
}

/** Visits `root` and everything under it in preorder. */
export function walk(
	root: AstNode,
	visit: (node: AstNode, depth: number, parent: AstNode | null) => void
): void {
	const go = (node: AstNode, depth: number, parent: AstNode | null) => {
		visit(node, depth, parent);
		for (const child of childrenOf(node)) go(child, depth + 1, node);
	};
	go(root, 0, null);
}

/** Numbers the nodes under `root` in preorder, starting at `first`. Returns the next free id. */
export function numberNodes(root: AstNode, first = 0): number {
	let next = first;
	walk(root, (node) => {
		node.id = next++;
	});
	return next;
}

/** Every node under `root`, in preorder. */
export function allNodes(root: AstNode): AstNode[] {
	const out: AstNode[] = [];
	walk(root, (node) => out.push(node));
	return out;
}

/** The node with the given id, or null. */
export function findNode(root: AstNode, id: number): AstNode | null {
	let found: AstNode | null = null;
	walk(root, (node) => {
		if (node.id === id) found = node;
	});
	return found;
}

/** The innermost node whose span contains the source offset, or null. */
export function nodeAt(root: AstNode, offset: number): AstNode | null {
	let best: AstNode | null = null;
	walk(root, (node) => {
		if (offset >= node.span.start && offset < node.span.end) best = node;
	});
	return best;
}

/** One line of the printed tree: "VarDecl int a[10]", "Binary +", "Var x". */
export function nodeLabel(node: AstNode): string {
	switch (node.kind) {
		case 'Program':
			return 'Program';
		case 'VarDecl':
			return `VarDecl ${node.typeSpec} ${node.name}${node.size === null ? '' : `[${node.size}]`}`;
		case 'FunDecl':
			return `FunDecl ${node.returnType} ${node.name}`;
		case 'Param':
			return `Param ${node.typeSpec} ${node.name}${node.isArray ? '[]' : ''}`;
		case 'Compound':
			return 'Compound';
		case 'If':
			return 'If';
		case 'While':
			return 'While';
		case 'Return':
			return 'Return';
		case 'ExprStmt':
			return node.expr ? 'ExprStmt' : 'ExprStmt ;';
		case 'Assign':
			return 'Assign =';
		case 'Binary':
			return `Binary ${node.op}`;
		case 'Var':
			return `Var ${node.name}`;
		case 'Index':
			return `Index ${node.name}`;
		case 'Call':
			return `Call ${node.name}`;
		case 'Num':
			return `Num ${node.text}`;
	}
}

export interface AstLine {
	/** Id of the node on this line. */
	id: number;
	depth: number;
	label: string;
	span: SourceSpan;
}

/** The tree as lines, one node per line in preorder. */
export function astLines(root: AstNode): AstLine[] {
	const lines: AstLine[] = [];
	walk(root, (node, depth) =>
		lines.push({ id: node.id, depth, label: nodeLabel(node), span: node.span })
	);
	return lines;
}

/** The tree as indented text, one node per line. */
export function printAst(root: AstNode, opts: { indent?: string } = {}): string {
	const indent = opts.indent ?? '  ';
	return astLines(root)
		.map((l) => indent.repeat(l.depth) + l.label)
		.join('\n');
}

/**
 * The expression as C- text with the least parentheses that keep its
 * structure: `a - (b - c)`, `(a = b) + 1`, `x = y = 3`.
 */
export function printExpr(e: Expr): string {
	const level = (x: Expr): number => {
		if (x.kind === 'Assign') return 0;
		if (x.kind !== 'Binary') return 4;
		if (x.op === '*' || x.op === '/') return 3;
		return x.op === '+' || x.op === '-' ? 2 : 1;
	};
	const wrap = (x: Expr, min: number) => (level(x) < min ? `(${printExpr(x)})` : printExpr(x));
	switch (e.kind) {
		case 'Num':
			return e.text;
		case 'Var':
			return e.name;
		case 'Index':
			return `${e.name}[${printExpr(e.index)}]`;
		case 'Call':
			return `${e.name}(${e.args.map(printExpr).join(', ')})`;
		case 'Assign':
			return `${printExpr(e.target)} = ${printExpr(e.value)}`;
		case 'Binary': {
			const l = level(e);
			// + - * / associate to the left; a relational operator takes additive operands.
			return `${wrap(e.left, l === 1 ? 2 : l)} ${e.op} ${wrap(e.right, l + 1)}`;
		}
	}
}
