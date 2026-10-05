import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decks, formatCitation } from '$lib/lectures';
import { hasErrors } from '$lib/theory/diagnostics';
import { bracketForm } from '$lib/theory/grammar';
import { tool } from '$lib/tools/catalog/rd-backtracking';
import { attemptPieces, describeStep } from './backtrack';
import { messageText, programText } from './limited';
import { asciiText, piecesOf, plainText } from './notation';
import {
	DEFAULT_PRESET_ID,
	LEFT_RECURSIVE,
	ORDER_1,
	ORDER_2,
	presetFor,
	presets,
	type RdPreset
} from './presets';
import { reverseAlternatives } from './reverse';
import { analyze, showsLimitation, summarize, type Run } from './session';
import { fringeText, limitedVerdict, logLines, traceLines } from './view';

const preset = (id: string): RdPreset => presets.find((p) => p.id === id)!;
const load = (id: string, anyway = false): Run => {
	const p = preset(id);
	return analyze(p.value.grammar, p.value.input, { anyway }).run!;
};

describe('every preset', () => {
	it.each(presets.map((p) => [p.id, p] as const))('%s loads without errors', (_, p) => {
		const a = analyze(p.value.grammar, p.value.input, { anyway: true });
		expect(hasErrors(a.grammarDiagnostics)).toBe(false);
		expect(a.grammarDiagnostics).toEqual([]);
		expect(a.inputDiagnostics).toEqual([]);
		const run = a.run!;
		expect(run.backtracking).not.toBeNull();
		expect(run.limited).not.toBeNull();
		expect(run.backtracking!.stop).toBeNull();
		expect(run.limited!.stop).toBeNull();
		// Every step can be described and drawn.
		run.backtracking!.steps.forEach((step, i) => {
			for (const instances of [true, false]) {
				const lines = describeStep(step, { instances }).map(plainText);
				expect(lines.length).toBeGreaterThan(0);
				expect(lines.every((line) => line.length > 0)).toBe(true);
				expect(fringeText(step.fringe, instances).length).toBeGreaterThan(0);
			}
			expect(logLines(run.backtracking!, i, true).length).toBe(step.log);
		});
		run.limited!.steps.forEach((step, i) => {
			expect(messageText(step).every((line) => line.length > 0)).toBe(true);
			expect(traceLines(run.program, run.limited!, i).length).toBe(step.calls);
		});
		expect(summarize(run)).toHaveLength(2);
	});

	it('has a unique id, a group, a description and a slide of Top-Down Parsing', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group).toBeTruthy();
			expect(p.description).toBeTruthy();
			expect(p.cite?.deck).toBe('11');
			expect(formatCitation(p.cite!)).toMatch(/^Top-Down Parsing · slides? \d/);
			expect(presetFor(p.value.grammar, p.value.input, p.value.tab)?.id).toBe(p.id);
		}
		expect(decks['11'].title).toBe('Top-Down Parsing');
	});

	it('is found again by its grammar, token string and tab', () => {
		expect(presetFor(ORDER_1, '( int )', 'backtracking')?.id).toBe('example-1');
		expect(presetFor(ORDER_1, '( int )', 'functions')?.id).toBe('functions-paren');
		expect(presetFor(`${ORDER_1}\n`, '  ( int ) ', 'backtracking')?.id).toBe('example-1');
		expect(presetFor(ORDER_1, 'int', 'backtracking')).toBeUndefined();
		expect(presetFor(ORDER_2, '( int )', 'backtracking')).toBeUndefined();
	});

	it('stays the same on the other tab when that tab has no preset of its own', () => {
		expect(presetFor(ORDER_2, 'int * int', 'functions')?.id).toBe('example-2');
		expect(presetFor(ORDER_1, 'int * int', 'backtracking')?.id).toBe('functions-times');
		expect(presetFor(LEFT_RECURSIVE, '1 0', 'functions')?.id).toBe('left-recursion');
	});

	it('poses the questions of the slides as questions, each with an answer', () => {
		const questions = presets.flatMap((p) => p.questions ?? []);
		expect(questions).toHaveLength(7);
		for (const q of questions) {
			expect(`${q.prompt} ${q.notation ?? ''}`).toContain('?');
			expect(q.answer ?? q.code).toBeTruthy();
			expect(q.cite.deck).toBe('11');
		}
	});
});

