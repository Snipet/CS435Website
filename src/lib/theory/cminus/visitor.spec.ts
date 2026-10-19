import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import {
	COURSE_FIELDS,
	courseAst,
	courseChildren,
	type CourseClass,
	type CourseNode
} from './courseAst';
import { SAMPLES, UNDECLARED_SOURCE } from './samples';
import {
	BASE_CLASS,
	CHILD_FIELDS,
	CONCRETE_CLASSES,
	IVISITOR_CODE,
	VISITORS,
	VISITOR_IDS,
	VISIT_OVERLOADS,
	acceptCode,
	isA,
	nestLevels,
	nodeSummary,
	printedText,
	traceVisitor,
	withArticle,
	type VisitTrace,
	type VisitorId
} from './visitor';

/** Every construct of C-, the extensions included. */
const SOURCE = `int count;
int list[10];
int f(int x, int v[])
{
  int k;
  for (k = 0; k < x; ++k)
    v[k] = k * 2 + 1;
  if (x == 0) return 0; else return v[x - 1];
}
void main(void)
{
  while (count < 3) { count = count + 1; }
  for (;;) { --count; ; return; }
  output(f(3, list));
}`;

const PRINTED = `ProgramNode
  VariableDeclarationNode INT count
  ArrayDeclarationNode ARRAY list[10]
  FunctionDeclarationNode INT f
    ParameterNode INT x
    ParameterNode ARRAY v
    CompoundStatementNode
      VariableDeclarationNode INT k
      ForStatementNode
        AssignmentExpressionNode
          VariableExpressionNode k
          IntegerLiteralExpressionNode 0
        RelationalExpressionNode LT
          VariableExpressionNode k
          VariableExpressionNode x
        UnaryExpressionNode INCREMENT
          VariableExpressionNode k
        ExpressionStatementNode
          AssignmentExpressionNode
            SubscriptExpressionNode v
              VariableExpressionNode k
            AdditiveExpressionNode PLUS
              MultiplicativeExpressionNode TIMES
                VariableExpressionNode k
                IntegerLiteralExpressionNode 2
              IntegerLiteralExpressionNode 1
      IfStatementNode
        RelationalExpressionNode EQ
          VariableExpressionNode x
          IntegerLiteralExpressionNode 0
        ReturnStatementNode
          IntegerLiteralExpressionNode 0
        ReturnStatementNode
          SubscriptExpressionNode v
            AdditiveExpressionNode MINUS
              VariableExpressionNode x
              IntegerLiteralExpressionNode 1
  FunctionDeclarationNode VOID main
    CompoundStatementNode
      WhileStatementNode
        RelationalExpressionNode LT
          VariableExpressionNode count
          IntegerLiteralExpressionNode 3
        CompoundStatementNode
          ExpressionStatementNode
            AssignmentExpressionNode
              VariableExpressionNode count
              AdditiveExpressionNode PLUS
                VariableExpressionNode count
                IntegerLiteralExpressionNode 1
      ForStatementNode
        CompoundStatementNode
          ExpressionStatementNode
            UnaryExpressionNode DECREMENT
              VariableExpressionNode count
          ExpressionStatementNode
          ReturnStatementNode
      ExpressionStatementNode
        CallExpressionNode output
          CallExpressionNode f
            IntegerLiteralExpressionNode 3
            VariableExpressionNode list
`;

const NESTED = `int x;
void main(void)
{
  int x;
  { int x; x = 1; { int y; y = x; } }
  x = 2;
}`;

/** The programs every visitor runs on: the samples (all of them parse) and the two above. */
const PROGRAMS: { name: string; source: string }[] = [
	{ name: 'all constructs', source: SOURCE },
	{ name: 'nested blocks', source: NESTED },
	...SAMPLES.map((s) => ({ name: s.id, source: s.source }))
];

function treeOf(source: string): CourseNode {
	const c = compile(source);
	if (!c.parse?.ok) throw new Error(`does not parse: ${source}`);
	return courseAst(c.parse.program);
}

interface Walked {
	node: CourseNode;
	depth: number;
	field: string | null;
}

