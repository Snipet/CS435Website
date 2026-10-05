import { describe, expect, it } from 'vitest';
import {
	compareGrammars,
	ebnfToGrammar,
	parseEbnf,
	tokenizeInput,
	type EbnfGrammar
} from '$lib/theory/grammar';
import {
	PLACEHOLDER,
	bracketOf,
	generateAst,
	nodesAfter,
	nodesAt,
	pathTo,
	placeholderPaths,
	rootsOf,
	ruleForms,
	runAst,
	treeOf,
	withForm,
	writtenForm,
	type AstNode
} from './ast';
import { functionText, programText } from './program';
import { callNames, framesOf, type RunResult } from './run';

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

const lines = (...rows: string[]) => rows.join('\n');

function run(grammar: string | EbnfGrammar, input: string): RunResult {
	const e = typeof grammar === 'string' ? ebnf(grammar) : grammar;
	const { tokens, diagnostics } = tokenizeInput(input, [...e.terminals, '$']);
	if (diagnostics.length > 0) throw new Error(`input has errors: ${diagnostics[0].message}`);
	const result = runAst(generateAst(e), tokens);
	if (!result) throw new Error('a function is missing');
	return result;
}

/** The AST a finished run returned, on one line. */
const ast = (r: RunResult): string => bracketOf(nodesAt(r, r.steps.length - 1), r.result);

/** The variables of the innermost call after a step, with the trees they point to. */
function variables(r: RunResult, index: number): Record<string, string> {
	const nodes = nodesAt(r, index);
	const frame = r.steps[index].stack;
	return Object.fromEntries(
		Object.entries(frame.vars).map(([name, id]) => [name, bracketOf(nodes, id)])
	);
}

const SLIDE_38 = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';
const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';

/** Top-Down Parsing, slide 40. */
const SLIDE_40 = lines(
	'Node*',
	'E () {',
	'  Node* tree = T ();',
	"  while (token == '+') {",
	"    match ('+');",
	"    Node* plus = makeNode ('+');",
	'    plus->left  = tree;',
	'    plus->right = T ();',
	'    tree = plus;',
	'  }',
	'  return tree;',
	'}'
);

describe('the function of slide 40', () => {
	const code = generateAst(ebnf(SLIDE_38));

	it('E → T { + T } gives the code of the slide, line for line', () => {
		expect(functionText(code.program, 0).split('\n')).toEqual(SLIDE_40.split('\n'));
	});

	it('T → F { * F } gives the same function with times', () => {
		expect(functionText(code.program, 1)).toBe(
			lines(
				'Node*',
				'T () {',
				'  Node* tree = F ();',
				"  while (token == '*') {",
				"    match ('*');",
				"    Node* times = makeNode ('*');",
				'    times->left  = tree;',
				'    times->right = F ();',
				'    tree = times;',
				'  }',
				'  return tree;',
				'}'
			)
		);
	});

	it('F → ( E ) | int returns the tree of E, or a leaf for the token', () => {
		expect(functionText(code.program, 2)).toBe(
			lines(
				'Node*',
				'F () {',
				'  Node* tree;',
				"  if (token == '(') {",
				"    match ('(');",
				'    tree = E ();',
				"    match (')');",
				'  }',
				'  else if (isdigit (token)) {',
				'    tree = makeNode (token);',
				'    match (token);',
				'  }',
				'  else',
				'    error ("F");',
				'  return tree;',
				'}'
			)
		);
	});

	it('has one function per rule, a blank line between them, and no main', () => {
		expect(code.program).toMatchObject({ kind: 'ast', main: -1, start: 0 });
		expect(code.program.functions.map((f) => f.name)).toEqual(['E', 'T', 'F']);
		expect(code.program.functions.map((f) => [f.first, f.head, f.close])).toEqual([
			[0, 1, 11],
			[13, 14, 24],
			[26, 27, 41]
		]);
		expect(programText(code.program).split('\n')[12]).toBe('');
		expect(code.missing).toEqual([]);
		expect(code.rules).toEqual([
			{ nonterminal: 'E', text: 'E → T { + T }', shape: 'loop' },
			{ nonterminal: 'T', text: 'T → F { * F }', shape: 'loop' },
			{ nonterminal: 'F', text: 'F → ( E ) | int', shape: 'operand' }
		]);
	});
});

