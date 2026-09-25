import { describe, expect, it } from 'vitest';
import { parseTM } from './parse';
import { RUN_BUDGET, Trace } from './trace';
import { run, viewAt } from './view';

describe('run budget', () => {
	it('runs a full budget of a loop and rebuilds a late view quickly', () => {
		const tr = new Trace(parseTM('0: ADD 1,1,2\n1: ST 1,5(0)\n2: LDA 7,-3(7)').program, []);
		const start = performance.now();
		const r = run(tr, 0, 'instruction');
		const view = viewAt(tr, r.t - 1, 'phase');
		const ms = performance.now() - start;
		expect(r).toEqual({ t: 3 * RUN_BUDGET, budgetSpent: true });
		expect(view.executed).toBe(RUN_BUDGET - 1);
		// Generous bound: the page runs this on a click.
		expect(ms).toBeLessThan(1500);
	});
});
