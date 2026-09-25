import { describe, expect, it } from 'vitest';
import { parseDefinitions, parseRegex, printRegex, type Regex } from '$lib/theory/regex';
import {
	expandedByDefault,
	nodeText,
	ruleFor,
	singleSymbolStrings,
	superscript,
	visibleRows,
	type RuleContext
} from './tree';
import { CharSet } from '$lib/theory/charset';
import { FLEX_DOT } from '$lib/theory/regex';

function re(text: string, defs = ''): Regex {
	const r = parseRegex(text, { defs: parseDefinitions(defs).defs });
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return r.regex;
}

const lecture: RuleContext = { dialect: 'lecture', text: (n) => nodeText(n, {}) };

describe('ruleFor', () => {
	it('writes the slide rules for each clause', () => {
		const rule = (text: string) => ruleFor(re(text), lecture);
		expect(rule("'c'")).toBe('L(\'c\') = { "c" }');
		expect(rule('ɸ')).toBe('L(ɸ) = { }');
		expect(rule('ε')).toBe('L(ε) = { "" }');
		expect(rule("'i' 'f'")).toBe('L(AB) = { ab | a ∈ L(A) and b ∈ L(B) }');
		expect(rule('a | b')).toBe('L(A | B) = { s | s ∈ L(A) or s ∈ L(B) }');
		expect(rule('a*')).toBe('L(A*) = { "" } ∪ L(A) ∪ L(AA) ∪ …');
		expect(rule('a+')).toBe('L(A+) = L(A A*)');
		expect(rule('a^3')).toBe('L(A³) = L(A A A)');
		expect(rule('a^12')).toBe('L(A¹²) = L(A A … A), A repeated 12 times');
		expect(rule('a?')).toBe('L(A?) = L(A | ε)');
		expect(rule('Σ')).toBe('L(Σ) = { "c" | c ∈ Σ }');
	});

	it('writes bounded repetition', () => {
		const rule = (text: string) => ruleFor(re(text), lecture);
		expect(rule('a^{2,4}')).toBe('L(A^{2,4}) = L(A²) ∪ L(A³) ∪ L(A⁴)');
		expect(rule('a^{1,9}')).toBe('L(A^{1,9}) = L(A¹) ∪ L(A²) ∪ … ∪ L(A⁹)');
		expect(rule('a^{2,}')).toBe('L(A^{2,}) = L(A² A*)');
		expect(ruleFor(re('a^{0,}'), { ...lecture, dialect: 'flex' })).toBe('L(A{0,}) = L(A*)');
	});

	it('writes out ranges and classes', () => {
		expect(ruleFor(re("'0' | '1' | … | '9'"), lecture)).toBe(
			'L(\'0\' | \'1\' | … | \'9\') = { "0", "1", …, "9" }'
		);
		expect(singleSymbolStrings(CharSet.of('abc'))).toBe('{ "a", "b", "c" }');
		expect(singleSymbolStrings(FLEX_DOT)).toBe('{ "c" | c ∉ { "\\n" } }');
	});

	it('shows a definition as written', () => {
		const r = re('digit', "digit = '0' | … | '9'");
		expect(ruleFor(r, { ...lecture, definition: () => "'0' | … | '9'" })).toBe(
			"digit = '0' | … | '9'"
		);
		expect(ruleFor(r, lecture)).toBe('digit = [0-9]');
		expect(ruleFor(r, { ...lecture, dialect: 'flex', definition: () => '[0-9]' })).toBe(
			'{digit} = [0-9]'
		);
	});
});

describe('nodeText', () => {
	it('prints sub-expressions, keeping ranges written with …', () => {
		expect(nodeText(re("'0' | '1' | … | '9'"), {})).toBe("'0' | '1' | … | '9'");
		expect(nodeText(re('(0 | 1)*00'), { symbols: 'bare' })).toBe('(0 | 1)* 0 0');
		expect(nodeText(re('(0 | 1)*00'), { parens: 'full' })).toBe("(('0' | '1')*) '0' '0'");
	});
});

describe('visibleRows', () => {
	const defs = "letter = 'a' | 'b'\ndigit = '0' | '1'";
	const r = re('letter (letter | digit)*', defs);

	it('lists expanded nodes in pre-order, with definitions closed', () => {
		const { rows } = visibleRows(r, (_, n) => expandedByDefault(n));
		expect(rows.map((row) => `${row.key}:${printRegex(row.node)}`)).toEqual([
			':letter (letter | digit)*',
			'0:letter',
			'1:(letter | digit)*',
			'1.0:letter | digit',
			'1.0.0:letter',
			'1.0.1:digit'
		]);
		expect(rows[1]).toMatchObject({ hasChildren: true, expanded: false, parent: '', depth: 1 });
	});

	it('opens a definition when asked and stops at the limit', () => {
		const { rows } = visibleRows(r, (key, n) => key === '0' || expandedByDefault(n));
		expect(rows[2].key).toBe('0.0');
		const cut = visibleRows(r, () => true, 3);
		expect(cut.rows).toHaveLength(3);
		expect(cut.truncated).toBe(true);
	});

	it('keeps quoted literals closed', () => {
		expect(expandedByDefault(re("'if'"))).toBe(false);
		expect(expandedByDefault(re("'i' 'f'"))).toBe(true);
	});
});

describe('superscript', () => {
	it('writes digits as superscripts', () => {
		expect(superscript(1024)).toBe('¹⁰²⁴');
	});
});
