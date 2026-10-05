import { describe, expect, it } from 'vitest';
import {
	accepts,
	analyzeDeterminism,
	enumerate,
	parseAutomatonText,
	type Automaton
} from '$lib/theory/automata';
import { enumerateLanguage, makeGrammar, parseGrammar, type Grammar } from '$lib/theory/grammar';
import { random as seeded } from '$lib/theory/grammar/test-helpers';
import { ARITHMETIC, ENGLISH } from './presets';
import { ACCEPT_NAME, regularNfa } from './regular';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

function nfaOf(g: Grammar): { automaton: Automaton; text: string } {
	const r = regularNfa(g);
	if (!r.ok) throw new Error(`no NFA: ${r.reason}`);
	return r;
}

/** Transitions as `S 1 A`, with ε for an ε-move. */
const edges = (a: Automaton) =>
	a.transitions.map(
		(t) => `${a.states[t.from].name} ${t.label ? t.label.firstChar() : 'ε'} ${a.states[t.to].name}`
	);

/** The strings of a machine up to a length, sorted. */
const stringsOf = (a: Automaton, maxLength: number) =>
	enumerate(a, { maxLength, limit: 5000 }).strings.slice().sort();

/** The sentences of a grammar up to a length as strings, sorted. */
const sentencesOf = (g: Grammar, maxLength: number) =>
	enumerateLanguage(g, { maxLength, limit: 5000 })
		.strings.map((s) => s.join(''))
		.sort();

describe('regularNfa', () => {
	it('builds one state per non-terminal plus one accepting state (slide 27)', () => {
		const { automaton, text } = nfaOf(grammar('S → 1 A\nA → 0 | 1 A'));
		expect(automaton.states.map((s) => [s.name, s.accepting])).toEqual([
			['S', false],
			['A', false],
			[ACCEPT_NAME, true]
		]);
		expect(automaton.start).toBe(0);
		expect(edges(automaton)).toEqual(['S 1 A', 'A 0 F', 'A 1 A']);
		expect(text).toBe('states: S A F\nstart: S\naccept: F\nS 1 A\nA 0 F\nA 1 A\n');
		// 11*0
		expect(stringsOf(automaton, 4)).toEqual(['10', '110', '1110']);
		expect(accepts(automaton, '1')).toBe(false);
	});

	it('reads V → w into the accepting state (slide 26)', () => {
		const one = nfaOf(grammar('S → 0 | 1')).automaton;
		expect(edges(one)).toEqual(['S 0 F', 'S 1 F']);
		expect(stringsOf(one, 3)).toEqual(['0', '1']);

		const two = nfaOf(grammar('S → 1 A\nA → 0 | 1')).automaton;
		expect(edges(two)).toEqual(['S 1 A', 'A 0 F', 'A 1 F']);
		expect(stringsOf(two, 3)).toEqual(['10', '11']);
		expect(analyzeDeterminism(two).kind).not.toBe('nfa');
	});

	it('uses ε-moves for an empty w', () => {
		const { automaton } = nfaOf(grammar('S → a S | A | ε\nA → b'));
		expect(edges(automaton)).toEqual(['S a S', 'S ε A', 'S ε F', 'A b F']);
		expect(stringsOf(automaton, 2)).toEqual(['', 'a', 'aa', 'ab', 'b']);
	});

	it('reads a longer w along a path of new states', () => {
		const { automaton } = nfaOf(grammar('S → a b c S | d e'));
		expect(automaton.states.map((s) => s.name)).toEqual(['S', 'F', 'S1', 'S2', 'S3']);
		expect(edges(automaton)).toEqual(['S a S1', 'S1 b S2', 'S2 c S', 'S d S3', 'S3 e F']);
		expect(stringsOf(automaton, 5)).toEqual(['abcde', 'de']);
	});

	it('gives new states names no non-terminal has', () => {
		const { automaton } = nfaOf(grammar('F → a b S1 | c\nS1 → d F'));
		expect(automaton.states.map((s) => s.name)).toEqual(['F', 'S1', 'F2', 'F1']);
		expect(automaton.states.map((s) => s.accepting)).toEqual([false, false, true, false]);
		expect(new Set(automaton.states.map((s) => s.name)).size).toBe(automaton.states.length);
		expect(stringsOf(automaton, 4)).toEqual(['abdc', 'c']);
	});

	it('writes text that the automaton format reads back as the same machine', () => {
		for (const text of [
			'S → 1 A\nA → 0 | 1 A',
			'S → a b A | ε\nA → S | c',
			// Terminals the format has to quote: ε as a symbol, a space, a comma, a hyphen, a hash.
			'S → "ε" A | " "\nA → "-" | \',\' A | "#"',
			'S’ → x S’ | y'
		]) {
			const made = nfaOf(grammar(text));
			const read = parseAutomatonText(made.text);
			expect(read.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
			const back = read.automaton!;
			expect(back.states.map((s) => [s.name, s.accepting])).toEqual(
				made.automaton.states.map((s) => [s.name, s.accepting])
			);
			expect(back.start).toBe(made.automaton.start);
			expect(edges(back)).toEqual(edges(made.automaton));
		}
	});

	it('does not build a machine for a grammar that is not of type 3', () => {
		expect(regularNfa(grammar('S → ε | ( S )'))).toEqual({ ok: false, reason: 'not-regular' });
		expect(regularNfa(grammar(ARITHMETIC))).toEqual({ ok: false, reason: 'not-regular' });
		expect(regularNfa(grammar(ENGLISH))).toEqual({ ok: false, reason: 'not-regular' });
		// Left-linear: the non-terminal comes first.
		expect(regularNfa(grammar('S → S 0 | 1'))).toEqual({ ok: false, reason: 'not-regular' });
	});

	it('needs terminals of one character', () => {
		expect(regularNfa(grammar('S → int S | id'))).toEqual({
			ok: false,
			reason: 'long-terminals',
			terminals: ['int', 'id']
		});
		expect(regularNfa(grammar('Verb → "sat" | "saw"'))).toMatchObject({
			ok: false,
			reason: 'long-terminals'
		});
		// One code point outside the BMP is one character.
		expect(regularNfa(grammar('S → "😀" S | a')).ok).toBe(true);
	});

	it('accepts exactly L(G) for random regular grammars', () => {
		const next = seeded(23);
		const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
		const nonterminals = ['S', 'A', 'B'];
		for (let i = 0; i < 150; i++) {
			const productions = nonterminals.flatMap((lhs) =>
				Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
					const w = Array.from({ length: Math.floor(next() * 3) }, () => pick(['a', 'b']));
					return { lhs, rhs: next() < 0.6 ? [...w, pick(nonterminals)] : w };
				})
			);
			const g = makeGrammar(productions);
			const { automaton } = nfaOf(g);
			expect(stringsOf(automaton, 6), JSON.stringify(productions)).toEqual(sentencesOf(g, 6));
		}
	});
});
