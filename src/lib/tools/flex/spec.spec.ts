import { describe, expect, it } from 'vitest';
import { presetById } from './presets';
import { compileSpec } from './program';
import { activeRules, eofRule, parseSpec, patternEnd, scName } from './spec';

const messages = (text: string) => parseSpec(text).diagnostics.map((d) => d.message);
/** The text a diagnostic's span covers. */
const spanned = (text: string, i = 0) => {
	const d = parseSpec(text).diagnostics[i];
	return text.slice(d.span!.start, d.span!.end);
};

describe('parseSpec: sections', () => {
	it('splits Example 2 into its three sections and blocks', () => {
		const text = presetById('example-2')!.value.spec;
		const spec = parseSpec(text);
		expect(spec.diagnostics).toEqual([]);
		expect(spec.sections).toEqual({ definitions: [1, 9], rules: [10, 16], user: [17, 22] });
		expect(
			spec.blocks.map((b) => [b.kind, text.slice(b.start, b.end).trim().split('\n')[0]])
		).toEqual([
			['top', '// This spec does NOT work'],
			['user', 'int main ()']
		]);
		expect(
			spec.regions.filter((r) => r.kind === 'comment').map((r) => text.slice(r.start, r.end))
		).toEqual(['/* C-style comments allowed */']);
	});

	it('reads rules: pattern up to unquoted whitespace, then the action', () => {
		const text = `%%\n[ \\t]+   { }\n" x "  ECHO;\n[a-z]{2,3}|\\  { return 1; }\n<<EOF>>  { return 0; }\n%%\n`;
		const spec = parseSpec(text);
		expect(spec.diagnostics).toEqual([]);
		expect(spec.rules.map((r) => [r.patternText, r.actionText, r.eof])).toEqual([
			['[ \\t]+', '{ }', false],
			['" x "', 'ECHO;', false],
			['[a-z]{2,3}|\\ ', '{ return 1; }', false],
			['<<EOF>>', '{ return 0; }', true]
		]);
	});

	it('reads multi-line actions until the braces balance', () => {
		const text = `%%\nx  {\n     printf("}"); /* } */\n     if (1) { ECHO; }\n   }\ny  ECHO;\n%%\n`;
		const spec = parseSpec(text);
		expect(spec.diagnostics).toEqual([]);
		expect(spec.rules.map((r) => r.patternText)).toEqual(['x', 'y']);
		expect(spec.rules[0].actionText.split('\n')).toHaveLength(4);
		expect(spec.rules[1].line).toBe(6);
	});

	it('reads %{ %} code, indented code, options, and start conditions', () => {
		const text = `%{\nint n;\n%}\n  int m;\n%option noyywrap yylineno\n%s A\n%x B C\n%%\n  int local = 0;\n<A,B>x  { }\n<*>y   { }\nz      { }\n%%\n`;
		const spec = parseSpec(text);
		expect(spec.diagnostics).toEqual([]);
		expect(spec.blocks.map((b) => b.kind)).toEqual(['defs', 'defs', 'prologue']);
		expect([...spec.options]).toEqual(['noyywrap', 'yylineno']);
		expect(spec.startConditions.map((s) => [s.name, s.exclusive])).toEqual([
			['A', false],
			['B', true],
			['C', true]
		]);
		expect(spec.rules.map((r) => r.sc)).toEqual([['A', 'B'], ['*'], null]);
		expect([...activeRules(spec, 0)]).toEqual([1, 2]);
		expect([...activeRules(spec, 1)]).toEqual([0, 1, 2]);
		expect([...activeRules(spec, 2)]).toEqual([0, 1]);
		expect([...activeRules(spec, 3)]).toEqual([1]);
		expect(scName(spec, 2)).toBe('B');
	});

	it('picks the <<EOF>> rule for each start condition', () => {
		const spec = parseSpec(`%x S\n%%\n<S><<EOF>>  { return 1; }\n<<EOF>>  { return 2; }\n%%\n`);
		expect(eofRule(spec, 1)?.index).toBe(0);
		expect(eofRule(spec, 0)?.index).toBe(1);
		expect(eofRule(parseSpec('%%\n%%\n'), 0)).toBeNull();
	});

	it('resolves | actions to the next rule', () => {
		const spec = parseSpec(`%%\na  |\nb  |\nc  { }\n%%\n`);
		expect(spec.rules.map((r) => [r.bar, r.actionRule])).toEqual([
			[true, 2],
			[true, 2],
			[false, 2]
		]);
	});

	it('expands definitions into rule patterns', () => {
		const spec = parseSpec(presetById('example-3')!.value.spec);
		const id = spec.rules[1].pattern!;
		expect(id.regex.kind).toBe('ref');
		expect(spec.defs.defs.has('ID')).toBe(true);
	});

	it('finds the end of a pattern', () => {
		const t = '[ ]" "\\ x rest';
		expect(t.slice(0, patternEnd(t, 0, t.length))).toBe('[ ]" "\\ x');
		const u = '[]a ]b c';
		expect(u.slice(0, patternEnd(u, 0, u.length))).toBe('[]a ]b');
		const v = '[[:alpha:] ]+ z';
		expect(v.slice(0, patternEnd(v, 0, v.length))).toBe('[[:alpha:] ]+');
	});
});

