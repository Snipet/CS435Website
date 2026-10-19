/**
 * Every preset says what the tool shows for it: its conflicts, how they are
 * settled, the parse and the other parse, bison's report, and the slide's
 * answers.
 */
import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { bracketForm } from '$lib/theory/grammar/derive';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { analyze } from './analysis';
import { readPrecedenceText } from './precedence';
import { DEFAULT_PRESET_ID, presetFor, presetState, presets } from './presets';
import { DEFAULT_STATE } from './state';
import { summaryText } from './view';

const preset = (id: string) => presets.find((p) => p.id === id)!;
function run(id: string) {
	const state = presetState(preset(id));
	const result = analyze(state);
	if (result.status !== 'done') throw new Error(`${id}: ${result.status}`);
	return result;
}
const tree = (r: ReturnType<typeof run>) => bracketForm(r.parse!.tree!);
const other = (r: ReturnType<typeof run>) => bracketForm(r.alternative!.tree!);

describe('presets', () => {
	it('are well formed: grammar and declarations without errors, unique ids, slides of deck 15', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			const { grammar, diagnostics } = parseGrammar(p.value.grammar);
			expect(grammar, p.id).not.toBeNull();
			expect(
				diagnostics.filter((d) => d.severity !== 'info'),
				p.id
			).toEqual([]);
			expect(readPrecedenceText(p.value.precedence ?? '', grammar).diagnostics, p.id).toEqual([]);
			for (const cite of [p.cite, ...(p.questions ?? []).map((q) => q.cite)].filter(Boolean)) {
				expect(cite!.deck).toBe('15');
				const [from, to] =
					typeof cite!.slide === 'number' ? [cite!.slide, cite!.slide] : cite!.slide!;
				expect(from).toBeGreaterThanOrEqual(16);
				expect(to).toBeLessThanOrEqual(28);
			}
			// Each preset's own choices change an entry, so the other parse is shown.
			const r = run(p.id);
			expect(r.choices, p.id).toEqual(p.value.choices ?? []);
			expect(r.parse, p.id).not.toBeNull();
		}
	});

	it('are found again from their state; the default state is the default preset', () => {
		for (const p of presets) expect(presetFor(presetState(p), p.id)?.id).toBe(p.id);
		expect(presetFor(DEFAULT_STATE)?.id).toBe(DEFAULT_PRESET_ID);
		expect(presetFor({ ...DEFAULT_STATE, input: 'int' })).toBeUndefined();
		// Spacing does not matter.
		expect(presetFor({ ...DEFAULT_STATE, precedence: "  %left   '+'\n\n%left '*'  " })?.id).toBe(
			DEFAULT_PRESET_ID
		);
	});

	it('cite slides as formatCitation writes them', () => {
		expect(formatCitation(preset('ambiguous').cite!)).toBe('Bottom-up Parsing III · slides 18–21');
		expect(formatCitation(preset('id-sequence').cite!)).toBe(
			'Bottom-up Parsing III · slides 24–25'
		);
	});

	it('ambiguous: four conflicts by default; the other parse reduces E → E * E on +', () => {
		const r = run('ambiguous');
		expect(r.summary.map(summaryText)).toEqual([
			'LR(1) state 5 conflicts: 2 shift/reduce',
			'LR(1) state 6 conflicts: 2 shift/reduce'
		]);
		const chosen = r.conflicts[r.choices[0][0]];
		expect([chosen.state, chosen.terminal]).toEqual([6, '+']);
		expect(tree(r)).toBe('E( E(int) * E( E(int) + E(int) ) )');
		expect(other(r)).toBe('E( E( E(int) * E(int) ) + E(int) )');
	});

	it('precedence: all four settled, int + int * int as int + (int * int), slide 20’s answer', () => {
		const r = run('precedence');
		expect(r.unresolved).toEqual({ sr: 0, rr: 0 });
		expect(tree(r)).toBe('E( E(int) + E( E(int) * E(int) ) )');
		const c = r.conflicts.find((k) => k.state === 6 && k.terminal === '+')!;
		expect(preset('precedence').questions![0].answer).toContain(c.explanation.text);
		const c21 = r.conflicts.find((k) => k.state === 5 && k.terminal === '+')!;
		expect(c21.explanation.text.startsWith('reduce')).toBe(true);
	});

	it('dangling else: the default shift attaches the else to the nearest if', () => {
		const r = run('dangling-else');
		expect(r.conflicts).toHaveLength(1);
		expect(r.conflicts[0].explanation.by).toBe('default');
		expect(tree(r)).toBe('S( if E then S( if E then S(OTHER) else S(OTHER) ) )');
		expect(other(r)).toBe('S( if E then S( if E then S(OTHER) ) else S(OTHER) )');
		const declared = run('dangling-else-precedence');
		// Slide 22's words: else with higher precedence than then, on the later line.
		expect(preset('dangling-else-precedence').label).toBe('Dangling else, else higher than then');
		expect(preset('dangling-else-precedence').value.precedence).toBe('%left then\n%left else');
		expect(declared.conflicts[0].explanation.by).toBe('precedence');
		expect(declared.summary).toEqual([]);
		expect(tree(declared)).toBe(tree(r));
	});

	it('id sequence: a reduce/reduce conflict on $, gone after the rewrite', () => {
		const r = run('id-sequence');
		expect(r.summary.map(summaryText)).toEqual(['LR(1) state 1 conflicts: 1 reduce/reduce']);
		expect(tree(r)).toBe('S( id S(ε) )');
		expect(other(r)).toBe('S(id)');
		expect(r.report.head[0].lines).toEqual([
			'Rules useless in parser due to conflicts',
			'',
			'    2 S: id'
		]);
		expect(run('id-sequence-fixed').conflicts).toEqual([]);
	});

	it('beyond the slides: swapped lines, %right, %nonassoc', () => {
		expect(tree(run('swapped'))).toBe('E( E( E(int) + E(int) ) * E(int) )');
		expect(tree(run('right'))).toBe('E( E( E(int) ^ E( E(int) ^ E(int) ) ) + E(int) )');
		const n = run('nonassoc');
		expect(n.parse).toMatchObject({ outcome: 'error', at: 3 });
		const fine = analyze({ ...presetState(preset('nonassoc')), input: 'int < int + int' });
		expect(fine.status === 'done' && bracketForm(fine.parse!.tree!)).toBe(
			'E( E(int) < E( E(int) + E(int) ) )'
		);
	});

	it('LR(1) but not LALR(1): no LR(1) conflicts, two reduce/reduce conflicts in Parser.output', () => {
		const r = run('not-lalr');
		expect(r.conflicts).toEqual([]);
		expect(r.report.rr).toBe(2);
		expect(r.report.states.find((s) => s.rr > 0)!.merged).toHaveLength(2);
		// Its language is finite: it is LL(3), inside LL(k) and outside LL(1).
		expect(r.classes.place).toEqual({ lr: 'lr1', ll: 'llk', ambiguous: false });
		expect(r.classes.llk).toEqual({ kind: 'finite', k: 3 });
	});

	it('C-: 372 LR(1) states, one conflict, 115 LALR(1) states', () => {
		const r = run('cminus');
		expect([r.states, r.conflicts.length, r.lalrStates]).toEqual([372, 1, 115]);
		expect(preset('cminus').description).toContain('372 states');
		expect(preset('cminus').description).toContain('115 states');
		expect(r.parse!.outcome).toBe('accept');
		expect(r.summary.map(summaryText)).toEqual(['LR(1) state 363 conflicts: 1 shift/reduce']);
		expect(r.summary[0].bisonState).toBe(107);
		expect(r.report.head.find((h) => h.title === 'Conflicts')!.lines).toEqual([
			'State 107 conflicts: 1 shift/reduce'
		]);
	});

	it('describe what the tool does, not what it is for', () => {
		const words = /understand|intuition|learn|explor|common mistake|misconception|helps you/i;
		for (const p of presets) {
			expect(p.description ?? '', p.id).not.toMatch(words);
			for (const q of p.questions ?? []) expect(q.answer, p.id).not.toMatch(words);
		}
	});
});
