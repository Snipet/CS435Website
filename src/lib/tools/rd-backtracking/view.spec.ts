import { describe, expect, it } from 'vitest';
import { asciiText, plainText } from './notation';
import { analyze, type Run } from './session';
import {
	backtrackProgress,
	callChain,
	compareHighlight,
	fringeSymbols,
	fringeText,
	innermostSave,
	languageLine,
	limitedProgress,
	limitedTone,
	limitedVerdict,
	logLines,
	messageTone,
	pointerHighlights,
	pointerPlace,
	runningProduction,
	stackRows,
	traceLines,
	treeHighlight
} from './view';

const ORDER_1 = 'E → T | T + E\nT → int | int * T | ( E )';
const ORDER_2 = 'E → T + E | T\nT → ( E ) | int | int * T';
const run = (g: string, s: string, anyway = false): Run => analyze(g, s, { anyway }).run!;

describe('the log of tries', () => {
	const r = run(ORDER_2, 'int * int').backtracking!;
	const text = (index: number, instances = true) =>
		logLines(r, index, instances).map(
			(l) =>
				`${l.current ? '> ' : ''}${plainText(l.pieces)}${l.undone ? ` [removed${l.cause ? `: ${l.cause}` : ''}]` : ''}`
		);

	it('grows with the steps, as slides 18–20 add their lines', () => {
		expect(text(0)).toEqual(['> Try E₀ → T₁ + E₂']);
		expect(text(1)).toEqual(['Try E₀ → T₁ + E₂', '> Try T₁ → ( E₃ )']);
		// A mismatch adds no line; the try it sends the search back to is still there.
		expect(text(2)).toEqual(['Try E₀ → T₁ + E₂', 'Try T₁ → ( E₃ )']);
		expect(text(3)).toEqual([
			'Try E₀ → T₁ + E₂',
			'Try T₁ → ( E₃ ) [removed: Mismatch: ( is not int]',
			'> Try T₁ → int'
		]);
	});

	it('shows the exhausted note on one line and grays what it removed', () => {
		expect(text(17)).toEqual([
			'Try E₀ → T₁ + E₂',
			'Try T₁ → ( E₃ ) [removed: Mismatch: ( is not int]',
			'Try T₁ → int [removed: Mismatch: + is not *]',
			'Try T₁ → int * T₂ [removed]',
			'Try T₂ → ( E₃ ) [removed: Mismatch: ( is not int]',
			'Try T₂ → int [removed: Mismatch: + is not end of input]',
			'Try T₂ → int * T₃ [removed: Mismatch: * is not end of input]',
			'> Have exhausted the choices for T₂ and T₁ so backtrack to choice for E₀'
		]);
		expect(logLines(r, 17, true).map((l) => l.kind)).toEqual([
			...Array<string>(7).fill('try'),
			'exhausted'
		]);
	});

	it('ends with the accept line and the tries that are in the tree', () => {
		const last = text(r.steps.length - 1, false);
		expect(last.filter((l) => !l.includes('[removed'))).toEqual([
			// Without numbers each exhausted non-terminal is named once.
			'Have exhausted the choices for T so backtrack to choice for E',
			'Try E → T',
			'Try T → int * T',
			'Try T → int',
			'> End of input, accept'
		]);
		expect(logLines(r, r.steps.length - 1, true).map((l) => l.step)).toEqual(
			r.log.map((e) => e.step)
		);
	});

	it('is empty for a step that does not exist', () => {
		expect(logLines(r, 99, true)).toEqual([]);
	});
});

