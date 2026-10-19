/**
 * Server-renders the tool's components: the markup must build for every
 * preset and show what the slides show, with the marks that color alone
 * carries also spoken.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import BisonImport from './BisonImport.svelte';
import BisonReportView from './BisonReportView.svelte';
import ClassesPanel from './ClassesPanel.svelte';
import ConflictCard from './ConflictCard.svelte';
import Configuration from './Configuration.svelte';
import ParseCard from './ParseCard.svelte';
import PrecedenceEditor from './PrecedenceEditor.svelte';
import { readPrecedenceText } from './precedence';
import PresetNote from './PresetNote.svelte';
import { presetState, presets } from './presets';
import ResolutionView from './ResolutionView.svelte';
import TransitionView from './TransitionView.svelte';
import { choiceValue } from './view';

const decode = (text: string) =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');

/**
 * The text of rendered markup: inline spans and superscripts run on, other
 * tags and line breaks become one space.
 */
const text = (html: string) =>
	decode(
		html
			.replace(/<!--.*?-->/gs, '')
			.replace(/<\/?(span|sup|sub)\b[^>]*>/g, '')
			.replace(/<[^>]+>/g, ' ')
	)
		.replace(/\s+/g, ' ')
		.trim();

/** What a screen reader reads: aria-hidden elements dropped, visually hidden text kept. */
const spoken = (html: string) =>
	text(html.replace(/<(span|svg)[^>]*aria-hidden="true"[^>]*>.*?<\/\1>/gs, ''));

const preset = (id: string) => presets.find((p) => p.id === id)!;
function run(id: string) {
	const state = presetState(preset(id));
	const result = analyze(state);
	if (result.status !== 'done') throw new Error(id);
	return { state, result, lines: readPrecedenceText(state.precedence).lines };
}

describe('Configuration', () => {
	it('writes the stack, the red divider and the next terminal', () => {
		const html = render(Configuration, { props: { stack: ['E', '*', 'E'], next: '+' } }).body;
		expect(text(html)).toBe('E * E I divider + …');
		expect(spoken(html)).toBe('E * E divider + …');
		expect(html).toContain('class="divider svelte');
		expect(text(render(Configuration, { props: { stack: ['id'], next: '$' } }).body)).toBe(
			'id I divider $'
		);
		expect(text(render(Configuration, { props: { stack: ['E', '+'], next: null } }).body)).toBe(
			'E + I divider …'
		);
	});
});

describe('TransitionView', () => {
	it('shows slide 18: the items involved, joined by ⇒ on E', () => {
		const { result } = run('precedence');
		const c = result.conflicts.find((k) => k.state === 6 && k.terminal === '+')!;
		const html = render(TransitionView, {
			props: { context: c.context, state: c.state, mode: 'partial' }
		}).body;
		expect(text(html)).toBe(
			'State 4 State 6 [E → E * • E, +] ⇒E moves on E to [E → E * E •, +] [E → • E + E, +] [E → E • + E, +] … …'
		);
		// The dot is the red bullet.
		expect(html).toContain('<span class="dot');
	});

	it('shows slide 25: the whole states, the conflict items marked', () => {
		const { result } = run('id-sequence');
		const c = result.conflicts[0];
		const html = render(TransitionView, {
			props: { context: c.context, state: c.state, mode: 'full' }
		}).body;
		expect(spoken(html)).toBe(
			[
				'State 0 [S’ → • S, $] [S → •, $] moves to a conflict item: [S → • id, $] [S → • id S, $]',
				'moves on id to',
				'State 1 conflict item: [S → id •, $] [S → id • S, $] conflict item: [S → •, $] [S → • id, $] [S → • id S, $]'
			].join(' ')
		);
	});
});

describe('ConflictCard', () => {
	it('renders every conflict of every preset', () => {
		for (const p of presets) {
			const { state, result, lines } = run(p.id);
			for (const conflict of result.conflicts) {
				const html = render(ConflictCard, {
					props: {
						conflict,
						mode: state.items,
						lines,
						choice: choiceValue(conflict, state.choices),
						onchoose: () => {}
					}
				}).body;
				expect(text(html), p.id).toContain(`State ${conflict.state} on`);
			}
		}
	});

	it('shows slide 20’s conflict: items, stack, moves and the reduce by precedence', () => {
		const { result, lines } = run('precedence');
		const c = result.conflicts.find((k) => k.state === 6 && k.terminal === '+')!;
		const html = render(ConflictCard, {
			props: {
				conflict: c,
				mode: 'partial',
				lines,
				choice: 1,
				onchoose: () => {},
				onshowstate: () => {}
			}
		}).body;
		const t = text(html);
		expect(t).toContain('State 6 on + shift/reduce reduce, by precedence');
		expect(t).toContain('[E → E • + E, +] and [E → E * E •, +]');
		expect(t).toContain('Stack E * E I divider + …');
		expect(t).toContain('shift ⇒ leads to E * E + I divider …');
		expect(t).toContain('red. E → E * E ⇒ leads to E I divider + … taken');
		expect(t).toContain(
			'reduce because precedence of rule E → E * E is higher than that of terminal +.'
		);
		expect(t).toContain('The parse of the token string does not look up action[6, +].');
		expect(t).toContain('Parser.output state 7');
		expect(t).toContain('action[6, +] in the other parse');
	});

	it('offers the error entry of %nonassoc as the third choice', () => {
		const { result, lines } = run('nonassoc');
		const c = result.conflicts.find((k) => k.explanation.winner === 'error')!;
		const html = render(ConflictCard, {
			props: { conflict: c, mode: 'partial', lines, choice: 2, onchoose: () => {} }
		}).body;
		expect(text(html)).toContain('error neither: the entry is an error taken');
		expect(html).toMatch(/<input[^>]*value="2"[^>]*checked/);
	});
});