describe('the right-recursive counterpart', () => {
	it('E → T [ + E ]: an if, and E () for the right child', () => {
		const code = generateAst(ebnf('E → T [ + E ]\nT → int'));
		expect(functionText(code.program, 0)).toBe(
			lines(
				'Node*',
				'E () {',
				'  Node* tree = T ();',
				"  if (token == '+') {",
				"    match ('+');",
				"    Node* plus = makeNode ('+');",
				'    plus->left  = tree;',
				'    plus->right = E ();',
				'    tree = plus;',
				'  }',
				'  return tree;',
				'}'
			)
		);
		expect(code.rules.map((r) => r.shape)).toEqual(['recursion', 'operand']);
	});

	it('T → ( E ) | int [ * T ] (slide 37)', () => {
		const code = generateAst(ebnf(SLIDE_37));
		expect(functionText(code.program, 1)).toBe(
			lines(
				'Node*',
				'T () {',
				'  Node* tree;',
				"  if (token == '(') {",
				"    match ('(');",
				'    tree = E ();',
				"    match (')');",
				'  }',
				'  else if (isdigit (token)) {',
				'    tree = makeNode (token);',
				'    match (token);',
				"    if (token == '*') {",
				"      match ('*');",
				"      Node* times = makeNode ('*');",
				'      times->left  = tree;',
				'      times->right = T ();',
				'      tree = times;',
				'    }',
				'  }',
				'  else',
				'    error ("T");',
				'  return tree;',
				'}'
			)
		);
		expect(code.rules.map((r) => r.shape)).toEqual(['recursion', 'recursion']);
	});

	it('A → X [ op A ] with a terminal X (slide 39)', () => {
		const code = generateAst(ebnf('A → X [ op A ]'));
		expect(programText(code.program)).toBe(
			lines(
				'Node*',
				'A () {',
				"  Node* tree = makeNode ('X');",
				"  match ('X');",
				'  if (token == OP) {',
				'    match (OP);',
				'    Node* op = makeNode (OP);',
				'    op->left  = tree;',
				'    op->right = A ();',
				'    tree = op;',
				'  }',
				'  return tree;',
				'}'
			)
		);
		expect(ast(run('A → X [ op A ]', 'X op X op X'))).toBe('op( X, op( X, X ) )');
	});
});

