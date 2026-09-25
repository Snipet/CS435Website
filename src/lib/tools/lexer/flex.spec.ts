import { describe, expect, it } from 'vitest';
import { parseFlexPattern } from '$lib/theory/regex';
import { regexToDfa, compareLanguages } from '$lib/theory/automata';
import { cString, printAction, toFlexSpec } from './flex';
import { presetById, presets } from './presets';
import { buildSpec } from './spec';

describe('toFlexSpec', () => {
	it('writes one pattern per rule with printf actions, dropped rules empty', () => {
		const p = presetById('drop-whitespace')!;
		const spec = buildSpec(p.value.defs ?? '', p.value.rules);
		const { spec: text, skipped } = toFlexSpec(spec.rules, { errorRule: true });
		expect(skipped).toEqual([]);
		const body = text.split('\n%%\n')[1].trim().split('\n');
		expect(body).toHaveLength(5);
		expect(body[0]).toMatch(/^" "\+ +\{ \}$/);
		expect(body[3].startsWith('\\+ ')).toBe(true);
		expect(body[3].endsWith(' { printf("(%s, \\"%s\\")\\n", "Plus", yytext); }')).toBe(true);
		expect(body[4]).toMatch(/^\.\|\\n +\{ printf\(.*"Error", yytext\); \}$/);
		expect(text.startsWith('%top{\n  #include <stdio.h>\n}\n\n%%\n')).toBe(true);
		expect(text).toContain('int main ()');
	});

	it('prints patterns that flex reads back as the same languages', () => {
		for (const p of presets) {
			const spec = buildSpec(p.value.defs ?? '', p.value.rules);
			const { spec: text } = toFlexSpec(spec.rules);
			const lines = text.split('\n%%\n')[1].trim().split('\n');
			spec.rules.forEach((r, i) => {
				const pattern = lines[i].split(/ {2,}\{/)[0].trimEnd();
				const parsed = parseFlexPattern(pattern);
				expect(parsed.ok, `${p.id} ${r.name}: ${pattern}`).toBe(true);
				if (!parsed.ok || !r.regex) return;
				const same = compareLanguages(regexToDfa(r.regex), regexToDfa(parsed.pattern.regex));
				expect(same.equivalent, `${p.id} ${r.name}`).toBe(true);
			});
		}
	});

	it('uses the angle format when asked', () => {
		expect(printAction('ID', 'angle')).toBe(`{ printf("<%s,'%s'>\\n", "ID", yytext); }`);
	});

	it('leaves out rules with problems', () => {
		const spec = buildSpec('', [
			{ name: 'A', re: "'a'" },
			{ name: 'B', re: "'b" }
		]);
		expect(toFlexSpec(spec.rules).skipped).toEqual([2]);
	});

	it('escapes names for C', () => {
		expect(cString('a"b\\c')).toBe('"a\\"b\\\\c"');
	});
});
