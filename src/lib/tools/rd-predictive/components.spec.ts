/**
 * Server-renders the tool's panels: the markup must build for every preset and
 * show what the slides show.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { Stepper } from '$lib/components/ui';
import AstPanel from './AstPanel.svelte';
import CallStack from './CallStack.svelte';
import CodeListing from './CodeListing.svelte';
import { compareTexts } from './compare';
import Findings from './Findings.svelte';
import GrammarBox from './GrammarBox.svelte';
import { readAst, readInput, readParser, readSource, runParser } from './model';
import PredictionTable from './PredictionTable.svelte';
import PresetNote from './PresetNote.svelte';
import { SLIDE_37, SLIDE_38_EBNF, SLIDE_40_CODE, presetState, presets } from './presets';
import { programText } from './program';
import RewritePanel from './RewritePanel.svelte';
import RunPanel from './RunPanel.svelte';
import SameStrings, { type Comparison } from './SameStrings.svelte';
import StepLine from './StepLine.svelte';
import { describeStep, stackRows } from './view';

/** The text of rendered markup, with one space where tags and line breaks were. */
const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<(sup|sub)[^>]*>(.*?)<\/\1>/g, '$2')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

const preset = (id: string) => presets.find((p) => p.id === id)!;

/** What the page computes for a preset. */
function load(id: string) {
	const state = presetState(preset(id));
	const source = readSource(state.grammar, state);
	const parser = readParser(state.ebnf ?? source.rewrite!.text);
	const input = readInput(state.input, parser.ebnf!);
	const run = runParser(parser, input)!;
	const ast = readAst(parser, input, state.ast)!;
	return { state, source, parser, input, run, ast };
}

/** A stepper on a given step; it has no component to stop it, so it is never played. */
const stepperAt = (total: number, index: number) => new Stepper(() => total, { index });

const comparisonOf = (original: string, rewritten: string): Comparison => ({
	result: compareTexts({ original, rewritten, maxLength: 7 }),
	stale: false,
	status: 'idle',
	error: null
});

function rewritePanel(id: string, inUse = true) {
	const { state, source } = load(id);
	return text(
		render(RewritePanel, {
			props: {
				rewrite: source.rewrite!,
				comparison: comparisonOf(state.grammar, source.rewrite!.text),
				form: state.form,
				order: state.order,
				nonterminals: source.grammar!.nonterminals,
				kinds: source.kinds,
				inUse,
				onuse: () => {}
			}
		}).body
	);
}

describe('Findings', () => {
	const findings = (grammar: string) => {
		const source = readSource(grammar);
		return text(
			render(Findings, {
				props: {
					recursion: source.recursion,
					prefixes: source.prefixes,
					nonterminals: source.grammar!.nonterminals
				}
			}).body
		);
	};

	it('lists left recursion with its derivation and its productions', () => {
		const html = findings('S → A a | d\nA → S b');
		expect(html).toContain('Left recursion');
		expect(html).toContain('S →+ S b a');
		expect(html).toContain('By the productions S → A a , A → S b');
		expect(html).toContain('no single production starts with its own left-hand side');
		expect(findings('S → 1 | S 0')).toContain('By the production S → S 0 .');
	});

	it('lists the alternatives with a common prefix', () => {
		const html = findings('E → T + E | T\nT → ( E ) | int | int * T');
		expect(html).toContain('Common prefix');
		expect(html).toContain(
			'E → T + E and E → T start with T , and one of them is the prefix alone.'
		);
		expect(html).toContain('T → int and T → int * T start with int');
	});

	it('says so when there is nothing to report', () => {
		expect(findings('E → T { + T }\nT → int')).toContain(
			'No left recursion, and no alternatives with a common prefix.'
		);
	});
});