describe('marks on the tree and the token stream', () => {
	const r = run(ORDER_1, '( int )').backtracking!;

	it('marks the current node and the matched terminals', () => {
		expect(treeHighlight(r.steps[0])).toEqual({ current: [[]], matched: [] });
		expect(treeHighlight(r.steps[9])).toEqual({ current: [[0, 1, 0, 0]], matched: [[0, 0]] });
		expect(treeHighlight(r.steps[11]).current).toEqual([]);
		expect(treeHighlight(r.steps[11]).matched).toHaveLength(3);
	});

	it('colors the token a comparison looks at', () => {
		expect(compareHighlight(r.steps[0], 3)).toEqual([]);
		expect(compareHighlight(r.steps[2], 3)).toEqual([{ start: 0, end: 1, tone: 'reject' }]);
		expect(compareHighlight(r.steps[9], 3)).toEqual([{ start: 1, end: 2, tone: 'accept' }]);
		// A mismatch with the end of the input has no token to color.
		const short = run(ORDER_1, '(').backtracking!;
		const eof = short.steps.find((s) => s.compare?.found === null)!;
		expect(compareHighlight(eof, 1)).toEqual([]);
	});

	it('gives every event a tone', () => {
		expect(r.steps.map((s) => messageTone(s.event))).toEqual([
			'neutral',
			'neutral',
			'reject',
			'neutral',
			'reject',
			'neutral',
			'accept',
			'neutral',
			'neutral',
			'accept',
			'accept',
			'accept'
		]);
		expect(messageTone('stop')).toBe('warn');
		expect(messageTone('exhausted')).toBe('reject');
		expect(messageTone('backtrack')).toBe('reject');
	});
});

describe('the fringe (slide 22)', () => {
	const r = run(ORDER_2, 'int * int').backtracking!;
	const marks = (list: ReturnType<typeof fringeSymbols>) =>
		list.map((s) => `${plainText([s.piece])}:${s.mark}`).join(' ');

	it('marks t1 … tk, the leftmost non-terminal, and the rest', () => {
		const step = r.steps[9];
		expect(marks(fringeSymbols(step.fringe, true))).toBe(
			'int:matched *:matched T₂:next +:rest E₂:rest'
		);
		expect(marks(fringeSymbols(step.newFringe!, true))).toBe(
			'int:matched *:matched (:added E₃:added ):added +:rest E₂:rest'
		);
		expect(fringeText(step.fringe, true)).toBe('int * T₂ + E₂');
		expect(fringeText(step.fringe, false)).toBe('int * T + E');
		expect(fringeText(step.newFringe!, true)).toBe('int * ( E₃ ) + E₂');
	});

	it('marks a non-terminal behind an unmatched terminal as the leftmost one', () => {
		// E0 → T1 + E2 with T1 → ( E3 ): the ( is about to be compared.
		expect(marks(fringeSymbols(r.steps[2].fringe, true))).toBe(
			'(:rest E₃:next ):rest +:rest E₂:rest'
		);
	});

	it('writes ε for a fringe without symbols', () => {
		const empty = run('S → a S | ε', '').backtracking!;
		const last = empty.steps[empty.steps.length - 1];
		expect(fringeSymbols(last.fringe, true)).toEqual([]);
		expect(fringeText(last.fringe, true)).toBe('ε');
	});
});

