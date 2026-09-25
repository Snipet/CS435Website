import { describe, expect, it } from 'vitest';
import { accepts, parseAutomatonText } from '$lib/theory/automata';
import { CharSet } from '$lib/theory/charset';
import { nodeAtPath, regexEquals } from '$lib/theory/regex';
import { analyzeExpression, evaluateTest, type ExpressionInput } from './analysis';
import { flattenBrackets, brackets } from './derive';
import { languageBlocked, analysisFailed, TOO_SLOW } from './messages';
import {
	computeViews,
	derivationFromPlain,
	languageNote,
	sameExpression,
	selectedSample,
	testFromPlain,
	testRows,
	testToPlain,
	viewsComputer,
	type ViewsRequest
} from './views';

const request = (over: Partial<ViewsRequest>): ViewsRequest => ({
	re: '',
	defs: '',
	dialect: 'lecture',
	alphabet: '',
	compare: '',
	tests: [],
	maxLength: 6,
	node: [],
	...over
});

/** The views as the page gets them: copied from the worker. */
const viaWorker = (req: ViewsRequest) => structuredClone(computeViews(req));

describe('computeViews', () => {
	it('lists L(R), with the minimal DFA for the link', () => {
		const data = viaWorker(request({ re: '(1 | 0)*1' }));
		if (!data.language?.ok) throw new Error('not built');
		expect(data.language.states).toBe(2);
		expect(data.language.listing.strings.slice(0, 4)).toEqual(['1', '01', '11', '001']);
		expect(data.language.listing.counts[3]).toBe(4n);
		const dfa = parseAutomatonText(data.language.automataText).automaton!;
		expect(accepts(dfa, '0101')).toBe(true);
		expect(accepts(dfa, '10')).toBe(false);
	});

	it('reports a language too large to build', () => {
		const data = viaWorker(request({ re: '(0|1)* 1 (0|1)^15', tests: ['1'] }));
		expect(data.language).toMatchObject({ ok: false, stage: 'dfa' });
		expect(data.tests).toEqual([null]);
		expect(languageBlocked('x', { ...analyzeExpression(request({ re: 'x' })), ...data })).toMatch(
			/more than 300 states/
		);
	});

	it('builds nothing when R or Σ has problems', () => {
		expect(viaWorker(request({ re: '(', tests: ['a'], compare: 'a' }))).toEqual({
			language: null,
			tests: [null],
			compare: { language: null, comparison: null, tooLarge: false },
			sample: null
		});
		expect(viaWorker(request({ re: 'Σ' })).language).toBeNull();
	});

	it('answers each test string like evaluateTest', () => {
		const input: ExpressionInput = {
			re: '1*0',
			defs: '',
			dialect: 'lecture',
			alphabet: '{ 0, 1 }'
		};
		const tests = ['110', '1x0', '11', ''];
		const data = viaWorker(request({ ...input, tests }));
		const a = analyzeExpression(input);
		tests.forEach((s, i) => {
			const back = testFromPlain(data.tests[i]!, a.resolved);
			expect(back).toEqual(evaluateTest(a, s));
		});
		const fails = testFromPlain(data.tests[1]!, a.resolved);
		expect(fails.outside).toBeInstanceOf(CharSet);
		expect(fails.rejection?.kind === 'fails' && fails.rejection.allowed.has('0')).toBe(true);
	});

	it('compares with R₂', () => {
		const data = viaWorker(request({ re: 'a*', compare: 'a a*' }));
		expect(data.compare).toMatchObject({
			language: { ok: true },
			tooLarge: false,
			comparison: { equivalent: false, onlyA: '', onlyB: null }
		});
		expect(viaWorker(request({ re: 'a*' })).compare).toBeNull();
		expect(viaWorker(request({ re: "('a'^50)*", compare: "('a'^41)*" })).compare).toMatchObject({
			comparison: null,
			tooLarge: true
		});
	});

	it('lists strings of the selected node', () => {
		const data = viaWorker(request({ re: "'1' '0'*", node: [1] }));
		expect(data.sample).toEqual({
			ok: true,
			strings: ['', '0', '00', '000', '0000', '00000', '000000', '0000000', '00000000'],
			truncated: true
		});
		expect(viaWorker(request({ re: "'1' '0'*", node: [5] })).sample).toBeNull();
	});
});

