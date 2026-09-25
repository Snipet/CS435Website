import { describe, expect, it } from 'vitest';
import { buildConstruction, type Construction } from './construction';
import { presets } from './presets';
import {
	ELIDED,
	atomFigure,
	chainFigure,
	plusFigure,
	repeatExpansion,
	ruleCard,
	starFigure,
	unionFigure,
	type RuleFigure
} from './rules';

function build(re: string, defs = ''): Construction {
	const o = buildConstruction(re, defs);
	if (o.status !== 'ok') throw new Error(o.status);
	return o.construction;
}

/** Every shape, path point and label lies inside the view box. */
function expectInside(f: RuleFigure) {
	const { x, y, width, height } = f.viewBox;
	const inside = (px: number, py: number) => {
		expect(px).toBeGreaterThanOrEqual(x);
		expect(px).toBeLessThanOrEqual(x + width);
		expect(py).toBeGreaterThanOrEqual(y);
		expect(py).toBeLessThanOrEqual(y + height);
	};
	for (const s of f.states) {
		inside(s.x - s.r, s.y - s.r);
		inside(s.x + s.r, s.y + s.r);
	}
	for (const b of f.boxes) {
		inside(b.cx - b.rx, b.cy - b.ry);
		inside(b.cx + b.rx, b.cy + b.ry);
	}
	for (const e of f.edges) {
		for (const m of e.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) inside(Number(m[1]), Number(m[2]));
		if (e.lx !== undefined && e.ly !== undefined) inside(e.lx, e.ly);
	}
	expect(width).toBeGreaterThan(0);
	expect(height).toBeGreaterThan(0);
}

describe('rule cards for (1 | 0)*1', () => {
	const c = build('(1 | 0)*1');
	const cards = c.result.steps.map((_, i) => ruleCard(c, i));

	it('name the rule each step applies', () => {
		expect(cards.map((r) => r.formula)).toEqual(['a ∈ Σ', 'a ∈ Σ', 'A | B', 'A*', 'a ∈ Σ', 'A B']);
		expect(cards.map((r) => r.cite)).toEqual([
			{ deck: '08', slide: 3 },
			{ deck: '08', slide: 3 },
			{ deck: '08', slide: 4 },
			{ deck: '08', slide: 5 },
			{ deck: '08', slide: 3 },
			{ deck: '08', slide: 4 }
		]);
	});

	it('say what the letters stand for', () => {
		expect(
			cards.map((r) =>
				r.bindings.map((b) => (b === ELIDED ? b : `${b.name} = ${b.text}`)).join(', ')
			)
		).toEqual(['a = 1', 'a = 0', 'A = 1, B = 0', 'A = (1 | 0)', 'a = 1', 'A = (1 | 0)*, B = 1']);
	});

	it('list the transitions each rule adds', () => {
		expect(cards[2].adds).toEqual([
			['s', 'ε', 'A.start'],
			['s', 'ε', 'B.start'],
			['A.final', 'ε', 'f'],
			['B.final', 'ε', 'f']
		]);
		expect(cards[5].adds).toEqual([['A.final', 'ε', 'B.start']]);
		expect(cards[5].fresh).toEqual([]);
	});
});

describe('rule figures', () => {
	it('draw the base cases as s → f', () => {
		const eps = atomFigure('ε', 'eps');
		expect(eps.states.map((s) => s.accepting)).toEqual([false, true]);
		expect(eps.edges.map((e) => e.kind)).toEqual(['start', 'eps']);
		const phi = atomFigure(null);
		expect(phi.edges.map((e) => e.kind)).toEqual(['start']);
		expectInside(eps);
		expectInside(atomFigure('A–Z,a–z'));
	});

	it('draw A | B with a new start and final around stacked operands', () => {
		const f = unionFigure('A', 'B');
		expect(f.states).toHaveLength(2);
		expect(f.boxes.map((b) => b.label)).toEqual(['A', 'B']);
		expect(f.boxes[0].cy).toBeLessThan(f.boxes[1].cy);
		expect(f.boxes.every((b) => !b.final.accepting)).toBe(true);
		expect(f.states[1].accepting).toBe(true);
		expect(f.edges.filter((e) => e.kind === 'eps')).toHaveLength(4);
		expectInside(f);
	});

	it('draw A* with the back edge over the top and s → f underneath', () => {
		const f = starFigure('A');
		const [, back, skip] = f.edges.filter((e) => e.kind === 'eps');
		expect(back.ly!).toBeLessThan(f.boxes[0].cy - f.boxes[0].ry);
		expect(skip.ly!).toBeGreaterThan(f.boxes[0].cy + f.boxes[0].ry);
		expect(f.states.map((s) => s.accepting)).toEqual([false, true]);
		expectInside(f);
	});

	it('draw concatenation as a row, eliding long rows', () => {
		const ab = chainFigure(['A', 'B']);
		expect(ab.boxes.map((b) => b.final.accepting)).toEqual([false, true]);
		expect(ab.edges.map((e) => e.kind)).toEqual(['start', 'eps']);
		const long = chainFigure(['A', 'B', '…', 'F']);
		expect(long.boxes).toHaveLength(3);
		expect(long.texts.map((t) => t.text)).toEqual(['…']);
		expectInside(long);
		expectInside(plusFigure());
	});

	it('fit every step of every preset', () => {
		for (const p of presets) {
			const c = build(p.value.re, p.value.defs ?? '');
			c.result.steps.forEach((_, i) => expectInside(ruleCard(c, i).figure));
		}
	});
});