describe('other rules', () => {
	it('several operators in one loop', () => {
		const code = generateAst(ebnf('E → T { + T | - T }\nT → int'));
		expect(functionText(code.program, 0)).toBe(
			lines(
				'Node*',
				'E () {',
				'  Node* tree = T ();',
				"  while (token == '+' || token == '-') {",
				"    if (token == '+') {",
				"      match ('+');",
				"      Node* plus = makeNode ('+');",
				'      plus->left  = tree;',
				'      plus->right = T ();',
				'      tree = plus;',
				'    }',
				"    else if (token == '-') {",
				"      match ('-');",
				"      Node* minus = makeNode ('-');",
				'      minus->left  = tree;',
				'      minus->right = T ();',
				'      tree = minus;',
				'    }',
				'  }',
				'  return tree;',
				'}'
			)
		);
		// T → int: the int has no test before it, so tree is declared first.
		expect(functionText(code.program, 1)).toBe(
			lines(
				'Node*',
				'T () {',
				'  Node* tree;',
				'  if (isdigit (token)) {',
				'    tree = makeNode (token);',
				'    match (token);',
				'  }',
				'  else',
				'    error ("T");',
				'  return tree;',
				'}'
			)
		);
		expect(ast(run('E → T { + T | - T }\nT → int', 'int - int + int'))).toBe(
			'+( -( int, int ), int )'
		);
	});

	it('a terminal as the right operand is a leaf', () => {
		const code = generateAst(ebnf('L → id { , id }'));
		expect(programText(code.program)).toBe(
			lines(
				'Node*',
				'L () {',
				'  Node* tree = makeNode (ID);',
				'  match (ID);',
				"  while (token == ',') {",
				"    match (',');",
				"    Node* comma = makeNode (',');",
				'    comma->left  = tree;',
				'    comma->right = makeNode (ID);',
				'    match (ID);',
				'    tree = comma;',
				'  }',
				'  return tree;',
				'}'
			)
		);
		expect(ast(run('L → id { , id }', 'id , id , id'))).toBe(',( ,( id, id ), id )');
		const ints = generateAst(ebnf('S → int { + int }'));
		expect(programText(ints.program).split('\n').slice(12, 19)).toEqual([
			'    plus->left  = tree;',
			'    if (isdigit (token)) {',
			'      plus->right = makeNode (token);',
			'      match (token);',
			'    }',
			'    else',
			'      error ("S");'
		]);
		expect(ast(run('S → int { + int }', 'int + int'))).toBe('+( int, int )');
	});

	it('gives no function to a rule that is not an operand with operators', () => {
		const loop = generateAst(ebnf('S → 1 { 0 }'));
		expect(loop.rules).toEqual([{ nonterminal: 'S', text: 'S → 1 { 0 }', shape: null }]);
		expect(loop.missing).toEqual(['S']);
		expect(loop.program.functions).toEqual([]);
		expect(loop.program.start).toBe(-1);
		expect(runAst(loop, ['1', '0'])).toBeNull();

		// The primed form of slide 38's grammar: E’ would need the tree of the T before it.
		const primed = generateAst(ebnf('E → T E’\nE’ → + T E’ | ε\nT → int'));
		expect(primed.rules.map((r) => r.shape)).toEqual([null, null, 'operand']);
		expect(primed.missing).toEqual(['E', 'E’']);
		expect(primed.program.functions.map((f) => f.name)).toEqual(['T']);
		expect(runAst(primed, ['int'])).toBeNull();

		for (const text of [
			'A → a b',
			'A → [ a ] b',
			'A → B { c }\nB → b',
			'A → B { C b }\nB → b\nC → c'
		])
			expect(generateAst(ebnf(text)).missing, text).toContain('A');
	});

	it('gives no function to a rule that would leave an operator out of the tree', () => {
		// A prefix operator: without a node for it, - int would have the tree of int.
		const prefix = generateAst(ebnf('E → T { + T }\nT → F { * F }\nF → int | - F'));
		expect(prefix.rules.map((r) => r.shape)).toEqual(['loop', 'loop', null]);
		expect(prefix.missing).toEqual(['F']);
		expect(programText(prefix.program)).not.toContain("match ('-')");
		expect(runAst(prefix, ['-', 'int'])).toBeNull();

		// An assignment: the tree of E alone has neither the target nor the :=.
		const assignment = generateAst(ebnf('S → id := E\nE → T { + T }\nT → int'));
		expect(assignment.missing).toEqual(['S']);
		expect(assignment.program.functions.map((f) => f.name)).toEqual(['E', 'T']);

		for (const text of [
			'A → B !\nB → b', // a postfix operator
			'A → not B\nB → b',
			'A → f ( B )\nB → b', // the name before the parenthesis
			'A → ( B ) !\nB → b',
			'A → ( ( B ) )\nB → b',
			'A → B ( b )\nB → b', // the non-terminal is not the one enclosed
			'A → ( b )', // nothing but terminals
			'A → - B { + B }\nB → b'
		])
			expect(generateAst(ebnf(text)).missing, text).toContain('A');
	});

	it('takes a non-terminal between two terminals as an operand, whatever the terminals', () => {
		for (const text of [
			'A → ( B )\nB → b',
			'A → begin B end\nB → b',
			'A → "|" B "|"\nB → b',
			'A → "[" B "]" { + B }\nB → b',
			'A → B | ( A )\nB → b'
		])
			expect(generateAst(ebnf(text)).missing, text).toEqual([]);
		expect(ast(run('A → B { + B }\nB → b | begin A end', 'b + begin b + b end'))).toBe(
			'+( b, +( b, b ) )'
		);
	});

	it('lists the terminals that enclose an operand: they get no node', () => {
		expect(generateAst(ebnf(SLIDE_38)).enclosing).toEqual(['(', ')']);
		expect(generateAst(ebnf(SLIDE_37)).enclosing).toEqual(['(', ')']);
		expect(generateAst(ebnf('E → T { + T }\nT → int')).enclosing).toEqual([]);
		expect(generateAst(ebnf('A → ( A ) | "[" A "]" | "|" A "|" | x')).enclosing).toEqual([
			'(',
			')',
			'[',
			']',
			'|'
		]);
		// Every other token of a run is a node of the tree.
		const r = run(SLIDE_38, '( int + int ) * ( int )');
		const kept = nodesAt(r, r.steps.length - 1).map((n) => r.tokens[n.token]);
		expect(kept).toEqual(['int', '+', 'int', '*', 'int']);
		expect(r.tokens.filter((t) => !kept.includes(t))).toEqual(['(', ')', '(', ')', '$']);
		// A rule without a function adds nothing.
		expect(generateAst(ebnf('S → ( S ) x | y')).enclosing).toEqual([]);
	});

	it('calls a function that is missing by its name', () => {
		const code = generateAst(ebnf('E → T { + T }\nT → a b'));
		expect(code.missing).toEqual(['T']);
		expect(functionText(code.program, 0).split('\n')[2]).toBe('  Node* tree = T ();');
		expect(code.program.functions[0].body[0]).toMatchObject({ kind: 'call', fn: -1 });
	});
});

