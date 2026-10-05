import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decks, formatCitation } from '$lib/lectures';
import { tool } from '$lib/tools/catalog/rd-predictive';
import { bracketOf, nodesAt } from './ast';
import { compareTexts } from './compare';
import { readAst, readInput, readParser, readSource, runParser } from './model';
import {
	DEFAULT_PRESET_ID,
	SLIDE_23,
	SLIDE_25,
	SLIDE_26,
	SLIDE_27,
	SLIDE_36,
	SLIDE_37,
	SLIDE_38,
	SLIDE_38_EBNF,
	SLIDE_39,
	SLIDE_40_CODE,
	presetFor,
	presetState,
	presets,
	type PredictivePreset
} from './presets';
import { functionText, programText } from './program';
import { callNames } from './run';
import { DEFAULT_STATE, isPredictiveHash } from './state';
import { describeStep, formulaParts, outcomeText } from './view';

const preset = (id: string): PredictivePreset => presets.find((p) => p.id === id)!;

/** Everything the page computes for a preset. */
function load(id: string) {
	const state = presetState(preset(id));
	const source = readSource(state.grammar, state);
	const parser = readParser(state.ebnf ?? source.rewrite!.text);
	const input = readInput(state.input, parser.ebnf!);
	const run = runParser(parser, input);
	const ast = readAst(parser, input, state.ast);
	return { state, source, parser, input, run, ast };
}

const lines = (...rows: string[]) => rows.join('\n');

describe('every preset', () => {
	it.each(presets.map((p) => [p.id] as const))('%s loads without errors', (id) => {
		const { source, parser, input, run, ast } = load(id);
		expect(source.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		expect(source.rewrite).not.toBeNull();
		expect(parser.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		expect(parser.program).not.toBeNull();
		expect(input.diagnostics).toEqual([]);
		expect(input.error).toBe('');
		expect(run).not.toBeNull();
		// Every step has its words, and the run its outcome.
		run!.steps.forEach((_, i) => {
			const text = describeStep(run!, i);
			expect(text.title.length).toBeGreaterThan(0);
		});
		expect(outcomeText(run!).title.length).toBeGreaterThan(0);
		expect(ast).not.toBeNull();
		ast!.run?.steps.forEach((_, i) => {
			expect(describeStep(ast!.run!, i).title.length).toBeGreaterThan(0);
		});
	});

	it.each(presets.map((p) => [p.id] as const))('%s keeps the language in its rewrite', (id) => {
		const { state, source } = load(id);
		const compared = compareTexts({
			original: state.grammar,
			rewritten: source.rewrite!.text,
			maxLength: 7
		});
		expect(compared).toMatchObject({
			status: 'done',
			checkedUpTo: 7,
			onlyOriginal: { count: 0 },
			onlyRewritten: { count: 0 }
		});
	});

	it('has a unique id, a group, a description and slides of Top-Down Parsing', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group).toBeTruthy();
			expect(p.description).toBeTruthy();
			expect(p.cite?.deck).toBe('11');
			expect(formatCitation(p.cite!)).toMatch(/^Top-Down Parsing · slides? \d/);
		}
		expect(decks['11'].title).toBe('Top-Down Parsing');
		expect(presets.map((p) => p.cite!.slide)).toEqual([
			23,
			[24, 25],
			26,
			27,
			36,
			37,
			38,
			39,
			40,
			41
		]);
	});

	it('opens as a state the URL accepts, and is found again by that state', () => {
		for (const p of presets) {
			const state = presetState(p);
			expect(isPredictiveHash(state)).toBe(true);
			expect(presetFor(state, p.id)).toBe(p);
			expect(presetFor(state)).toBe(p);
			expect(presetFor({ ...state, input: `${state.input} $ $` })).toBeUndefined();
		}
	});

	it('poses the questions of the slides as questions, each with an answer', () => {
		const questions = presets.flatMap((p) => p.questions ?? []);
		expect(questions).toHaveLength(12);
		for (const q of questions) {
			expect(q.prompt).toContain('?');
			expect(q.answer ?? q.code).toBeTruthy();
			expect(q.cite.deck).toBe('11');
		}
		expect(questions.map((q) => q.prompt)).toEqual(
			expect.arrayContaining([
				'S → S α | β. S generates all strings of form ?',
				'Remove left-recursion to obtain ?',
				'Previous grammar suitable for prediction?',
				'Solution?',
				'Does this succeed on s = “int * int $” ?',
				'So remove it with EBNF. How?',
				'A → X op A | X becomes ?',
				'So how do we build the AST?'
			])
		);
	});
});

