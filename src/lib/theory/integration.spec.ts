/**
 * End-to-end golden tests: lecture text goes through the real parsers and the
 * automata constructions, and must reproduce the slide artifacts exactly.
 */
import { describe, expect, it } from 'vitest';
import { parseDefinitions, parseFlexPattern, parseRegex, type Regex } from './regex';
import {
	compareLanguages,
	enumerate,
	epsilonClosure,
	minimize,
	regexToDfa,
	runNfa,
	scan,
	subsetConstruction,
	thompson,
	type TokenRule
} from './automata';
import { edgeList, id, names } from './automata/test-helpers';

function re(text: string, defs = ''): Regex {
	const d = parseDefinitions(defs);
	expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
	const r = parseRegex(text, { defs: d.defs });
	if (!r.ok) throw new Error(r.diagnostics.map((x) => x.message).join('; '));
	return r.regex;
}

const DIGIT = "digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'";
const LETTER = "letter = 'A' | … | 'Z' | 'a' | … | 'z'";

describe('Lexical Analysis IV: (1 | 0)*1', () => {
	const { nfa } = thompson(re('(1 | 0)*1'));

	it('Thompson gives the slide-6 NFA A–J', () => {
		expect(nfa.states.map((s) => s.name).sort()).toEqual('ABCDEFGHIJ'.split(''));
		expect(nfa.states[nfa.start].name).toBe('A');
		expect(nfa.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['J']);
		expect(edgeList(nfa).sort()).toEqual(
			[
				'A-ε->B',
				'A-ε->H',
				'B-ε->C',
				'B-ε->D',
				'C-1->E',
				'D-0->F',
				'E-ε->G',
				'F-ε->G',
				'G-ε->A',
				'H-ε->I',
				'I-1->J'
			].sort()
		);
	});

	it('ε-closure orders states as the slides name them', () => {
		expect(names(nfa, epsilonClosure(nfa, [id(nfa, 'A')])).join('')).toBe('ABCDHI');
		expect(names(nfa, epsilonClosure(nfa, [id(nfa, 'F')])).join('')).toBe('FGABCDHI');
		expect(names(nfa, epsilonClosure(nfa, [id(nfa, 'E'), id(nfa, 'J')])).join('')).toBe(
			'EJGABCDHI'
		);
	});

	it('subset construction gives the slide-10 DFA', () => {
		const { dfa } = subsetConstruction(nfa);
		expect(dfa.states.map((s) => s.name)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(dfa.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['EJGABCDHI']);
		expect(edgeList(dfa).sort()).toEqual(
			[
				'ABCDHI-0->FGABCDHI',
				'ABCDHI-1->EJGABCDHI',
				'FGABCDHI-0->FGABCDHI',
				'FGABCDHI-1->EJGABCDHI',
				'EJGABCDHI-0->FGABCDHI',
				'EJGABCDHI-1->EJGABCDHI'
			].sort()
		);
		// "Is the previous DFA minimal?" (slide 11): no.
		expect(minimize(dfa).dfa.states).toHaveLength(2);
	});
});

describe('Lexical Analysis III automata', () => {
	it('(0 | 1)* 1 (0|1)^2 needs 8 DFA states', () => {
		const { dfa } = subsetConstruction(thompson(re('(0 | 1)* 1 (0|1)^2')).nfa);
		expect(minimize(dfa).dfa.states).toHaveLength(8);
	});

	it('the NFA on slide 13 accepts 1 0 1', () => {
		const { nfa } = thompson(re('(0|1)*01'));
		expect(runNfa(nfa, '101').accepted).toBe(true);
		expect(runNfa(nfa, '110').accepted).toBe(false);
	});
});

describe('Lexical Analysis examples', () => {
	it('enumerates the slide-25 and slide-26 languages', () => {
		expect(
			enumerate(regexToDfa(re("('0' | '1') ('0' | '1')")), { maxLength: 4, limit: 10 }).strings
		).toEqual(['00', '01', '10', '11']);
		expect(enumerate(regexToDfa(re("'1' '0'*")), { maxLength: 3, limit: 10 }).strings).toEqual([
			'1',
			'10',
			'100'
		]);
	});

	it('identifier differs from (letter* | digit*) (slide 29)', () => {
		const defs = `${LETTER}\n${DIGIT}`;
		const cmp = compareLanguages(
			regexToDfa(re('letter (letter | digit)*', defs)),
			regexToDfa(re('(letter* | digit*)', defs))
		);
		expect(cmp.equivalent).toBe(false);
		expect(cmp.onlyA).toBe('A0');
		expect(cmp.onlyB).toBe('');
	});

	it('the phone RE rejects the slide input with a space (slide 31)', () => {
		const defs = `${DIGIT}\narea = digit^3\nexchange = digit^3\nphone = digit^4`;
		const dfa = regexToDfa(re("'(' area ')' exchange '-' phone", defs));
		expect(enumerate(dfa, { maxLength: 13, limit: 1 }).strings[0]).toBe('(000)000-0000');
		const cmp = compareLanguages(dfa, regexToDfa(re("'(717)867-5309'")));
		expect(cmp.onlyB).toBeNull();
	});
});

describe('Lexical Analysis II scanning loop', () => {
	const defs = `${DIGIT}\n${LETTER}`;
	const rules = (spec: [string, string][]): TokenRule[] =>
		spec.map(([name, text]) => ({ name, regex: re(text, defs) }));
	const pairs = (rs: TokenRule[], input: string) =>
		scan(rs, input).tokens.map((t) => `(${t.name}, "${t.lexeme}")`);

	const R: [string, string][] = [
		['Whitespace', "' '+"],
		['Integer', 'digit+'],
		['Identifier', 'letter (letter | digit)*'],
		['Plus', "'+'"]
	];

	it('f+3 +g (slide 7)', () => {
		expect(pairs(rules(R), 'f+3 +g')).toEqual([
			'(Identifier, "f")',
			'(Plus, "+")',
			'(Integer, "3")',
			'(Whitespace, " ")',
			'(Plus, "+")',
			'(Identifier, "g")'
		]);
	});

	it('maximal munch on foo+3 (slide 9)', () => {
		expect(pairs(rules(R), 'foo+3')).toEqual([
			'(Identifier, "foo")',
			'(Plus, "+")',
			'(Integer, "3")'
		]);
	});

	it("'new' before Identifier wins only ties (slide 11)", () => {
		const rs = rules([
			['Whitespace', "' '+"],
			['New', "'new'"],
			['Integer', 'digit+'],
			['Identifier', 'letter (letter | digit)*']
		]);
		expect(pairs(rs, 'new foo')).toEqual([
			'(New, "new")',
			'(Whitespace, " ")',
			'(Identifier, "foo")'
		]);
		expect(pairs(rs, 'newer')).toEqual(['(Identifier, "newer")']);
	});

	it('=56 gets stuck without an Error rule (slide 12)', () => {
		expect(scan(rules(R), '=56').stuck).toBe(0);
		expect(
			scan(rules(R), '=56', { errorRule: true }).tokens.map((t) => `${t.name}:${t.lexeme}`)
		).toEqual(['Error:=', 'Integer:56']);
	});
});

describe('flex dialect', () => {
	it('parses the slide-10 definitions and matches identifiers', () => {
		const defs = new Map<string, Regex>();
		const digit = parseFlexPattern('[0-9]');
		const letter = parseFlexPattern('[A-Za-z]');
		if (!digit.ok || !letter.ok) throw new Error('bad defs');
		defs.set('DIGIT', digit.pattern.regex);
		defs.set('LETTER', letter.pattern.regex);
		const id = parseFlexPattern('{LETTER}({LETTER}|{DIGIT})*', { defs });
		if (!id.ok) throw new Error('bad pattern');
		const dfa = regexToDfa(id.pattern.regex);
		const cmp = compareLanguages(
			dfa,
			regexToDfa(re('letter (letter | digit)*', `${LETTER}\n${DIGIT}`))
		);
		expect(cmp.equivalent).toBe(true);
	});
});