describe('running the functions', () => {
	it('int + int + int under E → T { + T } is left-associative', () => {
		const r = run(SLIDE_38, 'int + int + int');
		expect(r.outcome).toBe('done');
		expect(ast(r)).toBe('+( +( int, int ), int )');
		expect(callNames(r)).toEqual(['E', 'T', 'F', 'T', 'F', 'T', 'F']);
	});

	it('int + int + int under E → T [ + E ] is right-associative', () => {
		const r = run(SLIDE_37, 'int + int + int');
		expect(r.outcome).toBe('done');
		expect(ast(r)).toBe('+( int, +( int, int ) )');
		expect(callNames(r)).toEqual(['E', 'T', 'E', 'T', 'E', 'T']);
		expect(ast(run('E → T [ + E ]\nT → int', 'int + int + int'))).toBe('+( int, +( int, int ) )');
	});

	it('precedence comes from the grammar: int + int * int', () => {
		expect(ast(run(SLIDE_38, 'int + int * int'))).toBe('+( int, *( int, int ) )');
		expect(ast(run(SLIDE_38, 'int * int + int'))).toBe('+( *( int, int ), int )');
		expect(ast(run(SLIDE_38, '( int + int ) * int'))).toBe('*( +( int, int ), int )');
		expect(ast(run(SLIDE_38, 'int'))).toBe('int');
	});

	it('exposes the variables and the nodes after each step', () => {
		const r = run('E → T { + T }\nT → int', 'int + int + int');
		const kinds = r.steps.map((s) => s.kind);
		expect(kinds.slice(0, 8)).toEqual([
			'start', // E
			'enter', // T
			'test', // isdigit (token)
			'make', // tree = makeNode (token)
			'match',
			'leave', // return tree
			'store', // Node* tree = T ()
			'test' // while (token == '+')
		]);
		expect(variables(r, 3)).toEqual({ tree: 'int' });
		expect(r.steps[5]).toMatchObject({ kind: 'leave', fn: 1, to: 0, value: 0, line: 22 });
		expect(r.steps[6]).toMatchObject({
			kind: 'store',
			fn: 1,
			node: 0,
			line: 2,
			target: { kind: 'variable', name: 'tree', declares: true }
		});
		expect(variables(r, 5)).toEqual({ tree: 'int' });
		expect(variables(r, 6)).toEqual({ tree: 'int' });

		// The first round of the loop.
		const round = r.steps.slice(8, 18).map((s) => `${s.kind} @${s.line}`);
		expect(round).toEqual([
			'match @4',
			'make @5',
			'assign @6',
			'enter @14',
			'test @16',
			'make @17',
			'match @18',
			'leave @22',
			'store @7',
			'assign @8'
		]);
		expect(variables(r, 9)).toEqual({ tree: 'int', plus: '+' });
		expect(variables(r, 10)).toEqual({ tree: 'int', plus: `+( int, ${PLACEHOLDER} )` });
		expect(variables(r, 16)).toEqual({ tree: 'int', plus: '+( int, int )' });
		expect(variables(r, 17)).toEqual({ tree: '+( int, int )', plus: '+( int, int )' });
		expect(r.steps[17]).toMatchObject({ kind: 'assign', from: 'plus', node: 1 });

		// After the second round the tree so far is the left child of the new node.
		const last = r.steps.length - 1;
		expect(r.steps[last]).toMatchObject({ kind: 'leave', fn: 0, to: null, value: 3 });
		expect(variables(r, last - 2)).toEqual({
			tree: '+( +( int, int ), int )',
			plus: '+( +( int, int ), int )'
		});
		// plus is declared in the body of the loop: return tree; is outside it.
		expect(variables(r, last)).toEqual({ tree: '+( +( int, int ), int )' });
		expect(r.result).toBe(3);
	});

	it('keeps a variable of the loop body in scope for one round only', () => {
		const r = run('E → T { + T }\nT → int', 'int + int + int');
		/** The variables of E () at every step that is in E (), by line of the code. */
		const inE = r.steps
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.stack.fn === 0)
			.map(
				({ s, i }) => `${r.program.lines[s.line].text.trim()} | ${Object.keys(variables(r, i))}`
			);
		const round = [
			"while (token == '+') { | tree",
			"match ('+'); | tree",
			"Node* plus = makeNode ('+'); | tree,plus",
			'plus->left  = tree; | tree,plus',
			'plus->right = T (); | tree,plus',
			'tree = plus; | tree,plus'
		];
		expect(inE).toEqual([
			'E () { | ',
			'Node* tree = T (); | tree',
			...round,
			// The second round starts without the plus of the first.
			...round,
			"while (token == '+') { | tree",
			'return tree; | tree'
		]);
		// In each round plus is a new node.
		const made = r.steps.filter((s) => s.kind === 'make' && s.label === '+');
		expect(made.map((s) => s.stack.vars.plus)).toEqual([1, 3]);
	});

	it('ends the scope of each branch of a loop with several operators', () => {
		const r = run('E → T { + T | - T }\nT → int', 'int - int + int');
		const scopes = r.steps.map((s) => Object.keys(s.stack.vars).join(','));
		// minus and plus are each declared in their own if.
		expect(new Set(scopes)).toEqual(new Set(['', 'tree', 'tree,minus', 'tree,plus']));
		expect(Object.keys(r.steps[r.steps.length - 1].stack.vars)).toEqual(['tree']);
		expect(ast(r)).toBe('+( -( int, int ), int )');
	});

	it('ends the scope of the operator variable after the if of the recursive form', () => {
		const r = run('E → T [ + E ]\nT → int', 'int + int');
		const returns = r.steps.filter((s) => s.kind === 'leave' && s.fn === 0);
		expect(returns).toHaveLength(2);
		for (const step of returns) expect(Object.keys(step.stack.vars)).toEqual(['tree']);
		// While the inner E () runs, the outer one is inside its if and still has plus.
		const inner = r.steps.find((s) => s.kind === 'leave' && s.fn === 0)!;
		expect(Object.keys(inner.stack.parent!.vars)).toEqual(['tree', 'plus']);
	});

	it('keeps the variables of the outer calls', () => {
		const r = run('E → T [ + E ]\nT → int', 'int + int + int');
		const deepest = r.steps.reduce((a, b) => (b.stack.depth > a.stack.depth ? b : a));
		const frames = framesOf(deepest);
		expect(frames.map((f) => r.program.functions[f.fn].name)).toEqual(['T', 'E', 'E', 'E']);
		const nodes = nodesAfter(r.events, deepest.heap);
		// Two + nodes wait for their right child while the third operand is read.
		expect(frames.slice(2).map((f) => bracketOf(nodes, f.vars.plus))).toEqual([
			`+( int, ${PLACEHOLDER} )`,
			`+( int, ${PLACEHOLDER} )`
		]);
		expect(rootsOf(nodes)).toEqual([1, 3]);
	});

	it('records which token each node stands for', () => {
		const r = run(SLIDE_38, 'int + int * int');
		const nodes = nodesAt(r, r.steps.length - 1);
		expect(nodes.map((n) => `${n.label}@${n.token}`)).toEqual([
			'int@0',
			'+@1',
			'int@2',
			'*@3',
			'int@4'
		]);
		expect(nodes.map((n) => r.tokens[n.token])).toEqual(nodes.map((n) => n.label));
	});

	it('stops at an error like the parser', () => {
		const error = run(SLIDE_38, 'int + )');
		expect(error.outcome).toBe('error');
		expect(error.steps[error.steps.length - 1]).toMatchObject({ kind: 'error', name: 'F' });
		expect(error.result).toBeNull();
		// The + node was made and has its left child.
		const nodes = nodesAt(error, error.steps.length - 1);
		expect(rootsOf(nodes).map((id) => bracketOf(nodes, id))).toEqual([`+( int, ${PLACEHOLDER} )`]);

		const mismatch = run(SLIDE_38, '( int');
		expect(mismatch.outcome).toBe('mismatch');
	});

	it('returns with tokens left when the input goes on', () => {
		const r = run(SLIDE_38, 'int int');
		expect(r.outcome).toBe('done');
		expect(ast(r)).toBe('int');
		expect(r.steps[r.steps.length - 1].pointer).toBe(1);
	});
});

