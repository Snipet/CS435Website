import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { printSymbols, type LL1Table } from '$lib/theory/grammar';
import { tool } from '$lib/tools/catalog/ll1';
import { toolLink } from '$lib/tools/links';
import { computeAnalysis, computeParse, readGrammar, readTokens, tableOrder } from './model';
import {
	DEFAULT_PRESET_ID,
	FOLLOW_START,
	SLIDE_6,
	presetFor,
	presetState,
	presets,
	type LL1Preset
} from './presets';
import { setSteps } from './sets';
import { DEFAULT_STATE, isLL1Hash } from './state';
import { symbolsText } from './trace';

const preset = (id: string): LL1Preset => presets.find((p) => p.id === id)!;

/** Everything the page computes for a preset. */
function load(id: string) {
	const state = presetState(preset(id));
	const source = readGrammar(state.grammar);
	const analysis = computeAnalysis({ grammar: state.grammar, names: state.names })!;
	const tokens = readTokens(source.grammar!, state.input);
	const parse = computeParse({ grammar: state.grammar, tokens: tokens.tokens })!;
	return { state, source, analysis, tokens, parse };
}

/** The table as rows of right-hand sides in the order of the state's fields. */
function slideTable(table: LL1Table, rows: string, columns: string): string[] {
	const order = tableOrder(table, rows, columns);
	return [
		order.columns.map((c) => table.columns[c]).join(' | '),
		...order.rows.map(
			(r) =>
				`${table.rows[r]}: ` +
				order.columns
					.map((c) =>
						table.cells[r][c].productions
							.map((p) => printSymbols(table.grammar.productions[p].rhs))
							.join(' / ')
					)
					.join(' | ')
		)
	];
}

/** Slides 7–9, 12 and 25. */
const SLIDE_7 = [
	'int | * | + | ( | ) | $',
	'T: int Y |  |  | ( E ) |  | ',
	'E: T X |  |  | T X |  | ',
	'X:  |  | + E |  | ε | ε',
	'Y:  | * T | ε |  | ε | ε'
];

