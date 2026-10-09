import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import {
	SAMPLES,
	UNDECLARED_SOURCE,
	compile,
	interpretCompilation,
	runCompilation,
	type Phase
} from '$lib/theory/cminus';
import { parseInputs } from '$lib/tools/tiny-vm/input';
import { DEFAULT_PRESET, PRESETS, presetById, presetFor } from './presets';
import { MAX_SOURCE, TABS } from './state';

interface Expected {
	/** The phase that stops the compilation; null when the program compiles. */
	stoppedAt: Phase | null;
	/** What the program prints with the preset's input. */
	output?: number[];
	/** Text every error message of the stopping phase is matched against, in order. */
	errors?: RegExp[];
}

const EXPECTED: Record<string, Expected> = {
	gcd: { stoppedAt: null, output: [6] },
	'factorial-loop': { stoppedAt: null, output: [120] },
	'factorial-recursive': { stoppedAt: null, output: [120] },
	fibonacci: { stoppedAt: null, output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34] },
	sort: { stoppedAt: null, output: [1, 2, 5, 7, 23, 32, 32, 34, 62, 78] },
	blocks: { stoppedAt: null, output: [3, 2, 1] },
	sum: { stoppedAt: null, output: [108] },
	undeclared: { stoppedAt: 'semantic', errors: [/\by\b/, /\bz\b/] },
	'missing-semicolon': { stoppedAt: 'parser', errors: [/;/] },
	'illegal-character': { stoppedAt: 'scanner', errors: [/%/] }
};

const inputsOf = (id: string) => parseInputs(presetById(id)!.value.input).values;

