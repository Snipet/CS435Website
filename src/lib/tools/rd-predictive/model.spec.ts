import { describe, expect, it } from 'vitest';
import { hasErrors } from '$lib/theory/diagnostics';
import {
	readAst,
	readInput,
	readParser,
	readSource,
	runParser,
	sameText,
	withoutMarker
} from './model';
import { programText } from './program';
import { leftOver } from './run';

const SLIDE_38 = 'E → E + T | T\nT → T * F | F\nF → ( E ) | int';
const SLIDE_38_EBNF = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';
const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';

describe('readSource', () => {
	it('reads the grammar, its findings and its rewrite', () => {
		const source = readSource(SLIDE_38);
		expect(source.grammar?.nonterminals).toEqual(['E', 'T', 'F']);
		expect(source.diagnostics).toEqual([]);
		expect(source.recursion.map((f) => f.summary)).toEqual(['E →+ E + T', 'T →+ T * F']);
		expect(source.prefixes).toEqual([]);
		expect(source.kinds.map((k) => k.nonterminal)).toEqual(['E', 'T']);
		expect(source.rewrite?.text).toBe(SLIDE_38_EBNF);
	});

	it('lists common prefixes, but not the left recursion again', () => {
		const factored = readSource('E → T + E | T\nT → ( E ) | int | int * T');
		expect(factored.prefixes.map((f) => f.prefix)).toEqual([['T'], ['int']]);
		// S → S a | S b both start with S: that is the left recursion of S.
		const general = readSource('S → S a | S b | c | d');
		expect(general.recursion.map((f) => f.summary)).toEqual(['S →+ S a']);
		expect(general.prefixes).toEqual([]);
		expect(readSource('S → S a | S b | c x | c y').prefixes.map((f) => f.prefix)).toEqual([['c']]);
	});

	it('passes the options to the rewrite', () => {
		expect(readSource(SLIDE_38, { form: 'bnf' }).rewrite?.text).toBe(
			'E → T E’\nE’ → + T E’ | ε\nT → F T’\nT’ → * F T’ | ε\nF → ( E ) | int'
		);
		expect(readSource('S → A a | d\nA → S b', { order: 'reversed' }).rewrite?.text).toBe(
			'S → d { b a }'
		);
	});

	it('has no rewrite while the grammar has errors', () => {
		const source = readSource('E → E +\nT');
		expect(source.grammar).toBeNull();
		expect(hasErrors(source.diagnostics)).toBe(true);
		expect(source).toMatchObject({ recursion: [], prefixes: [], kinds: [], rewrite: null });
		expect(readSource('').rewrite).toBeNull();
	});

	it('reads braces as terminals: the grammar is BNF', () => {
		const source = readSource('B → { B } | x');
		expect(source.grammar?.terminals).toEqual(['{', '}', 'x']);
		expect(source.rewrite?.text).toBe('B → "{" B "}" | x');
	});
});

describe('readParser', () => {
	it('analyses an EBNF grammar and generates its parser', () => {
		const parser = readParser(SLIDE_37);
		expect(parser.ebnf?.nonterminals).toEqual(['E', 'T']);
		expect(parser.diagnostics).toEqual([]);
		expect(parser.prediction?.suitable).toBe(true);
		expect(parser.rows.map((row) => row.choice)).toEqual([
			'[ + E ]',
			'( E )',
			'int [ * T ]',
			'[ * T ]'
		]);
		expect(programText(parser.program!).split('\n').slice(9, 11)).toEqual([
			'// E -> T [ + E ]',
			'E () {'
		]);
		expect(parser.lookahead?.rules).toHaveLength(2);
	});

	it('has no parser while the grammar has errors', () => {
		const parser = readParser('E → T { + T');
		expect(hasErrors(parser.diagnostics)).toBe(true);
		expect(parser).toMatchObject({
			ebnf: null,
			lookahead: null,
			prediction: null,
			rows: [],
			program: null
		});
		expect(runParser(parser, null)).toBeNull();
		expect(readAst(parser, null, null)).toBeNull();
	});

	it('still generates the parser of a grammar that is not suitable', () => {
		const parser = readParser('E → T + E | T\nT → int');
		expect(parser.prediction?.suitable).toBe(false);
		expect(parser.program).not.toBeNull();
	});
});