describe('Example 1 (Top-Down Parsing, slides 4–16)', () => {
	const run = load('example-1');

	it('is the default', () => {
		expect(DEFAULT_PRESET_ID).toBe('example-1');
		expect(preset('example-1').cite).toEqual({ deck: '11', slide: [4, 16] });
		expect(preset('example-1').value).toEqual({
			grammar: 'E → T | T + E\nT → int | int * T | ( E )',
			input: '( int )',
			tab: 'backtracking',
			numbers: false
		});
	});

	it('reproduces slides 5–16', () => {
		const r = run.backtracking!;
		expect(
			r.steps.map((s) => describeStep(s, { instances: false }).map(plainText).join(' / '))
		).toEqual([
			'Try E → T',
			'Try T → int',
			'Mismatch: int is not ( / Backtrack …',
			'Try T → int * T',
			'Mismatch: int is not ( / Backtrack …',
			'Try T → ( E )',
			'Match! Advance input.',
			'Try E → T',
			'Try T → int',
			'Match! Advance input.',
			'Match! Advance input.',
			'End of input, accept'
		]);
		// The pointer moves on the slide after each "Match! Advance input."
		expect(r.steps.map((s) => s.pos)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 3]);
		expect(bracketForm(r.tree!)).toBe('E( T( ( E( T(int) ) ) ) )');
	});
});

describe('Example 2 (Top-Down Parsing, slides 17–20)', () => {
	const run = load('example-2');

	it('uses the other order and instance numbers', () => {
		expect(preset('example-2').value).toEqual({
			grammar: 'E → T + E | T\nT → ( E ) | int | int * T',
			input: 'int * int',
			tab: 'backtracking',
			numbers: true
		});
		expect(preset('example-2').cite).toEqual({ deck: '11', slide: [17, 20] });
	});

	it('tries what slides 18–19 list, then backtracks to the choice for E0', () => {
		const r = run.backtracking!;
		const lines = r.log.map((e) => r.steps[e.step].message.join(' '));
		expect(lines.slice(0, 9)).toEqual([
			'Try E₀ → T₁ + E₂',
			'Try T₁ → ( E₃ )',
			'Try T₁ → int',
			'Try T₁ → int * T₂',
			'Try T₂ → ( E₃ )',
			'Try T₂ → int',
			'Try T₂ → int * T₃',
			'Have exhausted the choices for T₂ and T₁ so backtrack to choice for E₀',
			'Try E₀ → T₁'
		]);
	});

	it('succeeds with T1 → int * T2 and T2 → int (slide 20)', () => {
		const r = run.backtracking!;
		expect(r.outcome).toBe('accept');
		expect(bracketForm(r.tree!)).toBe('E( T( int * T(int) ) )');
		const kept = r.log
			.filter((e) => e.undone === null && r.steps[e.step].event === 'try')
			.map((e) => plainText(attemptPieces(r.steps[e.step])));
		expect(kept).toEqual(['E₀ → T₁', 'T₁ → int * T₂', 'T₂ → int']);
	});

	it('answers the questions of slide 22', () => {
		const questions = preset('example-2').questions!;
		expect(questions.map((q) => q.cite)).toEqual(Array(3).fill({ deck: '11', slide: 22 }));
		expect(questions[0].prompt).toMatch(/the new fringe is \?$/);
		expect(questions[0].code).toBe('t₁ t₂ … tₖ B C …');
		expect(questions[1].prompt).toBe('What if the fringe doesn’t match the string?');
		expect(questions[2].prompt).toBe('Stop when ?');
		// The tool shows the same: at a try, the new fringe has the right-hand side in place of A.
		const step = run.backtracking!.steps[9];
		expect(fringeText(step.fringe, true)).toBe('int * T₂ + E₂');
		expect(fringeText(step.newFringe!, true)).toBe('int * ( E₃ ) + E₂');
	});
});

