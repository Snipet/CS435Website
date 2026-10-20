import { describe, expect, it } from 'vitest';
import { annotationText, formatItem } from '$lib/components/grammar/lr-item';
import { decks, formatCitation } from '$lib/lectures';
import { bracketForm } from '$lib/theory/grammar/derive';
import { shiftReduceRows, collapseShifts, printConfiguration } from '$lib/theory/grammar/lr-parse';
import { closureOrderOf, computeBuild, readGrammar, type BuildResult } from './build';
import { closureSetup } from './closure-steps';
import { buildSteps } from './construction';
import { boxLines, shownRange, stateNotes } from './diagram';
import { closureItemText, itemLines } from './items';
import { parseFrames, statesVisited } from './parse-steps';
import {
	DEFAULT_PRESET_ID,
	DECK_14_GRAMMAR,
	DECK_15_GRAMMAR,
	presetFor,
	presetState,
	presets,
	type Lr1Preset
} from './presets';
import { DEFAULT_STATE, isLr1Hash, stateFromHash } from './state';
import { actionCell, actionColumns, conflictCells, gotoEntry } from './table-view';

const preset = (id: string): Lr1Preset => presets.find((p) => p.id === id)!;

function load(id: string) {
	const state = presetState(preset(id));
	const build = computeBuild(state)!;
	return { state, build };
}

/** A state's box as slide 14 writes it: one line per core, lookaheads merged. */
const box = (b: BuildResult, s: number) =>
	boxLines(b.automaton, s, 'abbreviated').map((v) => formatItem(v, 'compact'));

const edges = (b: BuildResult) => b.automaton.edges.map((e) => `${e.from} ${e.symbol} ${e.to}`);

/** Bottom-up Parsing II, slide 17: the 13 edges of the 12-state DFA. */
const SLIDE_17_EDGES = [
	'0 int 1',
	'0 E 2',
	'2 + 3',
	'3 ( 4',
	'4 int 5',
	'4 E 6',
	'6 ) 7',
	'6 + 8',
	'8 ( 9',
	'9 int 5',
	'9 E 10',
	'10 ) 11',
	'10 + 8'
];

/** Bottom-up Parsing II, slide 17: the labels beside the states. */
const SLIDE_17_LABELS: Record<number, string[]> = {
	1: ['E → int on $, +'],
	2: ['accept on $'],
	5: ['E → int on ), +'],
	7: ['E → E + (E) on $, +'],
	11: ['E → E + (E) on ), +']
};

