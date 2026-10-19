import { describe, expect, it } from 'vitest';
import { compile, courseChildren, type CourseNode, type VisitTrace } from '$lib/theory/cminus';
import { presetById } from './presets';
import {
	KIND_LABEL,
	addedNodes,
	VISITOR_OPTIONS,
	callStack,
	codeMarks,
	dispatchAt,
	errorsAt,
	foldsAt,
	membersAt,
	printedLines,
	rangeOfNode,
	rowWindow,
	scopeTables,
	selectionStep,
	stepCode,
	stepOfNode,
	stepOfSelection,
	traceIndex,
	visitRows,
	visitStatus,
	visitorTrace,
	visitorTree
} from './visitor-view';

const GCD = presetById('gcd')!.value.source;
const gcd = compile(GCD);
const program = gcd.parse!.program;
const tree = visitorTree(program);
/** The line of the gcd preset that starts with `text`. */
const lineOf = (text: string) =>
	GCD.split('\n').findIndex((l) => l.trimStart().startsWith(text)) + 1;

const SCOPES = `int x;
void main(void)
{
  int x;
  { int x; x = 1; { int y; y = z; } }
  x = 2;
}`;

const FOLDS = 'void main(void) { int x; x = 2 * 3 + 1; output(x / 0); }';

function setup(source: string, visitor: 'print' | 'symbols' | 'fold') {
	const c = compile(source);
	const p = c.parse!.program;
	const t = visitorTrace(p, visitor);
	return { c, trace: t, index: traceIndex(t, visitorTree(p)) };
}

/** The first event at or after `from` that passes `test`. */
function find(trace: VisitTrace, test: (e: VisitTrace['events'][number]) => boolean, from = 0) {
	for (let i = from; i < trace.events.length; i++) if (test(trace.events[i])) return i;
	throw new Error('no such event');
}

describe('the tree and the trace', () => {
	it('are worked out once per program and visitor', () => {
		expect(visitorTree(program)).toBe(tree);
		expect(visitorTrace(program, 'print')).toBe(visitorTrace(program, 'print'));
		expect(visitorTrace(program, 'fold')).not.toBe(visitorTrace(program, 'print'));
		// The parser's tree: the semantic analyzer has not set nestLevel.
		const fun = tree.fields.find((f) => f.name === 'declarations')!.value;
		expect(fun.kind).toBe('list');
		if (fun.kind === 'list') {
			const nest = fun.nodes[0].fields.find((f) => f.name === 'nestLevel')!.value;
			expect(nest).toEqual({ kind: 'unset', phase: 'semantic' });
		}
	});

	it('index every node: its field, its visit and its return', () => {
		const trace = visitorTrace(program, 'print');
		const index = traceIndex(trace, tree);
		expect(traceIndex(trace, tree)).toBe(index);
		const ids: number[] = [];
		const walk = (n: CourseNode) => {
			ids.push(n.id);
			courseChildren(n).forEach((c) => walk(c.node));
		};
		walk(tree);
		expect(index.nodes.map((n) => n.id)).toEqual(ids.sort((a, b) => a - b));
		expect(index.fields[0]).toBeNull();
		expect(index.fields[1]).toBe('declarations[0]');
		for (const id of ids) {
			expect(trace.events[index.visitAt[id]]).toMatchObject({ kind: 'visit', node: id });
			expect(trace.events[index.returnAt[id]]).toMatchObject({ kind: 'return', node: id });
			expect(index.returnAt[id]).toBeGreaterThan(index.visitAt[id]);
		}
	});
});