describe('the default: the recipe of slide 41', () => {
	it('is the grammar of slide 38, rewritten, with the parser run on int + int * int', () => {
		expect(DEFAULT_PRESET_ID).toBe('recipe');
		expect(presetState(preset('recipe'))).toEqual(DEFAULT_STATE);
		expect(presetFor(DEFAULT_STATE)?.id).toBe('recipe');
		expect(preset('recipe').description).toBe(
			'RD w/prediction: eliminate left-recursion using EBNF, left factor using EBNF, and write one function per (rewritten) grammar rule.'
		);
		const { source, parser, run, ast } = load('recipe');
		expect(source.rewrite!.text).toBe(SLIDE_38_EBNF);
		expect(parser.prediction!.suitable).toBe(true);
		expect(parser.program!.functions.map((f) => f.name)).toEqual(['main', 'E', 'T', 'F']);
		expect(run!.outcome).toBe('accept');
		expect(run!.tokens).toEqual(['int', '+', 'int', '*', 'int', '$']);
		expect(bracketOf(nodesAt(ast!.run!, ast!.run!.steps.length - 1), ast!.run!.result)).toBe(
			'+( int, *( int, int ) )'
		);
	});
});

describe('slide 23: V → V a', () => {
	const { source, parser, run } = load('what-goes-wrong');

	it('reports the left recursion with its derivation', () => {
		expect(SLIDE_23).toBe('V → V a | b');
		expect(source.recursion.map((f) => f.summary)).toEqual(['V →+ V a']);
		expect(source.rewrite!.text).toBe('V → b { a }');
	});

	it('generates the parser from the grammar as written, and its calls never end', () => {
		expect(parser.prediction!.suitable).toBe(false);
		expect(parser.prediction!.conflicts.map((c) => c.kind)).toContain('left-recursion');
		expect(run!.outcome).toBe('loop');
		expect(callNames(run!).slice(0, 4)).toEqual(['main', 'V', 'V', 'V']);
		expect(outcomeText(run!)).toEqual({
			tone: 'warn',
			title: 'Stopped: the calls never end',
			lines: []
		});
		expect(describeStep(run!, run!.steps.length - 1)).toEqual({
			title: 'V () is called again and the token is still b',
			detail:
				'No token is matched between the calls, so they never end. The run stops at 8 nested calls.',
			tone: 'warn'
		});
	});
});

describe('slides 24–25: S → 1 | S 0', () => {
	it('gives S → 1 { 0 } using EBNF', () => {
		const { source, run } = load('one-zero');
		expect(SLIDE_25).toBe('S → 1 | S 0');
		expect(source.rewrite!.text).toBe('S → 1 { 0 }');
		expect(run!.outcome).toBe('accept');
	});

	it('or S → 1 S’ ; S’ → 0 S’ | ε', () => {
		const source = readSource(SLIDE_25, { form: 'bnf' });
		expect(source.rewrite!.text).toBe('S → 1 S’\nS’ → 0 S’ | ε');
		const parser = readParser(source.rewrite!.text);
		expect(parser.prediction!.suitable).toBe(true);
		expect(runParser(parser, readInput('1 0 0', parser.ebnf!))!.outcome).toBe('accept');
		// The answers of the slides.
		const answers = preset('one-zero').questions!.map((q) => q.code);
		expect(answers).toEqual(['β { α }', 'S → β S’\nS’ → α S’ | ε', 'S → 1 S’\nS’ → 0 S’ | ε']);
	});
});

