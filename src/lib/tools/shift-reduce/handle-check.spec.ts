import { describe, expect, it } from 'vitest';
import { parseGrammar, type Grammar, type HandleStep } from '$lib/theory/grammar';
import { checkPick, describeVerdict, isRightSentential } from './handle-check';
import { computeParse } from './model';
import { CASCADE } from './presets';
import { SLIDE_GRAMMAR, SLIDE_INPUT } from './state';

/** Bottom-Up Parsing, slides 5–10: the forms from int + (int) + (int) down to E. */
const SLIDE_FORMS: readonly string[][] = [
	['int', '+', '(', 'int', ')', '+', '(', 'int', ')'],
	['E', '+', '(', 'int', ')', '+', '(', 'int', ')'],
	['E', '+', '(', 'E', ')', '+', '(', 'int', ')'],
	['E', '+', '(', 'int', ')'],
	['E', '+', '(', 'E', ')'],
	['E']
];

function grammar(text: string): Grammar {
	const g = parseGrammar(text).grammar;
	if (!g) throw new Error('grammar has errors');
	return g;
}

function handles(text: string, input: string): HandleStep[] {
	const r = computeParse({ grammar: text, input });
	if (r.kind !== 'parse' || !r.handles) throw new Error('no handles');
	return r.handles;
}

/**
 * Every right sentential form of at most `max` symbols, by rightmost
 * derivations whose forms have at most `max + slack` symbols.
 */
function rightForms(g: Grammar, max: number, slack = 0): Set<string> {
	const N = new Set(g.nonterminals);
	const seen = new Set<string>();
	const todo: string[][] = [[g.start]];
	const key = (f: string[]) => f.join(' ');
	seen.add(key([g.start]));
	while (todo.length) {
		const form = todo.pop()!;
		let i = form.length - 1;
		while (i >= 0 && !N.has(form[i])) i--;
		if (i < 0) continue;
		for (const p of g.productions) {
			if (p.lhs !== form[i]) continue;
			const next = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
			if (next.length > max + slack || seen.has(key(next))) continue;
			seen.add(key(next));
			todo.push(next);
		}
	}
	return new Set([...seen].filter((k) => k.split(' ').filter(Boolean).length <= max));
}

/** Every string of the grammar's symbols of 1 … max symbols. */
function* strings(g: Grammar, max: number): Generator<string[]> {
	const symbols = [...g.nonterminals, ...g.terminals];
	let level: string[][] = [[]];
	for (let n = 1; n <= max; n++) {
		level = level.flatMap((s) => symbols.map((x) => [...s, x]));
		yield* level;
	}
}

describe('isRightSentential', () => {
	it.each([
		['E → E + ( E ) | int', 5, 0],
		[CASCADE, 5, 0],
		['S → ε | id S', 4, 1],
		['S → A x | B y\nA → c A | c\nB → c', 4, 0],
		['S → a B\nB → b\nA → a', 3, 0]
	])('agrees with the rightmost derivations of %s', (text, max, slack) => {
		const g = grammar(text);
		const forms = rightForms(g, max, slack);
		for (const s of strings(g, max)) {
			const k = s.join(' ');
			expect(isRightSentential(g, s), k).toBe(forms.has(k));
		}
	});

	it('takes the start symbol alone and the empty sentence', () => {
		expect(isRightSentential(grammar('E → int'), ['E'])).toBe(true);
		expect(isRightSentential(grammar('S → ε | id S'), [])).toBe(true);
		expect(isRightSentential(grammar('S → id'), [])).toBe(false);
	});

	it('knows the forms of slides 5–10', () => {
		const g = grammar(SLIDE_GRAMMAR);
		for (const form of SLIDE_FORMS) expect(isRightSentential(g, form)).toBe(true);
		// Reducing the second int first gives a form no rightmost derivation has.
		expect(isRightSentential(g, ['int', '+', '(', 'E', ')', '+', '(', 'int', ')'])).toBe(false);
	});
});