describe('readInput', () => {
	const e = readParser(SLIDE_37).ebnf!;

	it('adds $ at the end unless it is there', () => {
		expect(readInput('int * int', e)).toEqual({
			tokens: ['int', '*', 'int', '$'],
			diagnostics: [],
			error: ''
		});
		expect(readInput('int * int $', e).tokens).toEqual(['int', '*', 'int', '$']);
		expect(readInput('', e).tokens).toEqual(['$']);
		expect(readInput('(int)', e).tokens).toEqual(['(', 'int', ')', '$']);
	});

	it('reports a symbol that is no terminal of the grammar', () => {
		const input = readInput('int - int', e);
		expect(input.error).toBe('- is not a terminal of the grammar.');
		expect(input.diagnostics[0].span).toMatchObject({ start: 4, end: 5 });
		expect(readInput('E + int', e).error).toBe(
			'E is a non-terminal. The input is a string of terminals.'
		);
	});

	it('writes each message once, and only the first two', () => {
		expect(readInput('int - int - int', e).error).toBe('- is not a terminal of the grammar.');
		const many = readInput('a int b c d', e);
		expect(many.diagnostics).toHaveLength(4);
		expect(many.error).toBe(
			'a is not a terminal of the grammar. b is not a terminal of the grammar. And 2 more problems.'
		);
		expect(readInput('a b c', e).error).toMatch(/And 1 more problem\.$/);
	});

	it('takes $ only as the last token', () => {
		const input = readInput('int $ * int $', e);
		expect(input.error).toBe('$ marks the end of the input, so it can only be the last token.');
		expect(input.diagnostics).toHaveLength(1);
		expect(input.diagnostics[0].span).toMatchObject({ start: 4, end: 5 });
		expect(readInput('$ $', e).diagnostics).toHaveLength(1);
		// A grammar with a terminal $ of its own gets no such error.
		const own = readParser('S → a $ b').ebnf!;
		expect(readInput('a $ b', own).diagnostics).toEqual([]);
	});
});

describe('runParser', () => {
	const parser = readParser(SLIDE_37);

	it('runs the parser on the token string', () => {
		expect(runParser(parser, readInput('int * int', parser.ebnf!))?.outcome).toBe('accept');
		expect(runParser(parser, readInput('int *', parser.ebnf!))?.outcome).toBe('error');
	});

	it('does not run a token string with errors', () => {
		expect(runParser(parser, readInput('int - int', parser.ebnf!))).toBeNull();
		expect(runParser(parser, null)).toBeNull();
	});
});

describe('readAst', () => {
	const parser = readParser(SLIDE_38_EBNF);
	const input = readInput('int + int + int', parser.ebnf!);

	it('builds the functions in the form the grammar is written in', () => {
		const ast = readAst(parser, input, null)!;
		expect(ast.form).toBe('loop');
		expect(ast.written).toBe('loop');
		expect(ast.reformed).toMatchObject({ text: SLIDE_38_EBNF, changed: [] });
		expect(ast.code.missing).toEqual([]);
		expect(ast.run?.outcome).toBe('done');
		expect(leftOver(ast.run!)).toEqual([]);
	});

	it('or in the other form', () => {
		const ast = readAst(parser, input, 'recursion')!;
		expect(ast.form).toBe('recursion');
		expect(ast.written).toBe('loop');
		expect(ast.reformed.text).toBe('E → T [ + E ]\nT → F [ * T ]\nF → ( E ) | int');
		expect(ast.run?.outcome).toBe('done');
	});

	it('shows the loop form when no rule has either', () => {
		const plain = readParser('S → 1 { 0 }');
		const ast = readAst(plain, readInput('1 0', plain.ebnf!), null)!;
		expect(ast).toMatchObject({ form: 'loop', written: null, run: null });
		expect(ast.code.missing).toEqual(['S']);
	});

	it('does not run while the token string has errors, and still has the code', () => {
		const ast = readAst(parser, readInput('int + x', parser.ebnf!), null)!;
		expect(ast.run).toBeNull();
		expect(ast.code.program.functions).toHaveLength(3);
		expect(readAst(parser, null, null)!.run).toBeNull();
	});

	it('leftOver: the tokens a run did not read', () => {
		const ast = readAst(parser, readInput('int int + int', parser.ebnf!), null)!;
		expect(leftOver(ast.run!)).toEqual(['int', '+', 'int']);
		const run = runParser(parser, readInput('int int', parser.ebnf!))!;
		expect(run.outcome).toBe('error');
		expect(leftOver(run)).toEqual(['int']);
	});
});

describe('text helpers', () => {
	it('withoutMarker drops the $ at the end', () => {
		expect(withoutMarker('int * int $')).toBe('int * int');
		expect(withoutMarker('int * int$  ')).toBe('int * int');
		expect(withoutMarker(' int * int ')).toBe('int * int');
		expect(withoutMarker('$')).toBe('');
		expect(withoutMarker('a $ b')).toBe('a $ b');
	});

	it('sameText ignores spacing and empty lines', () => {
		expect(sameText('E → T { + T }\nT → int', ' E  →  T { + T }\n\nT → int\n')).toBe(true);
		expect(sameText('E → T { + T }', 'E → T [ + T ]')).toBe(false);
		expect(sameText('E → T\nT → int', 'E → T T → int')).toBe(false);
	});
});
