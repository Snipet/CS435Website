import { describe, expect, it } from 'vitest';
import { layoutLines } from '$lib/components/ui/editor-lines';
import { pathKey } from '$lib/components/grammar/tree-layout';
import {
	PHASES,
	allNodes,
	compile,
	nodeLabel,
	type Compilation,
	type TmCode
} from '$lib/theory/cminus';
import { parseTM } from '$lib/tools/tiny-vm/parse';
import { PRESETS, presetById } from './presets';
import { nodeById, rangeOf, type SourceRange } from './selection';
import { TABS } from './state';
import { runProgram, type RunOutput } from './tasks';
import {
	MAX_DRAWN,
	MAX_EDITOR_DIAGNOSTICS,
	PASS_NAME,
	PHASE_NAME,
	PHASE_TAB,
	SELECTED_CLASS,
	SELECTED_LINE_CLASS,
	SMALL_TREE,
	STAGES,
	STOP_LABEL,
	TAB_LABEL,
	blockedBy,
	capGroups,
	declaredSymbols,
	drawingOf,
	drawnRoot,
	editorDiagnostics,
	firstOf,
	frameRows,
	globalRows,
	highlightSource,
	keepCollapsed,
	listingSections,
	logRows,
	nodeCount,
	outlineRows,
	phaseDiagnostics,
	quadGroups,
	scopeViews,
	selectionLineClasses,
	stageOfTab,
	stageViews,
	statusText,
	stopSpan,
	stopView,
	stoppedText,
	tokenClass,
	tokenCount,
	tokenRows
} from './views';

const source = (id: string) => presetById(id)!.value.source;
const GCD = source('gcd');
const gcd = compile(GCD);

function find(text: string, part: string, nth = 0): SourceRange {
	let at = text.startsWith('/*') ? text.indexOf('*/') + 1 : -1;
	for (let i = 0; i <= nth; i++) {
		at = text.indexOf(part, at + 1);
		if (at === -1) throw new Error(`"${part}" (${nth}) is not in the text`);
	}
	return { start: at, end: at + part.length };
}

const run = (c: Compilation, inputs: number[]): RunOutput =>
	runProgram({
		source: c.source,
		identifiers: c.options.identifiers,
		optimize: c.options.optimize,
		inputs,
		attempt: 0
	})!;

