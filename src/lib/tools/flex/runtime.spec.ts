import { describe, expect, it } from 'vitest';
import { presetById } from './presets';
import { compileSpec } from './program';
import { outputText, runScanner, type FlexRun } from './runtime';
import { counterBumps } from './wc';

function run(spec: string, input: string, opts = {}): FlexRun {
	const compiled = compileSpec(spec);
	const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
	if (errors.length) throw new Error(errors.map((d) => d.message).join('; '));
	return runScanner(compiled, input, opts);
}

/** Rules section only; prints "<rule>:<yytext>|" for each rule that matches. */
const rules = (body: string, defs = '') => `%{\n#include <stdio.h>\n%}\n${defs}\n%%\n${body}\n%%\n`;

describe('yylex: choosing a rule', () => {
	it('prefers the longest match, then the rule listed first', () => {
		const spec = rules(
			[
				'if        { printf("IF "); }',
				'iffy      { printf("IFFY "); }',
				'[a-z]+    { printf("ID(%s) ", yytext); }',
				'[ \\n]     { }'
			].join('\n')
		);
		expect(outputText(run(spec, 'if iffy iff newer\n'))).toBe('IF IFFY ID(iff) ID(newer) ');
	});

	it('records every rule’s match length at each step', () => {
		const r = run(presetById('example-3')!.value.spec, 'abc123 7');
		const first = r.steps[0];
		expect(first.pos).toBe(0);
		expect(first.candidates.map((c) => [c.rule, c.status, c.length])).toEqual([
			[0, 'none', 0],
			[1, 'match', 6],
			[2, 'match', 1]
		]);
		expect(first.rule).toBe(1);
		expect(first.yytext).toBe('abc123');
		expect(first.yyleng).toBe(6);
		// "7": {DIGIT}+ and . both match one character; the earlier rule wins.
		const seven = r.steps.find((s) => s.yytext === '7')!;
		expect(seven.candidates.filter((c) => c.status === 'match').map((c) => c.rule)).toEqual([0, 2]);
		expect(seven.rule).toBe(0);
	});

	it('ECHOes unmatched characters with the default rule', () => {
		const r = run(presetById('example-3')!.value.spec, 'x\n');
		const last = r.steps.filter((s) => s.kind !== 'eof').at(-1)!;
		expect(last.kind).toBe('default');
		expect(last.yytext).toBe('\n');
		const echoed = r.output.filter((c) => c.echo);
		expect(echoed.map((c) => [c.text, c.at])).toEqual([['\n', last.index]]);
	});

	it('ends with an end-of-input step where yylex returns 0', () => {
		const r = run(presetById('example-1')!.value.spec, '12');
		const eof = r.steps.at(-1)!;
		expect(eof.kind).toBe('eof');
		expect(eof.returned).toBe(0);
		expect(r.calls).toEqual([{ index: 1, firstStep: 0, lastStep: 1, returned: 0 }]);
	});
});

describe('yylex: anchors and trailing context', () => {
	it('^ matches only at the start of a line', () => {
		const spec = rules(
			'^a    { printf("[BOL a]"); }\na     { printf("[a]"); }\n\\n    { printf("|"); }'
		);
		expect(outputText(run(spec, 'aa\na'))).toBe('[BOL a][a]|[BOL a]');
		const r = run(spec, 'aa');
		expect(r.steps[1].candidates[0].status).toBe('bol');
	});

	it('Example 2: ^{DELIM} beats {DELIM} at the start of a line (same length, listed first)', () => {
		const r = run(presetById('example-2')!.value.spec, '  hi\n');
		expect(r.steps[0].candidates.map((c) => [c.status, c.length])).toEqual([
			['none', 0],
			['match', 2],
			['match', 2],
			['match', 1]
		]);
		expect(r.steps[0].rule).toBe(1);
	});

	it('r$ matches only before a newline, and the newline counts toward the length', () => {
		const spec = rules(
			'ab$   { printf("[ab$:%s]", yytext); }\nabc   { printf("[abc]"); }\n.|\\n  { }'
		);
		expect(outputText(run(spec, 'ab\nab'))).toBe('[ab$:ab]');
		const r = run(spec, 'ab\n');
		expect(r.steps[0].candidates[0]).toMatchObject({ status: 'match', length: 3, textLength: 2 });
		expect(outputText(run(spec, 'abc\n'))).toBe('[abc]');
	});

	it('r/s counts s toward the match length but leaves it in the input', () => {
		const spec = rules(
			'[0-9]+/"."[0-9]   { printf("int(%s) ", yytext); }\n[0-9]+"."[0-9]+  { printf("real(%s) ", yytext); }\n.|\\n  { }'
		);
		// The trailing-context rule matches "3.1" (3 characters, yytext "3"); the real-number rule matches 4.
		const r = run(spec, '3.14');
		expect(r.steps[0].candidates.map((c) => [c.length, c.textLength])).toEqual([
			[3, 1],
			[4, 4],
			[1, 1]
		]);
		expect(outputText(r)).toBe('real(3.14) ');
		expect(outputText(run(spec, '3.x'))).toBe('');
		const r2 = run(rules('a+/b   { printf("<%s>", yytext); }\n.|\\n   { printf("."); }'), 'aab');
		expect(outputText(r2)).toBe('<aa>.');
		expect(r2.steps[0]).toMatchObject({ end: 2, context: 3, next: 2 });
	});
});

