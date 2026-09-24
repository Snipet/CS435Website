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
	ref,
	repeat,
	star,
	sym,
	type Regex
} from './ast';
import {
	containsAny,
	expandRefs,
	nodeAtPath,
	nullable,
	refsIn,
	regexEquals,
	resolveAny,
	symbolsOf,
	walk
} from './analyze';
import { parseDefinitions, parseRegex } from './lecture';

const defs = parseDefinitions(
	"digit = '0' | … | '9'\nletter = 'a' | … | 'z'\nid = letter (letter | digit)*"
).defs;

function lecture(text: string): Regex {
	const r = parseRegex(text, { defs });
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return r.regex;
}

describe('nullable', () => {
	it('follows the inductive definition', () => {
		expect(nullable(empty())).toBe(false);
		expect(nullable(eps())).toBe(true);
		expect(nullable(sym('a'))).toBe(false);
		expect(nullable(any())).toBe(false);
		expect(nullable(star(sym('a')))).toBe(true);
		expect(nullable(star(empty()))).toBe(true);
		expect(nullable(plus(sym('a')))).toBe(false);
		expect(nullable(plus(opt(sym('a'))))).toBe(true);
		expect(nullable(opt(sym('a')))).toBe(true);
		expect(nullable(repeat(sym('a'), 0, 3))).toBe(true);
		expect(nullable(repeat(sym('a'), 2, 3))).toBe(false);
		expect(nullable(repeat(eps(), 2, 2))).toBe(true);
		expect(nullable(cat(star(sym('a')), opt(sym('b'))))).toBe(true);
		expect(nullable(cat(star(sym('a')), sym('b')))).toBe(false);
		expect(nullable(alt(sym('a'), eps()))).toBe(true);
		expect(nullable(alt(sym('a'), sym('b')))).toBe(false);
	});

	it('looks through definitions', () => {
		expect(nullable(lecture('id'))).toBe(false);
		expect(nullable(lecture('(letter* | digit*)'))).toBe(true);
	});
});

describe('symbolsOf / containsAny / resolveAny', () => {
	it('collects every character set, through definitions', () => {
		const s = symbolsOf(lecture("id '_'"));
		expect(
			s.equals(CharSet.range('0', '9').union(CharSet.range('a', 'z')).union(CharSet.single('_')))
		).toBe(true);
		expect(symbolsOf(any()).isEmpty).toBe(true);
		expect(symbolsOf(sym('if')).equals(CharSet.of('fi'))).toBe(true);
	});

	it('finds and resolves Σ', () => {
		const r = lecture("Σ* '1' Σ");
		expect(containsAny(r)).toBe(true);
		expect(containsAny(lecture('id'))).toBe(false);
		const sigma = CharSet.of('01');
		const resolved = resolveAny(r, sigma);
		expect(containsAny(resolved)).toBe(false);
		expect(regexEquals(resolved, cat(star(chars(sigma)), sym('1'), chars(sigma)))).toBe(true);
		// Spans stay; the input is not changed.
		expect(resolved.kind === 'concat' && resolved.parts[2].span).toEqual({
			start: 7,
			end: 8,
			source: null
		});
		expect(containsAny(r)).toBe(true);
		const plain = lecture("'a'");
		expect(resolveAny(plain, sigma)).toBe(plain);
	});

	it('resolves Σ inside definitions without touching the definition', () => {
		const d = parseDefinitions('anything = Σ*\nline = anything').defs;
		const line = d.get('line')!;
		const resolved = resolveAny(line, CharSet.of('ab'));
		expect(containsAny(resolved)).toBe(false);
		expect(containsAny(d.get('anything')!)).toBe(true);
		expect(resolved.kind).toBe('ref');
	});
});

describe('refsIn', () => {
	it('lists definitions used, directly or indirectly, in first-use order', () => {
		expect(refsIn(lecture('id digit'))).toEqual(['id', 'letter', 'digit']);
		expect(refsIn(lecture("'x'"))).toEqual([]);
	});
});

describe('walk / nodeAtPath', () => {
	it('visits in pre-order with child-index paths', () => {
		const r = lecture("('1' | '0')* '1'");
		const seen: [string, number[], number][] = [];
		walk(r, (node, path, depth) => seen.push([node.kind, path, depth]));
		expect(seen).toEqual([
			['concat', [], 0],
			['star', [0], 1],
			['alt', [0, 0], 2],
			['chars', [0, 0, 0], 3],
			['chars', [0, 0, 1], 3],
			['chars', [1], 1]
		]);
		for (const [, path] of seen) expect(nodeAtPath(r, path)).toBeDefined();
		expect(nodeAtPath(r, [0, 0, 1])?.span).toEqual({ start: 7, end: 10, source: null });
	});

	it('enters definition bodies', () => {
		const r = lecture('digit');
		const kinds: string[] = [];
		walk(r, (node) => kinds.push(node.kind));
		expect(kinds).toEqual(['ref', 'chars']);
		expect(nodeAtPath(r, [0])?.kind).toBe('chars');
	});

	it('returns undefined for paths that leave the tree', () => {
		const r = lecture("'a' 'b'");
		expect(nodeAtPath(r, [])).toBe(r);
		expect(nodeAtPath(r, [2])).toBeUndefined();
		expect(nodeAtPath(r, [0, 0])).toBeUndefined();
	});
});

describe('expandRefs / regexEquals', () => {
	it('expands nested references', () => {
		const r = expandRefs(lecture('id'));
		expect(refsIn(r)).toEqual([]);
		const letter = chars(CharSet.range('a', 'z'));
		const digit = chars(CharSet.range('0', '9'));
		expect(regexEquals(r, cat(letter, star(alt(letter, digit))))).toBe(true);
	});

	it('compares structure, not spans or display text', () => {
		expect(regexEquals(lecture("'a'"), lecture('a'))).toBe(true);
		expect(regexEquals(lecture("'ab'"), lecture("'a' 'b'"))).toBe(false);
		expect(regexEquals(lecture('[a-c]'), lecture("'a' | … | 'c'"))).toBe(true);
		expect(regexEquals(lecture("'a'^2"), repeat(sym('a'), 2, 3))).toBe(false);
		expect(regexEquals(ref('x', sym('a')), ref('y', sym('a')))).toBe(false);
		expect(regexEquals(alt(sym('a'), sym('b')), alt(sym('a')))).toBe(false);
		expect(regexEquals(eps(), empty())).toBe(false);
	});
});
