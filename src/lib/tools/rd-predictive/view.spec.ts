import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from './ast';
import { readAst, readInput, readParser, runParser } from './model';
import type { RunResult } from './run';
import {
	callSites,
	describeStep,
	forestAt,
	formulaParts,
	grammarLines,
	listingMarks,
	outcomeText,
	scrollFor,
	stackRows,
	targetText,
	tokenAt,
	tokenHighlights
} from './view';

const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';
const SLIDE_38 = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';

function parse(grammar: string, input: string): RunResult {
	const parser = readParser(grammar);
	return runParser(parser, readInput(input, parser.ebnf!))!;
}

function build(
	grammar: string,
	input: string,
	form: 'loop' | 'recursion' | null = null
): RunResult {
	const parser = readParser(grammar);
	return readAst(parser, readInput(input, parser.ebnf!), form)!.run!;
}

const words = (r: RunResult): string[] =>
	r.steps.map((_, i) => {
		const text = describeStep(r, i);
		return text.detail ? `${text.title} | ${text.detail}` : text.title;
	});

describe('describeStep: the parser', () => {
	it('says what every step of int * int $ does (slide 37)', () => {
		const r = parse(SLIDE_37, 'int * int');
		expect(words(r)).toEqual([
			'main () starts | The token is int.',
			'main () calls E () | The token is int.',
			'E () calls T () | The token is int.',
			"token == '(' does not hold | The token is int.",
			'isdigit (token) holds | The token is int.',
			'match (token): int is matched | The input advances. The token is now *.',
			"token == '*' holds | The token is *.",
			"match ('*'): * is matched | The input advances. The token is now int.",
			'T () calls T () | The token is int.',
			"token == '(' does not hold | The token is int.",
			'isdigit (token) holds | The token is int.',
			'match (token): int is matched | The input advances. The token is now $.',
			"token == '*' does not hold | The token is $.",
			'T () returns to T ()',
			'T () returns to E ()',
			"token == '+' does not hold | The token is $.",
			'E () returns to main ()',
			"token == '$' holds | The token is $.",
			"match ('$'): $ is matched | The input is at its end.",
			'main () returns | It was the first call, so the run is over.'
		]);
		expect(describeStep(r, 5).tone).toBe('accept');
		expect(describeStep(r, 4).tone).toBe('neutral');
		expect(describeStep(r, 19).tone).toBe('accept');
		expect(describeStep(r, 99)).toEqual({ title: '', detail: '', tone: 'neutral' });
	});

	it('says when a loop goes round and when it ends', () => {
		const r = parse('S → 1 { 0 }', '1 0');
		expect(words(r).slice(3, 6)).toEqual([
			"token == '0' holds | The token is 0. The body of the loop runs.",
			"match ('0'): 0 is matched | The input advances. The token is now $.",
			"token == '0' does not hold | The token is $. The loop ends."
		]);
	});

	it('says what a call needed when it stops at error', () => {
		const r = parse(SLIDE_37, 'int + )');
		expect(describeStep(r, r.steps.length - 1)).toEqual({
			title: 'error ("T")',
			detail: 'The token is ). Here T needs ( or int.',
			tone: 'reject'
		});
		const main = parse(SLIDE_37, 'int int');
		expect(describeStep(main, main.steps.length - 1).detail).toBe(
			'The token is int. Here main needs $.'
		);
		const guard = parse('E → T { + T }\nT → int', '+');
		expect(describeStep(guard, guard.steps.length - 1).detail).toBe(
			'The token is +. Here T needs int.'
		);
		const nothing = parse('A → A a | A b', 'a');
		expect(describeStep(nothing, nothing.steps.length - 1).detail).toBe(
			'A derives no string of terminals.'
		);
	});

	it('says what a failed match found', () => {
		const r = parse(SLIDE_37, '( int');
		expect(describeStep(r, r.steps.length - 1)).toEqual({
			title: "match (')') fails",
			detail: 'The token is $, not ).',
			tone: 'reject'
		});
	});

	it('says why a run is stopped', () => {
		const loop = parse('V → V a | b', 'b a');
		expect(describeStep(loop, loop.steps.length - 1)).toEqual({
			title: 'V () is called again and the token is still b',
			detail:
				'No token is matched between the calls, so they never end. The run stops at 8 nested calls.',
			tone: 'warn'
		});
	});
});

