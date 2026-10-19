import { describe, expect, it } from 'vitest';
import { firstFollow, parseGrammar, printSet } from '$lib/theory/grammar';
import {
	checkAnswer,
	memberText,
	passSummaries,
	readAnswer,
	setName,
	setSteps,
	setsAt,
	stepContext,
	stepText
} from './sets';
import { DECK_GRAMMAR } from './state';

const g = parseGrammar(DECK_GRAMMAR).grammar!;
const ff = firstFollow(g);
const steps = setSteps(ff);
const firstDone = steps.findIndex((s) => s.kind === 'done' && s.phase === 'first');

describe('setSteps and setsAt', () => {
	it('lists First’s steps, a done step, Follow’s steps and a done step', () => {
		expect(steps).toHaveLength(ff.firstSteps.length + ff.followSteps.length + 2);
		expect(firstDone).toBe(ff.firstSteps.length);
		expect(steps[firstDone]).toEqual({ kind: 'done', phase: 'first', pass: 3 });
		expect(steps[steps.length - 1]).toEqual({ kind: 'done', phase: 'follow', pass: 3 });
	});

	it('grows the sets step by step; Follow starts once First is complete', () => {
		const start = setsAt(g, ff, steps, 0);
		expect(start.first?.get('+')).toEqual(['+']);
		expect(start.first?.get('E')).toEqual([]);
		expect(start.follow).toBeNull();
		const first = setsAt(g, ff, steps, firstDone);
		expect(first.first).toEqual(ff.first);
		expect(first.follow).toBeNull();
		const end = setsAt(g, ff, steps, steps.length - 1);
		expect(end.first).toEqual(ff.first);
		expect(end.follow).toEqual(ff.follow);
		expect(setsAt(g, ff, steps, firstDone + 1).follow?.get('E')).toEqual(['$']);
	});

	it('sums up each pass, the last one of each changing nothing', () => {
		const passes = passSummaries(steps);
		expect(passes.map((p) => [p.phase, p.pass, p.added])).toEqual([
			['first', 0, 5],
			['first', 1, 6],
			['first', 2, 2],
			['first', 3, 0],
			['follow', 0, 1],
			['follow', 1, 17],
			['follow', 2, 5],
			['follow', 3, 0]
		]);
		expect(passes[3].end).toBe(firstDone);
		expect(passes[4].start).toBe(firstDone + 1);
		expect(passes[passes.length - 1].end).toBe(steps.length - 1);
	});

	it('words each step as the slides write the rules', () => {
		const add = steps.findIndex(
			(s) =>
				s.kind === 'rule' && s.rule.pass === 2 && s.rule.target === 'E' && s.rule.added.length > 0
		);
		expect(stepText(g, steps[add], setsAt(g, ff, steps, add))).toEqual({
			rule: 'Add First( T ) – { ε } to First( E )',
			result: 'Adds (, int: First( E ) = { (, int }'
		});
		expect(stepContext(g, steps[add])).toBe('E → T X');
		expect(stepContext(g, steps[0])).toBe('First(b) = { b } for each terminal b');
		expect(stepText(g, steps[0], setsAt(g, ff, steps, 0))).toEqual({
			rule: 'First( + ) = { + }',
			result: ''
		});
		expect(stepText(g, steps[firstDone], setsAt(g, ff, steps, firstDone))).toEqual({
			rule: 'Pass 3 changes nothing.',
			result: 'The First sets are complete.'
		});
		const none = steps.findIndex(
			(s) => s.kind === 'rule' && s.rule.rule === 'first-add' && s.rule.added.length === 0
		);
		expect(stepText(g, steps[none], setsAt(g, ff, steps, none)).result).toMatch(/^No change: /);
		expect(setName('follow', 'int')).toBe('Follow( int )');
	});
});

describe('fill-in', () => {
	it('reads sets as typed, with or without braces and commas', () => {
		expect(readAnswer('{ (, int }')).toEqual({ members: ['(', 'int'], error: null });
		expect(readAnswer('( int')).toEqual({ members: ['(', 'int'], error: null });
		expect(readAnswer('{ +, ε }')).toEqual({ members: ['+', 'ε'], error: null });
		expect(readAnswer('{+,epsilon}')).toEqual({ members: ['+', 'ε'], error: null });
		expect(readAnswer('{ $, +, ) }')).toEqual({ members: ['$', '+', ')'], error: null });
		expect(readAnswer('{ }')).toEqual({ members: [], error: null });
		expect(readAnswer('{ ",", "{" }')).toEqual({ members: [',', '{'], error: null });
		expect(readAnswer('int int')).toEqual({ members: ['int'], error: null });
		expect(readAnswer('a → b').error).toBe('→ cannot be in a set.');
	});

	it('marks each member right or wrong, and counts the missing ones', () => {
		expect(checkAnswer(readAnswer('{ int, ( }'), ['(', 'int'])).toEqual({
			marks: [
				{ member: 'int', ok: true },
				{ member: '(', ok: true }
			],
			missing: 0,
			correct: true
		});
		expect(checkAnswer(readAnswer('{ int, + }'), ['(', 'int'])).toEqual({
			marks: [
				{ member: 'int', ok: true },
				{ member: '+', ok: false }
			],
			missing: 1,
			correct: false
		});
		expect(checkAnswer(readAnswer('{ }'), [])).toMatchObject({ correct: true });
	});

	it('reads back every set as printed', () => {
		for (const sets of [ff.first, ff.follow])
			for (const set of sets.values()) {
				expect(checkAnswer(readAnswer(printSet(set)), set).correct).toBe(true);
				for (const m of set) expect(readAnswer(memberText(m)).members).toEqual([m]);
			}
	});
});