describe('slide 26: the general form', () => {
	it('shows the formula and rewrites an instance of it', () => {
		const p = preset('general-form');
		expect(p.formula).toEqual(['S → S α₁ | … | S αₙ | β₁ | … | βₘ']);
		expect(p.questions![0].code).toBe('S → β₁ S’ | … | βₘ S’\nS’ → α₁ S’ | … | αₙ S’ | ε');
		expect(formulaParts('S αₙ | β₁')).toEqual([
			{ text: 'S α', script: null },
			{ text: 'n', script: 'sub' },
			{ text: ' | β', script: null },
			{ text: '1', script: 'sub' }
		]);
		const { state, source, run } = load('general-form');
		expect(SLIDE_26).toBe('S → S a | S b | c | d');
		expect(state.form).toBe('bnf');
		expect(source.rewrite!.text).toBe('S → c S’ | d S’\nS’ → a S’ | b S’ | ε');
		expect(run!.outcome).toBe('accept');
	});
});

describe('slide 27: S → A a | d ; A → S b', () => {
	it('answers S →+ S b a and uses the general algorithm', () => {
		const { state, source, parser, run } = load('indirect');
		expect(SLIDE_27).toBe('S → A a | d\nA → S b');
		expect(source.recursion[0]).toMatchObject({
			nonterminal: 'S',
			immediate: false,
			summary: 'S →+ S b a',
			forms: [['S'], ['A', 'a'], ['S', 'b', 'a']]
		});
		expect(preset('indirect').questions![0].code).toBe('S β α');
		// With A before S, as in the derivation S → A a → S b a.
		expect(state.order).toBe('reversed');
		expect(source.rewrite!.method).toBe('general');
		expect(source.rewrite!.text).toBe('S → d { b a }');
		expect(parser.prediction!.suitable).toBe(true);
		expect(run!.outcome).toBe('accept');
	});

	it('in the order as written the result has no left recursion, and is not suitable', () => {
		const source = readSource(SLIDE_27);
		expect(source.rewrite!.text).toBe('S → A a | d\nA → d b { a b }');
		const parser = readParser(source.rewrite!.text);
		expect(parser.prediction!.conflicts.map((c) => c.message)).toEqual([
			'S: the token d selects both A a and d.',
			'A: the token a can start { a b } and can also come right after it.'
		]);
	});
});

describe('slide 36: is the grammar suitable for prediction?', () => {
	const { source, parser, run } = load('suitable');

	it('lists the common prefixes and left factors with EBNF', () => {
		expect(SLIDE_36).toBe('E → T + E | T\nT → ( E ) | int | int * T');
		expect(source.prefixes.map((f) => [f.nonterminal, f.prefix])).toEqual([
			['E', ['T']],
			['T', ['int']]
		]);
		expect(source.rewrite!.text).toBe(SLIDE_37);
		expect(preset('suitable').questions![1].code).toBe(SLIDE_37);
	});

	it('shows the conflicts of the grammar as written', () => {
		expect(parser.prediction!.suitable).toBe(false);
		expect(parser.prediction!.conflicts.map((c) => c.message)).toEqual([
			'E: the tokens ( and int select both T + E and T.',
			'T: the token int selects both int and int * T.'
		]);
		// Its parser takes T → int and then fails on *, although int * int is a sentence.
		expect(run!.outcome).toBe('mismatch');
		expect(outcomeText(run!)).toEqual({
			tone: 'error',
			title: "Rejected: match ('+') fails",
			lines: []
		});
		expect(describeStep(run!, run!.steps.length - 1).detail).toBe('The token is *, not +.');
	});

	it('becomes the preset of slide 37 when the rewritten grammar is used', () => {
		const state = { ...presetState(preset('suitable')), ebnf: null };
		expect(presetFor(state)?.id).toBe('parser');
	});
});

describe('slide 37: the parser', () => {
	const { state, parser, run } = load('parser');

	it('is generated for E → T [ + E ] ; T → ( E ) | int [ * T ]', () => {
		expect(state.ebnf).toBeNull();
		expect(state.step).toBe(0);
		expect(programText(parser.program!).split('\n')).toHaveLength(35);
		expect(functionText(parser.program!, 1)).toBe(
			lines(
				'// E -> T [ + E ]',
				'E () {',
				'  T ();',
				"  if (token == '+') {",
				"    match ('+');",
				'    E ();',
				'  }',
				'}'
			)
		);
		expect(parser.prediction!.suitable).toBe(true);
	});

	it('succeeds on int * int $', () => {
		expect(run!.tokens).toEqual(['int', '*', 'int', '$']);
		expect(run!.outcome).toBe('accept');
		expect(callNames(run!)).toEqual(['main', 'E', 'T', 'T']);
		expect(outcomeText(run!)).toEqual({
			tone: 'success',
			title: 'Accepted: every token matched, including $',
			lines: []
		});
	});
});

