import { describe, expect, it } from 'vitest';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import {
	automatonFromText,
	formatAutomatonText,
	subsetConstruction,
	thompson,
	type Automaton
} from '$lib/theory/automata';
import { names } from '$lib/theory/automata/test-helpers';
import {
	BLOWUP_MAX_K,
	MAX_DFA_STATES,
	MAX_NFA_STATES,
	MAX_WORKLIST_CELLS,
	blowupNfaText,
	blowupRows,
	buildNfa,
	checkPicks,
	checkPrediction,
	construct,
	continuePrediction,
	countSubsets,
	dfaHighlight,
	dfaStateLimit,
	drawnDfa,
	newPrediction,
	nextTarget,
	nfaHighlight,
	partialDfa,
	powerOfTwoText,
	predictionLimit,
	predictionView,
	rebuildNfa,
	runSideBySide,
	sameSet,
	setText,
	stepCell,
	superscript,
	targetSet,
	thompsonSize,
	togglePick,
	worklist,
	type Prediction
} from './logic';

const src = (re: string, defs = '') => ({ from: 're' as const, re, defs, text: '' });
const nfaSrc = (text: string) => ({ from: 'nfa' as const, re: '', defs: '', text });

function nfaOf(re: string, defs = ''): Automaton {
	const b = buildNfa(src(re, defs));
	if (!b.nfa) throw new Error(b.reDiagnostics.map((d) => d.message).join('; '));
	return b.nfa;
}

describe('formatting', () => {
	const a = nfaOf('(1 | 0)*1');

	it('writes sets with spaces inside the braces', () => {
		expect(setText(a, [0, 1, 7])).toBe('{ A, B, H }');
		expect(setText(a, [])).toBe('{ }');
	});

	it('writes powers of two', () => {
		expect(superscript(10)).toBe('¹⁰');
		expect(powerOfTwoText(3)).toBe('8');
		expect(powerOfTwoText(10)).toBe('1,024');
		expect(powerOfTwoText(100)).toBe('≈ 1.27 × 10³⁰');
	});

	it('compares sets', () => {
		expect(sameSet([1, 2, 3], [3, 1, 2])).toBe(true);
		expect(sameSet([1, 2], [1, 2, 3])).toBe(false);
		expect(sameSet([], [])).toBe(true);
	});
});

describe('thompsonSize', () => {
	it('matches the states Thompson builds', () => {
		const defs = "digit = '0' | '1'\npair = digit digit\nabc = a | b | c";
		const d = parseDefinitions(defs);
		for (const text of [
			'(1 | 0)*1',
			'ε',
			'ɸ',
			'a+',
			'a?',
			'(a|b)^3',
			'a^0',
			"'if'",
			'Σ*',
			'pair+ digit?',
			'a^{2,4}',
			'a^{2,}',
			'(0 | 1)* 1 (0|1)^2',
			// Alternations of more than two options are combined two at a time.
			'a|b|c',
			'(a|b|c|d)*',
			'abc abc',
			'(a|b|c)^{1,2}',
			'(a|b|c)?',
			'(a|b|c)+'
		]) {
			const r = parseRegex(text, { defs: d.defs });
			if (!r.ok) throw new Error(text);
			expect(thompsonSize(r.regex), text).toBe(thompson(r.regex).nfa.states.length);
		}
	});

	it('stops counting past the limit, even with nested definitions', () => {
		const lines = ['a0 = x'];
		for (let i = 1; i <= 40; i++) lines.push(`a${i} = a${i - 1} a${i - 1}`);
		const d = parseDefinitions(lines.join('\n'));
		const r = parseRegex('a40', { defs: d.defs });
		if (!r.ok) throw new Error('parse');
		expect(thompsonSize(r.regex)).toBe(MAX_NFA_STATES + 1);
	});
});