describe('the phase strip', () => {
	it('lists the seven phases in the order and wording of the slide, then the TINY Machine', () => {
		expect(STAGES.map((s) => s.name)).toEqual([
			'Scanner',
			'Parser',
			'Semantic analyzer',
			'Intermediate code generator',
			'Optimizer',
			'Code generator',
			'Peephole optimizer',
			'TINY Machine'
		]);
		expect(STAGES.map((s) => [s.tab, s.version])).toEqual([
			['tokens', undefined],
			['syntax', undefined],
			['semantics', undefined],
			['ir', 'before'],
			['ir', 'after'],
			['code', 'before'],
			['code', 'after'],
			['run', undefined]
		]);
		expect(Object.keys(PHASE_NAME)).toEqual([...PHASES]);
	});

	it('shows what every stage produced for a program that compiles and runs', () => {
		const stages = stageViews(gcd, run(gcd, [48, 18]));
		expect(stages.map((s) => [s.status, s.text])).toEqual([
			['done', '69 tokens'],
			['done', 'AST: 38 nodes'],
			['done', '3 scopes, 6 symbols'],
			['done', '26 quads'],
			['done', '−4 quads'],
			['done', '82 instructions'],
			['done', '−4 instructions'],
			['done', 'Halted, 1 number printed']
		]);
	});

	it('counts are those of the results', () => {
		expect(tokenCount(gcd.scan)).toBe(gcd.scan.tokens.length - 1);
		expect(nodeCount(gcd.parse!.program)).toBe(allNodes(gcd.parse!.program).length);
		expect(declaredSymbols(gcd)).toBe(gcd.semantic!.symbols.length - 2);
		expect(gcd.ir!.quads.length - gcd.optimized!.program.quads.length).toBe(4);
		expect(gcd.codegen!.code.instructions.length).toBe(82);
		expect(gcd.codegen!.peephole.code.instructions.length).toBe(78);
	});

	it('shows the error count of the stage that failed and "Not reached" after it', () => {
		const texts = (id: string) => stageViews(compile(source(id)), null).map((s) => s.text);
		const statuses = (id: string) => stageViews(compile(source(id)), null).map((s) => s.status);

		expect(texts('illegal-character')).toEqual(['1 error', ...Array(7).fill('Not reached')]);
		expect(statuses('illegal-character')).toEqual(['failed', ...Array(7).fill('not-reached')]);

		expect(texts('missing-semicolon').slice(0, 3)).toEqual(['22 tokens', '1 error', 'Not reached']);
		expect(statuses('missing-semicolon')).toEqual([
			'done',
			'failed',
			...Array(6).fill('not-reached')
		]);

		expect(texts('undeclared').slice(0, 4)).toEqual([
			'21 tokens',
			'AST: 11 nodes',
			'2 errors',
			'Not reached'
		]);
		expect(statuses('undeclared').slice(2)).toEqual(['failed', ...Array(5).fill('not-reached')]);
	});

	it('marks the optimizer as off, and the run as waiting, stopped or failed', () => {
		const plain = compile(GCD, { optimize: false });
		const off = stageViews(plain, null);
		expect(off[4]).toMatchObject({ status: 'off', text: 'Off' });
		expect(off[5]).toMatchObject({
			status: 'done',
			text: `${plain.codegen!.code.instructions.length} instructions`
		});
		expect(plain.codegen!.code.instructions.length).toBeGreaterThan(82);
		expect(off[7]).toMatchObject({ status: 'idle', text: 'Not run yet' });

		expect(stageViews(gcd, run(gcd, [48]))[7]).toMatchObject({
			status: 'paused',
			text: 'Waiting for input'
		});
		const divide = compile('void main(void) { output(1 / input()); }');
		expect(stageViews(divide, run(divide, [0]))[7]).toMatchObject({
			status: 'failed',
			text: 'Division by zero'
		});
		const twice = compile('void main(void) { output(1); output(2); }');
		expect(stageViews(twice, run(twice, []))[7].text).toBe('Halted, 2 numbers printed');
	});

	it('says "No change" or how many quads were rewritten when the optimizer removed none', () => {
		const none = compile('void main(void) { }');
		expect(none.optimized!.removed).toEqual([]);
		expect(none.codegen!.peephole.changes).toEqual([]);
		expect(stageViews(none, null)[4].text).toBe('No change');
		expect(stageViews(none, null)[6].text).toBe('No change');
		const folded = compile('void main(void) { output(input() * 1); }');
		expect(stageViews(folded, null)[4].text).toMatch(/^(−\d+ quads?|\d+ quads? rewritten)$/);
	});

	it('stops at the code generator when the program does not fit the machine', () => {
		const big = compile('int a[2000]; void main(void) { a[0] = 1; }');
		expect(big.stoppedAt).toBe('codegen');
		const stages = stageViews(big, null);
		expect(stages.slice(5).map((s) => s.status)).toEqual(['failed', 'not-reached', 'not-reached']);
		expect(stages[5].text).toBe('1 error');
		// The listing is still there to show.
		expect(blockedBy(big, 'code')).toBeNull();
		expect(blockedBy(big, 'run')).toBe('codegen');
	});

	it('has nothing to show without a compilation', () => {
		const stages = stageViews(null, null);
		expect(stages.every((s) => s.status === 'idle' && s.text === 'Not compiled')).toBe(true);
		expect(statusText(null)).toBe('The program is not compiled.');
	});

	it('maps a tab and its version to its stage', () => {
		expect(stageOfTab('tokens', 'before', 'before')).toBe('scanner');
		expect(stageOfTab('syntax', 'after', 'after')).toBe('parser');
		expect(stageOfTab('semantics', 'before', 'before')).toBe('semantic');
		expect(stageOfTab('ir', 'before', 'after')).toBe('icg');
		expect(stageOfTab('ir', 'after', 'before')).toBe('optimizer');
		expect(stageOfTab('code', 'after', 'before')).toBe('codegen');
		expect(stageOfTab('code', 'before', 'after')).toBe('peephole');
		expect(stageOfTab('run', 'before', 'before')).toBe('machine');
		expect(stageOfTab('language', 'before', 'before')).toBeNull();
		expect(Object.keys(TAB_LABEL)).toEqual([...TABS]);
	});
});

describe('tabs of a compilation that stopped', () => {
	it('are blocked by the phase that stopped it, from the tab after that phase on', () => {
		const blocked = (id: string) => TABS.map((tab) => blockedBy(compile(source(id)), tab));
		expect(blocked('gcd')).toEqual(Array(7).fill(null));
		expect(blocked('illegal-character')).toEqual([
			null,
			'scanner',
			'scanner',
			'scanner',
			'scanner',
			'scanner',
			null
		]);
		expect(blocked('missing-semicolon')).toEqual([
			null,
			null,
			'parser',
			'parser',
			'parser',
			'parser',
			null
		]);
		expect(blocked('undeclared')).toEqual([
			null,
			null,
			null,
			'semantic',
			'semantic',
			'semantic',
			null
		]);
		expect(PHASE_TAB).toMatchObject({ scanner: 'tokens', parser: 'syntax', semantic: 'semantics' });
	});

	it('are told which phase stopped the compilation', () => {
		expect(stoppedText(gcd)).toBeNull();
		expect(statusText(gcd)).toBe('The program compiled.');
		expect(stoppedText(compile(source('undeclared')))).toBe(
			'The semantic analyzer reported 2 errors and stopped the compilation.'
		);
		expect(statusText(compile(source('missing-semicolon')))).toBe(
			'The parser reported 1 error and stopped the compilation.'
		);
		expect(stoppedText(compile(source('illegal-character')))).toBe(
			'The scanner reported 1 error and stopped the compilation.'
		);
	});

	it('list the diagnostics of their own phase', () => {
		const c = compile(source('undeclared'));
		expect(phaseDiagnostics(c, 'semantic')).toHaveLength(2);
		expect(phaseDiagnostics(c, 'parser')).toEqual([]);
	});
});