describe('every preset', () => {
	it.each(presets.map((p) => [p.id] as const))('%s loads without errors', (id) => {
		const { state, build } = load(id);
		expect(readGrammar(state.grammar).diagnostics.filter((d) => d.severity === 'error')).toEqual(
			[]
		);
		expect(build).not.toBeNull();
		expect(build.parse).not.toBeNull();
		expect(build.parse!.outcome).toBe('accept');
		expect(build.automaton.truncated).toBe(false);
		const g = readGrammar(state.grammar).grammar!;
		const setup = closureSetup({
			mode: state.closure,
			aug: build.lr1.augmented,
			seed: state.seed,
			lr1: build.lr1,
			from: state.from,
			symbol: state.symbol,
			closureOrder: closureOrderOf(g, state.order)
		});
		expect(setup?.run).not.toBeNull();
		if (state.closureStep !== null)
			expect(state.closureStep).toBeLessThan(setup!.run!.frames.length);
		if (state.buildStep !== null)
			expect(state.buildStep).toBeLessThan(buildSteps(build.automaton).length);
		if (state.parseStep !== null)
			expect(state.parseStep).toBeLessThan(parseFrames(build.table, build.parse!).length);
	});

	it('has a unique id, a group, a description, and slides of the bottom-up decks', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group).toBeTruthy();
			expect(p.description).toBeTruthy();
			if (p.cite) expect(['14', '15']).toContain(p.cite.deck);
			for (const q of p.questions ?? []) {
				expect(q.prompt).toBeTruthy();
				expect(q.answer).toBeTruthy();
				expect(['14', '15']).toContain(q.cite.deck);
			}
		}
		// Where each question is asked, and answered when the slides answer it.
		const questions = presets.flatMap((p) =>
			(p.questions ?? []).map((q) => [
				p.id,
				q.prompt.slice(0, 24),
				formatCitation(q.cite),
				q.unanswered ?? false
			])
		);
		expect(questions).toEqual([
			['transition', 'In context containing E ', 'Bottom-up Parsing III · slide 8', false],
			['transition', 'In context containing E ', 'Bottom-up Parsing III · slide 8', false],
			['circles', 'DFA input is ?', 'Bottom-up Parsing II · slide 16', true],
			['circles', 'DFA alphabet consists of', 'Bottom-up Parsing II · slide 16', true],
			['table-fragment', 'Rows correspond to ?', 'Bottom-up Parsing II · slide 18', true],
			['table-fragment', 'Columns correspond to ?', 'Bottom-up Parsing II · slide 18', true],
			['lr-parse', 'Left string can be imple', 'Bottom-up Parsing II · slide 15', false],
			['lr-parse', 'After shift or reduce ac', 'Bottom-up Parsing II · slide 20', false],
			['epsilon', 'Reduce pops 0 or more sy', 'Bottom-up Parsing II · slide 15', true],
			[
				'shift-reduce-conflict',
				'We have a shift/reduce o',
				'Bottom-up Parsing III · slides 18–20',
				false
			],
			[
				'reduce-reduce-conflict',
				'How does this confuse th',
				'Bottom-up Parsing III · slides 24–25',
				false
			]
		]);
		expect(decks['14'].title).toBe('Bottom-up Parsing II');
		expect(decks['15'].title).toBe('Bottom-up Parsing III');
		expect(presets.map((p) => (p.cite ? formatCitation(p.cite) : null))).toEqual([
			'Bottom-up Parsing III · slide 11',
			'Bottom-up Parsing III · slide 9',
			'Bottom-up Parsing III · slide 13',
			'Bottom-up Parsing III · slide 14',
			'Bottom-up Parsing II · slide 17',
			'Bottom-up Parsing II · slide 19',
			'Bottom-up Parsing II · slide 21',
			'Bottom-up Parsing II · slide 17',
			'Bottom-up Parsing III · slide 25',
			'Bottom-up Parsing III · slide 18',
			'Bottom-up Parsing III · slides 24–25',
			'Bottom-up Parsing III · slide 26',
			null
		]);
	});

	it('opens as a state the URL accepts, and is found again by that state', () => {
		for (const p of presets) {
			const state = presetState(p);
			expect(isLr1Hash(state)).toBe(true);
			expect(presetFor(state, p.id)).toBe(p);
			expect(presetFor({ ...state, input: `${state.input} int` })).toBeUndefined();
		}
	});

	it('is found again by the state a link carries, without the id', () => {
		// A link (Copy link, or another page) holds the state and not the preset loaded:
		// presets that fit one state are told apart by the view and the steps they open on.
		const ties = presets.filter((p) =>
			presets.some((q) => q !== p && presetFor(presetState(q), p.id) === p)
		);
		expect(ties.map((p) => p.id)).toEqual(
			expect.arrayContaining(['start-context', 'item-sets', 'circles', 'lr-parse'])
		);
		for (const p of presets) {
			const linked = stateFromHash(JSON.parse(JSON.stringify(presetState(p))));
			expect(presetFor(linked)?.id, p.id).toBe(p.id);
		}
		// Stepped on from a preset, a state is named by the preset with its view.
		expect(presetFor({ ...presetState(preset('lr-parse')), parseStep: 5 })?.id).toBe('lr-parse');
		expect(presetFor({ ...presetState(preset('circles')), parseStep: 5 })?.id).toBe('circles');
	});

	it('opens the page on the LR parse of the slides, run to its end', () => {
		// Two presets fit the opening state; the page names the one it loaded.
		expect(presetFor(DEFAULT_STATE, DEFAULT_PRESET_ID)?.id).toBe(DEFAULT_PRESET_ID);
		// Read back from a link, it is the parse too: the other one draws the DFA as circles.
		expect(presetFor(DEFAULT_STATE)?.id).toBe(DEFAULT_PRESET_ID);
		expect(presetState(preset(DEFAULT_PRESET_ID))).toEqual({ ...DEFAULT_STATE, parseStep: 0 });
		expect(DEFAULT_STATE.parseStep).toBeNull();
		expect(DEFAULT_STATE.grammar).toBe(DECK_14_GRAMMAR);
	});
});

