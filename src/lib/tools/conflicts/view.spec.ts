import { describe, expect, it } from 'vitest';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { analyze } from './analysis';
import { readPrecedenceText } from './precedence';
import {
	choiceOptions,
	choiceValue,
	defaultsText,
	configurationParts,
	condenseNotes,
	configurationText,
	entryText,
	highlightPrecedence,
	lineCaption,
	listText,
	outcomeText,
	placeCaption,
	precedenceText,
	resolutionLabel,
	summaryText
} from './view';

function conflicts(grammar: string, precedence = '', input = '') {
	const r = analyze({ grammar, precedence, input, choices: [] });
	if (r.status !== 'done') throw new Error('analysis');
	return r;
}

describe('configurations', () => {
	it('are written as the shift-reduce traces write them', () => {
		expect(configurationText(['E', '*', 'E'], '+')).toBe('E * E I + …');
		expect(configurationText(['E', '+', '(', 'E'], ')')).toBe('E + (E I ) …');
		expect(configurationText(['id'], '$')).toBe('id I $');
		expect(configurationText([], 'int')).toBe('I int …');
		expect(configurationText(['E', '+'], null)).toBe('E + I …');
		expect(configurationParts(['S'], '==')).toEqual({ stack: 'S', next: '"=="', rest: true });
	});
});

describe('labels of a conflict', () => {
	const plain = conflicts('E → E + E | E * E | int');
	const declared = conflicts('E → E + E | E * E | int', "%left '+'\n%left '*'");
	const nonassoc = conflicts('E → E < E | int', "%nonassoc '<'");

	it('say how it is resolved', () => {
		expect(resolutionLabel(plain.conflicts[0])).toEqual({
			text: 'shift, bison’s default',
			tone: 'active'
		});
		expect(resolutionLabel(declared.conflicts[0])).toEqual({
			text: 'reduce, by precedence',
			tone: 'accept'
		});
		expect(resolutionLabel(nonassoc.conflicts[0]).text).toBe('error, by precedence');
	});

	it('offer the two actions, and the error entry of %nonassoc', () => {
		expect(choiceOptions(plain.conflicts[0])).toEqual([
			{ value: 0, label: 'shift' },
			{ value: 1, label: 'red. E → E + E' }
		]);
		expect(choiceOptions(nonassoc.conflicts[0]).map((o) => o.label)).toEqual([
			'shift',
			'red. E → E < E',
			'error'
		]);
		expect(choiceValue(plain.conflicts[0], [])).toBe(0);
		expect(choiceValue(plain.conflicts[0], [[0, 1]])).toBe(1);
		expect(choiceValue(declared.conflicts[0], [[3, 0]])).toBe(1);
		expect(choiceValue(nonassoc.conflicts[0], [])).toBe(2);
	});

	it('name entries and precedences', () => {
		expect(entryText(6, '+')).toBe('action[6, +]');
		expect(entryText(1, '$')).toBe('action[1, $]');
		expect(entryText(2, '==')).toBe('action[2, "=="]');
		const lines = readPrecedenceText("// %left x\n%left '+'\n%left '*'").lines;
		expect(precedenceText({ level: 2, assoc: 'left' }, lines)).toBe('line 3, %left');
		expect(precedenceText({ level: 5, assoc: 'right' }, lines)).toBe('level 5, %right');
		expect(precedenceText(null, lines)).toBe('none declared');
	});
});

