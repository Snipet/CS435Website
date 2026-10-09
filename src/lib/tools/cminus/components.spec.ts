/**
 * Server-renders the page's panels: the markup must build for every preset,
 * show what each phase produced, and mark what belongs to the selection.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { CMINUS_BNF, compile, type Compilation } from '$lib/theory/cminus';
import AstOutline from './AstOutline.svelte';
import DiagnosticList from './DiagnosticList.svelte';
import GrammarText from './GrammarText.svelte';
import IrView from './IrView.svelte';
import LanguageView from './LanguageView.svelte';
import PhaseStrip from './PhaseStrip.svelte';
import { PRESETS, presetById } from './presets';
import RunView from './RunView.svelte';
import {
	NO_MARKS,
	describeSelection,
	marksFor,
	rangeOfCaret,
	type SelectionMarks,
	type SourceRange
} from './selection';
import SelectionBar from './SelectionBar.svelte';
import SemanticsView from './SemanticsView.svelte';
import { TABS } from './state';
import StoppedNote from './StoppedNote.svelte';
import SyntaxView from './SyntaxView.svelte';
import TargetView from './TargetView.svelte';
import { runProgram } from './tasks';
import TokensView from './TokensView.svelte';
import { ROW_LIMIT, SHORT_LIST, blockedBy, phaseDiagnostics, stageViews } from './views';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

const count = (html: string, part: string | RegExp) =>
	html.match(
		typeof part === 'string' ? new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : part
	)?.length ?? 0;

const source = (id: string) => presetById(id)!.value.source;
const GCD = source('gcd');
const gcd = compile(GCD);
const onselect = () => {};

function find(c: Compilation, part: string): SourceRange {
	const from = c.source.startsWith('/*') ? c.source.indexOf('*/') + 2 : 0;
	const at = c.source.indexOf(part, from);
	if (at === -1) throw new Error(`"${part}" is not in the source`);
	return { start: at, end: at + part.length };
}

const runOf = (c: Compilation, inputs: number[]) =>
	runProgram({
		source: c.source,
		identifiers: 'letters',
		optimize: c.options.optimize,
		inputs,
		attempt: 0
	});

/** Every panel a compilation has content for, rendered with the given marks. */
function panels(c: Compilation, marks: SelectionMarks, selection: SourceRange | null): string[] {
	const out: string[] = [
		render(TokensView, { props: { c, marks, comments: true, onselect } }).body
	];
	if (!blockedBy(c, 'syntax')) {
		out.push(
			render(SyntaxView, { props: { c, marks, selection, grammarHref: '/grammar#x', onselect } })
				.body
		);
	}
	if (!blockedBy(c, 'semantics')) {
		out.push(render(SemanticsView, { props: { c, marks, selection, onselect } }).body);
	}
	if (!blockedBy(c, 'ir')) {
		for (const version of ['before', 'after'] as const) {
			out.push(render(IrView, { props: { c, marks, version, onselect } }).body);
		}
	}
	if (!blockedBy(c, 'code')) {
		for (const version of ['before', 'after'] as const) {
			out.push(
				render(TargetView, {
					props: { c, marks, version, machineHref: () => '/tiny-vm#x', onselect }
				}).body
			);
		}
	}
	if (!blockedBy(c, 'run')) {
		out.push(
			render(RunView, {
				props: { c, run: runOf(c, [5, 4]), inputs: [5, 4], onrun: () => {}, onselect }
			}).body
		);
	}
	return out;
}

describe('every preset', () => {
	it.each(PRESETS.map((p) => [p.id]))('%s renders in every panel it reaches', (id) => {
		for (const optimize of [true, false]) {
			const c = compile(source(id), { optimize });
			const whole = { start: 0, end: c.source.length };
			expect(panels(c, NO_MARKS, null).length).toBeGreaterThan(0);
			expect(panels(c, marksFor(c, whole), whole).join('')).toContain('cm-marked');
			for (const tab of TABS) {
				const phase = blockedBy(c, tab);
				if (!phase) continue;
				const note = text(
					render(StoppedNote, { props: { c, phase, what: 'result', onopen: () => {} } }).body
				);
				expect(note).toContain('stopped the compilation');
				expect(note).toContain('There is no result to show.');
			}
		}
	});
});

