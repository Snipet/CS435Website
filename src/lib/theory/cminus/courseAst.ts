/**
 * The syntax tree in the node classes and fields of the course's C- AST:
 * ProgramNode, FunctionDeclarationNode, IfStatementNode, AdditiveExpressionNode,
 * … with the fields each class declares, the fields of its base class first.
 *
 * The engine keeps its own tree (`ast.ts`, with short kinds); this module maps
 * it, node for node, to plain data for a view. Every engine node becomes one
 * course node with the same id and span, and the children come in the same
 * order, so preorder ids, spans and the selection carry over unchanged.
 *
 *   Program → ProgramNode                VarDecl → VariableDeclarationNode, ArrayDeclarationNode
 *   FunDecl → FunctionDeclarationNode    Param → ParameterNode
 *   Compound If While For Return ExprStmt → CompoundStatementNode … ExpressionStatementNode
 *   Assign → AssignmentExpressionNode    Var → VariableExpressionNode
 *   Index → SubscriptExpressionNode      Call → CallExpressionNode
 *   Binary → AdditiveExpressionNode (+ -), MultiplicativeExpressionNode (* /),
 *            RelationalExpressionNode (< <= > >= == !=)
 *   Unary → UnaryExpressionNode          Num → IntegerLiteralExpressionNode
 *
 * ValueType: VOID or INT for a function's return type and a simple variable or
 * parameter, ARRAY for an int array declaration or array parameter (a void
 * one keeps VOID, which the semantic analyzer rejects).
 *
 * Two fields are set by later phases. `nestLevel` of a declaration is set when
 * the symbol table is built: the depth of the scope that declares it (0 global,
 * 1 a function's parameters and the locals of its body, 2 and up nested
 * blocks). `framePointerOffset` is set by the code generator: the offset from
 * fp of a local variable or a parameter (of element 0 for an array). The
 * header declares it on VariableDeclarationNode, whose comment places
 * parameters at fp offsets too, so ParameterNode carries it here as well. A
 * global variable is not in a frame: its value is `global`, with its offset
 * from gp. Until the compilation has reached the phase, the field is `unset`.
 */
import type { AstNode, BinaryOp, IncOp, Program, TypeSpec } from './ast';
import type { CodegenResult } from './codegen';
import type { SemanticResult } from './semantic';
import type { SourceSpan } from './tokens';

export type CourseClass =
	| 'ProgramNode'
	| 'FunctionDeclarationNode'
	| 'VariableDeclarationNode'
	| 'ArrayDeclarationNode'
	| 'ParameterNode'
	| 'CompoundStatementNode'
	| 'IfStatementNode'
	| 'WhileStatementNode'
	| 'ForStatementNode'
	| 'ReturnStatementNode'
	| 'ExpressionStatementNode'
	| 'AssignmentExpressionNode'
	| 'VariableExpressionNode'
	| 'SubscriptExpressionNode'
	| 'CallExpressionNode'
	| 'AdditiveExpressionNode'
	| 'MultiplicativeExpressionNode'
	| 'RelationalExpressionNode'
	| 'UnaryExpressionNode'
	| 'IntegerLiteralExpressionNode';

export type ValueType = 'VOID' | 'INT' | 'ARRAY';
export type AdditiveOperatorType = 'PLUS' | 'MINUS';
export type MultiplicativeOperatorType = 'TIMES' | 'DIVIDE';
export type RelationalOperatorType = 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ' | 'NEQ';
export type UnaryOperatorType = 'INCREMENT' | 'DECREMENT';

export type CourseEnum =
	| 'ValueType'
	| 'AdditiveOperatorType'
	| 'MultiplicativeOperatorType'
	| 'RelationalOperatorType'
	| 'UnaryOperatorType';

/** The phase that sets a field the parser leaves unset. */
export type SettingPhase = 'semantic' | 'codegen';

export type CourseValue =
	/** A pointer to a node. */
	| { kind: 'node'; node: CourseNode }
	/** A vector of nodes (possibly empty). */
	| { kind: 'list'; nodes: CourseNode[] }
	/** A null pointer: an optional part that is not there. */
	| { kind: 'null' }
	| { kind: 'enum'; type: CourseEnum; value: string }
	| { kind: 'string'; value: string }
	| { kind: 'int'; value: number }
	| { kind: 'bool'; value: boolean }
	/** Set by `phase`, which the compilation has not reached. */
	| { kind: 'unset'; phase: SettingPhase }
	/** framePointerOffset of a global variable: it has no frame; it is at offset(gp). */
	| { kind: 'global'; offset: number };