describe('other text', () => {
	it('tells the outcome of a parse', () => {
		const r = conflicts('E → E + E | int', '', 'int + int');
		expect(outcomeText(r.parse!)).toEqual({
			title: 'Accepted',
			tone: 'accept',
			detail: `${r.parse!.steps} steps of the LR parser`
		});
		const bad = conflicts('E → E < E | int', "%nonassoc '<'", 'int < int < int');
		expect(outcomeText(bad.parse!)).toEqual({
			title: 'Rejected',
			tone: 'reject',
			detail: 'error: action[4, <] is an error entry'
		});
		expect(
			outcomeText({ ...bad.parse!, outcome: 'limit', text: 'stopped after 20000 steps' })
		).toEqual({
			title: 'Stopped',
			tone: 'active',
			detail: 'stopped after 20000 steps'
		});
	});

	it('captions declaration lines', () => {
		const lines = readPrecedenceText("%left '+'\n// %left '-'\n%left '*'\n%left '^'").lines;
		expect(lines.map((l) => lineCaption(l, 3))).toEqual([
			'level 1, lowest',
			'off',
			'level 2',
			'level 3, highest'
		]);
		expect(lineCaption(lines[0], 1)).toBe('level 1');
	});

	it('highlights directives, literals, tags and comments', () => {
		const text = '%left <op> \'+\' "==" x // note';
		expect(highlightPrecedence(text).map((t) => [text.slice(t.from, t.to), t.className])).toEqual([
			['%left', 'hl-keyword'],
			['<op>', 'hl-special'],
			["'+'", 'hl-string'],
			['"=="', 'hl-string'],
			['// note', 'hl-comment']
		]);
	});

	it('condenses the notes of one kind into one', () => {
		const notes = parseGrammar(CMINUS_BNF).diagnostics;
		expect(notes.length).toBeGreaterThan(20);
		const condensed = condenseNotes(notes);
		expect(condensed).toEqual([
			{
				...notes[0],
				message: `By convention, non-terminals start with a capital letter: program, declaration-list, declaration and ${notes.length - 3} more`
			}
		]);
		const warning = { severity: 'warning' as const, message: 'x: y' };
		const one = { severity: 'info' as const, message: 'A note: a' };
		expect(condenseNotes([warning, one, warning])).toEqual([warning, one, warning]);
		expect(condenseNotes([one, { ...one, message: 'A note: b' }])).toEqual([
			{ ...one, message: 'A note: a, b' }
		]);
	});

	it('writes the summary for LR(1) states, and names only the defaults that apply', () => {
		expect(summaryText({ state: 5, sr: 2, rr: 0 })).toBe('LR(1) state 5 conflicts: 2 shift/reduce');
		expect(summaryText({ state: 1, sr: 1, rr: 2 })).toBe(
			'LR(1) state 1 conflicts: 1 shift/reduce, 2 reduce/reduce'
		);
		expect(defaultsText({ sr: 1, rr: 0 })).toBe('shift');
		expect(defaultsText({ sr: 0, rr: 1 })).toBe('the earlier rule');
		expect(defaultsText({ sr: 2, rr: 1 })).toBe(
			'shift; the earlier rule of a reduce/reduce conflict'
		);
	});

	it('joins lists and captions the grammar classes diagram', () => {
		expect([listText([]), listText([4]), listText([4, 9]), listText([3, 8, 11])]).toEqual([
			'',
			'4',
			'4 and 9',
			'3, 8 and 11'
		]);
		expect(placeCaption({ lr: 'lalr1', ll: null, ambiguous: false })).toBe(
			'The bar marks a grammar that is LALR(1) but not SLR, and not LL(1); whether it is LL(k) is not decided. This page tests LL(1) only, so the bar spans the LL(k) border.'
		);
		expect(
			placeCaption(
				{ lr: 'slr', ll: 'none', ambiguous: false },
				{ kind: 'left-recursive', nonterminal: 'E' }
			)
		).toBe(
			'The dot marks a grammar that is SLR but not LR(0), and not LL(k). E is left-recursive, and no left-recursive grammar is LL(k).'
		);
		expect(placeCaption({ lr: 'lr1', ll: 'llk', ambiguous: false }, { kind: 'finite', k: 3 })).toBe(
			'The dot marks a grammar that is LR(1) but not LALR(1), and LL(k) but not LL(1). Its sentences have at most 3 tokens and it is not ambiguous, so it is LL(3).'
		);
		expect(placeCaption({ lr: 'slr', ll: 'll1', ambiguous: false })).toBe(
			'The dot marks a grammar that is SLR but not LR(0), and LL(1) but not LL(0).'
		);
		expect(placeCaption({ lr: null, ll: null, ambiguous: false })).toContain(
			'the diagram has no one place for it'
		);
	});
});
