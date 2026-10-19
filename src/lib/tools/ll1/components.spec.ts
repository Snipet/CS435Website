/**
 * Server-renders the tool's panels: the markup must build for every preset and
 * show what the slides show.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { Stepper } from '$lib/components/ui';
import EntryNote from './EntryNote.svelte';
import {
	computeAnalysis,
	computeParse,
	entryView,
	readGrammar,
	readTokens,
	tableOrder
} from './model';
import NotLL1 from './NotLL1.svelte';
import ParsePanel from './ParsePanel.svelte';
import PresetNote from './PresetNote.svelte';
import { presetState, presets } from './presets';
import RewritePanel from './RewritePanel.svelte';
import { setSteps } from './sets';
import SetsPanel from './SetsPanel.svelte';
import TableView from './TableView.svelte';

/** The text of rendered markup, with one space where tags and line breaks were. */
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
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.replace(/ ([,.;])/g, '$1');

const preset = (id: string) => presets.find((p) => p.id === id)!;

/** What the page computes for a preset. */
function load(id: string) {
	const state = presetState(preset(id));
	const analysis = computeAnalysis({ grammar: state.grammar, names: state.names })!;
	const tokens = readTokens(readGrammar(state.grammar).grammar!, state.input);
	const parse = computeParse({ grammar: state.grammar, tokens: tokens.tokens })!;
	const order = tableOrder(analysis.table, state.rows, state.columns);
	return { state, analysis, tokens, parse, order };
}

/** A stepper on a given step; it has no component to stop it, so it is never played. */
const stepperAt = (total: number, index: number) => new Stepper(() => total, { index });

describe('TableView', () => {
	it('draws the table of slide 7 with the cells as buttons', () => {
		const { analysis, order } = load('table');
		const html = render(TableView, {
			props: {
				table: analysis.table,
				rows: order.rows,
				columns: order.columns,
				selected: {
					row: analysis.table.rows.indexOf('E'),
					column: analysis.table.columns.indexOf('int')
				},
				onselect: () => {},
				label: 'LL(1) parsing table'
			}
		}).body;
		const t = text(html);
		expect(t).toContain('int * + ( ) $');
		expect(t).toContain('T int Y ( E ) E T X T X X + E ε ε Y * T ε ε ε');
		expect(html).toContain('aria-label="[E, int]: T X"');
		expect(html).toContain('aria-label="[E, *]: blank"');
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
		// One tab stop: the selected entry.
		expect(html.match(/tabindex="0"/g)).toHaveLength(1);
	});

	it('marks multiply-defined entries and an entry a parse looks up', () => {
		const { analysis } = load('left-factor');
		const html = render(TableView, {
			props: {
				table: analysis.table,
				mark: { row: 0, column: 0, tone: 'active' },
				compact: true,
				label: 'table'
			}
		}).body;
		expect(html.match(/class="[^"]*conflict/g)).toHaveLength(3);
		expect(text(html)).toContain('[E, int]: multiply defined: T + E and T');
		expect(html).toContain('mark-active');
	});
});

describe('EntryNote', () => {
	it('says why an entry is filled, blank or multiply defined', () => {
		const { analysis } = load('table');
		const t = analysis.table;
		const at = (a: string, b: string) => entryView(t, t.rows.indexOf(a), t.columns.indexOf(b));
		expect(text(render(EntryNote, { props: { view: at('Y', '*') } }).body)).toContain(
			'Y → * T in columns of First( *T ) = { * }'
		);
		const blank = text(render(EntryNote, { props: { view: at('E', '*') } }).body);
		expect(blank).toContain('Blank: error');
		expect(blank).toContain('E → T X: * ∉ First( T X ) = { (, int }');
		expect(text(render(EntryNote, { props: { view: null } }).body)).toContain('Select an entry');
		const conflict = load('left-factor').analysis.table;
		const view = entryView(conflict, 0, conflict.columns.indexOf('int'));
		expect(text(render(EntryNote, { props: { view } }).body)).toContain('Multiply defined');
	});
});

