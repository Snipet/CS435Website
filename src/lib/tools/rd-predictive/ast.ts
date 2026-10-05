/**
 * AST construction as on Top-Down Parsing, slide 40. For E → T { + T } the
 * slide gives
 *
 *   Node*
 *   E () {
 *     Node* tree = T ();
 *     while (token == '+') {
 *       match ('+');
 *       Node* plus = makeNode ('+');
 *       plus->left  = tree;
 *       plus->right = T ();
 *       tree = plus;
 *     }
 *     return tree;
 *   }
 *
 * The loop makes the tree so far the left child of each new node, so the AST
 * is left-associative. The right-recursive counterpart X → Y [ op X ] has an
 * if in place of the while and calls X itself for the right child, which
 * makes the AST right-associative.
 *
 * A function returns one tree, so a rule gets a function when each of its
 * alternatives is one operand, optionally followed by `{ op operand }` or
 * `[ op operand ]`:
 *
 * - the operand is a single terminal, which becomes a leaf
 *   (`makeNode (token)`), or one non-terminal with any terminals around it,
 *   which are matched and left out of the tree (`( E )`);
 * - inside the brackets every alternative is an operator terminal followed
 *   by one symbol.
 *
 * Other rules (S → 1 { 0 }, E’ → + T E’ | ε) have no function, and code with
 * a function missing is not run. Only the function of slide 40 is on the
 * slides; the functions for operands follow the parser of slide 37.
 */
import type { EbnfGrammar, ParseNode } from '$lib/theory/grammar/types';
import { writeAlternatives, writeBracketWith, writeTerminal, type Scope } from './codegen';
import {
	ebnfOf,
	opt,
	printRule,
	printRules,
	rep,
	sym,
	type Alt,
	type Item,
	type Rule
} from './ebnf';
import { lookaheadOf, type Lookahead } from './predict';
import {
	INT,
	Names,
	Writer,
	writeIf,
	writeMatch,
	type Fn,
	type Program,
	type Stmt,
	type Target
} from './program';
import { runProgram, type HeapEvent, type RunOptions, type RunResult } from './run';

/** `loop`: X → Y { op Y }, left-associative. `recursion`: X → Y [ op X ], right-associative. */
export type AstForm = 'loop' | 'recursion';

/** What a rule's function does: build operators in a loop, by recursion, or return one operand. */
export type RuleShape = AstForm | 'operand';

export interface AstRule {
	nonterminal: string;
	/** The rule as text. */
	text: string;
	/** Null: the rule has no function. */
	shape: RuleShape | null;
}

export interface AstCode {
	program: Program;
	/** One entry per rule of the grammar, in order. */
	rules: AstRule[];
	/** The non-terminals without a function. The code runs only when there are none. */
	missing: string[];
}

type Bracket = Extract<Item, { kind: 'opt' | 'rep' }>;

/** One alternative as an operand with an optional tail of operators. */
interface AltShape {
	/** The symbols before the tail. */
	head: string[];
	/** Index in `head` of the operand. */
	operand: number;
	/** The operand is a terminal: a leaf. */
	leaf: boolean;
	tail: Bracket | null;
}

const TREE = 'tree';

function shapeOf(alt: Alt, isNonterminal: (name: string) => boolean): AltShape | null {
	const last = alt[alt.length - 1];
	const tail = last !== undefined && last.kind !== 'sym' ? last : null;
	const head: string[] = [];
	for (const item of tail ? alt.slice(0, -1) : alt) {
		if (item.kind !== 'sym') return null;
		head.push(item.name);
	}
	if (head.length === 0) return null;
	const operands = head.filter(isNonterminal);
	if (operands.length > 1) return null;
	// Without a non-terminal, the one terminal is the operand.
	if (operands.length === 0 && head.length !== 1) return null;
	if (tail) {
		for (const inner of tail.alts) {
			if (inner.length !== 2) return null;
			const [op, operand] = inner;
			if (op.kind !== 'sym' || operand.kind !== 'sym' || isNonterminal(op.name)) return null;
		}
	}
	return {
		head,
		operand: operands.length === 0 ? 0 : head.indexOf(operands[0]),
		leaf: operands.length === 0,
		tail
	};
}

/** The left-hand side of an assignment: `Node* tree = `, `tree = `, `plus->left  = `. */
function assignTo(target: Target): string {
	if (target.kind === 'variable') return `${target.declares ? 'Node* ' : ''}${target.name} = `;
	// As on the slide, the two fields line up at the equals sign.
	return `${target.object}->${target.field}${target.field === 'left' ? '  ' : ' '}= `;
}