describe('the picker and the step', () => {
	it('offers the three visitors by class name', () => {
		expect(VISITOR_OPTIONS.map((o) => o.label)).toEqual([
			'PrintVisitor',
			'SymbolTableVisitor',
			'ConstantFolder'
		]);
		expect(KIND_LABEL.line).toBe('run');
	});

	it('gives the code of a step in the order of the code', () => {
		const trace = visitorTrace(program, 'print');
		expect(stepCode(trace, 0)).toEqual(['program->accept (&printer);']);
		expect(stepCode(trace, 1)).toEqual(['void visit (ProgramNode* node) override']);
		expect(stepCode(trace, 2)).toEqual(['print ("ProgramNode");', '++level;']);
		expect(stepCode(trace, 3)).toEqual([
			'for (DeclarationNode* decl : node->declarations)',
			'decl->accept (this);'
		]);
		expect(stepCode(trace, -1)).toEqual([]);
	});

	it('goes to the visit of the first node of a selection', () => {
		const trace = visitorTrace(program, 'print');
		const index = traceIndex(trace, tree);
		expect(stepOfSelection(index, new Set())).toBeNull();
		expect(stepOfSelection(index, new Set([12, 9, 10]))).toBe(index.visitAt[9]);
		expect(stepOfSelection(index, new Set([9999]))).toBeNull();
		// A node picked in the tree: its visit, unless the step is at that node already.
		expect(stepOfNode(trace, index, 5, 0)).toBe(index.visitAt[5]);
		const accept = index.visitAt[5] - 1;
		expect(stepOfNode(trace, index, 5, accept)).toBe(accept);
		expect(stepOfNode(trace, index, 9999, 7)).toBe(7);
	});

	it('moves the run for a selection made outside the tab, unless the step is at one of its nodes', () => {
		const trace = visitorTrace(program, 'print');
		const index = traceIndex(trace, tree);
		expect(selectionStep(trace, index, 0, new Set([12, 9, 10]))).toBe(index.visitAt[9]);
		expect(selectionStep(trace, index, 0, new Set())).toBeNull();
		expect(selectionStep(trace, index, 0, new Set([9999]))).toBeNull();
		// At a node of the selection: the run stays (a frame or the node of the step).
		expect(selectionStep(trace, index, index.visitAt[10], new Set([9, 10]))).toBeNull();
		// Later in the run, a selection of an earlier node goes back to its visit.
		expect(selectionStep(trace, index, trace.events.length - 2, new Set([5]))).toBe(
			index.visitAt[5]
		);
	});
});

describe('the code marks', () => {
	it('mark the lines that run and the calls that wait', () => {
		const trace = visitorTrace(program, 'print');
		const root = codeMarks(trace, 0);
		expect([...root.current]).toEqual(['main.accept']);
		expect([...root.waiting]).toEqual([]);
		const at = find(trace, (e) => e.kind === 'line' && e.nodeClass === 'IfStatementNode');
		const marks = codeMarks(trace, at);
		expect([...marks.current]).toEqual(['IfStatementNode.print', 'IfStatementNode.in']);
		expect([...marks.helper]).toEqual(['print.sig', 'print.body']);
		expect([...marks.waiting].sort()).toEqual(
			[
				'main.accept',
				'ProgramNode.declarations',
				'FunctionDeclarationNode.functionBody',
				'CompoundStatementNode.statements'
			].sort()
		);
		expect(codeMarks(trace, trace.events.length)).toEqual({
			current: new Set(),
			helper: new Set(),
			waiting: new Set()
		});
	});
});

describe('the double dispatch', () => {
	it('follows the innermost accept call through its two dispatches', () => {
		const trace = visitorTrace(program, 'print');
		const at = find(
			trace,
			(e) => e.kind === 'accept' && e.field === 'IfStatementNode::thenStatement'
		);
		expect(dispatchAt(trace, at)).toMatchObject({
			nodeClass: 'ReturnStatementNode',
			pointer: 'StatementNode',
			field: 'IfStatementNode::thenStatement',
			call: 'node->thenStatement->accept (this)',
			variable: 'thenStatement',
			method: 'PrintVisitor::visit (ReturnStatementNode* node)',
			line: 'accept.sig',
			phase: 'accept'
		});
		expect(dispatchAt(trace, at)!.code[0].text).toBe(
			'void ReturnStatementNode::accept (IVisitor* visitor)'
		);
		expect(dispatchAt(trace, at + 1)).toMatchObject({ phase: 'visit', line: 'accept.visit' });
		expect(dispatchAt(trace, at + 2)).toMatchObject({
			phase: 'body',
			line: null,
			nodeClass: 'ReturnStatementNode'
		});
		const back = find(trace, (e) => e.kind === 'return' && e.nodeClass === 'ReturnStatementNode');
		expect(dispatchAt(trace, back)).toMatchObject({
			phase: 'return',
			nodeClass: 'ReturnStatementNode',
			field: 'IfStatementNode::thenStatement'
		});
		expect(dispatchAt(trace, 0)).toMatchObject({
			call: 'program->accept (&printer)',
			variable: 'program',
			pointer: 'ProgramNode'
		});
		expect(dispatchAt(trace, -1)).toBeNull();
	});
});