describe('PhaseStrip', () => {
	it('shows the eight stages with what they produced and marks the open one', () => {
		const html = render(PhaseStrip, {
			props: { stages: stageViews(gcd, runOf(gcd, [48, 18])), current: 'parser', onselect }
		}).body;
		expect(count(html, '<button')).toBe(8);
		const shown = text(html);
		for (const part of [
			'Scanner',
			'69 tokens',
			'AST: 38 nodes',
			'Semantic analyzer',
			'3 scopes, 6 symbols',
			'Intermediate code generator',
			'26 quads',
			'−4 quads',
			'Code generator',
			'82 instructions',
			'Peephole optimizer',
			'−4 instructions',
			'TINY Machine',
			'Halted, 1 number printed'
		]) {
			expect(shown).toContain(part);
		}
		expect(count(html, 'aria-current="step"')).toBe(1);
		expect(html).toMatch(/aria-current="step"[^>]*aria-label="Parser: AST: 38 nodes"/);
		expect(html).not.toContain('aria-busy="true"');
	});

	it('shows errors and stages that were not reached, and that results are being replaced', () => {
		const c = compile(source('undeclared'));
		const html = render(PhaseStrip, {
			props: { stages: stageViews(c, null), current: null, busy: true, onselect }
		}).body;
		expect(html).toContain('aria-label="Semantic analyzer: failed: 2 errors"');
		expect(count(html, 'Not reached')).toBeGreaterThanOrEqual(5);
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain('stale-data');
		expect(html).not.toContain('aria-current');
	});
});

describe('SelectionBar', () => {
	it('states the selection in words, with a button to clear it', () => {
		const range = find(gcd, 'return u;');
		const html = render(SelectionBar, {
			props: { summary: describeSelection(gcd, range), onclear: () => {} }
		}).body;
		expect(text(html)).toContain('Line 8: return u; — 3 tokens, 2 nodes, 1 quad, 2 instructions');
		expect(text(html)).toContain('Clear selection');
		expect(html).toContain('role="status"');
	});

	it('says that nothing is selected', () => {
		const html = render(SelectionBar, { props: { summary: null, onclear: () => {} } }).body;
		expect(text(html)).toContain('Nothing is selected.');
		expect(html).not.toContain('<button');
	});
});

describe('TokensView', () => {
	it('lists line:column, token, lexeme and value, and ENDFILE last', () => {
		const html = render(TokensView, { props: { c: gcd, marks: NO_MARKS, onselect } }).body;
		expect(count(html, '<tr')).toBe(1 + gcd.scan.tokens.length);
		const shown = text(html);
		expect(shown).toContain('69 tokens, then ENDFILE.');
		expect(shown).toContain('5:1 INT "int"');
		expect(shown).toContain('7:12 NUM "0" 0');
		expect(shown).toContain('ENDFILE ""');
		expect(shown).not.toContain('comment "');
		// Every token but ENDFILE selects itself.
		expect(count(html, 'class="cm-pick"')).toBe(69);
	});

	it('lists comments on request and marks the tokens of the selection', () => {
		const range = find(gcd, 'return u;');
		const html = render(TokensView, {
			props: { c: gcd, marks: marksFor(gcd, range), comments: true, onselect }
		}).body;
		expect(text(html)).toContain('comment "/* The greatest common divisor of two n…"');
		expect(count(html, /<tr class="[^"]*cm-marked/g)).toBe(3);
		expect(count(html, 'aria-current="true"')).toBe(3);
	});

	it('marks ERROR tokens and shows the scanner’s diagnostics', () => {
		const c = compile(source('illegal-character'));
		const html = render(TokensView, { props: { c, marks: NO_MARKS, onselect } }).body;
		const shown = text(html);
		expect(shown).toContain('1 ERROR token.');
		expect(shown).toContain('ERROR not a token "%"');
		expect(shown).toContain('Illegal character "%"');
		expect(shown).toContain('line 7, col 12');
	});
});