describe('RewritePanel', () => {
	it('shows before and after side by side, the changes, and the check (slide 38)', () => {
		const html = rewritePanel('recipe');
		expect(html).toContain('Before');
		expect(html).toContain('After');
		for (const line of SLIDE_38_EBNF.split('\n')) expect(html).toContain(line);
		expect(html).toContain('Result as');
		expect(html).toContain('BNF with ε');
		expect(html).toContain('Left recursion removed');
		expect(html).toContain('Left recursion implies left associativity. With EBNF it becomes { }');
		expect(html).toContain('Same strings');
		expect(html).toContain('Both grammars generate the same strings of up to 7 tokens.');
		expect(html).toContain('Use this grammar below');
		expect(html).toContain('The parser below is generated from the grammar under “After”.');
	});

	it('labels the general algorithm and names the two orders (slide 27)', () => {
		const html = rewritePanel('indirect');
		expect(html).toContain('General algorithm');
		expect(html).toContain('The slides leave this algorithm to the text.');
		expect(html).toContain('Order of the non-terminals');
		expect(html).toContain('S, A');
		expect(html).toContain('A, S');
		expect(html).toContain('S → d { b a }');
		expect(html).toContain('Production dropped');
		expect(html).toContain('no rule');
	});

	it('says what right recursion becomes (slides 36 and 39)', () => {
		const html = rewritePanel('suitable', false);
		expect(html).toContain('Left factored');
		expect(html).toContain('Right recursion implies right associativity. With EBNF it becomes [ ]');
		expect(html).toContain('The parser below is generated from another grammar.');
		// No left recursion: nothing to choose a form for.
		expect(html).not.toContain('Result as');
	});

	it('says so when there is nothing to rewrite, and leaves right recursion alone', () => {
		const source = readSource('A → x A | y');
		const html = text(
			render(RewritePanel, {
				props: {
					rewrite: source.rewrite!,
					comparison: comparisonOf('A → x A | y', ''),
					form: 'ebnf',
					order: 'written',
					kinds: source.kinds,
					inUse: true,
					onuse: () => {}
				}
			}).body
		);
		expect(html).toContain('Nothing to rewrite');
		expect(html).toContain('The right recursion of A stays as it is.');
		expect(html).not.toContain('Same strings');
	});

	it.each(presets.map((p) => [p.id] as const))('renders for the preset %s', (id) => {
		expect(rewritePanel(id)).toContain('After');
	});
});

describe('PredictionTable', () => {
	it('lists rule, choice and lookahead tokens (slide 37)', () => {
		const html = text(render(PredictionTable, { props: { rows: readParser(SLIDE_37).rows } }).body);
		expect(html).toContain('Rule');
		expect(html).toContain('Choice');
		expect(html).toContain('Lookahead tokens');
		expect(html).toContain('T → ( E ) | int [ * T ]');
		expect(html).toContain('[ + E ] optional');
		expect(html).toContain('{ + }');
		expect(html).toContain('skipped on { ), $ }');
		expect(html).toContain('int [ * T ] alternative');
		expect(html).not.toContain('(conflict)');
	});

	it('marks the tokens of a conflict (slide 36)', () => {
		const { body } = render(PredictionTable, {
			props: { rows: readParser('E → T + E | T\nT → ( E ) | int | int * T').rows }
		});
		expect(body).toContain('<mark');
		expect(text(body)).toContain('(conflict)');
	});

	it('says so when the parser never has to choose', () => {
		expect(text(render(PredictionTable, { props: { rows: [] } }).body)).toContain(
			'the parser never has to choose'
		);
	});
});

describe('CodeListing', () => {
	const { parser, run } = load('parser');

	it('shows the code of slide 37 with line numbers and the executing line', () => {
		const { body } = render(CodeListing, {
			props: { program: parser.program!, line: run.steps[5].line, sites: [2, 11] }
		});
		const html = text(body);
		for (const line of programText(parser.program!).split('\n')) {
			if (line.trim()) expect(html).toContain(line.trim());
		}
		expect(html).toContain('35 }');
		expect(body.match(/aria-current="step"/g)).toHaveLength(1);
		expect(body.match(/class="[^"]*waiting/g)).toHaveLength(2);
		expect(body.match(/class="[^"]*comment/g)).toHaveLength(3);
	});
});

