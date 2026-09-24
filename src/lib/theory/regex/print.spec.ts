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
import { expandRefs, regexEquals } from './analyze';
import { FLEX_DOT, parseFlexPattern } from './flex';
import { parseDefinitions, parseRegex } from './lecture';
import { printFlexPattern, printRegex, type PrintOptions } from './print';

function lecture(text: string, defs?: ReadonlyMap<string, Regex>): Regex {
	const r = parseRegex(text, { defs });
	if (!r.ok) throw new Error(`${text}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
	return r.regex;
}

const defs = parseDefinitions(
	"digit = '0' | '1' | … | '9'\nletter = [A-Za-z]\nnumber = digit digit*"
).defs;
const D = ref('digit', defs.get('digit')!);

describe('printRegex: lecture notation', () => {
	it('prints the lecture examples with minimal parentheses', () => {
		const cases: [string, string, string][] = [
			// input, quoted symbols, bare symbols
			['(1 | 0)*1', "('1' | '0')* '1'", '(1 | 0)* 1'],
			['(0 | 1)* 1 (0|1)^2', "('0' | '1')* '1' ('0' | '1')^2", '(0 | 1)* 1 (0 | 1)^2'],
			["'if' | 'then' | 'else'", "'if' | 'then' | 'else'", "'if' | 'then' | 'else'"],
			["'0' | '1' | … | '9'", '[0-9]', '[0-9]'],
			["'1' '0'*", "'1' '0'*", '1 0*'],
			["'ab'*", "'ab'*", "'ab'*"],
			['letter (letter | digit)*', 'letter (letter | digit)*', 'letter (letter | digit)*'],
			["'(' digit^3 ')'", "'(' digit^3 ')'", "'(' digit^3 ')'"],
			["'a' ɸ | ε | Σ*", "'a' ɸ | ε | Σ*", 'a ɸ | ε | Σ*'],
			["x ('.' y)+ '@'", "'x' ('.' 'y')+ '@'", "x ('.' y)+ @"]
		];
		for (const [input, quoted, bare] of cases) {
			const r = lecture(input, defs);
			expect(printRegex(r), input).toBe(quoted);
			expect(printRegex(r, { symbols: 'bare' }), input).toBe(bare);
		}
	});

	it('keeps parentheses the tree needs', () => {
		expect(printRegex(cat(cat(sym('a'), sym('b')), sym('c')))).toBe("('a' 'b') 'c'");
		expect(printRegex(alt(alt(sym('a'), sym('b')), sym('c')))).toBe("('a' | 'b') | 'c'");
		expect(printRegex(star(star(sym('a'))))).toBe("('a'*)*");
		expect(printRegex(star(cat(sym('a'), sym('b'))))).toBe("('a' 'b')*");
		expect(printRegex(cat(alt(sym('a'), sym('b')), sym('c')))).toBe("('a' | 'b') 'c'");
		expect(printRegex(alt(cat(sym('a'), sym('b')), star(sym('c'))))).toBe("'a' 'b' | 'c'*");
	});

	it('wraps every compound operand with parens: full', () => {
		const r = lecture('(1 | 0)*1 | 0 1');
		expect(printRegex(r, { parens: 'full', symbols: 'bare' })).toBe('(((1 | 0)*) 1) | (0 1)');
	});

	it('prints repetition counts', () => {
		expect(printRegex(pow(sym('a'), 3))).toBe("'a'^3");
		expect(printRegex(pow(sym('a'), 0))).toBe("'a'^0");
		expect(printRegex(repeat(sym('a'), 2, 5))).toBe("'a'^{2,5}");
		expect(printRegex(repeat(sym('a'), 2, null))).toBe("'a'^{2,}");
		expect(printRegex(opt(plus(sym('a'))))).toBe("('a'+)?");
	});

	it('escapes characters inside quotes', () => {
		expect(printRegex(sym("'"))).toBe("'\\''");
		expect(printRegex(sym('\\'))).toBe("'\\\\'");
		expect(printRegex(sym('\t'))).toBe("'\\t'");
		expect(printRegex(sym(' '))).toBe("' '");
		expect(printRegex(sym('\0'))).toBe("'\\0'");
		expect(printRegex(sym('‘'))).toBe("'\\‘'");
		expect(printRegex(sym("it's"))).toBe("'it\\'s'");
		expect(printRegex(sym('ε'))).toBe("'ε'");
	});

	it('prints classes, including the empty and full sets', () => {
		expect(printRegex(chars(CharSet.of('acx')))).toBe('[acx]');
		expect(printRegex(chars(CharSet.of('abcd')))).toBe('[a-d]');
		expect(printRegex(chars(CharSet.of('ab')))).toBe('[ab]');
		expect(printRegex(chars(CharSet.single('\n').complement()))).toBe('[^\\n]');
		expect(printRegex(chars(CharSet.of('-]^')))).toBe('[\\-\\]\\^]');
		expect(printRegex(chars(CharSet.of('[\\x')))).toBe('[\\[\\\\x]');
		expect(printRegex(chars(CharSet.of('\0' + '1')))).toBe('[\\x001]');
		expect(printRegex(chars(CharSet.EMPTY))).toBe('[^\\x00-\\u{10FFFF}]');
		expect(printRegex(chars(CharSet.ANY))).toBe('[\\x00-\\u{10FFFF}]');
	});

	it('prints references by name or expanded', () => {
		const number = lecture('number', defs);
		expect(printRegex(number)).toBe('number');
		expect(printRegex(number, { expandRefs: true })).toBe('[0-9] [0-9]*');
		expect(printRegex(plus(D), { expandRefs: true })).toBe('[0-9]+');
	});
});

describe('printRegex: flex', () => {
	const f = (r: Regex, o: PrintOptions = {}) => printRegex(r, { ...o, dialect: 'flex' });

	it('prints lecture examples as flex patterns', () => {
		expect(f(lecture('(1 | 0)*1'))).toBe('(1|0)*1');
		expect(f(lecture("'if' | 'then' | 'else'"))).toBe('"if"|"then"|"else"');
		expect(f(lecture("'0' | '1' | … | '9'"))).toBe('[0-9]');
		expect(f(lecture('letter (letter | digit)*', defs))).toBe('{letter}({letter}|{digit})*');
		expect(f(lecture('letter (letter | digit)*', defs), { expandRefs: true })).toBe(
			'[A-Za-z]([A-Za-z]|[0-9])*'
		);
		expect(f(lecture("(' ' | '\\t')+"))).toBe('(" "|\\t)+');
		expect(f(lecture('digit^3', defs))).toBe('{digit}{3}');
		expect(f(repeat(sym('a'), 2, 5))).toBe('a{2,5}');
		expect(f(repeat(sym('a'), 2, null))).toBe('a{2,}');
	});

	it('escapes flex operators and spells ε, ɸ, Σ', () => {
		expect(f(cat(...[...'.*+?|/^$"()[]{}\\'].map(sym)))).toBe(
			'\\.\\*\\+\\?\\|\\/\\^\\$\\"\\(\\)\\[\\]\\{\\}\\\\'
		);
		expect(f(eps())).toBe('""');
		expect(f(empty())).toBe('[^\\x00-\\u{10FFFF}]');
		expect(f(any())).toBe('(.|\\n)');
		expect(f(chars(FLEX_DOT))).toBe('.');
		expect(f(sym('say "hi"'))).toBe('"say \\"hi\\""');
		expect(f(cat(sym('\0'), sym('1')))).toBe('\\x001');
	});

	it('prints whole patterns with anchors and trailing context', () => {
		const p = parseFlexPattern('^(a|b)+/c');
		if (!p.ok) throw new Error('parse');
		expect(printFlexPattern(p.pattern)).toBe('^(a|b)+/c');
		const q = parseFlexPattern('x|y$');
		if (!q.ok) throw new Error('parse');
		expect(printFlexPattern(q.pattern)).toBe('x|y$');
	});
});

// ---------------------------------------------------------------------------
// Property: parse(print(r)) = r
// ---------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const POOL = [
	...'abcxyzABZ019',
	...'-@.,;:/<>=!#&%$~{}`_',
	...'()[]|*+?^\'"\\‘’“”…',
	' ',
	'\t',
	'\n',
	'\0',
	'\x7f',
	'é',
	'ε',
	'Σ',
	'²',
	'😀',
	' '
];

function generator(seed: number, opts: { lecture: boolean }) {
	const r = rng(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
	const char = () => pick(POOL);

	const set = (): CharSet => {
		switch (int(0, 5)) {
			case 0:
				return CharSet.range('a', 'z');
			case 1:
				return FLEX_DOT;
			case 2:
				return CharSet.of(char(), char(), char());
			case 3:
				return CharSet.of(char(), char()).complement();
			case 4:
				return pick([CharSet.EMPTY, CharSet.ANY]);
			default:
				return CharSet.fromRanges([
					[0x30, 0x39],
					[int(0x41, 0x60), int(0x61, 0x7a)]
				]);
		}
	};

	const leaf = (): Regex => {
		const k = int(0, opts.lecture ? 8 : 6);
		switch (k) {
			case 0:
			case 1:
				return sym(char());
			case 2:
				return chars(set());
			case 3:
				return sym(Array.from({ length: int(2, 4) }, char).join(''));
			case 4:
				return D;
			case 5:
				return eps();
			case 6:
				return sym(pick([...'0123456789']));
			case 7:
				return empty();
			default:
				return any();
		}
	};

	const node = (depth: number): Regex => {
		if (depth <= 0 || r() < 0.25) return leaf();
		switch (int(0, 6)) {
			case 0:
				return { kind: 'concat', parts: Array.from({ length: int(2, 4) }, () => node(depth - 1)) };
			case 1:
				return { kind: 'alt', options: Array.from({ length: int(2, 4) }, () => node(depth - 1)) };
			case 2:
				return star(node(depth - 1));
			case 3:
				return plus(node(depth - 1));
			case 4:
				return opt(node(depth - 1));
			case 5: {
				const min = int(0, 3);
				return repeat(node(depth - 1), min, pick([min, min + int(1, 3), null]));
			}
			default:
				return leaf();
		}
	};
	return () => node(4);
}

describe('printRegex round trip', () => {
	const SAMPLES = 400;
	const lectureDefs = new Map([['digit', D.body]]);

	it('lecture notation: parse(print(r)) = r', () => {
		const next = generator(435, { lecture: true });
		for (let n = 0; n < SAMPLES; n++) {
			const r = next();
			for (const symbols of ['quoted', 'bare'] as const)
				for (const parens of ['minimal', 'full'] as const) {
					const printed = printRegex(r, { symbols, parens });
					const back = parseRegex(printed, { defs: lectureDefs });
					if (!back.ok) throw new Error(`${printed}: ${back.diagnostics.map((d) => d.message)}`);
					expect(regexEquals(back.regex, r), printed).toBe(true);
				}
		}
	});

	it('lecture notation with expanded references: parse(print(r)) = expand(r)', () => {
		const next = generator(2026, { lecture: true });
		for (let n = 0; n < SAMPLES; n++) {
			const r = next();
			const printed = printRegex(r, { expandRefs: true });
			const back = parseRegex(printed);
			if (!back.ok) throw new Error(`${printed}: ${back.diagnostics.map((d) => d.message)}`);
			expect(regexEquals(back.regex, expandRefs(r)), printed).toBe(true);
		}
	});

	it('flex: parse(print(r)) = r', () => {
		const next = generator(1975, { lecture: false });
		for (let n = 0; n < SAMPLES; n++) {
			const r = next();
			for (const parens of ['minimal', 'full'] as const) {
				const printed = printRegex(r, { dialect: 'flex', parens });
				const back = parseFlexPattern(printed, { defs: lectureDefs });
				if (!back.ok) throw new Error(`${printed}: ${back.diagnostics.map((d) => d.message)}`);
				expect(regexEquals(back.pattern.regex, r), printed).toBe(true);
				expect(back.pattern).toMatchObject({ bol: false, eol: false, trailing: null });
			}
		}
	});

	it('flex prints ɸ and Σ as equivalent patterns', () => {
		const e = parseFlexPattern(printRegex(empty(), { dialect: 'flex' }));
		expect(e.ok && e.pattern.regex.kind === 'chars' && e.pattern.regex.set.isEmpty).toBe(true);
		const s = parseFlexPattern(printRegex(any(), { dialect: 'flex' }));
		expect(s.ok && regexEquals(s.pattern.regex, alt(chars(FLEX_DOT), sym('\n')))).toBe(true);
	});
});