describe('the editor', () => {
	it('colors keywords, identifiers, numbers, symbols and comments from the scanner’s tokens', () => {
		const text = '/* c */ int x[10];\nx[0] = x[1] + 2;';
		const classOf = (part: string, nth = 0) => {
			const at = find(text, part, nth).start;
			const hit = highlightSource(text, 'letters').filter((t) => t.from <= at && at < t.to);
			return hit[hit.length - 1]?.className ?? null;
		};
		expect(highlightSource(text, 'letters')[0]).toEqual({
			from: 0,
			to: 7,
			className: 'hl-comment'
		});
		expect(classOf('int')).toBe('hl-keyword');
		expect(classOf('x')).toBe('hl-name');
		expect(classOf('10')).toBe('hl-number');
		expect(classOf('[')).toBe('hl-paren');
		expect(classOf(';')).toBe('hl-punct');
		expect(classOf('=')).toBe('hl-operator');
		expect(classOf('+')).toBe('hl-operator');
		expect(classOf(' ', 2)).toBeNull();
		expect(tokenClass('ERROR')).toBeNull();
		expect(tokenClass('ENDFILE')).toBeNull();
		expect(tokenClass('WHILE')).toBe('hl-keyword');
	});

	it('follows the identifier rule', () => {
		const letters = highlightSource('x1', 'letters').map((t) => t.className);
		expect(letters).toEqual(['hl-name', 'hl-number']);
		expect(highlightSource('x1', 'extended')).toEqual([{ from: 0, to: 2, className: 'hl-name' }]);
	});

	it('marks the selected range on top of the colors, white space included', () => {
		const text = 'a = b + 1;';
		const lines = layoutLines(text, highlightSource(text, 'letters', { start: 4, end: 9 }));
		expect(lines[0].segments).toEqual([
			{ text: 'a', className: 'hl-name' },
			{ text: ' ' },
			{ text: '=', className: 'hl-operator' },
			{ text: ' ' },
			{ text: 'b', className: `hl-name ${SELECTED_CLASS}` },
			{ text: ' ', className: SELECTED_CLASS },
			{ text: '+', className: `hl-operator ${SELECTED_CLASS}` },
			{ text: ' ', className: SELECTED_CLASS },
			{ text: '1', className: `hl-number ${SELECTED_CLASS}` },
			{ text: ';', className: 'hl-punct' }
		]);
		// A range that cuts a token marks the part inside it.
		const cut = layoutLines('while', highlightSource('while', 'letters', { start: 2, end: 4 }));
		expect(cut[0].segments.map((s) => [s.text, s.className])).toEqual([
			['wh', 'hl-keyword'],
			['il', `hl-keyword ${SELECTED_CLASS}`],
			['e', 'hl-keyword']
		]);
		expect(highlightSource(text, 'letters', { start: 3, end: 3 })).toEqual(
			highlightSource(text, 'letters')
		);
	});

	it('marks the lines the selection touches', () => {
		const text = 'ab\ncd\n\nef';
		expect(selectionLineClasses(text, null)).toEqual([]);
		expect(selectionLineClasses(text, { start: 3, end: 5 })).toEqual([
			null,
			SELECTED_LINE_CLASS,
			null,
			null
		]);
		expect(selectionLineClasses(text, { start: 1, end: 8 })).toEqual([
			SELECTED_LINE_CLASS,
			SELECTED_LINE_CLASS,
			SELECTED_LINE_CLASS,
			SELECTED_LINE_CLASS
		]);
		// A range that ends at the start of a line does not touch that line.
		expect(selectionLineClasses(text, { start: 0, end: 3 })).toEqual([
			SELECTED_LINE_CLASS,
			null,
			null,
			null
		]);
	});

	it('prefixes every diagnostic with its phase', () => {
		expect(editorDiagnostics(null)).toEqual([]);
		expect(editorDiagnostics(gcd)).toEqual([]);
		const undeclared = editorDiagnostics(compile(source('undeclared')));
		expect(undeclared).toHaveLength(2);
		expect(undeclared.every((d) => d.message.startsWith('Semantic analyzer: '))).toBe(true);
		expect(undeclared[0].span).toMatchObject({ start: 26, end: 27, source: null });
		expect(editorDiagnostics(compile(source('missing-semicolon')))[0].message).toMatch(/^Parser: /);
		expect(editorDiagnostics(compile(source('illegal-character')))[0].message).toMatch(
			/^Scanner: /
		);
		expect(editorDiagnostics(compile('int a[2000]; void main(void) { }'))[0].message).toMatch(
			/^Code generator: /
		);
		const warning = editorDiagnostics(compile('int f(void) { } void main(void) { }'));
		expect(warning).toHaveLength(1);
		expect(warning[0]).toMatchObject({ severity: 'warning' });
		expect(warning[0].message).toMatch(/^Semantic analyzer: /);
	});

	it('lists stale diagnostics without placing them, and at most a fixed number', () => {
		const stale = editorDiagnostics(compile(source('undeclared')), { stale: true });
		expect(stale.map((d) => d.span?.source)).toEqual(['stale', 'stale']);
		// CodeEditor draws only spans of its own source (null): none of these.
		expect(stale.filter((d) => d.span?.source === null)).toEqual([]);

		const many = compile(`void main(void) { ${'q; '.repeat(80)}}`);
		expect(many.diagnostics).toHaveLength(80);
		const listed = editorDiagnostics(many);
		expect(listed).toHaveLength(MAX_EDITOR_DIAGNOSTICS + 1);
		expect(listed[listed.length - 1]).toEqual({
			severity: 'info',
			message: '30 more messages not listed.'
		});
		expect(editorDiagnostics(many, { limit: 79 }).pop()?.message).toBe(
			'1 more message not listed.'
		);
	});
});

