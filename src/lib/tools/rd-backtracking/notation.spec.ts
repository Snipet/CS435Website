import { describe, expect, it } from 'vitest';
import { asciiText, joinPieces, piecesOf, plainText, subscript, text } from './notation';

describe('pieces', () => {
	it('writes subscripts with subscript digits or with plain digits', () => {
		const pieces = [{ text: 'E', sub: '0' }, text(' → '), { text: 'T', sub: '12' }];
		expect(plainText(pieces)).toBe('E₀ → T₁₂');
		expect(asciiText(pieces)).toBe('E0 → T12');
		expect(subscript(305)).toBe('₃₀₅');
		expect(subscript('k')).toBe('k');
	});

	it('keeps a name that ends in a digit apart from its number', () => {
		expect(asciiText([{ text: 'T1', sub: '2' }])).toBe('T1_2');
		expect(asciiText([{ text: 'E_', sub: '2' }])).toBe('E_2');
		expect(plainText([{ text: 'T1', sub: '2' }])).toBe('T1₂');
	});

	it('joins lists as the messages write them', () => {
		const a = [text('a')];
		const b = [text('b')];
		const c = [text('c')];
		expect(plainText(joinPieces([]))).toBe('');
		expect(plainText(joinPieces([a]))).toBe('a');
		expect(plainText(joinPieces([a, b]))).toBe('a and b');
		expect(plainText(joinPieces([a, b, c]))).toBe('a, b and c');
		expect(plainText(joinPieces([a, b, c], ' && ', ' && '))).toBe('a && b && c');
	});

	it('reads subscript characters back as subscripts', () => {
		expect(piecesOf('t₁ t₂ … tₖ A …')).toEqual([
			{ text: 't', sub: '1' },
			{ text: ' t', sub: '2' },
			{ text: ' … t', sub: 'k' },
			{ text: ' A …' }
		]);
		expect(piecesOf('bool T₁₂() { ? }')).toEqual([
			{ text: 'bool T', sub: '12' },
			{ text: '() { ? }' }
		]);
		expect(piecesOf('')).toEqual([]);
		expect(piecesOf('plain')).toEqual([{ text: 'plain' }]);
		for (const s of ['E₀ → T₁ + E₂', 'T₂ and T₁', 'no subscripts', '₃ first'])
			expect(plainText(piecesOf(s))).toBe(s);
	});
});
