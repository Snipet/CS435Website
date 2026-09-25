import { describe, expect, it } from 'vitest';
import { printFlexPattern } from '$lib/theory/regex';
import { specLineClasses, specTokens } from './highlight';
import { presetById } from './presets';
import { compileSpec } from './program';
import { runScanner, type OutputChunk } from './runtime';
import { parseSpec } from './spec';
import { defaultState, fromLink, isFlexState } from './state';
import {
	MAX_EXPANDED,
	definitionRows,
	describeInput,
	describeStep,
	expandedSize,
	formatReturn,
	inputWindow,
	outputRuns,
	runMessages,
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
		// Actions also get the C code background.
		expect(at('printf')).toBe('fx-code');
		expect(at('"number')).toBe('hl-string fx-code');
		expect(at('yytext')).toBe('hl-name fx-code');
		expect(at('int main')).toBe('hl-keyword');
		expect(at('return')).toBe('hl-keyword');
		// The blanks between a pattern and its action are not part of either.
		expect(at('  { printf')).toBeUndefined();
	});

	it('marks each line with its section and C code lines', () => {
		const lines = specLineClasses(parseSpec(presetById('example-3')!.value.spec));
		const code = 'fx-line-code';
		expect(lines.slice(0, 5)).toEqual([
			`fx-sec-defs ${code}`,
			`fx-sec-defs ${code}`,
			`fx-sec-defs ${code}`,
			'fx-sec-defs',
			'fx-sec-defs'
		]);
		expect(lines[8]).toBe('fx-sec-rules'); // %%
		expect(lines[10]).toBe('fx-sec-rules'); // {DIGIT}+ { … }: the action is marked per token
		expect(lines[16]).toBe('fx-sec-user'); // %%
		expect(lines.slice(17, 21)).toEqual(Array(4).fill(`fx-sec-user ${code}`));

		const multi = specLineClasses(
			parseSpec('%{\nint n;\n%}\n%%\n  int k;\nx  {\n  n++;\n}\ny  { }\n%%\n')
		);
		expect(multi).toEqual([
			`fx-sec-defs ${code}`,
			`fx-sec-defs ${code}`,
			`fx-sec-defs ${code}`,
			'fx-sec-rules',
			`fx-sec-rules ${code}`,
			'fx-sec-rules',
			`fx-sec-rules ${code}`,
			`fx-sec-rules ${code}`,
			'fx-sec-rules',
			'fx-sec-user',
			'fx-sec-user'
		]);
	});

	it('adds the focus class on top of the syntax color', () => {
		const text = presetById('example-3')!.value.spec;
		const spec = parseSpec(text);
		const r = spec.rules[1];
		const tokens = specTokens(spec, [{ start: r.actionStart, end: r.actionEnd }]);
		const inside = tokens.filter((t) => t.from >= r.actionStart && t.to <= r.actionEnd);
		expect(inside.length).toBeGreaterThan(0);
		expect(inside.every((t) => t.className.includes('fx-focus'))).toBe(true);
		expect(tokens.some((t) => t.className === 'hl-string fx-code fx-focus')).toBe(true);
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

describe('console runs', () => {
	const chunk = (stream: 'stdout' | 'stderr', text: string, echo = false, at = 0): OutputChunk => ({
		stream,
		text,
		echo,
		at,
		inAction: true
	});

	it('groups chunks by stream and ECHO and labels each run', () => {
		const runs = outputRuns([
			chunk('stdout', 'a', true, 0),
			chunk('stdout', 'b', true, 1),
			chunk('stdout', 'x\n', false, 2),
			chunk('stderr', 'oops\n', false, 3),
			chunk('stderr', 'again\n', false, 4),
			chunk('stdout', 'y', false, 5)
		]);
		expect(runs.map((r) => [r.label, r.chunks.map((c) => c.text).join('')])).toEqual([
			['ECHO', 'ab'],
			['stdout', 'x\n'],
			['stderr', 'oops\nagain\n'],
			['stdout', 'y']
		]);
	});

	it('does not label plain stdout', () => {
		const runs = outputRuns([chunk('stdout', 'a', false, 0), chunk('stdout', 'b', false, 1)]);
		expect(runs).toHaveLength(1);
		expect(runs[0].label).toBeNull();
	});

	it('labels the Comments preset’s stderr message', () => {
		const p = presetById('comments')!;
		const run = runScanner(compileSpec(p.value.spec), 'a /* never closed');
		const runs = outputRuns(run.output);
		expect(runs.map((r) => r.label)).toEqual(['ECHO', 'stderr']);
		expect(runs[1].chunks.map((c) => c.text).join('')).toBe(
			'error: comment is never closed\n1 comment(s) removed\n'
		);
	});
});

describe('run messages', () => {
	it('lists warnings without a span (%option nodefault)', () => {
		const spec = '%option nodefault\n%%\na  { ECHO; }\n%%\n';
		const run = runScanner(compileSpec(spec), 'ab');
		expect(run.exitStatus).toBe(2);
		expect(runMessages(run, spec)).toEqual([
			{
				severity: 'warning',
				message: 'no rule matches "b" at line 1 and %option nodefault forbids the default rule',
				span: null,
				line: null
			}
		]);
	});

	it('gives spec lines for spanned messages and leaves out the error that stopped the run', () => {
		const spec = '%%\n%%\nint main() {\n  int z = 0;\n  printf("a\\n", 1);\n  return 1 / z;\n}\n';
		const run = runScanner(compileSpec(spec), '');
		expect(run.stopped).toBe('runtime error: division by zero');
		expect(run.diagnostics).toHaveLength(2);
		const messages = runMessages(run, spec);
		expect(messages.map((m) => [m.severity, m.message, m.line])).toEqual([
			['warning', 'more arguments than the format string uses', 5]
		]);
		expect(spec.slice(messages[0].span!.start, messages[0].span!.end)).toBe('printf("a\\n", 1)');
	});

	it('is empty for a clean run', () => {
		const { run, compiled } = example3();
		expect(runMessages(run, compiled.spec.text)).toEqual([]);
	});
});

describe('definition rows', () => {
	it('lists every definition line, with {NAME} expanded', () => {
		const rows = definitionRows(parseSpec(presetById('example-3')!.value.spec));
		expect(rows.map((r) => [r.name, r.expanded, r.duplicateOf])).toEqual([
			['DIGIT', null, null],
			['LETTER', null, null],
			['ID', '[A-Za-z]([A-Za-z]|[0-9])*', null]
		]);
	});

	it('keeps a repeated name as its own row with a unique key', () => {
		// A copy-pasted definition line: the table keys rows, so keys must differ.
		const spec = parseSpec('DIGIT [0-9]\nID    {DIGIT}+\nDIGIT [0-9]\n%%\n{ID}  { }\n');
		const rows = definitionRows(spec);
		expect(rows.map((r) => r.name)).toEqual(['DIGIT', 'ID', 'DIGIT']);
		expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
		expect(rows.map((r) => r.duplicateOf)).toEqual([null, null, 1]);
		expect(rows[1].expanded).toBe('[0-9]+');
	});

	it('does not print an expansion that is too large', () => {
		const lines = ['D0 x'];
		for (let k = 1; k <= 12; k++) lines.push(`D${k} {D${k - 1}}{D${k - 1}}`);
		const rows = definitionRows(parseSpec(`${lines.join('\n')}\n%%\n{D12}  { }\n`));
		const last = rows.at(-1)!;
		expect(last.tooLong).toBe(true);
		expect(last.expanded).toBeNull();
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
