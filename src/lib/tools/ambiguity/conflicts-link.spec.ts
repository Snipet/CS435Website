import { describe, expect, it } from 'vitest';
import { parseGrammar } from '$lib/theory/grammar';
import {
	bisonSymbol as conflictsBisonSymbol,
	readPrecedenceText
} from '$lib/tools/conflicts/precedence';
import {
	presetFor as conflictsPresetFor,
	presetState as conflictsPresetState
} from '$lib/tools/conflicts/presets';
import { isConflictsHash, stateFromHash as conflictsState } from '$lib/tools/conflicts/state';
import { toolLink } from '$lib/tools/links';
import { decode } from '$lib/url-state';
import { bisonDeclarations, bisonSymbol, conflictsState as linkState } from './conflicts-link';
import { readDeclarations, type Declaration } from './declarations';
import { presets, presetState } from './presets';

describe('bisonSymbol', () => {
	it('quotes as bison does, and as Conflicts & Precedence writes terminals', () => {
		const cases: [string, string][] = [
			['+', "'+'"],
			['*', "'*'"],
			["'", "'\\''"],
			['then', 'then'],
			['INT', 'INT'],
			['==', '"=="'],
			['&&', '"&&"'],
			['a"b', '"a\\"b"']
		];
		for (const [terminal, written] of cases) {
			expect(bisonSymbol(terminal)).toBe(written);
			expect(conflictsBisonSymbol(terminal)).toBe(written);
		}
	});
});

describe('bisonDeclarations', () => {
	it('writes the declarations of slide 19, lowest first', () => {
		const decls: Declaration[] = [
			{ assoc: 'left', ops: '+' },
			{ assoc: 'left', ops: '*' }
		];
		expect(bisonDeclarations(decls)).toBe("%left '+'\n%left '*'");
	});

	it('reads back in Conflicts & Precedence as the same lines, without empty ones', () => {
		const grammar = parseGrammar('E → E + E | E - E | E * E | E "==" E | E ^ E | int').grammar!;
		const decls: Declaration[] = [
			{ assoc: 'nonassoc', ops: '==' },
			{ assoc: 'left', ops: '' },
			{ assoc: 'left', ops: '+ -' },
			{ assoc: 'left', ops: '*' },
			{ assoc: 'right', ops: '"^"' }
		];
		const text = bisonDeclarations(decls);
		expect(text).toBe("%nonassoc \"==\"\n%left '+' '-'\n%left '*'\n%right '^'");
		const read = readPrecedenceText(text, grammar);
		expect(read.diagnostics).toEqual([]);
		const ours = readDeclarations(decls, grammar);
		expect(ours.problems).toEqual(['Line 2 declares no operator.']);
		// The same operators with the same associativity, in the same order of precedence.
		const levels = [...new Set([...ours.rules.values()].map((r) => r.level))].sort((a, b) => a - b);
		expect(read.declarations).toEqual(
			levels.map((level) => {
				const ops = [...ours.rules].filter(([, r]) => r.level === level);
				return { assoc: ops[0][1].assoc, terminals: ops.map(([op]) => op) };
			})
		);
	});

	it('is empty without declarations', () => {
		expect(bisonDeclarations([])).toBe('');
		expect(bisonDeclarations([{ assoc: 'left', ops: '  ' }])).toBe('');
	});
});

describe('conflictsState', () => {
	it('leaves out an empty token string and no declarations', () => {
		expect(linkState('S → a', '  ', [])).toEqual({ grammar: 'S → a' });
		expect(linkState('S → a', 'a', [{ assoc: 'left', ops: 'a' }])).toEqual({
			grammar: 'S → a',
			input: 'a',
			precedence: '%left a'
		});
	});

	it('opens the preset %left + then %left * on the conflicts preset of the same slide', () => {
		const state = presetState(presets.find((p) => p.id === 'precedence')!);
		const href = toolLink('conflicts', linkState(state.grammar, state.input, state.decls))!;
		const value = decode(href.split('#')[1]);
		expect(isConflictsHash(value)).toBe(true);
		const opened = conflictsState(value as never);
		const preset = conflictsPresetFor(opened);
		expect(preset?.id).toBe('precedence');
		expect(opened).toEqual(conflictsPresetState(preset!));
	});

	it.each(presets.map((p) => [p.id, p] as const))(
		'%s: links to a state the tool accepts',
		(_, p) => {
			const state = presetState(p);
			const href = toolLink('conflicts', linkState(state.grammar, state.input, state.decls))!;
			const value = decode(href.split('#')[1]);
			expect(isConflictsHash(value)).toBe(true);
			const opened = conflictsState(value as never);
			expect(opened.grammar).toBe(state.grammar);
			expect(opened.input).toBe(state.input);
			const read = readPrecedenceText(opened.precedence, parseGrammar(state.grammar).grammar);
			expect(read.diagnostics).toEqual([]);
		}
	);
});
