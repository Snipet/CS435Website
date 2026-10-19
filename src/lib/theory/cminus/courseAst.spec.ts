import { describe, expect, it } from 'vitest';
import { allNodes, type AstNode } from './ast';
import { compile } from './compile';
import {
	COURSE_FIELDS,
	courseAst,
	courseAttributes,
	courseChildren,
	courseClass,
	courseLabel,
	courseValueText,
	printCourseAst,
	walkCourse,
	type CourseClass,
	type CourseNode,
	type CourseValue
} from './courseAst';
import { parseSource } from './parser';

const SOURCE = `int g;
int a[4];
int f(int n, int v[])
{
  int k;
  if (n < 1) return v[0];
  while (n > 0) n = n - 1;
  for (k = 0; k <= 2; ++k) --v[k];
  return f(n, v) * 2 / 1;
}
void main(void) { ; output(f(1, a)); }`;

const full = compile(SOURCE);
const program = full.parse!.program;
const tree = courseAst(program, { semantic: full.semantic, codegen: full.codegen });

/** Every course node in preorder. */
function nodes(root: CourseNode): CourseNode[] {
	const out: CourseNode[] = [];
	walkCourse(root, (node) => out.push(node));
	return out;
}

/** The value of a field of the first node of a class (or of the node with an identifier). */
function value(root: CourseNode, cls: CourseClass, name: string, identifier?: string): CourseValue {
	const node = nodes(root).find(
		(n) =>
			n.node === cls &&
			(identifier === undefined ||
				n.fields.some((f) => f.name === 'identifier' && courseValueText(f.value) === identifier))
	);
	if (!node) throw new Error(`no ${cls} ${identifier ?? ''}`);
	const field = node.fields.find((f) => f.name === name);
	if (!field) throw new Error(`${cls} has no field ${name}`);
	return field.value;
}

describe('the course classes', () => {
	it('every node of the engine becomes one node with the same id, span and preorder', () => {
		expect(full.stoppedAt).toBeNull();
		const engine = allNodes(program);
		const course = nodes(tree);
		expect(course.map((n) => n.id)).toEqual(engine.map((n) => n.id));
		expect(course.map((n) => n.span)).toEqual(engine.map((n) => n.span));
		expect(course.map((n) => n.node)).toEqual(engine.map(courseClass));
	});

	it('the program uses every one of the twenty classes', () => {
		const used = new Set(nodes(tree).map((n) => n.node));
		expect([...used].sort()).toEqual(Object.keys(COURSE_FIELDS).sort());
		expect(Object.keys(COURSE_FIELDS)).toHaveLength(20);
	});

	it('every node has the fields of its class, in the order of the header', () => {
		for (const n of nodes(tree)) {
			expect([n.node, n.fields.map((f) => f.name)]).toEqual([n.node, COURSE_FIELDS[n.node]]);
		}
		expect(COURSE_FIELDS.ArrayDeclarationNode).toEqual([
			'valueType',
			'identifier',
			'nestLevel',
			'framePointerOffset',
			'size'
		]);
		expect(COURSE_FIELDS.ForStatementNode).toEqual(['initializer', 'condition', 'updater', 'body']);
	});

	it('maps each kind of engine node', () => {
		const kinds: [string, CourseClass][] = [
			['int x;', 'VariableDeclarationNode'],
			['int x[3];', 'ArrayDeclarationNode']
		];
		for (const [text, cls] of kinds) {
			const r = parseSource(`${text} void main(void) { }`);
			expect(courseClass(r.program.decls[0])).toBe(cls);
		}
		const classOf = (text: string): CourseClass[] => {
			const r = parseSource(`void main(void) { int x; int a[2]; ${text}; }`);
			return allNodes(r.program)
				.slice(5)
				.map((n: AstNode) => courseClass(n));
		};
		expect(classOf('x = a[0] + 1')).toEqual([
			'ExpressionStatementNode',
			'AssignmentExpressionNode',
			'VariableExpressionNode',
			'AdditiveExpressionNode',
			'SubscriptExpressionNode',
			'IntegerLiteralExpressionNode',
			'IntegerLiteralExpressionNode'
		]);
		expect(classOf('x - 1 * 2 / 3 == 4')).toEqual([
			'ExpressionStatementNode',
			'RelationalExpressionNode',
			'AdditiveExpressionNode',
			'VariableExpressionNode',
			'MultiplicativeExpressionNode',
			'MultiplicativeExpressionNode',
			'IntegerLiteralExpressionNode',
			'IntegerLiteralExpressionNode',
			'IntegerLiteralExpressionNode',
			'IntegerLiteralExpressionNode'
		]);
	});
});

