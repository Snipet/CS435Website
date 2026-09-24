import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { formatLabel } from '$lib/theory/chars';
import { labelText, parseLabelText, type ParsedLabel } from './label-text';

function parse(text: string, names?: { name: string; set: CharSet }[]): ParsedLabel {
	const r = parseLabelText(text, { names });
	if (!r.ok) throw new Error(r.diagnostic.message);
	return r.label;
}

const sym = (text: string, names?: { name: string; set: CharSet }[]) => parse(text, names).symbols;

describe('parseLabelText', () => {
	it('reads comma- or space-separated symbols', () => {
		expect(sym('0,1').equals(CharSet.of('01'))).toBe(true);
		expect(sym(' 0 , 1 ').equals(CharSet.of('01'))).toBe(true);
		expect(sym('a b c').equals(CharSet.of('abc'))).toBe(true);
		expect(parse('')).toEqual({ symbols: CharSet.EMPTY, epsilon: false });
	});

	it('reads ε in its spellings', () => {
		for (const t of ['ε', 'ϵ', '\\e', 'eps', 'epsilon'])
			expect(parse(t)).toEqual({ symbols: CharSet.EMPTY, epsilon: true });
		const both = parse('ε, a');
		expect(both.epsilon).toBe(true);
		expect(both.symbols.equals(CharSet.of('a'))).toBe(true);
	});

	it('reads quoted symbols, escapes and the visible space', () => {
		expect(sym("' '").equals(CharSet.of(' '))).toBe(true);
		expect(sym('␣').equals(CharSet.of(' '))).toBe(true);
		expect(sym("','").equals(CharSet.of(','))).toBe(true);
		expect(sym('\\,').equals(CharSet.of(','))).toBe(true);
		expect(sym("'\\''").equals(CharSet.of("'"))).toBe(true);
		expect(sym('"x"').equals(CharSet.of('x'))).toBe(true);
		expect(sym('‘y’').equals(CharSet.of('y'))).toBe(true);
		expect(sym('\\t,\\n').equals(CharSet.of('\t\n'))).toBe(true);
		expect(sym('\\x41').equals(CharSet.of('A'))).toBe(true);
		expect(sym('\\u{3B5}').equals(CharSet.of('ε'))).toBe(true);
		expect(sym("'ε'").equals(CharSet.of('ε'))).toBe(true);
		expect(sym('-').equals(CharSet.of('-'))).toBe(true);
	});

	it('reads ranges and classes', () => {
		expect(sym('a-z').equals(CharSet.range('a', 'z'))).toBe(true);
		expect(sym('0–9').equals(CharSet.range('0', '9'))).toBe(true);
		expect(sym('[a-cx]').equals(CharSet.of('abcx'))).toBe(true);
		expect(sym('[^\\n]').equals(CharSet.single('\n').complement())).toBe(true);
	});

	it('reads named sets', () => {
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		expect(sym('digit, x', [digit]).equals(CharSet.range('0', '9').union(CharSet.of('x')))).toBe(
			true
		);
	});

	it('rejects a range typed with spaces, and reads the dash as a symbol otherwise', () => {
		const spaced = parseLabelText('0, a - z');
		expect(spaced.ok).toBe(false);
		if (!spaced.ok) {
			expect(spaced.diagnostic.span).toEqual({ start: 3, end: 8, source: null });
			expect(spaced.diagnostic.message).toContain('a-z');
		}
		expect(parseLabelText('a – z').ok).toBe(false);
		expect(sym('a, -, z').equals(CharSet.of('a-z'))).toBe(true);
		expect(sym("a '-' z").equals(CharSet.of('a-z'))).toBe(true);
		expect(sym('a -, z').equals(CharSet.of('a-z'))).toBe(true);
		// Only between two single symbols.
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		expect(parse('digit - x', [digit]).symbols.has('-')).toBe(true);
		expect(parse('ε - x').epsilon).toBe(true);
	});

	it('reports problems with a span', () => {
		const word = parseLabelText('0, other');
		expect(word.ok).toBe(false);
		if (!word.ok) {
			expect(word.diagnostic.severity).toBe('error');
			expect(word.diagnostic.span).toEqual({ start: 3, end: 8, source: null });
		}
		expect(parseLabelText("'ab'").ok).toBe(false);
		expect(parseLabelText("'a").ok).toBe(false);
		expect(parseLabelText('z-a').ok).toBe(false);
		expect(parseLabelText('[a-').ok).toBe(false);
		expect(parseLabelText('\\x4').ok).toBe(false);
	});
});

describe('labelText', () => {
	const samples: (CharSet | null)[] = [
		null,
		CharSet.of('01'),
		CharSet.range('a', 'z'),
		CharSet.range('a', 'z').union(CharSet.range('A', 'Z')).union(CharSet.of('_')),
		CharSet.of(' ,\'"\\-–[]␣εϵ'),
		CharSet.of('\t\n\r\0'),
		CharSet.fromCodePoints([0x7f, 0x2028, 0x1f600]),
		CharSet.single('\n').complement(),
		CharSet.of('=>').complement(),
		CharSet.of('ab')
	];

	it('round-trips through parseLabelText', () => {
		for (const s of samples) {
			const text = labelText(s);
			const back = parse(text);
			if (s === null) expect(back).toEqual({ symbols: CharSet.EMPTY, epsilon: true });
			else {
				expect(back.epsilon).toBe(false);
				expect(back.symbols.equals(s), `${text} → ${back.symbols}`).toBe(true);
			}
		}
	});

	it('quotes symbols spelled like a name, so they read back as symbols', () => {
		const names = [
			{ name: 'e', set: CharSet.of('xyz') },
			{ name: 'L', set: CharSet.range('a', 'z') },
			{ name: 'a-c', set: CharSet.of('q') }
		];
		for (const s of [
			CharSet.of('e'),
			CharSet.of('LM'),
			CharSet.of('eL'),
			CharSet.range('a', 'c'),
			CharSet.range('K', 'M')
		]) {
			const text = labelText(s, { names });
			expect(parse(text, names).symbols.equals(s), `${text}`).toBe(true);
		}
		expect(labelText(CharSet.of('e'), { names })).toBe("'e'");
		expect(labelText(CharSet.of('xyz'), { names })).toBe('e');
	});

	it('reads like an edge label', () => {
		expect(labelText(CharSet.of('01'))).toBe('0,1');
		expect(labelText(CharSet.range('a', 'z'))).toBe('a-z');
		expect(labelText(CharSet.of(' '))).toBe("' '");
		expect(labelText(null)).toBe('ε');
		expect(labelText(CharSet.single('\n').complement())).toBe('[^\\n]');
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		expect(labelText(CharSet.range('0', '9'), { names: [digit] })).toBe('digit');
	});

	it('also reads the display form of formatLabel', () => {
		for (const s of samples.slice(1, 4))
			expect(parse(formatLabel(s!)).symbols.equals(s!)).toBe(true);
	});
});