describe('ResolutionView', () => {
	it('marks which of slide 19’s three conditions hold, in words too', () => {
		const { result, lines } = run('precedence');
		const c = result.conflicts.find((k) => k.state === 5 && k.terminal === '*')!;
		const html = render(ResolutionView, { props: { explanation: c.explanation, lines } }).body;
		expect(spoken(html)).toBe(
			[
				'Rule E → E + E last terminal +: line 1, %left Terminal * line 2, %left',
				'Resolve shift/reduce conflict with a shift if',
				'does not hold: no precedence declared for either rule or terminal',
				'holds: input terminal has higher precedence than the rule',
				'does not hold: the precedences are the same and right associative',
				'shift because terminal * has higher precedence than rule E → E + E.'
			].join(' ')
		);
	});

	it('says bison reports a conflict left to its default', () => {
		const { result, lines } = run('id-sequence');
		const html = render(ResolutionView, {
			props: { explanation: result.conflicts[0].explanation, lines }
		}).body;
		expect(text(html)).toBe(
			'reduce by S → ε because it is the earlier rule; bison reports the conflict.'
		);
	});
});

describe('PrecedenceEditor', () => {
	it('lists each declaration line with a switch and its level', () => {
		const value = "%left '+'\n// %left '*'\n%right '^'";
		const read = readPrecedenceText(value);
		const html = render(PrecedenceEditor, {
			props: { value, lines: read.lines, diagnostics: read.diagnostics }
		}).body;
		const t = text(html);
		expect(t).toContain("%left '+' line 1, level 1, lowest");
		expect(t).toContain("%left '*' line 2, off");
		expect(t).toContain("%right '^' line 3, level 2, highest");
		expect(html.match(/role="switch"/g)).toHaveLength(3);
		expect(html.match(/checked/g)).toHaveLength(2);
	});
});

describe('BisonImport', () => {
	it('is closed until opened', () => {
		const html = render(BisonImport, { props: { onuse: () => {} } }).body;
		expect(text(html)).toContain('Import from bison');
	});
});

describe('ParseCard', () => {
	it('draws the accepted tree, and where a rejected parse stopped', () => {
		const { result } = run('precedence');
		const accepted = render(ParseCard, {
			props: { title: 'As resolved', parse: result.parse!, tokens: result.tokens!, tone: 0 }
		}).body;
		expect(text(accepted)).toContain('As resolved Accepted');
		expect(accepted).toContain('<svg');
		const { result: n } = run('nonassoc');
		const rejected = render(ParseCard, {
			props: { title: 'As resolved', parse: n.parse!, tokens: n.tokens!, tone: 0 }
		}).body;
		expect(text(rejected)).toContain('Rejected');
		expect(text(rejected)).toContain('error: action[5, <] is an error entry');
	});
});

describe('BisonReportView', () => {
	it('lists the states, what they merge and the red dots', () => {
		const { result } = run('not-lalr');
		const html = render(BisonReportView, {
			props: { report: result.report, lr1States: result.states, useless: [] }
		}).body;
		const t = text(html);
		expect(t).toContain('bison –v Parser.yy -o Parser.cc');
		expect(t).toContain('Parser.yy: warning: 2 reduce/reduce conflicts [-Wconflicts-rr]');
		expect(t).toMatch(/merges LR\(1\) states \d+ and \d+/);
		expect(t).toContain('added by bison: accepts after $end');
		expect(t).toContain('0 $accept: • S $end');
		expect(html).toContain('<span class="dot');
	});

	it('says which non-terminals bison would remove', () => {
		const { result } = run('precedence');
		const html = render(BisonReportView, {
			props: { report: result.report, lr1States: result.states, useless: ['A', 'B'] }
		}).body;
		expect(text(html)).toContain('bison first removes the rules of A and B');
	});
});

describe('ClassesPanel', () => {
	it('tells the classes and marks the grammar in the diagram', () => {
		const { result } = run('id-sequence-fixed');
		const html = render(ClassesPanel, { props: { classes: result.classes } }).body;
		const t = text(html);
		expect(t).toContain('LL(1) yes');
		expect(t).toContain('LR(0) 4 states no');
		expect(t).toContain('SLR(1) 4 states yes');
		expect(t).toContain('id id has one parse tree. LL(1) and LR(1) grammars are not ambiguous.');
		expect(t).toContain(
			'The dot marks a grammar that is SLR but not LR(0), and LL(1) but not LL(0).'
		);
		expect(html).toContain('class="marker"');
	});

	it('places an ambiguous grammar, and says when it cannot place one', () => {
		const amb = run('ambiguous').result;
		expect(text(render(ClassesPanel, { props: { classes: amb.classes } }).body)).toContain(
			'int * int + int has at least two parse trees: the grammar is ambiguous.'
		);
		const unknown = analyze({ ...presetState(preset('ambiguous')), input: 'int' });
		if (unknown.status !== 'done') throw new Error('analysis');
		const t = text(render(ClassesPanel, { props: { classes: unknown.classes } }).body);
		expect(t).toContain('whether it is ambiguous this token string does not show');
		expect(t).toContain('the diagram has no one place for it');
	});
});

describe('PresetNote', () => {
	it('shows the citation, the description and the questions with their answers', () => {
		const html = render(PresetNote, { props: { preset: preset('precedence') } }).body;
		const t = text(html);
		expect(t).toContain('Bottom-up Parsing III');
		expect(t).toContain('Will choose to ?');
		expect(t).toContain('Show answer');
	});
});
