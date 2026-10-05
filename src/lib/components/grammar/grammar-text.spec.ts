import { describe, expect, it } from 'vitest';
import {
	classifyGrammarText,
	convertArrows,
	highlightGrammar,
	leftHandSides,
	normalizeSymbol,
	paletteInsertion,
	tokenizeGrammarText,
	type GrammarToken
} from './grammar-text';

const show = (tokens: GrammarToken[]) => tokens.map((t) => `${t.kind}:${t.text}`);
const classes = (text: string, opts?: Parameters<typeof classifyGrammarText>[1]) =>
	classifyGrammarText(text, opts).map((t) => `${t.text}=${t.class}`);

describe('tokenizeGrammarText', () => {
	it('splits a production into symbols and metasymbols', () => {
		expect(show(tokenizeGrammarText('E → T | T + E'))).toEqual([
			'symbol:E',
			'arrow:→',
			'symbol:T',
			'bar:|',
			'symbol:T',
			'symbol:+',
			'symbol:E'
		]);
	});

	it('gives offsets into the text', () => {
		const text = 'T → int * T';
		const tokens = tokenizeGrammarText(text);
		expect(tokens.map((t) => text.slice(t.from, t.to))).toEqual(['T', '→', 'int', '*', 'T']);
		expect(tokens.map((t) => [t.from, t.to])).toEqual([
			[0, 1],
			[2, 3],
			[4, 7],
			[8, 9],
			[10, 11]
		]);
	});

	it('reads -> as the arrow and each punctuation character as its own symbol', () => {
		expect(show(tokenizeGrammarText('E->E+E|(E)'))).toEqual([
			'symbol:E',
			'arrow:->',
			'symbol:E',
			'symbol:+',
			'symbol:E',
			'bar:|',
			'symbol:(',
			'symbol:E',
			'symbol:)'
		]);
	});

	it('reads ε, ϵ and the word epsilon as epsilon', () => {
		expect(show(tokenizeGrammarText('S → ε | ϵ | epsilon'))).toEqual([
			'symbol:S',
			'arrow:→',
			'epsilon:ε',
			'bar:|',
			'epsilon:ϵ',
			'bar:|',
			'epsilon:epsilon'
		]);
	});

	it('keeps primes with the name and writes them ’', () => {
		expect(show(tokenizeGrammarText("S' → α S’ | ε"))).toEqual([
			'symbol:S’',
			'arrow:→',
			'symbol:α',
			'symbol:S’',
			'bar:|',
			'epsilon:ε'
		]);
		expect(normalizeSymbol("E''")).toBe('E’’');
	});

	it('reads quoted terminals as one token, named without the quotes', () => {
		const text = `Noun → "the cat" | '==' | ‘a b’`;
		const tokens = tokenizeGrammarText(text);
		expect(show(tokens)).toEqual([
			'symbol:Noun',
			'arrow:→',
			'quoted:the cat',
			'bar:|',
			'quoted:==',
			'bar:|',
			'quoted:a b'
		]);
		expect(text.slice(tokens[2].from, tokens[2].to)).toBe('"the cat"');
	});

	it('ends an unclosed quote with the line', () => {
		const tokens = tokenizeGrammarText('A → "open\nB → b');
		expect(show(tokens)).toEqual([
			'symbol:A',
			'arrow:→',
			'quoted:open',
			'symbol:B',
			'arrow:→',
			'symbol:b'
		]);
	});

	it('treats braces and brackets as symbols, or as metasymbols in EBNF', () => {
		const text = 'E → T { + T } [ x ]';
		expect(show(tokenizeGrammarText(text)).filter((t) => t.startsWith('bracket'))).toEqual([]);
		expect(show(tokenizeGrammarText(text, { ebnf: true }))).toEqual([
			'symbol:E',
			'arrow:→',
			'symbol:T',
			'bracket:{',
			'symbol:+',
			'symbol:T',
			'bracket:}',
			'bracket:[',
			'symbol:x',
			'bracket:]'
		]);
	});

	it('reads lines starting with // and /* … */ as comments', () => {
		const text = '// expressions\n  // indented\nE → T /* sum */ + E\nT → a // b';
		const tokens = tokenizeGrammarText(text);
		expect(tokens.filter((t) => t.kind === 'comment').map((t) => t.text)).toEqual([
			'// expressions',
			'// indented',
			'/* sum */'
		]);
		// In the middle of a line, // is two symbols.
		expect(show(tokens).slice(-5)).toEqual([
			'arrow:→',
			'symbol:a',
			'symbol:/',
			'symbol:/',
			'symbol:b'
		]);
	});

	it('runs an unclosed block comment to the end', () => {
		expect(show(tokenizeGrammarText('E → T /* rest\nT → a'))).toEqual([
			'symbol:E',
			'arrow:→',
			'symbol:T',
			'comment:/* rest\nT → a'
		]);
	});

	it('reads declaration keywords at the start of a line', () => {
		expect(show(tokenizeGrammarText('%left +\n%left *\nE → E % E'))).toEqual([
			'directive:%left',
			'symbol:+',
			'directive:%left',
			'symbol:*',
			'symbol:E',
			'arrow:→',
			'symbol:E',
			'symbol:%',
			'symbol:E'
		]);
	});

	it('handles continuation lines, digits and characters outside the BMP', () => {
		expect(show(tokenizeGrammarText('E → if E then E\n  | OTHER\nS → 1 { 0 } 😀x'))).toEqual([
			'symbol:E',
			'arrow:→',
			'symbol:if',
			'symbol:E',
			'symbol:then',
			'symbol:E',
			'bar:|',
			'symbol:OTHER',
			'symbol:S',
			'arrow:→',
			'symbol:1',
			'symbol:{',
			'symbol:0',
			'symbol:}',
			'symbol:😀',
			'symbol:x'
		]);
		expect(tokenizeGrammarText('')).toEqual([]);
		expect(tokenizeGrammarText(' \n\t ')).toEqual([]);
	});
});

