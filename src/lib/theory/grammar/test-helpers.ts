/** Helpers and lecture grammars for the grammar specs. */
import { bracketForm } from './derive';
import { parseTrees } from './earley';
import { makeGrammar, parseEbnf, parseGrammar, tokenizeInput } from './parse';
import type { EbnfGrammar, Grammar } from './types';

/** Parses grammar text that must be free of errors. */
export function grammar(text: string): Grammar {
	const { grammar, diagnostics } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${JSON.stringify(diagnostics)}`);
	return grammar;
}

export function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`EBNF grammar has errors: ${JSON.stringify(diagnostics)}`);
	return grammar;
}

/** A token string of `g`, which must lex without errors. */
export function input(g: Grammar, text: string): string[] {
	const { tokens, diagnostics } = tokenizeInput(text, g.terminals);
	if (diagnostics.length > 0) throw new Error(`input has errors: ${JSON.stringify(diagnostics)}`);
	return tokens;
}

/** Bracket forms of every parse tree of `text`. */
export function forms(g: Grammar, text: string): string[] {
	return parseTrees(g, input(g, text)).trees.map(bracketForm);
}

/** Introduction to Parsing, slides 12–15. */
export const ARITHMETIC = 'E → int\nE → E + E\nE → E * E\nE → ( E )';
/** Introduction to Parsing, slide 28: tight spacing and the ∗ operator. */
export const ARITHMETIC_ID = 'E → E+E | E ∗ E | (E) | id';
/** Introduction to Parsing, slides 29–30. */
export const COOL = `EXPR → if EXPR then EXPR else EXPR fi
     | while EXPR loop EXPR pool
     | id`;
/** Introduction to Parsing, slide 25. */
export const ENGLISH = `Sentence → NounPhrase VerbPhrase
NounPhrase → Noun | Noun PrepositionalPhrase
VerbPhrase → Verb | Verb NounPhrase
PrepositionalPhrase → Preposition NounPhrase

Noun → "the cat" | "the mat" | "the floor"
Verb → "sat" | "saw"
Preposition → "on" | "under"`;
/** Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 3. */
export const AMBIGUOUS = 'E → E + E | E * E | ( E ) | int';
/** Same deck, slides 8 and 10. */
export const CASCADE = 'E → E + T | T\nT → T * F | F\nF → int | ( E )';
/** Same deck, slide 11. */
export const DANGLING_ELSE = `E → if E then E
    | if E then E else E
    | OTHER`;
/** Same deck, slide 13. */
export const MATCHED_IF = `E → MIF                 /* all then are matched */
    | UIF               /* some then is unmatched */

MIF → if E then MIF else MIF
      | OTHER

UIF → if E then E
      | if E then MIF else UIF`;
/** Top-Down Parsing, slide 4. */
export const TOP_DOWN = 'E → T | T + E\nT → int | int * T | ( E )';
/** Top-Down Parsing, slide 17: the same grammar in a different order. */
export const TOP_DOWN_2 = 'E → T + E | T\nT → ( E ) | int | int * T';
/** Top-Down Parsing, slide 38 (F's alternatives in the order of that slide). */
export const LEFT_RECURSIVE = 'E → E + T | T\nT → T * F | F\nF → ( E ) | int';
/** Top-Down Parsing, slide 36. */
export const EBNF_OPTION = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';
/** Top-Down Parsing, slide 38. */
export const EBNF_REPETITION = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';

/** A small deterministic pseudo-random generator (mulberry32). */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A random grammar over two or three terminals with up to three non-terminals. */
export function randomGrammar(next: () => number): Grammar {
	const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
	const nonterminals = ['S', 'A', 'B'].slice(0, 1 + Math.floor(next() * 3));
	const terminals = ['a', 'b', 'c'].slice(0, 2 + Math.floor(next() * 2));
	const symbols = [...nonterminals, ...terminals];
	const productions = nonterminals.flatMap((lhs) =>
		Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
			lhs,
			rhs: Array.from({ length: Math.floor(next() * 4) }, () => pick(symbols))
		}))
	);
	return makeGrammar(productions, { terminals });
}

/** Sentences of at most `max` tokens straight from the definition: the least fixed point of the productions. */
export function bruteForce(g: Grammar, max: number): string[][] {
	const isNonterminal = new Set(g.nonterminals);
	const sets = new Map(g.nonterminals.map((n) => [n, new Map<string, string[]>()]));
	for (let changed = true; changed;) {
		changed = false;
		for (const p of g.productions) {
			let partial: string[][] = [[]];
			for (const x of p.rhs) {
				const options = isNonterminal.has(x) ? [...sets.get(x)!.values()] : [[x]];
				partial = partial
					.flatMap((head) => options.map((tail) => [...head, ...tail]))
					.filter((s) => s.length <= max);
			}
			const target = sets.get(p.lhs)!;
			for (const s of partial) {
				const key = s.join(' ');
				if (target.has(key)) continue;
				target.set(key, s);
				changed = true;
			}
		}
	}
	const rank = new Map(g.terminals.map((t, i) => [t, i]));
	const compare = (a: string[], b: string[]): number => {
		if (a.length !== b.length) return a.length - b.length;
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return rank.get(a[i])! - rank.get(b[i])!;
		return 0;
	};
	return [...sets.get(g.start)!.values()].sort(compare);
}