export interface CourseField {
	name: string;
	value: CourseValue;
}

export interface CourseNode {
	/** The id of the engine's node: its preorder number. */
	id: number;
	/** The class of the node. */
	node: CourseClass;
	span: SourceSpan;
	/** The fields of the class, in the order the header declares them (base class first). */
	fields: CourseField[];
}

/** The fields of every class, base class first, in the order of the header. */
export const COURSE_FIELDS: Readonly<Record<CourseClass, readonly string[]>> = {
	ProgramNode: ['declarations'],
	FunctionDeclarationNode: ['valueType', 'identifier', 'nestLevel', 'parameters', 'functionBody'],
	VariableDeclarationNode: ['valueType', 'identifier', 'nestLevel', 'framePointerOffset'],
	ArrayDeclarationNode: ['valueType', 'identifier', 'nestLevel', 'framePointerOffset', 'size'],
	ParameterNode: ['valueType', 'identifier', 'nestLevel', 'isArray', 'framePointerOffset'],
	CompoundStatementNode: ['localDeclarations', 'statements'],
	IfStatementNode: ['conditionalExpression', 'thenStatement', 'elseStatement'],
	WhileStatementNode: ['conditionalExpression', 'body'],
	ForStatementNode: ['initializer', 'condition', 'updater', 'body'],
	ReturnStatementNode: ['expression'],
	ExpressionStatementNode: ['expression'],
	AssignmentExpressionNode: ['variable', 'expression'],
	VariableExpressionNode: ['identifier'],
	SubscriptExpressionNode: ['identifier', 'index'],
	CallExpressionNode: ['identifier', 'arguments'],
	AdditiveExpressionNode: ['addOperator', 'left', 'right'],
	MultiplicativeExpressionNode: ['multOperator', 'left', 'right'],
	RelationalExpressionNode: ['relationalOperator', 'left', 'right'],
	UnaryExpressionNode: ['unaryOperator', 'variable'],
	IntegerLiteralExpressionNode: ['value']
};

const ADDITIVE: Partial<Record<BinaryOp, AdditiveOperatorType>> = { '+': 'PLUS', '-': 'MINUS' };
const MULTIPLICATIVE: Partial<Record<BinaryOp, MultiplicativeOperatorType>> = {
	'*': 'TIMES',
	'/': 'DIVIDE'
};
const RELATIONAL: Partial<Record<BinaryOp, RelationalOperatorType>> = {
	'<': 'LT',
	'<=': 'LTE',
	'>': 'GT',
	'>=': 'GTE',
	'==': 'EQ',
	'!=': 'NEQ'
};
const UNARY: Record<IncOp, UnaryOperatorType> = { '++': 'INCREMENT', '--': 'DECREMENT' };

/** The class an engine node maps to. */
export function courseClass(node: AstNode): CourseClass {
	switch (node.kind) {
		case 'Program':
			return 'ProgramNode';
		case 'FunDecl':
			return 'FunctionDeclarationNode';
		case 'VarDecl':
			return node.size === null ? 'VariableDeclarationNode' : 'ArrayDeclarationNode';
		case 'Param':
			return 'ParameterNode';
		case 'Compound':
			return 'CompoundStatementNode';
		case 'If':
			return 'IfStatementNode';
		case 'While':
			return 'WhileStatementNode';
		case 'For':
			return 'ForStatementNode';
		case 'Return':
			return 'ReturnStatementNode';
		case 'ExprStmt':
			return 'ExpressionStatementNode';
		case 'Assign':
			return 'AssignmentExpressionNode';
		case 'Var':
			return 'VariableExpressionNode';
		case 'Index':
			return 'SubscriptExpressionNode';
		case 'Call':
			return 'CallExpressionNode';
		case 'Binary':
			if (ADDITIVE[node.op]) return 'AdditiveExpressionNode';
			return MULTIPLICATIVE[node.op] ? 'MultiplicativeExpressionNode' : 'RelationalExpressionNode';
		case 'Unary':
			return 'UnaryExpressionNode';
		case 'Num':
			return 'IntegerLiteralExpressionNode';
	}
}

/** The operator of a Binary node, as the header's enum names it: "PLUS", "LTE", … */
function operatorOf(op: BinaryOp): { field: string; type: CourseEnum; value: string } {
	const add = ADDITIVE[op];
	if (add) return { field: 'addOperator', type: 'AdditiveOperatorType', value: add };
	const mult = MULTIPLICATIVE[op];
	if (mult) return { field: 'multOperator', type: 'MultiplicativeOperatorType', value: mult };
	return { field: 'relationalOperator', type: 'RelationalOperatorType', value: RELATIONAL[op]! };
}

