import { describe, expect, it } from 'vitest';
import { citationParts, formatCitation } from './lectures';

describe('formatCitation', () => {
	it('writes the deck title and the slides', () => {
		expect(formatCitation({ deck: '06', slide: 8 })).toBe('Lexical Analysis III · slide 8');
		expect(formatCitation({ deck: '01', slide: [17, 19] })).toBe(
			'Intro (cont’d): Compiler architecture · slides 17–19'
		);
		expect(formatCitation({ deck: '04' })).toBe('Lexical Analysis');
	});
});

describe('citationParts', () => {
	it('splits a citation into the deck and the slides', () => {
		expect(citationParts({ deck: '02', slide: 8 })).toEqual({
			deck: 'Intro (cont’d): Preprocessors, bootstrapping, history',
			slides: 'slide 8'
		});
		expect(citationParts({ deck: '02', slide: [3, 8] })).toEqual({
			deck: 'Intro (cont’d): Preprocessors, bootstrapping, history',
			slides: 'slides 3–8'
		});
		expect(citationParts({ deck: '05' })).toEqual({ deck: 'Lexical Analysis II', slides: null });
	});

	it('joins back into formatCitation’s text', () => {
		for (const c of [
			{ deck: '00', slide: 2 },
			{ deck: '03', slide: [4, 6] },
			{ deck: '08' }
		] as const) {
			const { deck, slides } = citationParts(c);
			expect(slides ? `${deck} · ${slides}` : deck).toBe(formatCitation(c));
		}
	});
});