describe('the bool functions', () => {
	const session = run(ORDER_1, '( int )');
	const p = session.program;
	const r = session.limited!;
	const tokens = session.tokens;

	it('says where a pointer is', () => {
		expect(pointerPlace(0, tokens)).toEqual({ token: '(', where: 'token 1 of 3' });
		expect(pointerPlace(2, tokens)).toEqual({ token: ')', where: 'token 3 of 3' });
		expect(pointerPlace(3, tokens)).toEqual({ token: null, where: 'end-of-stream' });
		expect(pointerPlace(4, tokens)).toEqual({ token: null, where: 'one past end-of-stream' });
		expect(pointerPlace(0, ['the cat'])).toEqual({ token: '"the cat"', where: 'token 1 of 1' });
	});

	it('finds the save in scope', () => {
		expect(innermostSave(r.steps[0])).toBeNull();
		// In T1, called from T: the save of T.
		expect(innermostSave(r.steps[5])).toMatchObject({ save: 0, fn: 7 });
		// In the inner T, called after ( was matched.
		expect(innermostSave(r.steps[18])).toMatchObject({ save: 1, fn: 7 });
	});

	it('marks the saves and the token a match compared', () => {
		// match (INT) on ( fails: the token is red, and it is also where save points.
		expect(pointerHighlights(r.steps[5], 3)).toEqual([
			{ start: 0, end: 1, tone: 'info' },
			{ start: 0, end: 1, tone: 'reject' }
		]);
		// Inner calls: the outer saves at 0 as an underline, the inner save at 1 filled.
		expect(pointerHighlights(r.steps[17], 3)).toEqual([
			{ start: 0, end: 1, tone: 'info', muted: true },
			{ start: 1, end: 2, tone: 'info' }
		]);
		expect(pointerHighlights(r.steps[18], 3)[2]).toEqual({ start: 1, end: 2, tone: 'accept' });
		expect(pointerHighlights(r.steps[0], 3)).toEqual([]);
		// A save at end-of-stream has no token to mark.
		const short = run(ORDER_1, '(').limited!;
		const eos = short.steps.find((s) => s.compare?.found === null)!;
		expect(pointerHighlights(eos, 1)).toEqual([{ start: 0, end: 1, tone: 'info', muted: true }]);
	});

	it('lists the calls in progress, innermost first', () => {
		const rows = stackRows(p, r.steps[13]).map(
			(row) => `${plainText(row.name)} ${row.kind} ${row.save ?? row.production}`
		);
		expect(rows).toEqual([
			'T₃ () production T → ( E )',
			'T () nonterminal 0',
			'E₁ () production E → T',
			'E () nonterminal 0'
		]);
		expect(stackRows(p, r.steps[0])).toEqual([]);
	});

	it('marks the chain of calls in the code', () => {
		const texts = (sites: number[]) =>
			sites.map((id) =>
				asciiText(p.lines[p.sites[id].line].pieces.filter((piece) => piece.site === id))
			);
		// In T3 at match (OPEN): called from T, from E1, from E.
		expect(texts(callChain(r.steps[13]))).toEqual(['T3 ()', 'T ()', 'E1 ()']);
		expect(callChain(r.steps[0])).toEqual([]);
		expect(callChain(r.steps[1])).toEqual([]);
	});

	it('lists the calls made so far with the results known by then', () => {
		const at = (index: number) =>
			traceLines(p, r, index).map(
				(l) =>
					`${'  '.repeat(l.depth)}${asciiText(l.name)}${l.result === null ? '' : ` ${l.result}`}${l.current ? ' <' : ''}`
			);
		expect(at(0)).toEqual([]);
		expect(at(5)).toEqual([
			'E ()',
			'  E1 ()',
			'    T ()',
			'      T1 ()',
			'        match (INT) false <'
		]);
		// The step that shows T1's result.
		expect(at(6).slice(3)).toEqual(['      T1 () false <', '        match (INT) false']);
		const end = at(r.steps.length - 1);
		expect(end).toHaveLength(15);
		expect(end[0]).toBe('E () true');
		expect(traceLines(p, r, 5)[4].step).toBe(5);
		expect(traceLines(p, r, 999)).toEqual([]);
	});

	it('names the production whose function is the innermost call', () => {
		const text = (i: number) => {
			const id = runningProduction(p, r.steps[i]);
			return id === null ? null : p.grammar.productions[id].rhs.join(' ');
		};
		expect(text(0)).toBeNull();
		// E () and T () are functions of non-terminals.
		expect(text(1)).toBeNull();
		expect(text(2)).toBe('T');
		expect(text(3)).toBeNull();
		expect(text(4)).toBe('int');
		expect(text(5)).toBe('int');
		// T1 () has returned to T ().
		expect(text(6)).toBeNull();
		expect(text(13)).toBe('( E )');
		expect(text(r.steps.length - 1)).toBeNull();
	});

	it('colors a step by the value it returns', () => {
		expect(limitedTone(r.steps[0])).toBe('neutral');
		expect(limitedTone(r.steps[1])).toBe('neutral');
		expect(limitedTone(r.steps[5])).toBe('reject');
		expect(limitedTone(r.steps[6])).toBe('reject');
		expect(limitedTone(r.steps[7])).toBe('neutral');
		expect(limitedTone(r.steps[13])).toBe('accept');
		expect(limitedTone(r.steps[28])).toBe('accept');
	});
});