describe('describeStep: the functions that build an AST', () => {
	const r = build('E → T { + T }\nT → int', 'int + int');

	it('says what happens to the nodes and the variables', () => {
		expect(words(r)).toEqual([
			'E () starts | The token is int.',
			'E () calls T () | The token is int.',
			'isdigit (token) holds | The token is int.',
			'A new node int | tree points to it.',
			'match (token): int is matched | The input advances. The token is now +.',
			'T () returns tree to E () | tree is int.',
			'tree = the tree T () returned | tree points to it.',
			"token == '+' holds | The token is +. The body of the loop runs.",
			"match ('+'): + is matched | The input advances. The token is now int.",
			'A new node + | plus points to it.',
			'plus->left = tree | The node tree points to becomes the left child of the node plus points to.',
			'E () calls T () | The token is int.',
			'isdigit (token) holds | The token is int.',
			'A new node int | tree points to it.',
			'match (token): int is matched | The input advances. The token is now $.',
			'T () returns tree to E () | tree is int.',
			'plus->right = the tree T () returned | It becomes the right child of the node plus points to.',
			'tree = plus | tree now points to the node plus points to.',
			"token == '+' does not hold | The token is $. The loop ends.",
			'E () returns tree | The AST is +( int, int ).'
		]);
	});

	it('says when tokens are left', () => {
		const rest = build(SLIDE_38, 'int int');
		const last = rest.steps.length - 1;
		expect(describeStep(rest, last)).toEqual({
			title: 'E () returns tree',
			detail: 'The AST is int. Not read: int.',
			tone: 'warn'
		});
	});

	it('says where a leaf goes when it is a right operand', () => {
		const leaf = build('L → id { , id }', 'id , id');
		expect(words(leaf)).toContain(
			'A new node id | It is the right child of the node comma points to.'
		);
	});
});

describe('outcomeText', () => {
	it('accepts when every token is matched, including $', () => {
		expect(outcomeText(parse(SLIDE_37, 'int * int'))).toEqual({
			tone: 'success',
			title: 'Accepted: every token matched, including $',
			lines: []
		});
	});

	it('names the error call or the match that rejects', () => {
		expect(outcomeText(parse(SLIDE_37, 'int + )'))).toEqual({
			tone: 'error',
			title: 'Rejected: error ("T")',
			lines: []
		});
		expect(outcomeText(parse(SLIDE_37, 'int int')).title).toBe('Rejected: error ("main")');
		expect(outcomeText(parse(SLIDE_37, '( int')).title).toBe("Rejected: match (')') fails");
	});

	it('says when a run was stopped', () => {
		expect(outcomeText(parse('V → V a | b', 'b'))).toEqual({
			tone: 'warn',
			title: 'Stopped: the calls never end',
			lines: []
		});
	});

	it('gives the AST, and says when tokens are left over', () => {
		expect(outcomeText(build(SLIDE_38, 'int + int * int'))).toEqual({
			tone: 'success',
			title: 'AST: +( int, *( int, int ) )',
			lines: []
		});
		expect(outcomeText(build(SLIDE_38, 'int int'))).toEqual({
			tone: 'warn',
			title: 'Tokens are left over',
			lines: [
				'The token after the expression is int, not $. A main like the parser’s would call error ("main").'
			]
		});
		expect(outcomeText(build(SLIDE_38, 'int + )')).title).toBe('Rejected: error ("F")');
	});
});