describe('yylex: start conditions and end of input', () => {
	it('BEGIN switches start conditions; %x rules run only in their condition', () => {
		const r = run(presetById('comments')!.value.spec, 'a/*b*/c');
		expect(outputText(r, 'stdout')).toBe('ac');
		const scs = r.steps.map((s) => s.sc);
		expect(scs).toEqual([0, 0, 1, 1, 0, 0]);
		const inComment = r.steps[2];
		expect(inComment.candidates.find((c) => c.rule === 4)!.status).toBe('inactive');
	});

	it('%s (inclusive) keeps unmarked rules active', () => {
		const spec = `%s LOUD\n%%\n"!"    { BEGIN(LOUD); }\n<LOUD>[a-z]  { putchar(yytext[0] - 32); }\n[a-z]  { ECHO; }\n%%\n`;
		expect(outputText(run(spec, 'ab!cd'))).toBe('abCD');
		expect(run(spec, 'ab!cd').steps[3].candidates.map((c) => c.status)).toEqual([
			'none',
			'match',
			'match'
		]);
	});

	it('runs the <<EOF>> rule of the current start condition', () => {
		const r = run(presetById('comments')!.value.spec, 'x/*');
		expect(outputText(r, 'stderr')).toBe('error: comment is never closed\n1 comment(s) removed\n');
		const eof = r.steps.at(-1)!;
		expect(eof).toMatchObject({ kind: 'eof', rule: 3, returned: 0 });
	});

	it('warns when an <<EOF>> action neither returns nor calls yyterminate()', () => {
		const r = run('%%\n<<EOF>>  { printf("end\\n"); }\n%%\n', 'x');
		expect(outputText(r)).toBe('xend\n');
		expect(r.diagnostics[0].message).toMatch(/flex would run it again forever/);
	});

	it('returns values from actions to main, one yylex call at a time', () => {
		const r = run(presetById('tokens')!.value.spec, 'a = 1');
		expect(r.calls.map((c) => c.returned)).toEqual([259, 260, 258, 0]);
		expect(r.valueNames.get(259)).toEqual(['IDENT']);
		expect(r.steps.filter((s) => s.returned !== null).map((s) => s.call)).toEqual([1, 2, 3, 4]);
	});

	it('runs the code before the first rule each time yylex is called', () => {
		const spec = `%%\n  printf("<enter>");\n[a-z]  { return 1; }\n.      { }\n%%\nint main() { while (yylex()) printf("[%s]", yytext); return 0; }\n`;
		expect(outputText(run(spec, 'a b'))).toBe('<enter>[a]<enter>[b]<enter>');
	});

	it('uses | to share the next rule’s action', () => {
		const spec = `%%\n"+"  |\n"-"  { printf("op(%s) ", yytext); }\n.|\\n { }\n%%\n`;
		const r = run(spec, '+-');
		expect(outputText(r)).toBe('op(+) op(-) ');
		expect(r.steps[0]).toMatchObject({ rule: 0, actionRule: 1 });
	});
});

