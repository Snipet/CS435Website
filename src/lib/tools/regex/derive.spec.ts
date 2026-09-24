import { describe, expect, it } from 'vitest';
import { accepts, regexToDfa } from '$lib/theory/automata';
import { parseDefinitions, parseRegex, printRegex, type Regex } from '$lib/theory/regex';
import { brackets, derive, flattenBrackets, type Bracket, type Derivation } from './derive';

function re(text: string, defs = ''): Regex {
	const d = parseDefinitions(defs);
	const r = parseRegex(text, { defs: d.defs });
	if (!r.ok) throw new Error(r.diagnostics.map((x) => x.message).join('; '));
	return r.regex;
}

function tree(r: Regex, s: string): Derivation {
	const res = derive(r, s);
	if (res.status !== 'match') throw new Error(`no derivation: ${res.status}`);
	return res.tree;
}

/** "text:matched" for each node of a derivation, pre-order. */
function spans(d: Derivation, s: string): string[] {
	return [
		`${printRegex(d.node)}:${s.slice(d.start, d.end)}`,
		...d.children.flatMap((c) => spans(c, s))
	];
}

/** Brackets as "label:matched@height". */
function shown(b: Bracket, s: string): string[] {
	return flattenBrackets(b).map(
		(x) => `${printRegex(x.derivation.node)}:${s.slice(x.start, x.end)}@${x.height}`
	);
}

const DIGIT = "digit = '0' | '1' | '2' | … | '9'";
const LETTER = "letter = 'A' | … | 'Z' | 'a' | … | 'z'";

describe('derive', () => {
	it('follows each clause of the definition', () => {
		expect(spans(tree(re("'c'"), 'c'), 'c')).toEqual(["'c':c"]);
		expect(spans(tree(re('ε'), ''), '')).toEqual(['ε:']);
		expect(derive(re('ɸ'), '').status).toBe('no-match');
		expect(spans(tree(re("('0' | '1') ('0' | '1')"), '01'), '01')).toEqual([
			"('0' | '1') ('0' | '1'):01",
			"'0' | '1':0",
			"'0':0",
			"'0' | '1':1",
			"'1':1"
		]);
		expect(spans(tree(re("'0'*"), ''), '')).toEqual(["'0'*:"]);
		expect(spans(tree(re("'0'*"), '00'), '00')).toEqual(["'0'*:00", "'0':0", "'0':0"]);
	});

	it('splits concatenations with the longest match first', () => {
		const d = tree(re('(0 | 1)*00'), '1000');
		expect(d.children.map((c) => '1000'.slice(c.start, c.end))).toEqual(['10', '0', '0']);
	});

	it('uses definitions and fixed iteration', () => {
		const defs = `${DIGIT}\narea = digit^3\nexchange = digit^3\nphone = digit^4`;
		const s = '(717)867-5309';
		const d = tree(re("'(' area ')' exchange '-' phone", defs), s);
		expect(d.children.map((c) => `${printRegex(c.node)}:${s.slice(c.start, c.end)}`)).toEqual([
			"'(':(",
			'area:717',
			"')':)",
			'exchange:867',
			"'-':-",
			'phone:5309'
		]);
		const area = d.children[1];
		expect(area.children[0].node.kind).toBe('repeat');
		expect(area.children[0].children).toHaveLength(3);
		expect(area.children[0].children.every((c) => c.path.join('.') === '1.0.0')).toBe(true);
	});

	it('pads a nullable body up to the lower count', () => {
		const d = tree(re('(a?)^3'), 'a');
		expect(d.children.map((c) => [c.start, c.end])).toEqual([
			[0, 1],
			[1, 1],
			[1, 1]
		]);
		const p = tree(re('(a*)+'), '');
		expect(p.children).toHaveLength(1);
	});

	it('handles bounded repetition and optionals', () => {
		expect(derive(re('a^{2,3}'), 'a').status).toBe('no-match');
		expect(tree(re('a^{2,3}'), 'aaa').children).toHaveLength(3);
		expect(derive(re('a^{2,3}'), 'aaaa').status).toBe('no-match');
		expect(tree(re('a^{2,}'), 'aaaaa').children).toHaveLength(5);
		expect(tree(re('a? b'), 'b').children[0].children).toEqual([]);
	});

	it('reports offsets in code units for astral symbols', () => {
		const d = tree(re("'😀'+ 'x'"), '😀😀x');
		expect(d.children[0]).toMatchObject({ start: 0, end: 4 });
		expect(d.children[1]).toMatchObject({ start: 4, end: 5 });
	});

	it('gives up on long inputs and over budget', () => {
		expect(derive(re('a*'), 'a'.repeat(100))).toEqual({ status: 'too-long', maxLength: 80 });
		expect(derive(re('(a | a a)* b'), 'a'.repeat(60) + 'c', { budget: 50 }).status).toBe(
			'too-complex'
		);
	});

	it('agrees with the DFA on every short string', () => {
		const cases: [string, string][] = [
			['(0 | 1)*00', ''],
			['(0|1)*01', ''],
			['(0 | 1)* 1 (0|1)^2', ''],
			['(1 | 0)*1', ''],
			['1*0', ''],
			['(0 | 1*)* 0?', ''],
			['(0 0 | 1)+ (0 | ε)^{1,2}', ''],
			['((0 | ε)(1 | ε))^3 0*', ''],
			['bit^2 | bit*1', 'bit = 0 | 1']
		];
		for (const [text, defs] of cases) {
			const r = re(text, defs);
			const dfa = regexToDfa(r);
			for (let len = 0; len <= 6; len++)
				for (let k = 0; k < 1 << len; k++) {
					const s = len === 0 ? '' : k.toString(2).padStart(len, '0');
					const res = derive(r, s);
					expect(res.status === 'match', `${text} on "${s}"`).toBe(accepts(dfa, s));
					if (res.status === 'match') {
						expect(res.tree.start).toBe(0);
						expect(res.tree.end).toBe(s.length);
					}
				}
		}
	});
});

