/**
 * "Backtracking not needed if the grammar is suitable" (Top-Down Parsing,
 * slide 36): for a grammar without conflicts, the generated parser accepts
 * exactly the sentences of the grammar. Checked against the Earley recognizer
 * on every token string up to a length, for the grammars of the slides and a
 * few more; the functions that build an AST read the same strings.
 */
import { describe, expect, it } from 'vitest';
import {
	ebnfToGrammar,
	parseEbnf,
	parseGrammar,
	recognizes,
	type EbnfGrammar
} from '$lib/theory/grammar';
import { generateAst, nodesAt, runAst, type AstNode } from './ast';
import { generateParser } from './codegen';
import { predict } from './predict';
import type { Program, Stmt } from './program';
import { framesOf, leftOver, runProgram, type RunResult } from './run';
import { rewriteGrammar } from './transform';

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

/** Every string over `alphabet` of up to `max` symbols. */
function* strings(alphabet: readonly string[], max: number): Generator<string[]> {
	let level: string[][] = [[]];
	for (let n = 0; n <= max; n++) {
		yield* level;
		level = level.flatMap((s) => alphabet.map((t) => [...s, t]));
	}
}

const SUITABLE: [name: string, grammar: string, length: number][] = [
	['slide 37', 'E → T [ + E ]\nT → ( E ) | int [ * T ]', 6],
	['slide 38', 'E → T { + T }\nT → F { * F }\nF → ( E ) | int', 6],
	['slide 25, EBNF', 'S → 1 { 0 }', 8],
	['slide 25, primed', 'S → 1 S’\nS’ → 0 S’ | ε', 8],
	['slide 26, primed', 'S → c S’ | d S’\nS’ → a S’ | b S’ | ε', 6],
	['slide 27, rewritten', 'S → d { b a }', 8],
	['slide 39', 'A → X [ op A ]', 8],
	['two operators in a loop', 'E → T { + T | - T }\nT → int | ( E )', 6],
	['nested brackets', 'S → a { b [ c ] } d', 7],
	['ε alternatives', 'S → A B c\nA → a | ε\nB → b | ε', 6],
	['an alternative that derives ε', 'S → A x | y\nA → a A | ε', 6],
	['balanced parentheses', 'S → { ( S ) }', 8],
	['statements', 'S → if c then S [ else S ] | { a ; }', 0],
	['a list', 'L → id { , id } | ε', 7]
];

describe('a grammar that is suitable for prediction', () => {
	it.each(SUITABLE)('%s: the parser accepts exactly the sentences', (_, text, length) => {
		const e = ebnf(text);
		const prediction = predict(e);
		// The dangling else is the one grammar listed that is not suitable.
		if (!prediction.suitable) {
			expect(prediction.conflicts.map((c) => c.kind)).toContain('option');
			return;
		}
		const grammar = ebnfToGrammar(e);
		const parser = generateParser(e);
		let sentences = 0;
		for (const tokens of strings(e.terminals, length)) {
			const expected = recognizes(grammar, tokens);
			const run = runProgram(parser, tokens);
			expect(run.outcome === 'accept', tokens.join(' ')).toBe(expected);
			expect(['accept', 'error', 'mismatch']).toContain(run.outcome);
			if (expected) sentences++;
		}
		expect(sentences).toBeGreaterThan(0);
	});

	it('is what the rewrite of each slide grammar gives', () => {
		for (const text of [
			'S → 1 | S 0',
			'S → S a | S b | c | d',
			'E → E + T | T\nT → T * F | F\nF → ( E ) | int',
			'E → T + E | T\nT → ( E ) | int | int * T',
			'A → X op A | X'
		]) {
			for (const form of ['ebnf', 'bnf'] as const) {
				const rewrite = rewriteGrammar(parseGrammar(text).grammar!, { form });
				expect(predict(rewrite.grammar).suitable, `${text} as ${form}`).toBe(true);
			}
		}
	});
});

/** The labels of a tree from left to right: left subtree, node, right subtree. */
function inOrder(nodes: readonly AstNode[], root: number | null): string[] {
	const out: string[] = [];
	const todo: (number | string | null)[] = [root];
	while (todo.length > 0) {
		const next = todo.pop()!;
		if (next === null) continue;
		if (typeof next === 'string') {
			out.push(next);
			continue;
		}
		const node = nodes[next];
		todo.push(node.right, node.label, node.left);
	}
	return out;
}