describe('SyntaxView', () => {
	const props = { c: gcd, marks: NO_MARKS, selection: null, grammarHref: '/grammar#x', onselect };

	it('shows the tree as an outline and draws the whole small program', () => {
		const html = render(SyntaxView, { props }).body;
		expect(count(html, 'role="treeitem"')).toBe(38);
		expect(html).toContain('aria-label="FunDecl int gcd, line 5"');
		expect(html).toContain('aria-level="3"');
		expect(count(html, 'aria-expanded="true"')).toBe(
			count(html, 'role="treeitem"') - count(html, /role="treeitem"(?![^>]*aria-expanded)/g)
		);
		const shown = text(html);
		expect(shown).toContain('Abstract syntax tree 38 nodes');
		expect(shown).toContain('The whole program 38 nodes');
		expect(html).toContain('<svg');
		expect(html).toContain('Syntax tree: The whole program');
	});

	it('draws the statement around the selection and marks its nodes', () => {
		const selection = find(gcd, 'u / v');
		const html = render(SyntaxView, {
			props: { ...props, selection, marks: marksFor(gcd, selection) }
		}).body;
		expect(text(html)).toContain('The statement on line 9 10 nodes');
		// Binary /, Var u, Var v: in the outline, and in the drawing.
		expect(count(html, /role="treeitem"[^>]*aria-selected="true"/g)).toBe(3);
		expect(count(html, 'class="mark"')).toBe(3);
	});

	it('holds the grammar: the 29 rules, the EBNF, and a link to Context-Free Grammars', () => {
		const html = render(SyntaxView, { props }).body;
		expect(CMINUS_BNF.split('\n')).toHaveLength(29);
		const shown = text(html);
		expect(shown).toContain('BNF 29 rules');
		expect(shown).toContain('program → declaration-list');
		expect(shown).toContain('arg-list → arg-list , expression | expression');
		expect(shown).toContain('additive-expression → term { addop term }');
		expect(html).toContain('href="/grammar#x"');
		expect(shown).toContain('Open the BNF in Context-Free Grammars');
		const without = render(SyntaxView, { props: { ...props, grammarHref: null } }).body;
		expect(without).not.toContain('Context-Free Grammars');
		expect(count(render(GrammarText, { props: { href: null } }).body, '<li')).toBe(29);
	});

	it('shows the parser’s diagnostics with the part of the tree that parsed', () => {
		const c = compile(source('missing-semicolon'));
		const html = render(SyntaxView, { props: { ...props, c } }).body;
		const shown = text(html);
		expect(shown).toContain('The tree below holds what parsed');
		// The parser reports the token it found instead: output, on the next line.
		expect(shown).toContain('line 8, col 3');
		expect(count(html, 'role="treeitem"')).toBe(c.parse!.program ? 4 : 0);
	});
});

describe('AstOutline', () => {
	it('shows the type of every expression when types are given', () => {
		const html = render(AstOutline, {
			props: {
				program: gcd.parse!.program,
				types: gcd.semantic!.types,
				marked: new Set<number>(),
				label: 'Syntax tree with types',
				onselect
			}
		}).body;
		expect(html).toContain('aria-label="Binary ==, type int, line 7"');
		expect(html).toContain('aria-label="Call output, type void, line 18"');
		expect(html).toContain('aria-label="If, line 7"');
		expect(html).toContain('aria-multiselectable="true"');
		// One tab stop: the first row.
		expect(count(html, 'tabindex="0"')).toBe(1);
	});
});

