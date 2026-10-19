import { describe, expect, it } from 'vitest';
import { lalr1Automaton, lr1Automaton } from '$lib/theory/grammar/lr';
import { lrTable, type PrecedenceDeclaration } from '$lib/theory/grammar/lr-table';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { random, randomGrammar } from '$lib/theory/grammar/test-helpers';
import { END_MARKER, type Grammar } from '$lib/theory/grammar/types';
import { bisonReport, type BisonAction } from './bison-report';
import { readPrecedenceText } from './precedence';

const report = (text: string, precedence = '') => {
	const g = parseGrammar(text).grammar!;
	return bisonReport(lalr1Automaton(lr1Automaton(g)), readPrecedenceText(precedence).declarations);
};

const DECLARED = `Grammar

    0 $accept: E $end

    1 E: E '+' E
    2  | E '*' E
    3  | int


Terminals, with rules where they appear

    $end (0) 0
    '*' (42) 2
    '+' (43) 1
    error (256)
    int (258) 3


Nonterminals, with rules where they appear

    $accept (6)
        on left: 0
    E (7)
        on left: 1 2 3
        on right: 0 1 2


State 0

    0 $accept: • E $end

    int  shift, and go to state 1

    E  go to state 2


State 1

    3 E: int •

    $default  reduce using rule 3 (E)


State 2

    0 $accept: E • $end
    1 E: E • '+' E
    2  | E • '*' E

    $end  shift, and go to state 3
    '+'   shift, and go to state 4
    '*'   shift, and go to state 5


State 3

    0 $accept: E $end •

    $default  accept


State 4

    1 E: E '+' • E

    int  shift, and go to state 1

    E  go to state 6


State 5

    2 E: E '*' • E

    int  shift, and go to state 1

    E  go to state 7


State 6

    1 E: E • '+' E
    1  | E '+' E •
    2  | E • '*' E

    '*'  shift, and go to state 5

    $default  reduce using rule 1 (E)

    Conflict between rule 1 and token '+' resolved as reduce (%left '+').
    Conflict between rule 1 and token '*' resolved as shift ('+' < '*').


State 7

    1 E: E • '+' E
    2  | E • '*' E
    2  | E '*' E •

    $default  reduce using rule 2 (E)

    Conflict between rule 2 and token '+' resolved as reduce ('+' < '*').
    Conflict between rule 2 and token '*' resolved as reduce (%left '*').
`;