/** A variable declared inside the body of a while or an if, with the lines it is in scope on. */
interface Declaration {
	fn: number;
	name: string;
	from: number;
	to: number;
}

/** The declarations in the nested blocks of a program: `Node* plus = makeNode ('+');`. */
function nestedDeclarations(program: Program): Declaration[] {
	const out: Declaration[] = [];
	const visit = (fn: number, body: readonly Stmt[], close: number | null): void => {
		for (const stmt of body) {
			if (stmt.kind === 'make' && stmt.target.kind === 'variable' && stmt.target.declares) {
				if (close !== null) out.push({ fn, name: stmt.target.name, from: stmt.line, to: close });
			} else if (stmt.kind === 'while') visit(fn, stmt.body, stmt.close);
			else if (stmt.kind === 'if') {
				for (const arm of stmt.arms) visit(fn, arm.body, arm.close ?? arm.line);
				if (stmt.otherwise) visit(fn, stmt.otherwise.body, stmt.otherwise.close);
			}
		}
	};
	program.functions.forEach((f, fn) => visit(fn, f.body, null));
	return out;
}

/**
 * The frames of a run that list an operator variable on a line outside the
 * block that declares it, or leave one out inside it. A call that waits for
 * another is on the line of that call.
 */
function scopeErrors(run: RunResult, declarations: readonly Declaration[]): string[] {
	const out: string[] = [];
	run.steps.forEach((step, index) => {
		const frames = framesOf(step);
		frames.forEach((frame, depth) => {
			const line = depth === 0 ? step.line : frames[depth - 1].site!;
			const expected = declarations
				.filter((d) => d.fn === frame.fn && d.from <= line && line <= d.to)
				.map((d) => d.name);
			const listed = Object.keys(frame.vars).filter((name) => name !== 'tree');
			if ([...listed].sort().join() !== [...expected].sort().join())
				out.push(`step ${index}, line ${line + 1}: ${listed.join()} for ${expected.join()}`);
		});
	});
	return out;
}

describe('the functions that build an AST', () => {
	it.each([
		['slide 38', 'E → T { + T }\nT → F { * F }\nF → ( E ) | int', 6],
		['slide 38 with [ ]', 'E → T [ + E ]\nT → F [ * T ]\nF → ( E ) | int', 6],
		['slide 37', 'E → T [ + E ]\nT → ( E ) | int [ * T ]', 6],
		['slide 39', 'A → X [ op A ]', 8],
		['two operators', 'E → T { + T | - T }\nT → int | ( E )', 6],
		['a { } rule and a [ ] rule', 'E → T { + T }\nT → F [ ^ T ]\nF → ( E ) | int', 6],
		['other enclosing terminals', 'E → T { + T }\nT → int | begin E end | "[" E "]"', 5]
	] as const)(
		'%s: read the sentences, and the AST has their tokens in order',
		(_, text, length) => {
			const e = ebnf(text);
			const grammar = ebnfToGrammar(e);
			const code = generateAst(e);
			expect(code.missing).toEqual([]);
			const declarations = nestedDeclarations(code.program);
			expect(declarations.length).toBeGreaterThan(0);
			let sentences = 0;
			for (const tokens of strings(e.terminals, length)) {
				const run = runAst(code, tokens)!;
				// In sentences and in strings that stop at an error alike.
				expect(scopeErrors(run, declarations), tokens.join(' ')).toEqual([]);
				const whole = run.outcome === 'done' && leftOver(run).length === 0;
				expect(whole, tokens.join(' ')).toBe(recognizes(grammar, tokens));
				if (!whole) continue;
				sentences++;
				// The enclosing terminals are matched and left out of the tree; everything else is a node.
				const nodes = nodesAt(run, run.steps.length - 1);
				expect(inOrder(nodes, run.result)).toEqual(
					tokens.filter((t) => !code.enclosing.includes(t))
				);
				expect(nodes.map((n) => tokens[n.token])).toEqual(nodes.map((n) => n.label));
			}
			expect(sentences).toBeGreaterThan(0);
		}
	);

	it('the enclosing terminals of the slide grammars are the parentheses', () => {
		expect(generateAst(ebnf('E → T { + T }\nT → F { * F }\nF → ( E ) | int')).enclosing).toEqual([
			'(',
			')'
		]);
	});
});
