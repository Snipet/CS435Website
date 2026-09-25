import { describe, expect, it } from 'vitest';
import { driveScanner, longestMatchRun, type TokenRule } from '$lib/theory/automata';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { buildRuleDfa, minimalRuleDfa, nameGroups, withTokenNames } from './rules';
import { EOF, ERROR_STATE, driverTable, type DriverTable } from './table';
import {
	DRIVER_CODE,
	LONGEST_DRIVER,
	SLIDE_DRIVER,
	chText,
	lexemeText,
	runCalls,
	traceCall,
	type Mode
} from './driver';
import { relopDfa, stuDfa } from './machines';

function rules(spec: [string, string][], defsText = ''): TokenRule[] {
	const defs = parseDefinitions(defsText);
	return spec.map(([name, text]) => {
		const r = parseRegex(text, { defs: defs.defs });
		if (!r.ok) throw new Error(`${name}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
		return { name, regex: r.regex };
	});
}

function dfaOf(rs: TokenRule[], minimal = false) {
	const b = buildRuleDfa(rs);
	if (!b.ok) throw new Error('too large');
	const names = rs.map((r) => r.name);
	return minimal ? withTokenNames(minimalRuleDfa(b.full, nameGroups(names)), names) : b.full;
}

const DEFS = "digit = '0' | … | '9'\nletter = 'A' | … | 'Z' | 'a' | … | 'z'";
const LEX2 = rules(
	[
		['Whitespace', "' '+"],
		['Integer', 'digit+'],
		['Identifier', 'letter (letter | digit)*'],
		['Plus', "'+'"]
	],
	DEFS
);

describe('driver code', () => {
	it('reproduces slide 15 line for line', () => {
		expect(SLIDE_DRIVER.join('\n')).toBe(
			[
				'state = start;',
				'// accept: 1D bool array [state]',
				'// retract: 1D bool array [state]',
				'// T: 2D int array [state, char]',
				'// error: fn(state)',
				'while (!(accept[state] || error (state)))',
				'{',
				'  ch = getChar ();',
				'  state = T[state, ch];',
				'}',
				'if (accept[state]) {',
				'  if (retract[state])',
				'    ungetChar (ch);',
				'  return tokenFor (state);',
				'}',
				'handleError ();'
			].join('\n')
		);
		expect(LONGEST_DRIVER).toContain('    lastAccept = (state, position ());');
	});

	it('steps only through code lines, ending with a return or handleError', () => {
		const tables = [driverTable(relopDfa()), driverTable(stuDfa()), driverTable(dfaOf(LEX2))];
		const inputs = ['<=', '<x', '0110', 'f+3  +g', '=56', 'x', ''];
		for (const table of tables)
			for (const input of inputs)
				for (const mode of ['first', 'longest'] as const) {
					const code = DRIVER_CODE[mode];
					for (const call of runCalls(table, input, mode).calls.map((c) =>
						traceCall(table, input, c.start, mode)
					)) {
						for (const s of call.steps) {
							const text = code[s.line - 1];
							expect(text, `${mode} line ${s.line}`).toBeDefined();
							expect(text.trim().startsWith('//')).toBe(false);
							expect(['{', '}'].includes(text.trim())).toBe(false);
							expect(s.text.length).toBeGreaterThan(0);
						}
						const last = call.steps.at(-1)!;
						expect(last.result).toBe(call.token);
						expect(code[last.line - 1]).toMatch(/return tokenFor|handleError/);
						expect(call.steps.filter((s) => s.result)).toHaveLength(1);
					}
				}
	});
});

describe('as on the slide (first accepting state)', () => {
	it('relop "<x": LT after ungetChar, then the error state on x', () => {
		const table = driverTable(relopDfa());
		const call = traceCall(table, '<x', 0, 'first');
		expect(call.steps.map((s) => s.line)).toEqual([1, 6, 8, 9, 6, 8, 9, 6, 11, 12, 13, 14]);
		const lookups = call.steps.flatMap((s) => (s.lookup ? [s.lookup] : []));
		expect(lookups.map((l) => [l.from, l.ch, table.columns[l.column!].header, l.to])).toEqual([
			[0, '<', '<', 1],
			[1, 'x', 'other', 4]
		]);
		expect(lookups[1].transition).toBe(5); // 1 -other-> 4
		const unget = call.steps.find((s) => s.line === 13)!;
		expect(unget.pos).toBe(1);
		expect(call.token).toMatchObject({ name: 'LT', lexeme: '<', end: 1 });
		const next = traceCall(table, '<x', 1, 'first');
		expect(next.steps.find((s) => s.line === 9)!.state).toBe(ERROR_STATE);
		expect(next.steps.at(-1)!.line).toBe(16);
		expect(next.token).toMatchObject({ name: 'Error', lexeme: 'x', error: true, end: 2 });
	});

	it('EOF is read in the other column; ungetChar (EOF) does not move', () => {
		const table = driverTable(relopDfa());
		const call = traceCall(table, '<', 0, 'first');
		const read = call.steps.filter((s) => s.line === 8);
		expect(read.map((s) => s.ch)).toEqual(['<', EOF]);
		expect(call.steps.find((s) => s.line === 9 && s.ch === EOF)!.lookup!.to).toBe(4);
		expect(call.steps.find((s) => s.line === 13)!.pos).toBe(1);
		expect(call.token).toMatchObject({ name: 'LT', lexeme: '<' });
	});

	it('stops at the first accepting state', () => {
		const table = driverTable(stuDfa());
		const call = traceCall(table, '0110', 0, 'first');
		expect(call.steps.filter((s) => s.line === 9).map((s) => table.names[s.state])).toEqual([
			'T',
			'U'
		]);
		expect(call.token).toMatchObject({ name: 'U', lexeme: '01', rule: 0 });
	});

	it('reports a stall when the start state accepts', () => {
		const table = driverTable(dfaOf(rules([['A', "'a'*"]])));
		const run = runCalls(table, 'aa', 'first');
		expect(run.stalled).toBe(true);
		expect(run.calls).toHaveLength(1);
		expect(run.calls[0].token.lexeme).toBe('');
	});
});

describe('longest match', () => {
	const cases: [TokenRule[], string[]][] = [
		[LEX2, ['f+3  +g', 'foo+3', '=56', 'abc + 123 + x9 ', '', '++  a1b2 99']],
		[rules([['R', '(1 | 0)*1']]), ['0110', '1', '0', '10101000', '111']],
		[
			rules(
				[
					['If', "'if'"],
					['Iffy', "'iffy'"],
					['Id', 'letter+']
				],
				DEFS
			),
			['if iffy iff newer', 'iffyif']
		],
		[
			rules([
				['AB', "'a' 'b' 'c'"],
				['A', "'a'"]
			]),
			['abab', 'aabc', 'abcabc']
		]
	];

	it('returns the same tokens as driveScanner (longestMatchRun)', () => {
		for (const [rs, inputs] of cases)
			for (const minimal of [false, true]) {
				const dfa = dfaOf(rs, minimal);
				const table = driverTable(dfa);
				for (const input of inputs) {
					const mine = runCalls(table, input, 'longest').calls.map((c) => ({
						name: c.token.name,
						lexeme: c.token.lexeme,
						start: c.token.start,
						end: c.token.end,
						error: c.token.error
					}));
					const theirs = driveScanner(dfa, input, { errorRule: true }).tokens.map((t) => ({
						name: t.name,
						lexeme: t.lexeme,
						start: t.start,
						end: t.end,
						error: t.error
					}));
					expect(mine, `${input} (minimal: ${minimal})`).toEqual(theirs);
				}
			}
	});

	it('remembers the same last accepting state as longestMatchRun', () => {
		const dfa = dfaOf(LEX2);
		const table = driverTable(dfa);
		const input = 'foo+3';
		for (let start = 0; start < input.length; start++) {
			const call = traceCall(table, input, start, 'longest');
			const run = longestMatchRun(dfa, input, start);
			const last = call.steps.at(-1)!.lastAccept;
			expect(last ? { state: last.state, end: last.pos } : null).toEqual(run.token);
		}
	});

	it('marks lastAccept and backs up to it', () => {
		const table = driverTable(stuDfa());
		const call = traceCall(table, '0110', 0, 'longest');
		const marks = call.steps.filter((s) => s.line === 10).map((s) => s.lastAccept);
		expect(marks).toEqual([
			{ state: 2, pos: 2 },
			{ state: 2, pos: 3 }
		]);
		expect(call.reach).toBe(4);
		const reset = call.steps.find((s) => s.line === 14)!;
		expect(reset.pos).toBe(3);
		expect(call.end).toBe(3);
	});
});

describe('runCalls', () => {
	const tables: [string, DriverTable][] = [
		['relop', driverTable(relopDfa())],
		['S, T, U', driverTable(stuDfa())],
		['LEX2', driverTable(dfaOf(LEX2))],
		['LEX2 minimal', driverTable(dfaOf(LEX2, true))],
		['(1 | 0)*1', driverTable(dfaOf(rules([['R', '(1 | 0)*1']])))],
		['a*b', driverTable(dfaOf(rules([['AB', "'a'* 'b'"]])))],
		['a*', driverTable(dfaOf(rules([['A', "'a'*"]])))]
	];
	const alphabet = ['<', '=', '>', 'x', '0', '1', 'a', 'b', 'f', '3', '+', ' ', '😀'];
	let seed = 7;
	const random = () => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed / 2 ** 31;
	};
	const inputs = [
		'',
		'<=',
		'<x',
		'>',
		'0110',
		'f+3  +g',
		'aab',
		...Array.from({ length: 60 }, () =>
			Array.from(
				{ length: 1 + Math.floor(random() * 9) },
				() => alphabet[Math.floor(random() * alphabet.length)]
			).join('')
		)
	];

	it('ends every call where traceCall does, with the same token', () => {
		for (const [name, table] of tables)
			for (const mode of ['first', 'longest'] as Mode[])
				for (const input of inputs) {
					const run = runCalls(table, input, mode, { skip: new Set(['Whitespace']) });
					let pos = 0;
					for (const c of run.calls) {
						expect(c.start).toBe(pos);
						const traced = traceCall(table, input, c.start, mode, new Set(['Whitespace']));
						expect(c, `${name} ${mode} ${JSON.stringify(input)} at ${c.start}`).toEqual({
							start: traced.start,
							end: traced.end,
							token: traced.token
						});
						pos = c.end;
					}
					if (!run.stalled) expect(pos).toBe(input.length);
					expect(run.truncated).toBe(false);
				}
	});

	it('tokenizes long inputs in full with the longest match', () => {
		// Every call reads the rest of the input looking for a 'b', then reports one 'a' as an error.
		const table = driverTable(dfaOf(rules([['AB', "'a'* 'b'"]])));
		for (const n of [150, 400, 2000]) {
			const run = runCalls(table, 'a'.repeat(n), 'longest');
			expect(run.truncated).toBe(false);
			expect(run.stalled).toBe(false);
			expect(run.calls).toHaveLength(n);
			expect(run.calls.every((c) => c.token.error && c.token.lexeme === 'a')).toBe(true);
		}
		const call = traceCall(table, 'a'.repeat(2000), 1999, 'longest');
		expect(call.token).toMatchObject({ error: true, lexeme: 'a', start: 1999, end: 2000 });
	});

	it('stops when the read budget runs out', () => {
		const table = driverTable(dfaOf(rules([['AB', "'a'* 'b'"]])));
		const run = runCalls(table, 'a'.repeat(100), 'longest', { maxReads: 1000 });
		expect(run.truncated).toBe(true);
		expect(run.calls.length).toBeGreaterThan(0);
		expect(run.calls.length).toBeLessThan(100);
	});
});

describe('chText', () => {
	it('quotes characters and names EOF', () => {
		expect(chText('a')).toBe("'a'");
		expect(chText(' ')).toBe("' '");
		expect(chText("'")).toBe("'\\''");
		expect(chText(EOF)).toBe('EOF');
		expect(chText(undefined)).toBe('—');
	});

	it('cuts long lexemes short in step descriptions', () => {
		expect(lexemeText('ab c')).toBe('"ab c"');
		expect(lexemeText('a'.repeat(24))).toBe(`"${'a'.repeat(24)}"`);
		expect(lexemeText('a'.repeat(2000))).toBe(`"${'a'.repeat(24)}…" (2000 characters)`);
		expect(lexemeText('😀'.repeat(30))).toBe(`"${'😀'.repeat(24)}…" (30 characters)`);
	});

	it('traces a long call without spelling out the lexeme at every step', () => {
		const table = driverTable(dfaOf(rules([['A', "'a'+"]])));
		const call = traceCall(table, 'a'.repeat(2000), 0, 'longest');
		expect(call.token.lexeme).toHaveLength(2000);
		expect(Math.max(...call.steps.map((s) => s.text.length))).toBeLessThan(200);
	});
});