describe('token rows', () => {
	it('list line:column, token type, quoted lexeme and the value of a NUM', () => {
		const rows = tokenRows(gcd.scan);
		expect(rows).toHaveLength(gcd.scan.tokens.length);
		expect(rows[0]).toMatchObject({
			kind: 'token',
			index: 0,
			line: 5,
			column: 1,
			type: 'INT',
			lexeme: '"int"',
			value: '',
			error: false,
			end: false
		});
		const zero = rows.find((r) => r.type === 'NUM')!;
		expect(zero).toMatchObject({ lexeme: '"0"', value: '0', line: 7, column: 12 });
		const last = rows[rows.length - 1];
		expect(last).toMatchObject({ type: 'ENDFILE', lexeme: '""', end: true });
		expect(new Set(rows.map((r) => r.type)).has('comment')).toBe(false);
	});

	it('list the comments in place when asked', () => {
		const c = compile('/* one */ int x; /* two\nlines */ void main(void) { }');
		const rows = tokenRows(c.scan, { comments: true });
		expect(rows.map((r) => r.type).slice(0, 6)).toEqual([
			'comment',
			'INT',
			'ID',
			'SEMI',
			'comment',
			'VOID'
		]);
		expect(rows[0]).toMatchObject({ kind: 'comment', index: 0, lexeme: '"/* one */"', line: 1 });
		expect(rows[4].lexeme).toBe('"/* two\\nlines */"');
		expect(rows[rows.length - 1].type).toBe('ENDFILE');
		expect(tokenRows(c.scan)).toHaveLength(c.scan.tokens.length);
	});

	it('mark ERROR tokens and shorten long text', () => {
		const c = compile(source('illegal-character'));
		const errors = tokenRows(c.scan).filter((r) => r.error);
		expect(errors.map((r) => [r.type, r.lexeme])).toEqual([['ERROR', '"%"']]);
		const open = compile(`int x; /* ${'never closed '.repeat(10)}`);
		const row = tokenRows(open.scan).find((r) => r.error)!;
		expect(row.lexeme.length).toBeLessThanOrEqual(42);
		expect(row.lexeme.endsWith('…"')).toBe(true);
	});
});

describe('the outline of the tree', () => {
	const program = gcd.parse!.program;

	it('has one row per node with its depth, label and line', () => {
		const rows = outlineRows(program);
		expect(rows).toHaveLength(38);
		expect(rows.slice(0, 5).map((r) => [r.depth, r.label, r.line])).toEqual([
			[0, 'Program', 5],
			[1, 'FunDecl int gcd', 5],
			[2, 'Param int u', 5],
			[2, 'Param int v', 5],
			[2, 'Compound', 6]
		]);
		expect(rows.every((r, i) => r.id === i)).toBe(true);
		expect(rows[0]).toMatchObject({ hasChildren: true, expanded: true, type: null });
		expect(rows[2]).toMatchObject({ hasChildren: false, expanded: false });
	});

	it('leaves out the rows under a collapsed node', () => {
		const first = program.decls[0];
		const rows = outlineRows(program, new Set([first.id]));
		expect(rows.map((r) => r.label)).toContain('FunDecl void main');
		expect(rows.map((r) => r.label)).not.toContain('Param int u');
		expect(rows[1]).toMatchObject({ label: 'FunDecl int gcd', hasChildren: true, expanded: false });
		expect(rows).toHaveLength(38 - (allNodes(first).length - 1));
		expect(outlineRows(program, new Set([0]))).toHaveLength(1);
		// A leaf that is "collapsed" changes nothing.
		expect(outlineRows(program, new Set([2]))).toHaveLength(38);
	});

	it('carries the type of every expression when types are given', () => {
		const rows = outlineRows(program, new Set(), gcd.semantic!.types);
		const typed = rows.filter((r) => r.type !== null);
		expect(typed).toHaveLength(gcd.semantic!.types.size);
		expect(rows.find((r) => r.label === 'Binary ==')!.type).toBe('int');
		expect(rows.find((r) => r.label === 'Call output')!.type).toBe('void');
		expect(rows.find((r) => r.label === 'If')!.type).toBeNull();
	});

	it('keeps a collapsed id only while it names a node with children', () => {
		expect([...keepCollapsed(new Set([0, 1, 2, 500]), program)]).toEqual([0, 1]);
		const other = compile('void main(void) { }').parse!.program;
		expect([...keepCollapsed(new Set([0, 1, 2, 5]), other)]).toEqual([0, 1]);
	});
});

