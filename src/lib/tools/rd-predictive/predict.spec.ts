import { describe, expect, it } from 'vitest';
import { parseEbnf, type EbnfGrammar } from '$lib/theory/grammar';
import { opt, rep, sym } from './ebnf';
import { lookaheadOf, predict, predictionRows, type Choice } from './predict';

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

/** A choice as `rule: text ← tokens`, with what follows after a slash. */
const show = (c: Choice): string =>
	`${c.rule}: ${c.text} ← ${c.lookahead.join(' ')}${c.after.length ? ` / ${c.after.join(' ')}` : ''}`;

const choices = (text: string): string[] => predict(ebnf(text)).choices.map(show);
const messages = (text: string): string[] => predict(ebnf(text)).conflicts.map((c) => c.message);

const SLIDE_36 = 'E → T + E | T\nT → ( E ) | int | int * T';
const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';
const SLIDE_38 = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';

describe('is the grammar suitable for prediction? (slide 36)', () => {
	it('the grammar before left factoring is not', () => {
		const p = predict(ebnf(SLIDE_36));
		expect(p.suitable).toBe(false);
		expect(p.choices.map(show)).toEqual([
			'E: T + E ← ( int',
			'E: T ← ( int',
			'T: ( E ) ← (',
			'T: int ← int',
			'T: int * T ← int'
		]);
		expect(p.conflicts).toEqual([
			{
				kind: 'alternatives',
				rule: 'E',
				tokens: ['(', 'int'],
				parts: ['T + E', 'T'],
				message: 'E: the tokens ( and int select both T + E and T.'
			},
			{
				kind: 'alternatives',
				rule: 'T',
				tokens: ['int'],
				parts: ['int', 'int * T'],
				message: 'T: the token int selects both int and int * T.'
			}
		]);
		expect(p.diagnostics).toEqual(
			p.conflicts.map((c) => ({ severity: 'warning', message: c.message }))
		);
	});

	it('the left-factored grammar is (slide 37)', () => {
		const p = predict(ebnf(SLIDE_37));
		expect(p.suitable).toBe(true);
		expect(p.conflicts).toEqual([]);
		expect(p.diagnostics).toEqual([]);
		expect(p.choices.map(show)).toEqual([
			'E: [ + E ] ← + / ) $',
			'T: ( E ) ← (',
			'T: int [ * T ] ← int',
			'T: [ * T ] ← * / + ) $'
		]);
		expect(p.choices.map((c) => [c.kind, c.depth])).toEqual([
			['option', 1],
			['alternative', 0],
			['alternative', 0],
			['option', 1]
		]);
	});

	it('so is the grammar with loops (slide 38)', () => {
		const p = predict(ebnf(SLIDE_38));
		expect(p.suitable).toBe(true);
		expect(p.choices.map(show)).toEqual([
			'E: { + T } ← + / ) $',
			'T: { * F } ← * / + ) $',
			'F: ( E ) ← (',
			'F: int ← int'
		]);
		expect(p.choices.map((c) => c.kind)).toEqual([
			'repetition',
			'repetition',
			'alternative',
			'alternative'
		]);
	});

	it('and the grammars of slide 25', () => {
		expect(choices('S → 1 { 0 }')).toEqual(['S: { 0 } ← 0 / $']);
		const p = predict(ebnf('S → 1 S’\nS’ → 0 S’ | ε'));
		expect(p.suitable).toBe(true);
		// The alternative ε is selected by what may follow S’.
		expect(p.choices).toEqual([
			{
				kind: 'alternative',
				rule: 'S’',
				text: '0 S’',
				lookahead: ['0'],
				after: [],
				nullable: false,
				depth: 0
			},
			{
				kind: 'alternative',
				rule: 'S’',
				text: 'ε',
				lookahead: ['$'],
				after: ['$'],
				nullable: true,
				depth: 0
			}
		]);
	});
});

