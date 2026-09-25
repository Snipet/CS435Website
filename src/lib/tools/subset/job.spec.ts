import { describe, expect, it } from 'vitest';
import { accepts, parseAutomatonText, type SubsetNaming } from '$lib/theory/automata';
import { CharSet } from '$lib/theory/charset';
import {
	anchoredStep,
	blowupNfaText,
	buildNfa,
	construct,
	followEdit,
	newPrediction,
	stepAnchor,
	worklist,
	type Prediction
} from './logic';
import {
	computeConstruction,
	constructionKey,
	requestKey,
	reviveConstruction,
	stepsChanged,
	type ConstructionData,
	type ConstructionRequest,
	type PlainConstruction
} from './job';

const req = (over: Partial<ConstructionRequest>): ConstructionRequest => ({
	from: 're',
	re: '(1 | 0)*1',
	defs: '',
	text: '',
	naming: 'discovery',
	showEmpty: false,
	have: null,
	...over
});

/** The answer as the page gets it: copied from the worker. */
const viaWorker = (r: ConstructionRequest): ConstructionData =>
	structuredClone(computeConstruction(r));

function built(r: ConstructionRequest): PlainConstruction {
	const data = viaWorker(r);
	if (data.kind !== 'built') throw new Error(`expected a construction, got ${data.kind}`);
	return data;
}

