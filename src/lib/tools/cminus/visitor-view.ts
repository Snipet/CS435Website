/**
 * View models of the Visitor tab: the trace of a visitor on the parser's
 * tree and, at one step of it, the call stack, the lines of code to mark,
 * the state of every node of the outline and what the visitor has produced.
 * Pure, so the specs cover them and the components only render.
 */
import {
	VISITORS,
	acceptCode,
	courseAst,
	courseChildren,
	nodeSummary,
	traceVisitor,
	type CodeLine,
	type CourseClass,
	type CourseNode,
	type HeaderClass,
	type Program,
	type SourceSpan,
	type VisitEvent,
	type VisitTrace,
	type VisitorId,
	type VisitorValue
} from '$lib/theory/cminus';
import { excerpt, rangeOf, type SourceRange } from './selection';

// ---------------------------------------------------------------------------
// The tree and the trace, worked out once per program
// ---------------------------------------------------------------------------

const trees = new WeakMap<Program, CourseNode>();
const traces = new WeakMap<Program, Map<VisitorId, VisitTrace>>();

/**
 * The tree the visitors walk: the parser's tree in the classes of the
 * course's AST, as the parser leaves it (nestLevel and framePointerOffset
 * not set yet).
 */
export function visitorTree(program: Program): CourseNode {
	let tree = trees.get(program);
	if (!tree) {
		tree = courseAst(program);
		trees.set(program, tree);
	}
	return tree;
}

/**
 * The run of a visitor on a program's tree. Linear in the size of the tree
 * (a program of the page's largest size takes a few milliseconds), so it is
 * worked out on the page; each program keeps its traces.
 */
export function visitorTrace(program: Program, visitor: VisitorId): VisitTrace {
	let byVisitor = traces.get(program);
	if (!byVisitor) {
		byVisitor = new Map();
		traces.set(program, byVisitor);
	}
	let trace = byVisitor.get(visitor);
	if (!trace) {
		trace = traceVisitor(visitorTree(program), visitor);
		byVisitor.set(visitor, trace);
	}
	return trace;
}

/** Where each node is in the tree and in the trace. */
export interface TraceIndex {
	/** The nodes by id. */
	nodes: CourseNode[];
	/** The field of its parent that holds each node ("thenStatement", "statements[2]"), by id; null at the root. */
	fields: (string | null)[];
	/** Index of the visit event of each node, by id (-1: not in the trace). */
	visitAt: Int32Array;
	/** Index of the return event of each node, by id (-1: not in the trace). */
	returnAt: Int32Array;
}

const indexes = new WeakMap<VisitTrace, TraceIndex>();

export function traceIndex(trace: VisitTrace, tree: CourseNode): TraceIndex {
	let index = indexes.get(trace);
	if (index) return index;
	const nodes: CourseNode[] = [];
	const fields: (string | null)[] = [];
	const go = (node: CourseNode, field: string | null) => {
		nodes[node.id] = node;
		fields[node.id] = field;
		for (const child of courseChildren(node)) go(child.node, child.field);
	};
	go(tree, null);
	const visitAt = new Int32Array(nodes.length).fill(-1);
	const returnAt = new Int32Array(nodes.length).fill(-1);
	trace.events.forEach((e, i) => {
		if (e.kind === 'visit') visitAt[e.node] = i;
		else if (e.kind === 'return') returnAt[e.node] = i;
	});
	index = { nodes, fields, visitAt, returnAt };
	indexes.set(trace, index);
	return index;
}

// ---------------------------------------------------------------------------
// The picker and the step
// ---------------------------------------------------------------------------

export interface VisitorOption {
	value: VisitorId;
	/** The class: "PrintVisitor". */
	label: string;
	/** What it does. */
	title: string;
}

export const VISITOR_OPTIONS: readonly VisitorOption[] = (
	['print', 'symbols', 'fold'] as const
).map((id) => ({ value: id, label: VISITORS[id].name, title: VISITORS[id].summary }));

