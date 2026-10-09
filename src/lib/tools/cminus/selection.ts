/**
 * One piece of the program followed through every phase.
 *
 * The selection is a range of the source text. From it and a `Compilation`
 * this module works out what belongs to the range in every phase, with the
 * maps the engine keeps:
 *
 *   tokens         the tokens whose text lies in the range
 *   AST nodes      the nodes whose text lies in the range
 *   quads          the quads generated from those nodes (`Quad.node`), and the
 *                  quads of a head that lies in the range: the jumps and labels
 *                  of `if ( … )` and `while ( … )`, the `begin` of a function
 *                  header, the `end` of its closing brace (`Quad.span`)
 *   instructions   the instructions generated from those quads
 *                  (`TmInstruction.quad`)
 *
 * and, the other way round, the range that a click on a token, a node, a
 * symbol, a quad, an instruction or a caret position stands for. Pure: no
 * DOM, no Svelte.
 */
import {
	walk,
	type AstNode,
	type Compilation,
	type Program,
	type Quad,
	type SourceSpan,
	type SymbolInfo,
	type TmCode
} from '$lib/theory/cminus';

/** A range `[start, end)` of the source text. */
export interface SourceRange {
	start: number;
	end: number;
}

export interface SelectionMarks {
	/** Indices in `scan.tokens`. */
	tokens: ReadonlySet<number>;
	/** Indices in `scan.trivia` of the comments in the range. */
	comments: ReadonlySet<number>;
	/** Ids of AST nodes. */
	nodes: ReadonlySet<number>;
	/** Indices in `ir.quads`, the quads as generated. */
	quads: ReadonlySet<number>;
	/** Indices in `optimized.program.quads`; empty when the optimizer did not run. */
	optimized: ReadonlySet<number>;
	/** Addresses in `codegen.code`, the code before the peephole pass. */
	code: ReadonlySet<number>;
	/** Addresses in `codegen.peephole.code`, the code that runs. */
	final: ReadonlySet<number>;
}

const EMPTY: ReadonlySet<number> = new Set();

/** Nothing selected. */
export const NO_MARKS: SelectionMarks = {
	tokens: EMPTY,
	comments: EMPTY,
	nodes: EMPTY,
	quads: EMPTY,
	optimized: EMPTY,
	code: EMPTY,
	final: EMPTY
};

/** True when `span` is not empty and lies inside `range`. */
export function within(span: SourceRange | null | undefined, range: SourceRange): boolean {
	return !!span && span.end > span.start && span.start >= range.start && span.end <= range.end;
}

const covers = (outer: SourceRange, inner: SourceRange) =>
	outer.start <= inner.start && inner.end <= outer.end;

export const rangeOf = (span: SourceRange): SourceRange => ({ start: span.start, end: span.end });

export function sameRange(a: SourceRange | null, b: SourceRange | null): boolean {
	return a === null || b === null ? a === b : a.start === b.start && a.end === b.end;
}

// --- The tree, indexed once per program -----------------------------------

interface TreeIndex {
	/** Preorder: `nodes[id].id === id`. */
	nodes: AstNode[];
	/** `parent[id]`, −1 for the root. */
	parent: Int32Array;
}

const indexes = new WeakMap<Program, TreeIndex>();

function indexOf(program: Program): TreeIndex {
	let index = indexes.get(program);
	if (!index) {
		const nodes: AstNode[] = [];
		const parents: number[] = [];
		walk(program, (node, _depth, parent) => {
			nodes[node.id] = node;
			parents[node.id] = parent ? parent.id : -1;
		});
		index = { nodes, parent: Int32Array.from(parents) };
		indexes.set(program, index);
	}
	return index;
}

/** The node with the given id, or undefined. */
export function nodeById(program: Program, id: number): AstNode | undefined {
	return indexOf(program).nodes[id];
}

/** Ids of the nodes above `id`, the root first. Empty for the root and for an unknown id. */
export function ancestorsOf(program: Program, id: number): number[] {
	const { parent } = indexOf(program);
	const out: number[] = [];
	for (let p = parent[id] ?? -1; p >= 0; p = parent[p]) out.unshift(p);
	return out;
}