describe('conflicts', () => {
	it('an optional part whose first token may also follow it', () => {
		const p = predict(ebnf('S → if E then S [ else S ] | other\nE → b'));
		expect(p.suitable).toBe(false);
		expect(p.conflicts).toEqual([
			{
				kind: 'option',
				rule: 'S',
				tokens: ['else'],
				parts: ['[ else S ]'],
				message: 'S: the token else can start [ else S ] and can also come right after it.'
			}
		]);
	});

	it('a repeated part whose first token may also follow it', () => {
		expect(messages('S → { a } a')).toEqual([
			'S: the token a can start { a } and can also come right after it.'
		]);
		expect(messages('S → A a\nA → b { a | c }')).toEqual([
			'A: the token a can start { a | c } and can also come right after it.'
		]);
	});

	it('a repetition of something that can derive ε', () => {
		const p = predict(ebnf('A → { B } c\nB → b | ε'));
		// Another B may follow B, so b also selects the ε alternative of B.
		expect(p.conflicts.map((c) => c.kind)).toEqual(['empty-repetition', 'alternatives']);
		expect(p.conflicts.map((c) => c.message)).toEqual([
			'A: the part inside { B } can derive ε, so the repetition can go on without a token being matched.',
			'B: the token b selects both b and ε.'
		]);
	});

	it('two alternatives that can both derive ε', () => {
		expect(messages('S → A x\nA → B | C\nB → b | ε\nC → c | ε')).toEqual([
			'A: the token x selects both B and C.'
		]);
	});

	it('an alternative that can derive ε and a token that may follow', () => {
		expect(messages('S → A a\nA → a | ε')).toEqual(['A: the token a selects both a and ε.']);
	});

	it('left recursion (slide 23)', () => {
		const p = predict(ebnf('V → V a | b'));
		expect(p.suitable).toBe(false);
		expect(p.conflicts.map((c) => c.kind)).toEqual(['alternatives', 'left-recursion']);
		expect(p.conflicts[0].message).toBe('V: the token b selects both V a and b.');
		expect(p.conflicts[1]).toEqual({
			kind: 'left-recursion',
			rule: 'V',
			tokens: [],
			parts: ['V → V a | b'],
			message:
				'V is left-recursive: V () is called again before a token is matched, so the calls never end.'
		});
		// Through another non-terminal (slide 27): both are named.
		expect(
			predict(ebnf('S → A a | d\nA → S b'))
				.conflicts.filter((c) => c.kind === 'left-recursion')
				.map((c) => c.rule)
		).toEqual(['S', 'A']);
	});

	it('conflicts inside brackets', () => {
		expect(messages('S → a [ b c | b d ]')).toEqual(['S: the token b selects both b c and b d.']);
	});

	it('a grammar that uses $ or ε as a symbol', () => {
		const p = predict(ebnf('S → a $'));
		expect(p.reserved).toEqual(['$']);
		expect(p.suitable).toBe(false);
		expect(p.diagnostics[0]).toEqual({
			severity: 'error',
			message:
				'$ is a symbol of the grammar and also marks the end of the input or the empty string, so the lookahead sets cannot tell them apart.'
		});
	});
});

describe('choices inside brackets', () => {
	it('lists a bracket before the choices inside it, one level deeper', () => {
		const p = predict(ebnf('A → a { b [ c ] | d }'));
		expect(p.choices.map((c) => `${c.depth} ${show(c)}`)).toEqual([
			'1 A: { b [ c ] | d } ← b d / $',
			'1 A: b [ c ] ← b',
			'1 A: d ← d',
			// After [ c ] the loop may go round again, or end.
			'2 A: [ c ] ← c / b d $'
		]);
		expect(p.suitable).toBe(true);
	});

	it('what follows a bracket is the rest of its alternative', () => {
		expect(choices('S → [ a ] b { c } d')).toEqual(['S: [ a ] ← a / b', 'S: { c } ← c / d']);
		expect(choices('S → [ a ] [ b ] c')).toEqual(['S: [ a ] ← a / b c', 'S: [ b ] ← b / c']);
	});
});