describe('the parsing DFA of the decks', () => {
	it.each([
		['E → E + ( E ) | int in grammar order', DECK_14_GRAMMAR, 'grammar'],
		['E → int | E + ( E ) with E → E + ( E ) taken first', DECK_15_GRAMMAR, 'reversed']
	] as const)('%s: 12 states 0–11 with the edges and labels of slide 17', (_, grammar, order) => {
		const build = computeBuild({ grammar, order, method: 'lr1', input: '' })!;
		expect(build.automaton.states).toHaveLength(12);
		expect(edges(build)).toEqual(SLIDE_17_EDGES);
		const notes = stateNotes(build.automaton, 'lr1');
		for (let s = 0; s < 12; s++)
			expect(notes[s].map(annotationText), `state ${s}`).toEqual(SLIDE_17_LABELS[s] ?? []);
	});

	it('lists the items of states 0–6 as slide 14 draws them', () => {
		const { build } = load('item-sets');
		expect([0, 1, 2, 3, 4, 5, 6].map((s) => box(build, s))).toEqual([
			['S → •E, $', 'E → •E+(E), $/+', 'E → •int, $/+'],
			['E → int•, $/+'],
			['S → E•, $', 'E → E•+(E), $/+'],
			['E → E+•(E), $/+'],
			['E → E+(•E), $/+', 'E → •E+(E), )/+', 'E → •int, )/+'],
			['E → int•, )/+'],
			['E → E+(E•), $/+', 'E → E•+(E), )/+']
		]);
	});

	it('opens the construction where slide 14 stops: state 6 just made by Transition(4, E)', () => {
		const { state, build } = load('item-sets');
		const step = buildSteps(build.automaton)[state.buildStep!];
		expect(step).toMatchObject({ kind: 'transition', from: 4, symbol: 'E', to: 6, isNew: true });
		expect(step.states).toBe(7);
		expect(step.edges).toBe(6);
	});

	it('draws states 3–7 for the fragment of slide 19, with the columns in the slide’s order', () => {
		const { state, build } = load('table-fragment');
		expect(state.grammar).toBe(DECK_14_GRAMMAR);
		expect(shownRange(build.automaton.states.length, state.range)).toEqual([3, 7]);
		const t = build.table;
		const columns = actionColumns(t, build.automaton.edges);
		expect(columns.map((k) => t.terminals[k])).toEqual(['int', '+', '(', ')', '$']);
		expect(t.nonterminals).toEqual(['E']);
		const conflicts = conflictCells(t);
		const row = (s: number) => [
			...columns.map((k) =>
				actionCell(t, s, k, conflicts)
					.entries.map((e) => e.code + (e.sub ? `_${e.sub}` : ''))
					.join('/')
			),
			...t.goto[s].map((to) => (to === null ? '' : gotoEntry(to).code))
		];
		// Slide 19, with row 6 under + and ) as the DFA has it.
		expect([3, 4, 5, 6, 7].map(row)).toEqual([
			['', '', 's4', '', '', ''],
			['s5', '', '', '', '', 'g6'],
			['', 'r_E→int', '', 'r_E→int', '', ''],
			['', 's8', '', 's7', '', ''],
			['', 'r_E→E+(E)', '', '', 'r_E→E+(E)', '']
		]);
	});

	it.each([
		['E → E + ( E ) | int', DECK_14_GRAMMAR, 'grammar'],
		['E → int | E + ( E )', DECK_15_GRAMMAR, 'grammar'],
		['E → int | E + ( E ), E → E + ( E ) first', DECK_15_GRAMMAR, 'reversed']
	] as const)('orders the action columns int + ( ) $ as slide 19 does: %s', (_, grammar, order) => {
		for (const method of ['lr1', 'lalr1', 'slr1', 'lr0'] as const) {
			const b = computeBuild({ grammar, order, method, input: '' })!;
			const columns = actionColumns(b.table, b.automaton.edges);
			expect(columns.map((k) => b.table.terminals[k])).toEqual(['int', '+', '(', ')', '$']);
		}
	});

	it('merges 12 LR(1) states into 7 LALR(1) states', () => {
		const { build } = load('lalr');
		expect(build.summary.lr1.states).toBe(12);
		expect(build.summary.lalr1.states).toBe(7);
		expect(build.automaton.kind).toBe('lalr1');
		expect(build.automaton.states.map((s) => s.merged)).toEqual([
			[0],
			[1, 5],
			[2],
			[3, 8],
			[4, 9],
			[6, 10],
			[7, 11]
		]);
	});
});

