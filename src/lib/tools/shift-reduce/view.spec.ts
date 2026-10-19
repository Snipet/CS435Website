import { describe, expect, it } from 'vitest';
import { layoutForest } from '$lib/components/grammar/tree-layout';
import {
	MAX_TREE_DEPTH,
	lr1Automaton,
	lrParse,
	lrTable,
	type ShiftReduceRow
} from '$lib/theory/grammar';
import { computeParse, type ParseView } from './model';
import { AMBIGUOUS, LEFT_FACTORED } from './presets';
import { SLIDE_GRAMMAR, SLIDE_INPUT } from './state';
import {
	configuration,
	configurationText,
	convertStep,
	derivationRows,
	derivationUpward,
	explain,
	finalRows,
	forestAfter,
	forestBefore,
	formView,
	handleRows,
	leafCount,
	reductionRows,
	rowOfRaw,
	stackStates,
	stopReason,
	traceRows
} from './view';

function parse(grammar: string, input: string): ParseView {
	const r = computeParse({ grammar, input });
	if (r.kind !== 'parse') throw new Error(r.message);
	return r;
}

const slide = parse(SLIDE_GRAMMAR, SLIDE_INPUT);

describe('trace rows', () => {
	it('collapses consecutive shifts and finds a parse row in either listing', () => {
		const single = traceRows(slide.parse, false);
		const collapsed = traceRows(slide.parse, true);
		expect(single).toHaveLength(15);
		expect(collapsed).toHaveLength(11);
		expect(rowOfRaw(collapsed, 3)).toBe(2);
		expect(rowOfRaw(single, 3)).toBe(3);
		// Unknown rows fall back to the last row.
		expect(rowOfRaw(collapsed, 99)).toBe(10);
	});

	it('keeps the configuration shown when shifts are collapsed or expanded', () => {
		const single = traceRows(slide.parse, false);
		const collapsed = traceRows(slide.parse, true);
		// "shift 3 times" opens on its first shift, and the shifts inside it come back to it.
		expect(convertStep(collapsed, single, 2)).toBe(2);
		expect(convertStep(single, collapsed, 3)).toBe(2);
		expect(convertStep(single, collapsed, 4)).toBe(2);
		expect(convertStep(single, collapsed, 5)).toBe(3);
		expect(convertStep(collapsed, single, 10)).toBe(14);
		// Out of range: clamped.
		expect(convertStep(collapsed, single, 50)).toBe(14);
		expect(convertStep([], single, 0)).toBe(0);
	});
});

describe('configurations', () => {
	const rows = traceRows(slide.parse, true);

	it('writes rows as slide 14 does, the action’s symbols marked', () => {
		const view = configuration(rows[3], slide.grammar);
		expect(configurationText(view)).toBe('E + (int I ) + (int)$');
		expect(configurationText(view, true)).toBe('E + ([int] I ) + (int)$');
		expect(view.mark).toBe('handle');
		expect(configuration(rows[2], slide.grammar).mark).toBe('shift');
		expect(configuration(rows[10], slide.grammar).mark).toBeNull();
		expect(configurationText(configuration(rows[10], slide.grammar))).toBe('E I $');
		expect(configurationText(configuration(rows[0], slide.grammar))).toBe('I int + (int) + (int)$');
	});

	it('spaces symbols as the decks do: tight inside parentheses and before $', () => {
		const view = configuration(rows[5], slide.grammar);
		const left = view.left.flatMap((r) => r.symbols.map((s) => s.sep + s.text)).join('');
		expect(left).toBe('E + (E)');
		const right = view.right.flatMap((r) => r.symbols.map((s) => s.sep + s.text)).join('');
		expect(right).toBe('+ (int)$');
	});

	it('puts the DFA state under every stack symbol', () => {
		const states = stackStates(slide.parse, rows[5].rows[0]);
		expect(states).toEqual([0, 2, 3, 4, 6, 7]);
		const view = configuration(rows[5], slide.grammar, states);
		expect(view.bottom).toBe(0);
		expect(view.left.flatMap((r) => r.symbols.map((s) => s.state))).toEqual([2, 3, 4, 6, 7]);
		expect(view.right.every((r) => r.symbols.every((s) => s.state === null))).toBe(true);
		// Without states, none.
		expect(
			configuration(rows[5], slide.grammar).left.flatMap((r) => r.symbols.map((s) => s.state))
		).toEqual([null, null, null, null, null]);
		expect(stackStates(slide.parse, 999)).toEqual([0]);
	});

	it('marks an empty handle right before the divider', () => {
		const r = parse(LEFT_FACTORED, 'int');
		const rows = traceRows(r.parse, true);
		const view = configuration(rows[1], r.grammar);
		expect(rows[1].text).toBe('red. Y → ε');
		expect(view.emptyHandle).toBe(true);
		expect(view.left.every((run) => !run.mark)).toBe(true);
		expect(configurationText(view, true)).toBe('int [] I $');
		expect(configurationText(view)).toBe('int I $');
	});

	it('writes a configuration the error stopped on', () => {
		const r = parse(SLIDE_GRAMMAR, 'int + int');
		const rows = traceRows(r.parse, true);
		const last = rows[rows.length - 1];
		expect(last.action).toBe('error');
		expect(configurationText(configuration(last, r.grammar), true)).toBe('E + I int$');
		expect(explain(r, last)).toBe(
			'State 3 has no transition on int and no label on int: the input is rejected.'
		);
	});
});