describe('viewsComputer', () => {
	it('reuses the automata while only the other inputs change', () => {
		const compute = viewsComputer();
		const first = compute(request({ re: '(a|b)*a(a|b)', tests: ['ab'] }));
		const second = compute(request({ re: '(a|b)*a(a|b)', tests: ['ab', 'ba'], node: [0] }));
		expect(second.language).toEqual(first.language);
		// The same listing object: nothing was rebuilt.
		expect(first.language?.ok && second.language?.ok).toBe(true);
		if (first.language?.ok && second.language?.ok)
			expect(second.language.listing).toBe(first.language.listing);
		expect(second.tests[0]).toBe(first.tests[0]);
		const third = compute(request({ re: '(a|b)*b', tests: ['ab'] }));
		expect(third.tests[0]?.member).toBe(true);
		expect(third.language?.ok && third.language.states).toBe(2);
	});
});

describe('test results as plain data', () => {
	const input: ExpressionInput = {
		re: 'letter (letter | digit)*',
		defs: "letter = 'a' | 'b'\ndigit = '0' | '1'",
		dialect: 'lecture',
		alphabet: ''
	};

	it('round-trips a derivation, with its nodes looked up by path', () => {
		const a = analyzeExpression(input);
		const r = evaluateTest(a, 'ab01')!;
		const plain = structuredClone(testToPlain(r));
		expect(JSON.stringify(plain)).not.toContain('"kind"');
		// Nodes come from the page's own parse of the same text.
		const page = analyzeExpression(input, { build: false });
		const back = testFromPlain(plain, page.resolved);
		if (back.derivation?.status !== 'match' || r.derivation?.status !== 'match')
			throw new Error('no derivation');
		const got = flattenBrackets(brackets(back.derivation.tree));
		const want = flattenBrackets(brackets(r.derivation.tree));
		expect(got.map((b) => [b.start, b.end])).toEqual(want.map((b) => [b.start, b.end]));
		for (const [i, b] of got.entries()) {
			expect(b.derivation.node).toBe(nodeAtPath(page.resolved!, b.derivation.path));
			expect(regexEquals(b.derivation.node, want[i].derivation.node)).toBe(true);
		}
	});

	it('drops a derivation whose paths do not fit the tree', () => {
		const a = analyzeExpression(input);
		const r = evaluateTest(a, 'a')!;
		const other = analyzeExpression({ ...input, re: "'a'" }, { build: false });
		expect(testFromPlain(testToPlain(r), other.resolved).derivation).toBeNull();
		expect(testFromPlain(testToPlain(r), null).derivation).toBeNull();
		expect(
			derivationFromPlain({ path: [9], start: 0, end: 0, children: [] }, other.resolved!)
		).toBe(null);
	});
});

describe('testRows', () => {
	const input: ExpressionInput = { re: 'a*', defs: '', dialect: 'lecture', alphabet: '' };
	const parse = analyzeExpression(input, { build: false });
	const req = request({ ...input, tests: ['aa', 'b', 'a'] });
	const done = { input: req, data: viaWorker(req) };

	it('shows each row its own result', () => {
		const rows = testRows(['aa', 'b', 'a'], done, parse.resolved, true);
		expect(rows.map((r) => [r?.text, r?.result.member, r?.stale])).toEqual([
			['aa', true, false],
			['b', false, false],
			['a', true, false]
		]);
	});

	it('finds a string that moved to another row', () => {
		const rows = testRows(['b', 'a'], done, parse.resolved, true);
		expect(rows.map((r) => [r?.text, r?.stale])).toEqual([
			['b', false],
			['a', false]
		]);
	});

	it('keeps an edited row on its old result, marked stale, and has nothing for a new row', () => {
		const rows = testRows(['aab', 'b', 'a', 'x'], done, parse.resolved, true);
		expect(rows[0]).toMatchObject({ text: 'aa', stale: true });
		expect(rows[3]).toBeNull();
	});

	it('marks every row stale when R has changed', () => {
		const rows = testRows(['aa'], done, parse.resolved, false);
		expect(rows[0]).toMatchObject({ text: 'aa', stale: true });
		expect(testRows(['aa'], null, null, false)).toEqual([null]);
	});
});