describe('bisonReport', () => {
	it("writes Parser.output for slide 19's declarations", () => {
		const r = report('E → E + E | E * E | int', "%left '+'\n%left '*'");
		expect(r.text).toBe(DECLARED);
		expect(r.sr + r.rr).toBe(0);
		expect(r.messages).toEqual([]);
		expect(r.head.map((h) => h.title)).toEqual([
			'Grammar',
			'Terminals, with rules where they appear',
			'Nonterminals, with rules where they appear'
		]);
	});

	it('lists unresolved conflicts first, and the reductions that lose in brackets', () => {
		const r = report('E → E + E | E * E | int');
		expect(r.head[0]).toEqual({
			title: 'Conflicts',
			lines: ['State 6 conflicts: 2 shift/reduce', 'State 7 conflicts: 2 shift/reduce']
		});
		expect(r.states[6].lines.slice(-6)).toEqual([
			"    '+'  shift, and go to state 4",
			"    '*'  shift, and go to state 5",
			'',
			"    '+'       [reduce using rule 1 (E)]",
			"    '*'       [reduce using rule 1 (E)]",
			'    $default  reduce using rule 1 (E)'
		]);
		expect(r.messages).toEqual([
			'Parser.yy: warning: 4 shift/reduce conflicts [-Wconflicts-sr]',
			"Parser.yy: note: rerun with option '-Wcounterexamples' to generate conflict counterexamples"
		]);
		expect(
			r.text.startsWith(
				'State 6 conflicts: 2 shift/reduce\nState 7 conflicts: 2 shift/reduce\n\n\nGrammar'
			)
		).toBe(true);
	});

	it('reports the rule a reduce/reduce conflict leaves useless (slide 24)', () => {
		const r = report('S → ε | id | id S');
		expect(r.head.slice(0, 3).map((h) => h.lines)).toEqual([
			['Rules useless in parser due to conflicts', '', '    2 S: id'],
			['State 1 conflicts: 1 reduce/reduce'],
			[
				'Grammar',
				'',
				'    0 $accept: S $end',
				'',
				'    1 S: %empty',
				'    2  | id',
				'    3  | id S'
			]
		]);
		expect(r.states[0].lines).toEqual([
			'State 0',
			'',
			'    0 $accept: • S $end',
			'',
			'    id  shift, and go to state 1',
			'',
			'    $default  reduce using rule 1 (S)',
			'',
			'    S  go to state 2'
		]);
		expect(r.states[1].lines).toEqual([
			'State 1',
			'',
			'    2 S: id •',
			'    3  | id • S',
			'',
			'    id  shift, and go to state 1',
			'',
			'    $end      reduce using rule 1 (S)',
			'    $end      [reduce using rule 2 (S)]',
			'    $default  reduce using rule 1 (S)',
			'',
			'    S  go to state 3'
		]);
		expect(r.messages[0]).toBe('Parser.yy: warning: 1 reduce/reduce conflict [-Wconflicts-rr]');
		expect(r.states.map((s) => s.lalr)).toEqual([0, 1, 2, 3, null]);
	});

	it('writes %nonassoc errors and an empty rule', () => {
		const r = report('E → E < E | E + E | int', "%nonassoc '<'\n%left '+'");
		expect(r.states[6].lines).toEqual([
			'State 6',
			'',
			"    1 E: E • '<' E",
			"    1  | E '<' E •",
			"    2  | E • '+' E",
			'',
			"    '+'  shift, and go to state 5",
			'',
			"    '<'  error (nonassociative)",
			'',
			'    $default  reduce using rule 1 (E)',
			'',
			"    Conflict between rule 1 and token '<' resolved as an error (%nonassoc '<').",
			"    Conflict between rule 1 and token '+' resolved as shift ('<' < '+')."
		]);
		expect(r.states[6].actions['<']).toEqual({ kind: 'error' });
		const empty = report('S → A b\nA → ε');
		expect(empty.states[0].lines).toContain('    0 $accept: • S $end');
		expect(empty.head.find((h) => h.title === 'Grammar')!.lines).toContain('    2 A: %empty');
		expect(empty.text).toContain('    $default  reduce using rule 2 (A)');
	});

	it('numbers symbols as the file declares them, and states as bison makes them', () => {
		// %token int, then the precedence lines ('*' before '+'), then the rest.
		const r = report('E → E + E | E * E | ( E ) | int', "%left '*'\n%left '+'");
		expect(r.names).toMatchObject({ '+': "'+'", int: 'int', $: '$end', S: '$accept' });
		expect(r.states[0].lines.filter((l) => l.includes('go to'))).toEqual([
			'    int  shift, and go to state 1',
			"    '('  shift, and go to state 2",
			'    E  go to state 3'
		]);
		expect(r.states[3].lines.filter((l) => l.includes('shift'))).toEqual([
			'    $end  shift, and go to state 5',
			"    '*'   shift, and go to state 6",
			"    '+'   shift, and go to state 7"
		]);
		expect(r.head.find((h) => h.title.startsWith('Nonterminals'))!.lines[2]).toBe(
			'    $accept (8)'
		);
	});

	it('marks the LR(1) states bison merges (LR(1) but not LALR(1))', () => {
		const g = parseGrammar('S → a A d | b B d | a B e | b A e\nA → c\nB → c').grammar!;
		const lr1 = lr1Automaton(g);
		expect(lrTable(lr1).conflicts).toEqual([]);
		const r = bisonReport(lalr1Automaton(lr1), []);
		expect(r.rr).toBe(2);
		const merged = r.states.find((s) => s.rr > 0)!;
		expect(merged.merged).toHaveLength(2);
		expect(merged.lines).toContain('    5 A: c •');
		expect(r.head.find((h) => h.title === 'Conflicts')!.lines).toEqual([
			`State ${merged.number} conflicts: 2 reduce/reduce`
		]);
	});

	it('takes the same actions as the engine’s LALR(1) table', () => {
		const next = random(7);
		const checked: Grammar[] = [];
		for (let i = 0; checked.length < 60 && i < 400; i++) {
			const g = randomGrammar(next);
			const lr1 = lr1Automaton(g, { maxStates: 400 });
			if (lr1.truncated) continue;
			checked.push(g);
			const terminals = g.terminals.filter((t) => t !== END_MARKER);
			const declarations: PrecedenceDeclaration[] = [];
			for (const t of terminals) {
				const roll = next();
				if (roll < 0.4) continue;
				const assoc = roll < 0.6 ? 'left' : roll < 0.8 ? 'right' : 'nonassoc';
				if (declarations.length && next() < 0.5)
					declarations[declarations.length - 1].terminals.push(t);
				else declarations.push({ assoc, terminals: [t] });
			}
			const lalr = lalr1Automaton(lr1);
			const table = lrTable(lalr, { precedence: declarations });
			const r = bisonReport(lalr, declarations);
			const final = r.states.find((s) => s.lalr === null)!.number;
			let conflicts = 0;
			for (const state of r.states) {
				if (state.lalr === null) continue;
				for (const [column, t] of table.terminals.entries()) {
					const engine = table.action[state.lalr][column];
					const bison: BisonAction | undefined = state.actions[t];
					if (engine === null) {
						expect(bison, `${t} in ${state.number}`).toBeUndefined();
						continue;
					}
					const effective =
						bison ??
						(state.defaultRule !== null ? { kind: 'reduce', rule: state.defaultRule } : null);
					const expected: BisonAction =
						engine.kind === 'shift'
							? { kind: 'shift', to: r.numberOf[engine.state] }
							: engine.kind === 'reduce'
								? { kind: 'reduce', rule: engine.production + 1 }
								: engine.kind === 'accept'
									? { kind: 'shift', to: final }
									: { kind: 'error' };
					expect(effective, `${t} in ${state.number}`).toEqual(expected);
				}
				conflicts += state.sr + state.rr;
			}
			expect(conflicts).toBe(table.unresolved);
		}
		expect(checked.length).toBe(60);
	});
});