describe('the bool functions (Top-Down Parsing, slides 28–34)', () => {
	it('accepts ( int ) with the code of slide 34', () => {
		const run = load('functions-paren');
		expect(preset('functions-paren').cite).toEqual({ deck: '11', slide: 34 });
		expect(preset('functions-paren').value.tab).toBe('functions');
		expect(programText(run.program).split('\n')[0]).toBe(
			'bool match (TOKEN tok) { return *next++ == tok; }'
		);
		expect(run.limited!.outcome).toBe('accept');
		expect(limitedVerdict(run)!.title).toBe('Accept');
	});

	it('answers the blanks of slides 31 and 32 with the lines of slide 34', () => {
		const run = load('functions-paren');
		const lines = programText(run.program).split('\n');
		const questions = preset('functions-paren').questions!;
		expect(questions.map((q) => [q.notation, q.code, q.cite.slide])).toEqual([
			['bool E₂ () { ? }', 'bool E2 () { return T () && match (PLUS) && E (); }', 31],
			['bool T₂() { ? }', 'bool T2 () { return match (INT) && match (TIMES) && T (); }', 32],
			['bool T₃() { ? }', 'bool T3 () { return match (OPEN) && E () && match (CLOSE); }', 32]
		]);
		for (const q of questions) {
			expect(lines).toContain(q.code);
			// The answer is drawn from the listing, so the production number is a subscript.
			const line = run.program.lines.find((l) => asciiText(l.pieces) === q.code)!;
			expect(line.pieces.some((piece) => piece.sub !== undefined)).toBe(true);
			expect(plainText(piecesOf(q.notation!))).toBe(q.notation);
		}
	});

	it('rejects int * int, which is a sentence (slide 33)', () => {
		const run = load('functions-times');
		expect(preset('functions-times').cite).toEqual({ deck: '11', slide: 33 });
		expect(preset('functions-times').value.grammar).toBe(preset('functions-paren').value.grammar);
		expect(run.limited!.returned).toBe(true);
		expect(run.limited!.leftover).toEqual(['*', 'int']);
		expect(run.limited!.outcome).toBe('reject');
		expect(run.backtracking!.outcome).toBe('accept');
		expect(showsLimitation(run)).toBe(true);
		expect(limitedVerdict(run)!.title).toBe('Cannot backtrack once a production is successful');
	});
});

describe('left recursion (Top-Down Parsing, slides 23–25)', () => {
	it('is not run by default, and names S and S → S 0', () => {
		const run = load('left-recursion');
		expect(preset('left-recursion').value.grammar).toBe('S → 1 | S 0');
		expect(preset('left-recursion').value.input).toBe('1 0');
		expect(LEFT_RECURSIVE).toBe('S → 1 | S 0');
		expect(run.refused).toBe(true);
		expect(run.backtracking).toBeNull();
		expect(run.leftRecursion).toEqual([
			{ nonterminal: 'S', immediate: true, productions: ['S → S 0'] }
		]);
		expect(summarize(run).map((row) => row.verdict)).toEqual(['not-run', 'not-run']);
	});

	it('asks what goes wrong (slide 23)', () => {
		const [q] = preset('left-recursion').questions!;
		expect(q.prompt).toMatch(/^Consider a production V → V a: .* What goes wrong\?$/);
		expect(q.cite).toEqual({ deck: '11', slide: 23 });
	});

	it('finds 1 0 when run anyway, as the description says', () => {
		const run = load('left-recursion', true);
		expect(run.backtracking!.outcome).toBe('accept');
		expect(bracketForm(run.backtracking!.tree!)).toBe('S( S(1) 0 )');
	});

	it('runs away in the reverse order, as the description says', () => {
		const reversed = reverseAlternatives(preset('left-recursion').value.grammar)!;
		expect(reversed).toBe('S → S 0 | 1');
		const run = analyze(reversed, '1 0', { anyway: true }).run!;
		const r = run.backtracking!;
		expect(r.stop?.reason).toBe('depth');
		expect(r.steps.every((s) => s.pos === 0)).toBe(true);
		expect(r.steps.slice(0, 3).map((s) => s.message[0])).toEqual([
			'Try S₀ → S₁ 0',
			'Try S₁ → S₂ 0',
			'Try S₂ → S₃ 0'
		]);
	});
});

describe('catalog entry', () => {
	it('registers /rd-backtracking in the syntax stage', () => {
		expect(tool).toMatchObject({
			slug: 'rd-backtracking',
			title: 'Recursive Descent with Backtracking',
			summary:
				'Step through recursive-descent parsing as it tries each production in order, matches tokens, and backtracks.',
			stage: 'syntax',
			order: 30
		});
		expect(tool.cites.map(formatCitation)).toEqual(['Top-Down Parsing · slides 2–35']);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/rd-backtracking/', import.meta.url));
	const sources = [
		...readdirSync(here)
			.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
			.map((f) => here + f),
		...readdirSync(route).map((f) => route + f),
		fileURLToPath(new URL('../catalog/rd-backtracking.ts', import.meta.url))
	];

	it('has no teaching-purpose phrasing', () => {
		expect(sources.length).toBeGreaterThan(10);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
	});

	it('names neither the university nor an instructor', () => {
		for (const file of sources)
			expect(readFileSync(file, 'utf8'), file).not.toMatch(
				/universit|professor|instructor|\bDr\.|CS ?435/i
			);
	});
});