/** "Accept", "Visit", "Run", "Return": the kind of a step, for its caption. */
export const KIND_LABEL: Record<VisitEvent['kind'], string> = {
	accept: 'accept',
	visit: 'visit',
	line: 'run',
	return: 'return'
};

/** The text of the lines a step runs in the visitor's code, in the order of the code. */
export function stepCode(trace: VisitTrace, at: number): string[] {
	const event = trace.events[at];
	if (!event) return [];
	const lines = new Set(event.lines);
	return VISITORS[trace.visitor].code.flatMap((l) =>
		l.id !== null && lines.has(l.id) ? [l.text.trim()] : []
	);
}

/** The visit event of the first node of a selection (the outermost, first in preorder); null for none. */
export function stepOfSelection(index: TraceIndex, nodes: ReadonlySet<number>): number | null {
	let first: number | null = null;
	for (const id of nodes) if (index.visitAt[id] >= 0 && (first === null || id < first)) first = id;
	return first === null ? null : index.visitAt[first];
}

/**
 * Where a new selection made outside the tab moves the run: to the visit of
 * its first node, unless the step is at a node of the selection already
 * (null: the run stays).
 */
export function selectionStep(
	trace: VisitTrace,
	index: TraceIndex,
	at: number,
	nodes: ReadonlySet<number>
): number | null {
	if (!nodes.size) return null;
	const now = trace.events[at];
	if (now && nodes.has(now.node)) return null;
	return stepOfSelection(index, nodes);
}

/** The step to show for a node picked in the tree: its visit (or its accept when that is the step shown). */
export function stepOfNode(trace: VisitTrace, index: TraceIndex, id: number, at: number): number {
	const visit = index.visitAt[id] ?? -1;
	if (visit < 0) return at;
	const current = trace.events[at];
	return current && current.node === id ? at : visit;
}

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

export interface CodeMarks {
	/** Lines the step runs. */
	current: ReadonlySet<string>;
	/** Lines of a helper method the step runs. */
	helper: ReadonlySet<string>;
	/** Lines where the calls in progress wait: the accept calls under the current one, and the driver's. */
	waiting: ReadonlySet<string>;
}

/** The line ids of the visitor's code to mark at step `at`. */
export function codeMarks(trace: VisitTrace, at: number): CodeMarks {
	const event = trace.events[at];
	if (!event) return { current: new Set(), helper: new Set(), waiting: new Set() };
	const waiting = new Set<string>();
	for (let f = event.top; f >= 0; f = trace.events[f].below) {
		const frame = trace.events[f];
		if (frame.kind === 'accept' && f !== at) waiting.add(frame.lines[0]);
	}
	return { current: new Set(event.lines), helper: new Set(event.helper), waiting };
}

/**
 * The innermost call of accept at a step, for the double dispatch: the
 * pointer it goes through, the class whose accept runs, and that accept's
 * code with the line the step is on. On a return, the call that returns.
 */
export interface DispatchView {
	node: number;
	nodeClass: CourseClass;
	/** The type of the pointer accept is called through. */
	pointer: HeaderClass;
	/** "IfStatementNode::thenStatement"; null at the root. */
	field: string | null;
	/** The accept call as the caller writes it: "node->thenStatement->accept (this)". */
	call: string;
	/** The pointer it calls accept through: "thenStatement", "stmt", "program". */
	variable: string;
	/** The visitor's method the second dispatch reaches: "PrintVisitor::visit (IfStatementNode* node)". */
	method: string;
	code: CodeLine[];
	/** The line id of `code` the step is on, or null. */
	line: string | null;
	/** The step is the accept call (first dispatch), the visit call (second), or later in the call. */
	phase: 'accept' | 'visit' | 'body' | 'return';
}