describe('buildNfa', () => {
	it('builds Thompson NFAs with grid positions', () => {
		const b = buildNfa(src('(1 | 0)*1'));
		expect(b.nfa?.states).toHaveLength(10);
		expect(b.positions?.size).toBe(10);
		expect(b.tooLarge).toBeNull();
	});

	it('reports regular-expression and definition problems', () => {
		const bad = buildNfa(src('(1 | 0'));
		expect(bad.nfa).toBeNull();
		expect(bad.reDiagnostics.some((d) => d.severity === 'error')).toBe(true);
		const defs = buildNfa(src('d d', 'd = 0 |'));
		expect(defs.defsDiagnostics.some((d) => d.severity === 'error')).toBe(true);
		const ok = buildNfa(src('d d', 'd = 0 | 1'));
		expect(ok.nfa?.states).toHaveLength(12);
	});

	it('refuses NFAs over the size limit', () => {
		const big = buildNfa(src('(a|b)^100'));
		expect(big.nfa).toBeNull();
		expect(big.tooLarge).toBeGreaterThan(MAX_NFA_STATES);
		// Thompson makes 308 states here (10 options, 9 unions each).
		const wide = buildNfa(src('(a|b|c|d|e|f|g|h|i|j)*a(a|b|c|d|e|f|g|h|i|j)^7'));
		expect(wide.nfa).toBeNull();
		expect(wide.tooLarge).toBeGreaterThan(MAX_NFA_STATES);
		const letters = 'abcdefghijklmnopqrstuvwxyz'.split('').join('|');
		expect(buildNfa(src(`(${letters})^5`)).nfa).toBeNull();
		expect(buildNfa(src(`(${letters})^2`)).nfa?.states.length).toBeLessThanOrEqual(MAX_NFA_STATES);
	});

	it('reads the text format without positions', () => {
		const b = buildNfa(nfaSrc('start: A\naccept: B\nA 1 A\nA 1 B\n'));
		expect(b.nfa?.states).toHaveLength(2);
		expect(b.positions).toBeNull();
		const bad = buildNfa(nfaSrc('A 1'));
		expect(bad.nfa).toBeNull();
		expect(bad.textDiagnostics.length).toBeGreaterThan(0);
	});

	it('keeps the previous NFA when an edit leaves the machine as it was', () => {
		const text = 'start: A\naccept: B\nA 1 A\nA 1 B\n';
		const first = rebuildNfa(nfaSrc(text), null);
		expect(first.key).not.toBeNull();
		// Spaces and blank lines: the same NFA object, so the construction is not redone.
		const spaced = rebuildNfa(nfaSrc(`\n  ${text.replace('A 1 B', 'A   1   B')}  \n\n`), first);
		expect(spaced.nfa).toBe(first.nfa);
		expect(spaced.positions).toBe(first.positions);
		// A real change builds a new NFA.
		const changed = rebuildNfa(nfaSrc(`${text}B 0 B\n`), spaced);
		expect(changed.nfa).not.toBe(first.nfa);
		expect(changed.nfa?.transitions).toHaveLength(3);
		// Mid-edit problems drop the NFA; the diagnostics are the new source's.
		const broken = rebuildNfa(nfaSrc(`${text}B 0`), changed);
		expect(broken.nfa).toBeNull();
		expect(broken.textDiagnostics.length).toBeGreaterThan(0);

		const re = rebuildNfa(src('(1 | 0)*1'), null);
		expect(rebuildNfa(src('(1|0)* 1'), re).nfa).toBe(re.nfa);
		expect(rebuildNfa(src('(0 | 1)*1'), re).nfa).not.toBe(re.nfa);
		// The same machine typed as text is drawn differently (no grid): a new build.
		const typed = rebuildNfa(nfaSrc(formatAutomatonText(re.nfa!)), re);
		expect(typed.nfa).not.toBe(re.nfa);
		expect(typed.positions).toBeNull();
	});
});

