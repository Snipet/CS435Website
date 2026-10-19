/**
 * Server-renders the tool's components: the markup must build, carry what
 * the slides show, and name its controls.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { Stepper } from '$lib/components/ui';
import { computeBuild } from './build';
import ClosurePanel from './ClosurePanel.svelte';
import { closureSetup } from './closure-steps';
import { buildSteps } from './construction';
import DfaPanel from './DfaPanel.svelte';
import { stateNotes } from './diagram';
import ItemSetDiagram from './ItemSetDiagram.svelte';
import LrTableView from './LrTableView.svelte';
import { parseFrames } from './parse-steps';
import ParsePanel from './ParsePanel.svelte';
import { presetState, presets } from './presets';
import PresetNote from './PresetNote.svelte';
import Pseudocode from './Pseudocode.svelte';
import { CLOSURE_CODE } from './closure-steps';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		// The dot of an item is an element inside the item's text.
		.replace(/<span class="dot[^"]*">([^<]*)<\/span>/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const attrs = (html: string, name: string) =>
	[...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) =>
		m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
	);

const build = computeBuild({
	grammar: 'E → E + ( E ) | int',
	input: 'int + ( int ) + ( int )',
	order: 'grammar',
	method: 'lr1'
})!;
const notes = stateNotes(build.automaton, 'lr1');
const all = { states: 12, edges: 13 };

describe('Pseudocode', () => {
	it('marks the line that runs and draws the dot in red', () => {
		const { body } = render(Pseudocode, {
			props: { lines: CLOSURE_CODE, active: [5], outer: [1], label: 'Closure' }
		});
		expect(body.match(/aria-current="step"/g)).toHaveLength(1);
		expect(body).toMatch(/class="active[^"]*" aria-current="step"/);
		expect(body).toContain('class="outer');
		expect(body.match(/class="dot[^"]*">•</g)).toHaveLength(2);
		expect(text(body)).toContain('add [Y → •γ, b] to Items');
	});
});

describe('ItemSetDiagram', () => {
	it('draws a button per state, with its items and labels in its name, and the edge labels', () => {
		const { body } = render(ItemSetDiagram, {
			props: {
				automaton: build.automaton,
				notes,
				form: 'abbreviated',
				range: [0, 11],
				made: all,
				selected: { kind: 'state', state: 4 },
				onselect: () => {},
				current: 2
			}
		});
		const names = attrs(body, 'aria-label');
		expect(names).toContain('State 4; E → E+(•E), $/+; E → •E+(E), )/+; E → •int, )/+');
		expect(names).toContain('State 2, the parser is here; S → E•, $; E → E•+(E), $/+; accept on $');
		expect(names).toContain('Edge from state 6 to state 8 on +');
		expect(names.filter((n) => n.startsWith('Edge from'))).toHaveLength(13);
		expect(body.match(/role="button"/g)).toHaveLength(12);
		expect(body).toContain('aria-pressed="true"');
		expect(text(body)).toContain('E → E + (E) on ), +');
		expect(text(body)).toContain('12 states');
	});

	it('hides the states the construction has not made yet', () => {
		const { body } = render(ItemSetDiagram, {
			props: {
				automaton: build.automaton,
				notes,
				form: 'full',
				range: [0, 11],
				made: { states: 7, edges: 6 },
				selected: null,
				onselect: () => {},
				step: { from: 4, edge: 5, made: 6 }
			}
		});
		expect(body.match(/class="node[^"]*hidden/g)).toHaveLength(5);
		expect(body.match(/tabindex="-1"/g)).toHaveLength(5);
		expect(attrs(body, 'aria-label').filter((n) => n.startsWith('Edge from'))).toHaveLength(6);
		expect(attrs(body, 'aria-label')).toContain(
			'State 6, just made; E → E+(E•), $; E → E+(E•), +; E → E•+(E), ); E → E•+(E), +'
		);
	});
});

describe('LrTableView', () => {
	it('writes the entries as slide 19 does and marks the lookup', () => {
		const { body } = render(LrTableView, {
			props: {
				table: build.table,
				range: [3, 7],
				lookup: { state: 5, kind: 'action', column: build.table.terminals.indexOf(')') },
				row: 4,
				caption: 'Rows 3–7'
			}
		});
		expect(text(body)).toContain('action goto');
		const html = body.replace(/<!--.*?-->/g, '').replace(/ class="[^"]*"/g, '');
		expect(html).toContain('r<sub>E→int</sub>');
		expect(html).toContain('r<sub>E→E+(E)</sub>');
		const names = attrs(body, 'aria-label');
		expect(names).toContain('action[3, (] = shift 4');
		expect(names).toContain('Goto[4, E] = 6');
		expect(names).toContain('action[6, +] = shift 8');
		expect(names).toContain('action[6, )] = shift 7');
		expect(body.match(/<tr class="[^"]*selected/g)).toHaveLength(1);
		expect(body.match(/class="[^"]*lookup/g)).toHaveLength(1);
		expect(html.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr/g)).toHaveLength(5);
	});

	it('marks a conflict and shows both entries', () => {
		const amb = computeBuild({
			grammar: 'E → E + E | E * E | int',
			input: '',
			order: 'grammar',
			method: 'lr1'
		})!;
		const { body } = render(LrTableView, {
			props: { table: amb.table, range: [0, 6], caption: 'Table' }
		});
		expect(body.match(/class="[^"]*conflict/g)).toHaveLength(amb.table.conflicts.length);
		expect(attrs(body, 'aria-label').some((n) => /: conflict, shift \d+ or reduce/.test(n))).toBe(
			true
		);
	});
});

describe('the panels', () => {
	it('render the Closure stepper on slide 11', () => {
		const state = presetState(presets[0]);
		const b = computeBuild(state)!;
		const setup = closureSetup({
			mode: 'closure',
			aug: b.lr1.augmented,
			seed: '',
			lr1: b.lr1,
			from: 0,
			symbol: '',
			closureOrder: [1, 0]
		});
		const stepper = new Stepper(() => setup!.run!.frames.length, { index: 22 });
		const { body } = render(ClosurePanel, {
			props: { setup, stepper, mode: 'closure', seed: '' }
		});
		expect(text(body)).toContain('Items 5');
		expect(text(body)).toContain('Abbreviated 3');
		expect(text(body)).toContain('Items is unchanged');
		stepper.dispose();
	});

	it('render the DFA panel, the parse panel and a preset note', () => {
		const stepper = new Stepper(() => buildSteps(build.automaton).length, { index: 6 });
		const dfa = render(DfaPanel, {
			props: {
				build,
				notes,
				method: 'lr1',
				view: 'boxes',
				items: 'abbreviated',
				range: [0, 11],
				ranged: false,
				onrange: () => {},
				steps: buildSteps(build.automaton),
				stepper,
				selected: null,
				onselect: () => {}
			}
		});
		expect(text(dfa.body)).toContain('Transition(4, E) is a new set of items: state 6.');
		expect(text(dfa.body)).toMatch(/States 12 7 7 7 Conflicts 0 0 0 0/);
		const frames = parseFrames(build.table, build.parse!);
		const parseStepper = new Stepper(() => frames.length, { index: 4 });
		const parse = render(ParsePanel, {
			props: {
				input: 'int + ( int ) + ( int )',
				diagnostics: [],
				parse: build.parse,
				frames,
				stepper: parseStepper
			}
		});
		expect(text(parse.body)).toContain('reduce E → int: pop 1 pair');
		expect(text(parse.body)).toContain('< dummy, 0 > < int, 1 >');
		expect(text(parse.body)).toContain('int I divider + (int) + (int)$');
		const note = render(PresetNote, {
			props: { preset: presets.find((p) => p.id === 'circles')! }
		});
		expect(text(note.body)).toContain('Bottom-up Parsing II · slide 17');
		expect(text(note.body)).toContain('DFA input is ?');
		stepper.dispose();
		parseStepper.dispose();
	});
});