export function dispatchAt(trace: VisitTrace, at: number): DispatchView | null {
	const event = trace.events[at];
	if (!event) return null;
	let accept: VisitEvent | null = null;
	let phase: DispatchView['phase'];
	if (event.kind === 'return') {
		phase = 'return';
		// The accept of the call that returns: the nearest earlier accept of the node.
		for (let i = at - 1; i >= 0 && !accept; i--) {
			const e = trace.events[i];
			if (e.kind === 'accept' && e.node === event.node && e.depth === event.depth) accept = e;
		}
	} else {
		phase = event.kind === 'accept' ? 'accept' : event.kind === 'visit' ? 'visit' : 'body';
		for (let f = event.top; f >= 0 && !accept; f = trace.events[f].below) {
			if (trace.events[f].kind === 'accept') accept = trace.events[f];
		}
	}
	if (!accept || !accept.pointer) return null;
	const info = VISITORS[trace.visitor];
	const call = callText(trace, accept);
	return {
		node: accept.node,
		nodeClass: accept.nodeClass,
		pointer: accept.pointer,
		field: accept.field,
		call,
		variable: pointerVariable(call),
		method: `${info.name}::visit (${accept.nodeClass}* node)`,
		code: acceptCode(accept.nodeClass),
		line: phase === 'accept' ? 'accept.sig' : phase === 'visit' ? 'accept.visit' : null,
		phase
	};
}

// ---------------------------------------------------------------------------
// The call stack
// ---------------------------------------------------------------------------

export interface FrameRow {
	/** Index of the event that opened the call; -1 for the driver. */
	key: number;
	kind: 'driver' | 'accept' | 'visit';
	/** The node of the call; null for the driver. */
	node: number | null;
	/** "IfStatementNode::accept", "PrintVisitor::visit (IfStatementNode*)", "printTree (ProgramNode* program)". */
	name: string;
	/**
	 * accept: the call that made it and the type of its pointer, "node->thenStatement->accept
	 * (this); thenStatement is a StatementNode*". driver: where it waits. visit: empty.
	 */
	detail: string;
	/** visit: the node on one line ("IfStatementNode", "VariableExpressionNode x"); empty otherwise. */
	summary: string;
	/** visit: the node's text in the source; null otherwise. */
	span: SourceSpan | null;
	/** visit: the method's local variables. */
	locals: VisitorValue[];
	/** The innermost call. */
	top: boolean;
}

/** The calls in progress after step `at`, innermost first, the driver last. */
export function callStack(trace: VisitTrace, index: TraceIndex, at: number): FrameRow[] {
	const event = trace.events[at];
	const info = VISITORS[trace.visitor];
	const rows: FrameRow[] = [];
	if (event) {
		/** The frame above the one being listed (its accept call kept the caller's locals). */
		let above: VisitEvent = event;
		for (let f = event.top; f >= 0; f = trace.events[f].below) {
			const frame = trace.events[f];
			if (frame.kind === 'accept') {
				const call = callText(trace, frame);
				rows.push({
					key: f,
					kind: 'accept',
					node: frame.node,
					name: `${frame.nodeClass}::accept`,
					detail: `${call}; ${pointerVariable(call)} is ${withPointer(frame.pointer!)}`,
					summary: '',
					span: null,
					locals: [],
					top: rows.length === 0
				});
			} else {
				const node = index.nodes[frame.node];
				rows.push({
					key: f,
					kind: 'visit',
					node: frame.node,
					name: `${info.name}::visit (${frame.nodeClass}*)`,
					detail: '',
					summary: node ? nodeSummary(node) : frame.nodeClass,
					span: node?.span ?? null,
					// A call under another one waits at an accept call, which kept its locals.
					locals: above.locals,
					top: rows.length === 0
				});
			}
			above = frame;
		}
	}
	rows.push({
		key: -1,
		kind: 'driver',
		node: null,
		name: `${info.driver} (ProgramNode* program)`,
		detail:
			event && event.top >= 0
				? `waits at program->accept (&${info.instance})`
				: `program->accept (&${info.instance}) has returned`,
		summary: '',
		span: null,
		locals: [],
		top: rows.length === 0
	});
	return rows;
}

/** The accept call an accept event stands for, as the code writes it: "node->left->accept (this)". */
function callText(trace: VisitTrace, accept: VisitEvent): string {
	const line = VISITORS[trace.visitor].code.find((l) => l.id === accept.lines[0]);
	return line ? line.text.trim().replace(/;$/, '') : '';
}