describe('leftHandSides', () => {
	it('lists the symbols written before an arrow', () => {
		const tokens = tokenizeGrammarText('E → T | T + E\nT → int\n"x" → y');
		expect([...leftHandSides(tokens)]).toEqual(['E', 'T']);
	});
});

describe('classifyGrammarText', () => {
	const text = 'E → if E then E | OTHER';

	it('uses the lists of the parsed grammar', () => {
		expect(classes(text, { nonterminals: ['E'], terminals: ['if', 'then', 'OTHER'] })).toEqual([
			'E=nonterminal',
			'→=meta',
			'if=terminal',
			'E=nonterminal',
			'then=terminal',
			'E=nonterminal',
			'|=meta',
			'OTHER=terminal'
		]);
	});

	it('without lists, a non-terminal is a symbol on a left-hand side', () => {
		expect(classes(text)).toEqual(
			classes(text, { nonterminals: ['E'], terminals: ['if', 'then', 'OTHER'] })
		);
		// Capitals do not make a non-terminal: OTHER has no production.
		expect(classes(text)).toContain('OTHER=terminal');
	});

	it('classifies a symbol that is in neither list from the text', () => {
		const stale = { nonterminals: ['E'], terminals: ['int'] };
		expect(classes('E → T\nT → int * x', stale)).toEqual([
			'E=nonterminal',
			'→=meta',
			'T=nonterminal',
			'T=nonterminal',
			'→=meta',
			'int=terminal',
			'*=terminal',
			'x=terminal'
		]);
	});

	it('lets the lists decide over the text', () => {
		expect(classes('a → b', { terminals: ['a'] })[0]).toBe('a=terminal');
		expect(classes('x A y', { nonterminals: ['A'] })).toEqual([
			'x=terminal',
			'A=nonterminal',
			'y=terminal'
		]);
	});

	it('matches primed names however the prime is typed', () => {
		expect(classes("S' → a S’", { nonterminals: ['S’'] })).toEqual([
			'S’=nonterminal',
			'→=meta',
			'a=terminal',
			'S’=nonterminal'
		]);
		expect(classes('x S’', { nonterminals: ["S'"] })[1]).toBe('S’=nonterminal');
	});

	it('marks ε, EBNF brackets, quoted terminals, comments and declarations', () => {
		expect(classes('// c\n%left +\nA → { "a b" } | ε', { ebnf: true })).toEqual([
			'// c=comment',
			'%left=directive',
			'+=terminal',
			'A=nonterminal',
			'→=meta',
			'{=meta',
			'a b=terminal',
			'}=meta',
			'|=meta',
			'ε=epsilon'
		]);
	});

	it('reads the word epsilon as ε unless the parsed grammar lists it as a symbol', () => {
		expect(classes('A → epsilon')).toContain('epsilon=epsilon');
		expect(classes('A → epsilon', { nonterminals: ['A', 'epsilon'] })).toContain(
			'epsilon=nonterminal'
		);
		expect(classes('A → epsilon', { terminals: ['epsilon'] })).toContain('epsilon=terminal');
		expect(classes('A → ε', { terminals: ['ε'] })).toContain('ε=epsilon');
	});
});

