/**
 * The Visitor design pattern on the course's C- AST (`courseAst.ts`).
 *
 * The course's header declares `IVisitor`, with one `visit` overload per node
 * class, and `Node::accept (IVisitor*)`, which every class defines as
 * `visitor->visit (this)`. A call `child->accept (this)` therefore dispatches
 * twice: `accept` is virtual, so the node's own class picks the `accept` that
 * runs; inside it `this` has that class as its type, so the compiler picks the
 * `visit` overload of that class, and `visit` is virtual, so the visitor's
 * class picks the code that runs.
 *
 * This module holds three visitors written in the header's style (their C++
 * is data: lines with ids) and runs them on a course tree. The run is a list
 * of events: each `accept` call, each `visit` call, each stretch of the
 * visitor's code between calls, and each return, with the node, the field it
 * was reached through, the call depth, the lines that run, and the visitor's
 * state after the event. Every visitor visits every node, children in the
 * order the header declares the fields, so the visit events are a preorder
 * walk of the tree.
 *
 *   PrintVisitor        the tree as an indented outline
 *   SymbolTableVisitor  scopes, nestLevel, undeclared and repeated names
 *   ConstantFolder      the value of every operator node whose operands are constants
 *
 * Pure and plain data: a trace survives a structured clone.
 */
import type { ArithOp, RelOp } from './ast';
import { courseValueText, type CourseClass, type CourseNode, type CourseValue } from './courseAst';
import { arith, compare } from './runtime';

// ---------------------------------------------------------------------------
// The classes of the header
// ---------------------------------------------------------------------------

/** The classes of the header that no node of a tree has: the abstract bases. */
export type AbstractClass = 'Node' | 'DeclarationNode' | 'StatementNode' | 'ExpressionNode';
/** Every class of the header. */
export type HeaderClass = CourseClass | AbstractClass;

/** The class each class derives from, as the header declares it. */
export const BASE_CLASS: Readonly<Record<HeaderClass, HeaderClass | null>> = {
	Node: null,
	ProgramNode: 'Node',
	DeclarationNode: 'Node',
	FunctionDeclarationNode: 'DeclarationNode',
	VariableDeclarationNode: 'DeclarationNode',
	ArrayDeclarationNode: 'VariableDeclarationNode',
	ParameterNode: 'DeclarationNode',
	StatementNode: 'Node',
	CompoundStatementNode: 'StatementNode',
	IfStatementNode: 'StatementNode',
	WhileStatementNode: 'StatementNode',
	ForStatementNode: 'StatementNode',
	ReturnStatementNode: 'StatementNode',
	ExpressionStatementNode: 'StatementNode',
	ExpressionNode: 'Node',
	AssignmentExpressionNode: 'ExpressionNode',
	VariableExpressionNode: 'ExpressionNode',
	SubscriptExpressionNode: 'VariableExpressionNode',
	CallExpressionNode: 'ExpressionNode',
	AdditiveExpressionNode: 'ExpressionNode',
	MultiplicativeExpressionNode: 'ExpressionNode',
	RelationalExpressionNode: 'ExpressionNode',
	UnaryExpressionNode: 'ExpressionNode',
	IntegerLiteralExpressionNode: 'ExpressionNode'
};

/** True when `cls` is `type` or derives from it: a `type*` can point to a `cls`. */
export function isA(cls: HeaderClass, type: HeaderClass): boolean {
	for (let c: HeaderClass | null = cls; c !== null; c = BASE_CLASS[c]) if (c === type) return true;
	return false;
}

/** The classes IVisitor has a `visit` overload for, in the order the header declares them. */
export const VISIT_OVERLOADS: readonly Exclude<HeaderClass, 'Node'>[] = [
	'ProgramNode',
	'DeclarationNode',
	'FunctionDeclarationNode',
	'VariableDeclarationNode',
	'ArrayDeclarationNode',
	'ParameterNode',
	'StatementNode',
	'CompoundStatementNode',
	'IfStatementNode',
	'WhileStatementNode',
	'ForStatementNode',
	'ReturnStatementNode',
	'ExpressionStatementNode',
	'ExpressionNode',
	'AssignmentExpressionNode',
	'VariableExpressionNode',
	'SubscriptExpressionNode',
	'CallExpressionNode',
	'AdditiveExpressionNode',
	'MultiplicativeExpressionNode',
	'RelationalExpressionNode',
	'UnaryExpressionNode',
	'IntegerLiteralExpressionNode'
];

const ABSTRACT_OVERLOADS = ['DeclarationNode', 'StatementNode', 'ExpressionNode'] as const;

/** The classes a node of a tree can have, in the header's order. */
export const CONCRETE_CLASSES = VISIT_OVERLOADS.filter(
	(c): c is CourseClass => !(ABSTRACT_OVERLOADS as readonly string[]).includes(c)
);

/**
 * A field of a class that points to other nodes: a pointer that is never
 * null, a pointer that may be `nullptr`, or a vector. `type` is the pointer
 * type the header declares (the element type of a vector); `item` names the
 * loop variable a visitor walks a vector with.
 */
export interface ChildField {
	name: string;
	type: HeaderClass;
	kind: 'pointer' | 'optional' | 'vector';
	item?: string;
}

const pointer = (name: string, type: HeaderClass): ChildField => ({ name, type, kind: 'pointer' });
const optional = (name: string, type: HeaderClass): ChildField => ({
	name,
	type,
	kind: 'optional'
});
const vector = (name: string, type: HeaderClass, item: string): ChildField => ({
	name,
	type,
	kind: 'vector',
	item
});

const OPERANDS = [pointer('left', 'ExpressionNode'), pointer('right', 'ExpressionNode')];