/** The pointer an accept call goes through: "left", "stmt", "program". */
const pointerVariable = (call: string) => /(\w+)->accept/.exec(call)?.[1] ?? '';

const withPointer = (type: HeaderClass) => `${/^[AEIOU]/.test(type) ? 'an' : 'a'} ${type}*`;

// ---------------------------------------------------------------------------
// The outline of the tree
// ---------------------------------------------------------------------------

export interface VisitRow {
	id: number;
	depth: number;
	/** The field of the parent that holds the node; null at the root. */
	field: string | null;
	/** Class and key fields: "IfStatementNode", "VariableExpressionNode x". */
	label: string;
	line: number;
	span: SourceSpan;
}

const rowCache = new WeakMap<CourseNode, VisitRow[]>();

/** The tree in preorder, one row per node. */
export function visitRows(tree: CourseNode): VisitRow[] {
	let rows = rowCache.get(tree);
	if (!rows) {
		const out: VisitRow[] = [];
		const go = (node: CourseNode, depth: number, field: string | null) => {
			out.push({
				id: node.id,
				depth,
				field,
				label: nodeSummary(node),
				line: node.span.line,
				span: node.span
			});
			for (const child of courseChildren(node)) go(child.node, depth + 1, child.field);
		};
		go(tree, 0, null);
		rows = out;
		rowCache.set(tree, rows);
	}
	return rows;
}

/**
 * Where a node stands at step `at`: `current` (the step's node), `open` (its
 * visit is in progress), `done` (it has returned) or `pending` (not visited yet).
 */
export type VisitStatus = 'current' | 'open' | 'done' | 'pending';

export function visitStatus(
	trace: VisitTrace,
	index: TraceIndex,
	at: number,
	id: number
): VisitStatus {
	const event = trace.events[at];
	if (event && event.node === id) return 'current';
	const visit = index.visitAt[id];
	if (visit < 0 || visit > at) return 'pending';
	const back = index.returnAt[id];
	return back >= 0 && back <= at ? 'done' : 'open';
}

/** The rows listed: `rows.slice(start, end)`. */
export interface RowWindow {
	start: number;
	end: number;
}

/**
 * The rows to list: all of them when there are at most `limit`; otherwise
 * `limit` rows that hold the current node with at least a quarter of the
 * limit above it and below it (where the tree has them), or the first
 * `limit` rows when no node is current. The window moves half the limit at
 * a time, so most steps keep the rows that are listed.
 */
export function rowWindow(
	rows: readonly VisitRow[],
	current: number | null,
	limit: number
): RowWindow {
	const total = rows.length;
	if (total <= limit) return { start: 0, end: total };
	const at = current === null ? -1 : rows.findIndex((r) => r.id === current);
	if (at < 0) return { start: 0, end: limit };
	const half = Math.max(1, Math.floor(limit / 2));
	const start = Math.max(
		0,
		Math.min(total - limit, Math.floor(at / half) * half - Math.floor(half / 2))
	);
	return { start, end: start + limit };
}

// ---------------------------------------------------------------------------
// What the visitor has produced
// ---------------------------------------------------------------------------

/** The visitor's member variables after step `at` (before the first step: as constructed). */
export function membersAt(trace: VisitTrace, at: number): VisitorValue[] {
	const values = trace.events[at]?.members ?? trace.members;
	return VISITORS[trace.visitor].members.map((name, i) => ({ name, value: values[i] ?? '' }));
}

const outputAt = (trace: VisitTrace, at: number) =>
	trace.output.slice(0, trace.events[at]?.output ?? trace.initial);

/** The nodes of the records step `at` made: the line printed, the name declared, the value folded, … */
export function addedNodes(trace: VisitTrace, at: number): Set<number> {
	const event = trace.events[at];
	const from = at > 0 ? trace.events[at - 1].output : trace.initial;
	const out = new Set<number>();
	if (!event) return out;
	for (const r of trace.output.slice(from, event.output)) if (r.node !== null) out.add(r.node);
	return out;
}

