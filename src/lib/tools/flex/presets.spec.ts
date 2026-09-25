import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { presets, presetById, DEFAULT_PRESET_ID } from './presets';
import { compileSpec } from './program';
import { outputText, runScanner } from './runtime';
import { wcCounts } from './wc';

describe('flex presets', () => {
	it('has unique ids and the default preset', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		expect(presetById(DEFAULT_PRESET_ID)?.label).toMatch(/Example 3/);
	});

	for (const preset of presets) {
		describe(preset.label, () => {
			const compiled = compileSpec(preset.value.spec);

			it('compiles without errors or warnings', () => {
				expect(compiled.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
				expect(compiled.ok).toBe(true);
			});

			it('uses straight quotes only', () => {
				expect(preset.value.spec).not.toMatch(/[“”‘’]/);
			});

			for (const sample of preset.value.inputs) {
				it(`prints the expected output for ${JSON.stringify(sample.value)}`, () => {
					const run = runScanner(compiled, sample.value);
					expect(run.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
					expect(run.stopped).toBeNull();
					expect(outputText(run, 'stdout')).toBe(sample.stdout);
					expect(run.exitStatus).toBe(0);
				});
				if (sample.wc) {
					it(`wc reports ${sample.wc.join(' ')} for ${JSON.stringify(sample.value)}`, () => {
						const c = wcCounts(sample.value);
						expect([c.lines, c.words, c.chars]).toEqual(sample.wc);
					});
				}
			}
		});
	}

	it('cites the flex deck slides for the lecture examples', () => {
		const cited = presets.filter((p) => p.cite).map((p) => formatCitation(p.cite!));
		expect(cited).toEqual([
			'Lexical Analysis III (cont’d) · slide 8',
			'Lexical Analysis III (cont’d) · slide 9',
			'Lexical Analysis III (cont’d) · slide 10'
		]);
	});
});

describe('lecture examples as printed on the slides', () => {
	it('Example 1 keeps the slide layout (two rules, main calling yylex)', () => {
		const spec = presetById('example-1')!.value.spec;
		expect(spec).toContain('[0-9]+  { printf ("%s\\n", yytext); }');
		expect(spec).toContain('.|\\n    { }');
		const c = compileSpec(spec);
		expect(c.spec.rules.map((r) => r.patternText)).toEqual(['[0-9]+', '.|\\n']);
	});

	it('Example 2 has the DELIM definition and four rules', () => {
		const c = compileSpec(presetById('example-2')!.value.spec);
		expect(c.spec.definitions.map((d) => [d.name, d.text])).toEqual([['DELIM', '[ \\t]+']]);
		expect(c.spec.rules.map((r) => r.patternText)).toEqual(['\\n', '^{DELIM}', '{DELIM}', '.']);
	});

	it('Example 3 defines ID in terms of LETTER and DIGIT', () => {
		const c = compileSpec(presetById('example-3')!.value.spec);
		expect(c.spec.definitions.map((d) => d.name)).toEqual(['DIGIT', 'LETTER', 'ID']);
		expect(c.spec.rules.map((r) => r.patternText)).toEqual(['{DIGIT}+', '{ID}', '.']);
	});
});