describe('highlightGrammar', () => {
	it('returns ranges with the global highlight classes', () => {
		const text = 'E → T "x" | ε';
		const marked = highlightGrammar(text).map((h) => `${text.slice(h.from, h.to)}:${h.className}`);
		expect(marked).toEqual([
			'E:hl-name',
			'→:hl-operator',
			'"x":hl-string',
			'|:hl-operator',
			'ε:hl-special'
		]);
	});

	it('leaves plain terminals in the text color', () => {
		const text = 'T → int * T';
		expect(highlightGrammar(text).map((h) => text.slice(h.from, h.to))).toEqual(['T', '→', 'T']);
	});

	it('colors comments and declarations', () => {
		const text = '// note\n%left +';
		expect(highlightGrammar(text).map((h) => h.className)).toEqual(['hl-comment', 'hl-keyword']);
	});
});

describe('convertArrows', () => {
	it('replaces a typed -> and keeps the caret after it', () => {
		expect(convertArrows('E ->', 4)).toEqual({
			text: 'E →',
			caret: 3,
			changed: true,
			ranges: [{ start: 2, end: 4 }]
		});
	});

	it('moves a caret further on by the characters removed before it', () => {
		const r = convertArrows('E -> T\nT -> int', 15);
		expect(r.text).toBe('E → T\nT → int');
		expect(r.caret).toBe(13);
		expect(r.ranges).toEqual([
			{ start: 2, end: 4 },
			{ start: 9, end: 11 }
		]);
	});

	it('keeps a caret before the arrow, and puts one between - and > after it', () => {
		expect(convertArrows('E -> T', 1).caret).toBe(1);
		expect(convertArrows('E -> T', 2).caret).toBe(2);
		expect(convertArrows('E -> T', 3).caret).toBe(3);
		expect(convertArrows('E -> T', 4).caret).toBe(3);
	});

	it('leaves text without -> alone', () => {
		expect(convertArrows('E → T - > x', 5)).toEqual({
			text: 'E → T - > x',
			caret: 5,
			changed: false,
			ranges: []
		});
	});

	it('does not touch quoted terminals or comments', () => {
		const text = `// a -> b\nE -> '->' "->" /* -> */`;
		const r = convertArrows(text, text.length);
		expect(r.text).toBe(`// a -> b\nE → '->' "->" /* -> */`);
		expect(r.ranges).toHaveLength(1);
		expect(r.caret).toBe(r.text.length);
	});

	it('clamps the caret', () => {
		expect(convertArrows('->', 99).caret).toBe(1);
		expect(convertArrows('->', -3).caret).toBe(0);
	});
});

describe('paletteInsertion', () => {
	const at = (symbol: string, text: string, start = text.length, end = start) =>
		paletteInsertion(symbol, text, start, end);

	it('puts a space on each side of an arrow or a bar', () => {
		expect(at('→', 'E')).toBe(' → ');
		expect(at('|', 'E → T')).toBe(' | ');
		expect(at('→', 'ET', 1)).toBe(' → ');
	});

	it('does not double spaces that are there', () => {
		expect(at('→', 'E ')).toBe('→ ');
		expect(at('|', 'E → T  x', 6)).toBe('|');
		expect(at('→', 'E  T', 2)).toBe('→');
	});

	it('starts a continuation line without a leading space', () => {
		expect(at('|', 'E → T\n')).toBe('| ');
		expect(at('|', '')).toBe('| ');
		expect(at('|', 'E → T\n  ')).toBe('| ');
	});

	it('adds no trailing space after ε or a closing bracket at the end of a line', () => {
		expect(at('ε', 'S → ( S ) | ')).toBe('ε');
		expect(at('ε', 'S →')).toBe(' ε');
		expect(at('}', 'E → T { + T')).toBe(' }');
		expect(at(']', 'E → T [ + E\nT → int', 11)).toBe(' ]');
		expect(at('ε', 'S → x', 4)).toBe('ε ');
	});

	it('opens a repetition or an option with a space after it', () => {
		expect(at('{', 'E → T')).toBe(' { ');
		expect(at('[', 'E → T ')).toBe('[ ');
	});

	it('uses the characters around a selection', () => {
		expect(paletteInsertion('→', 'E -> T', 2, 4)).toBe('→');
		expect(paletteInsertion('→', 'E->T', 1, 3)).toBe(' → ');
	});

	it('inserts other symbols as they are', () => {
		expect(at('+', 'E')).toBe('+');
	});
});
