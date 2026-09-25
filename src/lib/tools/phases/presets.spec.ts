import { describe, expect, it } from 'vitest';
import { decks } from '$lib/lectures';
import { tool } from '$lib/tools/catalog/phases';
import { compile, MAX_SOURCE } from './pipeline';
import { DEFAULT_PRESET, PRESETS, presetFor } from './presets';
import { scan, tokenName } from './scanner';
import { capList, MAX_LISTED, phaseNotes, slideFootnoteIndex } from './notes';
import type { Decl } from './semantic';

describe('presets', () => {
	it('have unique ids and cite real decks', () => {
		expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
		for (const p of PRESETS) {
			if (p.cite) expect(decks[p.cite.deck]).toBeDefined();
			for (const q of p.questions ?? []) expect(decks[q.cite.deck]).toBeDefined();
		}
	});

	it.each(PRESETS.map((p) => [p.id, p] as const))(
		'%s loads without errors in its input',
		(_, p) => {
			const c = compile(p.value.source, p.value.decls);
			expect(c.truncated).toBe(false);
			expect(c.declarations.hasErrors).toBe(false);
			expect(c.scan.diagnostics).toEqual([]);
			expect(c.parse?.diagnostics).toEqual([]);
			if (p.semanticError) {
				// These presets show the semantic analyzer's error on purpose.
				expect(c.stoppedAt).toBe('semantic');
				expect(c.semantic!.diagnostics).toHaveLength(1);
			} else {
				expect(c.stoppedAt).toBeNull();
				expect(c.diagnostics).toEqual([]);
				expect(c.peephole!.code.length).toBeGreaterThan(0);
			}
		}
	);

	it('are found again from the state they load', () => {
		for (const p of PRESETS) expect(presetFor(p.value)?.id).toBe(p.id);
		expect(presetFor({ source: 'A= B1 +C;', decls: DEFAULT_PRESET.value.decls })).toBeNull();
	});

	it('the default is the seven-phase slide', () => {
		expect(DEFAULT_PRESET.value.source).toBe('A= B1   +C;');
		expect(DEFAULT_PRESET.value.view).toBe('seven');
	});

	it('answers the structure slides’ questions as the scanner does', () => {
		const p = PRESETS.find((x) => x.id === 'if-then-else')!;
		const tokens = scan(p.value.source).tokens;
		const [lexemes, names] = p.questions!;
		expect(lexemes.answer).toBe(tokens.map((t) => t.lexeme).join(', '));
		expect(names.answer).toBe(tokens.map((t) => tokenName(t.kind, 'five')).join(', '));
	});

	it('report the semantic errors they are meant to show', () => {
		const message = (id: string) => {
			const p = PRESETS.find((x) => x.id === id)!;
			return compile(p.value.source, p.value.decls).semantic!.diagnostics[0].message;
		};
		expect(message('undeclared')).toBe('D is not declared.');
		expect(message('float-to-int')).toBe('A float value cannot be assigned to B1, which is int.');
	});
});

