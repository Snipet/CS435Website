/**
 * What the page computes on the main thread for every keystroke is the scan
 * that colors the editor and the reading of the input numbers. Compiling and
 * running are left to the workers (tasks.ts): the parser, the analyzer, the
 * generators and the machine all throw here.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseInputs } from '$lib/tools/tiny-vm/input';
import { PRESETS, presetFor } from './presets';
import { MAX_SOURCE } from './state';
import { compileProgram, runProgram } from './tasks';
import { highlightSource, selectionLineClasses, stageViews } from './views';

// Hoisted with the mocks below, which use it.
const { off } = vi.hoisted(() => ({
	off: (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	}
}));

vi.mock('$lib/theory/cminus/parser', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/theory/cminus/parser')>()),
	parse: off('parse'),
	parseSource: off('parseSource')
}));
vi.mock('$lib/theory/cminus/semantic', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/theory/cminus/semantic')>()),
	analyze: off('analyze')
}));
vi.mock('$lib/theory/cminus/codegen', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/theory/cminus/codegen')>()),
	generateCode: off('generateCode')
}));
vi.mock('$lib/theory/cminus/run', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/theory/cminus/run')>()),
	runTM: off('runTM')
}));

describe('the page on the main thread', () => {
	it('colors the editor and reads the input of every preset without compiling', () => {
		for (const p of PRESETS) {
			for (const identifiers of ['letters', 'extended'] as const) {
				const tokens = highlightSource(p.value.source, identifiers, { start: 3, end: 30 });
				expect(tokens.length, p.id).toBeGreaterThan(0);
			}
			expect(selectionLineClasses(p.value.source, { start: 3, end: 30 }).length).toBeGreaterThan(0);
			expect(parseInputs(p.value.input).invalid).toEqual([]);
			expect(presetFor({ source: p.value.source })).toBe(p);
		}
		expect(stageViews(null, null)).toHaveLength(8);
	});

	it('scans the longest text that is compiled in a few milliseconds', () => {
		const text = 'x = x + 1; /* c */ '.repeat(Math.floor(MAX_SOURCE / 19));
		const started = performance.now();
		const tokens = highlightSource(text, 'letters', { start: 100, end: 5000 });
		expect(performance.now() - started).toBeLessThan(250);
		expect(tokens.length).toBeGreaterThan(5000);
	});

	it('leaves compiling and running to the workers', () => {
		const request = {
			source: 'void main(void) { }',
			identifiers: 'letters',
			optimize: true
		} as const;
		expect(() => compileProgram(request)).toThrow('parse ran on the main thread');
		expect(() => runProgram({ ...request, inputs: [], attempt: 0 })).toThrow(
			'parse ran on the main thread'
		);
	});
});