describe('Closure and Transition', () => {
	const run = (id: string) => {
		const { state, build } = load(id);
		const g = readGrammar(state.grammar).grammar!;
		const setup = closureSetup({
			mode: state.closure,
			aug: build.lr1.augmented,
			seed: state.seed,
			lr1: build.lr1,
			from: state.from,
			symbol: state.symbol,
			closureOrder: closureOrderOf(g, state.order)
		})!;
		return { state, build, setup, run: setup.run! };
	};

	it('constructs the start context of slide 11, in full and abbreviated, as the slide writes it', () => {
		const { setup, run: r } = run('start-context');
		expect(setup.kind === 'closure' && setup.start).toBe(true);
		// The stepper's lists draw the items with closureItemText's form: the dot against
		// the symbol after it, everything else spaced.
		expect(r.items.map((i) => closureItemText(itemLines(setup.aug, [i], 'full')[0].view))).toEqual([
			'S → •E, $',
			'E → •E + ( E ), $',
			'E → •int, $',
			'E → •E + ( E ), +',
			'E → •int, +'
		]);
		expect(
			itemLines(setup.aug, r.items, 'abbreviated').map((l) => closureItemText(l.view))
		).toEqual(['S → •E, $', 'E → •E + ( E ), $/+', 'E → •int, $/+']);
	});

	it('extends E → E + (•E), + with the two items of slide 9, then with their + forms', () => {
		const { state, setup, run: r } = run('extend-context');
		const show = (k: number) => closureItemText(itemLines(setup.aug, [r.items[k]], 'full')[0].view);
		expect(r.items.map((_, k) => show(k))).toEqual([
			'E → E + ( •E ), +',
			'E → •int, )',
			'E → •E + ( E ), )',
			'E → •int, +',
			'E → •E + ( E ), +'
		]);
		// The preset opens where the second item of the slide is added.
		const f = r.frames[state.closureStep!];
		expect(f.at).toEqual({ code: 'closure', line: 5 });
		expect(f.add).toMatchObject({ index: 2, added: true });
		expect(f.size).toBe(3);
	});

	it('makes state 4 by Transition(3, ( )', () => {
		const { setup, build, run: r } = run('transition');
		expect(setup.kind === 'transition' && setup.to).toBe(4);
		expect(r.items).toEqual(build.lr1.states[4].items);
		expect(r.frames[0].at).toEqual({ code: 'transition', line: 0 });
	});
});