describe('slide 38: left recursion removed with EBNF', () => {
	it('gives E → T { + T } ; T → F { * F } ; F → ( E ) | int', () => {
		const { source, run } = load('left-recursion-ebnf');
		expect(SLIDE_38).toBe('E → E + T | T\nT → T * F | F\nF → ( E ) | int');
		expect(source.rewrite!.text).toBe(SLIDE_38_EBNF);
		expect(preset('left-recursion-ebnf').questions![0].code).toBe(SLIDE_38_EBNF);
		expect(source.kinds).toEqual([
			{ nonterminal: 'E', left: true, right: false },
			{ nonterminal: 'T', left: true, right: false }
		]);
		expect(source.rewrite!.changes.every((c) => c.note?.includes('left associativity'))).toBe(true);
		expect(run!.outcome).toBe('accept');
	});
});

describe('slide 39: right recursion', () => {
	it('A → X op A | X becomes A → X [ op A ]', () => {
		const { source, run, ast } = load('right-recursion');
		expect(SLIDE_39).toBe('A → X op A | X');
		expect(source.rewrite!.text).toBe('A → X [ op A ]');
		expect(source.rewrite!.changes[0].note).toContain(
			'Right recursion implies right associativity'
		);
		expect(run!.outcome).toBe('accept');
		expect(ast!.form).toBe('recursion');
		const built = ast!.run!;
		expect(bracketOf(nodesAt(built, built.steps.length - 1), built.result)).toBe(
			'op( X, op( X, X ) )'
		);
	});
});

describe('slide 40: AST construction', () => {
	const { state, parser, input, ast } = load('ast');

	it('generates the function of the slide', () => {
		expect(state.astStep).toBe(0);
		expect(ast!.form).toBe('loop');
		expect(functionText(ast!.code.program, 0)).toBe(SLIDE_40_CODE);
		expect(preset('ast').questions![0].code).toBe(SLIDE_40_CODE);
	});

	it('builds the left-associative AST of int + int + int', () => {
		const built = ast!.run!;
		expect(bracketOf(nodesAt(built, built.steps.length - 1), built.result)).toBe(
			'+( +( int, int ), int )'
		);
		expect(outcomeText(built).title).toBe('AST: +( +( int, int ), int )');
	});

	it('and the right-associative one with [ ]', () => {
		const other = readAst(parser, input, 'recursion')!;
		expect(other.reformed.text).toBe('E → T [ + E ]\nT → F [ * T ]\nF → ( E ) | int');
		expect(other.reformed.changed).toEqual(['E', 'T']);
		const built = other.run!;
		expect(bracketOf(nodesAt(built, built.steps.length - 1), built.result)).toBe(
			'+( int, +( int, int ) )'
		);
	});
});

describe('catalog entry', () => {
	it('registers /rd-predictive in the syntax stage', () => {
		expect(tool).toMatchObject({
			slug: 'rd-predictive',
			title: 'Predictive Recursive Descent',
			summary:
				'Rewrite a grammar with EBNF so one token of lookahead picks each rule, then run the generated recursive-descent parser.',
			stage: 'syntax',
			order: 40
		});
		expect(tool.cites.map(formatCitation)).toEqual([
			'Top-Down Parsing · slides 23–27',
			'Top-Down Parsing · slides 36–41'
		]);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|study aid|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/rd-predictive/', import.meta.url));
	const sources = [
		...readdirSync(here)
			.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
			.map((f) => here + f),
		...readdirSync(route).map((f) => route + f)
	];

	it('has no teaching-purpose phrasing', () => {
		expect(sources.length).toBeGreaterThan(10);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
		expect(`${tool.title} ${tool.summary}`).not.toMatch(forbidden);
	});
});
