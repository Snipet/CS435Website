import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { readPrecedenceText } from './precedence';
import {
	choiceOptions,
	choiceValue,
	configurationParts,
	configurationText,
	entryText,
	highlightPrecedence,
	lineCaption,
	listText,
	outcomeText,
	placeCaption,
	precedenceText,
	resolutionLabel
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

	it('joins lists and captions the grammar classes diagram', () => {
		expect([listText([]), listText([4]), listText([4, 9]), listText([3, 8, 11])]).toEqual([
			'',
			'4',
			'4 and 9',
			'3, 8 and 11'
		]);
		expect(placeCaption({ lr: 'lalr1', ll: null, ambiguous: false })).toBe(
			'The dot marks a grammar that is LALR(1) but not SLR, and not LL(1).'
		);
		expect(placeCaption({ lr: null, ll: null, ambiguous: false })).toContain(
			'the diagram has no one place for it'
		);
	});
});