describe('the tree drawing', () => {
	const program = gcd.parse!.program;

	it('is the whole program by default when it is small', () => {
		expect(nodeCount(program)).toBeLessThanOrEqual(SMALL_TREE);
		const drawing = drawingOf(drawnRoot(program, null));
		expect(drawing.root).toBe(program);
		expect(drawing.caption).toBe('The whole program');
		expect(drawing.size).toBe(38);
		expect(drawing.tree!.symbol).toBe('Program');
		expect(drawing.tree!.children.map((c) => c.symbol)).toEqual([
			'FunDecl int gcd',
			'FunDecl void main'
		]);
	});

	it('maps every AST node to a tree node and back', () => {
		const drawing = drawingOf(program);
		expect(drawing.ids.size).toBe(38);
		expect(drawing.paths.size).toBe(38);
		for (const node of allNodes(program)) {
			const path = drawing.paths.get(node.id)!;
			expect(drawing.ids.get(pathKey(path))).toBe(node.id);
			let at = drawing.tree!;
			for (const i of path) at = at.children[i];
			expect(at.symbol).toBe(nodeLabel(node));
			expect(at.terminal).toBe(at.children.length === 0);
		}
		expect(drawing.paths.get(0)).toEqual([]);
	});

	it('is the statement, declaration or function around a selection', () => {
		const caption = (range: SourceRange) => drawingOf(drawnRoot(program, range)).caption;
		expect(caption(find(GCD, 'u / v'))).toBe('The statement on line 9');
		expect(caption(find(GCD, 'return u;'))).toBe('The statement on line 8');
		expect(caption(find(GCD, 'if (v == 0)'))).toBe('The statement on line 7');
		expect(caption(find(GCD, 'int a;'))).toBe('The declaration on line 14');
		expect(caption(find(GCD, 'int u'))).toBe('Function gcd');
		expect(caption(rangeOf(program.decls[1].span))).toBe('Function main');
		expect(caption({ start: 0, end: GCD.length })).toBe('The whole program');
		const body = program.decls[0];
		if (body.kind !== 'FunDecl') throw new Error('gcd is a function');
		expect(caption(rangeOf(body.body.span))).toBe('The block on line 6');
		const statement = drawingOf(drawnRoot(program, find(GCD, 'u / v')));
		expect(statement.tree!.symbol).toBe('Return');
		expect(statement.size).toBe(10);
	});

	it('is the last function of a larger program without a selection', () => {
		const sort = compile(source('sort')).parse!.program;
		expect(nodeCount(sort)).toBeGreaterThan(SMALL_TREE);
		const drawing = drawingOf(drawnRoot(sort, null));
		expect(drawing.caption).toBe('Function main');
		expect(nodeById(sort, drawing.root.id)).toBe(drawing.root);
	});

	it('is not built for a tree larger than the limit', () => {
		const big = compile(`void main(void) { ${'output(1 + 2 * 3); '.repeat(60)}}`).parse!.program;
		const drawing = drawingOf(drawnRoot(big, null));
		expect(drawing.size).toBeGreaterThan(MAX_DRAWN);
		expect(drawing.tree).toBeNull();
		expect(drawing.ids.size).toBe(0);
		// One statement of it is drawn.
		const one = drawingOf(drawnRoot(big, { start: 20, end: 24 }));
		expect(one.tree!.symbol).toBe('ExprStmt');
	});
});