/** A leaf for a terminal: the node, then the match. An int with no test before it gets one. */
function writeLeaf(
	scope: Scope,
	depth: number,
	target: Target,
	terminal: string,
	certain: boolean
): Stmt[] {
	const { w, names } = scope;
	const pair = (d: number, sure: boolean): Stmt[] => [
		{
			kind: 'make',
			line: w.line(d, `${assignTo(target)}makeNode (${names.argument(terminal, sure)});`),
			label: terminal === INT && sure ? null : terminal,
			leaf: true,
			target
		},
		writeMatch(w, d, names, terminal, sure)
	];
	if (terminal !== INT || certain) return pair(depth, certain);
	return [
		writeIf(w, depth, [{ tokens: [INT], test: names.test([INT]), write: (d) => pair(d, true) }], {
			error: scope.error
		})
	];
}

/** `plus->right = T ();`, `Node* tree = T ();` */
function writeCall(scope: Scope, depth: number, target: Target, nonterminal: string): Stmt {
	const name = scope.names.functions.get(nonterminal) ?? nonterminal;
	return {
		kind: 'call',
		line: scope.w.line(depth, `${assignTo(target)}${name} ();`),
		fn: scope.functions.get(nonterminal) ?? -1,
		target
	};
}

/** The body of the loop of slide 40 for one operator: `op operand`. */
function writeOperator(scope: Scope, depth: number, alt: Alt, known: string | null): Stmt[] {
	const { w, names, lookahead } = scope;
	const [op, operand] = alt.map((item) => (item.kind === 'sym' ? item.name : ''));
	const node = names.variable(op, new Set([TREE]));
	const made: Target = { kind: 'variable', name: node, declares: true };
	const left: Target = { kind: 'field', object: node, field: 'left' };
	const right: Target = { kind: 'field', object: node, field: 'right' };
	const tree: Target = { kind: 'variable', name: TREE, declares: false };
	const out: Stmt[] = [writeTerminal(scope, depth, op, known === op)];
	out.push({
		kind: 'make',
		line: w.line(depth, `${assignTo(made)}makeNode (${names.literal(op)});`),
		label: op,
		leaf: false,
		target: made
	});
	out.push({
		kind: 'assign',
		line: w.line(depth, `${assignTo(left)}${TREE};`),
		from: TREE,
		target: left
	});
	if (lookahead.isNonterminal(operand)) out.push(writeCall(scope, depth, right, operand));
	else out.push(...writeLeaf(scope, depth, right, operand, false));
	out.push({
		kind: 'assign',
		line: w.line(depth, `${assignTo(tree)}${node};`),
		from: node,
		target: tree
	});
	return out;
}

/** One alternative: the operand goes into `tree`, then the operators of the tail. */
function writeAlt(
	scope: Scope,
	depth: number,
	shape: AltShape,
	known: string | null,
	declares: boolean
): Stmt[] {
	const tree: Target = { kind: 'variable', name: TREE, declares };
	const out: Stmt[] = [];
	shape.head.forEach((name, at) => {
		const certain = at === 0 && known === name;
		if (at !== shape.operand) out.push(writeTerminal(scope, depth, name, certain));
		else if (shape.leaf) out.push(...writeLeaf(scope, depth, tree, name, certain));
		else out.push(writeCall(scope, depth, tree, name));
	});
	if (shape.tail) {
		out.push(
			...writeBracketWith(scope, depth, shape.tail, (d, alt, token) =>
				writeOperator(scope, d, alt, token)
			)
		);
	}
	return out;
}

function ruleShape(shapes: readonly AltShape[]): RuleShape {
	if (shapes.some((s) => s.tail?.kind === 'rep')) return 'loop';
	if (shapes.some((s) => s.tail?.kind === 'opt')) return 'recursion';
	return 'operand';
}

/**
 * The functions that build the AST of `e`, one per rule that has the form
 * described above, in the order of the grammar.
 */