describe('compile', () => {
	it('stops at the first phase with an error', () => {
		expect(compile('A = @;', DEFAULT_PRESET.value.decls).stoppedAt).toBe('scanner');
		expect(compile('A = ;', DEFAULT_PRESET.value.decls).stoppedAt).toBe('parser');
		const c = compile('A = B1;', [{ name: '1', type: 'int', value: '' }]);
		expect(c.stoppedAt).toBe('semantic');
		expect(c.tac).toBeNull();
	});

	it('stops when the declarations table has an error', () => {
		const c = compile('A = 1;', [{ name: 'A', type: 'int', value: 'x' }]);
		expect(c.declarations.hasErrors).toBe(true);
		expect(c.stoppedAt).toBe('semantic');
	});

	it('compiles the empty program to nothing', () => {
		const c = compile('', []);
		expect(c.stoppedAt).toBeNull();
		expect(c.tac).toEqual([]);
		expect(c.peephole!.code).toEqual([]);
	});

	it('cuts off very long sources', () => {
		const c = compile('A = B1; '.repeat(1000), DEFAULT_PRESET.value.decls);
		expect(c.truncated).toBe(true);
		expect(c.source.length).toBe(MAX_SOURCE);
	});

	it('compiles 4000-character expressions quickly, with short notes and checks', () => {
		const decls: Decl[] = [
			{ name: 'x', type: 'int', value: '' },
			{ name: 'a', type: 'int', value: '' },
			{ name: 'F', type: 'float', value: '' },
			{ name: 'G', type: 'float', value: '' }
		];
		for (const source of [
			`x = a${'+a'.repeat(1990)};`,
			`F = G${'+a'.repeat(1990)};`,
			`A = C${'+B1'.repeat(1320)};`
		]) {
			const d = source.startsWith('A') ? DEFAULT_PRESET.value.decls : decls;
			compile(source, d);
			const t0 = performance.now();
			const c = compile(source, d);
			const notes = phaseNotes(c);
			expect(performance.now() - t0).toBeLessThan(200);
			expect(c.truncated).toBe(false);
			expect(c.stoppedAt).toBeNull();
			const texts = [...c.semantic!.checks.map((k) => k.text), ...Object.values(notes).flat()];
			for (const text of texts) expect(text.length).toBeLessThanOrEqual(200);
		}
	});

	it('handles a long program quickly', () => {
		const source = Array.from(
			{ length: 60 },
			(_, i) => `if B1 < ${i} then A = A + C * ${i}; else A = B1;`
		).join('\n');
		const t0 = performance.now();
		const c = compile(source, DEFAULT_PRESET.value.decls);
		expect(c.stoppedAt).toBeNull();
		expect(performance.now() - t0).toBeLessThan(1500);
	});
});

describe('phaseNotes', () => {
	it('describes the slide’s example', () => {
		const notes = phaseNotes(compile('A= B1   +C;', DEFAULT_PRESET.value.decls));
		expect(notes.scanner).toEqual([
			'6 tokens. Whitespace separates lexemes and produces no token.'
		]);
		expect(notes.semantic).toEqual(['int2fp inserted: B1 is int in the float operation B1 + C.']);
		expect(notes.icg).toEqual(['3 quads; temporaries t1 and t2.']);
		expect(notes.optimizer).toEqual([
			'C is the constant 2.3: C → #2.3.',
			't2 removed: + writes A directly instead of copying t2 to it.'
		]);
		expect(notes.peephole).toEqual([
			'MOVF #2.3,r1 ; ADDF2 r1,r2 → ADDF2 #2.3,r2 (r1 is not used afterwards).'
		]);
	});

	it('shortens a long list of temporaries and labels', () => {
		const source = 'if B1 < 1 then A = B1 + B1 + B1; '.repeat(4);
		const notes = phaseNotes(compile(source, DEFAULT_PRESET.value.decls));
		expect(notes.icg).toEqual([
			'28 quads; temporaries t1, t2, t3, …, t16; labels L1, L2, L3, …, L8.'
		]);
	});
});

describe('slideFootnoteIndex', () => {
	const index = (source: string) =>
		slideFootnoteIndex(compile(source, DEFAULT_PRESET.value.decls).code);

	it('marks CVTLF only in the slide’s own code', () => {
		expect(index('A= B1   +C;')).toBe(0);
		expect(index('A = B1 + C;')).toBe(0);
		expect(index('if B1 < C then A = C; else A = B1;')).toBe(-1);
		expect(index('A = B1;')).toBe(-1);
		expect(index('A = B1 * 2.5;')).toBe(-1);
		expect(index('A = B1 + B1;')).toBe(-1);
	});

	it('applies to the seven-phase preset only', () => {
		const marked = PRESETS.filter(
			(p) => slideFootnoteIndex(compile(p.value.source, p.value.decls).code) >= 0
		);
		expect(marked.map((p) => p.id)).toEqual(['seven-phases']);
	});
});

describe('capList', () => {
	it('keeps the first items and counts the rest', () => {
		const items = Array.from({ length: MAX_LISTED + 5 }, (_, i) => i);
		expect(capList(items)).toEqual({ shown: items.slice(0, MAX_LISTED), more: 5 });
		expect(capList([1, 2])).toEqual({ shown: [1, 2], more: 0 });
	});
});

describe('catalog entry', () => {
	it('registers the tool', () => {
		expect(tool.slug).toBe('phases');
		expect(tool.stage).toBe('overview');
		expect(tool.order).toBe(10);
	});
});
