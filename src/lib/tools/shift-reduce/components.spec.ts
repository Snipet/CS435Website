/**
 * Server-renders the tool's parts: the markup builds for every preset and
 * shows what the slides show.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { Stepper } from '$lib/components/ui';
import ConflictNote from './ConflictNote.svelte';
import Configuration from './Configuration.svelte';
import FindHandle from './FindHandle.svelte';
import HandlesPanel from './HandlesPanel.svelte';
import { computeParse, type ParseView } from './model';
import PresetNote from './PresetNote.svelte';
import { presetState, presets } from './presets';
import TracePanel from './TracePanel.svelte';
import { configuration, finalRows, stackStates, traceRows } from './view';

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
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

/** The text as it reads, spoken parts included: tags dropped without a space. */
const inline = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

/** What a sighted reader sees: the text without the visually hidden spans. */
const visible = (html: string) =>
	html.replace(/<span class="visually-hidden[^"]*">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');

const preset = (id: string) => presets.find((p) => p.id === id)!;

function load(id: string): ParseView {
	const state = presetState(preset(id));
	const r = computeParse({ grammar: state.grammar, input: state.input });
	if (r.kind !== 'parse') throw new Error(r.message);
	return r;
}

/** A stepper on a given step; it has no component to stop it, so it is never played. */
const stepperAt = (total: number, index: number) => new Stepper(() => total, { index });