/**
 * A short label for a drawing of the tree: the class and the field that tells
 * nodes of one class apart. "FunctionDeclarationNode gcd",
 * "AdditiveExpressionNode PLUS", "IntegerLiteralExpressionNode 0", "IfStatementNode".
 */
export function courseLabel(node: AstNode): string {
	const name = courseClass(node);
	switch (node.kind) {
		case 'FunDecl':
		case 'VarDecl':
		case 'Param':
		case 'Var':
		case 'Index':
		case 'Call':
			return `${name} ${node.name}`;
		case 'Binary':
			return `${name} ${operatorOf(node.op).value}`;
		case 'Unary':
			return `${name} ${UNARY[node.op]}`;
		case 'Num':
			return `${name} ${node.value}`;
		default:
			return name;
	}
}

const valueType = (spec: TypeSpec, array: boolean): ValueType =>
	spec === 'void' ? 'VOID' : array ? 'ARRAY' : 'INT';

export interface CourseAstOptions {
	/** The semantic analyzer's result, when it ran: it sets nestLevel. */
	semantic?: SemanticResult | null;
	/** The code generator's result, when it ran: it sets framePointerOffset. */
	codegen?: CodegenResult | null;
}

/**
 * The tree in the course's classes. Without `semantic` the nestLevel fields
 * are unset, without `codegen` the framePointerOffset fields.
 */
export function courseAst(program: Program, opts: CourseAstOptions = {}): CourseNode {
	const semantic = opts.semantic ?? null;
	const codegen = opts.codegen ?? null;
	/** Symbol id → framePointerOffset (a number) or the offset from gp of a global. */
	const frameOffsets = new Map<number, number>();
	const globalOffsets = new Map<number, number>();
	if (codegen) {
		for (const frame of codegen.frames)
			for (const slot of frame.slots)
				if (slot.symbol !== null) frameOffsets.set(slot.symbol, slot.offset);
		for (const slot of codegen.globals.slots) globalOffsets.set(slot.symbol, slot.offset);
	}
	const symbolOf = (node: AstNode) => semantic?.refs.get(node.id);

	const nestLevel = (node: AstNode): CourseValue => {
		const id = symbolOf(node);
		return id === undefined || !semantic
			? { kind: 'unset', phase: 'semantic' }
			: { kind: 'int', value: semantic.symbols[id].depth };
	};
	const framePointerOffset = (node: AstNode): CourseValue => {
		const id = symbolOf(node);
		if (!codegen || id === undefined) return { kind: 'unset', phase: 'codegen' };
		const offset = frameOffsets.get(id);
		if (offset !== undefined) return { kind: 'int', value: offset };
		const global = globalOffsets.get(id);
		return global !== undefined
			? { kind: 'global', offset: global }
			: { kind: 'unset', phase: 'codegen' };
	};

	const field = (name: string, value: CourseValue): CourseField => ({ name, value });
	const one = (node: AstNode | null): CourseValue =>
		node ? { kind: 'node', node: build(node) } : { kind: 'null' };
	const many = (nodes: readonly AstNode[]): CourseValue => ({
		kind: 'list',
		nodes: nodes.map(build)
	});
	const enumOf = (type: CourseEnum, value: string): CourseValue => ({ kind: 'enum', type, value });
	const text = (value: string): CourseValue => ({ kind: 'string', value });

	function fieldsOf(node: AstNode): CourseField[] {
		switch (node.kind) {
			case 'Program':
				return [field('declarations', many(node.decls))];
			case 'FunDecl':
				return [
					field('valueType', enumOf('ValueType', valueType(node.returnType, false))),
					field('identifier', text(node.name)),
					field('nestLevel', nestLevel(node)),
					field('parameters', many(node.params)),
					field('functionBody', one(node.body))
				];
			case 'VarDecl': {
				const out = [
					field('valueType', enumOf('ValueType', valueType(node.typeSpec, node.size !== null))),
					field('identifier', text(node.name)),
					field('nestLevel', nestLevel(node)),
					field('framePointerOffset', framePointerOffset(node))
				];
				if (node.size !== null) out.push(field('size', { kind: 'int', value: node.size }));
				return out;
			}
			case 'Param':
				return [
					field('valueType', enumOf('ValueType', valueType(node.typeSpec, node.isArray))),
					field('identifier', text(node.name)),
					field('nestLevel', nestLevel(node)),
					field('isArray', { kind: 'bool', value: node.isArray }),
					field('framePointerOffset', framePointerOffset(node))
				];
			case 'Compound':
				return [
					field('localDeclarations', many(node.locals)),
					field('statements', many(node.body))
				];
			case 'If':
				return [
					field('conditionalExpression', one(node.test)),
					field('thenStatement', one(node.then)),
					field('elseStatement', one(node.else))
				];
			case 'While':
				return [field('conditionalExpression', one(node.test)), field('body', one(node.body))];
			case 'For':
				return [
					field('initializer', one(node.init)),
					field('condition', one(node.test)),
					field('updater', one(node.update)),
					field('body', one(node.body))
				];
			case 'Return':
				return [field('expression', one(node.value))];
			case 'ExprStmt':
				return [field('expression', one(node.expr))];
			case 'Assign':
				return [field('variable', one(node.target)), field('expression', one(node.value))];
			case 'Var':
				return [field('identifier', text(node.name))];
			case 'Index':
				return [field('identifier', text(node.name)), field('index', one(node.index))];
			case 'Call':
				return [field('identifier', text(node.name)), field('arguments', many(node.args))];
			case 'Binary': {
				const op = operatorOf(node.op);
				return [
					field(op.field, enumOf(op.type, op.value)),
					field('left', one(node.left)),
					field('right', one(node.right))
				];
			}
			case 'Unary':
				return [
					field('unaryOperator', enumOf('UnaryOperatorType', UNARY[node.op])),
					field('variable', one(node.target))
				];
			case 'Num':
				return [field('value', { kind: 'int', value: node.value })];
		}
	}

	function build(node: AstNode): CourseNode {
		return { id: node.id, node: courseClass(node), span: node.span, fields: fieldsOf(node) };
	}

	return build(program);
}