describe('the two forms of a rule', () => {
	it('tells which form each rule is written in', () => {
		expect(ruleForms(ebnf(SLIDE_38))).toEqual(['loop', 'loop', null]);
		expect(ruleForms(ebnf(SLIDE_37))).toEqual(['recursion', null]);
		expect(ruleForms(ebnf('S → 1 { 0 }'))).toEqual([null]);
		expect(ruleForms(ebnf('E → T { + T }\nT → F [ * T ]\nF → int'))).toEqual([
			'loop',
			'recursion',
			null
		]);
		// E → E { + T } is not an operand followed by operators on that operand.
		expect(ruleForms(ebnf('E → T { + F }\nT → int\nF → int'))).toEqual([null, null, null]);
		expect(ruleForms(ebnf('E → T [ + T ]\nT → int'))).toEqual([null, null]);
	});

	it('tells how the grammar as a whole is written', () => {
		expect(writtenForm(ebnf(SLIDE_38))).toBe('loop');
		expect(writtenForm(ebnf(SLIDE_37))).toBe('recursion');
		expect(writtenForm(ebnf('S → 1 { 0 }'))).toBeNull();
		// A left-associative and a right-associative operator, in either order.
		expect(writtenForm(ebnf('E → T { + T }\nT → F [ * T ]\nF → int'))).toBe('mixed');
		expect(writtenForm(ebnf('E → T [ = E ]\nT → F { + F }\nF → int'))).toBe('mixed');
		// T → ( E ) | int [ * T ] has two alternatives, so it has no other form to be written in.
		expect(writtenForm(ebnf('E → T { + T }\nT → ( E ) | int [ * T ]'))).toBe('loop');
	});

	it('leaves every rule as it is written when no form is asked for', () => {
		for (const text of [SLIDE_38, SLIDE_37, 'E → T { + T }\nT → F [ ^ T ]\nF → int']) {
			const e = ebnf(text);
			const same = withForm(e, null);
			expect(same).toMatchObject({ text, changed: [] });
			expect(same.grammar.rules.map((rule) => rule.body)).toEqual(e.rules.map((rule) => rule.body));
		}
		// The mixed grammar keeps both associativities; a form gives every rule one of them.
		const mixed = ebnf('E → T { + T }\nT → F [ ^ T ]\nF → int');
		const input = 'int ^ int ^ int + int + int';
		expect(ast(run(withForm(mixed, null).grammar, input))).toBe(
			'+( +( ^( int, ^( int, int ) ), int ), int )'
		);
		expect(ast(run(withForm(mixed, 'loop').grammar, input))).toBe(
			'+( +( ^( ^( int, int ), int ), int ), int )'
		);
		expect(ast(run(withForm(mixed, 'recursion').grammar, input))).toBe(
			'+( ^( int, ^( int, int ) ), +( int, int ) )'
		);
		expect(withForm(mixed, 'loop').changed).toEqual(['T']);
		expect(withForm(mixed, 'recursion').changed).toEqual(['E']);
	});

	it('writes X → Y { op Y } as X → Y [ op X ]', () => {
		const e = ebnf(SLIDE_38);
		const r = withForm(e, 'recursion');
		expect(r.text).toBe(lines('E → T [ + E ]', 'T → F [ * T ]', 'F → ( E ) | int'));
		expect(r.changed).toEqual(['E', 'T']);
		expect(withForm(e, 'loop')).toMatchObject({ text: SLIDE_38, changed: [] });
		expect(ast(run(r.grammar, 'int + int + int'))).toBe('+( int, +( int, int ) )');
		expect(ast(run(r.grammar, 'int * int * int'))).toBe('*( int, *( int, int ) )');
	});

	it('and back', () => {
		const e = ebnf(SLIDE_37);
		const r = withForm(e, 'loop');
		// T has two alternatives, so only E is rewritten.
		expect(r.text).toBe(lines('E → T { + T }', 'T → ( E ) | int [ * T ]'));
		expect(r.changed).toEqual(['E']);
		expect(ast(run(r.grammar, 'int + int + int'))).toBe('+( +( int, int ), int )');
		const a = withForm(ebnf('A → X [ op A ]'), 'loop');
		expect(a.text).toBe('A → X { op X }');
		expect(ast(run(a.grammar, 'X op X op X'))).toBe('op( op( X, X ), X )');
	});

	it('keeps several operators together', () => {
		const r = withForm(ebnf('E → T { + T | - T }\nT → int'), 'recursion');
		expect(r.text).toBe(lines('E → T [ + E | - E ]', 'T → int'));
		expect(withForm(r.grammar, 'loop').text).toBe(lines('E → T { + T | - T }', 'T → int'));
	});

	it('generates the same strings in both forms', () => {
		for (const text of [SLIDE_38, SLIDE_37, 'E → T { + T | - T }\nT → int', 'A → X [ op A ]']) {
			const e = ebnf(text);
			for (const form of ['loop', 'recursion'] as const) {
				const compared = compareGrammars(
					ebnfToGrammar(e),
					ebnfToGrammar(withForm(e, form).grammar),
					{ maxLength: 7 }
				);
				expect(compared, `${text} as ${form}`).toMatchObject({ onlyA: [], onlyB: [] });
			}
		}
	});
});

