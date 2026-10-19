import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { tool } from '$lib/tools/catalog/shift-reduce';
import { bracketForm } from '$lib/theory/grammar';
import { computeParse, readGrammar, readInput, type ParseView } from './model';
import {
	AMBIGUOUS,
	CASCADE,
	DEFAULT_PRESET_ID,
	LEFT_FACTORED,
	presetFor,
	presetState,
	presets
} from './presets';
import { DEFAULT_STATE } from './state';
import {
	configuration,
	configurationText,
	explain,
	forestAfter,
	forestBefore,
	handleRows,
	stackStates,
	traceRows
} from './view';

const preset = (id: string) => presets.find((p) => p.id === id)!;

/** What the page computes for a preset. */
function load(id: string): ParseView {
	const state = presetState(preset(id));
	const result = computeParse({ grammar: state.grammar, input: state.input });
	if (result.kind !== 'parse') throw new Error(result.message);
	return result;
}

/** The rows of the trace as slide 14 writes them, the marked symbols in brackets. */
const trace = (r: ParseView, collapse = true) =>
	traceRows(r.parse, collapse).map(
		(row) => `${configurationText(configuration(row, r.grammar), true)}  ${row.text}`
	);

const marked = (r: ParseView) =>
	handleRows(r.handles!).map((row) =>
		row.marked.pieces.map((p) => (p.mark ? `[${p.text}]` : p.text)).join('')
	);

describe('every preset', () => {
	it.each(presets.map((p) => [p.id] as const))('%s parses without errors', (id) => {
		const state = presetState(preset(id));
		const g = readGrammar(state.grammar);
		expect(g.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		expect(readInput(state.input, g.grammar!).error).toBeNull();
		const r = load(id);
		expect(r.parse.outcome).toBe('accept');
		expect(r.handles).not.toBeNull();
		// Every row has its reason.
		for (const row of traceRows(r.parse, true))
			expect(explain(r.grammar, row, r.decisions).length).toBeGreaterThan(20);
	});

	it('has a unique id, a group, a description and a valid citation', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group).toBeTruthy();
			expect(p.description!.length).toBeGreaterThan(40);
			if (p.cite)
				expect(formatCitation(p.cite)).toMatch(
					/^Bottom-up Parsing (II|III) · slides? \d|^Bottom-Up Parsing · slides? \d/
				);
		}
		// The cascade is on no slide.
		expect(preset('cascade').cite).toBeUndefined();
	});

	it('opens on the default state with the slide 14 preset', () => {
		expect(DEFAULT_PRESET_ID).toBe('slide-14');
		expect(presetState(preset('slide-14'))).toEqual(DEFAULT_STATE);
		expect(presetFor(DEFAULT_STATE)?.id).toBe('slide-14');
		expect(presetFor({ ...DEFAULT_STATE, view: 'handles' })?.id).toBe('slides-5-10');
		expect(presetFor({ ...DEFAULT_STATE, input: 'int' })).toBeNull();
		// Spacing does not matter; a preset loaded last wins while it fits.
		expect(presetFor({ ...DEFAULT_STATE, input: ' int +  ( int ) + ( int ) ' })?.id).toBe(
			'slide-14'
		);
	});

	it('poses the question of slide 15 with its answer', () => {
		const [q] = preset('epsilon').questions!;
		expect(q.prompt).toContain('0 ?');
		expect(q.answer).toContain('ε');
		expect(formatCitation(q.cite)).toBe('Bottom-up Parsing II · slide 15');
	});
});

describe('Bottom-up Parsing II, slides 4–14', () => {
	it('reproduces the trace of slide 14 row for row, the purple symbols in brackets', () => {
		expect(formatCitation(preset('slide-14').cite!)).toBe('Bottom-up Parsing II · slides 4–14');
		expect(trace(load('slide-14'))).toEqual([
			'I [int] + (int) + (int)$  shift',
			'[int] I + (int) + (int)$  red. E → int',
			'E I [+ (int]) + (int)$  shift 3 times',
			'E + ([int] I ) + (int)$  red. E → int',
			'E + (E I [)] + (int)$  shift',
			'[E + (E)] I + (int)$  red. E → E + (E)',
			'E I [+ (int])$  shift 3 times',
			'E + ([int] I )$  red. E → int',
			'E + (E I [)]$  shift',
			'[E + (E)] I $  red. E → E + (E)',
			'E I $  accept'
		]);
	});

	it('lists every shift on its own row when they are not collapsed', () => {
		const rows = trace(load('slide-14'), false);
		expect(rows).toHaveLength(15);
		expect(rows.slice(2, 5)).toEqual([
			'E I [+] (int) + (int)$  shift',
			'E + I [(]int) + (int)$  shift',
			'E + ( I [int]) + (int)$  shift'
		]);
	});

	it('grows the tree over the tokens, the arrow under the divider as on the slides', () => {
		const r = load('slide-14');
		const rows = traceRows(r.parse, true);
		const at = (k: number) => forestBefore(r.parse, rows[k].rows[0]);
		// Slide 4: no nodes, the arrow before the first int.
		expect(at(0).forest.map((n) => n.symbol)).toEqual([
			'int',
			'+',
			'(',
			'int',
			')',
			'+',
			'(',
			'int',
			')'
		]);
		expect(at(0).marker).toBe(0);
		// Slides 5 and 6: the arrow between int and +; E over the first int on slide 6.
		expect(at(1)).toMatchObject({ marker: 1, stacked: 1 });
		expect(at(2).forest[0].symbol).toBe('E');
		expect(at(2).marker).toBe(1);
		// Slide 7: the arrow between the second int and ).
		expect(at(3).marker).toBe(4);
		// Slide 14: the whole tree, the arrow after the last ).
		expect(at(10).forest.map(bracketForm)).toEqual(['E( E( E(int) + ( E(int) ) ) + ( E(int) ) )']);
		expect(at(10).marker).toBe(9);
	});
});