describe('forests', () => {
	it('counts leaves as the baseline layout does, ε leaves included', () => {
		const r = parse(LEFT_FACTORED, 'int * int');
		expect(leafCount(r.parse.tree!)).toBe(5);
		expect(layoutForest([r.parse.tree!]).leaves).toHaveLength(5);
	});

	it('puts the arrow after the leaves of the stack, ε leaves included', () => {
		const r = parse(LEFT_FACTORED, 'int * int');
		const rows = traceRows(r.parse, true);
		// After Y → ε: int * int and the ε leaf are left of the divider.
		const after = forestBefore(r.parse, rows[2].rows[0]);
		expect(after.marker).toBe(4);
		expect(after.stacked).toBe(4);
		expect(after.forest.map((n) => n.symbol)).toEqual(['int', '*', 'int', 'Y']);
		const layout = layoutForest(after.forest, { marker: after.marker });
		expect(layout.marker?.leaves).toBe(4);
	});

	it('draws the tree after a number of reductions, and holds the final height', () => {
		expect(reductionRows(slide.parse)).toEqual([1, 5, 7, 11, 13]);
		expect(forestAfter(slide.parse, 0)).toHaveLength(9);
		expect(forestAfter(slide.parse, 5)).toHaveLength(1);
		expect(forestAfter(slide.parse, 9)).toHaveLength(1);
		const rows = finalRows(slide.parse);
		expect(rows).toBe(layoutForest(forestAfter(slide.parse, 5)).rows);
		for (let k = 0; k < slide.parse.rows.length; k++)
			expect(layoutForest(forestBefore(slide.parse, k).forest).rows).toBeLessThanOrEqual(rows);
	});

	it('holds the height of a rejected parse at its last row', () => {
		const r = parse(SLIDE_GRAMMAR, 'int + ( int ) int');
		expect(r.parse.outcome).toBe('error');
		const rows = finalRows(r.parse);
		for (let k = 0; k < r.parse.rows.length; k++)
			expect(layoutForest(forestBefore(r.parse, k).forest).rows).toBeLessThanOrEqual(rows);
	});
});