describe('RunPanel', () => {
	const panel = (id: string, index: number | null, stale = false) => {
		const { state, run, input } = load(id);
		const at = index ?? run.steps.length - 1;
		return text(
			render(RunPanel, {
				props: {
					input: state.input,
					inputError: input.error,
					run,
					stepper: stepperAt(run.steps.length, at),
					stale
				}
			}).body
		);
	};

	it('opens the parser of slide 37 on its first step, without the outcome', () => {
		const html = panel('parser', 0);
		expect(html).toContain('Token string');
		expect(html).toContain('Step 1 of 20');
		expect(html).toContain('Line 1 main () {');
		expect(html).toContain('main () starts');
		expect(html).toContain('Call stack');
		expect(html).not.toContain('Accepted');
	});

	it('shows the outcome at the last step', () => {
		const html = panel('parser', null);
		expect(html).toContain('Step 20 of 20');
		expect(html).toContain('Accepted: every token matched, including $');
		expect(panel('what-goes-wrong', null)).toContain('Stopped: the calls never end');
		expect(panel('suitable', null)).toContain("Rejected: match ('+') fails");
	});

	it('says when the run shown is not for the text as it is', () => {
		expect(panel('parser', 3, true)).toContain(
			'Showing the run of the last grammar and token string without errors.'
		);
	});

	it('says when there is nothing to run', () => {
		const html = text(
			render(RunPanel, {
				props: {
					input: 'x',
					inputError: 'x is not a terminal.',
					run: null,
					stepper: stepperAt(0, 0)
				}
			}).body
		);
		expect(html).toContain('x is not a terminal.');
		expect(html).toContain('The parser runs when the grammar and the token string have no errors.');
	});

	it.each(presets.map((p) => [p.id] as const))('renders every step of the preset %s', (id) => {
		const { run } = load(id);
		for (let i = 0; i < run.steps.length; i++) expect(panel(id, i)).toContain(`Step ${i + 1} of`);
	});
});

describe('AstPanel', () => {
	const panel = (id: string, index: number | null, form: 'loop' | 'recursion' | null = null) => {
		const { parser, input } = load(id);
		const model = readAst(parser, input, form)!;
		const total = model.run?.steps.length ?? 0;
		return text(
			render(AstPanel, {
				props: { model, stepper: stepperAt(total, index ?? total - 1), onform: () => {} }
			}).body
		);
	};

	it('shows the function of slide 40 and the finished AST', () => {
		const html = panel('ast', null);
		// The text helper folds the two spaces of `plus->left  = tree;` into one.
		for (const line of SLIDE_40_CODE.split('\n'))
			expect(html).toContain(line.trim().replace(/\s+/g, ' '));
		expect(html).toContain('{ } left-associative');
		expect(html).toContain('[ ] right-associative');
		expect(html).toContain('A loop makes the tree so far the left child of each new node.');
		expect(html).toContain('The AST is +( +( int, int ), int ).');
		expect(html).toContain('Variables');
		expect(html).toContain('Trees');
	});

	it('shows the other form on the same input', () => {
		const html = panel('ast', null, 'recursion');
		expect(html).toContain('E → T [ + E ]');
		expect(html).toContain('plus->right = E ();');
		expect(html).toContain('The AST is +( int, +( int, int ) ).');
		expect(html).toContain('The rules of E and T are written with [ ] here.');
	});

	it('starts with no node', () => {
		expect(panel('ast', 0)).toContain('No node has been made yet.');
	});

	it('says which rules have no function', () => {
		const html = panel('one-zero', null);
		expect(html).toContain('No function for S');
		expect(html).not.toContain('left-associative');
		expect(html).not.toContain('Trees');
	});

	it.each(presets.map((p) => [p.id] as const))('renders every step of the preset %s', (id) => {
		const { ast } = load(id);
		const total = ast.run?.steps.length ?? 0;
		for (let i = 0; i < Math.max(1, total); i++) expect(panel(id, i)).toContain('Grammar');
	});
});