describe('tokens and lines to mark', () => {
	const r = parse(SLIDE_37, 'int * int');

	it('tokenAt', () => {
		expect(tokenAt(r, 0)).toBe('int');
		expect(tokenAt(r, 3)).toBe('$');
		expect(tokenAt(r, 4)).toBeNull();
		expect(tokenAt(r, -1)).toBeNull();
	});

	it('tokenHighlights: the token tested, the token matched, the token that stops the run', () => {
		expect(tokenHighlights(r, 0)).toEqual([]);
		expect(tokenHighlights(r, 3)).toEqual([{ start: 0, end: 1, tone: 'active' }]);
		expect(tokenHighlights(r, 5)).toEqual([{ start: 0, end: 1, tone: 'accept' }]);
		expect(tokenHighlights(r, 18)).toEqual([{ start: 3, end: 4, tone: 'accept' }]);
		expect(tokenHighlights(r, 99)).toEqual([]);
		const error = parse(SLIDE_37, 'int + )');
		expect(tokenHighlights(error, error.steps.length - 1)).toEqual([
			{ start: 2, end: 3, tone: 'reject' }
		]);
		const built = build(SLIDE_38, 'int + int');
		const made = built.steps.findIndex((s) => s.kind === 'make' && s.label === '+');
		expect(tokenHighlights(built, made)).toEqual([{ start: 1, end: 2, tone: 'info' }]);
	});

	it('callSites: the lines where the outer functions wait', () => {
		// In the inner T (): called from T (line 30), from E (12) and from main (3).
		expect(callSites(r.steps[8])).toEqual([29, 11, 2]);
		expect(callSites(r.steps[0])).toEqual([]);
		expect(callSites(undefined)).toEqual([]);
	});

	it('stackRows: the calls in progress, innermost first', () => {
		expect(stackRows(r, 8)).toEqual([
			{ key: 4, name: 'T ()', calledFrom: 30, entered: { index: 2, token: 'int' }, variables: [] },
			{ key: 3, name: 'T ()', calledFrom: 12, entered: { index: 0, token: 'int' }, variables: [] },
			{ key: 2, name: 'E ()', calledFrom: 3, entered: { index: 0, token: 'int' }, variables: [] },
			{
				key: 1,
				name: 'main ()',
				calledFrom: null,
				entered: { index: 0, token: 'int' },
				variables: []
			}
		]);
		expect(stackRows(r, 99)).toEqual([]);
	});

	it('stackRows: the variables of every call with their trees', () => {
		const built = build('E → T [ + E ]\nT → int', 'int + int + int');
		const deepest = built.steps.reduce(
			(best, s, i) => (s.stack.depth > built.steps[best].stack.depth ? i : best),
			0
		);
		const rows = stackRows(built, deepest + 2);
		expect(rows.map((row) => row.name)).toEqual(['T ()', 'E ()', 'E ()', 'E ()']);
		expect(rows[0].variables).toEqual([{ name: 'tree', value: 'int', node: 4 }]);
		expect(rows[2].variables).toEqual([
			{ name: 'tree', value: 'int', node: 2 },
			{ name: 'plus', value: `+( int, ${PLACEHOLDER} )`, node: 3 }
		]);
		// T () declares tree before its first test; E () has no variable yet when it starts.
		expect(stackRows(built, 2)[0].variables).toEqual([{ name: 'tree', value: 'null', node: null }]);
		expect(stackRows(built, 0)[0].variables).toEqual([]);
	});

	it('stackRows: a variable of the loop body is listed only while the body runs', () => {
		const built = build(SLIDE_38, 'int + int * int');
		/** The names listed for the outermost call, E (). */
		const listed = (i: number) =>
			stackRows(built, i)
				.at(-1)!
				.variables.map((v) => v.name);
		const last = built.steps.length - 1;
		// return tree; after the loop: plus was declared inside the while.
		expect(built.program.lines[built.steps[last].line].text).toBe('  return tree;');
		expect(listed(last)).toEqual(['tree']);
		expect(stackRows(built, last)[0].variables).toEqual([
			{ name: 'tree', value: '+( int, *( int, int ) )', node: 1 }
		]);
		const made = built.steps.findIndex((s) => s.kind === 'make' && s.label === '+');
		expect(listed(made - 1)).toEqual(['tree']);
		expect(listed(made)).toEqual(['tree', 'plus']);
	});

	it('listingMarks: the executing line and the waiting calls of a run of the same code', () => {
		const parser = readParser(SLIDE_37);
		const run = runParser(parser, readInput('int * int', parser.ebnf!))!;
		expect(listingMarks(parser.program!, run, 8)).toEqual({
			line: run.steps[8].line,
			sites: [29, 11, 2],
			tone: 'neutral'
		});
		expect(listingMarks(parser.program!, run, 5).tone).toBe('accept');
		const none = { line: null, sites: [], tone: 'neutral' };
		expect(listingMarks(parser.program!, run, 99)).toEqual(none);
		expect(listingMarks(parser.program!, null, 0)).toEqual(none);
	});

	it('listingMarks: a run of other code marks no line', () => {
		// The run of the default grammar is kept while the token string has errors for a new one.
		const before = readParser(SLIDE_38);
		const kept = runParser(before, readInput('int + int * int', before.ebnf!))!;
		const after = readParser('S → b { a }');
		expect(runParser(after, readInput('int + int * int', after.ebnf!))).toBeNull();
		for (let i = 0; i < kept.steps.length; i++) {
			expect(listingMarks(after.program!, kept, i)).toEqual({
				line: null,
				sites: [],
				tone: 'neutral'
			});
			expect(listingMarks(before.program!, kept, i).line).toBe(kept.steps[i].line);
		}
		// The same text read again is other code too: its run has to be its own.
		expect(listingMarks(readParser(SLIDE_38).program!, kept, 3).line).toBeNull();
	});
});