describe('scopes and symbol tables', () => {
	it('lists the scopes in tree order with their symbols', () => {
		const scopes = scopeViews(compile(source('blocks')));
		expect(scopes.map((s) => [s.title, s.depth, s.lines])).toEqual([
			['Global scope', 0, ''],
			['Function store', 1, 'lines 8–11'],
			['Function show', 1, 'lines 13–16'],
			['Function main', 1, 'lines 18–30'],
			['Block main.1', 2, 'lines 23–27']
		]);
		expect(scopes[0].symbols.map((s) => s.name)).toEqual([
			'input',
			'output',
			'x',
			'store',
			'show',
			'main'
		]);
		expect(scopes[0].range).toBeNull();
		expect(scopes[4].symbols.map((s) => [s.name, s.kind, s.storage])).toEqual([
			['x', 'variable', '-3(fp)']
		]);
	});

	it('gives every symbol its kind, type, declaration, uses and storage', () => {
		const c = compile(source('sort'));
		const scopes = scopeViews(c);
		const all = scopes.flatMap((s) => s.symbols);
		const row = (name: string, nth = 0) => all.filter((s) => s.name === name)[nth];
		const text = (range: SourceRange) => c.source.slice(range.start, range.end);

		expect(row('input')).toMatchObject({
			kind: 'function',
			type: '(void) → int',
			declared: null,
			storage: '—',
			builtin: true
		});
		expect(row('output').type).toBe('(int) → void');
		expect(row('numbers')).toMatchObject({
			kind: 'array',
			type: 'int[10]',
			storage: '-9(gp), 10 cells',
			builtin: false
		});
		expect(row('numbers').declared).toMatchObject({ line: 6 });
		expect(text(row('numbers').declared!.range)).toBe('int numbers[10];');
		expect(text(row('numbers').declared!.span)).toBe('numbers');
		expect(row('numbers').uses.map((u) => u.line)).toEqual([33, 36, 39]);
		expect(text(row('numbers').uses[0].range)).toBe('numbers[i]');
		expect(text(row('numbers').uses[0].span)).toBe('numbers');
		expect(text(row('numbers').uses[1].range)).toBe('numbers');

		expect(row('sort')).toMatchObject({ kind: 'function', type: '(int[], int) → void' });
		expect(text(row('sort').declared!.range)).toBe('void sort(int a[], int count)');
		expect(row('a')).toMatchObject({
			kind: 'array parameter',
			type: 'int[]',
			storage: '-2(fp), holds an address'
		});
		expect(row('count')).toMatchObject({ kind: 'parameter', type: 'int', storage: '-3(fp)' });
		expect(row('last')).toMatchObject({ kind: 'variable', type: 'int', storage: '-4(fp)' });
		expect(row('main').uses).toEqual([]);
	});

	it('is there for a program with semantic errors, and empty without a symbol table', () => {
		const undeclared = scopeViews(compile(source('undeclared')));
		expect(undeclared.map((s) => s.title)).toEqual(['Global scope', 'Function main']);
		expect(undeclared[1].symbols.map((s) => s.name)).toEqual(['x']);
		expect(scopeViews(compile(source('missing-semicolon')))).toEqual([]);
	});
});

describe('three-address code', () => {
	it('groups the quads by function, in four columns and in one line', () => {
		const groups = quadGroups(gcd.ir!);
		expect(groups.map((g) => [g.name, g.rows.length])).toEqual([
			['gcd', 15],
			['main', 11]
		]);
		expect(groups[0].rows[1]).toMatchObject({
			index: 1,
			id: 1,
			columns: ['==', 'v', '#0', 't1'],
			text: 't1 := v == 0',
			changed: [],
			fate: 'kept'
		});
		expect(groups[1].rows[0]).toMatchObject({ index: 15, columns: ['begin', 'main', '_', '_'] });
		expect(groups.flatMap((g) => g.rows).map((r) => r.index)).toEqual(
			gcd.ir!.quads.map((_, i) => i)
		);
	});

	it('tells, in the code as generated, what the optimizer does with each quad', () => {
		const rows = quadGroups(gcd.ir!, gcd.optimized).flatMap((g) => g.rows);
		expect(rows.filter((r) => r.fate === 'removed').map((r) => r.id)).toEqual(
			[...gcd.optimized!.removed].sort((a, b) => a - b)
		);
		expect(rows.filter((r) => r.fate === 'rewritten').map((r) => r.text)).toEqual([
			't1 := call input, 0',
			't2 := call input, 0'
		]);
		expect(rows.filter((r) => r.fate === 'kept')).toHaveLength(20);
	});

	it('shows the optimized quads with their original numbers and rewritten fields', () => {
		const rows = quadGroups(gcd.optimized!.program).flatMap((g) => g.rows);
		expect(rows).toHaveLength(22);
		expect(rows.map((r) => r.index)).toEqual(rows.map((_, i) => i));
		const rewritten = rows.filter((r) => r.changed.length);
		expect(rewritten.map((r) => [r.id, r.text, r.changed])).toEqual([
			[16, 'a := call input, 0', ['result']],
			[18, 'b := call input, 0', ['result']]
		]);
		expect(rows.every((r) => r.fate === 'kept')).toBe(true);
	});

	it('lists the optimizer’s log with the name of each pass and the place in the source', () => {
		const log = logRows(gcd);
		expect(log.map((e) => [e.quad, e.pass, e.before, e.after])).toEqual([
			[4, 'Jump to the next quad', 'goto L2', null],
			[6, 'Unused label', 'L2:', null],
			[16, 'Result stored directly', 't1 := call input, 0', 'a := call input, 0'],
			[17, 'Result stored directly', 'a := t1', null],
			[18, 'Result stored directly', 't2 := call input, 0', 'b := call input, 0'],
			[19, 'Result stored directly', 'b := t2', null]
		]);
		expect(GCD.slice(log[2].span!.start, log[2].span!.end)).toBe('input()');
		expect(log.every((e) => e.text.length > 0)).toBe(true);
		expect(logRows(compile(GCD, { optimize: false }))).toEqual([]);
		expect(logRows(compile(source('undeclared')))).toEqual([]);
		expect(Object.values(PASS_NAME).every((name) => /^[A-Z]/.test(name))).toBe(true);
	});
});