describe('parseSpec: diagnostics', () => {
	it('reports a missing %%', () => {
		expect(messages('DIGIT [0-9]\n')).toEqual([
			'missing %%: a flex spec needs a line with %% before its rules'
		]);
	});

	it('reports pattern errors at their position in the spec', () => {
		const text = '%%\n[0-9]+  { }\n{NOPE}   { }\n';
		expect(messages(text)).toEqual(['undefined definition {NOPE}']);
		expect(spanned(text)).toBe('{NOPE}');
	});

	it('reports definition errors at their position', () => {
		const text = 'D  [0-9\n%%\n';
		expect(messages(text)[0]).toBe('unterminated class: missing ]');
		expect(parseSpec(text).diagnostics[0].span!.start).toBeGreaterThanOrEqual(3);
	});

	it('reports unclosed blocks and actions', () => {
		expect(messages('%top{\n int x;\n')).toContain('%top{ is never closed; add a line with }');
		expect(messages('%{\nint x;\n%%\n')).toContain('%{ is never closed; add a line with %}');
		expect(messages('%%\nx  { printf("a");\n')).toContain(
			'this { is never closed, so the action runs to the end of the file'
		);
		expect(messages('/* open\n%%\n')).toContain('comment /* is never closed');
	});

	it('reports undeclared start conditions, scopes, and // comments', () => {
		expect(messages('%%\n<S>x  { }\n')).toEqual([
			'start condition S is not declared with %s or %x'
		]);
		expect(messages('%x S\n%%\n<S>{\nx  { }\n}\n')).toEqual([
			'start condition scopes <SC>{ … } are not supported; put <SC> before each rule'
		]);
		expect(messages('%%\n// note\n')).toEqual([
			'flex does not read // comments between rules; use an indented /* … */ comment'
		]);
	});

	it('reports unknown directives, options, and bad definition lines', () => {
		expect(messages('%foo\n%%\n')).toEqual(['unknown directive %foo']);
		expect(messages('%option case-insensitive\n%%\n')).toEqual([
			'case-insensitive scanners are not supported in this playground'
		]);
		expect(messages('DIGIT\n%%\n')).toEqual(['definition DIGIT has no pattern']);
		expect(messages('= [0-9]\n%%\n')[0]).toMatch(/expected a definition/);
		expect(messages('%%\na  |\n')).toEqual([
			'| means "same action as the next rule", but no rule follows'
		]);
	});

	it('warns about code between rules', () => {
		expect(messages('%%\na  { }\n  int x;\nb  { }\n')).toEqual([
			'indented code between rules is ignored; an action must start on the same line as its pattern'
		]);
	});

	it('compiles C errors in actions to spec positions', () => {
		const text = '%%\na  { printf("x") }\n%%\n';
		const c = compileSpec(text);
		const d = c.diagnostics.find((x) => x.severity === 'error')!;
		expect(d.message).toBe('expected ; after printf(…)');
		expect(text.slice(0, d.span!.start)).toBe('%%\na  { printf("x")');
		expect(c.ok).toBe(false);
	});

	it('reports flex globals declared without extern', () => {
		const c = compileSpec('%{\nint yylineno;\nextern char *yytext;\n%}\n%%\n');
		expect(c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([
			'yylineno is defined by flex; declare it with extern if needed'
		]);
	});
});