export function generateAst(e: EbnfGrammar, lookahead: Lookahead = lookaheadOf(e)): AstCode {
	const names = new Names(e.nonterminals, e.terminals);
	const w = new Writer();
	const shaped = lookahead.rules.map((rule) => {
		const shapes = rule.alts.map((alt) => shapeOf(alt, lookahead.isNonterminal));
		return { rule, shapes: shapes.every((s) => s !== null) ? (shapes as AltShape[]) : null };
	});
	const indices = new Map<string, number>();
	for (const { rule, shapes } of shaped) if (shapes) indices.set(rule.lhs, indices.size);

	const functions: Fn[] = [];
	for (const { rule, shapes } of shaped) {
		if (!shapes) continue;
		if (functions.length > 0) w.blank();
		w.fn = functions.length;
		const name = names.functions.get(rule.lhs) ?? rule.lhs;
		const scope: Scope = { w, names, lookahead, functions: indices, error: rule.lhs };
		const first = w.line(0, 'Node*');
		const head = w.line(0, `${name} () {`);
		const body: Stmt[] = [];
		// `Node* tree = T ();` when the one alternative assigns it outside any block.
		const inline = shapes.length === 1 && !(shapes[0].leaf && shapes[0].head[0] === INT);
		if (!inline) body.push({ kind: 'declare', line: w.line(1, `Node* ${TREE};`), name: TREE });
		body.push(
			...writeAlternatives(scope, 1, rule.alts, (d, alt, known) =>
				writeAlt(scope, d, shapes[rule.alts.indexOf(alt)], known, inline)
			)
		);
		body.push({ kind: 'return', line: w.line(1, `return ${TREE};`), name: TREE });
		functions.push({ name, nonterminal: rule.lhs, first, head, close: w.line(0, '}'), body });
	}

	return {
		program: {
			kind: 'ast',
			lines: w.lines,
			functions,
			main: -1,
			start: indices.get(e.start) ?? -1
		},
		rules: shaped.map(({ rule, shapes }) => ({
			nonterminal: rule.lhs,
			text: printRule(rule),
			shape: shapes ? ruleShape(shapes) : null
		})),
		missing: shaped.filter(({ shapes }) => !shapes).map(({ rule }) => rule.lhs)
	};
}

/** Runs the functions on a token string; null when a function is missing. */
export function runAst(
	code: AstCode,
	tokens: readonly string[],
	opts?: RunOptions
): RunResult | null {
	if (code.missing.length > 0 || code.program.start < 0) return null;
	return runProgram(code.program, tokens, opts);
}

// ───────────────────────────── the two forms ─────────────────────────────

/** The operators of a rule X → Y { op Y } or X → Y [ op X ], with its operand Y. */
interface Operators {
	form: AstForm;
	operand: string;
	ops: string[];
}

/**
 * A rule with one alternative, X → Y { op Y | … } or X → Y [ op X | … ]. The
 * two generate the same strings, Y op Y op … Y, and can be written for each
 * other.
 */
function operatorsOf(rule: Rule, isNonterminal: (name: string) => boolean): Operators | null {
	if (rule.alts.length !== 1 || rule.alts[0].length !== 2) return null;
	const [head, tail] = rule.alts[0];
	if (head.kind !== 'sym' || tail.kind === 'sym' || head.name === rule.lhs) return null;
	const form: AstForm = tail.kind === 'rep' ? 'loop' : 'recursion';
	const repeated = form === 'loop' ? head.name : rule.lhs;
	const ops: string[] = [];
	for (const inner of tail.alts) {
		if (inner.length !== 2) return null;
		const [op, operand] = inner;
		if (op.kind !== 'sym' || operand.kind !== 'sym') return null;
		if (isNonterminal(op.name) || operand.name !== repeated) return null;
		ops.push(op.name);
	}
	return { form, operand: head.name, ops };
}

/** The form each rule is written in: null for a rule that has neither. */
export function ruleForms(
	e: EbnfGrammar,
	lookahead: Lookahead = lookaheadOf(e)
): (AstForm | null)[] {
	return lookahead.rules.map((rule) => operatorsOf(rule, lookahead.isNonterminal)?.form ?? null);
}

/** The form of the first rule that has one, or null. */
export function writtenForm(e: EbnfGrammar, lookahead: Lookahead = lookaheadOf(e)): AstForm | null {
	return ruleForms(e, lookahead).find((form) => form !== null) ?? null;
}

export interface Reformed {
	grammar: EbnfGrammar;
	/** The grammar as text. */
	text: string;
	/** The non-terminals whose rule was written in the other form. */
	changed: string[];
}

/**
 * `e` with every rule X → Y { op Y } or X → Y [ op X ] written in `form`:
 * the same language, with the other associativity in the AST.
 */
export function withForm(
	e: EbnfGrammar,
	form: AstForm,
	lookahead: Lookahead = lookaheadOf(e)
): Reformed {
	const changed: string[] = [];
	const rules = lookahead.rules.map((rule): Rule => {
		const found = operatorsOf(rule, lookahead.isNonterminal);
		if (!found || found.form === form) return rule;
		changed.push(rule.lhs);
		const inner = found.ops.map((op) => [sym(op), sym(form === 'loop' ? found.operand : rule.lhs)]);
		return {
			lhs: rule.lhs,
			alts: [[sym(found.operand), form === 'loop' ? rep(inner) : opt(inner)]]
		};
	});
	return { grammar: ebnfOf(rules), text: printRules(rules), changed };
}

// ───────────────────────────── the nodes ─────────────────────────────

export interface AstNode {
	id: number;
	/** The operator or the token. */
	label: string;
	left: number | null;
	right: number | null;
	/** Index of the token the node stands for. */
	token: number;
}

/** Drawn where a node has one child and the other is not set yet. */
export const PLACEHOLDER = '…';