describe('LR parsing', () => {
	it('follows the trace of slide 14 on int + (int) + (int)', () => {
		const { build } = load('lr-parse');
		const p = build.parse!;
		expect(
			collapseShifts(shiftReduceRows(p)).map((r) => [printConfiguration(r.stack, r.input), r.text])
		).toEqual([
			['I int + (int) + (int)$', 'shift'],
			['int I + (int) + (int)$', 'red. E → int'],
			['E I + (int) + (int)$', 'shift 3 times'],
			['E + (int I ) + (int)$', 'red. E → int'],
			['E + (E I ) + (int)$', 'shift'],
			['E + (E) I + (int)$', 'red. E → E + (E)'],
			['E I + (int)$', 'shift 3 times'],
			['E + (int I )$', 'red. E → int'],
			['E + (E I )$', 'shift'],
			['E + (E) I $', 'red. E → E + (E)'],
			['E I $', 'accept']
		]);
		expect(statesVisited(parseFrames(build.table, p))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('reaches states 8–11 on int + (int + (int))', () => {
		const { build } = load('nested');
		const visited = statesVisited(parseFrames(build.table, build.parse!));
		expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(bracketForm(build.parse!.tree!)).toBe('E( E(int) + ( E( E(int) + ( E(int) ) ) ) )');
	});

	it('augments S → ε | id S with S’ and pops 0 pairs for S → ε', () => {
		const { build } = load('epsilon');
		expect(build.lr1.augmented.start).toBe('S’');
		const frames = parseFrames(build.table, build.parse!);
		const pops = frames.filter((f) => f.phase === 'pop');
		expect(pops[0].text).toBe('reduce S → ε: pop 0 pairs');
		expect(pops[0].popping).toBe(0);
	});

	it('keeps the shift of the conflicts of E → E + E | E * E | int', () => {
		const { build } = load('shift-reduce-conflict');
		expect(build.table.conflicts.length).toBeGreaterThan(0);
		expect(build.table.conflicts.every((c) => c.kind === 'shift/reduce')).toBe(true);
		expect(bracketForm(build.parse!.tree!)).toBe('E( E(int) * E( E(int) + E(int) ) )');
		const onPlus = build.table.conflicts.find(
			(c) => c.terminal === '+' && c.items.some((i) => i.production === 1 && i.dot === 3)
		);
		expect(onPlus).toBeDefined();
	});

	it('has the states of slide 18: [E → E * • E, +] … ⇒E [E → E * E •, +], [E → E • + E, +]', () => {
		const { build } = load('shift-reduce-conflict');
		const a = build.automaton;
		const full = (s: number) =>
			itemLines(a.augmented, a.states[s].items, 'full').map((l) => formatItem(l.view, 'bracketed'));
		const from = a.states.find((s) => full(s.id).includes('[E → E * • E, +]'))!;
		expect(full(from.id)).toContain('[E → • E + E, +]');
		const to = from.transitions.find((t) => t.symbol === 'E')!.to;
		expect(full(to)).toEqual(expect.arrayContaining(['[E → E * E •, +]', '[E → E • + E, +]']));
		expect(
			build.table.conflicts.some(
				(c) => c.state === to && c.terminal === '+' && c.kind === 'shift/reduce'
			)
		).toBe(true);
	});

	it('has the states of slide 25 and their reduce/reduce conflict on $', () => {
		const { build } = load('reduce-reduce-conflict');
		const a = build.automaton;
		const full = (s: number) =>
			itemLines(a.augmented, a.states[s].items, 'full').map((l) => formatItem(l.view, 'bracketed'));
		expect(full(0)).toEqual(['[S’ → • S, $]', '[S → •, $]', '[S → • id, $]', '[S → • id S, $]']);
		const after = a.states[0].transitions.find((t) => t.symbol === 'id')!.to;
		expect(full(after)).toEqual([
			'[S → id •, $]',
			'[S → id • S, $]',
			'[S → •, $]',
			'[S → • id, $]',
			'[S → • id S, $]'
		]);
		expect(build.table.conflicts.find((c) => c.kind === 'reduce/reduce')?.state).toBe(after);
	});

	it('reports the reduce/reduce conflict of S → ε | id | id S on $', () => {
		const { build } = load('reduce-reduce-conflict');
		const rr = build.table.conflicts.filter((c) => c.kind === 'reduce/reduce');
		expect(rr).toHaveLength(1);
		expect(rr[0].terminal).toBe('$');
	});

	it('builds the C- grammar a window at a time, with the dangling else its one conflict', () => {
		const { state, build } = load('cminus');
		expect(build.summary.lr1.states).toBeGreaterThan(300);
		expect(shownRange(build.automaton.states.length, state.range)).toEqual([0, 15]);
		expect(build.table.conflicts).toHaveLength(1);
		expect(build.table.conflicts[0].terminal).toBe('else');
	});
});