describe('computeConstruction', () => {
	it('builds the lecture construction with Thompson’s grid and the DFA layout', () => {
		const data = built(req({}));
		const shown = reviveConstruction(data, false);
		expect(shown.nfa.states).toHaveLength(10);
		expect(shown.grid?.size).toBe(10);
		expect(shown.layout).toBeNull();
		const result = shown.construction.result!;
		expect(result.dfa.states.map((s) => s.name)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(shown.dfaLayout?.positions.size).toBe(3);
		expect(shown.dfaLayout?.bounds.width).toBeGreaterThan(0);
		expect(accepts(parseAutomatonText(shown.dfaText!).automaton!, '0101')).toBe(true);
	});

	it('gives the page engine objects: labels are CharSets and steps find their columns', () => {
		const shown = reviveConstruction(built(req({ re: '1 0', showEmpty: true })), true);
		const result = shown.construction.result!;
		expect(shown.nfa.transitions.find((t) => t.label)?.label).toBeInstanceOf(CharSet);
		expect(accepts(shown.nfa, '10')).toBe(true);
		const direct = construct(buildNfa(req({ re: '1 0' })).nfa!, {
			naming: 'discovery',
			includeEmpty: true
		});
		expect(worklist(result)).toEqual(worklist(direct.result!));
		expect(result.empty).not.toBeNull();
		expect(result.empty).toBe(direct.result!.empty);
		// The ∅ state is drawn as a trap state.
		expect(shown.dfa?.states[result.empty!].trap).toBe(true);
	});

	it('lays out a typed NFA', () => {
		const data = built(req({ from: 'nfa', text: blowupNfaText(2) }));
		expect(data.grid).toBeNull();
		expect(data.layout?.size).toBe(4);
	});

	it('reports a DFA over the limit and keeps the NFA', () => {
		const data = built(req({ re: '(a|b)*a(a|b)^{10}' }));
		expect(data).toMatchObject({ tooLarge: true, result: null, dfaLayout: null, dfaText: null });
		expect(data.nfa.states).toHaveLength(70);
	});

	it('answers none for a source without an NFA', () => {
		expect(viaWorker(req({ re: '(1 | 0' }))).toEqual({ kind: 'none' });
		expect(viaWorker(req({ re: '(a|b)^100' }))).toEqual({ kind: 'none' });
	});

	it('answers same, and sends nothing, when the construction is the one shown', () => {
		const first = built(req({}));
		// Spaces do not change the machine.
		expect(viaWorker(req({ re: '(1|0)* 1', have: first.key }))).toEqual({
			kind: 'same',
			key: first.key
		});
		// Another machine, another naming or the ∅ state shown: a new construction.
		expect(viaWorker(req({ re: '(0 | 1)*1', have: first.key })).kind).toBe('built');
		expect(viaWorker(req({ naming: 'numbered', have: first.key })).kind).toBe('built');
		expect(viaWorker(req({ showEmpty: true, have: first.key })).kind).toBe('built');
		const text = 'start: A\naccept: B\nA 1 A\nA 1 B\n';
		const typed = built(req({ from: 'nfa', text }));
		expect(
			viaWorker(req({ from: 'nfa', text: `# comment\n${text}  \n`, have: typed.key })).kind
		).toBe('same');
	});
});

describe('keys', () => {
	it('ignores what was shown and the source not in use', () => {
		const a = req({ have: 'x', text: 'A 1 B' });
		expect(requestKey(a)).toBe(requestKey(req({ have: null, text: 'other' })));
		expect(requestKey(a)).not.toBe(requestKey(req({ re: '1*' })));
		expect(requestKey(req({ from: 'nfa', text: 'A 1 B', re: 'x' }))).toBe(
			requestKey(req({ from: 'nfa', text: 'A 1 B', re: 'y' }))
		);
		expect(requestKey(a)).not.toBe(requestKey(req({ naming: 'numbered' })));
	});

	it('tells a new naming from new steps', () => {
		const machine = buildNfa(req({})).key!;
		const names: SubsetNaming[] = ['discovery', 'numbered'];
		const [a, b] = names.map((n) => constructionKey(machine, n, false));
		expect(a).not.toBe(b);
		const shown = reviveConstruction(built(req({})), false);
		const renamed = reviveConstruction(built(req({ naming: 'sorted-set' })), false);
		expect(stepsChanged(shown, renamed)).toBe(false);
		expect(stepsChanged(null, shown)).toBe(true);
		expect(stepsChanged(shown, reviveConstruction(built(req({ showEmpty: true })), true))).toBe(
			true
		);
		expect(stepsChanged(shown, reviveConstruction(built(req({ re: '(0 | 1)*1' })), false))).toBe(
			true
		);
	});
});

describe('the stepper after an edit', () => {
	const scored: Prediction = {
		revealed: 9,
		picks: { target: 12, ids: [1, 2] },
		verdict: { target: 9, check: { correct: true, hits: [1], missing: [], extra: [] } },
		score: { right: 2, total: 3 }
	};
	const base = { before: true, anchor: null, prediction: newPrediction() };

	it('changes nothing when the steps are the same', () => {
		expect(
			followEdit({ ...base, stepsChanged: false, index: 4, total: 20, newTotal: 20 })
		).toBeNull();
	});

	it('keeps the end at the end', () => {
		expect(
			followEdit({ ...base, stepsChanged: true, index: 19, total: 20, newTotal: 50 })
		).toMatchObject({
			index: 49,
			anchor: { atEnd: true }
		});
	});

	it('keeps another step, within the new steps', () => {
		expect(
			followEdit({ ...base, stepsChanged: true, index: 7, total: 20, newTotal: 50 })?.index
		).toBe(7);
		expect(
			followEdit({ ...base, stepsChanged: true, index: 7, total: 20, newTotal: 5 })?.index
		).toBe(4);
	});

	it('returns to the step after a shorter construction clamped it', () => {
		const short = followEdit({ ...base, stepsChanged: true, index: 18, total: 20, newTotal: 11 })!;
		expect(short.index).toBe(10);
		// The stepper still shows step 10, the end of the short construction: the anchor holds.
		const anchor = { ...short.anchor, shown: 10 };
		const long = followEdit({
			...base,
			stepsChanged: true,
			index: 10,
			total: 11,
			newTotal: 1544,
			anchor
		});
		expect(long?.index).toBe(18);
		// Once the stepper was moved, its new place counts.
		const moved = followEdit({
			...base,
			stepsChanged: true,
			index: 3,
			total: 11,
			newTotal: 1544,
			anchor
		});
		expect(moved?.index).toBe(3);
	});

	it('goes to the end of the first construction', () => {
		expect(
			followEdit({ ...base, before: false, stepsChanged: true, index: 0, total: 0, newTotal: 20 })
				?.index
		).toBe(19);
	});

	it('keeps revealed steps and the score, and drops picks and the verdict', () => {
		const p = followEdit({
			...base,
			prediction: scored,
			stepsChanged: true,
			index: 9,
			total: 20,
			newTotal: 30
		})!.prediction;
		expect(p).toEqual({ ...newPrediction(9), score: { right: 2, total: 3 } });
	});

	it('anchors a step or the end', () => {
		expect(stepAnchor(19, 20)).toEqual({ index: 19, atEnd: true });
		expect(stepAnchor(3, 20)).toEqual({ index: 3, atEnd: false });
		expect(stepAnchor(0, 0)).toEqual({ index: 0, atEnd: false });
		expect(anchoredStep({ index: 3, atEnd: true }, 8)).toBe(7);
		expect(anchoredStep({ index: 30, atEnd: false }, 8)).toBe(7);
		expect(anchoredStep({ index: 3, atEnd: false }, 0)).toBe(0);
	});
});