/** The fields of every class that point to nodes, in the header's order. */
export const CHILD_FIELDS: Readonly<Record<CourseClass, readonly ChildField[]>> = {
	ProgramNode: [vector('declarations', 'DeclarationNode', 'decl')],
	FunctionDeclarationNode: [
		vector('parameters', 'ParameterNode', 'param'),
		pointer('functionBody', 'CompoundStatementNode')
	],
	VariableDeclarationNode: [],
	ArrayDeclarationNode: [],
	ParameterNode: [],
	CompoundStatementNode: [
		vector('localDeclarations', 'VariableDeclarationNode', 'decl'),
		vector('statements', 'StatementNode', 'stmt')
	],
	IfStatementNode: [
		pointer('conditionalExpression', 'ExpressionNode'),
		pointer('thenStatement', 'StatementNode'),
		optional('elseStatement', 'StatementNode')
	],
	WhileStatementNode: [
		pointer('conditionalExpression', 'ExpressionNode'),
		pointer('body', 'StatementNode')
	],
	ForStatementNode: [
		optional('initializer', 'ExpressionNode'),
		optional('condition', 'ExpressionNode'),
		optional('updater', 'ExpressionNode'),
		pointer('body', 'StatementNode')
	],
	ReturnStatementNode: [optional('expression', 'ExpressionNode')],
	ExpressionStatementNode: [optional('expression', 'ExpressionNode')],
	AssignmentExpressionNode: [
		pointer('variable', 'VariableExpressionNode'),
		pointer('expression', 'ExpressionNode')
	],
	VariableExpressionNode: [],
	SubscriptExpressionNode: [pointer('index', 'ExpressionNode')],
	CallExpressionNode: [vector('arguments', 'ExpressionNode', 'arg')],
	AdditiveExpressionNode: OPERANDS,
	MultiplicativeExpressionNode: OPERANDS,
	RelationalExpressionNode: OPERANDS,
	UnaryExpressionNode: [pointer('variable', 'VariableExpressionNode')],
	IntegerLiteralExpressionNode: []
};

/** "an IfStatementNode", "a CallExpressionNode". */
export function withArticle(word: string): string {
	return `${/^[AEIOU]/.test(word) ? 'an' : 'a'} ${word}`;
}

function valueOf(node: CourseNode, name: string): CourseValue {
	const field = node.fields.find((f) => f.name === name);
	if (!field) throw new Error(`${node.node} has no field ${name}`);
	return field.value;
}

const textOf = (node: CourseNode, name: string) => courseValueText(valueOf(node, name));

/**
 * A node on one line: its class and its key fields, as PrintVisitor prints
 * it. "FunctionDeclarationNode INT gcd", "ArrayDeclarationNode ARRAY a[10]",
 * "AdditiveExpressionNode PLUS", "IntegerLiteralExpressionNode 0", "IfStatementNode".
 */
export function nodeSummary(node: CourseNode): string {
	const cls = node.node;
	switch (cls) {
		case 'FunctionDeclarationNode':
		case 'VariableDeclarationNode':
		case 'ParameterNode':
			return `${cls} ${textOf(node, 'valueType')} ${textOf(node, 'identifier')}`;
		case 'ArrayDeclarationNode':
			return `${cls} ${textOf(node, 'valueType')} ${textOf(node, 'identifier')}[${textOf(node, 'size')}]`;
		case 'VariableExpressionNode':
		case 'SubscriptExpressionNode':
		case 'CallExpressionNode':
			return `${cls} ${textOf(node, 'identifier')}`;
		case 'AdditiveExpressionNode':
			return `${cls} ${textOf(node, 'addOperator')}`;
		case 'MultiplicativeExpressionNode':
			return `${cls} ${textOf(node, 'multOperator')}`;
		case 'RelationalExpressionNode':
			return `${cls} ${textOf(node, 'relationalOperator')}`;
		case 'UnaryExpressionNode':
			return `${cls} ${textOf(node, 'unaryOperator')}`;
		case 'IntegerLiteralExpressionNode':
			return `${cls} ${textOf(node, 'value')}`;
		default:
			return cls;
	}
}

// ---------------------------------------------------------------------------
// Code as data
// ---------------------------------------------------------------------------

/** A line of C++ code; `id` names a line that events point to (null: a brace, a comment, …). */
export interface CodeLine {
	id: string | null;
	text: string;
}

const L = (text: string, id: string | null = null): CodeLine => ({ id, text });

/** The IVisitor class of the header; each overload's line has its class as id. */
export const IVISITOR_CODE: readonly CodeLine[] = [
	L('class IVisitor'),
	L('{'),
	L('public:'),
	...VISIT_OVERLOADS.flatMap((cls) => {
		const line = L(`  virtual void visit (${cls}* node) = 0;`, cls);
		// The header leaves a blank line before each group of classes.
		return cls === 'DeclarationNode' || cls === 'StatementNode' || cls === 'ExpressionNode'
			? [L(''), line]
			: [line];
	}),
	L('};')
];

/**
 * The definition of `accept` in a class, as every class of the header
 * defines it. Ids: `accept.sig` (entered), `accept.visit` (the call of visit).
 */
export function acceptCode(cls: CourseClass): CodeLine[] {
	return [
		L(`void ${cls}::accept (IVisitor* visitor)`, 'accept.sig'),
		L('{'),
		L('  visitor->visit (this);', 'accept.visit'),
		L('}')
	];
}

/** The calls of `accept` on the children of a node, field by field: a statement, a null check or a loop. */
function childLines(cls: CourseClass, indent = '    '): CodeLine[] {
	return CHILD_FIELDS[cls].flatMap((f) => fieldLines(cls, f, indent));
}

function fieldLines(cls: CourseClass, f: ChildField, indent = '    '): CodeLine[] {
	const id = `${cls}.${f.name}`;
	switch (f.kind) {
		case 'pointer':
			return [L(`${indent}node->${f.name}->accept (this);`, id)];
		case 'optional':
			return [
				L(`${indent}if (node->${f.name} != nullptr)`, `${id}.if`),
				L(`${indent}  node->${f.name}->accept (this);`, id)
			];
		case 'vector':
			return [
				L(`${indent}for (${f.type}* ${f.item} : node->${f.name})`, `${id}.for`),
				L(`${indent}  ${f.item}->accept (this);`, id)
			];
	}
}

/** A visit method: its signature (`X.sig`), its body, its closing brace (`X.end`). */
function method(cls: CourseClass, body: readonly CodeLine[]): CodeLine[] {
	return [
		L(''),
		L(`  void visit (${cls}* node) override`, `${cls}.sig`),
		L('  {'),
		...body,
		L('  }', `${cls}.end`)
	];
}

const ABSTRACT_METHODS: CodeLine[] = [
	L(''),
	L('  // No node is only a DeclarationNode, a StatementNode or an'),
	L('  // ExpressionNode, so these three are never called.'),
	...ABSTRACT_OVERLOADS.map((cls) => L(`  void visit (${cls}* node) override { }`))
];

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