describe('Configuration', () => {
	const r = load('slide-14');
	const rows = traceRows(r.parse, true);

	it('draws a row as slide 14 writes it, and says the marks', () => {
		const { body } = render(Configuration, { props: { view: configuration(rows[3], r.grammar) } });
		expect(visible(body)).toBe('E + (int I ) + (int)$');
		expect(inline(body)).toBe('E + (handle: int, end of handle Idivider ) + (int)$');
		expect(body).toContain('class="next');
		expect(body).toContain('class="divider');
	});

	it('says the tokens a shift moves', () => {
		const { body } = render(Configuration, { props: { view: configuration(rows[2], r.grammar) } });
		expect(visible(body)).toBe('E I + (int) + (int)$');
		expect(inline(body)).toBe('E Idivider to shift: + (int, end of shift) + (int)$');
	});

	it('writes the DFA states under the stack', () => {
		const row = rows[5];
		const view = configuration(row, r.grammar, stackStates(r.parse, row.rows[0]));
		const { body } = render(Configuration, { props: { view, stacks: true } });
		expect(text(body)).toContain('states of the stack: 0, 2, 3, 4, 6, 7');
		expect(body.match(/class="state/g)).toHaveLength(6);
		// The bottom pair's symbol line holds a zero-width space, so its 0 lines up with the others.
		expect(body).toMatch(/<span class="unit bottom[^>]*><span class="sym[^>]*">\u200b<\/span>/);
	});

	it('marks an empty handle', () => {
		const e = load('epsilon');
		const row = traceRows(e.parse, true)[1];
		const { body } = render(Configuration, { props: { view: configuration(row, e.grammar) } });
		expect(text(body)).toContain('handle: ε, end of handle');
		expect(visible(body)).toBe('int * intε I $');
	});
});

describe('TracePanel', () => {
	it.each(presets.map((p) => [p.id] as const))('%s renders its whole trace', (id) => {
		const r = load(id);
		const rows = traceRows(r.parse, true);
		const { body } = render(TracePanel, {
			props: {
				result: r,
				rows,
				stepper: stepperAt(rows.length, rows.length - 1),
				collapse: true,
				stacks: presetState(preset(id)).stacks,
				treeRows: finalRows(r.parse),
				maxTreeTokens: 150,
				oncollapse: () => {}
			}
		});
		expect(body.match(/<tr class=/g)).toHaveLength(rows.length);
		expect(body).toContain('aria-current="step"');
		expect(text(body)).toContain(`Row ${rows.length} of ${rows.length}`);
		expect(body).toContain('class="parse-tree');
	});

	it('shows the rows up to the current one, with its reason', () => {
		const r = load('slide-14');
		const rows = traceRows(r.parse, true);
		const { body } = render(TracePanel, {
			props: {
				result: r,
				rows,
				stepper: stepperAt(rows.length, 3),
				collapse: true,
				stacks: false,
				treeRows: finalRows(r.parse),
				maxTreeTokens: 150,
				oncollapse: () => {}
			}
		});
		expect(body.match(/<tr class=/g)).toHaveLength(4);
		expect(text(body)).toContain(
			'State 5 is labeled “E → int on ), +”, and the token after the divider is ): reduce.'
		);
		expect(body).toContain('↑ between int and )');
		expect(text(body)).toContain('red. E → int');
	});

	it('links to the DFA and the table when the states are shown', () => {
		const r = load('nested');
		const rows = traceRows(r.parse, true);
		const { body } = render(TracePanel, {
			props: {
				result: r,
				rows,
				stepper: stepperAt(rows.length, rows.length - 1),
				collapse: true,
				stacks: true,
				treeRows: finalRows(r.parse),
				maxTreeTokens: 150,
				oncollapse: () => {},
				tableLink: { href: '/lr1#x', title: 'LR(1) Parser Builder' }
			}
		});
		expect(text(body)).toContain('The DFA and its table are in LR(1) Parser Builder');
		expect(body).toContain('href="/lr1#x"');
	});

	it('leaves out the forest of a long input', () => {
		const r = load('slide-14');
		const rows = traceRows(r.parse, true);
		const { body } = render(TracePanel, {
			props: {
				result: r,
				rows,
				stepper: stepperAt(rows.length, 0),
				collapse: true,
				stacks: false,
				treeRows: 1,
				maxTreeTokens: 5,
				oncollapse: () => {}
			}
		});
		expect(body).not.toContain('class="parse-tree');
		expect(text(body)).toContain(
			'The forest is drawn for token strings of up to 5 tokens; this one has 9.'
		);
	});

	it('draws the last 200 rows of a long trace, with the earlier ones a click away', () => {
		const input = ['int', ...Array.from({ length: 100 }, () => '+ ( int )')].join(' ');
		const r = computeParse({ grammar: 'E → E + ( E ) | int', input });
		if (r.kind !== 'parse') throw new Error(r.message);
		const rows = traceRows(r.parse, true);
		expect(rows.length).toBe(403);
		const { body } = render(TracePanel, {
			props: {
				result: r,
				rows,
				stepper: stepperAt(rows.length, rows.length - 1),
				collapse: true,
				stacks: false,
				treeRows: 1,
				maxTreeTokens: 150,
				oncollapse: () => {}
			}
		});
		expect(body.match(/<tr class=/g)).toHaveLength(200);
		expect(text(body)).toContain('203 earlier rows not shown. Show 200 more');
	});
});

describe('HandlesPanel', () => {
	const r = load('slides-5-10');
	const panel = (step: number) =>
		render(HandlesPanel, {
			props: {
				result: r,
				handles: r.handles!,
				stepper: stepperAt(r.handles!.length, step),
				treeRows: finalRows(r.parse),
				maxTreeTokens: 150
			}
		}).body;

	/** The cells of a column, as a sighted reader sees them, the marked symbols in brackets. */
	const column = (body: string, cls: string) =>
		[...body.matchAll(new RegExp(`<td class="form ${cls}[^"]*">(.*?)</td>`, 'g'))].map((m) =>
			visible(
				m[1]
					.replace(/<!--.*?-->/g, '')
					.replace(/<span class="(?:handle|made)[ "][^>]*>([^<]*)<\/span>/g, '[$1]')
			).trim()
		);
	/** The slide 10 arrow beside the reductions; the derivation's has the class `derive` too. */
	const slideArrow = /class="up svelte/;

	it('shows the reductions of slide 10 with the arrow and the caption', () => {
		const body = panel(5);
		expect(body).toMatch(slideArrow);
		expect(text(body)).toContain('A reverse rightmost derivation!');
		expect(body).toMatch(/A <em[^>]*>reverse rightmost<\/em> derivation!/);
		expect(text(body)).toContain('handle: E + (E) , end of handle');
		expect(text(body)).toContain('5 of 5 reductions');
		// Row for row the same forms. Read upward, the derivation E → E + (E) → … →
		// int + (int) + (int), each form with what its step put in marked: that form's handle.
		expect(column(body, '(?:last )?svelte')).toEqual([
			'int + (int) + (int)',
			'E + (int) + (int)',
			'E + (E) + (int)',
			'E + (int)',
			'[E + (E)]',
			'E'
		]);
		expect(column(body, 'derived')).toEqual([
			'[int] + (int) + (int)',
			'E + ([int]) + (int)',
			'[E + (E)] + (int)',
			'E + ([int])',
			'[E + (E)]',
			'E'
		]);
		expect(inline(body)).toContain('E + (put in by the step: int, end of step)');
		// The derivation's arrow runs up all six rows.
		expect(body).toMatch(/<td class="arrow-col[^"]*" rowspan="6"><!--\[0--><span class="up derive/);
	});

	it('shows slide 6: two forms, the first handle in red', () => {
		const body = panel(1);
		expect(body).not.toMatch(slideArrow);
		expect(text(body)).not.toContain('A reverse rightmost derivation');
		expect(text(body)).toContain('handle: int , end of handle');
		expect(body.match(/class="handle[ "]/g)).toHaveLength(1);
		expect(text(body)).toContain('1 of 5: the handle int of the form above is reduced by E → int.');
		// The rows listed so far, on the same rows in both columns, with no blank rows between them.
		const blank = ['', '', '', ''];
		expect(column(body, '(?:last )?svelte')).toEqual([
			'[int] + (int) + (int)',
			'E + (int) + (int)',
			...blank
		]);
		expect(column(body, 'derived')).toEqual([
			'[int] + (int) + (int)',
			'E + (int) + (int)',
			...blank
		]);
		expect(body).toMatch(/<td class="arrow-col[^"]*" rowspan="2"><!--\[0--><span class="up derive/);
	});

	it('marks nothing in the derivation before the first reduction', () => {
		const body = panel(0);
		expect(column(body, 'derived')).toEqual(['int + (int) + (int)', '', '', '', '', '']);
		expect(body).not.toContain('up derive');
		expect(body).not.toContain('class="made');
	});
});