describe('checkPick', () => {
	const g = grammar(SLIDE_GRAMMAR);
	const steps = handles(SLIDE_GRAMMAR, SLIDE_INPUT);
	// E + (E) + (int): the handle is E + (E).
	const step = steps[2];

	it('confirms the handle of the parse', () => {
		expect(step.handle).toEqual({ start: 0, end: 5 });
		expect(checkPick(g, step, { start: 0, end: 5 })).toEqual({ kind: 'handle', production: 0 });
		const text = describeVerdict(
			g,
			step,
			{ start: 0, end: 5 },
			checkPick(g, step, { start: 0, end: 5 })
		);
		expect(text).toEqual({
			correct: true,
			title: 'This is the handle.',
			text: 'E → E + (E), and E + (int) → E + (E) + (int) is a step of a rightmost derivation from E. Right of the handle, γ = + (int) is all terminals.'
		});
	});

	it('says when the symbols are no right-hand side', () => {
		expect(checkPick(g, step, { start: 3, end: 4 })).toEqual({ kind: 'not-rhs' });
		expect(checkPick(g, step, { start: 0, end: 3 })).toEqual({ kind: 'not-rhs' });
		expect(describeVerdict(g, step, { start: 0, end: 3 }, { kind: 'not-rhs' }).text).toBe(
			'No production A → β has β = E + (.'
		);
	});

	it('says when the handle is further left', () => {
		const pick = { start: 7, end: 8 };
		const verdict = checkPick(g, step, pick);
		expect(verdict).toEqual({
			kind: 'further-left',
			productions: [1],
			forms: [['E', '+', '(', 'E', ')', '+', '(', 'E', ')']],
			alsoHandle: []
		});
		expect(describeVerdict(g, step, pick, verdict)).toEqual({
			correct: false,
			title: 'There is a handle further left.',
			text: 'Reducing int by E → int gives E + (E) + (E), which is not a sentential form of a rightmost derivation from E. The handle starts further left.'
		});
	});

	it('says when a non-terminal is right of the symbols', () => {
		const h = grammar('S → a B\nB → b\nA → a');
		const step: HandleStep = { form: ['a', 'B'], handle: { start: 0, end: 2 }, production: 0 };
		const verdict = checkPick(h, step, { start: 0, end: 1 });
		expect(verdict).toEqual({ kind: 'nonterminal-right', productions: [2], symbol: 'B', index: 1 });
		expect(describeVerdict(h, step, { start: 0, end: 1 }, verdict).title).toBe(
			'A non-terminal is right of it.'
		);
	});

	it('says when the reduction gives no form of a rightmost derivation', () => {
		const h = grammar('S → a B\nB → b\nA → a');
		const step: HandleStep = { form: ['a', 'b'], handle: { start: 1, end: 2 }, production: 1 };
		expect(checkPick(h, step, { start: 0, end: 1 })).toEqual({
			kind: 'not-rightmost',
			productions: [2],
			forms: [['A', 'b']]
		});
		// E + T * int under the cascade: the handle is T * int, not T.
		const c = grammar(CASCADE);
		const cascade = handles(CASCADE, 'int + int * int');
		const at = cascade.find((s) => s.form.join(' ') === 'E + T * int')!;
		expect(at.handle).toEqual({ start: 2, end: 5 });
		const verdict = checkPick(c, at, { start: 2, end: 3 });
		expect(verdict).toEqual({
			kind: 'not-rightmost',
			productions: [1],
			forms: [['E', '+', 'E', '*', 'int']]
		});
		expect(describeVerdict(c, at, { start: 2, end: 3 }, verdict).text).toBe(
			'Reducing T by E → T gives E + E * int, which is not a sentential form of any rightmost derivation from E.'
		);
	});

	it('finds the handles of another parse of an ambiguous grammar', () => {
		const a = grammar('E → E + E | int');
		const steps = handles('E → E + E | int', 'int + int + int');
		// The table shifts on +, so the parse reduces the last int of E + E + int first.
		const at = steps.find((s) => s.form.join(' ') === 'E + E + int')!;
		expect(at.handle).toEqual({ start: 4, end: 5 });
		const verdict = checkPick(a, at, { start: 0, end: 3 });
		expect(verdict).toEqual({ kind: 'other-handle', productions: [0], forms: [['E', '+', 'int']] });
		expect(describeVerdict(a, at, { start: 0, end: 3 }, verdict).title).toBe(
			'A handle of another parse.'
		);
		// The first of two handles is the one reduced.
		const both: HandleStep = {
			form: ['E', '+', 'E', '+', 'E'],
			handle: { start: 0, end: 3 },
			production: 0
		};
		const right = checkPick(a, both, { start: 2, end: 5 });
		expect(right).toMatchObject({ kind: 'further-left', alsoHandle: [0] });
		expect(describeVerdict(a, both, { start: 2, end: 5 }, right).text).toContain(
			'The first handle of the form is the one reduced'
		);
	});

	it('checks an empty handle', () => {
		const e = grammar('S → ε | id S');
		const steps = handles('S → ε | id S', 'id id');
		expect(steps[0]).toMatchObject({ form: ['id', 'id'], handle: { start: 2, end: 2 } });
		expect(checkPick(e, steps[0], { start: 2, end: 2 })).toEqual({ kind: 'handle', production: 0 });
		expect(checkPick(e, steps[0], { start: 0, end: 0 })).toMatchObject({ kind: 'not-rightmost' });
		const text = describeVerdict(
			e,
			steps[0],
			{ start: 2, end: 2 },
			{ kind: 'handle', production: 0 }
		);
		expect(text.text).toBe(
			'S → ε, and id id S → id id is a step of a rightmost derivation from S. γ is empty.'
		);
	});
});