describe('SetsPanel', () => {
	it('shows the sets at a step, with the set that grows marked', () => {
		const { analysis } = load('first-sets');
		const ff = analysis.table.firstFollow;
		const steps = setSteps(ff);
		const add = steps.findIndex(
			(s) => s.kind === 'rule' && s.rule.target === 'E' && s.rule.added.length > 0
		);
		const html = render(SetsPanel, {
			props: {
				grammar: analysis.table.grammar,
				ff,
				steps,
				stepper: stepperAt(steps.length, add),
				fill: false
			}
		}).body;
		const t = text(html);
		expect(t).toContain('Add First( T ) – { ε } to First( E )');
		expect(t).toContain('Adds (, int: First( E ) = { (, int }');
		expect(t).toContain('E { (, int } (this step adds to it) – X { +, ε } –');
		expect(html).toContain('class="growing');
		expect(t).toContain('Pass 3 no change');
	});

	it('shows the final sets with the ones an entry uses marked', () => {
		const { analysis } = load('trace');
		const ff = analysis.table.firstFollow;
		const steps = setSteps(ff);
		const html = render(SetsPanel, {
			props: {
				grammar: analysis.table.grammar,
				ff,
				steps,
				stepper: stepperAt(steps.length, steps.length - 1),
				fill: false,
				used: [{ kind: 'follow', symbol: 'Y' }]
			}
		}).body;
		const t = text(html);
		expect(t).toContain('Y { *, ε } { $, +, ) }');
		expect(t).toContain('Pass 3 changes nothing. The Follow sets are complete.');
		expect(html.match(/class="used/g)).toHaveLength(1);
		// The terminals are in a part that opens: Follow( int ) as slide 23 asks.
		expect(t).toContain('Terminals');
		expect(t).toContain('int { int } { $, +, ), * }');
	});

	it('leaves every set as ? in fill-in mode', () => {
		const { analysis } = load('fill-in');
		const ff = analysis.table.firstFollow;
		const steps = setSteps(ff);
		const html = render(SetsPanel, {
			props: {
				grammar: analysis.table.grammar,
				ff,
				steps,
				stepper: stepperAt(steps.length, steps.length - 1),
				fill: true
			}
		}).body;
		expect(html.match(/placeholder="\?"/g)).toHaveLength(2 * (4 + 5));
		expect(html).toContain('aria-label="First( E )"');
		expect(html).toContain('aria-label="Follow( int )"');
		expect(text(html)).not.toContain('{ (, int } {');
		expect(text(html)).toContain('Check');
		// One live region, on the page from the start, so the results of Check are announced.
		expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(html).toMatch(/<p class="visually-hidden" aria-live="polite">\s*<\/p>/);
	});
});

describe('NotLL1', () => {
	it('lists the multiply-defined entries and the causes of slide 26', () => {
		const { analysis } = load('left-factor');
		const t = text(
			render(NotLL1, {
				props: { causes: analysis.causes!, table: analysis.table, rewrite: true }
			}).body
		);
		expect(t).toContain('G is not LL(1)');
		expect(t).toContain('3 entries are multiply defined: [E, int], [E, (], [T, int].');
		expect(t).toContain(
			'G is not left-factored: E → T + E and E → T share the prefix T; T → int and T → int * T share the prefix int.'
		);
		expect(t).toContain('Rewrite for LL(1), below, removes left recursion and left-factors.');
		expect(t).toContain('Table-based Predictive Parsing · slide 26');
	});

	it('names left recursion, ambiguity and the other cases', () => {
		const bottom = load('bottom-up').analysis;
		const links = [{ title: 'Shift-Reduce Parsing', href: '/shift-reduce#v1.x' }];
		const t = text(
			render(NotLL1, {
				props: { causes: bottom.causes!, table: bottom.table, bottomUp: links }
			}).body
		);
		expect(t).toContain('G is left recursive: E →+ E + ( E ).');
		expect(t).toContain('open this grammar in Shift-Reduce Parsing.');
		const ambiguous = load('ambiguous').analysis;
		const a = text(
			render(NotLL1, {
				props: {
					causes: ambiguous.causes!,
					table: ambiguous.table,
					ambiguityHref: '/ambiguity#v1.x'
				}
			}).body
		);
		expect(a).toContain('G is ambiguous: int + int + int has two parse trees. See both trees.');
		const other = load('other').analysis;
		expect(
			text(render(NotLL1, { props: { causes: other.causes!, table: other.table } }).body)
		).toContain(
			'And in other cases as well: [A, a] : A → a in columns of First( a ) = { a }; A → ε in columns of Follow( A ) = { a }.'
		);
	});
});

describe('RewritePanel', () => {
	it('shows the steps, the names and both tables of slides 5–7', () => {
		const { state, analysis } = load('left-factor');
		const t = text(
			render(RewritePanel, {
				props: {
					rewrite: analysis.rewrite.result,
					before: analysis.table,
					after: analysis.rewrite.table,
					names: state.names,
					rows: state.rows,
					columns: state.columns,
					inUse: false,
					onuse: () => {}
				}
			}).body
		);
		expect(t).toContain('E → T + E | T becomes E → T X X → + E | ε');
		// ⇒ is a move of a shift-reduce parser (§3.10), not a rewrite.
		expect(t).not.toContain('⇒');
		expect(t).toContain('Names of the new non-terminals From E');
		expect(t).toContain('Before 3 multiply-defined entries');
		expect(t).toContain('After LL(1)');
		expect(t).toContain('E → T X X → + E | ε T → int Y | ( E ) Y → * T | ε');
		expect(t).toContain('Use the rewritten grammar');
	});

	it('says when there is nothing to rewrite', () => {
		const { state, analysis } = load('trace');
		const t = text(
			render(RewritePanel, {
				props: {
					rewrite: analysis.rewrite.result,
					before: analysis.table,
					after: analysis.rewrite.table,
					names: {},
					rows: state.rows,
					columns: state.columns,
					inUse: true,
					onuse: () => {}
				}
			}).body
		);
		expect(t).toContain('No left recursion and no common prefixes: there is nothing to rewrite.');
	});
});

describe('ParsePanel', () => {
	it('shows the trace of slide 12 up to the current row, with the entry looked up', () => {
		const { parse, order, tokens } = load('trace');
		const at = (index: number) =>
			text(
				render(ParsePanel, {
					props: {
						parse: parse.parse,
						tokens: tokens.tokens,
						table: parse.table,
						order: tableOrder(parse.table, 'T E X Y', 'int * + ( ) $'),
						stepper: stepperAt(parse.parse.rows.length, index)
					}
				}).body
			);
		void order;
		const first = at(1);
		expect(first).toContain('Stack Input Action');
		expect(first).toContain('1 E $ int * int $ T X 2 T X $ int * int $ int Y');
		expect(first).not.toContain('int Y X $');
		expect(first).toContain('Entry used: T[T, int]');
		const end = at(9);
		expect(end).toContain('10 $ $ ACCEPT');
		// The caption says what the last row does; the callout only what follows from it.
		expect(end).toContain('End of input, and only $ is left on the stack: ACCEPT.');
		expect(end).toContain('ACCEPT The token string is in L(G).');
		expect(end.match(/End of input/g)).toHaveLength(1);
		expect(first).not.toContain('The token string is in L(G).');
	});

	it('shows an error and a run that stops, each said once', () => {
		for (const [id, caption, callout] of [
			['blank', 'T[E, *] is blank: error.', 'Error The token string is not in L(G).'],
			[
				'bottom-up',
				'The run stopped: the parse tree would be more than 500 levels deep.',
				'The parser loops It takes the same productions again and again without matching a token: G is left recursive.'
			]
		] as const) {
			const { parse, order, tokens } = load(id);
			const t = text(
				render(ParsePanel, {
					props: {
						parse: parse.parse,
						tokens: tokens.tokens,
						table: parse.table,
						order,
						stepper: stepperAt(parse.parse.rows.length, parse.parse.rows.length - 1)
					}
				}).body
			);
			expect(t).toContain(caption);
			expect(t).toContain(callout);
			expect(t.split(caption)).toHaveLength(2);
		}
	});

	it('keeps the Stack | Input | Action headings and the Action column of a long run in view', () => {
		const { parse, order, tokens } = load('bottom-up');
		const rows = parse.parse.rows.length;
		const html = render(ParsePanel, {
			props: {
				parse: parse.parse,
				tokens: tokens.tokens,
				table: parse.table,
				order,
				stepper: stepperAt(rows, rows - 2)
			}
		}).body;
		const t = text(html);
		// The last expansion: its stack is cut to its top and $, then the action.
		const stack = parse.parse.rows[rows - 2].stack.length;
		expect(stack).toBeGreaterThan(1000);
		expect(t).toContain(
			`${rows - 1} E + ( E ) + ( E ) + ( E … and ${stack - 13} more symbols, then $ int + ( int ) $ E + ( E )`
		);
		expect(html).toMatch(/<th scope="col"[^>]*>Stack<\/th>/);
		// The preset opens on its third row: the same entry looked up a third time.
		const opening = text(
			render(ParsePanel, {
				props: {
					parse: parse.parse,
					tokens: tokens.tokens,
					table: parse.table,
					order,
					stepper: stepperAt(rows, 2)
				}
			}).body
		);
		expect(opening).toContain('Entry used: T[E, int]');
		expect(opening).toContain('3 E + ( E ) + ( E ) $ int + ( int ) $ E + ( E )');
		expect(opening).not.toContain('The run stopped');
		expect(opening).not.toContain('The parser loops');
	});
});

describe('PresetNote', () => {
	it('poses the questions of the slides with their answers', () => {
		const t = text(render(PresetNote, { props: { preset: preset('table') } }).body);
		expect(t).toContain('Table-based Predictive Parsing · slides 7–9');
		expect(t).toContain('Consider the [E, int] entry');
		expect(t).toContain('Blank entries indicate ?');
		expect(t).toContain('Show answer');
	});
});