describe('the call stack', () => {
	it('lists the calls innermost first, the driver last', () => {
		const trace = visitorTrace(program, 'print');
		const index = traceIndex(trace, tree);
		const first = callStack(trace, index, 0);
		expect(first.map((r) => [r.kind, r.name])).toEqual([
			['accept', 'ProgramNode::accept'],
			['driver', 'printTree (ProgramNode* program)']
		]);
		expect(first[0]).toMatchObject({
			top: true,
			detail: 'program->accept (&printer); program is a ProgramNode*'
		});
		expect(first[1].detail).toBe('waits at program->accept (&printer)');
		const last = callStack(trace, index, trace.events.length - 1);
		expect(last).toHaveLength(1);
		expect(last[0]).toMatchObject({
			kind: 'driver',
			top: true,
			detail: 'program->accept (&printer) has returned'
		});

		const at = find(trace, (e) => e.kind === 'line' && e.nodeClass === 'IfStatementNode');
		const rows = callStack(trace, index, at);
		// IfStatementNode, CompoundStatementNode, FunctionDeclarationNode, ProgramNode.
		expect(rows.map((r) => r.kind)).toEqual([
			'visit',
			'accept',
			'visit',
			'accept',
			'visit',
			'accept',
			'visit',
			'accept',
			'driver'
		]);
		expect(rows[0]).toMatchObject({
			name: 'PrintVisitor::visit (IfStatementNode*)',
			summary: 'IfStatementNode',
			top: true
		});
		expect(rows[0].span!.line).toBe(lineOf('if (v == 0)'));
		expect(rows[1]).toMatchObject({
			name: 'IfStatementNode::accept',
			detail: 'stmt->accept (this); stmt is a StatementNode*',
			span: null
		});
	});

	it('shows the locals of a call that waits for another', () => {
		const { trace, index } = setup(FOLDS, 'fold');
		const at = find(
			trace,
			(e) =>
				e.kind === 'line' && e.nodeClass === 'IntegerLiteralExpressionNode' && e.text.includes('3')
		);
		const rows = callStack(trace, index, at);
		expect(rows[0].locals).toEqual([]);
		const times = rows.find(
			(r) => r.name === 'ConstantFolder::visit (MultiplicativeExpressionNode*)'
		)!;
		expect(times.locals).toEqual([
			{ name: 'leftConstant', value: 'true' },
			{ name: 'left', value: '2' }
		]);
		const plus = rows.find((r) => r.name === 'ConstantFolder::visit (AdditiveExpressionNode*)')!;
		expect(plus.locals).toEqual([]);
	});
});