describe('countSubsets and construct', () => {
	it('counts the states subsetConstruction makes', () => {
		for (const re of ['(1 | 0)*1', '(a|b)*abb', 'a | b*', '(0 | 1)* 1 (0|1)^3']) {
			const nfa = nfaOf(re);
			expect(countSubsets(nfa), re).toBe(subsetConstruction(nfa).dfa.states.length);
			expect(countSubsets(nfa, { includeEmpty: true }), re).toBe(
				subsetConstruction(nfa, { includeEmpty: true }).dfa.states.length
			);
		}
	});

	it('gives up past the limit', () => {
		const nfa = nfaOf('(0 | 1)* 1 (0|1)^3');
		expect(countSubsets(nfa, { limit: 17 })).toBe(17);
		expect(countSubsets(nfa, { limit: 16 })).toBeNull();
		const huge = automatonFromText(blowupNfaText(9));
		expect(construct(huge, { naming: 'discovery', includeEmpty: false })).toEqual({
			result: null,
			tooLarge: true,
			limit: MAX_DFA_STATES,
			classes: 2
		});
		expect(MAX_DFA_STATES).toBeLessThan(2 ** 10);
	});

	it('limits the worklist size too: many symbol classes lower the DFA state limit', () => {
		expect(dfaStateLimit(2)).toBe(MAX_DFA_STATES);
		expect(dfaStateLimit(0)).toBe(MAX_DFA_STATES);
		expect(dfaStateLimit(36)).toBe(Math.floor(MAX_WORKLIST_CELLS / 36));
		// A x A for every symbol of 0-9a-z, A 1 B, then B → C → … on every symbol: 36 classes.
		const symbols = [...'0123456789abcdefghijklmnopqrstuvwxyz'];
		const chain = (length: number) => {
			const lines = ['start: A', `accept: ${String.fromCharCode(66 + length)}`, 'A 1 B'];
			for (const x of symbols) lines.push(`A ${x} A`);
			for (let i = 1; i <= length; i++)
				for (const x of symbols)
					lines.push(`${String.fromCharCode(65 + i)} ${x} ${String.fromCharCode(66 + i)}`);
			return automatonFromText(lines.join('\n'));
		};
		// 2^8 = 256 DFA states × 36 classes is past the worklist limit, though under MAX_DFA_STATES.
		const wide = chain(7);
		expect(countSubsets(wide)).toBe(256);
		const c = construct(wide, { naming: 'discovery', includeEmpty: false });
		expect(c).toMatchObject({ result: null, tooLarge: true, classes: 36 });
		expect(c.limit * c.classes).toBeLessThanOrEqual(MAX_WORKLIST_CELLS);
		// 2^3 = 8 states × 36 classes is built.
		const small = construct(chain(2), { naming: 'discovery', includeEmpty: false });
		expect(small.tooLarge).toBe(false);
		expect(small.result?.dfa.states).toHaveLength(8);
	});
});

describe('worklist', () => {
	const nfa = nfaOf('(1 | 0)*1');
	const result = subsetConstruction(nfa);
	const rows = worklist(result);

	it('has one row per DFA state, in worklist order, with the step that created it', () => {
		expect(rows.map((r) => result.dfa.states[r.state].name)).toEqual([
			'ABCDHI',
			'FGABCDHI',
			'EJGABCDHI'
		]);
		expect(rows.map((r) => r.created)).toEqual([0, 3, 6]);
	});

	it('knows the steps at which each row starts and is complete', () => {
		// ABCDHI: steps 1–6; FGABCDHI: 7–12; EJGABCDHI: 13–18.
		expect(rows.map((r) => [r.begins, r.complete])).toEqual([
			[1, 6],
			[7, 12],
			[13, 18]
		]);
		for (const r of rows)
			for (const c of r.cells)
				for (const part of [c.move, c.closure, c.target])
					expect(part!.step).toBeGreaterThanOrEqual(r.begins);
	});

	it('fills move → ε-closure → target per symbol', () => {
		const [on0, on1] = rows[0].cells;
		expect(names(nfa, on0.move!.targets)).toEqual(['F']);
		expect(names(nfa, on0.closure!.order).join('')).toBe('FGABCDHI');
		expect(on0.target).toEqual({ step: 3, to: 1, isNew: true });
		expect(names(nfa, on1.move!.targets)).toEqual(['E', 'J']);
		expect(on1.target).toMatchObject({ to: 2, isNew: true });
		expect(rows[2].cells[1].target).toMatchObject({ to: 2, isNew: false });
	});

	it('locates steps in the table', () => {
		expect(stepCell(result, result.steps[0])).toBeNull();
		expect(stepCell(result, result.steps[4])).toEqual({ from: 0, column: 1 });
		expect(stepCell(result, result.steps.at(-1)!)).toBeNull();
	});

	it('draws the ∅ state as a trap state', () => {
		const a = automatonFromText('alphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 1 B\n');
		const shown = subsetConstruction(a, { includeEmpty: true });
		const drawn = drawnDfa(shown);
		expect(drawn.states.filter((s) => s.trap).map((s) => s.name)).toEqual(['∅']);
		expect(shown.dfa.states.some((s) => s.trap)).toBe(false);
		const hidden = subsetConstruction(a);
		expect(drawnDfa(hidden)).toBe(hidden.dfa);
	});

	it('lists the ∅ target when it is shown, and nothing when hidden', () => {
		const a = automatonFromText('alphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 1 B\n');
		const hidden = worklist(subsetConstruction(a));
		expect(hidden[0].cells[0].target).toMatchObject({ to: null, isNew: false });
		const shown = subsetConstruction(a, { includeEmpty: true });
		expect(worklist(shown)[0].cells[0].target).toMatchObject({ to: shown.empty, isNew: true });
	});
});