describe('why each action (slide 16)', () => {
	const rows = traceRows(slide.parse, true);
	const why = (row: ShiftReduceRow, r: ParseView = slide) => explain(r, row);

	it('names the state, the token and the transition or label', () => {
		expect(why(rows[0])).toBe('State 0 has a transition on int: shift.');
		expect(why(rows[1])).toBe(
			'State 1 is labeled “E → int on $, +”, and the token after the divider is +: reduce.'
		);
		expect(why(rows[2])).toBe(
			'State 2 has a transition on +, state 3 on ( and state 4 on int: shift 3 times.'
		);
		expect(why(rows[5])).toBe(
			'State 7 is labeled “E → E + (E) on $, +”, and the token after the divider is +: reduce.'
		);
		expect(why(rows[10])).toBe(
			'State 2 is labeled “accept on $”, and the token after the divider is $: accept.'
		);
	});

	it('names a conflict and how the table settles it', () => {
		const r = parse(AMBIGUOUS, 'int * int + int');
		const rows = traceRows(r.parse, false);
		const conflicted = rows.find((row) => why(row, r).includes('conflict'))!;
		expect(why(conflicted, r)).toMatch(
			/^State \d+ has a transition on \+: shift\. It is also labeled “E → E \* E on .*”: a shift\/reduce conflict on \+, which the table settles with the shift\.$/
		);
		const collapsed = traceRows(r.parse, true).find(
			(row) => row.count > 1 && why(row, r).includes('conflict')
		)!;
		expect(why(collapsed, r)).toContain('is also labeled “E → E * E on');
	});

	it("gives the engine's reason when a parse stops", () => {
		// 500 ints: E → int + E nests one level deeper for each, past MAX_TREE_DEPTH.
		const input = Array.from({ length: 500 }, () => 'int').join(' + ');
		const r = parse('E → int + E | int', input);
		expect(r.parse.outcome).toBe('limit');
		expect(stopReason(r.parse)).toBe(
			`the parse tree would be more than ${MAX_TREE_DEPTH} levels deep`
		);
		const rows = traceRows(r.parse, true);
		const last = rows[rows.length - 1];
		expect(last.action).toBe('limit');
		expect(why(last, r)).toBe(
			`The parse stopped here: the parse tree would be more than ${MAX_TREE_DEPTH} levels deep.`
		);
		expect(stopReason(slide.parse)).toBeNull();
	});

	it('gives the step limit as the reason when a parse stops there', () => {
		const table = lrTable(lr1Automaton(slide.grammar, { trace: false }));
		const tokens = slide.parse.input.slice(0, -1);
		// The first rows, and so their decisions, are the slide's.
		const stopped: ParseView = { ...slide, parse: lrParse(table, tokens, { maxSteps: 5 }) };
		expect(stopped.parse.outcome).toBe('limit');
		expect(stopReason(stopped.parse)).toBe('after 4 steps');
		const rows = traceRows(stopped.parse, false);
		expect(why(rows[rows.length - 1], stopped)).toBe(
			'The parse stopped here, after 4 steps: it is too long to follow further.'
		);
	});

	it('names a reduce/reduce conflict', () => {
		const r = parse('S → A x | B x\nA → c\nB → c', 'c x');
		expect(r.conflicts.map((c) => c.kind)).toEqual(['reduce/reduce']);
		const row = traceRows(r.parse, true).find((x) => x.action === 'reduce')!;
		expect(row.text).toBe('red. A → c');
		expect(why(row, r)).toBe(
			'State 1 is labeled “A → c on x”, and the token after the divider is x: reduce. It is also labeled “B → c on x”: a reduce/reduce conflict, which the table settles with the rule written first.'
		);
	});
});

describe('handles', () => {
	it('marks a handle, or the place of an empty one', () => {
		expect(formView(['E', '+', '(', 'int', ')'], { start: 3, end: 4 }).pieces).toEqual([
			{ text: 'E + (', mark: false },
			{ text: 'int', mark: true },
			{ text: ')', mark: false }
		]);
		const empty = formView(['int', 'Y'], { start: 1, end: 1 });
		expect(empty.empty).toBe(true);
		expect(empty.pieces).toEqual([
			{ text: 'int ', mark: false },
			{ text: '', mark: true },
			{ text: 'Y', mark: false }
		]);
		expect(formView(['int'], { start: 1, end: 1 }).pieces).toEqual([
			{ text: 'int', mark: false },
			{ text: '', mark: true }
		]);
		expect(formView([]).text).toBe('ε');
		expect(formView(['E', '+', '(', 'E', ')']).text).toBe('E + (E)');
	});

	it('lists the derivation upward beside the reductions: the same form on every row', () => {
		const presets = [
			[SLIDE_GRAMMAR, SLIDE_INPUT],
			[SLIDE_GRAMMAR, 'int + ( int + ( int ) )'],
			[LEFT_FACTORED, 'int * ( int + int )'],
			['S → a S b S | ε', 'a a b b a b'],
			[AMBIGUOUS, 'int * int + int']
		];
		for (const [grammar, input] of presets) {
			const r = parse(grammar, input);
			const rows = handleRows(r.handles!);
			const upward = derivationUpward(r.grammar, r.derivation!);
			expect(upward).toHaveLength(rows.length);
			upward.forEach((form, i) => {
				expect(form.text).toBe(rows[i].plain.text);
				// What the step to the form put in is the form's handle; the start symbol has neither.
				expect(form.pieces).toEqual(rows[i].marked.pieces);
				expect(form.empty).toBe(rows[i].marked.empty);
			});
		}
	});

	it('marks in each derivation step what the reduction in its mirrored row takes out', () => {
		const rows = handleRows(slide.handles!);
		const derived = derivationRows(slide.grammar, slide.derivation!);
		expect(derived).toHaveLength(rows.length);
		const n = rows.length - 1;
		derived.forEach((form, i) => {
			if (i === 0) return expect(form.pieces).toEqual([{ text: 'E', mark: false }]);
			const twin = rows[n - i].marked;
			expect(form.text).toBe(twin.text);
			expect(form.pieces).toEqual(twin.pieces);
		});
	});
});