describe('Bottom-Up Parsing, slides 5–10', () => {
	it('lists the forms down to E with each handle', () => {
		expect(formatCitation(preset('slides-5-10').cite!)).toBe('Bottom-Up Parsing · slides 5–10');
		const r = load('slides-5-10');
		expect(marked(r)).toEqual([
			'[int] + (int) + (int)',
			'E + ([int]) + (int)',
			'[E + (E)] + (int)',
			'E + ([int])',
			'[E + (E)]',
			'E'
		]);
		// Read upward, a rightmost derivation.
		const forms = [r.derivation!.start, ...r.derivation!.steps.map((s) => s.form)];
		expect(forms.reverse()).toEqual(r.handles!.map((h) => h.form));
	});

	it('grows the tree one reduction per slide', () => {
		const r = load('slides-5-10');
		const roots = (k: number) =>
			forestAfter(r.parse, k)
				.map((n) => n.symbol)
				.join(' ');
		expect(roots(0)).toBe('int + ( int ) + ( int )');
		expect(roots(1)).toBe('E + ( int ) + ( int )');
		expect(roots(2)).toBe('E + ( E ) + ( int )');
		expect(roots(3)).toBe('E + ( int )');
		expect(roots(4)).toBe('E + ( E )');
		expect(roots(5)).toBe('E');
	});
});

describe('the other presets', () => {
	it('nested: reaches states 8 to 11 of slide 17', () => {
		const r = load('nested');
		expect(formatCitation(preset('nested').cite!)).toBe('Bottom-up Parsing II · slide 17');
		expect(r.states).toBe(12);
		const visited = new Set(r.parse.rows.flatMap((row) => row.stack.map((e) => e.state)));
		for (const s of [8, 9, 10, 11]) expect(visited.has(s)).toBe(true);
		expect(presetState(preset('nested')).stacks).toBe(true);
		// The states under the stack of the row that reduces E + (E) inside the parentheses.
		const rows = traceRows(r.parse, true);
		const inner = rows.find((row) => row.text === 'red. E → E + (E)')!;
		expect(stackStates(r.parse, inner.rows[0])).toEqual([0, 2, 3, 4, 6, 8, 9, 10, 11]);
	});

	it('epsilon: reductions that pop nothing', () => {
		const r = load('epsilon');
		expect(presetState(preset('epsilon')).grammar).toBe(LEFT_FACTORED);
		expect(trace(r)).toEqual([
			'I [int * int]$  shift 3 times',
			'int * int [] I $  red. Y → ε',
			'int * [int Y] I $  red. T → int Y',
			'int [* T] I $  red. Y → * T',
			'[int Y] I $  red. T → int Y',
			'T [] I $  red. X → ε',
			'[T X] I $  red. E → T X',
			'E I $  accept'
		]);
		const pops = r.parse.rows
			.filter((row) => row.action?.kind === 'reduce')
			.map((row) => row.popped.length);
		expect(pops).toContain(0);
	});

	it('cascade: left-recursive, no conflicts, * below +', () => {
		const r = load('cascade');
		expect(presetState(preset('cascade')).grammar).toBe(CASCADE);
		expect(r.conflicts).toEqual([]);
		expect(bracketForm(r.parse.tree!)).toBe('E( E( E( T(int) ) + T( T(int) * int ) ) + T(int) )');
	});

	it('ambiguous: conflicts settled with the shift, int * (int + int)', () => {
		const r = load('ambiguous');
		expect(presetState(preset('ambiguous')).grammar).toBe(AMBIGUOUS);
		expect(formatCitation(preset('ambiguous').cite!)).toBe('Bottom-up Parsing III · slides 18–19');
		expect(r.conflicts.length).toBeGreaterThan(0);
		expect(r.conflicts.every((c) => c.kind === 'shift/reduce' && c.chosenKind === 'shift')).toBe(
			true
		);
		expect(r.unresolved).toBe(r.conflicts.length);
		expect(bracketForm(r.parse.tree!)).toBe('E( E(int) * E( E(int) + E(int) ) )');
	});
});

describe('catalog entry', () => {
	it('registers /shift-reduce in the syntax stage', () => {
		expect(tool).toMatchObject({
			slug: 'shift-reduce',
			title: 'Shift-Reduce Parsing',
			stage: 'syntax',
			order: 60
		});
		expect(tool.cites.map(formatCitation)).toEqual([
			'Bottom-Up Parsing · slides 4–11',
			'Bottom-up Parsing II · slides 2–16'
		]);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|study aid|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/shift-reduce/', import.meta.url));
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
		for (const p of presets) expect(p.description).not.toMatch(forbidden);
	});
});
