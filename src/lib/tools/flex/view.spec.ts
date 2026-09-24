import { describe, expect, it } from 'vitest';
import { printFlexPattern } from '$lib/theory/regex';
import { specTokens } from './highlight';
import { presetById } from './presets';
import { compileSpec } from './program';
import { runScanner } from './runtime';
import { parseSpec } from './spec';
import { defaultState, fromLink, isFlexState } from './state';
import {
	MAX_EXPANDED,
	describeInput,
	describeStep,
	expandedSize,
	formatReturn,
	inputWindow,
	stepAt,
	stepHighlights,
	visible
} from './view';

const example3 = () => {
	const compiled = compileSpec(presetById('example-3')!.value.spec);
	return { compiled, run: runScanner(compiled, 'abc123 7\n') };
};

describe('view helpers', () => {
	it('shows whitespace and describes the input', () => {
		expect(visible('hello world \n')).toBe('hello·world·↵');
		expect(visible('a\tb')).toBe('a⇥b');
		expect(describeInput('one two')).toBe('7 characters · 1 line · no newline at the end');
		expect(describeInput('hi\n\n')).toBe('4 characters · 2 lines · ends with a newline');
		expect(describeInput('')).toBe('Empty');
	});

	it('names return values', () => {
		const names = new Map([[259, ['IDENT']]]);
		expect(formatReturn(259, names)).toBe('259 (IDENT)');
		expect(formatReturn(43, names)).toBe("43 ('+')");
		expect(formatReturn(0, names)).toBe('0');
	});

	it('describes each kind of step', () => {
		const { compiled, run } = example3();
		const spec = compiled.spec;
		expect(describeStep(run.steps[0], spec, run.valueNames)).toBe(
			'At line 1, column 1, rule 2 ({ID}) wins with the longest match (6): yytext = "abc123".'
		);
		const seven = run.steps.find((s) => s.yytext === '7')!;
		expect(describeStep(seven, spec, run.valueNames)).toBe(
			'At line 1, column 8, rule 1 ({DIGIT}+) wins with the longest match (1), listed first among 2: yytext = "7".'
		);
		const nl = run.steps.find((s) => s.kind === 'default')!;
		expect(describeStep(nl, spec, run.valueNames)).toBe(
			'At line 1, column 9, no rule matches "\\n"; the default rule copies it to the output.'
		);
		expect(describeStep(run.steps.at(-1)!, spec, run.valueNames)).toBe(
			'End of input: no <<EOF>> rule, so yylex returns 0.'
		);
	});

	it('highlights earlier matches by rule and the current yytext', () => {
		const { run } = example3();
		expect(stepHighlights(run, 2)).toEqual([
			{ start: 0, end: 6, tone: 1 },
			{ start: 6, end: 7, tone: 2 },
			{ start: 7, end: 8, tone: 'active', label: 'yytext' }
		]);
		expect(stepAt(run, 3)).toBe(0);
		expect(stepAt(run, 7)).toBe(2);
		expect(stepAt(run, 9)).toBe(run.steps.length - 1);
	});

	it('windows long inputs around a position', () => {
		const long = ('x'.repeat(99) + '\n').repeat(100);
		const w = inputWindow(long, 5000, 5003, 1200);
		expect(w.text.length).toBeLessThanOrEqual(1300);
		expect(w.offset).toBeLessThanOrEqual(5000);
		expect(w.offset + w.text.length).toBeGreaterThanOrEqual(5003);
		expect(w.clippedStart && w.clippedEnd).toBe(true);
		expect(inputWindow('short', 0, 1)).toEqual({
			text: 'short',
			offset: 0,
			clippedStart: false,
			clippedEnd: false
		});
	});
});

