import { describe, expect, it } from 'vitest';
import {
	addEnd,
	archLayout,
	counts,
	MAX_END_NAME,
	MAX_ENDS,
	sanitizeEnds,
	SLIDE_LANGUAGES,
	SLIDE_TARGETS
} from './architecture';

describe('slide 6', () => {
	it('has three frontends and three backends', () => {
		expect(SLIDE_LANGUAGES).toEqual(['C', 'Fortran', 'Ada']);
		expect(SLIDE_TARGETS).toEqual(['X86', 'PowerPC', 'ARM']);
	});
});

describe('counts', () => {
	it('compares m × n compilers with m + 1 + n components', () => {
		expect(counts(3, 3)).toEqual({ separate: 9, components: 7 });
		expect(counts(1, 1)).toEqual({ separate: 1, components: 3 });
		expect(counts(8, 8)).toEqual({ separate: 64, components: 17 });
	});
});

describe('addEnd', () => {
	it('adds a trimmed name', () => {
		expect(addEnd(['C'], '  Rust ')).toEqual({ ok: true, list: ['C', 'Rust'] });
	});

	it('refuses blanks, repeats (any case), long names, and a full list', () => {
		expect(addEnd(['C'], '  ')).toEqual({ ok: false, error: 'Type a name first.' });
		expect(addEnd(['Fortran'], 'fortran')).toEqual({
			ok: false,
			error: 'fortran is already listed.'
		});
		expect(addEnd([], 'x'.repeat(MAX_END_NAME + 1)).ok).toBe(false);
		const full = Array.from({ length: MAX_ENDS }, (_, i) => `L${i}`);
		expect(addEnd(full, 'More')).toEqual({ ok: false, error: `Up to ${MAX_ENDS} can be listed.` });
	});
});

describe('sanitizeEnds', () => {
	it('cleans saved lists and falls back when nothing is left', () => {
		expect(sanitizeEnds([' C ', 'c', '', 3, 'Go'], ['X'])).toEqual(['C', 'Go']);
		expect(sanitizeEnds('C', ['X'])).toEqual(['X']);
		expect(sanitizeEnds([], ['X'])).toEqual(['X']);
		expect(sanitizeEnds(['x'.repeat(40)], ['X'])).toEqual(['x'.repeat(MAX_END_NAME)]);
	});
});

describe('archLayout', () => {
	const lay = archLayout(SLIDE_LANGUAGES, SLIDE_TARGETS);

	it('labels the boxes like the slide', () => {
		expect(lay.frontends.map((b) => b.lines)).toEqual([
			['C Frontend'],
			['Fortran Frontend'],
			['Ada Frontend']
		]);
		expect(lay.optimizer.lines).toEqual(['Common', 'Optimizer']);
		expect(lay.backends.map((b) => b.lines)).toEqual([
			['X86 Backend'],
			['PowerPC Backend'],
			['ARM Backend']
		]);
		expect(lay.inputs.map((i) => i.text)).toEqual(['C', 'Fortran', 'Ada']);
		expect(lay.outputs.map((i) => i.text)).toEqual(['X86', 'PowerPC', 'ARM']);
	});

	it('reads left to right: inputs, frontends, optimizer, backends, outputs', () => {
		const f = lay.frontends[0];
		const b = lay.backends[0];
		expect(lay.inputs[0].at.x).toBeLessThan(f.x);
		expect(f.x + f.width).toBeLessThan(lay.optimizer.x);
		expect(lay.optimizer.x + lay.optimizer.width).toBeLessThan(b.x);
		expect(b.x + b.width).toBeLessThan(lay.outputs[0].at.x);
		expect(lay.width).toBeGreaterThan(lay.outputs[0].at.x);
	});

	it('draws two arrows per language and two per target', () => {
		expect(lay.arrows).toHaveLength(2 * 3 + 2 * 3);
		const five = archLayout(['A', 'B', 'C', 'D', 'E'], ['X']);
		expect(five.arrows).toHaveLength(2 * 5 + 2);
	});

	it('centers the shorter column and the optimizer', () => {
		const lop = archLayout(['A', 'B', 'C', 'D'], ['X']);
		const mid = lop.height / 2;
		expect(lop.backends[0].y + lop.backends[0].height / 2).toBeCloseTo(mid);
		expect(lop.optimizer.y + lop.optimizer.height / 2).toBeCloseTo(mid);
		expect(lop.frontends[0].y).toBe(0);
	});

	it('widens boxes for long names', () => {
		const wide = archLayout(['Visual Basic .NET'], ['X86']);
		expect(wide.frontends[0].width).toBeGreaterThan(lay.frontends[0].width);
	});
});