describe('brackets', () => {
	it('shows definitions, drops leaves that repeat their parent, and lets choices through', () => {
		const r = re('letter (letter | digit)*', `${LETTER}\n${DIGIT}`);
		const b = brackets(tree(r, 'x2y'));
		expect(shown(b, 'x2y')).toEqual([
			'letter (letter | digit)*:x2y@2',
			'letter:x@0',
			'(letter | digit)*:2y@1',
			'digit:2@0',
			'letter:y@0'
		]);
	});

	it('keeps literals inside longer brackets and nests iterations', () => {
		const defs = `${DIGIT}\narea = digit^3`;
		const s = '(717)';
		expect(shown(brackets(tree(re("'(' area ')'", defs), s)), s)).toEqual([
			"'(' area ')':(717)@3",
			"'(':(@0",
			'area:717@2',
			'digit^3:717@1',
			'digit:7@0',
			'digit:1@0',
			'digit:7@0',
			"')':)@0"
		]);
	});

	it('treats a quoted literal as one bracket and skips empty matches', () => {
		expect(shown(brackets(tree(re("'if' | 'then'"), 'then')), 'then')).toEqual([
			"'if' | 'then':then@0"
		]);
		expect(shown(brackets(tree(re("'0'* '1'"), '1')), '1')).toEqual(["'0'* '1':1@0"]);
		expect(shown(brackets(tree(re("'0'* '1'"), '01')), '01')).toEqual([
			"'0'* '1':01@1",
			"'0'*:0@0",
			"'1':1@0"
		]);
		expect(shown(brackets(tree(re("'0'*"), '000')), '000')).toEqual([
			"'0'*:000@1",
			"'0':0@0",
			"'0':0@0",
			"'0':0@0"
		]);
	});
});