describe('PresetNote', () => {
	it.each(presets.map((p) => [p.id, p] as const))(
		'%s shows its slide and its questions',
		(_, p) => {
			const html = text(render(PresetNote, { props: { preset: p } }).body);
			expect(html).toContain('Top-Down Parsing');
			for (const q of p.questions ?? []) {
				expect(html).toContain('Show answer');
				if (q.answer) expect(html).toContain(q.answer);
			}
		}
	);

	it('draws subscripts and the + of →+', () => {
		/** The markup without Svelte's markers and without attributes on sub and sup. */
		const markup = (id: string) =>
			render(PresetNote, { props: { preset: preset(id) } })
				.body.replace(/<!--.*?-->/g, '')
				.replace(/<(sub|sup)[^>]*>/g, '<$1>');
		expect(markup('general-form')).toContain('α<sub>1</sub>');
		expect(markup('general-form')).toContain('β<sub>m</sub>');
		expect(markup('indirect')).toContain('S →<sup>+</sup> ?');
	});
});

describe('small pieces', () => {
	it('GrammarBox shows the grammar under its caption', () => {
		const { body } = render(GrammarBox, {
			props: { text: SLIDE_37, ebnf: true, label: 'After' }
		});
		expect(text(body)).toContain('After E → T [ + E ] T → ( E ) | int [ * T ]');
		expect(body).toContain('hl-name');
		expect(body).toContain('hl-operator');
	});

	it('CallStack lists the calls innermost first', () => {
		const { run } = load('parser');
		const html = text(render(CallStack, { props: { rows: stackRows(run, 8) } }).body);
		expect(html).toContain('T () called from line 30');
		expect(html).toContain('main () called first');
		expect(html.indexOf('T ()')).toBeLessThan(html.indexOf('main ()'));
		expect(text(render(CallStack, { props: { rows: [] } }).body)).toContain('No call in progress.');
		const deep = load('what-goes-wrong').run;
		expect(
			text(
				render(CallStack, {
					props: { rows: stackRows(deep, deep.steps.length - 1), limit: 4 }
				}).body
			)
		).toContain('… 5 more below');
	});

	it('CallStack shows the variables of the functions that build an AST', () => {
		const { ast } = load('ast');
		const run = ast.run!;
		const at = run.steps.findIndex((s) => s.kind === 'assign' && s.target.kind === 'field');
		const html = text(render(CallStack, { props: { rows: stackRows(run, at) } }).body);
		expect(html).toContain('tree int');
		expect(html).toContain('plus +( int, … )');
		const declared = text(render(CallStack, { props: { rows: stackRows(run, 3) } }).body);
		expect(declared).toContain('tree not set');
	});

	it('StepLine shows the line of code with what the step does', () => {
		const { run } = load('parser');
		const html = text(
			render(StepLine, {
				props: { text: describeStep(run, 5), line: run.steps[5].line, code: '    match (token);' }
			}).body
		);
		expect(html).toContain('Line 27 match (token);');
		expect(html).toContain('match (token): int is matched');
		expect(html).toContain('The token is now *.');
	});

	it('SameStrings shows the verdict, or the strings that differ', () => {
		const same = text(
			render(SameStrings, { props: { comparison: comparisonOf('S → 1 | S 0', 'S → 1 { 0 }') } })
				.body
		);
		expect(same).toContain('Same strings');
		const different = text(
			render(SameStrings, {
				props: {
					comparison: comparisonOf('S → 1 | S 0', 'S → 1 0 { 0 }'),
					name: 'the grammar of the parser'
				}
			}).body
		);
		expect(different).toContain('Different');
		expect(different).toContain('Only the grammar as written generates (1 string) 1');
		expect(different).not.toContain('Only the grammar of the parser generates');
		const waiting = text(
			render(SameStrings, {
				props: { comparison: { result: null, stale: true, status: 'working', error: null } }
			}).body
		);
		expect(waiting).toContain('Comparing…');
		const late = text(
			render(SameStrings, {
				props: { comparison: { result: null, stale: true, status: 'timed-out', error: null } }
			}).body
		);
		expect(late).toContain('takes too long');
	});
});
