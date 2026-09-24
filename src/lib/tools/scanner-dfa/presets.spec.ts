import { describe, expect, it } from 'vitest';
import { hasErrors } from '$lib/theory/diagnostics';
import { formatCitation } from '$lib/lectures';
import { buildRuleDfa, compileRules } from './rules';
import { driverTable, type DriverTable } from './table';
import { traceRun, type Mode } from './driver';
import { MACHINES } from './machines';
import { DEFAULT_PRESET, PRESETS, matchPreset, type ScannerPreset } from './presets';
import { isSavedState, loadState, type ScannerDfaState } from './state';

const BASE: ScannerDfaState = {
	tab: 'table',
	source: 'relop',
	defs: '',
	rules: [],
	input: '',
	minimal: false,
	mode: 'first',
	switchInput: '<=',
	breaks: false,
	inputs: {}
};

function tableFor(p: ScannerPreset): DriverTable {
	const v = p.value;
	if (v.source !== 'rules') return driverTable(MACHINES[v.source].build());
	const compiled = compileRules(v.defs ?? '', v.rules ?? []);
	if (!compiled.rules) throw new Error(`${p.id}: rules do not compile`);
	const built = buildRuleDfa(compiled.rules, { minimal: v.minimal ?? false });
	if (!built.ok) throw new Error(`${p.id}: DFA too large`);
	return driverTable(built.dfa, { names: compiled.names });
}

function pairs(p: ScannerPreset, mode: Mode = p.value.mode ?? 'first', input = p.value.input) {
	const v = p.value;
	const skip = new Set((v.rules ?? []).filter((r) => r.drop).map((r) => r.name));
	return traceRun(tableFor(p), input, mode, { skip }).calls.map(
		(c) => `(${c.token.name}, "${c.token.lexeme}")`
	);
}

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('presets', () => {
	it('have unique ids, citations and loadable values', () => {
		expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
		for (const p of PRESETS) {
			expect(p.cite, p.id).toBeDefined();
			expect(formatCitation(p.cite!)).toMatch(/Lexical Analysis/);
			expect(isSavedState(p.value), p.id).toBe(true);
			for (const q of p.questions ?? []) expect(formatCitation(q.cite)).toMatch(/slide/);
		}
	});

	it('parse without errors and build a DFA', () => {
		for (const p of PRESETS) {
			if (p.value.source !== 'rules') continue;
			const compiled = compileRules(p.value.defs ?? '', p.value.rules ?? []);
			expect(hasErrors(compiled.defs.diagnostics), p.id).toBe(false);
			for (const row of compiled.rows) {
				expect(row.nameError, p.id).toBeUndefined();
				expect(hasErrors(row.diagnostics), p.id).toBe(false);
				expect(
					row.diagnostics.filter((d) => d.severity === 'warning'),
					p.id
				).toEqual([]);
			}
			expect(compiled.rules, p.id).not.toBeNull();
			expect(buildRuleDfa(compiled.rules!, { minimal: false }).ok, p.id).toBe(true);
		}
	});

	it('scan their whole input', () => {
		for (const p of PRESETS) {
			for (const mode of ['first', 'longest'] as const) {
				const run = traceRun(tableFor(p), p.value.input, mode);
				expect(run.stalled, p.id).toBe(false);
				expect(run.truncated, p.id).toBe(false);
				expect(run.calls.at(-1)!.end, p.id).toBe(p.value.input.length);
			}
		}
	});

	it('match themselves once loaded', () => {
		for (const p of PRESETS) {
			const state = loadState(BASE, p.value);
			expect(matchPreset(state)?.id, p.id).toBe(p.id);
		}
		expect(DEFAULT_PRESET.id).toBe('relop');
		expect(DEFAULT_PRESET.value.input).toBe('<=');
	});
});

describe('lecture results', () => {
	it('relop returns each token on its lexeme (slide 16)', () => {
		const p = preset('relop');
		const run = (input: string) => pairs(p, 'first', input);
		expect(run('<=')).toEqual(['(LE, "<=")']);
		expect(run('<>')).toEqual(['(NE, "<>")']);
		expect(run('<x')).toEqual(['(LT, "<")', '(Error, "x")']);
		expect(run('=')).toEqual(['(EQ, "=")']);
		expect(run('>=')).toEqual(['(GE, ">=")']);
		expect(run('>a')).toEqual(['(GT, ">")', '(Error, "a")']);
		expect(run('x')).toEqual(['(Error, "x")']);
		// The retract states work the same way in both modes, and at the end of the input.
		expect(pairs(p, 'longest', '<x')).toEqual(['(LT, "<")', '(Error, "x")']);
		expect(run('<')).toEqual(['(LT, "<")']);
		expect(pairs(p, 'longest', '>')).toEqual(['(GT, ">")']);
	});

	it('S, T, U on "0110" (slide 14)', () => {
		const p = preset('stu');
		expect(pairs(p, 'first')).toEqual(['(U, "01")', '(U, "1")', '(Error, "0")']);
		expect(pairs(p, 'longest')).toEqual(['(U, "011")', '(Error, "0")']);
	});

	it('(1 | 0)*1 on "0110": first accept "01", longest match "011"', () => {
		const p = preset('ends-in-1');
		expect(pairs(p, 'first')[0]).toBe('(EndsIn1, "01")');
		expect(pairs(p, 'longest')[0]).toBe('(EndsIn1, "011")');
		// "Is the previous DFA minimal?" (slide 11): 3 states, 2 when minimized.
		const compiled = compileRules('', p.value.rules!);
		const built = buildRuleDfa(compiled.rules!, { minimal: false });
		if (!built.ok) throw new Error('too large');
		expect(built.full.states).toHaveLength(3);
		expect(built.minimal.states).toHaveLength(2);
		const t = driverTable(built.full);
		expect(t.T[0]).toEqual(t.T[1]);
		expect(t.accept.slice(0, 2)).toEqual([false, false]);
	});

	it('f+3  +g gives the slide-7 token tuples (maximal munch takes both spaces)', () => {
		expect(pairs(preset('f3g'))).toEqual([
			'(Identifier, "f")',
			'(Plus, "+")',
			'(Integer, "3")',
			'(Whitespace, "  ")',
			'(Plus, "+")',
			'(Identifier, "g")'
		]);
	});

	it('foo+3: maximal munch takes "foo"; the slide-15 driver stops at "f"', () => {
		const p = preset('foo3');
		expect(pairs(p, 'longest')).toEqual(['(Identifier, "foo")', '(Plus, "+")', '(Integer, "3")']);
		expect(pairs(p, 'first')[0]).toBe('(Identifier, "f")');
	});

	it("new foo: 'new' is listed before Identifier (slide 11)", () => {
		const p = preset('new-foo');
		expect(pairs(p)).toEqual(['(New, "new")', '(Whitespace, " ")', '(Identifier, "foo")']);
		expect(pairs(p, 'longest', 'newer')).toEqual(['(Identifier, "newer")']);
		const skip = new Set(['Whitespace']);
		const run = traceRun(tableFor(p), 'new foo', 'longest', { skip });
		expect(run.calls.map((c) => c.token.skipped)).toEqual([false, true, false]);
	});

	it('=56: no prefix matches, then Integer (slide 12)', () => {
		expect(pairs(preset('eq56'))).toEqual(['(Error, "=")', '(Integer, "56")']);
	});
});