describe('every preset', () => {
	it.each(presets.map((p) => [p.id] as const))('%s loads without errors', (id) => {
		const { source, analysis, tokens, parse } = load(id);
		expect(source.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		expect(analysis.table.diagnostics).toEqual([]);
		expect(tokens.error).toBeNull();
		expect(parse.parse.rows.length).toBeGreaterThan(0);
		expect(analysis.rewrite.result.fresh.every((f) => f.error === null)).toBe(true);
	});

	it('has a unique id, a group, a description and slides of the decks it follows', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		expect(presets.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
		for (const p of presets) {
			expect(p.group).toBeTruthy();
			expect(p.description).toBeTruthy();
			expect(formatCitation(p.cite!)).toMatch(
				/^(Table-based Predictive Parsing|Bottom-Up Parsing) · slides? \d/
			);
			for (const q of p.questions ?? []) {
				expect(q.prompt).toBeTruthy();
				expect(q.code || q.answer).toBeTruthy();
				expect(q.cite.deck).toBe(p.cite!.deck);
			}
		}
		expect(presets.map((p) => [p.id, formatCitation(p.cite!)])).toEqual([
			['table', 'Table-based Predictive Parsing · slides 7–9'],
			['trace', 'Table-based Predictive Parsing · slide 12'],
			['blank', 'Table-based Predictive Parsing · slide 9'],
			['first-sets', 'Table-based Predictive Parsing · slides 20–21'],
			['follow-sets', 'Table-based Predictive Parsing · slides 22–23'],
			['fill-in', 'Table-based Predictive Parsing · slides 21–23'],
			['nullable', 'Table-based Predictive Parsing · slide 22'],
			['left-factor', 'Table-based Predictive Parsing · slides 5–6'],
			['bottom-up', 'Bottom-Up Parsing · slide 3'],
			['ambiguous', 'Table-based Predictive Parsing · slide 26'],
			['other', 'Table-based Predictive Parsing · slide 26']
		]);
	});

	it('opens as a state the URL accepts, and is found again by that state', () => {
		for (const p of presets) {
			const state = presetState(p);
			expect(isLL1Hash(state)).toBe(true);
			expect(presetFor(state, p.id)).toBe(p);
			expect(presetFor({ ...state, input: `${state.input} int` })).toBeUndefined();
		}
		expect(presetFor(DEFAULT_STATE)?.id).toBe('table');
		expect(presetFor(DEFAULT_STATE, DEFAULT_PRESET_ID)?.id).toBe('trace');
		expect(presetState(preset(DEFAULT_PRESET_ID))).toEqual(DEFAULT_STATE);
	});
});

describe('the slides', () => {
	it('reproduces the table of slides 7–9 in the slides’ order', () => {
		const { state, analysis } = load('table');
		expect(slideTable(analysis.table, state.rows, state.columns)).toEqual(SLIDE_7);
		expect(state.cell).toEqual(['E', 'int']);
	});

	it('reproduces the ten rows of slide 12', () => {
		const { parse } = load('trace');
		expect(parse.parse.outcome).toBe('accept');
		expect(
			parse.parse.rows.map((r) => [symbolsText(r.stack), symbolsText(r.input), r.text].join(' | '))
		).toEqual([
			'E $ | int * int $ | T X',
			'T X $ | int * int $ | int Y',
			'int Y X $ | int * int $ | terminal',
			'Y X $ | * int $ | * T',
			'* T X $ | * int $ | terminal',
			'T X $ | int $ | int Y',
			'int Y X $ | int $ | terminal',
			'Y X $ | $ | ε',
			'X $ | $ | ε',
			'$ | $ | ACCEPT'
		]);
	});

	it('stops on the blank [E,*] entry of slide 9', () => {
		const { parse } = load('blank');
		expect(parse.parse.outcome).toBe('error');
		expect(parse.parse.rows[parse.parse.rows.length - 1].text).toBe('[E,*] is blank');
	});

	it('opens the stepper at the start of First and of Follow', () => {
		const { analysis } = load('follow-sets');
		const steps = setSteps(analysis.table.firstFollow);
		expect(steps[FOLLOW_START]).toMatchObject({
			kind: 'rule',
			phase: 'follow',
			rule: { text: 'Add $ to Follow( E )' }
		});
		expect(presetState(preset('first-sets')).setStep).toBe(0);
		expect(presetState(preset('fill-in')).fill).toBe(true);
	});

	it('gives First and Follow of the grammar with ε-productions', () => {
		const { analysis } = load('nullable');
		const ff = analysis.table.firstFollow;
		expect(Object.fromEntries(['S', 'A', 'B'].map((n) => [n, ff.first.get(n)]))).toEqual({
			S: ['c', 'a', 'b'],
			A: ['a', 'ε'],
			B: ['b', 'ε']
		});
		expect(Object.fromEntries(['S', 'A', 'B'].map((n) => [n, ff.follow.get(n)]))).toEqual({
			S: ['$'],
			A: ['c', 'b'],
			B: ['c']
		});
		expect(analysis.table.ll1).toBe(true);
	});

	it('left-factors slide 5 into slide 6, whose table is the one of slide 7', () => {
		const { state, analysis } = load('left-factor');
		expect(analysis.table.ll1).toBe(false);
		expect(analysis.causes?.prefixes.map((p) => p.nonterminal)).toEqual(['E', 'T']);
		expect(analysis.rewrite.result.text).toBe(SLIDE_6);
		expect(slideTable(analysis.rewrite.table, state.rows, state.columns)).toEqual(SLIDE_7);
	});

	it('finds the conflict in [E, int] of Bottom-Up Parsing, slide 3, and links to the bottom-up tools', () => {
		const { analysis, parse } = load('bottom-up');
		expect(analysis.table.conflicts).toEqual([
			{ nonterminal: 'E', terminal: 'int', productions: [0, 1] }
		]);
		expect(analysis.causes?.leftRecursion.map((r) => r.derivation)).toEqual(['E →+ E + ( E )']);
		expect(analysis.rewrite.result.text).toBe('E → int E’\nE’ → + ( E ) E’ | ε');
		expect(analysis.rewrite.table.ll1).toBe(true);
		expect(parse.parse.outcome).toBe('limit');
		expect(preset('bottom-up').bottomUp).toBe(true);
		// The links appear once the bottom-up tools are part of the site.
		for (const slug of ['shift-reduce', 'lr1'] as const) {
			const href = toolLink(slug, { grammar: 'E → E + ( E ) | int' });
			if (href !== null) expect(href).toMatch(new RegExp(`/${slug}#v1\\.`));
		}
	});

	it('shows an ambiguous grammar, and one that is not LL(1) for another reason', () => {
		const ambiguous = load('ambiguous').analysis;
		expect(ambiguous.causes?.ambiguous?.tokens.join(' ')).toBe('int + int + int');
		expect(ambiguous.rewrite.table.ll1).toBe(false);
		const other = load('other');
		expect(other.analysis.causes?.other.map((c) => [c.nonterminal, c.terminal])).toEqual([
			['A', 'a']
		]);
		// The parser takes A → a and rejects a, which is in L(G).
		expect(other.parse.parse.outcome).toBe('error');
		expect(other.parse.parse.rows[other.parse.parse.rows.length - 1].text).toBe(
			'Mismatch: $ is not a'
		);
	});
});

describe('catalog entry', () => {
	it('registers /ll1 in the syntax stage', () => {
		expect(tool).toMatchObject({
			slug: 'll1',
			title: 'LL(1) Parsing Table',
			stage: 'syntax',
			order: 50
		});
		expect(tool.cites.map(formatCitation)).toEqual([
			'Table-based Predictive Parsing · slides 5–12',
			'Table-based Predictive Parsing · slides 18–26'
		]);
		expect(toolLink('ll1', { grammar: 'S → a' })).toMatch(/^\/ll1#v1\./);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/ll1/', import.meta.url));
	const sources = [
		...readdirSync(here)
			.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
			.map((f) => here + f),
		...readdirSync(route).map((f) => route + f)
	];

	it('has no teaching-purpose phrasing and names no instructor', () => {
		expect(sources.length).toBeGreaterThan(10);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
		expect(`${tool.title} ${tool.summary}`).not.toMatch(forbidden);
	});
});