export const VISITOR_IDS = ['print', 'symbols', 'fold'] as const;
export type VisitorId = (typeof VISITOR_IDS)[number];

/** A named value of the visitor's state or of a call's local variables. */
export interface VisitorValue {
	name: string;
	value: string;
}

/**
 * What a visitor has produced, one record per thing: a line of the outline,
 * a scope opened, a name declared or looked up, an error, a folded value.
 */
export type VisitorOutput =
	| { kind: 'print'; node: number; level: number; text: string }
	/** enterScope: `node` is the function or block that opens it, null for the global scope. */
	| { kind: 'scope'; scope: number; level: number; node: number | null }
	/** A name put in the table of `scope`; `node` is null for input and output. */
	| {
			kind: 'declare';
			node: number | null;
			name: string;
			nodeClass: CourseClass | null;
			level: number;
			scope: number;
	  }
	/** A name looked up: its declaration (null: predefined or not declared) and nestLevel (null: not declared). */
	| {
			kind: 'use';
			node: number;
			name: string;
			declaration: number | null;
			level: number | null;
	  }
	| { kind: 'error'; node: number; message: string }
	/** `left op right = value` for an operator node whose operands are constants. */
	| { kind: 'fold'; node: number; op: string; left: number; right: number; value: number };

export type VisitEventKind = 'accept' | 'visit' | 'line' | 'return';

export interface VisitEvent {
	/**
	 * `accept`: a call of `accept` on the node. `visit`: its `accept` calls
	 * `visitor->visit (this)`. `line`: lines of the visit method of the node run
	 * (between two calls). `return`: the visit method and `accept` return.
	 */
	kind: VisitEventKind;
	/** Id of the node (the engine's preorder id). */
	node: number;
	/** Its class: the class whose `accept` runs and whose overload of `visit` is chosen. */
	nodeClass: CourseClass;
	/**
	 * `accept`: the type of the pointer the call goes through (`StatementNode`
	 * for thenStatement; `ProgramNode` at the root). `visit`: the type of
	 * `this` in accept, which picks the overload (the node's class). Null otherwise.
	 */
	pointer: HeaderClass | null;
	/**
	 * `accept` and `visit`: the field the node was reached through,
	 * "IfStatementNode::thenStatement", "CompoundStatementNode::statements[1]";
	 * null at the root and for the other kinds.
	 */
	field: string | null;
	/** Calls of accept in progress below this one: 0 at the root, the node's depth in the tree. */
	depth: number;
	/** Ids of the visitor's lines that run (`accept`: the call, then its loop or null check). */
	lines: string[];
	/** Ids of the lines of a helper method the step runs (print, declare, use, enterScope, …). */
	helper: string[];
	/** What the event does. */
	text: string;
	/** Index of the event that opened the innermost call after this event; -1 when none is open. */
	top: number;
	/** `accept` and `visit`: index of the event that opened the call under this one (-1 at the root). */
	below: number;
	/** The visitor's member variables after the event, in the order of `VisitorInfo.members`. */
	members: string[];
	/** The local variables of the innermost visit method after the event. */
	locals: VisitorValue[];
	/** How many records of `VisitTrace.output` exist after the event. */
	output: number;
	/** SymbolTableVisitor: the scopes open after the event, outermost first; [] for the others. */
	scopes: number[];
}

export interface VisitTrace {
	visitor: VisitorId;
	events: VisitEvent[];
	/** Every record, in the order made; an event's `output` counts the first ones. */
	output: VisitorOutput[];
	/** Records made before the first event (the global scope with input and output). */
	initial: number;
	/** The members before the first event. */
	members: string[];
	/** The trace stopped at `maxEvents`. */
	truncated: boolean;
}

/** Events a trace holds at most. */
export const DEFAULT_MAX_EVENTS = 200_000;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

class Stop {}

const NO_SCOPES: number[] = [];
const NO_LOCALS: VisitorValue[] = [];

interface Frame {
	/** Index of the accept event and of the visit event of this call. */
	accept: number;
	visit: number;
	node: CourseNode;
	locals: VisitorValue[];
	/** Lines run just before the method returns, shown with the return. */
	trailing: { lines: string[]; text: string; change?: () => void } | null;
}

interface Implementation<S> {
	init(run: Run<S>): S;
	members(state: S): string[];
	scopes?(state: S): number[];
	visit(node: CourseNode, run: Run<S>): void;
}

const sameValues = <T>(a: readonly T[], b: readonly T[]) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

class Run<S> {
	readonly events: VisitEvent[] = [];
	readonly output: VisitorOutput[] = [];
	readonly nodes: CourseNode[] = [];
	state!: S;
	private readonly frames: Frame[] = [];
	private top = -1;
	private members: string[] = [];
	private scopes: number[] = NO_SCOPES;

	constructor(
		private readonly impl: Implementation<S>,
		readonly info: VisitorInfo,
		tree: CourseNode,
		private readonly maxEvents: number
	) {
		const index = (node: CourseNode) => {
			this.nodes[node.id] = node;
			for (const f of node.fields) {
				if (f.value.kind === 'node') index(f.value.node);
				else if (f.value.kind === 'list') f.value.nodes.forEach(index);
			}
		};
		index(tree);
	}

	start(): S {
		this.state = this.impl.init(this);
		this.members = this.impl.members(this.state);
		this.scopes = this.impl.scopes?.(this.state) ?? NO_SCOPES;
		return this.state;
	}

	emit(record: VisitorOutput): void {
		this.output.push(record);
	}

	private push(
		event: Omit<VisitEvent, 'top' | 'members' | 'locals' | 'output' | 'scopes' | 'helper'> & {
			helper?: string[];
		}
	): void {
		if (this.events.length >= this.maxEvents) throw new Stop();
		const members = this.impl.members(this.state);
		if (!sameValues(members, this.members)) this.members = members;
		const scopes = this.impl.scopes?.(this.state) ?? NO_SCOPES;
		if (!sameValues(scopes, this.scopes)) this.scopes = scopes;
		const frame = this.frames[this.frames.length - 1];
		this.events.push({
			helper: [],
			...event,
			top: this.top,
			members: this.members,
			locals: frame ? frame.locals : NO_LOCALS,
			output: this.output.length,
			scopes: this.scopes
		});
	}

