import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, chars, eps, opt, plus, ref, repeat, star, sym, type Regex } from './ast';
import { regexEquals } from './analyze';
import {
	FLEX_DOT,
	parseFlexDefinitions,
	parseFlexPattern,
	type FlexDefinitionLine,
	type FlexPattern
} from './flex';
import { printFlexPattern, printRegex } from './print';

function pattern(text: string, defs?: ReadonlyMap<string, Regex>): FlexPattern {
	const r = parseFlexPattern(text, { defs });
	if (!r.ok) throw new Error(`${text}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
	return r.pattern;
}

const flex = (text: string, defs?: ReadonlyMap<string, Regex>): Regex => pattern(text, defs).regex;

function expectTree(actual: Regex, expected: Regex): void {
	expect(
		regexEquals(actual, expected),
		`${printRegex(actual, { dialect: 'flex' })} ≠ ${printRegex(expected, { dialect: 'flex' })}`
	).toBe(true);
}

function errorsOf(text: string, defs?: ReadonlyMap<string, Regex>) {
	const r = parseFlexPattern(text, { defs });
	expect(r.ok).toBe(false);
	return r.diagnostics
		.filter((d) => d.severity === 'error')
		.map((d) => [d.message, d.span?.start, d.span?.end]);
}

function infosOf(text: string) {
	return parseFlexPattern(text)
		.diagnostics.filter((d) => d.severity === 'info')
		.map((d) => [d.message, d.span?.start, d.span?.end]);
}

function defsOf(lines: [string, string][]): Map<string, Regex> {
	const res = parseFlexDefinitions(lines.map(([name, text], i) => ({ name, text, line: i + 1 })));
	expect(res.diagnostics).toEqual([]);
	return res.defs;
}

const digit = chars(CharSet.range('0', '9'));
const letter = chars(
	CharSet.fromRanges([
		[0x41, 0x5a],
		[0x61, 0x7a]
	])
);
const nl = sym('\n');

describe('parseFlexPattern: slide examples', () => {
	it('[0-9]+', () => {
		const p = pattern('[0-9]+');
		expectTree(p.regex, plus(digit));
		expect(p).toMatchObject({ bol: false, eol: false, trailing: null });
	});

	it('.|\\n', () => {
		expectTree(flex('.|\\n'), alt(chars(FLEX_DOT), nl));
		expect(FLEX_DOT.has('\n')).toBe(false);
		expect(FLEX_DOT.has('x')).toBe(true);
	});

	it('\\n', () => {
		expectTree(flex('\\n'), nl);
	});

	it('^{DELIM} and {DELIM} with DELIM [ \\t]+', () => {
		const defs = defsOf([['DELIM', '[ \\t]+']]);
		const D = ref('DELIM', plus(chars(CharSet.of(' \t'))));
		const bol = pattern('^{DELIM}', defs);
		expect(bol.bol).toBe(true);
		expectTree(bol.regex, D);
		const plain = pattern('{DELIM}', defs);
		expect(plain.bol).toBe(false);
		expectTree(plain.regex, D);
	});

	it('{LETTER}({LETTER}|{DIGIT})* with DIGIT [0-9], LETTER [A-Za-z]', () => {
		const defs = defsOf([
			['DIGIT', '[0-9]'],
			['LETTER', '[A-Za-z]'],
			['ID', '{LETTER}({LETTER}|{DIGIT})*']
		]);
		const L = ref('LETTER', letter);
		const D = ref('DIGIT', digit);
		const id = cat(L, star(alt(L, D)));
		expectTree(defs.get('ID')!, id);
		expectTree(flex('{LETTER}({LETTER}|{DIGIT})*', defs), id);
		expectTree(flex('{DIGIT}+', defs), plus(D));
		expectTree(flex('{ID}', defs), ref('ID', id));
	});
});

describe('parseFlexPattern: syntax', () => {
	it('"ab"* repeats the whole string', () => {
		expectTree(flex('"ab"*'), star(sym('ab')));
		expect(infosOf('"ab"*')).toEqual([['"ab"* repeats the whole string: ("ab")*', 0, 5]]);
		expect(infosOf('"ab"{2}')).toEqual([['"ab"{2} repeats the whole string: ("ab"){2}', 0, 7]]);
		expect(infosOf('"ab"?')).toEqual([['"ab"? applies to the whole string: ("ab")?', 0, 5]]);
		expect(infosOf('("ab")*')).toEqual([]);
		expectTree(flex('ab*'), cat(sym('a'), star(sym('b'))));
	});

	it('x|yz* = x|(y(z*))', () => {
		expectTree(flex('x|yz*'), alt(sym('x'), cat(sym('y'), star(sym('z')))));
	});

	it('a/b: trailing context', () => {
		const p = pattern('a/b');
		expectTree(p.regex, sym('a'));
		expectTree(p.trailing!, sym('b'));
		const q = pattern('x|y/z|w');
		expectTree(q.regex, alt(sym('x'), sym('y')));
		expectTree(q.trailing!, alt(sym('z'), sym('w')));
	});

	it('a$ and ^a: anchors apply to the whole pattern', () => {
		const p = pattern('a$');
		expect(p.eol).toBe(true);
		expectTree(p.regex, sym('a'));
		const q = pattern('^a|b$');
		expect(q).toMatchObject({ bol: true, eol: true });
		expectTree(q.regex, alt(sym('a'), sym('b')));
	});

	it('treats ^ and $ elsewhere as ordinary characters, with a note', () => {
		expectTree(flex('a^b'), cat(sym('a'), sym('^'), sym('b')));
		expectTree(flex('a$b'), cat(sym('a'), sym('$'), sym('b')));
		expectTree(flex('a|^b'), alt(sym('a'), cat(sym('^'), sym('b'))));
		expectTree(flex('(a$)'), cat(sym('a'), sym('$')));
		expect(infosOf('a|^b')).toEqual([
			['^ matches the character ^ here; it is an anchor only at the start of a pattern', 2, 3]
		]);
		expect(infosOf('(a$)')).toEqual([
			['$ matches the character $ here; it is an anchor only at the end of a pattern', 2, 3]
		]);
	});

	it('r{2,5}, r{3}, r{2,}', () => {
		expectTree(flex('r{2,5}'), repeat(sym('r'), 2, 5));
		expectTree(flex('r{3}'), repeat(sym('r'), 3, 3));
		expectTree(flex('r{2,}'), repeat(sym('r'), 2, null));
		expectTree(flex('(ab){0,1}'), repeat(cat(sym('a'), sym('b')), 0, 1));
		expectTree(flex('r?'), opt(sym('r')));
	});

	it('[^\\n] and negated classes include \\n unless listed', () => {
		const r = flex('[^\\n]');
		expect(r.kind === 'chars' && r.set.equals(FLEX_DOT)).toBe(true);
		const neg = flex('[^a]');
		expect(neg.kind === 'chars' && neg.set.has('\n')).toBe(true);
		expect(neg.kind === 'chars' && neg.set.has('a')).toBe(false);
	});

	it('[[:alpha:]_] and the other POSIX classes', () => {
		const r = flex('[[:alpha:]_]');
		expect(r.kind === 'chars' && r.set.equals(letter.set.union(CharSet.single('_')))).toBe(true);
		const size = (name: string) => {
			const n = flex(`[[:${name}:]]`);
			return n.kind === 'chars' ? n.set.size : -1;
		};
		expect(
			[
				'alpha',
				'digit',
				'alnum',
				'upper',
				'lower',
				'space',
				'blank',
				'punct',
				'xdigit',
				'cntrl',
				'print',
				'graph'
			].map(size)
		).toEqual([52, 10, 62, 26, 26, 6, 2, 32, 22, 33, 95, 94]);
	});

	it('class details: ranges, ] first, - first or last, escapes', () => {
		const set = (text: string) => {
			const n = flex(text);
			if (n.kind !== 'chars') throw new Error(text);
			return n.set;
		};
		expect(set('[xyz]').equals(CharSet.of('xyz'))).toBe(true);
		expect(set('[]x]').equals(CharSet.of(']x'))).toBe(true);
		expect(set('[^]x]').has(']')).toBe(false);
		expect(set('[-x]').equals(CharSet.of('-x'))).toBe(true);
		expect(set('[x-]').equals(CharSet.of('-x'))).toBe(true);
		expect(set('[a\\-z]').equals(CharSet.of('a-z'))).toBe(true);
		expect(set('[\\x41-\\x43]').equals(CharSet.of('ABC'))).toBe(true);
		expect(set('[ "]').equals(CharSet.of(' "'))).toBe(true);
	});

	it('escapes: \\x41, octal, named, and any other \\c', () => {
		expectTree(flex('\\x41'), sym('A'));
		expectTree(flex('\\101'), sym('A'));
		expectTree(flex('\\0'), sym('\0'));
		expectTree(flex('\\t\\r\\f\\v\\a\\b'), cat(...['\t', '\r', '\f', '\v', '\x07', '\b'].map(sym)));
		expectTree(flex('\\.'), sym('.'));
		expectTree(flex('\\q'), sym('q'));
		expectTree(flex('\\ '), sym(' '));
		expectTree(flex('\\u{3B5}'), sym('ε'));
		expectTree(flex('"\\"\\n"'), sym('"\n'));
	});

	it('"a b" and "" (the empty string)', () => {
		expectTree(flex('"a b"'), sym('a b'));
		expectTree(flex('""'), eps());
		expectTree(flex('a""b'), cat(sym('a'), eps(), sym('b')));
		const one = flex('"a"');
		expect(one.kind).toBe('chars');
	});

	it('{NAME} expands as a unit', () => {
		const defs = defsOf([['AB', 'ab']]);
		expectTree(flex('{AB}*', defs), star(ref('AB', cat(sym('a'), sym('b')))));
		expectTree(
			flex('x{AB}{2}', defs),
			cat(sym('x'), repeat(ref('AB', cat(sym('a'), sym('b'))), 2, 2))
		);
		const hyphen = defsOf([['my-name', 'q']]);
		expectTree(flex('{my-name}', hyphen), ref('my-name', sym('q')));
	});

	it('ignores trailing whitespace (the pattern ends there)', () => {
		expectTree(flex('abc   '), cat(sym('a'), sym('b'), sym('c')));
		expect(pattern('a$ \t').eol).toBe(true);
	});

	it('gives every node a span', () => {
		const r = flex('(a|b)*c');
		expect(r.span).toEqual({ start: 0, end: 7, source: null });
		if (r.kind !== 'concat' || r.parts[0].kind !== 'star') throw new Error('shape');
		expect(r.parts[0].span).toEqual({ start: 0, end: 6, source: null });
		expect(r.parts[0].body.span).toEqual({ start: 0, end: 5, source: null });
		expect(r.parts[1].span).toEqual({ start: 6, end: 7, source: null });
	});
});

describe('parseFlexPattern: errors', () => {
	it('rejects empty input', () => {
		expect(errorsOf('')).toEqual([['Enter a flex pattern', 0, 0]]);
		expect(errorsOf('  ')).toEqual([['Enter a flex pattern', 0, 2]]);
	});

	it('rejects unquoted spaces', () => {
		expect(errorsOf('a b')).toEqual([
			['unquoted space ends a flex pattern; write " " or \\  for a space', 1, 2]
		]);
		expect(errorsOf(' a')).toEqual([['a flex pattern cannot start with a space', 0, 1]]);
	});

	it('rejects undefined definitions', () => {
		expect(errorsOf('{DIGIT}+')).toEqual([['undefined definition {DIGIT}', 0, 7]]);
		expect(
			parseFlexPattern('{D}', { invalid: new Set(['D']) }).diagnostics.map((d) => d.message)
		).toEqual(['definition {D} has errors']);
		expect(errorsOf('{DIGIT')).toEqual([['missing } after {DIGIT', 0, 6]]);
	});

	it('rejects malformed braces and repetitions', () => {
		expect(errorsOf('{3}')).toEqual([['{3} has nothing to repeat', 0, 3]]);
		expect(errorsOf('a{5,2}')).toEqual([['bad repetition {5,2}: 2 is less than 5', 1, 6]]);
		expect(errorsOf('a{2')).toEqual([['bad repetition; write {n}, {n,}, or {n,m}', 1, 3]]);
		expect(errorsOf('a{2000}')).toEqual([['count is too large (at most 1000)', 1, 7]]);
		expect(errorsOf('a{,3}')).toEqual([
			['{ starts a repetition {n,m} or a definition {NAME}; write \\{ for a literal {', 1, 2]
		]);
	});

	it('rejects unbalanced or empty groups and missing operands', () => {
		expect(errorsOf('(ab')).toEqual([['( is never closed', 0, 1]]);
		expect(errorsOf('ab)')).toEqual([['unmatched )', 2, 3]]);
		expect(errorsOf('()')).toEqual([['empty group (); use "" for the empty string', 0, 2]]);
		expect(errorsOf('a|')).toEqual([['missing operand after |', 1, 2]]);
		expect(errorsOf('|a')).toEqual([['missing operand before |', 0, 1]]);
		expect(errorsOf('*a')).toEqual([['* has nothing to repeat', 0, 1]]);
	});

	it('rejects misplaced trailing context and anchors', () => {
		expect(errorsOf('a/b/c')).toEqual([['a pattern can have only one trailing context /', 3, 4]]);
		expect(errorsOf('(a/b)')).toEqual([['trailing context / cannot be inside parentheses', 2, 3]]);
		expect(errorsOf('a/b$')).toEqual([
			['a pattern cannot have both / and $; write r/s\\n instead', 3, 4]
		]);
		expect(errorsOf('a/')).toEqual([['missing trailing context after /', 1, 2]]);
		expect(errorsOf('/a')).toEqual([['missing pattern before /', 0, 1]]);
		expect(errorsOf('^')).toEqual([['nothing after ^', 0, 1]]);
		expect(errorsOf('$')).toEqual([['nothing before $', 0, 1]]);
	});

	it('rejects unterminated strings and classes, and bad escapes', () => {
		expect(errorsOf('"abc')).toEqual([['unterminated string: missing closing "', 0, 4]]);
		expect(errorsOf('[abc')).toEqual([['unterminated class: missing ]', 0, 4]]);
		expect(errorsOf('[[:foo:]]')).toEqual([['unknown character class [:foo:]', 1, 8]]);
		expect(errorsOf('\\x')).toEqual([['\\x needs one or two hex digits, e.g. \\x41', 0, 2]]);
		expect(errorsOf('a\\')).toEqual([['incomplete escape \\', 1, 2]]);
	});
});

describe('parseFlexDefinitions', () => {
	const lines = (...pairs: [string, string][]): FlexDefinitionLine[] =>
		pairs.map(([name, text], i) => ({ name, text, line: i + 1 }));

	it('accepts definitions in any order', () => {
		const res = parseFlexDefinitions(lines(['ID', '{LETTER}+'], ['LETTER', '[a-z]']));
		expect(res.diagnostics).toEqual([]);
		expectTree(res.defs.get('ID')!, plus(ref('LETTER', chars(CharSet.range('a', 'z')))));
		expect(res.entries.map((e) => [e.name, e.line, e.text])).toEqual([
			['ID', 1, '{LETTER}+'],
			['LETTER', 2, '[a-z]']
		]);
	});

	it('reports cycles, duplicates, bad names, and failed dependencies', () => {
		const res = parseFlexDefinitions(
			lines(['A', '{B}x'], ['B', '{A}'], ['C', '(oops'], ['D', '{C}+'], ['A', 'y'], ['9X', 'z'])
		);
		expect(res.diagnostics.map((d) => [d.message, d.span?.source])).toEqual([
			['A is defined in terms of itself: {A} → {B} → {A}', 'A'],
			['B is defined in terms of itself: {B} → {A} → {B}', 'B'],
			['( is never closed', 'C'],
			['definition {C} has errors', 'D'],
			['A is already defined on line 1', 'A'],
			['9X is not a valid name: use letters, digits, _ and -, starting with a letter or _', '9X']
		]);
		expect(res.defs.size).toBe(0);
	});

	it('keeps anchors and trailing context out of definitions', () => {
		const res = parseFlexDefinitions(lines(['A', '^a'], ['B', 'b$'], ['C', 'c/d']));
		expect(res.diagnostics.map((d) => d.message)).toEqual([
			'^ belongs in a rule, not a definition',
			'$ belongs in a rule, not a definition',
			'trailing context / belongs in a rule, not a definition'
		]);
	});

	it('offsets spans by textStart and nameStart', () => {
		const res = parseFlexDefinitions([
			{ name: 'DIGIT', text: '[0-9', line: 3, nameStart: 40, textStart: 50 }
		]);
		expect(res.entries[0].nameSpan).toEqual({ start: 40, end: 45, source: 'DIGIT' });
		expect(res.entries[0].exprSpan).toEqual({ start: 50, end: 54, source: 'DIGIT' });
		expect(res.diagnostics.map((d) => d.span)).toEqual([{ start: 50, end: 54, source: 'DIGIT' }]);
		const ok = parseFlexDefinitions([{ name: 'D', text: 'ab', line: 1, textStart: 10 }]);
		expect(ok.defs.get('D')!.span).toEqual({ start: 10, end: 12, source: 'D' });
	});

	it('finds references past strings, classes, and escapes', () => {
		// Were {B} found inside A, A → B → A would be a cycle.
		const res = parseFlexDefinitions(lines(['A', '"{B}"[{B}]\\{B}'], ['B', '{A}']));
		expect(res.diagnostics).toEqual([]);
		expectTree(
			res.defs.get('A')!,
			cat(sym('{B}'), chars(CharSet.of('{B}')), ...[...'{B}'].map(sym))
		);
	});
});

describe('flex patterns print and read back', () => {
	const defs = defsOf([
		['DELIM', '[ \\t]+'],
		['DIGIT', '[0-9]'],
		['LETTER', '[A-Za-z]']
	]);
	const examples = [
		'[0-9]+',
		'.|\\n',
		'\\n',
		'^{DELIM}',
		'{DELIM}',
		'{LETTER}({LETTER}|{DIGIT})*',
		'"ab"*',
		'x|yz*',
		'a/b',
		'a$',
		'r{2,5}',
		'[^\\n]',
		'[[:alpha:]_]',
		'\\x41',
		'"a b"',
		'^(a|b)+/c{2,}',
		'^[^\\n]*$',
		'\\^\\$\\/\\{\\}',
		'""'
	];

	it.each(examples)('%s', (text) => {
		const p = pattern(text, defs);
		for (const parens of ['minimal', 'full'] as const) {
			const printed = printFlexPattern(p, { parens });
			const back = pattern(printed, defs);
			expect([back.bol, back.eol], printed).toEqual([p.bol, p.eol]);
			expectTree(back.regex, p.regex);
			if (p.trailing) expectTree(back.trailing!, p.trailing);
			else expect(back.trailing).toBe(null);
		}
	});
});