describe('fields', () => {
	it('ValueType: the return type, INT for a variable, ARRAY for an array or an array parameter', () => {
		const enumOf = (v: CourseValue) => (v.kind === 'enum' ? `${v.type}::${v.value}` : v.kind);
		expect(enumOf(value(tree, 'FunctionDeclarationNode', 'valueType', 'f'))).toBe('ValueType::INT');
		expect(enumOf(value(tree, 'FunctionDeclarationNode', 'valueType', 'main'))).toBe(
			'ValueType::VOID'
		);
		expect(enumOf(value(tree, 'VariableDeclarationNode', 'valueType', 'g'))).toBe('ValueType::INT');
		expect(enumOf(value(tree, 'ArrayDeclarationNode', 'valueType', 'a'))).toBe('ValueType::ARRAY');
		expect(enumOf(value(tree, 'ParameterNode', 'valueType', 'n'))).toBe('ValueType::INT');
		expect(enumOf(value(tree, 'ParameterNode', 'valueType', 'v'))).toBe('ValueType::ARRAY');
		// A void variable keeps VOID (the semantic analyzer reports it).
		const wrong = courseAst(parseSource('void x; void y[2]; void main(void) { }').program);
		expect(
			nodes(wrong)
				.slice(1, 3)
				.map((n) => courseValueText(n.fields[0].value))
		).toEqual(['VOID', 'VOID']);
	});

	it('identifier, size, isArray and value', () => {
		expect(value(tree, 'ArrayDeclarationNode', 'size', 'a')).toEqual({ kind: 'int', value: 4 });
		expect(value(tree, 'ParameterNode', 'isArray', 'v')).toEqual({ kind: 'bool', value: true });
		expect(value(tree, 'ParameterNode', 'isArray', 'n')).toEqual({ kind: 'bool', value: false });
		expect(value(tree, 'CallExpressionNode', 'identifier')).toEqual({
			kind: 'string',
			value: 'f'
		});
		expect(value(tree, 'IntegerLiteralExpressionNode', 'value')).toEqual({ kind: 'int', value: 1 });
	});

	it('the operators by the names of the header enums', () => {
		const ops = (text: string) =>
			nodes(courseAst(parseSource(`void main(void) { int x; ${text}; }`).program))
				.flatMap((n) => n.fields)
				.filter((f) => f.value.kind === 'enum' && f.name !== 'valueType')
				.map((f) => (f.value.kind === 'enum' ? `${f.name} ${f.value.type}::${f.value.value}` : ''));
		expect(ops('x + x - x')).toEqual([
			'addOperator AdditiveOperatorType::MINUS',
			'addOperator AdditiveOperatorType::PLUS'
		]);
		expect(ops('x * x / x')).toEqual([
			'multOperator MultiplicativeOperatorType::DIVIDE',
			'multOperator MultiplicativeOperatorType::TIMES'
		]);
		expect(
			['<', '<=', '>', '>=', '==', '!='].map((op) => ops(`x ${op} x`)[0].split('::')[1])
		).toEqual(['LT', 'LTE', 'GT', 'GTE', 'EQ', 'NEQ']);
		expect(ops('++x')).toEqual(['unaryOperator UnaryOperatorType::INCREMENT']);
		expect(ops('--x')).toEqual(['unaryOperator UnaryOperatorType::DECREMENT']);
	});

	it('a part that is not there is a null pointer, an empty list is empty', () => {
		const t = courseAst(parseSource('void main(void) { for (;;) if (1) return; ; }').program);
		const of = (cls: CourseClass) => nodes(t).find((n) => n.node === cls)!;
		expect(courseAttributes(of('ForStatementNode')).map((f) => f.name)).toEqual([
			'initializer',
			'condition',
			'updater'
		]);
		expect(
			of('ForStatementNode')
				.fields.slice(0, 3)
				.map((f) => f.value)
		).toEqual([{ kind: 'null' }, { kind: 'null' }, { kind: 'null' }]);
		expect(value(t, 'IfStatementNode', 'elseStatement')).toEqual({ kind: 'null' });
		expect(value(t, 'ReturnStatementNode', 'expression')).toEqual({ kind: 'null' });
		expect(value(t, 'ExpressionStatementNode', 'expression')).toEqual({ kind: 'null' });
		expect(value(t, 'FunctionDeclarationNode', 'parameters')).toEqual({ kind: 'list', nodes: [] });
		expect(value(t, 'CompoundStatementNode', 'localDeclarations')).toEqual({
			kind: 'list',
			nodes: []
		});
	});
});