	private get frame(): Frame {
		return this.frames[this.frames.length - 1];
	}

	/** Straight-line code of the current visit method; `change` runs before the event is recorded. */
	line(lines: string[], text: string, change?: () => void, helper: string[] = []): void {
		change?.();
		const node = this.frame.node;
		this.push({
			kind: 'line',
			node: node.id,
			nodeClass: node.node,
			pointer: null,
			field: null,
			depth: this.frames.length - 1,
			lines,
			helper,
			text,
			below: -1
		});
	}

	/** Sets a local variable of the current visit method. */
	local(name: string, value: string): void {
		const frame = this.frame;
		frame.locals = [...frame.locals.filter((v) => v.name !== name), { name, value }];
	}

	/** Code that runs right before the current method returns; it is shown with the return. */
	atReturn(lines: string[], text: string, change?: () => void): void {
		this.frame.trailing = { lines, text, change };
	}

	/** The child fields of `node`, in order. */
	children(node: CourseNode): void {
		for (const f of CHILD_FIELDS[node.node]) this.child(node, f.name);
	}

	/** One child field of `node`: its accept calls, or the event that finds nullptr or an empty vector. */
	child(node: CourseNode, name: string): void {
		const f = CHILD_FIELDS[node.node].find((c) => c.name === name);
		if (!f) throw new Error(`${node.node} has no child field ${name}`);
		const value = valueOf(node, name);
		const id = `${node.node}.${name}`;
		if (f.kind === 'vector') {
			const items = value.kind === 'list' ? value.nodes : [];
			if (!items.length) {
				this.line([`${id}.for`], `node->${name} is empty: nothing to visit.`);
				return;
			}
			items.forEach((item, i) => {
				const what = `${f.item} (${name}[${i}])`;
				this.call(item, {
					field: `${node.node}::${name}[${i}]`,
					pointer: f.type,
					lines: [id, `${id}.for`],
					call: `${f.item}->accept (this)`,
					what
				});
			});
			return;
		}
		if (value.kind !== 'node') {
			if (f.kind === 'pointer') throw new Error(`${node.node}::${name} is null`);
			this.line([`${id}.if`], `node->${name} is nullptr: nothing to visit.`);
			return;
		}
		this.call(value.node, {
			field: `${node.node}::${name}`,
			pointer: f.type,
			lines: f.kind === 'optional' ? [id, `${id}.if`] : [id],
			call: `node->${name}->accept (this)`,
			what: name
		});
	}

	/** The traversal: the driver's `program->accept (&visitor)`. */
	root(tree: CourseNode): void {
		this.call(tree, {
			field: null,
			pointer: tree.node,
			lines: ['main.accept'],
			call: `program->accept (&${this.info.instance})`,
			what: 'program',
			caller: this.info.driver
		});
	}

	private call(
		node: CourseNode,
		via: {
			field: string | null;
			pointer: HeaderClass;
			lines: string[];
			call: string;
			what: string;
			caller?: string;
		}
	): void {
		const cls = node.node;
		const depth = this.frames.length;
		const below = this.top;
		const dispatch =
			via.pointer === cls
				? `${via.what} is ${withArticle(`${cls}*`)}, so ${cls}::accept runs.`
				: `${via.what} is ${withArticle(`${via.pointer}*`)}; accept is virtual, and the node is ${withArticle(cls)}, so ${cls}::accept runs.`;
		// The call is open once the event is recorded: it is the event's own `top`.
		const accept = this.events.length;
		this.top = accept;
		this.push({
			kind: 'accept',
			node: node.id,
			nodeClass: cls,
			pointer: via.pointer,
			field: via.field,
			depth,
			lines: via.lines,
			text: `${via.caller ? `${via.caller} calls ` : ''}${via.call}: ${dispatch}`,
			below
		});
		const frame: Frame = { accept, visit: -1, node, locals: NO_LOCALS, trailing: null };
		this.frames.push(frame);
		const visitor = this.info.name;
		frame.visit = this.events.length;
		this.top = frame.visit;
		this.push({
			kind: 'visit',
			node: node.id,
			nodeClass: cls,
			pointer: cls,
			field: via.field,
			depth,
			lines: [`${cls}.sig`],
			text: `${cls}::accept calls visitor->visit (this). this is ${withArticle(`${cls}*`)}, so the overload visit (${cls}*) is chosen; visit is virtual, so ${visitor}::visit (${cls}*) runs.`,
			below: accept
		});
		this.impl.visit(node, this);
		const trailing = frame.trailing;
		trailing?.change?.();
		this.frames.pop();
		this.top = below;
		const back = via.caller ?? 'its caller';
		this.push({
			kind: 'return',
			node: node.id,
			nodeClass: cls,
			pointer: null,
			field: null,
			depth,
			lines: [...(trailing?.lines ?? []), `${cls}.end`],
			text: `${trailing ? `${trailing.text} ` : ''}${visitor}::visit (${cls}*) returns, and ${cls}::accept returns to ${back}.`,
			below: -1
		});
	}
}

// ---------------------------------------------------------------------------
// The visitors
// ---------------------------------------------------------------------------

export interface VisitorInfo {
	id: VisitorId;
	/** The C++ class: "PrintVisitor". */
	name: string;
	/** What it does, in a few words: "Print the tree". */
	title: string;
	/** What it does, in a sentence. */
	summary: string;
	/** The function that runs it and the name of the visitor object in it. */
	driver: string;
	instance: string;
	/** Names of the member variables an event's `members` lists. */
	members: readonly string[];
	/** Its C++ code, the driver function last. */
	code: readonly CodeLine[];
}

const str = (node: CourseNode, name: string) => textOf(node, name);

// --- PrintVisitor ------------------------------------------------------------

