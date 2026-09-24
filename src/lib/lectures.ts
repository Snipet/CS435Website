/**
 * Lecture decks the site's presets cite. Citations use the deck title plus a
 * slide number, e.g. "Lexical Analysis III · slide 8".
 */
export type DeckId = '00' | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08';

export interface Deck {
	id: DeckId;
	title: string;
	/** Short topic line shown under the title. */
	topic: string;
}

export const decks: Record<DeckId, Deck> = {
	'00': { id: '00', title: 'Intro', topic: 'Compilers, interpreters, and language processors' },
	'01': { id: '01', title: 'Intro (cont’d)', topic: 'Compiler architecture' },
	'02': { id: '02', title: 'Intro (cont’d)', topic: 'Preprocessors, bootstrapping, history' },
	'03': { id: '03', title: 'Intro (cont’d)', topic: 'Compiler structure with examples' },
	'04': { id: '04', title: 'Lexical Analysis', topic: 'Tokens, lexemes, regular expressions' },
	'05': { id: '05', title: 'Lexical Analysis II', topic: 'Using regular expressions' },
	'06': { id: '06', title: 'Lexical Analysis III', topic: 'Finite automata' },
	'07': { id: '07', title: 'Lexical Analysis III (cont’d)', topic: 'Scanning with flex' },
	'08': { id: '08', title: 'Lexical Analysis IV', topic: 'Regular expressions to finite automata' }
};

export interface Citation {
	deck: DeckId;
	/** A single slide (8) or an inclusive range ([17, 19]). */
	slide?: number | readonly [number, number];
}

/** "Lexical Analysis III · slide 8", "Intro (cont’d): Compiler architecture · slides 17–19". */
export function formatCitation(c: Citation): string {
	const d = decks[c.deck];
	const title = d.title.startsWith('Intro') ? `${d.title}: ${d.topic}` : d.title;
	if (c.slide === undefined) return title;
	if (typeof c.slide === 'number') return `${title} · slide ${c.slide}`;
	return `${title} · slides ${c.slide[0]}–${c.slide[1]}`;
}