describe('fields set by later phases', () => {
	it('nestLevel is the depth of the declaring scope once the symbol table is built', () => {
		const level = (cls: CourseClass, id: string) => value(tree, cls, 'nestLevel', id);
		expect(level('VariableDeclarationNode', 'g')).toEqual({ kind: 'int', value: 0 });
		expect(level('FunctionDeclarationNode', 'f')).toEqual({ kind: 'int', value: 0 });
		expect(level('ParameterNode', 'n')).toEqual({ kind: 'int', value: 1 });
		expect(level('VariableDeclarationNode', 'k')).toEqual({ kind: 'int', value: 1 });
		const nested = compile('void main(void) { int x; { int y; { int z; } } }');
		const t = courseAst(nested.parse!.program, { semantic: nested.semantic });
		expect(value(t, 'VariableDeclarationNode', 'nestLevel', 'z')).toEqual({
			kind: 'int',
			value: 3
		});
	});

	it('framePointerOffset is the offset from fp the code generator uses', () => {
		const offset = (cls: CourseClass, id: string) => value(tree, cls, 'framePointerOffset', id);
		const frame = full.codegen!.frames.find((fr) => fr.function === 'f')!;
		expect(frame.slots.slice(2).map((s) => [s.name, s.offset])).toEqual(
			expect.arrayContaining([
				['n', -2],
				['v', -3],
				['k', -4]
			])
		);
		expect(offset('ParameterNode', 'n')).toEqual({ kind: 'int', value: -2 });
		expect(offset('ParameterNode', 'v')).toEqual({ kind: 'int', value: -3 });
		expect(offset('VariableDeclarationNode', 'k')).toEqual({ kind: 'int', value: -4 });
		// A global has no frame: its offset from gp instead.
		expect(offset('VariableDeclarationNode', 'g')).toEqual({ kind: 'global', offset: 0 });
		expect(offset('ArrayDeclarationNode', 'a')).toEqual({ kind: 'global', offset: -4 });
		expect(courseValueText(offset('ArrayDeclarationNode', 'a'))).toBe('none: global, at -4(gp)');
		// A local array: the offset of element 0, its lowest cell.
		const local = compile('void main(void) { int x; int b[3]; b[0] = x; }');
		const t = courseAst(local.parse!.program, { semantic: local.semantic, codegen: local.codegen });
		expect(value(t, 'ArrayDeclarationNode', 'framePointerOffset', 'b')).toEqual({
			kind: 'int',
			value: -5
		});
	});

	it('are not set when the compilation stopped before the phase that sets them', () => {
		const parsedOnly = courseAst(program);
		for (const n of nodes(parsedOnly)) {
			for (const f of n.fields) {
				if (f.name === 'nestLevel') expect(f.value).toEqual({ kind: 'unset', phase: 'semantic' });
				if (f.name === 'framePointerOffset')
					expect(f.value).toEqual({ kind: 'unset', phase: 'codegen' });
			}
		}
		expect(courseValueText({ kind: 'unset', phase: 'semantic' })).toBe('not set');
		// Stopped at the semantic analyzer: the symbol table is there, the code is not.
		const c = compile('int x; void main(void) { int y; y = z; }');
		expect(c.stoppedAt).toBe('semantic');
		const t = courseAst(c.parse!.program, { semantic: c.semantic, codegen: c.codegen });
		expect(value(t, 'VariableDeclarationNode', 'nestLevel', 'y')).toEqual({
			kind: 'int',
			value: 1
		});
		expect(value(t, 'VariableDeclarationNode', 'framePointerOffset', 'y')).toEqual({
			kind: 'unset',
			phase: 'codegen'
		});
	});
});