describe('the listing', () => {
	/** The listing text rebuilt from the sections: what the engine printed, line for line. */
	function rebuilt(code: TmCode, sections: ReturnType<typeof listingSections>): string[] {
		const lines = code.listing.split('\n');
		return sections.flatMap((s) =>
			s.rows.map((row) =>
				row.kind === 'comment' ? `* ${row.text}` : lines[code.instructions[row.addr].line - 1]
			)
		);
	}

	it('has a section for the prelude, input, output and every function', () => {
		const sections = listingSections(gcd.codegen!, 'after');
		expect(sections.map((s) => [s.key, s.title, s.addresses, s.count])).toEqual([
			['prelude', 'Prelude', 'addresses 0–6', 7],
			['input', 'input', 'addresses 7–9', 3],
			['output', 'output', 'addresses 10–13', 4],
			['gcd', 'gcd', 'addresses 14–47', 34],
			['main', 'main', 'addresses 48–77', 30]
		]);
		expect(sections[0].frame).toBeNull();
		expect(sections.slice(1).map((s) => s.frame?.function)).toEqual([
			'input',
			'output',
			'gcd',
			'main'
		]);
	});

	it.each(PRESETS.filter((p) => compile(p.value.source).codegen).map((p) => [p.id]))(
		'%s: the sections hold every line of the listing, in order, before and after the peephole pass',
		(id) => {
			for (const optimize of [true, false]) {
				const c = compile(source(id), { optimize });
				for (const version of ['before', 'after'] as const) {
					const code = version === 'before' ? c.codegen!.code : c.codegen!.peephole.code;
					const sections = listingSections(c.codegen!, version);
					expect(rebuilt(code, sections)).toEqual(code.listing.split('\n'));
					const rows = sections.flatMap((s) => s.rows).filter((r) => r.kind === 'instruction');
					expect(rows.map((r) => r.addr)).toEqual(code.instructions.map((i) => i.addr));
					// The comment lines of a function open its own section.
					for (const s of sections.slice(3)) {
						expect(s.rows[0]).toEqual({
							kind: 'comment',
							text: expect.stringMatching(new RegExp(`^function ${s.key}: `))
						});
					}
				}
			}
		}
	);

	it('gives each instruction its parts, and the TINY Machine reads them back', () => {
		const sections = listingSections(gcd.codegen!, 'after');
		const rows = sections.flatMap((s) => s.rows).filter((r) => r.kind === 'instruction');
		expect(rows[0]).toMatchObject({
			addr: 0,
			op: 'LD',
			operands: '6,0(0)',
			comment: 'gp = dMem[0], the highest address',
			span: null,
			dropped: null
		});
		expect(rows[5]).toMatchObject({ op: 'HALT', operands: '0,0,0' });
		const parsed = parseTM(rows.map((r) => `${r.addr}: ${r.op} ${r.operands}`).join('\n'));
		expect(parsed.diagnostics).toEqual([]);
		expect(parsed.program.entries.map((e) => e.instr)).toEqual(
			gcd.codegen!.peephole.code.instructions.map((i) => i.instr)
		);
		const first = rows.find((r) => r.span !== null)!;
		expect(first.addr).toBe(14);
		expect(GCD.slice(first.span!.start, first.span!.end)).toBe('int gcd(int u, int v)');
	});

	it('marks, before the peephole pass, the instructions that pass removes', () => {
		const before = listingSections(gcd.codegen!, 'before')
			.flatMap((s) => s.rows)
			.filter((r) => r.kind === 'instruction');
		const dropped = before.filter((r) => r.dropped !== null);
		expect(dropped.map((r) => r.addr)).toEqual(gcd.codegen!.peephole.changes.map((ch) => ch.addr));
		expect(dropped[0]).toMatchObject({ addr: 23, op: 'LD', operands: '0,-4(5)' });
		expect(dropped[0].dropped).toMatch(/still holds/);
		const after = listingSections(gcd.codegen!, 'after').flatMap((s) => s.rows);
		expect(after.every((r) => r.kind === 'comment' || r.dropped === null)).toBe(true);
	});

	it('shows activation records and globals as offset and what lives there', () => {
		const c = compile(source('sort'));
		const frames = c.codegen!.frames;
		expect(frameRows(frames.find((f) => f.function === 'sort')!).slice(0, 6)).toEqual([
			{ offset: '0(fp)', what: 'the caller’s fp' },
			{ offset: '-1(fp)', what: 'the return address' },
			{ offset: '-2(fp)', what: 'parameter a: the address of the array' },
			{ offset: '-3(fp)', what: 'parameter count' },
			{ offset: '-4(fp)', what: 'local last' },
			{ offset: '-5(fp)', what: 'local i' }
		]);
		expect(frameRows(frames.find((f) => f.function === 'output')!)).toEqual([
			{ offset: '0(fp)', what: 'the caller’s fp' },
			{ offset: '-1(fp)', what: 'the return address' },
			{ offset: '-2(fp)', what: 'parameter x' }
		]);
		const temps = frameRows(frames.find((f) => f.function === 'main')!).filter((r) =>
			r.what.startsWith('temporary')
		);
		expect(temps.length).toBeGreaterThan(0);
		expect(globalRows(c.codegen!.globals)).toEqual([
			{
				offset: '-9(gp) … 0(gp)',
				what: 'numbers[0] … numbers[9], in dMem[1014] … dMem[1023]'
			}
		]);

		const locals = compile('int g; void main(void) { int a[3]; int b; b = g; a[0] = b; }');
		expect(globalRows(locals.codegen!.globals)).toEqual([
			{ offset: '0(gp)', what: 'g, in dMem[1023]' }
		]);
		const main = frameRows(locals.codegen!.frames.find((f) => f.function === 'main')!);
		expect(main[2]).toEqual({ offset: '-4(fp) … -2(fp)', what: 'local a[0] … a[2]' });
		expect(main[3]).toEqual({ offset: '-5(fp)', what: 'local b' });
		expect(globalRows(gcd.codegen!.globals)).toEqual([]);
	});
});

