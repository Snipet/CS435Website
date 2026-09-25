import { describe, expect, it } from 'vitest';
import { scan } from '$lib/theory/automata';
import { parseDefinitions } from '$lib/theory/regex';
import { parseRules } from './rules';

const DEFS = parseDefinitions("digit = '0' | … | '9'\nletter = 'a' | … | 'z'");

describe('parseRules', () => {
	it('reads Name = RE lines in order, skipping blanks and comments', () => {
		const text =
			"// keywords first\nIf = 'if'\n\nInteger = digit+\nIdentifier = letter (letter | digit)*\n";
		const { rules, diagnostics } = parseRules(text, DEFS);
		expect(diagnostics).toEqual([]);
		expect(rules.map((r) => r.name)).toEqual(['If', 'Integer', 'Identifier']);
		// Maximal munch, ties to the earlier rule.
		expect(scan(rules, 'if9').tokens.map((t) => `${t.name}:${t.lexeme}`)).toEqual([
			'Identifier:if9'
		]);
		expect(scan(rules, 'if').tokens.map((t) => t.name)).toEqual(['If']);
		expect(scan(rules, '42').tokens.map((t) => t.name)).toEqual(['Integer']);
	});

	it('reports a line without =', () => {
		const text = 'If = x\nInteger digit+';
		const { diagnostics } = parseRules(text, DEFS);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toMatch(/Name = RE/);
		expect(text.slice(diagnostics[0].span!.start, diagnostics[0].span!.end)).toBe('Integer digit+');
	});

	it('reports bad and missing names at the name', () => {
		const text = "1st = 'a'\n = 'b'";
		const { diagnostics } = parseRules(text, DEFS);
		expect(diagnostics.map((d) => text.slice(d.span!.start, d.span!.end))).toEqual(['1st', '=']);
	});

	it('moves RE diagnostics to their place in the rules text', () => {
		const text = "If = 'if'\nBad = (a | b";
		const { rules, diagnostics } = parseRules(text, DEFS);
		expect(rules.map((r) => r.name)).toEqual(['If']);
		const errors = diagnostics.filter((d) => d.severity === 'error');
		expect(errors.length).toBeGreaterThan(0);
		const start = text.indexOf('(a | b');
		for (const d of errors) {
			expect(d.span!.start).toBeGreaterThanOrEqual(start);
			expect(d.span!.end).toBeLessThanOrEqual(text.length);
			expect(d.span!.source).toBeNull();
		}
	});

	it('asks for a rule when there is none', () => {
		const { rules, diagnostics } = parseRules('// nothing\n', DEFS);
		expect(rules).toEqual([]);
		expect(diagnostics[0]).toMatchObject({ severity: 'error' });
	});

	it('uses the definitions, and reports uses of broken ones', () => {
		const defs = parseDefinitions('digit = (0');
		const { diagnostics } = parseRules('Integer = digit+', defs);
		expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
	});
});