export interface PrintedLine {
	node: number;
	/** The line as printed, indentation included. */
	text: string;
}

/** PrintVisitor's `out` after step `at`, line by line. */
export function printedLines(trace: VisitTrace, at: number): PrintedLine[] {
	return outputAt(trace, at).flatMap((r) =>
		r.kind === 'print' ? [{ node: r.node, text: `${'  '.repeat(r.level)}${r.text}` }] : []
	);
}

export interface TableEntry {
	name: string;
	/** The declaration's class; null for input and output. */
	nodeClass: CourseClass | null;
	level: number;
	/** The declaration node; null for input and output. */
	node: number | null;
	line: number | null;
}

export interface ScopeTable {
	id: number;
	level: number;
	/** What opened it: "global scope", "function gcd", "block on line 7". */
	title: string;
	/** The node that opened it; null for the global scope. */
	node: number | null;
	/** Its names in the order they were declared; a name declared again is listed once, with its last declaration. */
	entries: TableEntry[];
}

/** SymbolTableVisitor's `scopes` after step `at`, outermost first. */
export function scopeTables(trace: VisitTrace, index: TraceIndex, at: number): ScopeTable[] {
	const open = trace.events[at]?.scopes ?? [0];
	const tables = new Map<number, ScopeTable>();
	for (const r of outputAt(trace, at)) {
		if (r.kind === 'scope') {
			const node = r.node === null ? null : index.nodes[r.node];
			const title = !node
				? 'global scope'
				: node.node === 'FunctionDeclarationNode'
					? `function ${nameOf(node)}`
					: `block on line ${node.span.line}`;
			tables.set(r.scope, { id: r.scope, level: r.level, title, node: r.node, entries: [] });
		} else if (r.kind === 'declare') {
			const table = tables.get(r.scope);
			if (!table) continue;
			const entry: TableEntry = {
				name: r.name,
				nodeClass: r.nodeClass,
				level: r.level,
				node: r.node,
				line: r.node === null ? null : (index.nodes[r.node]?.span.line ?? null)
			};
			const earlier = table.entries.findIndex((e) => e.name === r.name);
			if (earlier >= 0) table.entries[earlier] = entry;
			else table.entries.push(entry);
		}
	}
	return open.flatMap((id) => tables.get(id) ?? []);
}

function nameOf(node: CourseNode): string {
	const field = node.fields.find((f) => f.name === 'identifier');
	return field?.value.kind === 'string' ? field.value.value : '';
}

export interface ErrorRow {
	node: number;
	message: string;
	line: number | null;
}

/** SymbolTableVisitor's `errors` after step `at`. */
export function errorsAt(trace: VisitTrace, index: TraceIndex, at: number): ErrorRow[] {
	return outputAt(trace, at).flatMap((r) =>
		r.kind === 'error'
			? [{ node: r.node, message: r.message, line: index.nodes[r.node]?.span.line ?? null }]
			: []
	);
}

export interface FoldRow {
	node: number;
	/** The expression in the source: "2 * 3 + 1". */
	source: string;
	/** What the folder computed: "6 + 1 = 7". */
	text: string;
	value: number;
	line: number | null;
}

/** ConstantFolder's `folded` after step `at`, in the order the values were recorded. */
export function foldsAt(
	trace: VisitTrace,
	index: TraceIndex,
	source: string,
	at: number
): FoldRow[] {
	return outputAt(trace, at).flatMap((r) => {
		if (r.kind !== 'fold') return [];
		const node = index.nodes[r.node];
		return [
			{
				node: r.node,
				source: node ? excerpt(source, rangeOf(node.span)) : '',
				text: `${r.left} ${r.op} ${r.right} = ${r.value}`,
				value: r.value,
				line: node?.span.line ?? null
			}
		];
	});
}

/** The range of a node in the source, or null. */
export function rangeOfNode(index: TraceIndex, id: number | null): SourceRange | null {
	if (id === null) return null;
	const node = index.nodes[id];
	return node ? rangeOf(node.span) : null;
}
