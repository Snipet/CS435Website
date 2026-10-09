import { describe, expect, it } from 'vitest';
import { answer } from '$lib/components/ui/worker-protocol';
import { compile, finalCode } from '$lib/theory/cminus';
import { PRESETS, presetById } from './presets';
import { describeSelection, marksFor, rangeOf } from './selection';
import {
	MAX_OUTPUTS,
	STEP_BUDGET,
	compileKey,
	compileProgram,
	runProgram,
	type CompileRequest,
	type RunRequest
} from './tasks';
import {
	listingSections,
	outlineRows,
	quadGroups,
	scopeViews,
	stageViews,
	tokenRows
} from './views';

const request = (source: string, more: Partial<CompileRequest> = {}): CompileRequest => ({
	source,
	identifiers: 'letters',
	optimize: true,
	...more
});

const runRequest = (
	source: string,
	inputs: number[],
	more: Partial<RunRequest> = {}
): RunRequest => ({
	...request(source),
	inputs,
	attempt: 0,
	...more
});

describe('compileProgram', () => {
	it('is the engine’s compilation with the options of the request', () => {
		const source = presetById('gcd')!.value.source;
		expect(compileProgram(request(source))).toEqual(compile(source));
		const plain = compileProgram(request(source, { optimize: false }));
		expect(plain.options).toEqual({ identifiers: 'letters', optimize: false });
		expect(plain.optimized).toBeNull();
		const extended = compileProgram(
			request('int x1; void main(void) { }', { identifiers: 'extended' })
		);
		expect(extended.stoppedAt).toBeNull();
		expect(compileProgram(request('int x1; void main(void) { }')).stoppedAt).toBe('parser');
	});

	it.each(PRESETS.map((p) => [p.id]))(
		'%s: the compilation crosses from the worker as plain data, and every view reads the copy',
		(id) => {
			const c = compileProgram(request(presetById(id)!.value.source));
			// What a worker posts back is a structured clone.
			const response = structuredClone(answer(1, () => c));
			if (!response.ok) throw new Error(response.error);
			const copy = response.output;
			expect(copy).toEqual(c);
			expect(tokenRows(copy.scan, { comments: true })).toEqual(
				tokenRows(c.scan, { comments: true })
			);
			expect(stageViews(copy, null)).toEqual(stageViews(c, null));
			expect(scopeViews(copy)).toEqual(scopeViews(c));
			if (c.parse && copy.parse) {
				expect(outlineRows(copy.parse.program, new Set(), copy.semantic?.types)).toEqual(
					outlineRows(c.parse.program, new Set(), c.semantic?.types)
				);
				for (const node of [c.parse.program, ...c.parse.program.decls]) {
					const range = rangeOf(node.span);
					expect(marksFor(copy, range)).toEqual(marksFor(c, range));
					expect(describeSelection(copy, range)).toEqual(describeSelection(c, range));
				}
			}
			if (c.ir && copy.ir)
				expect(quadGroups(copy.ir, copy.optimized)).toEqual(quadGroups(c.ir, c.optimized));
			if (c.codegen && copy.codegen) {
				expect(listingSections(copy.codegen, 'after')).toEqual(listingSections(c.codegen, 'after'));
			}
		}
	);
});

describe('runProgram', () => {
	it('runs the final code with the input and reports how it stopped', () => {
		const p = presetById('gcd')!;
		expect(runProgram(runRequest(p.value.source, [48, 18]))).toEqual({
			outputs: [6],
			printed: 1,
			stop: 'halted',
			steps: 149,
			pc: finalCode(compile(p.value.source))!.haltAddress,
			read: 2,
			budget: STEP_BUDGET
		});
		const waiting = runProgram(runRequest(p.value.source, [48]))!;
		expect(waiting).toMatchObject({ outputs: [], stop: 'input-exhausted', read: 1 });
	});

	it('is null for a program that does not compile', () => {
		for (const id of ['undeclared', 'missing-semicolon', 'illegal-character']) {
			expect(runProgram(runRequest(presetById(id)!.value.source, []))).toBeNull();
		}
	});

	it('stops at the step budget and hands back at most a fixed number of outputs', () => {
		const forever = runProgram(runRequest('void main(void) { while (1) output(7); }', []))!;
		expect(forever.stop).toBe('step-budget');
		expect(forever.steps).toBe(STEP_BUDGET);
		expect(forever.budget).toBe(1_000_000);
		expect(forever.printed).toBeGreaterThan(MAX_OUTPUTS);
		expect(forever.outputs).toHaveLength(MAX_OUTPUTS);
		expect(forever.outputs.every((v) => v === 7)).toBe(true);
	});

	it('gives the same result as plain data', () => {
		const out = runProgram(
			runRequest(presetById('sort')!.value.source, [3, 1, 2, 9, 8, 7, 6, 5, 4, 0])
		)!;
		expect(structuredClone(out)).toEqual(out);
		expect(out.outputs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});
});

describe('compileKey', () => {
	it('tells compilations apart by text and options only', () => {
		const a = request('void main(void) { }');
		expect(compileKey(a)).toBe(compileKey({ ...a }));
		expect(compileKey(a)).toBe(compileKey(runRequest(a.source, [1, 2], { attempt: 3 })));
		expect(compileKey(a)).not.toBe(compileKey({ ...a, source: `${a.source} ` }));
		expect(compileKey(a)).not.toBe(compileKey({ ...a, optimize: false }));
		expect(compileKey(a)).not.toBe(compileKey({ ...a, identifiers: 'extended' }));
	});
});