describe('the tree', () => {
	it('has a row per node in preorder', () => {
		const rows = visitRows(tree);
		expect(visitRows(tree)).toBe(rows);
		expect(rows[0]).toMatchObject({ id: 0, depth: 0, field: null, label: 'ProgramNode' });
		expect(rows[1]).toMatchObject({
			field: 'declarations[0]',
			label: 'FunctionDeclarationNode INT gcd',
			line: lineOf('int gcd')
		});
		expect(rows.map((r) => r.id)).toEqual(rows.map((_, i) => i));
	});

	it('tells where each node stands at a step', () => {
		const trace = visitorTrace(program, 'print');
		const index = traceIndex(trace, tree);
		const visit = index.visitAt[5];
		expect(visitStatus(trace, index, visit - 2, 5)).toBe('pending');
		expect(visitStatus(trace, index, visit, 5)).toBe('current');
		expect(visitStatus(trace, index, visit + 1, 5)).toBe('current');
		expect(visitStatus(trace, index, visit, 0)).toBe('open');
		expect(visitStatus(trace, index, index.returnAt[5] + 1, 5)).toBe('done');
		expect(visitStatus(trace, index, trace.events.length - 1, 0)).toBe('current');
		expect(visitStatus(trace, index, trace.events.length - 1, 5)).toBe('done');
	});

	it('lists every row of a short tree, and a window of the limit around the current node of a long one', () => {
		const rows = visitRows(tree);
		expect(rows.length).toBeGreaterThan(30);
		expect(rowWindow(rows, null, 800)).toEqual({ start: 0, end: rows.length });
		expect(rowWindow(rows, 30, Infinity)).toEqual({ start: 0, end: rows.length });
		expect(rowWindow(rows, null, 10)).toEqual({ start: 0, end: 10 });
		expect(rowWindow(rows, 9999, 10)).toEqual({ start: 0, end: 10 });
		expect(rowWindow(rows, 3, 10)).toEqual({ start: 0, end: 10 });
		expect(rowWindow(rows, 20, 10)).toEqual({ start: 18, end: 28 });
		expect(rowWindow(rows, rows.at(-1)!.id, 10)).toEqual({
			start: rows.length - 10,
			end: rows.length
		});
		for (let at = 0; at < rows.length; at++) {
			const { start, end } = rowWindow(rows, rows[at].id, 10);
			// Never more than the limit; the current node with room on both sides where the tree has it.
			expect(end - start).toBe(10);
			expect(at - start).toBeGreaterThanOrEqual(Math.min(2, at));
			expect(end - 1 - at).toBeGreaterThanOrEqual(Math.min(2, rows.length - 1 - at));
		}
		// The window moves half the limit at a time.
		const starts = new Set(rows.map((r) => rowWindow(rows, r.id, 10).start));
		expect(starts.size).toBeLessThanOrEqual(Math.ceil(rows.length / 5) + 1);
	});

	it('keeps a long program at the limit wherever the run is', () => {
		const long = Array.from({ length: 300 }, (_, i) => `  x = x + ${i};`).join('\n');
		const p = compile(`void main(void)\n{\n  int x;\n${long}\n}`).parse!.program;
		const rows = visitRows(visitorTree(p));
		expect(rows.length).toBeGreaterThan(1000);
		const trace = visitorTrace(p, 'print');
		for (const at of [0, trace.events.length >> 1, trace.events.length - 2]) {
			const node = trace.events[at].node;
			const { start, end } = rowWindow(rows, node, 800);
			expect(end - start).toBe(800);
			const i = rows.findIndex((r) => r.id === node);
			expect(i).toBeGreaterThanOrEqual(start);
			expect(i).toBeLessThan(end);
		}
	});
});