describe('forestAt', () => {
	it('lists the trees that exist at a step, with the variables on their roots', () => {
		const r = build('E → T [ + E ]\nT → int', 'int + int + int');
		const deepest = r.steps.reduce(
			(best, s, i) => (s.stack.depth > r.steps[best].stack.depth ? i : best),
			0
		);
		// The third operand has just been made: two + nodes wait for their right child.
		const forest = forestAt(r, deepest + 2);
		expect(forest.map((t) => t.text)).toEqual([
			`+( int, ${PLACEHOLDER} )`,
			`+( int, ${PLACEHOLDER} )`,
			'int'
		]);
		expect(forest.map((t) => t.names)).toEqual([['plus in E ()'], ['plus in E ()'], ['tree']]);
		expect(forest.map((t) => t.dim)).toEqual([[[1]], [[1]], []]);
		// The new node is the one the step is about.
		expect(forest.map((t) => t.current)).toEqual([[], [], [[]]]);
		expect(forest[0].tree.symbol).toBe('+');
		expect(forest.map((t) => t.root)).toEqual([1, 3, 4]);
	});

	it('is one tree at the end', () => {
		const r = build(SLIDE_38, 'int + int * int');
		const forest = forestAt(r, r.steps.length - 1);
		expect(forest).toHaveLength(1);
		// The loop has ended, so its plus is out of scope: tree alone points to the AST.
		expect(forest[0]).toMatchObject({
			text: '+( int, *( int, int ) )',
			names: ['tree'],
			dim: [],
			current: [[]]
		});
		expect(forestAt(r, 0)).toEqual([]);
		expect(forestAt(r, 999)).toEqual([]);
	});

	it('names a tree after the operator variable only inside the block that declares it', () => {
		const r = build('E → T { + T }\nT → int', 'int + int');
		const names = r.steps.map((_, i) => forestAt(r, i).map((t) => t.names.join(' ')));
		const assigned = r.steps.findIndex((s) => s.kind === 'assign' && s.from === 'plus');
		expect(names[assigned]).toEqual(['tree plus']);
		// The test that ends the loop, and return tree.
		expect(names.slice(assigned + 1)).toEqual([['tree'], ['tree']]);
	});

	it('marks a node inside a tree by its path', () => {
		const r = build('E → T { + T }\nT → int', 'int + int');
		// plus->left = tree: the node attached is the left child of the + node.
		const at = r.steps.findIndex((s) => s.kind === 'assign' && s.target.kind === 'field');
		expect(forestAt(r, at)[0]).toMatchObject({ text: `+( int, ${PLACEHOLDER} )`, current: [[0]] });
	});
});