describe('reading the tree', () => {
	it('courseChildren names the field of every child, with an index in a vector', () => {
		const f = courseChildren(tree)[2].node;
		expect(courseChildren(tree).map((c) => c.field)).toEqual([
			'declarations[0]',
			'declarations[1]',
			'declarations[2]',
			'declarations[3]'
		]);
		expect(courseChildren(f).map((c) => `${c.field}: ${c.node.node}`)).toEqual([
			'parameters[0]: ParameterNode',
			'parameters[1]: ParameterNode',
			'functionBody: CompoundStatementNode'
		]);
	});

	it('courseLabel names a node for a drawing', () => {
		const labels = allNodes(program).map(courseLabel);
		expect(labels.slice(0, 6)).toEqual([
			'ProgramNode',
			'VariableDeclarationNode g',
			'ArrayDeclarationNode a',
			'FunctionDeclarationNode f',
			'ParameterNode n',
			'ParameterNode v'
		]);
		expect(labels).toContain('RelationalExpressionNode LT');
		expect(labels).toContain('UnaryExpressionNode INCREMENT');
		expect(labels).toContain('UnaryExpressionNode DECREMENT');
		expect(labels).toContain('IntegerLiteralExpressionNode 2');
		expect(labels).toContain('ForStatementNode');
	});

	it('prints as indented text: the field, the class, then the other fields', () => {
		const c = compile('int x; void main(void) { int a[2]; if (x) ++a[0]; }');
		const t = courseAst(c.parse!.program, { semantic: c.semantic, codegen: c.codegen });
		expect(printCourseAst(t)).toBe(`ProgramNode
  declarations[0]: VariableDeclarationNode valueType INT, identifier x, nestLevel 0, framePointerOffset none: global, at 0(gp)
  declarations[1]: FunctionDeclarationNode valueType VOID, identifier main, nestLevel 0, parameters empty
    functionBody: CompoundStatementNode
      localDeclarations[0]: ArrayDeclarationNode valueType ARRAY, identifier a, nestLevel 1, framePointerOffset -3, size 2
      statements[0]: IfStatementNode elseStatement nullptr
        conditionalExpression: VariableExpressionNode identifier x
        thenStatement: ExpressionStatementNode
          expression: UnaryExpressionNode unaryOperator INCREMENT
            variable: SubscriptExpressionNode identifier a
              index: IntegerLiteralExpressionNode value 0`);
		expect(printCourseAst(courseAst(parseSource('void main(void) { }').program), { indent: '\t' }))
			.toBe(`ProgramNode
\tdeclarations[0]: FunctionDeclarationNode valueType VOID, identifier main, nestLevel not set, parameters empty
\t\tfunctionBody: CompoundStatementNode localDeclarations empty, statements empty`);
	});

	it('courseValueText writes each kind of value', () => {
		expect(
			(
				[
					{ kind: 'null' },
					{ kind: 'list', nodes: [] },
					{ kind: 'list', nodes: [tree, tree] },
					{ kind: 'node', node: tree },
					{ kind: 'enum', type: 'ValueType', value: 'INT' },
					{ kind: 'string', value: 'gcd' },
					{ kind: 'int', value: -2 },
					{ kind: 'bool', value: false },
					{ kind: 'unset', phase: 'codegen' },
					{ kind: 'global', offset: -1 }
				] as CourseValue[]
			).map(courseValueText)
		).toEqual([
			'nullptr',
			'empty',
			'2 nodes',
			'ProgramNode',
			'INT',
			'gcd',
			'-2',
			'false',
			'not set',
			'none: global, at -1(gp)'
		]);
	});

	it('is plain data: it survives a structured clone', () => {
		expect(structuredClone(tree)).toEqual(tree);
	});

	it('maps whatever parsed when the parser reported errors', () => {
		const c = compile('void main(void) { int x; x = ; ++x; }');
		expect(c.stoppedAt).toBe('parser');
		const t = courseAst(c.parse!.program, { semantic: c.semantic, codegen: c.codegen });
		expect(nodes(t).map((n) => n.node)).toEqual([
			'ProgramNode',
			'FunctionDeclarationNode',
			'CompoundStatementNode',
			'VariableDeclarationNode',
			'ExpressionStatementNode',
			'UnaryExpressionNode',
			'VariableExpressionNode'
		]);
	});
});