/** The print call of a class's visit method: one or two lines (`X.print`, `X.print2`). */
function printCall(cls: CourseClass): CodeLine[] {
	const id = `${cls}.print`;
	switch (cls) {
		case 'FunctionDeclarationNode':
		case 'VariableDeclarationNode':
			return [
				L(`    print ("${cls} " + name (node->valueType)`, id),
				L('           + " " + node->identifier);', `${id}2`)
			];
		case 'ArrayDeclarationNode':
			return [
				L(`    print ("${cls} " + name (node->valueType) + " "`, id),
				L('           + node->identifier + "[" + to_string (node->size) + "]");', `${id}2`)
			];
		case 'ParameterNode':
			return [L(`    print ("${cls} " + name (node->valueType) + " " + node->identifier);`, id)];
		case 'VariableExpressionNode':
		case 'SubscriptExpressionNode':
		case 'CallExpressionNode':
			return [L(`    print ("${cls} " + node->identifier);`, id)];
		case 'AdditiveExpressionNode':
			return [L(`    print ("${cls} " + name (node->addOperator));`, id)];
		case 'MultiplicativeExpressionNode':
			return [L(`    print ("${cls} " + name (node->multOperator));`, id)];
		case 'RelationalExpressionNode':
			return [L(`    print ("${cls} " + name (node->relationalOperator));`, id)];
		case 'UnaryExpressionNode':
			return [L(`    print ("${cls} " + name (node->unaryOperator));`, id)];
		case 'IntegerLiteralExpressionNode':
			return [L(`    print ("${cls} " + to_string (node->value));`, id)];
		default:
			return [L(`    print ("${cls}");`, id)];
	}
}

const PRINT_CODE: CodeLine[] = [
	L('// Prints the tree as an outline: a line per node with its class and'),
	L('// its key fields, two spaces deeper for each level of the tree.'),
	L('// name (e) is the name of an enumerator: name (ValueType::INT) is "INT".'),
	L('struct PrintVisitor : IVisitor'),
	L('{'),
	L('  int level = 0;'),
	L('  string out;'),
	L(''),
	L('  void print (string text)', 'print.sig'),
	L('  {'),
	L(`    out += string (2 * level, ' ') + text + "\\n";`, 'print.body'),
	L('  }'),
	...CONCRETE_CLASSES.flatMap((cls) =>
		method(
			cls,
			CHILD_FIELDS[cls].length
				? [
						...printCall(cls),
						L('    ++level;', `${cls}.in`),
						...childLines(cls),
						L('    --level;', `${cls}.out`)
					]
				: printCall(cls)
		)
	),
	...ABSTRACT_METHODS,
	L('};'),
	L(''),
	L('void printTree (ProgramNode* program)'),
	L('{'),
	L('  PrintVisitor printer;'),
	L('  program->accept (&printer);', 'main.accept'),
	L('  cout << printer.out;'),
	L('}')
];

const PRINT_INFO: VisitorInfo = {
	id: 'print',
	name: 'PrintVisitor',
	title: 'Print the tree',
	summary: 'Prints the tree as an outline: a line per node with its class and key fields.',
	driver: 'printTree',
	instance: 'printer',
	members: ['level'],
	code: PRINT_CODE
};

interface PrintState {
	level: number;
}

/** Ids of the lines of each class's print call. */
const PRINT_LINES = Object.fromEntries(
	CONCRETE_CLASSES.map((cls) => [cls, printCall(cls).map((l) => l.id!)])
) as Record<CourseClass, string[]>;

const PRINT: Implementation<PrintState> = {
	init: () => ({ level: 0 }),
	members: (s) => [String(s.level)],
	visit(node, run) {
		const s = run.state;
		const cls = node.node;
		const text = nodeSummary(node);
		const hasChildren = CHILD_FIELDS[cls].length > 0;
		const level = s.level;
		run.line(
			hasChildren ? [...PRINT_LINES[cls], `${cls}.in`] : PRINT_LINES[cls],
			`Prints "${text}" at level ${level}${hasChildren ? `; ++level makes the level ${level + 1} for its children` : ''}.`,
			() => {
				run.emit({ kind: 'print', node: node.id, level, text });
				if (hasChildren) s.level++;
			},
			['print.sig', 'print.body']
		);
		if (!hasChildren) return;
		run.children(node);
		run.atReturn([`${cls}.out`], `--level: back to level ${level}.`, () => s.level--);
	}
};

// --- SymbolTableVisitor -------------------------------------------------------

const SYMBOLS_CODE: CodeLine[] = [
	L('// Builds the symbol table while it walks the tree: a table per open'),
	L('// scope, the innermost last. It sets nestLevel on every declaration'),
	L('// (0 global, 1 the parameters and the top of a function body, 2 and up'),
	L('// nested blocks) and checks that a name is declared before it is used'),
	L('// and only once in a scope.'),
	L('struct SymbolTableVisitor : IVisitor'),
	L('{'),
	L('  vector<map<string, DeclarationNode*>> scopes;'),
	L('  bool functionBody = false;'),
	L('  vector<string> errors;'),
	L(''),
	L('  SymbolTableVisitor ()'),
	L('  {'),
	L('    enterScope ();'),
	L('    // input and output are predefined: they have no node.'),
	L('    scopes.back ()["input"] = nullptr;'),
	L('    scopes.back ()["output"] = nullptr;'),
	L('  }'),
	L(''),
	L('  void enterScope ()', 'enter.sig'),
	L('  {'),
	L('    scopes.push_back ({});', 'enter.body'),
	L('  }'),
	L(''),
	L('  void exitScope ()', 'exit.sig'),
	L('  {'),
	L('    scopes.pop_back ();', 'exit.body'),
	L('  }'),
	L(''),
	L('  void declare (DeclarationNode* node)', 'declare.sig'),
	L('  {'),
	L('    node->nestLevel = scopes.size () - 1;', 'declare.level'),
	L('    if (scopes.back ().count (node->identifier) > 0)', 'declare.if'),
	L(
		'      errors.push_back (node->identifier + " is already declared in this scope");',
		'declare.error'
	),
	L('    scopes.back ()[node->identifier] = node;', 'declare.insert'),
	L('  }'),
	L(''),
	L('  void use (string identifier)', 'use.sig'),
	L('  {'),
	L('    for (int level = scopes.size () - 1; level >= 0; --level)', 'use.for'),
	L('      if (scopes[level].count (identifier) > 0)', 'use.if'),
	L('        return;', 'use.found'),
	L('    errors.push_back (identifier + " is not declared");', 'use.error'),
	L('  }'),
	...CONCRETE_CLASSES.flatMap((cls) => method(cls, symbolsBody(cls))),
	...ABSTRACT_METHODS,
	L('};'),
	L(''),
	L('void buildSymbolTable (ProgramNode* program)'),
	L('{'),
	L('  SymbolTableVisitor builder;'),
	L('  program->accept (&builder);', 'main.accept'),
	L('  for (string error : builder.errors)'),
	L('    cerr << error << "\\n";'),
	L('}')
];

