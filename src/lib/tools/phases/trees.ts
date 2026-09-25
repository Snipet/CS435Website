/**
 * Trees to draw: the abstract syntax tree (root on top, as in Intro (cont'd),
 * slide 4), the annotated tree with types, and the sentence-diagram style
 * parse tree of Intro (cont'd), structure with examples, slide 9 (words on
 * top, categories below, root at the bottom).
 */
import type { BinOp, Expr, Program, RelOp, Stmt } from './parser';
import type { TExpr, TStmt } from './semantic';

export type NodeTone = 'node' | 'leaf' | 'convert' | 'error' | 'category' | 'word';

export interface DisplayNode {
	label: string;
	/** Small text under the label, e.g. a type. */
	note?: string;
	tone: NodeTone;
	children: DisplayNode[];
}

const leaf = (label: string, tone: NodeTone = 'leaf', note?: string): DisplayNode => ({
	label,
	tone,
	children: [],
	...(note ? { note } : {})
});

// ---------------------------------------------------------------------------
// Abstract syntax tree
// ---------------------------------------------------------------------------

function astExpr(e: Expr): DisplayNode {
	if (e.kind === 'id') return leaf(e.name);
	if (e.kind === 'num') return leaf(e.text);
	return { label: e.op, tone: 'node', children: [astExpr(e.left), astExpr(e.right)] };
}

function astStmt(s: Stmt): DisplayNode {
	if (s.kind === 'assign')
		return { label: '=', tone: 'node', children: [leaf(s.target.name), astExpr(s.value)] };
	const cond: DisplayNode = {
		label: s.cond.op,
		tone: 'node',
		children: [astExpr(s.cond.left), astExpr(s.cond.right)]
	};
	return {
		label: 'if',
		tone: 'node',
		children: [cond, astStmt(s.then), ...(s.else ? [astStmt(s.else)] : [])]
	};
}

/** One tree per statement. */
export function astForest(p: Program): DisplayNode[] {
	return p.stmts.map(astStmt);
}

// ---------------------------------------------------------------------------
// Annotated abstract syntax tree
// ---------------------------------------------------------------------------

function typedExpr(e: TExpr): DisplayNode {
	switch (e.kind) {
		case 'id':
			if (e.error) return leaf(e.name, 'error', e.error);
			return leaf(e.name, 'leaf', e.constant !== null ? `${e.type} const` : (e.type ?? undefined));
		case 'num':
			return e.error ? leaf(e.text, 'error', e.error) : leaf(e.text, 'leaf', e.type);
		case 'int2fp':
			return { label: 'int2fp', note: 'float', tone: 'convert', children: [typedExpr(e.arg)] };
		case 'bin':
			return {
				label: e.op,
				tone: 'node',
				children: [typedExpr(e.left), typedExpr(e.right)],
				...(e.type ? { note: e.type } : {})
			};
	}
}

function typedStmt(s: TStmt): DisplayNode {
	if (s.kind === 'assign') {
		const t = s.target;
		const target = t.error
			? leaf(t.name, 'error', t.error)
			: leaf(t.name, 'leaf', t.type ?? undefined);
		return {
			label: '=',
			tone: s.error ? 'error' : 'node',
			children: [target, typedExpr(s.value)],
			...(s.error ? { note: s.error } : t.type ? { note: t.type } : {})
		};
	}
	const cond: DisplayNode = {
		label: s.cond.op,
		tone: 'node',
		children: [typedExpr(s.cond.left), typedExpr(s.cond.right)],
		...(s.cond.operandType ? { note: 'bool' } : {})
	};
	return {
		label: 'if',
		tone: 'node',
		children: [cond, typedStmt(s.then), ...(s.else ? [typedStmt(s.else)] : [])]
	};
}

export function annotatedForest(stmts: readonly TStmt[]): DisplayNode[] {
	return stmts.map(typedStmt);
}

// ---------------------------------------------------------------------------
// Parse diagram (words on top, root at the bottom)
// ---------------------------------------------------------------------------

export const OP_CATEGORY: Record<BinOp, string> = {
	'+': 'plus',
	'-': 'minus',
	'*': 'times',
	'/': 'over'
};

export const REL_CATEGORY: Record<RelOp, string> = {
	'==': 'equal',
	'!=': 'not-equal',
	'<': 'less',
	'<=': 'less-equal',
	'>': 'greater',
	'>=': 'greater-equal'
};

const word = (text: string) => leaf(text, 'word');
const category = (label: string, children: DisplayNode[]): DisplayNode => ({
	label,
	tone: 'category',
	children
});

/** The items an expression contributes to its parent: a word or a category, in parentheses as written. */
function diagramExpr(e: Expr): DisplayNode[] {
	const open = Array.from({ length: e.parens }, () => word('('));
	const close = Array.from({ length: e.parens }, () => word(')'));
	let core: DisplayNode;
	if (e.kind === 'id') core = word(e.name);
	else if (e.kind === 'num') core = word(e.text);
	else
		core = category(OP_CATEGORY[e.op], [
			...diagramExpr(e.left),
			word(e.op),
			...diagramExpr(e.right)
		]);
	return [...open, core, ...close];
}

function diagramStmt(s: Stmt): DisplayNode {
	if (s.kind === 'assign')
		return category('assign', [word(s.target.name), word('='), ...diagramExpr(s.value)]);
	const cond = category(REL_CATEGORY[s.cond.op], [
		...diagramExpr(s.cond.left),
		word(s.cond.op),
		...diagramExpr(s.cond.right)
	]);
	return category(s.else ? 'if-then-else' : 'if-then', [
		category('predicate', [cond]),
		category('then-stmt', [diagramStmt(s.then)]),
		...(s.else ? [category('else-stmt', [diagramStmt(s.else)])] : [])
	]);
}

/**
 * As on the slide, the diagram shows the words of expressions and assignments;
 * the keywords and semicolons are left out.
 */
export function parseDiagram(p: Program): DisplayNode[] {
	return p.stmts.map(diagramStmt);
}

// ---------------------------------------------------------------------------

/** Linear text of a tree for screen readers: `= (A, + (B1, C))`. */
export function treeText(n: DisplayNode): string {
	const self = n.note ? `${n.label} [${n.note}]` : n.label;
	if (n.children.length === 0) return self;
	return `${self} (${n.children.map(treeText).join(', ')})`;
}

export function countNodes(nodes: readonly DisplayNode[]): number {
	let n = 0;
	const visit = (x: DisplayNode) => {
		n++;
		x.children.forEach(visit);
	};
	nodes.forEach(visit);
	return n;
}