describe('notation', () => {
	it('targetText', () => {
		expect(targetText({ kind: 'variable', name: 'tree', declares: true })).toBe('tree');
		expect(targetText({ kind: 'field', object: 'plus', field: 'right' })).toBe('plus->right');
	});

	it('grammarLines: the text as lines of colored runs', () => {
		const lines = grammarLines('E → T { + T }\nT → int', { ebnf: true });
		expect(lines).toHaveLength(2);
		expect(lines.map((line) => line.map((s) => s.text).join(''))).toEqual([
			'E → T { + T }',
			'T → int'
		]);
		expect(lines[0].filter((s) => s.className !== null).map((s) => [s.text, s.className])).toEqual([
			['E', 'hl-name'],
			['→', 'hl-operator'],
			['T', 'hl-name'],
			['{', 'hl-operator'],
			['T', 'hl-name'],
			['}', 'hl-operator']
		]);
		// Terminals have no color of their own, so they run on with the spaces around them.
		expect(grammarLines('S → a\n\nA → b').map((line) => line.length)).toEqual([4, 0, 4]);
		expect(grammarLines('')).toEqual([[]]);
	});

	it('formulaParts: subscript characters become subscripts', () => {
		expect(formulaParts('S → S α₁ | … | S αₙ')).toEqual([
			{ text: 'S → S α', script: null },
			{ text: '1', script: 'sub' },
			{ text: ' | … | S α', script: null },
			{ text: 'n', script: 'sub' }
		]);
		expect(formulaParts('β₁₂ₘ')).toEqual([
			{ text: 'β', script: null },
			{ text: '12m', script: 'sub' }
		]);
		expect(formulaParts('S_ ()')).toEqual([{ text: 'S_ ()', script: null }]);
		expect(formulaParts('')).toEqual([]);
	});

	it('formulaParts: the + of →+ is a superscript', () => {
		expect(formulaParts('S →+ S β α')).toEqual([
			{ text: 'S →', script: null },
			{ text: '+', script: 'sup' },
			{ text: ' S β α', script: null }
		]);
		expect(formulaParts('S →* a')[1]).toEqual({ text: '*', script: 'sup' });
		// A + that is a symbol of the grammar stays where it is.
		expect(formulaParts('E → + T')).toEqual([{ text: 'E → + T', script: null }]);
	});
});

describe('scrollFor', () => {
	const view = { top: 100, height: 200 };
	const row = (top: number) => ({ top, height: 20 });

	it('stays when the line is in view with a line to spare', () => {
		expect(scrollFor(view, row(120), 100)).toBeNull();
		expect(scrollFor(view, row(260), 100)).toBeNull();
	});

	it('shows the function from its start when the line then fits', () => {
		// Above the view: the function starts at 20.
		expect(scrollFor(view, row(60), 20)).toBe(10);
		// Below the view.
		expect(scrollFor(view, row(400), 340)).toBe(330);
		expect(scrollFor(view, row(10), 0)).toBe(0);
		// At the edge of the view counts as out of it.
		expect(scrollFor(view, row(110), 100)).toBe(90);
	});

	it('puts the line in the middle when its function is too long for the box', () => {
		expect(scrollFor(view, row(600), 300)).toBe(510);
		expect(scrollFor({ top: 500, height: 60 }, row(80), 0)).toBe(60);
	});
});