describe('SemanticsView', () => {
	it('shows one symbol table per scope, the types, and no diagnostics', () => {
		const c = compile(source('blocks'));
		const html = render(SemanticsView, {
			props: { c, marks: NO_MARKS, selection: null, onselect }
		}).body;
		const shown = text(html);
		expect(shown).toContain('No errors and no warnings.');
		expect(shown).toContain('5 scopes, 7 symbols declared by the program');
		for (const title of [
			'Global scope',
			'Function store',
			'Function show',
			'Function main',
			'Block main.1'
		]) {
			expect(shown).toContain(title);
		}
		// show declares nothing: its scope has no table.
		expect(count(html, '<table')).toBe(4);
		expect(shown).toContain('Function show lines 13–16 No declarations.');
		expect(shown).toContain('input function (void) → int predefined');
		expect(shown).toContain('x variable int');
		expect(shown).toContain('0(gp)');
		expect(shown).toContain('-3(fp)');
		expect(shown).toContain('not used');
		expect(html).toContain('aria-label="Declaration of x, line 6"');
		expect(html).toContain('aria-label="Use of x, line 10"');
		expect(html).toContain('aria-label="Syntax tree with types"');
	});

	it('marks the declaration and the uses in the selection', () => {
		const c = compile(source('blocks'));
		const selection = find(c, 'x = value;');
		const html = render(SemanticsView, {
			props: { c, marks: marksFor(c, selection), selection, onselect }
		}).body;
		// The use of the global x and the use of value.
		expect(count(html, /class="cm-chip cm-marked"/g)).toBe(2);
		const whole = { start: 0, end: c.source.length };
		const all = render(SemanticsView, {
			props: { c, marks: marksFor(c, whole), selection: whole, onselect }
		}).body;
		// Every symbol the program declares.
		expect(count(all, /<tr class="[^"]*cm-marked/g)).toBe(7);
	});

	it('shows the semantic diagnostics with the scopes that were built', () => {
		const c = compile(source('undeclared'));
		const html = render(SemanticsView, {
			props: { c, marks: NO_MARKS, selection: null, onselect }
		}).body;
		const shown = text(html);
		expect(count(html, 'aria-label="Error"')).toBe(2);
		expect(shown).toMatch(/\by\b[^.]*not declared|not declared[^.]*\by\b/);
		expect(shown).toContain('Function main');
		expect(shown).toContain('error');
	});
});

describe('IrView', () => {
	it('shows the quads as generated, per function, in four columns and in one line', () => {
		const html = render(IrView, {
			props: { c: gcd, marks: NO_MARKS, version: 'before', onselect }
		}).body;
		const shown = text(html);
		expect(shown).toContain('26 quads as generated; the optimizer leaves 22 quads.');
		expect(shown).toContain('1 == v #0 t1 t1 := v == 0');
		expect(shown).toContain('2 if_false t1 _ L1 if_false t1 goto L1');
		expect(shown).toContain('goto L2 removed by the optimizer');
		expect(shown).toContain('t1 := call input, 0 rewritten');
		expect(count(html, 'removed by the optimizer')).toBe(4);
		expect(html).toContain('Before optimization');
		expect(html).toContain('After optimization');
		// The log: which pass changed which quad.
		expect(shown).toContain('Optimizer log 6 entries in 2 rounds');
		expect(shown).toContain(
			'4 Jump to the next quad goto L2 → becomes removed L2 is the next quad.'
		);
		expect(shown).toContain(
			'Result stored directly t1 := call input, 0 → becomes a := call input, 0'
		);
	});

	it('shows the optimized quads with the rewritten fields marked', () => {
		const html = render(IrView, {
			props: { c: gcd, marks: NO_MARKS, version: 'after', onselect }
		}).body;
		const shown = text(html);
		expect(shown).toContain('22 quads of the 26 generated');
		expect(shown).toContain('16 call input 0 a a := call input, 0');
		expect(shown).not.toContain('removed by the optimizer');
		expect(html).toContain('<span class="changed svelte-');
	});

	it('marks the quads of the selection in the version shown, and in the log', () => {
		const selection = find(gcd, 'if (v == 0)');
		const marks = marksFor(gcd, selection);
		const before = render(IrView, { props: { c: gcd, marks, version: 'before', onselect } }).body;
		// Five quads, and the two log entries about two of them.
		expect(count(before, /<tr class="[^"]*cm-marked/g)).toBe(5 + 2);
		const after = render(IrView, { props: { c: gcd, marks, version: 'after', onselect } }).body;
		expect(count(after, /<tr class="[^"]*cm-marked/g)).toBe(3 + 2);
	});

	it('has one version when the optimizer is off', () => {
		const c = compile(GCD, { optimize: false });
		const html = render(IrView, { props: { c, marks: NO_MARKS, version: 'after', onselect } }).body;
		const shown = text(html);
		expect(shown).toContain(
			'26 quads. The optimizer is off: the code generator takes these quads.'
		);
		expect(shown).toContain('goto L2');
		expect(shown).toContain('The optimizer is off.');
		expect(html).toMatch(/<input[^>]*disabled/);
	});
});

