import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import {
	alt,
	any,
	cat,
	chars,
	empty,
	eps,
	opt,
	plus,
	pow,
	ref,
	repeat,
	star,
	sym,
	type Regex
} from './ast';
import { regexEquals, walk } from './analyze';
import { parseDefinitions, parseRegex } from './lecture';
import { printRegex } from './print';

function parse(text: string, defs?: ReadonlyMap<string, Regex>): Regex {
	const r = parseRegex(text, { defs });
	if (!r.ok) throw new Error(`${text}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
	return r.regex;
}

function expectTree(actual: Regex, expected: Regex): void {
	expect(regexEquals(actual, expected), `${printRegex(actual)} ≠ ${printRegex(expected)}`).toBe(
		true
	);
}

/** Diagnostics as [severity, message, start, end]. */
function diags(text: string, defs?: ReadonlyMap<string, Regex>) {
	return parseRegex(text, { defs }).diagnostics.map((d) => [
		d.severity,
		d.message,
		d.span?.start,
		d.span?.end
	]);
}

function errorsOf(text: string) {
	const r = parseRegex(text);
	expect(r.ok).toBe(false);
	return r.diagnostics
		.filter((d) => d.severity === 'error')
		.map((d) => [d.message, d.span?.start, d.span?.end]);
}

function defsOf(text: string): Map<string, Regex> {
	const res = parseDefinitions(text);
	expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return res.defs;
}

const DIGIT_DEFS =
	"digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'\nnumber = digit digit*";
const digitAlt = alt(...[...'0123456789'].map(sym));

describe('parseRegex: lecture examples', () => {
	it('(1 | 0)*1', () => {
		expectTree(parse('(1 | 0)*1'), cat(star(alt(sym('1'), sym('0'))), sym('1')));
	});

	it('(0 | 1)*00', () => {
		expectTree(parse('(0 | 1)*00'), cat(star(alt(sym('0'), sym('1'))), sym('0'), sym('0')));
	});

	it('(0 | 1)* 1 (0|1)^2', () => {
		const b = alt(sym('0'), sym('1'));
		expectTree(parse('(0 | 1)* 1 (0|1)^2'), cat(star(b), sym('1'), pow(b, 2)));
	});

	it("'if' | 'then' | 'else' (including the slide's mismatched curly quotes)", () => {
		const expected = alt(sym('if'), sym('then'), sym('else'));
		expectTree(parse("'if' | 'then' | 'else'"), expected);
		expectTree(parse('‘if’ | ‘then‘ | ‘else’'), expected);
		const r = parse("'if'");
		expect(r.kind === 'concat' && r.quoted).toBe(true);
	});

	it("'0' | '1' | … | '9' is one range", () => {
		const r = parse("'0' | '1' | … | '9'");
		expect(r.kind).toBe('chars');
		if (r.kind !== 'chars') return;
		expect(r.set.equals(CharSet.range('0', '9'))).toBe(true);
		expect(r.text).toBe("'0' | '1' | … | '9'");
		expect(r.span).toEqual({ start: 0, end: 19, source: null });
		expectTree(parse("'0' | '1' | ... | '9'"), chars(CharSet.range('0', '9')));
		expectTree(parse("'0' | … | '9'"), chars(CharSet.range('0', '9')));
	});

	it("('0' | '1') ('0' | '1')", () => {
		const b = alt(sym('0'), sym('1'));
		expectTree(parse("('0' | '1') ('0' | '1')"), cat(b, b));
	});

	it("'1' '0'* and '0'*", () => {
		expectTree(parse("'1' '0'*"), cat(sym('1'), star(sym('0'))));
		expectTree(parse("'0'*"), star(sym('0')));
		// Slide 26 typesets the star as a superscript after the closing quote.
		expectTree(parse('‘1’ ‘0’*'), cat(sym('1'), star(sym('0'))));
	});

	it('digit / number regular definitions', () => {
		const defs = defsOf(DIGIT_DEFS);
		expectTree(defs.get('digit')!, digitAlt);
		const number = defs.get('number')!;
		expectTree(number, cat(ref('digit', digitAlt), star(ref('digit', digitAlt))));
		// A reference's body is the definition's own AST.
		if (number.kind === 'concat' && number.parts[0].kind === 'ref')
			expect(number.parts[0].body).toBe(defs.get('digit'));
	});

	it('letter with ranges, identifier, and (letter* | digit*)', () => {
		const defs = defsOf(
			"letter = 'A' | … | 'Z' | 'a' | … | 'z'\ndigit = '0' | '1' | '2' | … | '9'"
		);
		const letter = alt(chars(CharSet.range('A', 'Z')), chars(CharSet.range('a', 'z')));
		const digit = chars(CharSet.range('0', '9'));
		expectTree(defs.get('letter')!, letter);
		expectTree(defs.get('digit')!, digit);
		const L = ref('letter', letter);
		const D = ref('digit', digit);
		expectTree(parse('letter (letter | digit)*', defs), cat(L, star(alt(L, D))));
		expectTree(parse('(letter* | digit*)', defs), alt(star(L), star(D)));
		expectTree(parse('(letter^* | digit^*)', defs), alt(star(L), star(D)));
	});

	it("ws = (' ' | '\\t' | '\\r' | '\\n')+", () => {
		const expected = plus(alt(sym(' '), sym('\t'), sym('\r'), sym('\n')));
		expectTree(defsOf("ws = (' ' | '\\t' | '\\r' | '\\n')+").get('ws')!, expected);
		expectTree(parse('(‘ ’ | ‘\\t’ | ‘\\r’ | ‘\\n’)⁺'), expected);
	});

	it('phone numbers: digit^3, digit³, digit^4', () => {
		const defs = defsOf(
			[
				"digit = '0' | '1' | … | '9'",
				'area = digit^3',
				'exchange = digit³',
				'phone = digit^4',
				"number = '(' area ')' exchange '-' phone"
			].join('\n')
		);
		const D = ref('digit', chars(CharSet.range('0', '9')));
		const area = ref('area', pow(D, 3));
		const exchange = ref('exchange', pow(D, 3));
		const phone = ref('phone', pow(D, 4));
		expectTree(defs.get('number')!, cat(sym('('), area, sym(')'), exchange, sym('-'), phone));
		// The slide's '(' is typed ‘(‘.
		expectTree(parse('‘(‘'), sym('('));
	});

	it("email: name = letter+, address = name '@' name ('.' name)+", () => {
		const defs = defsOf(
			[
				"letter = 'A' | … | 'Z' | 'a' | … | 'z'",
				'name = letter+',
				"address = name '@' name ('.' name)+"
			].join('\n')
		);
		const letter = alt(chars(CharSet.range('A', 'Z')), chars(CharSet.range('a', 'z')));
		const N = ref('name', plus(ref('letter', letter)));
		expectTree(defs.get('address')!, cat(N, sym('@'), N, plus(cat(sym('.'), N))));
	});

	it('superscripts: digit⁺, digit³, a¹⁰', () => {
		const defs = defsOf('digit = [0-9]');
		const D = ref('digit', chars(CharSet.range('0', '9')));
		expectTree(parse('digit⁺', defs), plus(D));
		expectTree(parse('digit³', defs), pow(D, 3));
		expectTree(parse('a¹⁰'), pow(sym('a'), 10));
		expectTree(parse('a^12'), pow(sym('a'), 12));
		expectTree(parse('a^{12}'), pow(sym('a'), 12));
		expectTree(parse('a^0'), pow(sym('a'), 0));
	});

	it('TitleCase definition names: Number = digit+', () => {
		const defs = defsOf('digit = [0-9]\nNumber = digit+\nIdentifier = Number');
		const D = ref('digit', chars(CharSet.range('0', '9')));
		expectTree(defs.get('Number')!, plus(D));
		expectTree(defs.get('Identifier')!, ref('Number', plus(D)));
	});

	it('ɸ, ε, Σ and their alternate spellings', () => {
		for (const t of ['ɸ', 'φ', 'ϕ', '∅', '\\p']) expectTree(parse(t), empty());
		for (const t of ['ε', 'ϵ', '\\e']) expectTree(parse(t), eps());
		for (const t of ['Σ', '\\S']) expectTree(parse(t), any());
		expectTree(parse("'a' ɸ"), cat(sym('a'), empty()));
		expectTree(parse('ɸ*'), star(empty()));
		expectTree(parse('ε | Σ Σ'), alt(eps(), cat(any(), any())));
	});
});

describe('parseRegex: syntax', () => {
	it('binds postfix tighter than concatenation, and concatenation tighter than |', () => {
		expectTree(parse("'a' | 'b' 'c'*"), alt(sym('a'), cat(sym('b'), star(sym('c')))));
		expectTree(
			parse("'a'* 'b'+ 'c'? 'd'^2"),
			cat(star(sym('a')), plus(sym('b')), opt(sym('c')), pow(sym('d'), 2))
		);
		expectTree(parse("'a'**"), star(star(sym('a'))));
	});

	it('treats whitespace as cosmetic', () => {
		expectTree(parse('( 0 | 1 ) * 0 0'), parse('(0|1)*00'));
		expectTree(parse(" \t'a'\n|\n'b' "), alt(sym('a'), sym('b')));
	});

	it('keeps explicit grouping in the tree', () => {
		expectTree(parse("('a' 'b') 'c'"), cat(cat(sym('a'), sym('b')), sym('c')));
		expectTree(parse("('a' | 'b') | 'c'"), alt(alt(sym('a'), sym('b')), sym('c')));
		expectTree(parse("'a' 'b' 'c'"), cat(sym('a'), sym('b'), sym('c')));
	});

	it("reads a multi-character literal as one unit: 'ab'* = ('a' 'b')*", () => {
		const r = parse("'ab'*");
		expectTree(r, star(sym('ab')));
		expect(diags("'ab'*")).toEqual([['info', "'ab'* repeats the whole literal: ('a' 'b')*", 0, 5]]);
		expect(diags("'if'³")).toEqual([['info', "'if'³ repeats the whole literal: ('i' 'f')³", 0, 5]]);
		expect(diags("'ab'?")).toEqual([
			['info', "'ab'? applies to the whole literal: ('a' 'b')?", 0, 5]
		]);
		expect(diags("('ab')*")).toEqual([]);
	});

	it('supports escapes inside quotes', () => {
		const cases: [string, string][] = [
			["'\\t'", '\t'],
			["'\\n'", '\n'],
			["'\\r'", '\r'],
			["'\\\\'", '\\'],
			["'\\''", "'"],
			["'\\\"'", '"'],
			["'\\0'", '\0'],
			["'\\x41'", 'A'],
			["'\\u{3B5}'", 'ε'],
			["' '", ' ']
		];
		for (const [text, ch] of cases) expectTree(parse(text), sym(ch));
		expectTree(parse("'a\\'b'"), sym("a'b"));
	});

	it('reads double-quoted "if" as a literal, with a note', () => {
		expectTree(parse('"if"'), sym('if'));
		expect(diags('"if"')).toEqual([
			['info', `"if" read as 'if' — RE literals use single quotes`, 0, 4]
		]);
		expectTree(parse('“(”'), sym('('));
	});

	it('reads bare punctuation and digits as one-character symbols', () => {
		for (const ch of '-@,;:/<>=!#&%$~{}`0123456789') expectTree(parse(ch), sym(ch));
		expectTree(parse('a-b'), cat(sym('a'), sym('-'), sym('b')));
		expectTree(parse('\\*\\|\\('), cat(sym('*'), sym('|'), sym('(')));
	});

	it('reads . as a plain symbol, not a wildcard', () => {
		expectTree(parse('.'), sym('.'));
		expect(diags('.')).toEqual([
			['info', '. is the character "." here; use Σ for any symbol', 0, 1]
		]);
		expect(diags("'.'")).toEqual([]);
	});

	it('reads an undefined multi-letter name as symbols, with a note', () => {
		expectTree(parse('abb'), cat(sym('a'), sym('b'), sym('b')));
		expect(diags('abb')).toEqual([
			['info', 'abb read as the symbols a b b; no definition named abb', 0, 3]
		]);
		expectTree(parse('abb*'), cat(sym('a'), sym('b'), star(sym('b'))));
		expect(diags('x')).toEqual([]);
		expectTree(parse('x'), sym('x'));
		// Maximal munch: digit3 is not digit followed by 3.
		const defs = defsOf('digit = [0-9]');
		expectTree(parse('digit3', defs), cat(...[...'digit3'].map(sym)));
	});

	it('refers to definitions by name', () => {
		const defs = defsOf('digit = [0-9]');
		const D = ref('digit', chars(CharSet.range('0', '9')));
		expectTree(parse('digit digit', defs), cat(D, D));
		expect(diags('digit', defs)).toEqual([]);
	});

	it('reports uses of definitions that could not be built', () => {
		const r = parseRegex('x digit', { invalid: new Set(['digit']) });
		expect(r.ok).toBe(false);
		expect(r.diagnostics.map((d) => [d.message, d.span?.start, d.span?.end])).toEqual([
			['definition digit has errors', 2, 7]
		]);
	});

	it('parses classes', () => {
		const cls = (text: string) => {
			const r = parse(text);
			if (r.kind !== 'chars') throw new Error(`${text} is not a class`);
			return r.set;
		};
		expect(cls('[a-z]').equals(CharSet.range('a', 'z'))).toBe(true);
		expect(cls('[abc]').equals(CharSet.of('abc'))).toBe(true);
		expect(cls('[]a]').equals(CharSet.of(']a'))).toBe(true);
		expect(cls('[-a]').equals(CharSet.of('-a'))).toBe(true);
		expect(cls('[a-]').equals(CharSet.of('-a'))).toBe(true);
		expect(cls('[\\]\\\\]').equals(CharSet.of(']\\'))).toBe(true);
		expect(cls('[ \\t]').equals(CharSet.of(' \t'))).toBe(true);
		expect(cls("['.]").equals(CharSet.of("'."))).toBe(true);
		expect(cls('[[:digit:]_]').equals(CharSet.of('0123456789_'))).toBe(true);
		const neg = cls('[^a]');
		expect(neg.has('a')).toBe(false);
		expect(neg.has('\n')).toBe(true);
		expect(parse('[a-z]').kind === 'chars' && (parse('[a-z]') as { text?: string }).text).toBe(
			'[a-z]'
		);
	});

	it('merges contiguous characters around an ellipsis', () => {
		expectTree(parse("'a' | 'b' | … | 'e'"), chars(CharSet.range('a', 'e')));
		expectTree(parse("'a' | … | 'y' | 'z'"), chars(CharSet.range('a', 'z')));
		expectTree(parse("'a' | … | 'm' | … | 'z'"), chars(CharSet.range('a', 'z')));
		expectTree(parse("'x' | '0' | … | '9'"), alt(sym('x'), chars(CharSet.range('0', '9'))));
		expectTree(parse("'_' | 'A' | … | 'Z'"), alt(sym('_'), chars(CharSet.range('A', 'Z'))));
		expectTree(parse('0 | … | 9'), chars(CharSet.range('0', '9')));
		expectTree(parse("('a' | … | 'c')*"), star(chars(CharSet.range('a', 'c'))));
	});

	it('gives every node a span in the parsed text', () => {
		const text = "(1 | 0)* 'ab' digit";
		const defs = defsOf('digit = [0-9]');
		const r = parse(text, defs);
		const spans: string[] = [];
		walk(r, (node) => {
			// Definition bodies carry their own spans.
			if (node.span?.source === 'digit') return;
			expect(node.span, node.kind).toBeDefined();
			spans.push(`${node.kind}:${text.slice(node.span!.start, node.span!.end)}`);
		});
		expect(spans).toEqual([
			"concat:(1 | 0)* 'ab' digit",
			'star:(1 | 0)*',
			'alt:(1 | 0)',
			'chars:1',
			'chars:0',
			"concat:'ab'",
			'chars:a',
			'chars:b',
			'ref:digit'
		]);
		expect(parseRegex('a', { source: 'rule' }).ok && parse('a').span?.source).toBe(null);
		const withSource = parseRegex('a', { source: 'Keyword' });
		expect(withSource.ok && withSource.regex.span).toEqual({ start: 0, end: 1, source: 'Keyword' });
	});

	it('handles characters outside the BMP', () => {
		const r = parse('😀*');
		expectTree(r, star(sym('😀')));
		expect(r.span).toEqual({ start: 0, end: 3, source: null });
	});

	it('accepts bounded repetition A^{n,m} and A^{n,}', () => {
		expectTree(parse("'a'^{2,5}"), repeat(sym('a'), 2, 5));
		expectTree(parse("'a'^{2,}"), repeat(sym('a'), 2, null));
	});
});