describe('derived forms and other clauses', () => {
	const card = (re: string, i: number, defs = '') => ruleCard(build(re, defs), i);

	it('show the expansion', () => {
		expect(card('a+', 1).formula).toBe('A+ = A A*');
		expect(card('a?', 1).formula).toBe('A? = A | ε');
		expect(card('a^3', 1).formula).toBe('A³ = A A A');
		expect(card('a^1', 1).formula).toBe('A¹ = A');
		expect(card('a^{1,3}', 1).formula).toBe('A{1,3} = A A? A?');
		expect(card('a^{2,}', 1).formula).toBe('A{2,} = A A A*');
		expect(card('a^0', 0).formula).toBe('A⁰ = ε');
		expect(card('a^0', 0).bindings).toEqual([{ name: 'A', text: 'a' }]);
		expect(card('a^6', 1).figure.texts.map((t) => t.text)).toEqual(['…']);
		expect(card('a+', 1).cite).toBeUndefined();
	});

	it('draw classes and Σ as one labeled transition', () => {
		const cls = card('[a-z]', 0);
		expect(cls.formula).toBe('[a-z]');
		expect(cls.mono).toBe(true);
		expect(cls.adds).toEqual([['s', 'a–z', 'f']]);
		expect(cls.figure.edges.find((e) => e.kind === 'sym')?.label).toBe('a–z');
		const sigma = card('0 1 Σ', 2);
		expect(sigma.formula).toBe('Σ');
		expect(sigma.bindings).toEqual([{ name: 'Σ', text: '{ 0, 1 }' }]);
	});

	it('handle ɸ, longer choices and definitions', () => {
		expect(card('ɸ', 0).adds).toEqual([]);
		const three = card('a | b | c', 3);
		expect(three.formula).toBe('A | B | C');
		expect(three.figure.boxes.map((b) => b.label)).toEqual(['A | B', 'C']);
		expect(three.bindings.map((b) => (b === ELIDED ? b : b.text))).toEqual(['a', 'b', 'c']);
		const ref = card('digit', 1, "digit = '0' | … | '9'");
		expect(ref.formula).toBe('digit');
		expect(ref.bindings).toEqual([{ name: 'digit', text: "'0' | … | '9'" }]);
	});
});

describe('long rules stay short', () => {
	const last = (re: string) => {
		const c = build(re);
		return ruleCard(c, c.result.steps.length - 1);
	};
	const bindingText = (m: ReturnType<typeof last>) =>
		m.bindings.map((b) => (b === ELIDED ? b : `${b.name} = ${b.text}`)).join(', ');

	it('write out up to five operands and elide longer rows', () => {
		expect(last('a b c d e').formula).toBe('A B C D E');
		expect(last('a b c d e f').formula).toBe('A B … F');
		expect(last('a | b | c | d | e').formula).toBe('A | B | C | D | E');
		const hex = last(
			"'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f'"
		);
		expect(hex.formula).toBe('A | B | … | P');
		expect(bindingText(hex)).toBe("A = '0', B = '1', …, P = 'f'");
	});

	it('elide the moves of a long concatenation', () => {
		const m = last('a b c d e f g');
		expect(m.adds).toEqual([
			['A.final', 'ε', 'B.start'],
			['B.final', 'ε', 'C.start'],
			ELIDED,
			['F.final', 'ε', 'G.start']
		]);
		expect(bindingText(m)).toBe('A = a, B = b, …, G = g');
	});

	it('name operands after Z as AA, AB, … (letterName)', () => {
		const m = last('0110100111010011011101001110');
		expect(m.formula).toBe('A B … AB');
		expect(bindingText(m)).toBe('A = 0, B = 1, …, AB = 0');
		expect(m.adds.at(-1)).toEqual(['AA.final', 'ε', 'AB.start']);
		expect(m.formula).not.toMatch(/\d/);
	});

	it('write long repeats with powers', () => {
		expect(repeatExpansion(5, 5)).toBe('A A A A A');
		expect(repeatExpansion(12, 12)).toBe('A A … A');
		expect(repeatExpansion(12, 20)).toBe('A¹² (A?)⁸');
		expect(repeatExpansion(0, 24)).toBe('(A?)²⁴');
		expect(repeatExpansion(2, 6)).toBe('A A (A?)⁴');
		expect(repeatExpansion(5, null)).toBe('A⁵ A*');
		expect(repeatExpansion(1, 6)).toBe('A (A?)⁵');
		expect(last('a^{12,20}').formula).toBe('A{12,20} = A¹² (A?)⁸');
		expect(last('a^12').formula).toBe('A¹² = A A … A');
	});

	it('shorten long sub-expressions in the bindings', () => {
		const m = last("('0' | '1' | '2' | '3' | '4' | '5' | '6' | '7')* x");
		const [a] = m.bindings;
		expect(a).not.toBe(ELIDED);
		if (a === ELIDED) return;
		expect(a.name).toBe('A');
		expect([...a.text]).toHaveLength(24);
		expect(a.text.endsWith('…')).toBe(true);
	});

	it('keep every formula of a long expression within a few dozen characters', () => {
		for (const re of [
			'a^{12,20}',
			'(a|b)^{0,24}',
			'0110100111010011011101001110',
			"'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f'"
		]) {
			const c = build(re);
			c.result.steps.forEach((_, i) => {
				const m = ruleCard(c, i);
				expect([...m.formula].length).toBeLessThanOrEqual(24);
				for (const b of m.bindings)
					if (b !== ELIDED) expect([...b.text].length).toBeLessThanOrEqual(24);
				expect(m.adds.length).toBeLessThanOrEqual(5);
			});
		}
	});
});