describe('how far the step shown is', () => {
	it('counts the tries and the backtracks of the backtracking parser', () => {
		const r = run(ORDER_1, '( int )').backtracking!;
		expect(backtrackProgress(r.steps[0], r)).toBe('1 of 6 tried · 0 of 2 backtracks');
		expect(backtrackProgress(r.steps[4], r)).toBe('3 of 6 tried · 2 of 2 backtracks');
		const one = run(ORDER_1, 'int * int').backtracking!;
		expect(backtrackProgress(one.steps[one.steps.length - 1], one)).toBe(
			'4 of 4 tried · 1 of 1 backtrack'
		);
	});

	it('counts the productions tried and the times next was put back', () => {
		const r = run(ORDER_1, '( int )').limited!;
		expect(limitedProgress(r.steps[7], r)).toBe(
			'2 of 6 productions tried · next = save 1 of 2 times'
		);
		const one = run('S → a', 'a').limited!;
		expect(limitedProgress(one.steps[one.steps.length - 1], one)).toBe(
			'1 of 1 production tried · next = save 0 of 0 times'
		);
		const once = run('S → a | b', 'b').limited!;
		expect(limitedProgress(once.steps[once.steps.length - 1], once)).toBe(
			'2 of 2 productions tried · next = save 1 of 1 time'
		);
	});
});

describe('verdicts', () => {
	it('says whether the token string is a sentence', () => {
		expect(languageLine(run(ORDER_1, '( int )'))).toBe('( int ) is a sentence of the grammar.');
		expect(languageLine(run(ORDER_1, 'int int'))).toBe('int int is not a sentence of the grammar.');
		expect(languageLine(run('S → a S | ε', ''))).toBe(
			'The empty token stream is a sentence of the grammar.'
		);
		const long = Array<string>(300).fill('a').join(' ');
		expect(languageLine(run('S → a S | a', long))).toBeNull();
	});

	it('accepts', () => {
		expect(limitedVerdict(run(ORDER_1, '( int )'))).toEqual({
			tone: 'success',
			title: 'Accept',
			lines: ['E () returned true and next points to end-of-stream.']
		});
	});

	it('uses the wording of slide 33 when a sentence is rejected', () => {
		const v = limitedVerdict(run(ORDER_1, 'int * int'))!;
		expect(v.tone).toBe('error');
		expect(v.title).toBe('Cannot backtrack once a production is successful');
		expect(v.lines).toEqual([
			'E () returned true with * int left over, so the input is rejected.',
			'int * int is a sentence of the grammar. A production that succeeded was not the one the rest of the input needed, and the function of its non-terminal is never entered again.',
			'Recursive descent with backtracking accepts this input.',
			'The bool functions work for grammars where at most one production can succeed for a non-terminal.'
		]);
	});

	it('also when the start function returns false on a sentence', () => {
		// A1 matches a, then c is not b: S1 fails, and A is not asked for a b.
		const v = limitedVerdict(run('S → A c\nA → a | a b', 'a b c'))!;
		expect(v.title).toBe('Cannot backtrack once a production is successful');
		expect(v.lines[0]).toBe('S () returned false, so the input is rejected.');
	});

	it('is a plain reject for a string outside the language', () => {
		expect(limitedVerdict(run(ORDER_1, 'int int'))).toEqual({
			tone: 'error',
			title: 'Reject',
			lines: [
				'E () returned true with int left over, so the input is rejected.',
				'int int is not a sentence of the grammar.'
			]
		});
		expect(limitedVerdict(run(ORDER_1, ')'))!.lines[0]).toBe(
			'E () returned false, so the input is rejected.'
		);
	});

	it('explains a stopped run, and has nothing to say when nothing ran', () => {
		expect(limitedVerdict(run('S → S 0 | 1', '1 0'))).toBeNull();
		const v = limitedVerdict(run('S → S 0 | 1', '1 0', true))!;
		expect(v.tone).toBe('warn');
		expect(v.title).toBe('The run was stopped');
		expect(v.lines[0]).toMatch(/^8 calls of non-terminal functions are nested/);
		const budget = limitedVerdict(analyze(ORDER_1, '( int )', { maxSteps: 6 }).run!)!;
		expect(budget.lines).toEqual(['The functions did not return within 6 steps.']);
	});
});