describe('parseRegex: errors', () => {
	it('asks for input when empty', () => {
		expect(errorsOf('')).toEqual([['Enter a regular expression', 0, 0]]);
		expect(errorsOf('   ')).toEqual([['Enter a regular expression', 0, 3]]);
	});

	it('reports unbalanced parentheses', () => {
		expect(errorsOf('(a')).toEqual([['( is never closed', 0, 1]]);
		expect(errorsOf('((a)')).toEqual([['( is never closed', 0, 1]]);
		expect(errorsOf('a)')).toEqual([['unmatched )', 1, 2]]);
		expect(errorsOf('a) b')).toEqual([['unmatched )', 1, 2]]);
	});

	it('reports empty groups', () => {
		expect(errorsOf('()')).toEqual([['empty group (); use ε for the empty string', 0, 2]]);
		expect(errorsOf('a () b')).toEqual([['empty group (); use ε for the empty string', 2, 4]]);
	});

	it('reports missing operands around |', () => {
		expect(errorsOf('|a')).toEqual([['missing operand before |', 0, 1]]);
		expect(errorsOf('a|')).toEqual([['missing operand after |', 1, 2]]);
		expect(errorsOf('a || b')).toEqual([['missing operand after |', 2, 3]]);
		expect(errorsOf('(a|)')).toEqual([['missing operand after |', 2, 3]]);
		expect(errorsOf('(|a)')).toEqual([['missing operand before |', 1, 2]]);
	});

	it('reports postfix operators with nothing before them', () => {
		expect(errorsOf('*a')).toEqual([['* has nothing to repeat', 0, 1]]);
		expect(errorsOf('(+)')).toEqual([['+ has nothing to repeat', 1, 2]]);
		expect(errorsOf('a | ?b')).toEqual([['? has nothing to repeat', 4, 5]]);
		expect(errorsOf('³')).toEqual([['³ has nothing to repeat', 0, 1]]);
		expect(errorsOf('^3')).toEqual([['^3 has nothing to repeat', 0, 2]]);
	});

	it('reports bad escapes', () => {
		expect(errorsOf("'\\q'")).toEqual([['unknown escape \\q', 1, 3]]);
		expect(errorsOf('\\d')).toEqual([['unknown escape \\d; write [0-9] or a definition', 0, 2]]);
		expect(errorsOf("'\\x'")).toEqual([['\\x needs one or two hex digits, e.g. \\x41', 1, 3]]);
		expect(errorsOf('a\\')).toEqual([['incomplete escape \\', 1, 2]]);
	});

	it('reports unterminated and empty literals', () => {
		expect(errorsOf("'abc")).toEqual([["unterminated literal: missing closing '", 0, 4]]);
		expect(errorsOf('"ab')).toEqual([['unterminated literal: missing closing "', 0, 3]]);
		expect(errorsOf("''")).toEqual([['empty literal; use ε for the empty string', 0, 2]]);
		expect(errorsOf("'a' ''")).toEqual([['empty literal; use ε for the empty string', 4, 6]]);
	});

	it('reports bad ^ counts', () => {
		expect(errorsOf('a^')).toEqual([['^ needs a count, e.g. digit^3', 1, 2]]);
		expect(errorsOf('a^x')).toEqual([['^ needs a count, e.g. digit^3', 1, 2]]);
		expect(errorsOf('a^ 3')).toEqual([['^ needs a count, e.g. digit^3', 1, 2]]);
		expect(errorsOf('a^{5,3}')).toEqual([['bad count {5,3}: 3 is less than 5', 1, 7]]);
		expect(errorsOf('a^5000')).toEqual([['count 5000 is too large (at most 1000)', 1, 6]]);
	});

	it('reports class problems', () => {
		expect(errorsOf('[a-z')).toEqual([['unterminated class: missing ]', 0, 4]]);
		expect(errorsOf('[z-a]')).toEqual([
			['reversed range z-a: the first character comes after the last', 1, 4]
		]);
		expect(errorsOf('[[:letters:]]')).toEqual([['unknown character class [:letters:]', 1, 12]]);
		expect(errorsOf('[[:constructor:]]')).toEqual([
			['unknown character class [:constructor:]', 1, 16]
		]);
		expect(errorsOf('a]')).toEqual([['] without a matching [', 1, 2]]);
	});

	it('reports misused ellipses', () => {
		const side = "… needs a single character on each side, e.g. 'a' | … | 'z'";
		expect(errorsOf("'a' | …")).toEqual([[side, 6, 7]]);
		expect(errorsOf("… | 'z'")).toEqual([[side, 0, 1]]);
		expect(errorsOf("'ab' | … | 'z'")).toEqual([[side, 7, 8]]);
		expect(errorsOf("[a-c] | … | 'z'")).toEqual([[side, 8, 9]]);
		expect(errorsOf("'a' | ... | 'z'*")).toEqual([
			["... needs a single character on each side, e.g. 'a' | … | 'z'", 6, 9]
		]);
		expect(errorsOf("'z' | … | 'a'")).toEqual([
			["'z' | … | 'a' is backwards: 'z' comes after 'a'", 6, 7]
		]);
		expect(errorsOf("'a' … 'z'")).toEqual([
			["… must be a whole alternative between two characters, e.g. 'a' | … | 'z'", 4, 5]
		]);
	});

	it('reports several independent errors at once', () => {
		expect(errorsOf("(a | ) '' ]").map((e) => e[0])).toEqual([
			'missing operand after |',
			'empty literal; use ε for the empty string',
			'] without a matching ['
		]);
	});
});