export interface CourseChild {
	/** The field that holds the child: "conditionalExpression", or "statements[2]" in a vector. */
	field: string;
	node: CourseNode;
}

/** The nodes a node points to, in the order of its fields. */
export function courseChildren(node: CourseNode): CourseChild[] {
	const out: CourseChild[] = [];
	for (const f of node.fields) {
		if (f.value.kind === 'node') out.push({ field: f.name, node: f.value.node });
		else if (f.value.kind === 'list')
			f.value.nodes.forEach((child, i) => out.push({ field: `${f.name}[${i}]`, node: child }));
	}
	return out;
}

/**
 * The fields of a node that are drawn on its own line: every field but a
 * pointer to a node and a vector that holds nodes (those are its children).
 * A null pointer and an empty vector are listed here.
 */
export function courseAttributes(node: CourseNode): CourseField[] {
	return node.fields.filter(
		(f) => f.value.kind !== 'node' && !(f.value.kind === 'list' && f.value.nodes.length > 0)
	);
}

/** A field's value on one line: "INT", "gcd", "-2", "true", "nullptr", "empty", "not set". */
export function courseValueText(value: CourseValue): string {
	switch (value.kind) {
		case 'node':
			return value.node.node;
		case 'list':
			return value.nodes.length ? `${value.nodes.length} nodes` : 'empty';
		case 'null':
			return 'nullptr';
		case 'enum':
		case 'string':
			return value.value;
		case 'int':
			return String(value.value);
		case 'bool':
			return String(value.value);
		case 'unset':
			return 'not set';
		case 'global':
			return `none: global, at ${value.offset}(gp)`;
	}
}

/** Visits the tree in preorder with the field each node is held in (null at the root). */
export function walkCourse(
	root: CourseNode,
	visit: (node: CourseNode, depth: number, field: string | null) => void
): void {
	const go = (node: CourseNode, depth: number, field: string | null) => {
		visit(node, depth, field);
		for (const child of courseChildren(node)) go(child.node, depth + 1, child.field);
	};
	go(root, 0, null);
}

/**
 * The tree as indented text, one node per line: the field that holds it, its
 * class, then its other fields.
 *
 *   ProgramNode
 *     declarations[0]: FunctionDeclarationNode valueType INT, identifier gcd, nestLevel 0
 */
export function printCourseAst(root: CourseNode, opts: { indent?: string } = {}): string {
	const indent = opts.indent ?? '  ';
	const lines: string[] = [];
	walkCourse(root, (node, depth, field) => {
		const attrs = courseAttributes(node)
			.map((f) => `${f.name} ${courseValueText(f.value)}`)
			.join(', ');
		lines.push(
			`${indent.repeat(depth)}${field ? `${field}: ` : ''}${node.node}${attrs ? ` ${attrs}` : ''}`
		);
	});
	return lines.join('\n');
}