describe('highlights', () => {
	const nfa = nfaOf('(1 | 0)*1');
	const result = subsetConstruction(nfa);

	it('start: the ε-closure of A and the ε-edges it followed', () => {
		const h = nfaHighlight(result, 0);
		expect(names(nfa, h.active).join('')).toBe('ABCDHI');
		expect(h.taken.every((t) => nfa.transitions[t].label === null)).toBe(true);
		expect(h.taken).toHaveLength(5);
	});

	it('move: the set being processed, then the targets', () => {
		const h = nfaHighlight(result, 1);
		expect(names(nfa, h.active)).toEqual(['F']);
		expect(names(nfa, h.info).join('')).toBe('ABCDHI');
		expect(h.taken).toEqual([result.steps[1].kind === 'move' ? result.steps[1].via[0] : -1]);
	});

	it('closure and target: the closure, with the move and ε-edges', () => {
		for (const i of [2, 3]) {
			const h = nfaHighlight(result, i);
			expect(names(nfa, h.active).join('')).toBe('FGABCDHI');
			expect(h.taken.length).toBeGreaterThan(1);
		}
		expect(nfaHighlight(result, result.steps.length - 1).active).toEqual([]);
	});

	it('DFA: the state being processed, then the target and its edge', () => {
		expect(dfaHighlight(result, 0).active).toEqual([0]);
		expect(dfaHighlight(result, 1).info).toEqual([0]);
		expect(dfaHighlight(result, 3)).toEqual({ active: [1], taken: [0], info: [0] });
	});

	it('the DFA grows with the steps', () => {
		expect(partialDfa(result.dfa, result.steps[0]).states).toHaveLength(1);
		expect(partialDfa(result.dfa, result.steps[3]).transitions).toHaveLength(1);
		expect(partialDfa(result.dfa, result.steps.at(-1)).states).toHaveLength(3);
	});
});