describe('what the visitor holds', () => {
	it('PrintVisitor: level and out', () => {
		const trace = visitorTrace(program, 'print');
		expect(membersAt(trace, -1)).toEqual([{ name: 'level', value: '0' }]);
		expect(printedLines(trace, 1)).toEqual([]);
		expect(printedLines(trace, 2)).toEqual([{ node: 0, text: 'ProgramNode' }]);
		const all = printedLines(trace, trace.events.length - 1);
		expect(all).toHaveLength(visitRows(tree).length);
		expect(all[1]).toEqual({ node: 1, text: '  FunctionDeclarationNode INT gcd' });
	});

	it('SymbolTableVisitor: the open scopes, their names and the errors', () => {
		const { trace, index } = setup(SCOPES, 'symbols');
		expect(scopeTables(trace, index, -1)).toEqual([
			{
				id: 0,
				level: 0,
				title: 'global scope',
				node: null,
				entries: [
					{ name: 'input', nodeClass: null, level: 0, node: null, line: null },
					{ name: 'output', nodeClass: null, level: 0, node: null, line: null }
				]
			}
		]);
		const at = find(trace, (e) => e.kind === 'line' && e.text.startsWith('z is in no open scope'));
		const tables = scopeTables(trace, index, at);
		expect(tables.map((t) => [t.level, t.title])).toEqual([
			[0, 'global scope'],
			[1, 'function main'],
			[2, 'block on line 5'],
			[3, 'block on line 5']
		]);
		expect(tables[0].entries.map((e) => `${e.name} ${e.nodeClass} ${e.line}`)).toEqual([
			'input null null',
			'output null null',
			'x VariableDeclarationNode 1',
			'main FunctionDeclarationNode 2'
		]);
		expect(tables[3].entries.map((e) => e.name)).toEqual(['y']);
		expect(errorsAt(trace, index, at)).toEqual([
			{ node: expect.any(Number), message: 'z is not declared', line: 5 }
		]);
		expect(errorsAt(trace, index, at - 1)).toEqual([]);
		expect(membersAt(trace, at)).toEqual([
			{ name: 'scopes.size ()', value: '4' },
			{ name: 'functionBody', value: 'false' },
			{ name: 'errors.size ()', value: '1' }
		]);
		const end = scopeTables(trace, index, trace.events.length - 1);
		expect(end.map((t) => t.id)).toEqual([0]);
	});

	it('SymbolTableVisitor: a name declared twice is listed once, with its last declaration', () => {
		const { trace, index } = setup('void main(void) { int a; int a[3]; }', 'symbols');
		const at = find(
			trace,
			(e) => e.kind === 'line' && e.lines[0] === 'ArrayDeclarationNode.declare'
		);
		const tables = scopeTables(trace, index, at);
		expect(tables[1].entries).toEqual([
			{ name: 'a', nodeClass: 'ArrayDeclarationNode', level: 1, node: expect.any(Number), line: 1 }
		]);
		expect(errorsAt(trace, index, at).map((e) => e.message)).toEqual([
			'a is already declared in this scope'
		]);
	});

	it('ConstantFolder: the folded values with their expressions', () => {
		const { c, trace, index } = setup(FOLDS, 'fold');
		const folds = foldsAt(trace, index, c.source, trace.events.length - 1);
		expect(folds.map((f) => [f.source, f.text, f.value, f.line])).toEqual([
			['2 * 3', '2 * 3 = 6', 6, 1],
			['2 * 3 + 1', '6 + 1 = 7', 7, 1]
		]);
		expect(foldsAt(trace, index, c.source, 0)).toEqual([]);
		expect(membersAt(trace, trace.events.length - 1).map((m) => m.value)).toEqual([
			'false',
			'0',
			'2'
		]);
	});

	it('knows what each step added', () => {
		const trace = visitorTrace(program, 'print');
		expect(addedNodes(trace, 0)).toEqual(new Set());
		expect(addedNodes(trace, 2)).toEqual(new Set([0]));
		expect(addedNodes(trace, 3)).toEqual(new Set());
		expect(addedNodes(trace, trace.events.length)).toEqual(new Set());
		const { trace: symbols } = setup('void main(void) { int x; y = x; }', 'symbols');
		const at = symbols.events.findIndex((e) => e.text.startsWith('y is in no open scope'));
		// The lookup and the error, both of the node of y.
		expect(addedNodes(symbols, at)).toEqual(new Set([symbols.events[at].node]));
		expect(symbols.events[at].output - symbols.events[at - 1].output).toBe(2);
	});

	it('finds the text of a node', () => {
		const index = traceIndex(visitorTrace(program, 'print'), tree);
		const range = rangeOfNode(index, 1)!;
		expect(GCD.slice(range.start, range.end)).toMatch(/^int gcd\(int u, int v\)/);
		expect(rangeOfNode(index, null)).toBeNull();
		expect(rangeOfNode(index, 9999)).toBeNull();
	});
});