describe('parseDefinitions', () => {
	it('accepts definitions in any order', () => {
		const res = parseDefinitions("number = digit digit*\ndigit = '0' | … | '9'");
		expect(res.diagnostics).toEqual([]);
		expect([...res.defs.keys()]).toEqual(['number', 'digit']);
		const D = ref('digit', chars(CharSet.range('0', '9')));
		expectTree(res.defs.get('number')!, cat(D, star(D)));
	});

	it('skips blank lines and // comments and handles CRLF', () => {
		const res = parseDefinitions('// digits\r\n\r\n  digit = [0-9]\r\n\t// done\r\n');
		expect(res.diagnostics).toEqual([]);
		expect(res.entries.map((e) => [e.name, e.line, e.text])).toEqual([['digit', 3, '[0-9]']]);
	});

	it('uses absolute spans with the definition name as source', () => {
		const text = 'digit = [0-9]\nnumber = digit+';
		const res = parseDefinitions(text);
		const [digit, number] = res.entries;
		expect(digit.nameSpan).toEqual({ start: 0, end: 5, source: 'digit' });
		expect(digit.exprSpan).toEqual({ start: 8, end: 13, source: 'digit' });
		expect(number.nameSpan).toEqual({ start: 14, end: 20, source: 'number' });
		expect(number.exprSpan).toEqual({ start: 23, end: 29, source: 'number' });
		const r = number.regex!;
		expect(r.span).toEqual({ start: 23, end: 29, source: 'number' });
		expect(r.kind === 'plus' && r.body.span).toEqual({ start: 23, end: 28, source: 'number' });
		expect(text.slice(r.span!.start, r.span!.end)).toBe('digit+');
		// The referenced body keeps its own spans.
		expect(r.kind === 'plus' && r.body.kind === 'ref' && r.body.body.span).toEqual({
			start: 8,
			end: 13,
			source: 'digit'
		});
	});

	it('reports diagnostics with absolute offsets', () => {
		const text = "digit = [0-9]\nword = abc | '";
		const res = parseDefinitions(text);
		expect(res.diagnostics.map((d) => [d.severity, d.message, d.span])).toEqual([
			[
				'info',
				'abc read as the symbols a b c; no definition named abc',
				{ start: 21, end: 24, source: 'word' }
			],
			['error', "unterminated literal: missing closing '", { start: 27, end: 28, source: 'word' }]
		]);
		expect(res.defs.has('word')).toBe(false);
		expect(res.entries[1].regex).toBe(null);
	});

	it('reports cycles by name', () => {
		const res = parseDefinitions("a = b 'x'\nb = a | 'y'\nc = 'z' c\nd = a");
		const errors = res.diagnostics.filter((d) => d.severity === 'error');
		expect(errors.map((d) => [d.message, d.span?.source, d.span?.start])).toEqual([
			['a is defined in terms of itself: a → b → a', 'a', 0],
			['b is defined in terms of itself: b → a → b', 'b', 10],
			['c is defined in terms of itself: c → c', 'c', 22],
			['definition a has errors', 'd', 36]
		]);
		expect(res.defs.size).toBe(0);
	});

	it('reports uses of definitions that failed', () => {
		const res = parseDefinitions("a = (\nb = a 'x'\nc = 'ok'");
		expect(res.diagnostics.map((d) => [d.message, d.span?.source])).toEqual([
			['( is never closed', 'a'],
			['definition a has errors', 'b']
		]);
		expect([...res.defs.keys()]).toEqual(['c']);
	});

	it('reports duplicates on the later definition', () => {
		const res = parseDefinitions('x = 1\ny = 2\nx = 3');
		expect(res.diagnostics.map((d) => [d.message, d.span])).toEqual([
			['x is already defined on line 1', { start: 12, end: 13, source: 'x' }]
		]);
		expectTree(res.defs.get('x')!, sym('1'));
		expect(res.entries.map((e) => [e.name, e.regex !== null])).toEqual([
			['x', true],
			['y', true],
			['x', false]
		]);
	});

	it('reports malformed lines', () => {
		const res = parseDefinitions("digit [0-9]\n = 'a'\n2x = 'a'\ny =   ");
		expect(res.diagnostics.map((d) => [d.message, d.span])).toEqual([
			['expected a definition: name = RE', { start: 0, end: 11, source: '<definitions>' }],
			['missing definition name before =', { start: 13, end: 14, source: '<definitions>' }],
			[
				'2x is not a valid name: use letters, digits, and _, starting with a letter or _',
				{ start: 19, end: 21, source: '<definitions>' }
			],
			['missing RE after y =', { start: 30, end: 31, source: 'y' }]
		]);
	});

	it('returns an empty result for empty text', () => {
		expect(parseDefinitions('')).toEqual({ defs: new Map(), entries: [], diagnostics: [] });
	});
});

