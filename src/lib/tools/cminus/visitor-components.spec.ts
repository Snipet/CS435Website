/**
 * Server-renders the Visitor tab and its parts: the markup must build for
 * every program that parses and every visitor, and show the step, the code,
 * the stack, the dispatch, the tree and the output.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { IVISITOR_CODE, VISITORS, VISITOR_IDS, compile } from '$lib/theory/cminus';
import { PRESETS, presetById } from './presets';
import { NO_MARKS, marksFor } from './selection';
import { blockedBy } from './views';
import VisitorCode from './VisitorCode.svelte';
import VisitorDispatch from './VisitorDispatch.svelte';
import VisitorOutput from './VisitorOutput.svelte';
import VisitorStack from './VisitorStack.svelte';
import VisitorTree from './VisitorTree.svelte';
import VisitorView from './VisitorView.svelte';
import {
	callStack,
	dispatchAt,
	traceIndex,
	visitRows,
	visitStatus,
	visitorTrace,
	visitorTree
} from './visitor-view';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

const onselect = () => {};
const GCD = compile(presetById('gcd')!.value.source);

describe('the Visitor tab', () => {
	const parsed = PRESETS.filter((p) => !blockedBy(compile(p.value.source), 'visitor'));

	it('needs a program the parser accepts', () => {
		expect(parsed.length).toBeGreaterThan(5);
		expect(blockedBy(compile(presetById('missing-semicolon')!.value.source), 'visitor')).toBe(
			'parser'
		);
		expect(blockedBy(compile(presetById('illegal-character')!.value.source), 'visitor')).toBe(
			'scanner'
		);
		// Semantic errors do not stop it: the symbol table visitor reports them itself.
		expect(blockedBy(compile(presetById('undeclared')!.value.source), 'visitor')).toBeNull();
	});

	it.each(parsed.flatMap((p) => VISITOR_IDS.map((v) => [p.id, v] as const)))(
		'%s, %s: renders the step, the code, the stack, the dispatch, the tree and the output',
		(id, visitor) => {
			const c = compile(presetById(id)!.value.source);
			const html = render(VisitorView, { props: { c, marks: NO_MARKS, visitor, onselect } }).body;
			const words = text(html);
			const info = VISITORS[visitor];
			const trace = visitorTrace(c.parse!.program, visitor);
			expect(words).toContain(`Step 1 of ${trace.events.length}`);
			expect(words).toContain(`${info.driver} calls program->accept (&${info.instance})`);
			expect(words).toContain(`struct ${info.name} : IVisitor`);
			expect(words).toContain('virtual void visit (ProgramNode* node) = 0;');
			expect(words).toContain('void ProgramNode::accept (IVisitor* visitor)');
			expect(words).toContain('Call stack');
			expect(words).toContain(`${info.driver} (ProgramNode* program)`);
			expect(html).toContain('role="tree"');
			expect(html).toContain('aria-current="step"');
			for (const m of info.members) expect(words).toContain(m);
		}
	);

	it('announces the kind of a step apart from its text, and not the lines of code it shows', () => {
		const html = render(VisitorView, {
			props: { c: GCD, marks: NO_MARKS, visitor: 'print', onselect }
		}).body;
		expect(html).toMatch(
			/<span class="kind[^"]*">accept<\/span><span class="visually-hidden">:<\/span> printTree calls/
		);
		expect(html).toMatch(
			/<span class="code[^"]*" aria-hidden="true">(<!--[^>]*-->)?<code[^>]*>program->accept \(&amp;printer\);<\/code>/
		);
	});

	it('keeps a step from before and marks what belongs to the selection', () => {
		const whole = { start: 0, end: GCD.source.length };
		const html = render(VisitorView, {
			props: { c: GCD, marks: marksFor(GCD, whole), visitor: 'print', step: 30, onselect }
		}).body;
		expect(text(html)).toContain('Step 31 of');
		expect(html).toContain('cm-marked');
	});
});

describe('the parts', () => {
	const program = GCD.parse!.program;
	const tree = visitorTree(program);
	const trace = visitorTrace(program, 'print');
	const index = traceIndex(trace, tree);
	const at = trace.events.findIndex((e) => e.kind === 'line' && e.nodeClass === 'IfStatementNode');

	it('the code marks the lines that run, a helper and the waiting calls', () => {
		const html = render(VisitorCode, {
			props: {
				lines: VISITORS.print.code,
				current: new Set(['IfStatementNode.print']),
				helper: new Set(['print.body']),
				waiting: new Set(['main.accept']),
				ariaLabel: 'Code'
			}
		}).body;
		expect(html.match(/class="current/g)).toHaveLength(1);
		expect(html.match(/class="helper/g)).toHaveLength(1);
		expect(html.match(/class="waiting/g)).toHaveLength(1);
		expect(text(html)).toContain('(a call waits here)');
		expect(html).toContain('aria-current="step"');
	});

	it('the stack lists the calls with their nodes', () => {
		const html = render(VisitorStack, {
			props: { rows: callStack(trace, index, at), onselect }
		}).body;
		const words = text(html);
		expect(words).toContain('PrintVisitor::visit (IfStatementNode*)');
		expect(words).toContain('IfStatementNode::accept');
		expect(words).toContain('stmt->accept (this); stmt is a StatementNode*');
		expect(words).toContain('waits at program->accept (&printer)');
		expect(html).toContain('aria-label="Select IfStatementNode, line');
	});

	it('the dispatch shows the pointer, the class and the overload', () => {
		const accept = trace.events.findIndex(
			(e) => e.kind === 'accept' && e.nodeClass === 'IfStatementNode'
		);
		const words = text(
			render(VisitorDispatch, { props: { view: dispatchAt(trace, accept) } }).body
		);
		expect(words).toContain('stmt->accept (this)');
		expect(words).toContain('stmt : a StatementNode*');
		expect(words).toContain('the node: an IfStatementNode');
		expect(words).toContain('IfStatementNode::accept runs');
		expect(words).toContain('overload visit (IfStatementNode*) of IVisitor');
		expect(words).toContain(IVISITOR_CODE[0].text);
		expect(render(VisitorDispatch, { props: { view: null } }).body).not.toContain('<ol');
	});

	it('the tree marks the current node and dims the nodes not visited', () => {
		const rows = visitRows(tree);
		const html = render(VisitorTree, {
			props: {
				rows,
				start: 0,
				end: rows.length,
				status: (id: number) => visitStatus(trace, index, at, id),
				current: trace.events[at].node,
				marked: new Set([0]),
				onpick: () => {},
				onshowall: () => {}
			}
		}).body;
		expect(html.match(/role="treeitem"/g)).toHaveLength(rows.length);
		expect(html.match(/aria-current="step"/g)).toHaveLength(1);
		expect(html).toContain('not visited yet');
		expect(html).toContain('visit in progress');
		expect(html).toContain('cm-marked');
		const few = render(VisitorTree, {
			props: {
				rows,
				start: 0,
				end: 5,
				status: () => 'pending' as const,
				current: null,
				marked: new Set<number>(),
				onpick: () => {},
				onshowall: () => {}
			}
		}).body;
		expect(few.match(/role="treeitem"/g)).toHaveLength(5);
		expect(text(few)).toContain(`The first 5 of ${rows.length} nodes are listed.`);
		// A window further down: those rows, and which they are.
		const later = render(VisitorTree, {
			props: {
				rows,
				start: 10,
				end: 15,
				status: () => 'pending' as const,
				current: rows[12].id,
				marked: new Set<number>(),
				onpick: () => {},
				onshowall: () => {}
			}
		}).body;
		expect(later.match(/role="treeitem"/g)).toHaveLength(5);
		expect(later).toContain(`data-id="${rows[10].id}"`);
		expect(later).not.toContain(`data-id="${rows[9].id}"`);
		expect(text(later)).toContain(`5 of ${rows.length} nodes are listed, 11 to 15.`);
		// The roving tab stop is the current node.
		expect(later).toMatch(new RegExp(`data-id="${rows[12].id}"[^>]*tabindex="0"`));
	});

	it('the dispatch listings wrap their lines', () => {
		const accept = trace.events.findIndex((e) => e.kind === 'accept');
		const html = render(VisitorDispatch, { props: { view: dispatchAt(trace, accept) } }).body;
		expect(html.match(/class="listing wrap/g)).toHaveLength(2);
		expect(html).toContain('--indent: 2');
		const plain = render(VisitorCode, {
			props: { lines: VISITORS.print.code, ariaLabel: 'Code' }
		}).body;
		expect(plain).not.toContain('wrap');
		expect(plain).not.toContain('--indent');
	});

	it('the output of each visitor', () => {
		const output = (visitor: 'print' | 'symbols' | 'fold', source: string) => {
			const c = compile(source);
			const t = visitorTrace(c.parse!.program, visitor);
			const i = traceIndex(t, visitorTree(c.parse!.program));
			return text(
				render(VisitorOutput, {
					props: {
						trace: t,
						index: i,
						at: t.events.length - 1,
						source: c.source,
						marks: NO_MARKS,
						onselect
					}
				}).body
			);
		};
		const printed = output('print', GCD.source);
		expect(printed).toContain('level 0');
		expect(printed).toContain('FunctionDeclarationNode INT gcd');
		const symbols = output('symbols', 'void main(void) { int x; y = x; }');
		expect(symbols).toContain('scopes[0] global scope');
		expect(symbols).toContain('main FunctionDeclarationNode');
		expect(symbols).toContain('"y is not declared"');
		expect(symbols).toContain('errors.size () 1');
		const folded = output('fold', 'void main(void) { output(2 * 3 + 1); }');
		expect(folded).toContain('2 * 3 + 1 6 + 1 = 7');
		expect(folded).toContain('folded.size () 2');
		expect(folded).not.toContain('Nothing is folded');
		// A program without a constant operator says so, and names the preset that has some.
		const none = output('fold', GCD.source);
		expect(none).toContain('Nothing is folded in this program');
		expect(none).toContain('“Constant expressions”');
		expect(presetById('constants')!.label).toBe('Constant expressions');
	});

	it('the output names its boxes (a box that scrolls says so in the browser)', () => {
		const html = render(VisitorOutput, {
			props: {
				trace,
				index,
				at: trace.events.length - 1,
				source: GCD.source,
				marks: NO_MARKS,
				onselect
			}
		}).body;
		expect(html).toContain('aria-label="printer.out"');
		expect(html).not.toContain('tabindex');
	});
});
