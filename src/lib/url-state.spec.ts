import { describe, expect, it } from 'vitest';
import { decode, encode, HASH_VERSION, readHash } from './url-state';

interface ToolState {
	regex: string;
	input: string;
	step: number;
	options: { minimal: boolean };
}

const isToolState = (v: unknown): v is ToolState =>
	typeof v === 'object' &&
	v !== null &&
	typeof (v as ToolState).regex === 'string' &&
	typeof (v as ToolState).step === 'number';

describe('encode / decode', () => {
	it('round-trips plain JSON values', () => {
		const values: unknown[] = [
			{ regex: '(0 | 1)*00', input: '1100', step: 3, options: { minimal: true } },
			[1, 2, 3],
			'text',
			0,
			false,
			{ nested: { deep: [{ a: null }] } }
		];
		for (const v of values) expect(decode(encode(v))).toEqual(v);
	});

	it('round-trips lecture symbols, whitespace, and non-BMP characters', () => {
		const v = { re: "ε | ɸ | Σ | '\\t' | ‘if’", text: 'a\tb\nc\r\n "q" \\ 😀 ⁺³' };
		expect(decode(encode(v))).toEqual(v);
	});

	it('produces a URL-safe, versioned string', () => {
		const text = encode({ regex: "('a' | 'b')* 'abb'", input: 'a b/c?d#e&f=g%h' });
		expect(text.startsWith(`v${HASH_VERSION}.`)).toBe(true);
		expect(text).toMatch(/^[A-Za-z0-9+\-$.]+$/);
		expect(encodeURIComponent(text).replace(/%24/g, '$').replace(/%2B/g, '+')).toBe(text);
	});

	it('ignores a leading #', () => {
		const v = { step: 2 };
		expect(decode('#' + encode(v))).toEqual(v);
	});

	it('returns null for bad input instead of throwing', () => {
		const good = encode({ regex: 'a*', step: 1 });
		const bad = [
			'',
			'#',
			'#section-anchor',
			'v1.',
			'v1.!!!!',
			'v1.notlzstring',
			good.slice(0, good.length - 6),
			'v2.' + good.slice(3),
			'N4IgdghgtgpiBcIA',
			encode(null)
		];
		for (const text of bad) expect(decode(text)).toBeNull();
	});

	it('applies the validator', () => {
		expect(
			decode(encode({ regex: 'a', input: '', step: 0, options: { minimal: false } }), isToolState)
		).not.toBeNull();
		expect(decode(encode({ regex: 42 }), isToolState)).toBeNull();
		expect(decode(encode([1, 2]), isToolState)).toBeNull();
	});

	it('encodes undefined as an empty string', () => {
		expect(encode(undefined)).toBe('');
		expect(decode(encode(undefined))).toBeNull();
	});
});

describe('readHash', () => {
	it('is safe on the server', () => {
		expect(readHash()).toBeNull();
	});
});