describe('the run', () => {
	it('says in plain words how the run stopped', () => {
		const halted = run(gcd, [48, 18]);
		expect(halted).toMatchObject({ outputs: [6], printed: 1, stop: 'halted', steps: 149, read: 2 });
		expect(stopView(halted, 2)).toEqual({
			label: 'Halted',
			tone: 'accept',
			text: 'The program ran to its end: main returned and the machine reached HALT.'
		});
		expect(stopSpan(gcd, halted)).toBeNull();

		const waiting = run(gcd, [48]);
		expect(stopView(waiting, 1)).toMatchObject({ label: 'Waiting for input', tone: 'active' });
		expect(stopView(waiting, 1).text).toContain('the one number');
		expect(stopView(run(gcd, []), 0).text).toContain('holds no number');
		const sort = compile(source('sort'));
		expect(stopView(run(sort, [3, 1, 2]), 3).text).toContain('all 3 numbers');
		// It stopped at the IN of input, which belongs to no line of the program.
		expect(stopSpan(gcd, waiting)).toBeNull();

		const loop = compile('void main(void) { while (1) { } }');
		const budget = run(loop, []);
		expect(budget.stop).toBe('step-budget');
		expect(stopView(budget, 0)).toMatchObject({ label: 'Step budget used up', tone: 'active' });
		expect(stopView(budget, 0).text).toContain('1,000,000 instructions');

		const divide = compile('void main(void) {\n  int d;\n  d = input();\n  output(7 / d);\n}');
		const zero = run(divide, [0]);
		expect(stopView(zero, 1)).toMatchObject({ label: 'Division by zero', tone: 'reject' });
		const at = stopSpan(divide, zero)!;
		expect(at.line).toBe(4);
		expect(divide.source.slice(at.start, at.end)).toBe('7 / d');

		const negative = compile('int a[4];\nvoid main(void) {\n  output(a[0 - input()]);\n}');
		const subscript = run(negative, [3]);
		expect(stopView(subscript, 1)).toMatchObject({ label: 'Negative subscript', tone: 'reject' });
		expect(stopSpan(negative, subscript)).toBeNull();

		const deep = compile('int f(int n) { return f(n + 1); }\nvoid main(void) { output(f(0)); }');
		const memory = run(deep, []);
		expect(stopView(memory, 0)).toMatchObject({ label: 'Memory error', tone: 'reject' });
		expect(stopSpan(deep, memory)).not.toBeNull();
		expect(Object.keys(STOP_LABEL)).toContain('subscript-out-of-range');
		expect(stopView({ ...halted, stop: 'subscript-out-of-range' }, 0).tone).toBe('reject');
	});
});

describe('long lists', () => {
	it('capGroups keeps the first rows across the groups', () => {
		const groups = [
			{ name: 'a', rows: [1, 2, 3] },
			{ name: 'b', rows: [4, 5] },
			{ name: 'c', rows: [6] }
		];
		expect(capGroups(groups, 10)).toEqual({ groups, shown: 6, total: 6 });
		expect(capGroups(groups, Infinity).shown).toBe(6);
		expect(capGroups(groups, 4)).toEqual({
			groups: [
				{ name: 'a', rows: [1, 2, 3] },
				{ name: 'b', rows: [4] }
			],
			shown: 4,
			total: 6
		});
		expect(capGroups(groups, 3).groups).toEqual([{ name: 'a', rows: [1, 2, 3] }]);
		expect(capGroups([], 3)).toEqual({ groups: [], shown: 0, total: 0 });
	});

	it('firstOf keeps the first items and counts the rest', () => {
		expect(firstOf([1, 2, 3], 5)).toEqual({ shown: [1, 2, 3], more: 0 });
		expect(firstOf([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
		expect(firstOf([1, 2, 3], 2)).toEqual({ shown: [1, 2], more: 1 });
		expect(firstOf([1, 2, 3], Infinity).more).toBe(0);
		expect(firstOf([], 2)).toEqual({ shown: [], more: 0 });
	});
});