/** The nodes after the first `count` events; a node's id is its index. */
export function nodesAfter(events: readonly HeapEvent[], count: number): AstNode[] {
	const nodes: AstNode[] = [];
	for (const event of events.slice(0, Math.max(0, count))) {
		if (event.kind === 'node') {
			nodes[event.id] = {
				id: event.id,
				label: event.label,
				left: null,
				right: null,
				token: event.token
			};
		} else nodes[event.node] = { ...nodes[event.node], [event.field]: event.child };
	}
	return nodes;
}

/** The nodes as they are after step `index` of a run. */
export function nodesAt(result: RunResult, index: number): AstNode[] {
	const step = result.steps[Math.max(0, Math.min(index, result.steps.length - 1))];
	return step ? nodesAfter(result.events, step.heap) : [];
}

/** The nodes that are no node's child, in the order they were made: one tree each. */
export function rootsOf(nodes: readonly AstNode[]): number[] {
	const children = new Set<number>();
	for (const node of nodes) {
		if (node.left !== null) children.add(node.left);
		if (node.right !== null) children.add(node.right);
	}
	return nodes.filter((node) => !children.has(node.id)).map((node) => node.id);
}

const childrenOf = (node: AstNode): (number | null)[] =>
	node.left === null && node.right === null ? [] : [node.left, node.right];

/**
 * The tree under node `id` for ParseTreeView: the operator at each interior
 * node, the operands as leaves. A child that is not set yet, next to one that
 * is, is a leaf named PLACEHOLDER.
 */
export function treeOf(nodes: readonly AstNode[], id: number): ParseNode {
	const make = (at: number | null): ParseNode =>
		at === null || !nodes[at]
			? { symbol: PLACEHOLDER, terminal: true, children: [] }
			: { symbol: nodes[at].label, terminal: childrenOf(nodes[at]).length === 0, children: [] };
	const root = make(id);
	const todo: { node: ParseNode; id: number }[] = nodes[id] ? [{ node: root, id }] : [];
	while (todo.length > 0) {
		const { node, id: at } = todo.pop()!;
		for (const child of childrenOf(nodes[at])) {
			const made = make(child);
			node.children.push(made);
			if (child !== null && nodes[child]) todo.push({ node: made, id: child });
		}
	}
	return root;
}

/** The paths of the PLACEHOLDER leaves of a tree made by treeOf, to draw them faded. */
export function placeholderPaths(tree: ParseNode): number[][] {
	/** Every node with the entry of its parent and its place among the children. */
	interface Visit {
		node: ParseNode;
		parent: Visit | null;
		at: number;
	}
	const out: number[][] = [];
	const todo: Visit[] = [{ node: tree, parent: null, at: 0 }];
	while (todo.length > 0) {
		const visit = todo.pop()!;
		const { node } = visit;
		if (node.symbol === PLACEHOLDER && node.terminal && node.children.length === 0) {
			const path: number[] = [];
			for (let v: Visit = visit; v.parent; v = v.parent) path.push(v.at);
			out.push(path.reverse());
		}
		for (let i = node.children.length - 1; i >= 0; i--) {
			todo.push({ node: node.children[i], parent: visit, at: i });
		}
	}
	return out;
}

/** The path from the root `root` down to node `id`, or null when it is not below it. */
export function pathTo(nodes: readonly AstNode[], root: number, id: number): number[] | null {
	// Each node has one parent, so the path is read upwards from `id`.
	const parent = new Map<number, { id: number; at: number }>();
	for (const node of nodes) {
		childrenOf(node).forEach((child, at) => {
			if (child !== null) parent.set(child, { id: node.id, at });
		});
	}
	const path: number[] = [];
	let at = id;
	for (let guard = 0; at !== root && guard <= nodes.length; guard++) {
		const up = parent.get(at);
		if (!up) return null;
		path.push(up.at);
		at = up.id;
	}
	return at === root ? path.reverse() : null;
}

/**
 * The tree under node `id` on one line: `+( +( int, int ), int )`. A leaf is
 * its label; a child that is not set yet is PLACEHOLDER; `null` is `id` null.
 */
export function bracketOf(nodes: readonly AstNode[], id: number | null): string {
	if (id === null || !nodes[id]) return 'null';
	const out: string[] = [];
	const todo: (number | null | string)[] = [id];
	while (todo.length > 0) {
		const next = todo.pop()!;
		if (typeof next === 'string') {
			out.push(next);
			continue;
		}
		if (next === null || !nodes[next]) {
			out.push(PLACEHOLDER);
			continue;
		}
		const node = nodes[next];
		const children = childrenOf(node);
		out.push(node.label);
		if (children.length === 0) continue;
		out.push('( ');
		todo.push(' )', children[1], ', ', children[0]);
	}
	return out.join('');
}
