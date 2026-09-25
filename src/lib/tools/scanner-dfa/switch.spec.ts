import { describe, expect, it } from 'vitest';
import {
	GET_TOKEN,
	PUSHBACK_WARNING,
	SWITCH_INPUTS,
	programLines,
	pushbackText,
	runGetToken
} from './switch';

describe('getToken () source', () => {
	it('reproduces slides 17–19 exactly, with no break statements', () => {
		expect(GET_TOKEN.map((l) => l.text).join('\n')).toBe(
			[
				'Token getToken () {',
				'  const int ERROR_STATE = 9;',
				'  int state = 0;',
				'  while (state == 0 || state == 1 || state == 6) {',
				'    int ch = getchar ();',
				'    switch (state)',
				'    {',
				'    case 0:',
				"      if (ch == '<')",
				'        state = 1;',
				"      else if (ch == '=')",
				'        state = 5;',
				"      else if (ch == '>')",
				'        state = 6;',
				'      else state = ERROR_STATE;',
				'    case 1:',
				"      if (ch == '=')",
				'        state = 2;',
				"      else if (ch == '>')",
				'        state = 3;',
				'      else {',
				'        ungetc (ch, stdin);',
				'        state = 4;',
				'      }',
				'    case 6:',
				"      if (ch == '=')",
				'        state = 7;',
				'      else {',
				'        ungetc (ch, stdin);',
				'        state = 8;',
				'      }',
				'    } // switch',
				'  } // while',
				'  if (state == 2)      return LE;',
				'  else if (state == 3) return NE;',
				'  else if (state == 4) return LT;',
				'  else if (state == 5) return EQ;',
				'  else if (state == 7) return GE;',
				'  else if (state == 8) return GT;',
				'  else error ();',
				'}'
			].join('\n')
		);
		expect(GET_TOKEN.some((l) => l.text.includes('break'))).toBe(false);
	});

	it('adds one break after each case when asked', () => {
		const lines = programLines(true);
		const breaks = lines.filter((l) => l.inserted);
		expect(breaks).toHaveLength(3);
		expect(breaks.every((l) => l.text === '      break;')).toBe(true);
		const at = (id: string) => lines.findIndex((l) => l.id === id);
		expect(at('break0')).toBe(at('set9') + 1);
		expect(at('break1')).toBe(at('c1-close') + 1);
		expect(at('break6')).toBe(at('c6-close') + 1);
		expect(programLines(false)).toEqual(GET_TOKEN);
	});
});

describe('as printed (switch falls through)', () => {
	const run = (input: string) => runGetToken(input, false);

	it('returns GE for "=" and GT for every other input', () => {
		const results = Object.fromEntries(SWITCH_INPUTS.map((i) => [i, run(i).result]));
		expect(results).toEqual({
			'<=': 'GT',
			'<>': 'GT',
			'<x': 'GT',
			'=': 'GE',
			'>=': 'GT',
			'>a': 'GT',
			x: 'GT'
		});
	});

	it('runs all three cases on the first character', () => {
		const lines = run('<=').steps.map((s) => s.line);
		expect(lines).toEqual([
			'const',
			'init',
			'while',
			'getchar',
			'switch',
			'if-lt',
			'set1',
			'case1',
			'c1-eq',
			'c1-gt',
			'c1-unget',
			'set4',
			'case6',
			'c6-eq',
			'c6-unget',
			'set8',
			'end-switch',
			'while',
			'ret2',
			'ret3',
			'ret4',
			'ret5',
			'ret7',
			'ret8'
		]);
		expect(run('<=').steps.filter((s) => s.line === 'getchar')).toHaveLength(1);
	});

	it('pushes the first character back once or twice, warning on the second', () => {
		const lt = run('<=');
		expect(lt.pushback).toEqual(['<', '<']);
		expect(lt.pos).toBe(1);
		expect(lt.steps.filter((s) => s.warning).map((s) => s.line)).toEqual(['c6-unget']);
		expect(lt.steps.find((s) => s.warning)!.warning).toBe(PUSHBACK_WARNING);
		expect(run('x').pushback).toEqual(['x', 'x']);
		expect(run('>=').pushback).toEqual(['>']);
		expect(run('>=').steps.some((s) => s.warning)).toBe(false);
		expect(run('=').pushback).toEqual([]);
		expect(run('=').ungetcs).toBe(0);
		expect(lt.maxPushback).toBe(2);
		expect(pushbackText(lt.pushback)).toBe('"<<"');
		expect(pushbackText([])).toBe('empty');
	});
});

describe('with break; after each case', () => {
	const run = (input: string) => runGetToken(input, true);

	it('follows the relop DFA', () => {
		const results = Object.fromEntries(SWITCH_INPUTS.map((i) => [i, run(i).result]));
		expect(results).toEqual({
			'<=': 'LE',
			'<>': 'NE',
			'<x': 'LT',
			'=': 'EQ',
			'>=': 'GE',
			'>a': 'GT',
			x: 'error ()'
		});
		expect(run('<x').pushback).toEqual(['x']);
		expect(run('>a').pushback).toEqual(['a']);
		expect(run('<=').pushback).toEqual([]);
		for (const i of SWITCH_INPUTS) expect(run(i).steps.some((s) => s.warning)).toBe(false);
	});

	it('reads one character per loop iteration', () => {
		const t = run('<=');
		expect(t.steps.filter((s) => s.line === 'getchar').map((s) => s.ch)).toEqual(['<', '=']);
		expect(t.steps.filter((s) => s.line === 'switch').map((s) => s.state)).toEqual([0, 1]);
		expect(t.steps.some((s) => s.line === 'case1')).toBe(false);
		expect(t.steps.at(-1)).toMatchObject({ line: 'ret2', returned: 'LE' });
	});

	it('ends in error () for a character that starts no relop', () => {
		const t = run('x');
		expect(t.steps.at(-1)).toMatchObject({ line: 'err', returned: 'error ()', state: 9 });
	});

	it('treats EOF as a character that matches no test', () => {
		const t = runGetToken('<', true);
		expect(t.result).toBe('LT');
		expect(t.pushback).toEqual([]);
		expect(t.steps.find((s) => s.line === 'c1-unget')!.text).toMatch(/EOF/);
	});
});

describe('steps', () => {
	it('carry the variables after each statement', () => {
		for (const breaks of [false, true])
			for (const input of SWITCH_INPUTS) {
				const t = runGetToken(input, breaks);
				const shown = new Set(programLines(breaks).map((l) => l.id));
				for (const s of t.steps) expect(shown.has(s.line), `${input}: ${s.line}`).toBe(true);
				expect(t.steps.filter((s) => s.returned)).toHaveLength(1);
				expect(t.steps.at(-1)!.returned).toBe(t.result);
				expect(t.steps[0].state).toBeNull();
				expect(t.steps[0].ch).toBeUndefined();
			}
	});
});