describe('presets', () => {
	it('have unique ids, and the default is the greatest common divisor with input 48 18', () => {
		expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
		expect(Object.keys(EXPECTED).sort()).toEqual(PRESETS.map((p) => p.id).sort());
		expect(DEFAULT_PRESET.id).toBe('gcd');
		expect(DEFAULT_PRESET.value.input).toBe('48 18');
		expect(DEFAULT_PRESET.value.source).toContain('u - u / v * v');
		expect(presetById('nope')).toBeUndefined();
		expect(presetById(null)).toBeUndefined();
	});

	it('each have a one-line description, valid input, a known tab and a program that is compiled', () => {
		for (const p of PRESETS) {
			expect(p.description, p.id).toBeTruthy();
			expect(p.description, p.id).not.toContain('\n');
			expect(parseInputs(p.value.input).invalid, p.id).toEqual([]);
			expect(p.value.source.length, p.id).toBeLessThan(MAX_SOURCE);
			if (p.value.tab) expect(TABS, p.id).toContain(p.value.tab);
			// Lines fit the editor beside the views without scrolling sideways.
			if (p.id !== 'undeclared') {
				for (const line of p.value.source.split('\n'))
					expect(line.length, p.id).toBeLessThanOrEqual(48);
			}
		}
	});

	it.each(PRESETS.map((p) => [p.id]))('%s compiles as intended', (id) => {
		const p = presetById(id)!;
		const expected = EXPECTED[id];
		const c = compile(p.value.source);
		expect(c.stoppedAt).toBe(expected.stoppedAt);
		const errors = c.diagnostics.filter((d) => d.severity === 'error');
		if (expected.stoppedAt === null) {
			expect(c.diagnostics).toEqual([]);
			const run = runCompilation(c, inputsOf(id))!;
			expect(run.stop).toBe('halted');
			expect(run.outputs).toEqual(expected.output);
		} else {
			expect(errors.every((d) => d.phase === expected.stoppedAt)).toBe(true);
			expect(errors).toHaveLength(expected.errors!.length);
			errors.forEach((d, i) => expect(d.message).toMatch(expected.errors![i]));
			expect(runCompilation(c, inputsOf(id))).toBeNull();
		}
	});

	it('print the same with the optimizer off, and as the interpreter does', () => {
		for (const p of PRESETS) {
			const expected = EXPECTED[p.id];
			if (expected.stoppedAt !== null) continue;
			const inputs = inputsOf(p.id);
			const plain = compile(p.value.source, { optimize: false });
			expect(runCompilation(plain, inputs)!.outputs, p.id).toEqual(expected.output);
			const reference = interpretCompilation(compile(p.value.source), inputs)!;
			expect(reference.outputs, p.id).toEqual(expected.output);
			expect(reference.stop, p.id).toBe('halted');
		}
	});

	it('read the same under both identifier rules', () => {
		for (const p of PRESETS) {
			const letters = compile(p.value.source, { identifiers: 'letters' });
			const extended = compile(p.value.source, { identifiers: 'extended' });
			expect(extended.stoppedAt, p.id).toBe(letters.stoppedAt);
			expect(
				extended.scan.tokens.map((t) => [t.type, t.lexeme]),
				p.id
			).toEqual(letters.scan.tokens.map((t) => [t.type, t.lexeme]));
		}
	});

	it('quotes the string of the lecture deck, with its slide, and stops at two undeclared names', () => {
		const p = presetById('undeclared')!;
		expect(p.value.source).toBe('void main (void) { int x; y = input (); output (z); }');
		expect(p.value.source).toBe(UNDECLARED_SOURCE);
		expect(p.cite).toEqual({ deck: '10', slide: 2 });
		expect(formatCitation(p.cite!)).toBe(
			'Ambiguity, Precedence, Associativity & Top-Down Parsing · slide 2'
		);
		expect(p.description).toContain(p.value.source);
		expect(p.value.tab).toBe('semantics');
		// Only that preset cites a slide.
		expect(PRESETS.filter((x) => x.cite).map((x) => x.id)).toEqual(['undeclared']);
	});

	it('show a syntax error and a lexical error in the earlier phases', () => {
		const syntax = compile(presetById('missing-semicolon')!.value.source);
		expect(syntax.scan.diagnostics).toEqual([]);
		expect(syntax.parse!.ok).toBe(false);
		expect(syntax.semantic).toBeNull();
		expect(presetById('missing-semicolon')!.value.tab).toBe('syntax');

		const lexical = compile(presetById('illegal-character')!.value.source);
		const errorTokens = lexical.scan.tokens.filter((t) => t.type === 'ERROR');
		expect(errorTokens.map((t) => t.lexeme)).toEqual(['%']);
		expect(lexical.parse).toBeNull();
		expect(presetById('illegal-character')!.value.tab).toBe('tokens');
	});

	it('use what the descriptions say they use', () => {
		const text = (id: string) => presetById(id)!.value.source;
		expect(text('factorial-loop')).toMatch(/while \(/);
		expect(text('factorial-loop')).not.toMatch(/factorial\(/);
		expect(text('factorial-recursive')).toMatch(/factorial\(n - 1\)/);
		expect(text('fibonacci')).toMatch(/fib\(k - 1\) \+ fib\(k - 2\)/);
		expect(text('sum')).toContain('while ((n = input()) != 0)');

		const sort = compile(text('sort')).semantic!;
		expect(sort.symbols.find((s) => s.name === 'numbers')).toMatchObject({
			kind: 'array',
			size: 10,
			depth: 0
		});
		expect(sort.symbols.find((s) => s.name === 'a')?.kind).toBe('array-parameter');

		const blocks = compile(text('blocks')).semantic!;
		const xs = blocks.symbols.filter((s) => s.name === 'x');
		expect(xs.map((s) => s.depth)).toEqual([0, 1, 2]);
		expect(blocks.scopes.map((s) => s.name)).toEqual(['global', 'store', 'show', 'main', 'main.1']);
	});

	it('are written for this page: none is one of the engine’s sample programs', () => {
		const samples = new Set(SAMPLES.map((s) => s.source));
		for (const p of PRESETS) {
			if (p.id !== 'undeclared') expect(samples.has(p.value.source), p.id).toBe(false);
		}
	});

	it('are found again from the program text', () => {
		for (const p of PRESETS) expect(presetFor({ source: p.value.source })?.id).toBe(p.id);
		expect(presetFor({ source: 'void main(void) { }' })).toBeNull();
	});

	it('say what the programs are, not what the page is for', () => {
		const banned =
			/helps? you|understand|learn|intuition|explore|discover|common mistake|misconception/i;
		for (const p of PRESETS) {
			expect(`${p.label} ${p.description}`, p.id).not.toMatch(banned);
			expect(p.value.source, p.id).not.toMatch(banned);
		}
	});
});