describe('lookaheadOf', () => {
	const la = lookaheadOf(ebnf(SLIDE_37));

	it('computes the sets on the plain grammar', () => {
		expect(la.rules.map((r) => r.lhs)).toEqual(['E', 'T']);
		expect(la.grammar.nonterminals).toEqual(['E', 'E’', 'T', 'T’']);
		expect([...la.follow.get('T')!]).toEqual(['+', ')', '$']);
		expect(la.isNonterminal('E')).toBe(true);
		expect(la.isNonterminal('E’')).toBe(false);
		expect(la.isNonterminal('int')).toBe(false);
	});

	it('firstOf: what a string of items can start with', () => {
		expect(la.firstOf([sym('T'), opt([[sym('+'), sym('E')]])])).toEqual({
			tokens: ['(', 'int'],
			nullable: false
		});
		expect(la.firstOf([opt([[sym('*')]]), rep([[sym('+')]])])).toEqual({
			tokens: ['+', '*'],
			nullable: true
		});
		expect(la.firstOf([opt([[sym('*')]]), sym(')')])).toEqual({
			tokens: [')', '*'],
			nullable: false
		});
		expect(la.firstOf([])).toEqual({ tokens: [], nullable: true });
	});

	it('firstOfAlts: the union over the alternatives', () => {
		expect(la.firstOfAlts([[sym('+'), sym('E')], [sym('*')], []])).toEqual({
			tokens: ['+', '*'],
			nullable: true
		});
	});

	it('sorted: the order of T, then $, then anything else', () => {
		expect(la.sorted(['$', 'int', '+', 'x', '+'])).toEqual(['+', 'int', '$', 'x']);
	});
});

describe('predictionRows', () => {
	it('is the table rule, choice, lookahead tokens', () => {
		const rows = predictionRows(predict(ebnf(SLIDE_37)));
		expect(rows.map((r) => [r.ruleText, r.choice, r.lookahead, r.otherwise])).toEqual([
			['E → T [ + E ]', '[ + E ]', '{ + }', 'skipped on { ), $ }'],
			['T → ( E ) | int [ * T ]', '( E )', '{ ( }', ''],
			[null, 'int [ * T ]', '{ int }', ''],
			[null, '[ * T ]', '{ * }', 'skipped on { +, ), $ }']
		]);
		expect(rows.every((r) => !r.conflict && r.clashing.length === 0)).toBe(true);
		expect(rows.map((r) => r.kind)).toEqual(['option', 'alternative', 'alternative', 'option']);
	});

	it('says when a repetition is left and what an ε alternative waits for', () => {
		const loop = predictionRows(predict(ebnf(SLIDE_38)));
		expect(loop[0]).toMatchObject({ choice: '{ + T }', otherwise: 'left on { ), $ }' });
		const eps = predictionRows(predict(ebnf('S → 1 S’\nS’ → 0 S’ | ε')));
		expect(eps[1]).toMatchObject({
			choice: 'ε',
			lookahead: '{ $ }',
			otherwise: 'can derive ε: { $ } may follow'
		});
	});

	it('marks the choices and the tokens of a conflict', () => {
		const rows = predictionRows(predict(ebnf(SLIDE_36)));
		expect(rows.map((r) => [r.choice, r.conflict, r.clashing])).toEqual([
			['T + E', true, ['(', 'int']],
			['T', true, ['(', 'int']],
			['( E )', false, []],
			['int', true, ['int']],
			['int * T', true, ['int']]
		]);
		const option = predictionRows(predict(ebnf('S → if E then S [ else S ] | other\nE → b')));
		expect(option.map((r) => [r.choice, r.clashing])).toEqual([
			['if E then S [ else S ]', []],
			['other', []],
			['[ else S ]', ['else']]
		]);
	});
});