describe('the nodes as trees', () => {
	const node = (
		id: number,
		label: string,
		left: number | null = null,
		right: number | null = null
	) => ({ id, label, left, right, token: id }) satisfies AstNode;
	// +( *( a, b ), … ) and a node of its own.
	const nodes: AstNode[] = [
		node(0, 'a'),
		node(1, 'b'),
		node(2, '*', 0, 1),
		node(3, '+', 2, null),
		node(4, 'c')
	];

	it('rootsOf: the nodes that are no child', () => {
		expect(rootsOf(nodes)).toEqual([3, 4]);
		expect(rootsOf([])).toEqual([]);
	});

	it('treeOf: the operator at each interior node', () => {
		expect(treeOf(nodes, 3)).toEqual({
			symbol: '+',
			terminal: false,
			children: [
				{
					symbol: '*',
					terminal: false,
					children: [
						{ symbol: 'a', terminal: true, children: [] },
						{ symbol: 'b', terminal: true, children: [] }
					]
				},
				{ symbol: PLACEHOLDER, terminal: true, children: [] }
			]
		});
		expect(treeOf(nodes, 4)).toEqual({ symbol: 'c', terminal: true, children: [] });
		expect(placeholderPaths(treeOf(nodes, 3))).toEqual([[1]]);
		expect(placeholderPaths(treeOf(nodes, 2))).toEqual([]);
	});

	it('pathTo: where a node is in a tree', () => {
		expect(pathTo(nodes, 3, 3)).toEqual([]);
		expect(pathTo(nodes, 3, 1)).toEqual([0, 1]);
		expect(pathTo(nodes, 3, 4)).toBeNull();
	});

	it('bracketOf: the tree on one line', () => {
		expect(bracketOf(nodes, 3)).toBe(`+( *( a, b ), ${PLACEHOLDER} )`);
		expect(bracketOf(nodes, 0)).toBe('a');
		expect(bracketOf(nodes, null)).toBe('null');
	});

	it('nodesAfter: the nodes at a point of the run', () => {
		const r = run('E → T { + T }\nT → int', 'int + int');
		expect(nodesAfter(r.events, 0)).toEqual([]);
		expect(nodesAfter(r.events, 2)).toEqual([
			{ id: 0, label: 'int', left: null, right: null, token: 0 },
			{ id: 1, label: '+', left: null, right: null, token: 1 }
		]);
		expect(nodesAfter(r.events, r.events.length)[1]).toMatchObject({ left: 0, right: 2 });
		expect(nodesAt(r, 0)).toEqual([]);
	});

	it('takes a chain of 20000 operators', () => {
		const count = 20000;
		const tokens = Array.from({ length: 2 * count + 1 }, (_, i) => (i % 2 === 0 ? 'int' : '+'));
		for (const grammar of ['E → T { + T }\nT → int', 'E → T [ + E ]\nT → int']) {
			const r = runAst(generateAst(ebnf(grammar)), tokens, { maxSteps: 1e6 })!;
			expect(r.outcome).toBe('done');
			const all = nodesAt(r, r.steps.length - 1);
			expect(all).toHaveLength(2 * count + 1);
			expect(bracketOf(all, r.result).length).toBeGreaterThan(count);
			expect(placeholderPaths(treeOf(all, r.result!))).toEqual([]);
		}
	});
});