/** Preorder in the header's field order, with the field as "Class::field". */
function preorder(root: CourseNode): Walked[] {
	const out: Walked[] = [];
	const go = (node: CourseNode, depth: number, field: string | null) => {
		out.push({ node, depth, field });
		for (const c of courseChildren(node)) go(c.node, depth + 1, `${node.node}::${c.field}`);
	};
	go(root, 0, null);
	return out;
}

const traces = new Map<string, VisitTrace>();
function trace(source: string, visitor: VisitorId): VisitTrace {
	const key = `${visitor}\n${source}`;
	let t = traces.get(key);
	if (!t) {
		t = traceVisitor(treeOf(source), visitor);
		traces.set(key, t);
	}
	return t;
}

const codeIds = (visitor: VisitorId) =>
	VISITORS[visitor].code.flatMap((l) => (l.id === null ? [] : [l.id]));

describe('the header', () => {
	it('declares a visit overload per class but Node, in the header order', () => {
		expect(VISIT_OVERLOADS).toHaveLength(23);
		expect(CONCRETE_CLASSES).toHaveLength(20);
		expect(Object.keys(COURSE_FIELDS).sort()).toEqual([...CONCRETE_CLASSES].sort());
		const overloads = IVISITOR_CODE.filter((l) => l.id !== null);
		expect(overloads.map((l) => l.id)).toEqual(VISIT_OVERLOADS);
		expect(overloads[8].text).toBe('  virtual void visit (IfStatementNode* node) = 0;');
		expect(IVISITOR_CODE[0].text).toBe('class IVisitor');
		expect(IVISITOR_CODE.at(-1)!.text).toBe('};');
	});

	it('defines accept as a call of visit on this', () => {
		expect(acceptCode('IfStatementNode').map((l) => l.text)).toEqual([
			'void IfStatementNode::accept (IVisitor* visitor)',
			'{',
			'  visitor->visit (this);',
			'}'
		]);
		expect(acceptCode('ProgramNode').map((l) => l.id)).toEqual([
			'accept.sig',
			null,
			'accept.visit',
			null
		]);
	});

	it('knows the base classes', () => {
		expect(isA('SubscriptExpressionNode', 'VariableExpressionNode')).toBe(true);
		expect(isA('SubscriptExpressionNode', 'ExpressionNode')).toBe(true);
		expect(isA('ArrayDeclarationNode', 'VariableDeclarationNode')).toBe(true);
		expect(isA('ArrayDeclarationNode', 'DeclarationNode')).toBe(true);
		expect(isA('IfStatementNode', 'Node')).toBe(true);
		expect(isA('IfStatementNode', 'ExpressionNode')).toBe(false);
		expect(isA('VariableExpressionNode', 'SubscriptExpressionNode')).toBe(false);
		for (const cls of CONCRETE_CLASSES) expect(isA(cls, 'Node')).toBe(true);
		expect(BASE_CLASS.Node).toBeNull();
	});

	it('lists the child fields of each class in the order of its fields', () => {
		for (const cls of CONCRETE_CLASSES) {
			const names = CHILD_FIELDS[cls].map((f) => f.name);
			expect(COURSE_FIELDS[cls].filter((f) => names.includes(f))).toEqual(names);
		}
		// In real trees: exactly the fields that hold a node, a vector or nullptr.
		for (const { source } of PROGRAMS) {
			for (const { node } of preorder(treeOf(source))) {
				const pointers = node.fields
					.filter((f) => ['node', 'list', 'null'].includes(f.value.kind))
					.map((f) => f.name);
				expect(pointers).toEqual(CHILD_FIELDS[node.node].map((f) => f.name));
				for (const f of CHILD_FIELDS[node.node]) {
					const value = node.fields.find((x) => x.name === f.name)!.value;
					if (f.kind === 'pointer') expect(value.kind).toBe('node');
					if (f.kind === 'vector') expect(value.kind).toBe('list');
					if (value.kind === 'node') expect(isA(value.node.node, f.type)).toBe(true);
					if (value.kind === 'list')
						for (const n of value.nodes) expect(isA(n.node, f.type)).toBe(true);
				}
			}
		}
	});

	it('writes nodes on one line with their key fields', () => {
		const lines = preorder(treeOf(SOURCE)).map((w) => nodeSummary(w.node));
		expect(lines).toContain('FunctionDeclarationNode INT f');
		expect(lines).toContain('ArrayDeclarationNode ARRAY list[10]');
		expect(lines).toContain('ParameterNode ARRAY v');
		expect(lines).toContain('UnaryExpressionNode DECREMENT');
		expect(lines).toContain('IfStatementNode');
		expect(withArticle('IfStatementNode')).toBe('an IfStatementNode');
		expect(withArticle('StatementNode*')).toBe('a StatementNode*');
	});
});