describe('yylex: flex library functions', () => {
	it('yyless(n) puts back all but n characters', () => {
		const spec = `%%\nabc   { printf("[%s]", yytext); yyless(1); }\n.     { printf("(%s)", yytext); }\n%%\n`;
		const r = run(spec, 'abc');
		expect(outputText(r)).toBe('[abc](b)(c)');
		expect(r.steps[0]).toMatchObject({ yyless: 1, next: 1 });
	});

	it('yyless keeps yylineno in step with the characters put back', () => {
		const spec = `%option yylineno\n%%\na\\n\\n  { yyless(1); }\n\\n     { printf("%d ", yylineno); }\n.      { }\n%%\n`;
		expect(outputText(run(spec, 'a\n\nb'))).toBe('2 3 ');
	});

	it('input() reads characters after the match', () => {
		const spec = `%%\n"//"   { int c; while ((c = input()) != '\\n' && c != EOF) ; printf("<comment>"); }\n.|\\n   { ECHO; }\n%%\n`;
		const r = run(spec, 'a // note\nb');
		expect(outputText(r)).toBe('a <comment>b');
		expect(r.steps[2]).toMatchObject({ yytext: '//', end: 4, next: 10 });
	});

	it('counts yylineno with %option yylineno', () => {
		const spec = `%option yylineno\n%%\n[a-z]+  { printf("%d:%s ", yylineno, yytext); }\n.|\\n    { }\n%%\n`;
		expect(outputText(run(spec, 'a\nb\n\nc'))).toBe('1:a 2:b 4:c ');
		const plain = compileSpec(spec.replace('%option yylineno\n', ''));
		expect(plain.diagnostics.map((d) => d.message)).toContain(
			'yylineno counts lines only with %option yylineno; without it, it stays 1'
		);
	});

	it('%option nodefault stops at unmatched input like flex', () => {
		const r = run('%option nodefault\n%%\na  { ECHO; }\n%%\n', 'ab');
		expect(outputText(r, 'stdout')).toBe('a');
		expect(outputText(r, 'stderr')).toBe('flex scanner jammed\n');
		expect(r.exitStatus).toBe(2);
	});

	it('ECHO writes to yyout and is marked as echo', () => {
		const r = run('%%\n[a-z]+  { ECHO; printf("!"); }\n%%\n', 'hi');
		expect(r.output.map((c) => [c.text, c.echo, c.inAction])).toEqual([
			['hi', true, true],
			['!', false, true]
		]);
	});

	it('stops a scanner that makes no progress', () => {
		const r = run('%%\na*/b  { }\n%%\n', 'b');
		expect(r.stopped).toMatch(/stuck at input position 0/);
	});

	it('records watched counters after each step (Example 2)', () => {
		const r = run(presetById('example-2')!.value.spec, 'hi \n', { watch: ['nl', 'wd', 'ch'] });
		expect(r.watch).toEqual({ nl: 1, wd: 2, ch: 4 });
		const bumps = counterBumps(r, 'wd');
		expect(bumps.map((b) => [b.step.yytext, b.step.rule])).toEqual([
			[' ', 2],
			['\n', 0]
		]);
	});

	it('reports code nested too deeply instead of failing', () => {
		const deep = `%%\n%%\nint main() { return ${'('.repeat(400)}1${')'.repeat(400)}; }\n`;
		const c = compileSpec(deep);
		expect(c.ok).toBe(false);
		expect(c.diagnostics.map((d) => d.message)).toContain(
			'code is nested too deeply (more than 200 levels)'
		);
		const chain = `%%\n%%\nint main() { return ${Array(400).fill('1').join(' + ')}; }\n`;
		expect(compileSpec(chain).ok).toBe(false);
	});

	it('refuses input that is too long', () => {
		const r = runScanner(compileSpec('%%\n%%\n'), 'x'.repeat(20_001));
		expect(r.ran).toBe(false);
		expect(r.diagnostics[0].message).toMatch(/too long/);
	});

	it('does not run a spec with errors', () => {
		const r = runScanner(compileSpec('%%\n{NOPE}  { }\n%%\n'), 'x');
		expect(r.ran).toBe(false);
	});
});