describe('spec highlighting', () => {
	it('colors delimiters, definitions, patterns, and C code', () => {
		const text = presetById('example-3')!.value.spec;
		const spec = parseSpec(text);
		const tokens = specTokens(spec);
		const at = (s: string, from = 0) => {
			const i = text.indexOf(s, from);
			return tokens.find((t) => t.from <= i && i < t.to)?.className;
		};
		expect(at('%top{')).toBe('hl-keyword');
		expect(at('%%')).toBe('hl-keyword');
		expect(at('DIGIT')).toBe('hl-name');
		expect(at('[0-9]')).toBe('hl-literal');
		expect(at('{DIGIT}+')).toBe('hl-name');
		expect(at('+ ', text.indexOf('{DIGIT}+'))).toBe('hl-operator');
		expect(at('#include')).toBe('hl-special');
		expect(at('printf')).toBeUndefined();
		expect(at('"number')).toBe('hl-string');
		expect(at('yytext')).toBe('hl-name');
		expect(at('int main')).toBe('hl-keyword');
		expect(at('return')).toBe('hl-keyword');
	});

	it('adds the focus class on top of the syntax color', () => {
		const text = presetById('example-3')!.value.spec;
		const spec = parseSpec(text);
		const r = spec.rules[1];
		const tokens = specTokens(spec, [{ start: r.actionStart, end: r.actionEnd }]);
		const inside = tokens.filter((t) => t.from >= r.actionStart && t.to <= r.actionEnd);
		expect(inside.length).toBeGreaterThan(0);
		expect(inside.every((t) => t.className.includes('fx-focus'))).toBe(true);
		expect(tokens.some((t) => t.className === 'hl-string fx-focus')).toBe(true);
	});
});

describe('expanded patterns', () => {
	it('prints Example 3’s {ID} with its definitions expanded', () => {
		const spec = parseSpec(presetById('example-3')!.value.spec);
		expect(printFlexPattern(spec.rules[1].pattern!, { expandRefs: true })).toBe(
			'[A-Za-z]([A-Za-z]|[0-9])*'
		);
		expect(printFlexPattern(spec.rules[0].pattern!, { expandRefs: true })).toBe('[0-9]+');
	});
});

describe('expansion size', () => {
	it('counts definition uses without expanding them', () => {
		const lines = ['D0 x'];
		for (let k = 1; k <= 40; k++) lines.push(`D${k} {D${k - 1}}{D${k - 1}}`);
		const spec = parseSpec(`${lines.join('\n')}\n%%\n{D40}  { }\n`);
		const size = expandedSize(spec.rules[0].pattern!.regex);
		expect(size).toBeGreaterThan(2 ** 40);
		expect(size).toBeGreaterThan(MAX_EXPANDED);
		expect(expandedSize(parseSpec('%%\nab  { }\n').rules[0].pattern!.regex)).toBe(3);
	});
});

describe('URL state', () => {
	it('accepts the cross-tool link shape and its own shape', () => {
		expect(isFlexState({ spec: '%%\n', input: '' })).toBe(true);
		expect(isFlexState({ ...defaultState() })).toBe(true);
		expect(isFlexState({ spec: '%%\n', input: '', view: 'step', step: 3, preset: null })).toBe(
			true
		);
	});

	it('rejects other shapes', () => {
		expect(isFlexState(null)).toBe(false);
		expect(isFlexState({ spec: 1, input: '' })).toBe(false);
		expect(isFlexState({ spec: '', input: '', view: 'graph' })).toBe(false);
		expect(isFlexState({ spec: '', input: '', step: -1 })).toBe(false);
		expect(isFlexState([])).toBe(false);
	});

	it('fills defaults for a link and loads Example 3 by default', () => {
		expect(fromLink({ spec: 'x', input: 'y' })).toEqual({
			spec: 'x',
			input: 'y',
			preset: null,
			view: 'run',
			step: 0
		});
		expect(fromLink({ spec: 'x', input: 'y', preset: 'nope' }).preset).toBeNull();
		const d = defaultState();
		expect(d.preset).toBe('example-3');
		expect(d.input).toBe('count = count + 10;\n');
	});
});