/** The innermost node whose text contains the whole range, or null. */
export function enclosingNode(program: Program, range: SourceRange): AstNode | null {
	let best: AstNode | null = null;
	// Preorder: a node comes after the nodes around it, so the last match is the innermost.
	for (const node of indexOf(program).nodes) if (covers(node.span, range)) best = node;
	return best;
}

// --- From a range to what belongs to it -------------------------------------

function quadMarks(
	quads: readonly Quad[] | undefined,
	nodes: ReadonlySet<number>,
	range: SourceRange
): Set<number> {
	const out = new Set<number>();
	quads?.forEach((q, i) => {
		if ((q.node !== null && nodes.has(q.node)) || within(q.span, range)) out.add(i);
	});
	return out;
}

function codeMarks(code: TmCode | undefined, quads: ReadonlySet<number>): Set<number> {
	const out = new Set<number>();
	for (const i of code?.instructions ?? [])
		if (i.quad !== null && quads.has(i.quad)) out.add(i.addr);
	return out;
}

/** What belongs to `range` in every phase the compilation reached. */
export function marksFor(c: Compilation | null, range: SourceRange | null): SelectionMarks {
	if (!c || !range || range.end <= range.start) return NO_MARKS;

	const tokens = new Set<number>();
	c.scan.tokens.forEach((t, i) => {
		if (within(t.span, range)) tokens.add(i);
	});
	const comments = new Set<number>();
	c.scan.trivia.forEach((t, i) => {
		if (t.kind === 'comment' && within(t.span, range)) comments.add(i);
	});

	const nodes = new Set<number>();
	if (c.parse)
		for (const n of indexOf(c.parse.program).nodes) if (within(n.span, range)) nodes.add(n.id);

	const quads = quadMarks(c.ir?.quads, nodes, range);
	const optimized = quadMarks(c.optimized?.program.quads, nodes, range);
	// The code was generated from the optimized quads when the optimizer ran.
	const source = c.optimized ? optimized : quads;
	return {
		tokens,
		comments,
		nodes,
		quads,
		optimized,
		code: codeMarks(c.codegen?.code, source),
		final: codeMarks(c.codegen?.peephole.code, source)
	};
}

// --- From a click to a range -----------------------------------------------

/** The range of a use of a name: the variable, the subscripted element or the call it is part of. */
export function rangeOfUse(c: Compilation, use: SourceRange): SourceRange {
	const node = c.parse ? enclosingNode(c.parse.program, use) : null;
	return rangeOf(node && node.kind !== 'Program' ? node.span : use);
}

/**
 * The range of a symbol's declaration: `int x;`, a parameter, or the header
 * of a function. Null for input and output, which the program does not
 * declare.
 */
export function rangeOfDeclaration(c: Compilation, symbol: SymbolInfo): SourceRange | null {
	if (!symbol.declSpan) return null;
	const node =
		symbol.node !== null && c.parse ? indexOf(c.parse.program).nodes[symbol.node] : undefined;
	if (!node) return rangeOf(symbol.declSpan);
	return rangeOf(node.kind === 'FunDecl' ? node.headSpan : node.span);
}

const touches = (span: SourceRange, offset: number) => span.start <= offset && offset <= span.end;

/**
 * The piece of the program a caret at `offset` stands in: the statement or
 * declaration around it; for `if` and `while` the head (or the `else`); in a
 * function header the header; on the closing brace of a function that brace.
 * Null between declarations, on a blank line and in a comment.
 */
export function pieceAt(program: Program, offset: number): SourceRange | null {
	const { nodes, parent } = indexOf(program);
	let at = -1;
	for (const node of nodes) if (touches(node.span, offset)) at = node.id;
	for (let id = at; id >= 0; id = parent[id]) {
		const node = nodes[id];
		switch (node.kind) {
			case 'ExprStmt':
			case 'Return':
			case 'VarDecl':
				return rangeOf(node.span);
			case 'If':
				return rangeOf(
					node.elseSpan && touches(node.elseSpan, offset) ? node.elseSpan : node.headSpan
				);
			case 'While':
			case 'FunDecl':
				return rangeOf(node.headSpan);
			case 'Compound': {
				const owner = parent[id] >= 0 ? nodes[parent[id]] : null;
				return owner?.kind === 'FunDecl' && touches(node.closeSpan, offset)
					? rangeOf(node.closeSpan)
					: null;
			}
			case 'Program':
				return null;
			default:
			// An expression or a parameter: the statement or header around it decides.
		}
	}
	return null;
}

