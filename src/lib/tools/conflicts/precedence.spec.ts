import { describe, expect, it } from 'vitest';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { lr1Automaton } from '$lib/theory/grammar/lr';
import { lrTable } from '$lib/theory/grammar/lr-table';
import { bisonSymbol, printDeclaration, readPrecedenceText, toggleLine } from './precedence';

const grammar = (text: string) => parseGrammar(text).grammar!;
const G = grammar('E → E + E | E * E | E "==" E | int');

/** The text a span covers. */
const at = (text: string, span: { start: number; end: number } | undefined) =>
	span ? text.slice(span.start, span.end) : null;

describe('readPrecedenceText', () => {
	it('reads the declarations of Bottom-up Parsing III, slide 19, lowest first', () => {
		const text = "%left '+'\n%left '*'";
		const read = readPrecedenceText(text, G);
		expect(read.declarations).toEqual([
			{ assoc: 'left', terminals: ['+'] },
			{ assoc: 'left', terminals: ['*'] }
		]);
		expect(read.lines.map((l) => [l.line, l.on, l.level, l.text])).toEqual([
			[0, true, 1, "%left '+'"],
			[1, true, 2, "%left '*'"]
		]);
		expect(read.diagnostics).toEqual([]);
		expect(read.lines.map((l) => l.spans.map((s) => at(text, s)))).toEqual([["'+'"], ["'*'"]]);
	});

	it('reads bare names, strings, several terminals and the three associativities', () => {
		const text = '%left + -\n%right "=="  ^\n%nonassoc then else';
		const read = readPrecedenceText(text);
		expect(read.declarations).toEqual([
			{ assoc: 'left', terminals: ['+', '-'] },
			{ assoc: 'right', terminals: ['==', '^'] },
			{ assoc: 'nonassoc', terminals: ['then', 'else'] }
		]);
		expect(read.lines[1].text).toBe('%right "==" \'^\'');
		expect(read.diagnostics).toEqual([]);
	});

	it('keeps lines turned off with // and moves the later lines down a level', () => {
		const text = "%left '+'\n// %left '*'\n  %left \"==\"\n\n// a comment";
		const read = readPrecedenceText(text, G);
		expect(read.lines.map((l) => [l.line, l.on, l.level, l.terminals])).toEqual([
			[0, true, 1, ['+']],
			[1, false, null, ['*']],
			[2, true, 2, ['==']]
		]);
		expect(read.declarations).toEqual([
			{ assoc: 'left', terminals: ['+'] },
			{ assoc: 'left', terminals: ['=='] }
		]);
		expect(read.diagnostics).toEqual([]);
	});

	it('ignores comments after a declaration and type tags (with a note)', () => {
		const text = "%left <op> '+' /* plus */ '-' // the additive operators";
		const read = readPrecedenceText(text);
		expect(read.declarations).toEqual([{ assoc: 'left', terminals: ['+', '-'] }]);
		expect(read.diagnostics.map((d) => [d.severity, at(text, d.span)])).toEqual([['info', '<op>']]);
	});

	it('reports what is not a declaration, with its place', () => {
		const text = "%token INT\nleft '+'\n%precedence '*'\n%left 'x\n%left";
		const read = readPrecedenceText(text, G);
		expect(read.diagnostics.map((d) => [d.severity, at(text, d.span), d.message])).toEqual([
			['error', '%token', 'Only %left, %right and %nonassoc lines go here, not %token.'],
			['error', "left '+'", 'A declaration starts with %left, %right or %nonassoc.'],
			[
				'warning',
				'%precedence',
				'%precedence (a precedence without associativity) is not read here; the line is left out. Write %left, %right or %nonassoc.'
			],
			['error', "'x", 'The quote is not closed.'],
			['warning', '%left', 'Line 5 declares no terminal.']
		]);
		// The two %left lines still count as levels, as the engine counts them.
		expect(read.declarations).toEqual([
			{ assoc: 'left', terminals: [] },
			{ assoc: 'left', terminals: [] }
		]);
	});

	it('reports names that are not terminals of the grammar, and a second declaration', () => {
		const text = "%left '+' E\n%left '-' '+'\n%left 'ab'";
		const read = readPrecedenceText(text, G);
		expect(read.diagnostics.map((d) => [d.severity, at(text, d.span), d.message])).toEqual([
			['warning', 'E', 'E is a non-terminal: precedence is declared for terminals.'],
			['warning', "'-'", "'-' is not a terminal of the grammar."],
			['warning', "'+'", "'+' is already declared on line 1; line 2 does not change it."],
			[
				'info',
				"'ab'",
				"bison quotes one character with ' '; ab is read as one terminal, which bison writes ab."
			],
			['warning', "'ab'", 'ab is not a terminal of the grammar.']
		]);
	});

	it('gives the engine the declarations it settles conflicts with', () => {
		const a = lr1Automaton(grammar('E → E + E | E * E | int'));
		const settled = (text: string) =>
			lrTable(a, { precedence: readPrecedenceText(text).declarations }).unresolved;
		expect(settled('')).toBe(4);
		expect(settled("%left '+'\n%left '*'")).toBe(0);
		// Turning a line off leaves the conflicts of its terminal to bison's default.
		expect(settled("%left '+'\n// %left '*'")).toBe(3);
	});
});

describe('toggleLine', () => {
	it('turns a line off with // and on again', () => {
		const text = "%left '+'\n  %left '*'";
		const off = toggleLine(text, 1, false);
		expect(off).toBe("%left '+'\n  // %left '*'");
		expect(readPrecedenceText(off).lines[1].on).toBe(false);
		expect(toggleLine(off, 1, true)).toBe(text);
		expect(toggleLine('//%left x', 0, true)).toBe('%left x');
	});

	it('leaves the text alone when the line already is as asked, or does not exist', () => {
		expect(toggleLine("%left '+'", 0, true)).toBe("%left '+'");
		expect(toggleLine("// %left '+'", 0, false)).toBe("// %left '+'");
		expect(toggleLine("%left '+'", 4, false)).toBe("%left '+'");
	});
});

describe('bisonSymbol and printDeclaration', () => {
	it('quotes characters, keeps names, writes the rest as strings', () => {
		expect(
			['+', '1', "'", '\\', 'then', 'INT', 'if-stmt', 'a', '==', 'the cat', 'ε'].map(bisonSymbol)
		).toEqual([
			"'+'",
			"'1'",
			"'\\''",
			"'\\\\'",
			'then',
			'INT',
			'if-stmt',
			'a',
			'"=="',
			'"the cat"',
			'"ε"'
		]);
		expect(printDeclaration('nonassoc', ['<', 'then'])).toBe("%nonassoc '<' then");
		expect(printDeclaration('left', [])).toBe('%left');
	});

	it('reads back what it writes', () => {
		for (const t of ['+', "'", '\\', 'then', '==', '"', 'a b'])
			expect(readPrecedenceText(printDeclaration('right', [t])).declarations).toEqual([
				{ assoc: 'right', terminals: [t] }
			]);
	});
});