describe('predictions', () => {
	const nfa = nfaOf('(1 | 0)*1');
	const result = subsetConstruction(nfa);

	it('finds the next target to predict', () => {
		expect(nextTarget(result, 0)).toBe(3);
		expect(nextTarget(result, 3)).toBe(6);
		expect(nextTarget(result, result.steps.length - 1)).toBeNull();
		expect(names(nfa, targetSet(result, 3)).join('')).toBe('FGABCDHI');
	});

	it('answers one target after another without stepping in between', () => {
		const setOf = (text: string) => [...text].map((c) => c.charCodeAt(0) - 65);
		let p: Prediction = newPrediction();
		let index = 0;
		const pickAll = (ids: number[]) => {
			for (const id of ids) p = togglePick(result, index, p, id);
		};

		expect(predictionView(result, index, p)).toMatchObject({ phase: 'pick', pending: 3 });
		pickAll(setOf('FGABCDHI'));
		let c = checkPicks(result, index, p)!;
		expect(c.reveal).toBe(3);
		p = c.prediction;
		index = c.reveal;
		expect(p.verdict?.check.correct).toBe(true);

		// The verdict is shown, and the next target (EJGABCDHI) can be picked straight away.
		let v = predictionView(result, index, p);
		expect(v).toMatchObject({ phase: 'verdict', pending: 6, canPick: true, showVerdict: true });
		expect(v.picked).toEqual([]);
		pickAll(setOf('EJGABCDHI'));
		v = predictionView(result, index, p);
		expect(v.phase).toBe('pick');
		expect(v.showVerdict).toBe(false);
		expect(names(nfa, v.picked).join('')).toBe('EJGABCDHI');
		c = checkPicks(result, index, p)!;
		p = c.prediction;
		index = c.reveal;
		expect(index).toBe(6);
		expect(p.verdict?.check.correct).toBe(true);
		expect(p.score).toEqual({ right: 2, total: 2 });

		// Continue clears the verdict; a wrong guess is scored as wrong.
		p = continuePrediction(p);
		v = predictionView(result, index, p);
		expect(v).toMatchObject({ phase: 'pick', showVerdict: false });
		pickAll(setOf('F'));
		c = checkPicks(result, index, p)!;
		expect(c.prediction.verdict?.check.correct).toBe(false);
		expect(c.prediction.score).toEqual({ right: 2, total: 3 });
	});

	it('picking twice removes a state; nothing is pending after the last target', () => {
		let p = togglePick(result, 0, newPrediction(), 5);
		p = togglePick(result, 0, p, 6);
		p = togglePick(result, 0, p, 5);
		expect(predictionView(result, 0, p).picked).toEqual([6]);
		const last = result.steps.length - 1;
		const all = { ...p, revealed: last };
		expect(predictionView(result, last, all)).toMatchObject({
			phase: 'done',
			pending: null,
			picked: [],
			canPick: false
		});
		expect(togglePick(result, last, all, 1)).toBe(all);
		expect(checkPicks(result, last, all)).toBeNull();
	});

	it('holds the stepper before the move of the target to predict', () => {
		// Nothing revealed: only the start step (the first target's move is step 1).
		let p = newPrediction();
		expect(predictionLimit(result, p)).toBe(0);
		// The pending target does not depend on where the stepper is.
		expect(predictionView(result, 0, p).pending).toBe(3);
		expect(predictionView(result, 5, p).pending).toBe(3);
		// Check reveals the target: the stepper may show it, but not the next move.
		const c = checkPicks(result, 0, p)!;
		p = c.prediction;
		expect(p.revealed).toBe(3);
		expect(predictionLimit(result, p)).toBe(c.reveal);
		expect(result.steps[c.reveal + 1].kind).toBe('move');
		// A saved step reveals the steps up to it; mid-cell, the stepper stops before that cell.
		expect(predictionLimit(result, newPrediction(4))).toBe(3);
		expect(predictionLimit(result, newPrediction(6))).toBe(6);
		// Every target revealed: no limit.
		expect(predictionLimit(result, newPrediction(result.steps.length))).toBeNull();
		expect(predictionView(result, 0, newPrediction(Number.MAX_SAFE_INTEGER)).phase).toBe('done');
	});

	it('an empty prediction can be right (the ∅ target)', () => {
		const a = automatonFromText('alphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 1 B\n');
		const r = subsetConstruction(a, { includeEmpty: true });
		const first = nextTarget(r, 0)!;
		expect(targetSet(r, first)).toEqual([]);
		const c = checkPicks(r, 0, newPrediction())!;
		expect(c.prediction.verdict?.check.correct).toBe(true);
	});

	it('lists missing and extra states', () => {
		const want = targetSet(result, 3);
		expect(checkPrediction([...want].reverse(), want).correct).toBe(true);
		const c = checkPrediction([5, 6, 4], want);
		expect(c.correct).toBe(false);
		expect(names(nfa, c.hits)).toEqual(['F', 'G']);
		expect(names(nfa, c.extra)).toEqual(['E']);
		expect(names(nfa, c.missing).join('')).toBe('ABCDHI');
	});
});

describe('runSideBySide', () => {
	it('keeps the DFA state equal to the NFA active set', () => {
		const nfa = nfaOf('(a|b)*abb');
		const { dfa } = subsetConstruction(nfa);
		const run = runSideBySide(nfa, dfa, 'aabb');
		expect(run.steps).toHaveLength(5);
		expect(run.steps.every((s) => s.same)).toBe(true);
		expect(run.nfaAccepts && run.dfaAccepts).toBe(true);
	});

	it('an empty active set matches the hidden ∅ state', () => {
		const nfa = nfaOf('(1 | 0)*1');
		const { dfa } = subsetConstruction(nfa);
		const run = runSideBySide(nfa, dfa, '1x1');
		expect(run.steps[2]).toMatchObject({ nfaActive: [], dfaState: null, same: true });
		expect(run.steps[3]).toMatchObject({ nfaActive: [], dfaState: null, same: true });
		expect(run.nfaAccepts || run.dfaAccepts).toBe(false);
	});
});

describe('blow-up', () => {
	it('draws the slide-16 NFA shape for any k', () => {
		expect(blowupNfaText(1)).toBe('start: A\naccept: C\nA 0,1 A\nA 1 B\nB 0,1 C\n');
		expect(automatonFromText(blowupNfaText(5)).states).toHaveLength(7);
	});

	it('has k + 2 NFA states and 2^(k+1) DFA states', () => {
		const rows = blowupRows();
		expect(rows.map((r) => r.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(rows).toHaveLength(BLOWUP_MAX_K);
		for (const r of rows) {
			expect(r.nfaStates).toBe(r.k + 2);
			expect(r.dfaStates).toBe(r.formula);
			expect(r.formula).toBe(2 ** (r.k + 1));
		}
	});
});