const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

/** The range without the white space at its two ends; null when nothing is left. */
export function trimRange(source: string, range: SourceRange): SourceRange | null {
	let start = Math.max(0, Math.min(range.start, source.length));
	let end = Math.max(start, Math.min(range.end, source.length));
	while (start < end && isSpace(source[start])) start++;
	while (end > start && isSpace(source[end - 1])) end--;
	return end > start ? { start, end } : null;
}

/**
 * The range a caret (or a stretch of selected text) in the editor stands for.
 * Selected text is the range itself, without white space at its ends. A caret
 * is the piece of the program around it (`pieceAt`), or the token it touches
 * when there is no such piece (or no tree). Null when nothing is there.
 */
export function rangeOfCaret(c: Compilation, start: number, end: number): SourceRange | null {
	if (end > start) return trimRange(c.source, { start, end });
	const piece = c.parse ? pieceAt(c.parse.program, start) : null;
	if (piece) return piece;
	// The token that starts at the caret wins over the one that ends there.
	let found: SourceSpan | null = null;
	for (const t of c.scan.tokens) {
		if (t.type === 'ENDFILE' || !touches(t.span, start)) continue;
		found = t.span;
		if (t.span.start === start) break;
	}
	return found ? rangeOf(found) : null;
}

// --- The selection in words -------------------------------------------------

export interface SelectionSummary {
	/** "Line 7" or "Lines 7–9". */
	where: string;
	/** The selected text on one line, shortened when long. */
	text: string;
	/** "6 tokens", "4 nodes", "2 quads", "7 instructions": one per phase reached. */
	counts: string[];
	/** Everything in one sentence, for screen readers. */
	sentence: string;
}

const EXCERPT = 48;

export function plural(n: number, noun: string, many = `${noun}s`): string {
	return `${n.toLocaleString('en-US')} ${n === 1 ? noun : many}`;
}

/** 1-based line of an offset of the source. */
export function lineAt(source: string, offset: number): number {
	let line = 1;
	for (let i = source.indexOf('\n'); i !== -1 && i < offset; i = source.indexOf('\n', i + 1))
		line++;
	return line;
}

/** The selected text on one line: runs of white space become one space; long text is cut. */
export function excerpt(source: string, range: SourceRange, max = EXCERPT): string {
	const text = source.slice(range.start, range.end).replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * "Line 7: x = x - 1; — 6 tokens, 4 nodes, 2 quads, 7 instructions". The
 * quads and instructions counted are the ones the program runs with; where
 * the optimizer or the peephole pass changed the number, the count from
 * before is added.
 */
export function describeSelection(
	c: Compilation,
	range: SourceRange,
	marks: SelectionMarks = marksFor(c, range)
): SelectionSummary {
	const first = lineAt(c.source, range.start);
	const last = lineAt(c.source, Math.max(range.start, range.end - 1));
	const where = first === last ? `Line ${first}` : `Lines ${first}–${last}`;
	const text = excerpt(c.source, range);

	const counts = [plural(marks.tokens.size, 'token')];
	if (c.parse) counts.push(plural(marks.nodes.size, 'node'));
	if (c.ir) {
		const final = c.optimized ? marks.optimized.size : marks.quads.size;
		const before = final === marks.quads.size ? '' : ` (${marks.quads.size} before optimization)`;
		counts.push(plural(final, 'quad') + before);
	}
	if (c.codegen) {
		const before =
			marks.final.size === marks.code.size ? '' : ` (${marks.code.size} before the peephole pass)`;
		counts.push(plural(marks.final.size, 'instruction') + before);
	}
	return { where, text, counts, sentence: `${where}: ${text} — ${counts.join(', ')}` };
}