describe('TargetView', () => {
	const props = {
		c: gcd,
		marks: NO_MARKS,
		version: 'after' as const,
		machineHref: (listing: string) => `/tiny-vm#${listing.length}`,
		onselect
	};

	it('shows the listing in sections with the prelude and the built-ins', () => {
		const html = render(TargetView, { props }).body;
		const shown = text(html);
		expect(shown).toContain('78 instructions after the peephole pass: the code that runs.');
		expect(shown).toContain('Prelude addresses 0–6');
		expect(shown).toContain('input addresses 7–9');
		expect(shown).toContain('output addresses 10–13');
		expect(shown).toContain('gcd addresses 14–47');
		expect(shown).toContain('0 LD 6,0(0) gp = dMem[0], the highest address');
		expect(shown).toContain('* t1 := v == 0');
		expect(shown).toContain('5 HALT 0,0,0 main returned: stop');
		// Instructions of the program select their source; the prelude and built-ins do not.
		const pickable = gcd.codegen!.peephole.code.instructions.filter((i) => i.span).length;
		expect(count(html, /class="cm-pick"[^>]*aria-label="Address/g)).toBe(pickable);
		expect(pickable).toBe(78 - 14);
	});

	it('shows what the peephole pass removed, before that pass', () => {
		const html = render(TargetView, { props: { ...props, version: 'before' } }).body;
		const shown = text(html);
		expect(shown).toContain('82 instructions, one quad at a time; the peephole pass removes 4.');
		expect(count(html, 'removed by the peephole pass')).toBe(4);
		expect(shown).toContain('Peephole pass 4 instructions removed');
		expect(shown).toContain(
			'23 LD 0,-4(5) ac still holds the value the instruction before it stored.'
		);
	});

	it('shows every function’s activation record and the globals', () => {
		const c = compile(source('sort'));
		const shown = text(render(TargetView, { props: { ...props, c } }).body);
		expect(shown).toContain('10 cells of globals, then the activation records');
		expect(shown).toContain('-9(gp) … 0(gp) numbers[0] … numbers[9], in dMem[1014] … dMem[1023]');
		expect(shown).toContain('-2(fp) parameter a: the address of the array');
		expect(shown).toContain('0(fp) the caller’s fp');
		expect(shown).toContain('-1(fp) the return address');
		expect(text(render(TargetView, { props }).body)).toContain('No global variables.');
	});

	it('links to the TINY Machine with the listing shown, when the link exists', () => {
		const html = render(TargetView, { props }).body;
		expect(html).toContain(`href="/tiny-vm#${gcd.codegen!.peephole.code.listing.length}"`);
		expect(text(html)).toContain('Open in TINY Machine');
		const before = render(TargetView, { props: { ...props, version: 'before' } }).body;
		expect(before).toContain(`href="/tiny-vm#${gcd.codegen!.code.listing.length}"`);
		for (const machineHref of [null, () => null]) {
			expect(render(TargetView, { props: { ...props, machineHref } }).body).not.toContain(
				'TINY Machine</a'
			);
			expect(render(TargetView, { props: { ...props, machineHref } }).body).not.toContain('href=');
		}
	});

	it('marks the instructions of the selection and shows the diagnostics of a program that does not fit', () => {
		const selection = find(gcd, 'return u;');
		const html = render(TargetView, { props: { ...props, marks: marksFor(gcd, selection) } }).body;
		expect(count(html, /<tr class="[^"]*cm-marked/g)).toBe(2);

		const big = compile('int a[2000]; void main(void) { a[0] = 1; }');
		const shown = text(render(TargetView, { props: { ...props, c: big } }).body);
		expect(shown).toContain('do not fit in the 1024 cells of data memory');
		expect(shown).toContain('Prelude');
	});
});

describe('RunView', () => {
	const base = { c: gcd, inputs: [48, 18], onrun: () => {}, onselect };

	it('shows the output, how the run stopped and the instructions executed', () => {
		const html = render(RunView, { props: { ...base, run: runOf(gcd, [48, 18]) } }).body;
		const shown = text(html);
		expect(shown).toContain('Run');
		expect(shown).toContain('Input: 48 18 (2 numbers).');
		expect(shown).toContain('Output 1 number printed');
		expect(shown).toContain('Halted The program ran to its end');
		expect(shown).toContain('Instructions executed 149');
		expect(shown).toContain('Input numbers read 2 of 2');
		expect(html).toContain('role="status"');
		expect(html).not.toContain('stale-data');
	});

	it('says in words when the program waits for input, and shows a run being replaced', () => {
		const html = render(RunView, {
			props: { ...base, inputs: [48], run: runOf(gcd, [48]), busy: true }
		}).body;
		const shown = text(html);
		expect(shown).toContain('Waiting for input');
		expect(shown).toContain('The program printed nothing.');
		expect(shown).toContain('Input numbers read 1 of 1');
		expect(html).toContain('stale-data');
		expect(html).toContain('aria-busy="true"');
		expect(shown).toContain('Running…');
	});

	it('points at the line where a failing run stopped', () => {
		const c = compile('void main(void) {\n  output(1);\n  output(2 / input());\n}');
		const html = render(RunView, { props: { ...base, c, inputs: [0], run: runOf(c, [0]) } }).body;
		const shown = text(html);
		expect(shown).toContain('Output 1 number printed');
		expect(shown).toContain('Division by zero A division by zero stopped the machine.');
		expect(shown).toContain('line 3');
	});

	it('shows a placeholder before the first run, time-outs, errors and the link to the machine', () => {
		const waiting = render(RunView, { props: { ...base, run: null } }).body;
		expect(waiting).toMatch(/role="status"[^>]*>.*Running…/s);
		const timedOut = text(render(RunView, { props: { ...base, run: null, timedOut: true } }).body);
		expect(timedOut).toContain('The run took too long and was stopped.');
		expect(timedOut).not.toContain('Running…');
		expect(text(render(RunView, { props: { ...base, run: null, error: 'boom' } }).body)).toContain(
			'The run failed: boom'
		);
		const linked = render(RunView, {
			props: { ...base, run: runOf(gcd, [48, 18]), machineHref: '/tiny-vm#y' }
		}).body;
		expect(linked).toContain('href="/tiny-vm#y"');
		expect(render(RunView, { props: { ...base, run: runOf(gcd, [48, 18]) } }).body).not.toContain(
			'href='
		);
		expect(
			text(render(RunView, { props: { ...base, inputs: [], run: runOf(gcd, []) } }).body)
		).toContain('No input numbers.');
	});

	it('lists the first numbers of a long output', () => {
		const c = compile(
			'void main(void) { int i; i = 0; while (i < 1000) { output(i); i = i + 1; } }'
		);
		const html = render(RunView, { props: { ...base, c, inputs: [], run: runOf(c, []) } }).body;
		expect(count(html, '<li')).toBe(400);
		expect(text(html)).toContain('600 more numbers are not listed.');
		expect(text(html)).toContain('Output 1,000 numbers printed');
	});
});

describe('LanguageView', () => {
	it('is a reference for the language as the compiler implements it', () => {
		const html = render(LanguageView, {
			props: { identifiers: 'letters', grammarHref: '/grammar#x' }
		}).body;
		const shown = text(html);
		for (const part of [
			'Lexical conventions',
			'else if int return void while',
			'ID = letter letter*',
			'NUM = digit digit*',
			'comments do not nest',
			'Tokens',
			'ELSE else',
			'LTE <=',
			'NEQ !=',
			'ENDFILE the end of the text',
			'ERROR text that is no token',
			'Grammar',
			'BNF 29 rules',
			'Semantic rules',
			'A name is declared before it is used.',
			'The last declaration of a program is void main(void) .',
			'passed by reference',
			'belongs to the nearest if',
			'int input(void)',
			'void output(int x)',
			'Run-time conventions',
			'ac = 0',
			'fp = 5',
			'gp = 6',
			'pc = 7',
			'Data memory has 1024 cells.'
		]) {
			expect(shown, part).toContain(part);
		}
		expect(html).toContain('href="/grammar#x"');
	});

	it('follows the identifier rule in use', () => {
		const shown = text(
			render(LanguageView, { props: { identifiers: 'extended', grammarHref: null } }).body
		);
		expect(shown).toContain("ID = letter (letter | digit | '_')*");
		expect(shown).toContain("ID letter (letter | digit | '_')*");
	});
});

describe('DiagnosticList', () => {
	it('lists each message with its place, and counts the ones left out', () => {
		const c = compile(`void main(void) { ${'q; '.repeat(8)}}`);
		const diagnostics = phaseDiagnostics(c, 'semantic');
		const html = render(DiagnosticList, {
			props: { diagnostics, label: 'Semantic diagnostics', onselect, max: 5 }
		}).body;
		expect(count(html, '<button')).toBe(5);
		expect(text(html)).toContain('line 1, col 19');
		expect(text(html)).toContain('3 more not listed.');
		expect(html).toContain('aria-label="Semantic diagnostics"');
	});
});

describe('a large program', () => {
	const functions = Array.from({ length: 90 }, (_, i) => {
		const name = `f${'abcdefghij'[Math.floor(i / 10)]}${'abcdefghij'[i % 10]}`;
		return `int ${name}(int n) { int local; local = n + ${i}; return local * local + n * 2 - 1; }`;
	});
	const calls = functions.map((_, i) => {
		const name = `f${'abcdefghij'[Math.floor(i / 10)]}${'abcdefghij'[i % 10]}`;
		return `  total = total + ${name}(total) + ${name}(1) * ${name}(2);`;
	});
	const c = compile(
		`${functions.join('\n')}\nvoid main(void)\n{\n  int total;\n  total = 0;\n${calls.join('\n')}\n  output(total);\n}\n`
	);

	it('compiles into more rows than a list shows at once', () => {
		expect(c.stoppedAt).toBe('codegen');
		expect(c.scan.tokens.length).toBeGreaterThan(ROW_LIMIT);
		expect(c.ir!.quads.length).toBeGreaterThan(ROW_LIMIT);
		expect(c.codegen!.frames.length).toBeGreaterThan(SHORT_LIST);
	});

	it('lists the first rows of each view, with the number there are', () => {
		const tokens = render(TokensView, { props: { c, marks: NO_MARKS, onselect } }).body;
		expect(count(tokens, '<tr')).toBe(1 + ROW_LIMIT);
		expect(text(tokens)).toContain(
			`The first 800 of ${c.scan.tokens.length.toLocaleString('en-US')} rows are listed. List all`
		);

		const syntax = render(SyntaxView, {
			props: { c, marks: NO_MARKS, selection: null, grammarHref: null, onselect }
		}).body;
		expect(count(syntax, 'role="treeitem"')).toBe(ROW_LIMIT);
		// Too large to draw whole: the last function, which is too large as well.
		expect(text(syntax)).toContain('Function main');
		expect(text(syntax)).toContain('A tree of more than 300 nodes is not drawn.');

		const semantics = render(SemanticsView, {
			props: { c, marks: NO_MARKS, selection: null, onselect }
		}).body;
		expect(count(semantics, 'class="scope ')).toBe(60);
		expect(text(semantics)).toContain('The first 60 of 92 scopes are listed.');
		// A name used more often than a cell lists: the first uses, and how many more.
		const busy = compile(`int g; void main(void) { g = ${'g + '.repeat(50)}1; }`);
		const uses = render(SemanticsView, {
			props: { c: busy, marks: NO_MARKS, selection: null, onselect }
		}).body;
		expect(count(uses, 'aria-label="Use of g, line 1"')).toBe(SHORT_LIST);
		expect(text(uses)).toContain('and 19 more');

		const ir = render(IrView, { props: { c, marks: NO_MARKS, version: 'before', onselect } }).body;
		expect(count(ir, /<tr class="cm-row/g)).toBeLessThanOrEqual(2 * ROW_LIMIT);
		expect(text(ir)).toContain('The first 800 of');

		const code = render(TargetView, {
			props: { c, marks: NO_MARKS, version: 'before', onselect }
		}).body;
		expect(text(code)).toContain(
			'The TINY Machine has 1024 instruction cells: this code does not fit.'
		);
		expect(text(code)).toContain(
			`The first 32 of ${c.codegen!.frames.length} activation records are listed.`
		);
		// An activation record with more entries than a small table lists.
		const wide = compile(`void main(void) { output(${'input() + '.repeat(40)}1); }`);
		const record = wide.codegen!.frames.find((f) => f.function === 'main')!;
		expect(record.slots.length).toBeGreaterThan(SHORT_LIST);
		expect(
			text(
				render(TargetView, { props: { c: wide, marks: NO_MARKS, version: 'after', onselect } }).body
			)
		).toContain(`${record.slots.length - SHORT_LIST} more entries`);
		expect(text(code)).not.toContain('Open in TINY Machine');
	});
});

describe('programs at the edges', () => {
	const EDGES: [name: string, source: string][] = [
		['an empty text', ''],
		['white space only', ' \n\t\n'],
		['a comment only', '/* nothing here */'],
		['a comment that is never closed', 'void main(void) { } /* open'],
		['one character', '@'],
		['a declaration without main', 'int x;'],
		['an empty main', 'void main(void) { }'],
		['text that does not end in a line break', 'void main(void) { output(1); }'],
		['Windows line breaks', 'void main(void)\r\n{\r\n  output(input());\r\n}\r\n'],
		['characters outside ASCII', 'void main(void) { output(1); } /* π */ é 😀']
	];

	it.each(EDGES)('%s renders in every panel it reaches', (_name, text) => {
		for (const identifiers of ['letters', 'extended'] as const) {
			const c = compile(text, { identifiers });
			const whole = { start: 0, end: text.length };
			const marks = marksFor(c, whole);
			expect(panels(c, marks, text.length ? whole : null).length).toBeGreaterThan(0);
			expect(stageViews(c, runOf(c, []))).toHaveLength(8);
			if (text.length) expect(describeSelection(c, whole, marks).where).toMatch(/^Lines? \d/);
			// The caret anywhere in the text resolves, or is nothing.
			for (let at = 0; at <= text.length; at++) {
				const range = rangeOfCaret(c, at, at);
				if (range) expect(range.end).toBeGreaterThan(range.start);
			}
			for (const tab of TABS) {
				const phase = blockedBy(c, tab);
				if (phase) expect(c.stoppedAt).toBe(phase);
			}
		}
	});

	it('an empty text stops in the parser, and its token list holds ENDFILE alone', () => {
		const c = compile('');
		expect(c.stoppedAt).toBe('parser');
		const html = render(TokensView, { props: { c, marks: NO_MARKS, onselect } }).body;
		expect(text(html)).toContain('0 tokens, then ENDFILE.');
		expect(count(html, '<tr')).toBe(2);
		expect(count(html, 'class="cm-pick"')).toBe(0);
	});
});

describe('copy', () => {
	it('says what things are and do: no teaching claims, no names of people or places', () => {
		const banned =
			/helps? you|understand|learn|intuition|explor|discover|common mistake|misconception|louden|universit|professor|instructor|textbook/i;
		const whole = { start: 0, end: GCD.length };
		const pages = [
			...PRESETS.flatMap((p) => {
				const c = compile(p.value.source);
				return panels(c, NO_MARKS, null);
			}),
			...panels(gcd, marksFor(gcd, whole), whole),
			render(LanguageView, { props: { identifiers: 'letters', grammarHref: null } }).body,
			render(LanguageView, { props: { identifiers: 'extended', grammarHref: null } }).body,
			render(SelectionBar, { props: { summary: null, onclear: () => {} } }).body,
			render(PhaseStrip, { props: { stages: stageViews(gcd, null), current: null, onselect } }).body
		];
		for (const html of pages) expect(text(html)).not.toMatch(banned);
	});
});