function symbolsBody(cls: CourseClass): CodeLine[] {
	const declare = L('    declare (node);', `${cls}.declare`);
	const use = L('    use (node->identifier);', `${cls}.use`);
	switch (cls) {
		case 'FunctionDeclarationNode':
			return [
				declare,
				L('    enterScope ();', `${cls}.enter`),
				...fieldLines(cls, CHILD_FIELDS[cls][0]),
				L("    // The body's declarations go in the scope of the parameters."),
				L('    functionBody = true;', `${cls}.flag`),
				...fieldLines(cls, CHILD_FIELDS[cls][1]),
				L('    exitScope ();', `${cls}.exit`)
			];
		case 'VariableDeclarationNode':
		case 'ArrayDeclarationNode':
		case 'ParameterNode':
			return [declare];
		case 'CompoundStatementNode':
			return [
				L('    bool newScope = !functionBody;', `${cls}.new`),
				L('    functionBody = false;', `${cls}.flag`),
				L('    if (newScope)', `${cls}.if`),
				L('      enterScope ();', `${cls}.enter`),
				...childLines(cls),
				L('    if (newScope)', `${cls}.if2`),
				L('      exitScope ();', `${cls}.exit`)
			];
		case 'VariableExpressionNode':
			return [use];
		case 'SubscriptExpressionNode':
		case 'CallExpressionNode':
			return [use, ...childLines(cls)];
		default:
			return childLines(cls);
	}
}

const SYMBOLS_INFO: VisitorInfo = {
	id: 'symbols',
	name: 'SymbolTableVisitor',
	title: 'Build the symbol table',
	summary:
		'Builds a table per scope, sets nestLevel on every declaration, and reports names used without a declaration or declared twice in a scope.',
	driver: 'buildSymbolTable',
	instance: 'builder',
	members: ['scopes.size ()', 'functionBody', 'errors.size ()'],
	code: SYMBOLS_CODE
};

interface Entry {
	node: number | null;
	level: number;
}

interface SymbolsState {
	scopes: { id: number; names: Map<string, Entry> }[];
	made: number;
	functionBody: boolean;
	errors: number;
}

const SYMBOLS: Implementation<SymbolsState> = {
	init(run) {
		const s: SymbolsState = { scopes: [], made: 0, functionBody: false, errors: 0 };
		openScope(run, s, null);
		for (const name of ['input', 'output']) {
			s.scopes[0].names.set(name, { node: null, level: 0 });
			run.emit({ kind: 'declare', node: null, name, nodeClass: null, level: 0, scope: 0 });
		}
		return s;
	},
	members: (s) => [String(s.scopes.length), String(s.functionBody), String(s.errors)],
	scopes: (s) => s.scopes.map((scope) => scope.id),
	visit(node, run) {
		const s = run.state;
		const cls = node.node;
		switch (cls) {
			case 'FunctionDeclarationNode': {
				declare(run, node);
				const name = str(node, 'identifier');
				run.line(
					[`${cls}.enter`],
					`Opens the scope of ${name}: nestLevel ${s.scopes.length} for its parameters and locals.`,
					() => openScope(run, s, node.id),
					['enter.sig', 'enter.body']
				);
				run.child(node, 'parameters');
				run.line(
					[`${cls}.flag`],
					'functionBody = true: the next block, the body, stays in the scope of the parameters.',
					() => (s.functionBody = true)
				);
				run.child(node, 'functionBody');
				run.line([`${cls}.exit`], `Closes the scope of ${name}.`, () => s.scopes.pop(), [
					'exit.sig',
					'exit.body'
				]);
				return;
			}
			case 'VariableDeclarationNode':
			case 'ArrayDeclarationNode':
			case 'ParameterNode':
				declare(run, node);
				return;
			case 'CompoundStatementNode': {
				const opens = !s.functionBody;
				run.line(
					[`${cls}.new`, `${cls}.flag`, `${cls}.if`, ...(opens ? [`${cls}.enter`] : [])],
					opens
						? `newScope = true: a nested block opens its own scope, nestLevel ${s.scopes.length}.`
						: 'newScope = false: the body of a function stays in the scope of its parameters.',
					() => {
						run.local('newScope', String(opens));
						s.functionBody = false;
						if (opens) openScope(run, s, node.id);
					},
					opens ? ['enter.sig', 'enter.body'] : []
				);
				run.children(node);
				if (opens) {
					run.line(
						[`${cls}.if2`, `${cls}.exit`],
						"Closes the block's scope.",
						() => s.scopes.pop(),
						['exit.sig', 'exit.body']
					);
				} else {
					run.atReturn([`${cls}.if2`], 'newScope is false: the scope stays open.');
				}
				return;
			}
			case 'VariableExpressionNode':
				use(run, node);
				return;
			case 'SubscriptExpressionNode':
			case 'CallExpressionNode':
				use(run, node);
				run.children(node);
				return;
			default:
				run.children(node);
		}
	}
};

function openScope(run: Run<SymbolsState>, s: SymbolsState, node: number | null): void {
	const id = s.made++;
	s.scopes.push({ id, names: new Map() });
	run.emit({ kind: 'scope', scope: id, level: s.scopes.length - 1, node });
}

function declare(run: Run<SymbolsState>, node: CourseNode): void {
	const s = run.state;
	const name = str(node, 'identifier');
	const table = s.scopes[s.scopes.length - 1];
	const level = s.scopes.length - 1;
	const again = table.names.has(name);
	run.line(
		[`${node.node}.declare`],
		again
			? `nestLevel = ${level}. ${name} is already in this scope's table: an error. The new declaration replaces it.`
			: `nestLevel = ${level}; ${name} goes in the table of the ${level ? `scope at nestLevel ${level}` : 'global scope'}.`,
		() => {
			run.emit({
				kind: 'declare',
				node: node.id,
				name,
				nodeClass: node.node,
				level,
				scope: table.id
			});
			if (again) {
				s.errors++;
				run.emit({
					kind: 'error',
					node: node.id,
					message: `${name} is already declared in this scope`
				});
			}
			table.names.set(name, { node: node.id, level });
		},
		[
			'declare.sig',
			'declare.level',
			'declare.if',
			...(again ? ['declare.error'] : []),
			'declare.insert'
		]
	);
}