describe('FindHandle', () => {
	it('offers the symbols of the form, and the places of an empty handle when ε is a right side', () => {
		const r = load('slides-5-10');
		const { body } = render(FindHandle, { props: { grammar: r.grammar, step: r.handles![2] } });
		expect(body.match(/aria-pressed="false"/g)).toHaveLength(9);
		expect(text(body)).not.toContain('The handle is empty');
		const e = load('epsilon');
		const html = render(FindHandle, { props: { grammar: e.grammar, step: e.handles![0] } }).body;
		expect(text(html)).toContain('The handle is empty (ε)');
	});
});

describe('notes', () => {
	it('lists the conflicts and links to the conflicts tool', () => {
		const r = load('ambiguous');
		const { body } = render(ConflictNote, {
			props: {
				conflicts: r.conflicts,
				link: { href: '/conflicts#x', title: 'Conflicts & Precedence' }
			}
		});
		expect(text(body)).toContain('The LR(1) table has 4 conflicts (4 shift/reduce)');
		expect(inline(body)).toContain(
			'State 5 on +, shift/reduce: [E → E • + E, +] and [E → E + E •, +]. The table holds shift 3.'
		);
		expect(text(body)).toContain('Open the grammar in Conflicts & Precedence');
		const bare = render(ConflictNote, { props: { conflicts: r.conflicts } }).body;
		expect(bare).not.toContain('<a ');
	});

	it('shows each preset with its citation and questions', () => {
		for (const p of presets) {
			const { body } = render(PresetNote, { props: { preset: p } });
			expect(text(body)).toContain(p.description!.slice(0, 30));
			if (p.questions) expect(text(body)).toContain('Show answer');
		}
	});
});