describe('lecture examples print and read back', () => {
	const defs = defsOf(
		[
			DIGIT_DEFS,
			"letter = 'A' | … | 'Z' | 'a' | … | 'z'",
			'area = digit^3',
			'exchange = digit^3',
			'phone = digit^4',
			'name = letter+'
		].join('\n')
	);
	const examples = [
		'(1 | 0)*1',
		'(0 | 1)*00',
		'(0 | 1)* 1 (0|1)^2',
		"'if' | 'then' | 'else'",
		"'0' | '1' | … | '9'",
		"('0' | '1') ('0' | '1')",
		"'1' '0'*",
		"'0'*",
		'number',
		'letter (letter | digit)*',
		'(letter* | digit*)',
		"(' ' | '\\t' | '\\r' | '\\n')+",
		"'(' area ')' exchange '-' phone",
		"name '@' name ('.' name)+",
		'digit⁺',
		'digit³',
		'ɸ',
		'ε',
		"'a' ɸ",
		'ɸ*',
		'Σ* Σ'
	];

	it.each(examples)('%s', (text) => {
		const r = parse(text, defs);
		for (const symbols of ['quoted', 'bare'] as const)
			for (const parens of ['minimal', 'full'] as const) {
				const printed = printRegex(r, { symbols, parens });
				const back = parseRegex(printed, { defs });
				expect(back.ok, printed).toBe(true);
				if (back.ok) expectTree(back.regex, r);
			}
	});
});
