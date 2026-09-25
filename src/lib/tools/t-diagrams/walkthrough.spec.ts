import { describe, expect, it } from 'vitest';
import { formatT, piecesText } from './model';
import {
	BOOTSTRAP_FACTS,
	bootstrapFigure,
	bootstrapRows,
	bootstrapSteps,
	COMPILER_IN_SUBSET,
	QUICK_COMPILER,
	WANT
} from './walkthrough';

describe('bootstrapRows (Intro (cont’d), slide 8)', () => {
	const [one, two] = bootstrapRows();

	it('has the slide’s givens', () => {
		expect(formatT(WANT)).toBe('T(L → M / M)');
		expect(formatT(COMPILER_IN_SUBSET)).toBe('T(L → M / L′)');
		expect(formatT(QUICK_COMPILER)).toBe('T(L′ → M′ / M)');
		expect(BOOTSTRAP_FACTS.subsets).toEqual([{ sub: 'L′', sup: 'L' }]);
		expect(BOOTSTRAP_FACTS.runnable).toEqual(['M', 'M′']);
	});

	it('step 1): T(L → M / L′) with T(L′ → M′ / M) = T(L → M / M′)', () => {
		expect(one.label).toBe('1)');
		expect(formatT(one.program)).toBe('T(L → M / L′)');
		expect(formatT(one.translator)).toBe('T(L′ → M′ / M)');
		expect(one.composition.legal).toBe(true);
		expect(formatT(one.result)).toBe('T(L → M / M′)');
	});

	it('step 2): T(L → M / L′) with T(L → M / M′) = T(L → M / M), using L′ ⊆ L', () => {
		expect(two.label).toBe('2)');
		expect(formatT(two.program)).toBe('T(L → M / L′)');
		expect(formatT(two.translator)).toBe('T(L → M / M′)');
		expect(two.composition.legal).toBe(true);
		expect(formatT(two.result)).toBe(formatT(WANT));
		const reads = two.composition.checks.find((c) => c.rule === 'reads')!;
		expect(piecesText(reads.pieces)).toContain('L′ ⊆ L');
	});
});

describe('bootstrapSteps', () => {
	const steps = bootstrapSteps();

	it('shows the goal, then each row’s pair and its result', () => {
		expect(steps.map((s) => s.rows)).toEqual([
			['hidden', 'hidden'],
			['pair', 'hidden'],
			['result', 'hidden'],
			['result', 'pair'],
			['result', 'result']
		]);
		expect(steps.map((s) => s.focus)).toEqual([
			null,
			{ row: 0, part: 'meet' },
			{ row: 0, part: 'result' },
			{ row: 1, part: 'meet' },
			{ row: 1, part: 'result' }
		]);
	});

	it('reaches the goal only at the last step', () => {
		expect(steps.map((s) => s.goalMet)).toEqual([false, false, false, false, true]);
	});

	it('words each step with the slide’s terms', () => {
		const text = steps.map((s) => piecesText(s.pieces));
		expect(text[0]).toContain('T(L → M / M)');
		expect(text[0]).toContain('tough');
		expect(text[1]).toMatch(/^1\) /);
		expect(text[1]).toContain('simple subset');
		expect(text[1]).toContain('inefficient M-code');
		expect(text[2]).toMatch(/^= T\(L → M \/ M′\)/);
		expect(text[3]).toMatch(/^2\) /);
		expect(text[3]).toContain('L′ ⊆ L');
		expect(text[4]).toMatch(/^= T\(L → M \/ M\)/);
	});
});

describe('bootstrapFigure', () => {
	const fig = bootstrapFigure();

	it('lines the goal up with the results column', () => {
		for (const row of fig.rows) expect(row.layout.result!.x).toBe(fig.goal.pos.x);
		expect(fig.rows[0].layout.equals!.x).toBe(fig.rows[1].layout.equals!.x);
	});

	it('stacks the rows below the goal without overlap', () => {
		const [a, b] = fig.rows;
		expect(a.layout.program.y).toBeGreaterThanOrEqual(fig.goal.geom.height);
		expect(b.layout.program.y).toBeGreaterThanOrEqual(a.layout.program.y + a.layout.height);
		expect(fig.height).toBe(b.layout.program.y + b.layout.height);
	});

	it('snaps each program onto its translator', () => {
		for (const row of fig.rows) {
			const p = row.geoms.program;
			expect(row.layout.translator.x - row.layout.program.x).toBe(p.stemX + p.stemW);
			expect(row.layout.translator.y - row.layout.program.y).toBe(p.unit);
		}
	});

	it('keeps the "Want this" arrow between the text and the goal', () => {
		expect(fig.arrow.x1).toBeGreaterThan(0);
		expect(fig.arrow.x2).toBeLessThan(fig.goal.pos.x);
		expect(fig.arrow.x2 - fig.arrow.x1).toBeGreaterThan(40);
		expect(fig.width).toBeGreaterThanOrEqual(fig.goal.pos.x + fig.goal.geom.width);
	});

	it('writes the slide’s prose on either side of the goal', () => {
		expect(fig.given.lines).toEqual(['Given machine M', 'and language L']);
		expect(fig.tough.lines).toEqual(['But tough', 'directly!']);
		expect(fig.tough.y).toBe(fig.given.y);
		// Right of the goal, clear of the check mark on its top-right corner…
		expect(fig.tough.x).toBeGreaterThan(fig.goal.pos.x + fig.goal.geom.width + 10);
		// …and inside the figure.
		const longest = Math.max(...fig.tough.lines.map((l) => l.length));
		expect(fig.width).toBeGreaterThanOrEqual(fig.tough.x + longest * 16 * 0.5);
	});
});
