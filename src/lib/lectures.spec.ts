import { describe, expect, it } from 'vitest';
import { citationParts, decks, formatCitation } from './lectures';

describe('formatCitation', () => {
	it('writes the deck title and the slides', () => {
		expect(formatCitation({ deck: '06', slide: 8 })).toBe('Lexical Analysis III · slide 8');
		expect(formatCitation({ deck: '01', slide: [17, 19] })).toBe(
			'Intro (cont’d): Compiler architecture · slides 17–19'
		);
		expect(formatCitation({ deck: '04' })).toBe('Lexical Analysis');
	});

	it('adds the topic only to the Intro decks, whose titles repeat', () => {
		expect(formatCitation({ deck: '00', slide: 2 })).toBe(
			'Intro: Compilers, interpreters, and language processors · slide 2'
		);
		expect(formatCitation({ deck: '09', slide: 23 })).toBe('Introduction to Parsing · slide 23');
		expect(formatCitation({ deck: '10', slide: [4, 5] })).toBe(
			'Ambiguity, Precedence, Associativity & Top-Down Parsing · slides 4–5'
		);
		expect(formatCitation({ deck: '11', slide: 20 })).toBe('Top-Down Parsing · slide 20');
	});

	it('cites the LL(1) and bottom-up parsing decks by their titles', () => {
		expect(formatCitation({ deck: '12', slide: 12 })).toBe(
			'Table-based Predictive Parsing · slide 12'
		);
		expect(formatCitation({ deck: '13', slide: [5, 10] })).toBe('Bottom-Up Parsing · slides 5–10');
		expect(formatCitation({ deck: '14', slide: 19 })).toBe('Bottom-up Parsing II · slide 19');
		expect(formatCitation({ deck: '15', slide: 26 })).toBe('Bottom-up Parsing III · slide 26');
	});
});

describe('decks', () => {
	it('lists every deck from 00 to 15 under its own id, with a title and a topic', () => {
		const ids = Object.keys(decks).sort();
		expect(ids).toEqual(Array.from({ length: 16 }, (_, i) => String(i).padStart(2, '0')));
		for (const [id, deck] of Object.entries(decks)) {
			expect(deck.id).toBe(id);
			expect(deck.title.length).toBeGreaterThan(0);
			expect(deck.topic.length).toBeGreaterThan(0);
		}
	});

	it('names the parsing decks 12–15 as the slides do', () => {
		expect([decks['12'], decks['13'], decks['14'], decks['15']]).toEqual([
			{ id: '12', title: 'Table-based Predictive Parsing', topic: 'LL(1) parsing tables' },
			{ id: '13', title: 'Bottom-Up Parsing', topic: 'Handles and reductions' },
			{ id: '14', title: 'Bottom-up Parsing II', topic: 'Shift-reduce parsing and LR tables' },
			{ id: '15', title: 'Bottom-up Parsing III', topic: 'LR(1) items, conflicts, precedence' }
		]);
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