describe('selectedSample', () => {
	/** The views for `req` as the page holds them, with the tree they refer to. */
	function views(over: Partial<ViewsRequest>) {
		const req = request(over);
		const parse = analyzeExpression(req, { build: false });
		return {
			done: { input: req, data: viaWorker(req) },
			tree: { root: parse.re.regex, print: { ...parse.print, parens: 'minimal' as const } }
		};
	}

	it("shows the selected node's strings for the R they were computed for", () => {
		const { done, tree } = views({ re: 'aa|bb', node: [1] });
		expect(selectedSample(done, [1], true, tree, tree)).toMatchObject({ strings: ['bb'] });
		// Another node of the same R: nothing until its strings are computed.
		expect(selectedSample(done, [0], true, tree, tree)).toBeNull();
		expect(selectedSample(null, [1], true, tree, tree)).toBeNull();
	});

	it('shows nothing for another node at the same path after R changes', () => {
		const then = views({ re: 'aa|bb', node: [1] });
		const now = views({ re: 'aa|cc', node: [1] });
		// L('c' 'c') = { "bb" } would be false: wait for the new strings.
		expect(selectedSample(then.done, [1], false, now.tree, then.tree)).toBeNull();
	});

	it('keeps the strings of a node written the same way while R changes elsewhere', () => {
		const then = views({ re: 'aa|bb', node: [1] });
		const now = views({ re: 'ab|bb', node: [1] });
		expect(selectedSample(then.done, [1], false, now.tree, then.tree)).toMatchObject({
			strings: ['bb']
		});
	});

	it('shows nothing when the path no longer leads to a node', () => {
		const then = views({ re: 'aa|bb', node: [1] });
		const now = views({ re: 'aa', node: [] });
		expect(selectedSample(then.done, [1], false, now.tree, then.tree)).toBeNull();
		const broken = { root: null, print: now.tree.print };
		expect(selectedSample(then.done, [1], false, broken, then.tree)).toBeNull();
	});
});

describe('languageNote', () => {
	const tooLarge = viaWorker(request({ re: '(a|b)*a(a|b)^{16}' })).language;

	it('prefers a problem in R or Σ as typed, which is never stale', () => {
		expect(languageNote('Fix Σ first.', tooLarge, false)).toEqual({
			text: 'Fix Σ first.',
			stale: false
		});
	});

	it('marks the size of an earlier R as stale', () => {
		expect(tooLarge?.ok).toBe(false);
		const now = languageNote(null, tooLarge, true);
		expect(now).toEqual({ text: expect.stringMatching(/more than 300 states/), stale: false });
		expect(languageNote(null, tooLarge, false)).toEqual({ text: now!.text, stale: true });
	});

	it('has nothing to say when L(R) was built or is not known yet', () => {
		const built = viaWorker(request({ re: 'a*' })).language;
		expect(languageNote(null, built, false)).toBeNull();
		expect(languageNote(null, null, false)).toBeNull();
	});
});

describe('helpers', () => {
	it('compares the inputs L(R) depends on', () => {
		const a = request({ re: 'a', tests: ['x'] });
		expect(sameExpression(a, request({ re: 'a', compare: 'b' }))).toBe(true);
		expect(sameExpression(a, request({ re: 'a', alphabet: '{ a }' }))).toBe(false);
		expect(sameExpression(a, request({ re: 'a', dialect: 'flex' }))).toBe(false);
	});

	it('says why the views are missing after a time-out or an error', () => {
		expect(analysisFailed('timed-out', null)).toBe(TOO_SLOW);
		expect(analysisFailed('error', 'oops')).toBe('This expression could not be analyzed (oops).');
		expect(analysisFailed('working', null)).toBeNull();
		expect(analysisFailed('idle', null)).toBeNull();
	});

	it('reports problems in R and Σ without a language', () => {
		const a = analyzeExpression(request({ re: 'Σ' }), { build: false });
		expect(languageBlocked('Σ', { ...a, language: null })).toBe('Fix Σ first.');
		const b = analyzeExpression(request({ re: 'a' }), { build: false });
		expect(languageBlocked('a', { ...b, language: null })).toBeNull();
		expect(languageBlocked('a', { ...b, language: { ok: true } })).toBeNull();
	});
});