function use(run: Run<SymbolsState>, node: CourseNode): void {
	const s = run.state;
	const name = str(node, 'identifier');
	let found: Entry | null = null;
	for (let level = s.scopes.length - 1; level >= 0 && !found; level--) {
		found = s.scopes[level].names.get(name) ?? null;
	}
	const declaration = found?.node ?? null;
	const line = declaration === null ? null : run.nodes[declaration]?.span.line;
	run.line(
		[`${node.node}.use`],
		!found
			? `${name} is in no open scope: "${name} is not declared".`
			: declaration === null
				? `${name} is predefined in the global scope.`
				: `${name} is the one declared on line ${line}, at nestLevel ${found.level}.`,
		() => {
			run.emit({
				kind: 'use',
				node: node.id,
				name,
				declaration,
				level: found ? found.level : null
			});
			if (!found) {
				s.errors++;
				run.emit({ kind: 'error', node: node.id, message: `${name} is not declared` });
			}
		},
		['use.sig', 'use.for', 'use.if', found ? 'use.found' : 'use.error']
	);
}

// --- ConstantFolder -----------------------------------------------------------

/** Operator enumerators and the C- operators they stand for. */
const OPERATOR: Record<string, ArithOp | RelOp> = {
	PLUS: '+',
	MINUS: '-',
	TIMES: '*',
	DIVIDE: '/',
	LT: '<',
	LTE: '<=',
	GT: '>',
	GTE: '>=',
	EQ: '==',
	NEQ: '!='
};

const OPERATOR_FIELD: Partial<Record<CourseClass, string>> = {
	AdditiveExpressionNode: 'addOperator',
	MultiplicativeExpressionNode: 'multOperator',
	RelationalExpressionNode: 'relationalOperator'
};

function foldBody(cls: CourseClass): CodeLine[] {
	const no = (text = '    isConstant = false;') => L(text, `${cls}.no`);
	const operands = (compute: CodeLine[]) => [
		...fieldLines(cls, CHILD_FIELDS[cls][0]),
		L('    bool leftConstant = isConstant;', `${cls}.save`),
		L('    int left = value;', `${cls}.save2`),
		...fieldLines(cls, CHILD_FIELDS[cls][1]),
		L('    isConstant = leftConstant && isConstant;', `${cls}.both`),
		...compute
	];
	switch (cls) {
		case 'VariableDeclarationNode':
		case 'ArrayDeclarationNode':
		case 'ParameterNode':
			return [];
		case 'AssignmentExpressionNode':
		case 'SubscriptExpressionNode':
		case 'CallExpressionNode':
		case 'UnaryExpressionNode':
			return [...childLines(cls), no()];
		case 'VariableExpressionNode':
			return [no()];
		case 'IntegerLiteralExpressionNode':
			return [
				L('    isConstant = true;', `${cls}.const`),
				L('    value = node->value;', `${cls}.value`)
			];
		case 'AdditiveExpressionNode':
			return operands([
				L('    if (isConstant)', `${cls}.if`),
				L('    {'),
				L('      if (node->addOperator == AdditiveOperatorType::PLUS)', `${cls}.op`),
				L('        value = left + value;', `${cls}.then`),
				L('      else'),
				L('        value = left - value;', `${cls}.else`),
				L('      folded[node] = value;', `${cls}.record`),
				L('    }')
			]);
		case 'MultiplicativeExpressionNode':
			return operands([
				L('    // A division by 0 is left for the program to run into.'),
				L(
					'    if (node->multOperator == MultiplicativeOperatorType::DIVIDE && value == 0)',
					`${cls}.zero`
				),
				L('      isConstant = false;', `${cls}.no`),
				L('    if (isConstant)', `${cls}.if`),
				L('    {'),
				L('      if (node->multOperator == MultiplicativeOperatorType::TIMES)', `${cls}.op`),
				L('        value = left * value;', `${cls}.then`),
				L('      else'),
				L('        value = left / value;', `${cls}.else`),
				L('      folded[node] = value;', `${cls}.record`),
				L('    }')
			]);
		case 'RelationalExpressionNode':
			return operands([
				L('    if (isConstant)', `${cls}.if`),
				L('    {'),
				L('      value = compare (node->relationalOperator, left, value);', `${cls}.then`),
				L('      folded[node] = value;', `${cls}.record`),
				L('    }')
			]);
		default:
			return childLines(cls);
	}
}

const FOLD_CODE: CodeLine[] = [
	L('// Folds constant expressions. After an expression is visited, isConstant'),
	L('// tells whether its value is known before the program runs, and value'),
	L('// holds that value. Every operator node with a constant value goes into'),
	L('// folded. compare (op, a, b) is 1 when a op b holds and 0 when it does not.'),
	L('struct ConstantFolder : IVisitor'),
	L('{'),
	L('  bool isConstant = false;'),
	L('  int value = 0;'),
	L('  map<ExpressionNode*, int> folded;'),
	...CONCRETE_CLASSES.flatMap((cls) => method(cls, foldBody(cls))),
	...ABSTRACT_METHODS,
	L('};'),
	L(''),
	L('void foldConstants (ProgramNode* program)'),
	L('{'),
	L('  ConstantFolder folder;'),
	L('  program->accept (&folder);', 'main.accept'),
	L('}')
];

const FOLD_INFO: VisitorInfo = {
	id: 'fold',
	name: 'ConstantFolder',
	title: 'Fold constants',
	summary:
		'Works out the value of every operator node whose operands are integer literals or folded constants.',
	driver: 'foldConstants',
	instance: 'folder',
	members: ['isConstant', 'value', 'folded.size ()'],
	code: FOLD_CODE
};

interface FoldState {
	isConstant: boolean;
	value: number;
	folded: number;
}