describe('the code of the visitors', () => {
	it.each(VISITOR_IDS.map((id) => [id]))('%s: ids are unique and cover every method', (id) => {
		const ids = codeIds(id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain('main.accept');
		for (const cls of CONCRETE_CLASSES) {
			expect(ids).toContain(`${cls}.sig`);
			expect(ids).toContain(`${cls}.end`);
			const sig = VISITORS[id].code.find((l) => l.id === `${cls}.sig`)!;
			expect(sig.text).toBe(`  void visit (${cls}* node) override`);
		}
		// The three abstract overloads are there too, so the class can be instantiated.
		const text = VISITORS[id].code.map((l) => l.text).join('\n');
		for (const cls of ['DeclarationNode', 'StatementNode', 'ExpressionNode'])
			expect(text).toContain(`void visit (${cls}* node) override { }`);
		expect(text).toContain(`struct ${VISITORS[id].name} : IVisitor`);
		expect(text).toContain(`program->accept (&${VISITORS[id].instance});`);
		expect(text).toContain(`void ${VISITORS[id].driver} (ProgramNode* program)`);
	});

	it.each(VISITOR_IDS.map((id) => [id]))('%s: every line an event runs is in the code', (id) => {
		const ids = new Set(codeIds(id));
		const used = new Set<string>();
		for (const { source } of PROGRAMS) {
			for (const e of trace(source, id).events) {
				expect(e.lines.length).toBeGreaterThan(0);
				for (const line of [...e.lines, ...e.helper]) {
					expect(ids, `${id}: ${line}`).toContain(line);
					used.add(line);
				}
			}
		}
		// The programs reach every visit method.
		for (const cls of CONCRETE_CLASSES) expect(used).toContain(`${cls}.sig`);
	});
});

describe('every trace', () => {
	const cases = PROGRAMS.flatMap((p) => VISITOR_IDS.map((v) => [p.name, v, p.source] as const));

	it.each(cases)('%s, %s: visits in preorder, in the order of the fields', (_, visitor, source) => {
		const tree = treeOf(source);
		const t = trace(source, visitor);
		const walked = preorder(tree);
		const visits = t.events.filter((e) => e.kind === 'visit');
		expect(visits.map((e) => e.node)).toEqual(walked.map((w) => w.node.id));
		expect(visits.map((e) => e.field)).toEqual(walked.map((w) => w.field));
		expect(visits.map((e) => e.depth)).toEqual(walked.map((w) => w.depth));
		expect(visits.map((e) => e.nodeClass)).toEqual(walked.map((w) => w.node.node));
		expect(t.truncated).toBe(false);
	});

	it.each(cases)('%s, %s: keeps the calls on a stack', (_, visitor, source) => {
		const t = trace(source, visitor);
		/** Event indices of the open accept and visit calls. */
		const stack: number[] = [];
		const visitNodes: number[] = [];
		t.events.forEach((e, i) => {
			switch (e.kind) {
				case 'accept':
					expect(e.depth).toBe(visitNodes.length);
					expect(e.below).toBe(stack.at(-1) ?? -1);
					expect(isA(e.nodeClass, e.pointer!)).toBe(true);
					stack.push(i);
					break;
				case 'visit':
					expect(t.events[i - 1].kind).toBe('accept');
					expect(t.events[i - 1].node).toBe(e.node);
					expect(e.below).toBe(i - 1);
					expect(e.pointer).toBe(e.nodeClass);
					expect(e.lines).toEqual([`${e.nodeClass}.sig`]);
					stack.push(i);
					visitNodes.push(e.node);
					break;
				case 'line':
					expect(e.node).toBe(visitNodes.at(-1));
					expect(e.depth).toBe(visitNodes.length - 1);
					break;
				case 'return':
					expect(e.node).toBe(visitNodes.pop());
					expect(e.depth).toBe(visitNodes.length);
					expect(e.lines.at(-1)).toBe(`${e.nodeClass}.end`);
					stack.pop();
					stack.pop();
					break;
			}
			expect(e.top).toBe(stack.at(-1) ?? -1);
			// Following `below` from the top gives the whole stack.
			const chain: number[] = [];
			for (let at = e.top; at >= 0; at = t.events[at].below) chain.unshift(at);
			expect(chain).toEqual(stack);
			if (i > 0) expect(e.output).toBeGreaterThanOrEqual(t.events[i - 1].output);
			expect(e.members).toHaveLength(VISITORS[visitor].members.length);
		});
		expect(stack).toEqual([]);
		expect(t.events[0].kind).toBe('accept');
		expect(t.events[0].lines).toEqual(['main.accept']);
		expect(t.events.at(-1)!.kind).toBe('return');
		expect(t.events.at(-1)!.output).toBe(t.output.length);
		expect(t.events[0].output).toBeGreaterThanOrEqual(t.initial);
	});

	it.each(cases)('%s, %s: is plain data', (_, visitor, source) => {
		const t = trace(source, visitor);
		expect(structuredClone(t)).toEqual(t);
	});

	it('names the field and the pointer type of every call', () => {
		const t = trace(SOURCE, 'print');
		const accept = (field: string) =>
			t.events.find((e) => e.kind === 'accept' && e.field === field)!;
		expect(accept('IfStatementNode::thenStatement').pointer).toBe('StatementNode');
		expect(accept('IfStatementNode::thenStatement').nodeClass).toBe('ReturnStatementNode');
		const assign = accept('AssignmentExpressionNode::variable');
		expect(assign.pointer).toBe('VariableExpressionNode');
		// The static type of a call through a field is not always the class of the node.
		const sub = t.events.find(
			(e) =>
				e.kind === 'accept' &&
				e.nodeClass === 'SubscriptExpressionNode' &&
				e.field?.endsWith('::variable')
		)!;
		expect(sub.pointer).toBe('VariableExpressionNode');
		expect(sub.text).toContain('accept is virtual, and the node is a SubscriptExpressionNode');
		const array = t.events.find(
			(e) => e.kind === 'accept' && e.nodeClass === 'ArrayDeclarationNode'
		)!;
		expect(array.field).toBe('ProgramNode::declarations[1]');
		expect(array.pointer).toBe('DeclarationNode');
		expect(array.lines).toEqual(['ProgramNode.declarations', 'ProgramNode.declarations.for']);
		const root = t.events[0];
		expect(root.field).toBeNull();
		expect(root.pointer).toBe('ProgramNode');
		expect(root.text).toBe(
			'printTree calls program->accept (&printer): program is a ProgramNode*, so ProgramNode::accept runs.'
		);
		const visit = t.events[1];
		expect(visit.text).toBe(
			'ProgramNode::accept calls visitor->visit (this). this is a ProgramNode*, so the overload visit (ProgramNode*) is chosen; visit is virtual, so PrintVisitor::visit (ProgramNode*) runs.'
		);
	});

	it('reports a null pointer and an empty vector as a step of their own', () => {
		const t = trace(SOURCE, 'print');
		const lines = t.events.filter((e) => e.kind === 'line').map((e) => e.text);
		expect(lines).toContain('node->initializer is nullptr: nothing to visit.');
		expect(lines).toContain('node->expression is nullptr: nothing to visit.');
		expect(lines).toContain('node->parameters is empty: nothing to visit.');
		const elseEvent = t.events.find((e) => e.field === 'IfStatementNode::elseStatement')!;
		expect(elseEvent.lines).toEqual([
			'IfStatementNode.elseStatement',
			'IfStatementNode.elseStatement.if'
		]);
	});

	it('stops at maxEvents', () => {
		const t = traceVisitor(treeOf(SOURCE), 'symbols', { maxEvents: 25 });
		expect(t.events).toHaveLength(25);
		expect(t.truncated).toBe(true);
	});
});

describe('PrintVisitor', () => {
	it('prints the outline of a program', () => {
		expect(printedText(trace(SOURCE, 'print'))).toBe(PRINTED);
	});

	it.each(PROGRAMS.map((p) => [p.name, p.source]))(
		'%s: a line per node, indented by depth',
		(_, source) => {
			const expected = preorder(treeOf(source))
				.map((w) => `${'  '.repeat(w.depth)}${nodeSummary(w.node)}\n`)
				.join('');
			expect(printedText(trace(source, 'print'))).toBe(expected);
		}
	);

	it('prints a line when it visits the node, and keeps level as deep as the node', () => {
		const t = trace(SOURCE, 'print');
		expect(printedText(t, -1)).toBe('');
		expect(printedText(t, 2)).toBe('ProgramNode\n');
		for (const e of t.events) {
			if (e.kind === 'visit') expect(e.members).toEqual([String(e.depth)]);
		}
		expect(t.events.at(-1)!.members).toEqual(['0']);
		const ret = t.events.find((e) => e.kind === 'return' && e.nodeClass === 'IfStatementNode')!;
		expect(ret.lines).toEqual(['IfStatementNode.out', 'IfStatementNode.end']);
		expect(ret.text).toMatch(/^--level: back to level 3\. /);
	});
});

describe('SymbolTableVisitor', () => {
	it.each(PROGRAMS.map((p) => [p.name, p.source]))(
		'%s: sets the nestLevel the semantic analyzer gives',
		(_, source) => {
			const c = compile(source);
			const tree = courseAst(c.parse!.program, { semantic: c.semantic });
			const levels = nestLevels(trace(source, 'symbols'));
			let declarations = 0;
			for (const { node } of preorder(tree)) {
				const field = node.fields.find((f) => f.name === 'nestLevel');
				if (!field) continue;
				declarations++;
				expect(field.value.kind).toBe('int');
				if (field.value.kind === 'int') expect(levels.get(node.id)).toBe(field.value.value);
			}
			expect(levels.size).toBe(declarations);
		}
	);

	it.each(PROGRAMS.map((p) => [p.name, p.source]))(
		'%s: opens the scopes the analyzer opens and resolves every name as it does',
		(_, source) => {
			const c = compile(source);
			const semantic = c.semantic!;
			const t = trace(source, 'symbols');
			expect(t.output.filter((r) => r.kind === 'scope')).toHaveLength(semantic.scopes.length);
			const uses = t.output.filter((r) => r.kind === 'use');
			expect(uses.length).toBeGreaterThan(0);
			for (const use of uses) {
				const symbol = semantic.refs.get(use.node);
				if (symbol === undefined) {
					expect(use.declaration).toBeNull();
					expect(use.level).toBeNull();
				} else {
					expect(use.declaration).toBe(semantic.symbols[symbol].node);
					expect(use.level).toBe(semantic.symbols[symbol].depth);
				}
			}
			expect(t.events.at(-1)!.scopes).toEqual([0]);
		}
	);

	it('starts with input and output in the global scope', () => {
		const t = trace(SOURCE, 'symbols');
		expect(t.initial).toBe(3);
		expect(t.output.slice(0, 3)).toEqual([
			{ kind: 'scope', scope: 0, level: 0, node: null },
			{ kind: 'declare', node: null, name: 'input', nodeClass: null, level: 0, scope: 0 },
			{ kind: 'declare', node: null, name: 'output', nodeClass: null, level: 0, scope: 0 }
		]);
		expect(t.members).toEqual(['1', 'false', '0']);
	});

	it('keeps the body of a function in the scope of its parameters', () => {
		const t = trace(NESTED, 'symbols');
		const declares = t.output.filter((r) => r.kind === 'declare' && r.node !== null);
		expect(declares.map((r) => (r.kind === 'declare' ? `${r.name} ${r.level}` : ''))).toEqual([
			'x 0',
			'main 0',
			'x 1',
			'x 2',
			'y 3'
		]);
		// y = x in the innermost block: the x of nestLevel 2.
		const y = t.output.filter((r) => r.kind === 'use' && r.name === 'x');
		expect(y.map((r) => (r.kind === 'use' ? r.level : null))).toEqual([2, 2, 1]);
		const flags = t.events.filter(
			(e) => e.kind === 'line' && e.lines[0] === 'CompoundStatementNode.new'
		);
		expect(flags.map((e) => e.locals)).toEqual([
			[{ name: 'newScope', value: 'false' }],
			[{ name: 'newScope', value: 'true' }],
			[{ name: 'newScope', value: 'true' }]
		]);
	});

	it('reports names that are not declared and names declared twice', () => {
		const undeclared = trace(UNDECLARED_SOURCE, 'symbols');
		const errors = (t: VisitTrace) =>
			t.output.flatMap((r) => (r.kind === 'error' ? [r.message] : []));
		expect(errors(undeclared)).toEqual(['y is not declared', 'z is not declared']);
		expect(undeclared.events.at(-1)!.members).toEqual(['1', 'false', '2']);
		const c = compile(UNDECLARED_SOURCE);
		expect(c.semantic!.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(2);

		const twice = trace('int input;\nvoid main(void) { int a; int a; { int a; } }', 'symbols');
		expect(errors(twice)).toEqual([
			'input is already declared in this scope',
			'a is already declared in this scope'
		]);
		const error = twice.events.find((e) => e.helper.includes('declare.error'))!;
		expect(error.text).toContain('input is already in this scope');
	});
});

describe('ConstantFolder', () => {
	const FOLDS = `void main(void)
{
  int x;
  x = 2 * 3 + 1;
  x = x + 1;
  x = 7 / 0;
  x = (1 < 2) == 1;
  output(4 - 6);
  output(2147483647 + 1);
}`;

	it('folds the operators whose operands are constants', () => {
		const t = trace(FOLDS, 'fold');
		const folds = t.output.flatMap((r) =>
			r.kind === 'fold' ? [`${r.left} ${r.op} ${r.right} = ${r.value}`] : []
		);
		expect(folds).toEqual([
			'2 * 3 = 6',
			'6 + 1 = 7',
			'1 < 2 = 1',
			'1 == 1 = 1',
			'4 - 6 = -2',
			'2147483647 + 1 = -2147483648'
		]);
		expect(t.events.at(-1)!.members[2]).toBe('6');
	});

	it('leaves a division by zero and variables alone', () => {
		const t = trace(FOLDS, 'fold');
		const texts = t.events.map((e) => e.text);
		expect(texts).toContain('7 / 0 is a division by zero: isConstant = false, nothing is folded.');
		expect(texts).toContain(
			'The left operand is not a constant: isConstant = false, nothing is folded.'
		);
		const zero = t.events.find((e) => e.text.startsWith('7 / 0'))!;
		expect(zero.lines).toEqual([
			'MultiplicativeExpressionNode.both',
			'MultiplicativeExpressionNode.zero',
			'MultiplicativeExpressionNode.no',
			'MultiplicativeExpressionNode.if'
		]);
	});

	it('keeps the left operand in a local of the call while it visits the right one', () => {
		const t = trace(FOLDS, 'fold');
		const i = t.events.findIndex(
			(e) => e.kind === 'accept' && e.field === 'MultiplicativeExpressionNode::right'
		);
		expect(t.events[i].locals).toEqual([
			{ name: 'leftConstant', value: 'true' },
			{ name: 'left', value: '2' }
		]);
		expect(t.events[i + 1].locals).toEqual([]);
		expect(t.events[i - 1].members).toEqual(['true', '2', '0']);
		const folded = t.events.find((e) => e.text.startsWith('Both operands are constants: 2 * 3'))!;
		expect(folded.lines).toEqual([
			'MultiplicativeExpressionNode.both',
			'MultiplicativeExpressionNode.zero',
			'MultiplicativeExpressionNode.if',
			'MultiplicativeExpressionNode.op',
			'MultiplicativeExpressionNode.then',
			'MultiplicativeExpressionNode.record'
		]);
		expect(folded.members).toEqual(['true', '6', '1']);
	});

	it('finds nothing to fold in a program without constant operators', () => {
		expect(trace(SAMPLES[0].source, 'fold').output).toEqual([]);
	});
});

describe('every class', () => {
	it('is visited by the programs of this spec', () => {
		const seen = new Set<CourseClass>();
		for (const { source } of PROGRAMS)
			for (const w of preorder(treeOf(source))) seen.add(w.node.node);
		expect([...seen].sort()).toEqual([...CONCRETE_CLASSES].sort());
	});
});