const FOLD: Implementation<FoldState> = {
	init: () => ({ isConstant: false, value: 0, folded: 0 }),
	members: (s) => [String(s.isConstant), String(s.value), String(s.folded)],
	visit(node, run) {
		const s = run.state;
		const cls = node.node;
		const notConstant = (text: string) =>
			run.line([`${cls}.no`], `${text} isConstant = false.`, () => (s.isConstant = false));
		switch (cls) {
			case 'VariableDeclarationNode':
			case 'ArrayDeclarationNode':
			case 'ParameterNode':
				return;
			case 'IntegerLiteralExpressionNode': {
				// value is an int, as node->value is: a literal too large for one (the
				// semantic analyzer reports it) wraps around at 32 bits.
				const literal = str(node, 'value');
				const value = Number(literal) | 0;
				run.line(
					[`${cls}.const`, `${cls}.value`],
					String(value) === literal
						? `A literal: isConstant = true, value = ${value}.`
						: `A literal: isConstant = true. ${literal} does not fit in an int (32 bits): it wraps around to value = ${value}.`,
					() => {
						s.isConstant = true;
						s.value = value;
					}
				);
				return;
			}
			case 'VariableExpressionNode':
				notConstant(
					`${str(node, 'identifier')} is a variable: its value is known only at run time.`
				);
				return;
			case 'AssignmentExpressionNode':
				run.children(node);
				notConstant('An assignment changes a variable: it is not folded.');
				return;
			case 'SubscriptExpressionNode':
				run.children(node);
				notConstant(`${str(node, 'identifier')}[…] is an array element.`);
				return;
			case 'CallExpressionNode':
				run.children(node);
				notConstant(`A call of ${str(node, 'identifier')}: its value is known only at run time.`);
				return;
			case 'UnaryExpressionNode':
				run.children(node);
				notConstant(`${str(node, 'unaryOperator')} changes a variable.`);
				return;
			case 'AdditiveExpressionNode':
			case 'MultiplicativeExpressionNode':
			case 'RelationalExpressionNode':
				foldOperator(run, node);
				return;
			default:
				run.children(node);
		}
	}
};

function foldOperator(run: Run<FoldState>, node: CourseNode): void {
	const s = run.state;
	const cls = node.node;
	const op = OPERATOR[str(node, OPERATOR_FIELD[cls]!)];
	run.child(node, 'left');
	const leftConstant = s.isConstant;
	const left = s.value;
	run.line(
		[`${cls}.save`, `${cls}.save2`],
		`The left operand is visited: leftConstant = ${leftConstant}${leftConstant ? `, left = ${left}` : ''}.`,
		() => {
			run.local('leftConstant', String(leftConstant));
			run.local('left', String(left));
		}
	);
	run.child(node, 'right');
	const both = leftConstant && s.isConstant;
	const lines = [`${cls}.both`];
	let constant = both;
	if (cls === 'MultiplicativeExpressionNode') {
		lines.push(`${cls}.zero`);
		if (op === '/' && s.value === 0) {
			lines.push(`${cls}.no`);
			constant = false;
		}
	}
	lines.push(`${cls}.if`);
	if (!constant) {
		const why = !both
			? !leftConstant && !s.isConstant
				? 'Neither operand is a constant'
				: !leftConstant
					? 'The left operand is not a constant'
					: 'The right operand is not a constant'
			: `${left} / 0 is a division by zero`;
		run.line(lines, `${why}: isConstant = false, nothing is folded.`, () => {
			s.isConstant = false;
		});
		return;
	}
	const right = s.value;
	const value =
		cls === 'RelationalExpressionNode'
			? compare(op as RelOp, left, right)
			: arith(op as ArithOp, left, right)!;
	if (cls === 'RelationalExpressionNode') lines.push(`${cls}.then`);
	else {
		const first = op === '+' || op === '*';
		lines.push(`${cls}.op`, first ? `${cls}.then` : `${cls}.else`);
	}
	lines.push(`${cls}.record`);
	run.line(
		lines,
		`Both operands are constants: ${left} ${op} ${right} = ${value}, recorded in folded.`,
		() => {
			s.isConstant = true;
			s.value = value;
			s.folded++;
			run.emit({ kind: 'fold', node: node.id, op, left, right, value });
		}
	);
}

// ---------------------------------------------------------------------------
// Running a visitor
// ---------------------------------------------------------------------------

/** The three visitors, by id. */
export const VISITORS: Readonly<Record<VisitorId, VisitorInfo>> = {
	print: PRINT_INFO,
	symbols: SYMBOLS_INFO,
	fold: FOLD_INFO
};

function runTrace<S>(
	impl: Implementation<S>,
	info: VisitorInfo,
	tree: CourseNode,
	maxEvents: number
): VisitTrace {
	const run = new Run(impl, info, tree, maxEvents);
	const state = run.start();
	const initial = run.output.length;
	const members = impl.members(state);
	let truncated = false;
	try {
		run.root(tree);
	} catch (error) {
		if (!(error instanceof Stop)) throw error;
		truncated = true;
	}
	return { visitor: info.id, events: run.events, output: run.output, initial, members, truncated };
}

/**
 * Runs a visitor on a course tree (as `courseAst` builds it; the fields set by
 * later phases play no part) from the driver's `program->accept (&visitor)`
 * to its return. The trace stops after `maxEvents` events (`truncated`).
 */
export function traceVisitor(
	tree: CourseNode,
	visitor: VisitorId,
	opts: { maxEvents?: number } = {}
): VisitTrace {
	const max = opts.maxEvents ?? DEFAULT_MAX_EVENTS;
	switch (visitor) {
		case 'print':
			return runTrace(PRINT, PRINT_INFO, tree, max);
		case 'symbols':
			return runTrace(SYMBOLS, SYMBOLS_INFO, tree, max);
		case 'fold':
			return runTrace(FOLD, FOLD_INFO, tree, max);
	}
}

/** The text PrintVisitor writes into `out` by the end of the trace (or by event `through`). */
export function printedText(trace: VisitTrace, through = trace.events.length - 1): string {
	const count = through < 0 ? trace.initial : trace.events[through].output;
	return trace.output
		.slice(0, count)
		.flatMap((r) => (r.kind === 'print' ? [`${'  '.repeat(r.level)}${r.text}\n`] : []))
		.join('');
}

/** The nestLevel SymbolTableVisitor set on each declaration node: node id → level. */
export function nestLevels(trace: VisitTrace): Map<number, number> {
	const out = new Map<number, number>();
	for (const r of trace.output)
		if (r.kind === 'declare' && r.node !== null) out.set(r.node, r.level);
	return out;
}
