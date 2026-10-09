/**
 * View models of the C- Compiler page: what each panel shows, worked out from
 * a `Compilation` (and the selection). Pure, so the specs cover them and the
 * components only render.
 */
import type { HighlightToken } from '$lib/components/ui/types';
import { pathKey } from '$lib/components/grammar/tree-layout';
import { formatString } from '$lib/theory/chars';
import {
	FP,
	GP,
	KEYWORDS,
	PHASES,
	astLines,
	childrenOf,
	nodeLabel,
	quadColumns,
	quadText,
	registerName,
	scan,
	typeText,
	walk,
	type AstLine,
	type AstNode,
	type CType,
	type CodegenResult,
	type Compilation,
	type FrameLayout,
	type GlobalLayout,
	type IdentifierMode,
	type IrProgram,
	type OptimizePass,
	type OptimizeResult,
	type Phase,
	type PhaseDiagnostic,
	type Program,
	type QuadField,
	type ScanResult,
	type SourceSpan,
	type StopReason,
	type TmCode,
	type TokenType
} from '$lib/theory/cminus';
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { ParseNode } from '$lib/theory/grammar/types';
import { opClass } from '$lib/tools/tiny-vm/machine';
import {
	ancestorsOf,
	enclosingNode,
	lineAt,
	nodeById,
	plural,
	rangeOf,
	rangeOfDeclaration,
	type SourceRange
} from './selection';
import type { TabId, Version } from './state';
import type { RunOutput } from './tasks';

// ---------------------------------------------------------------------------
// Phases and the strip across the top
// ---------------------------------------------------------------------------

/** The name of each phase, as on the "7 Phases of a Compiler" slide. */
export const PHASE_NAME: Record<Phase, string> = {
	scanner: 'Scanner',
	parser: 'Parser',
	semantic: 'Semantic analyzer',
	ir: 'Intermediate code generator',
	optimizer: 'Optimizer',
	codegen: 'Code generator'
};

/** The tab that shows a phase's result. */
export const PHASE_TAB: Record<Phase, TabId> = {
	scanner: 'tokens',
	parser: 'syntax',
	semantic: 'semantics',
	ir: 'ir',
	optimizer: 'ir',
	codegen: 'code'
};

export const TAB_LABEL: Record<TabId, string> = {
	tokens: 'Tokens',
	syntax: 'Syntax tree',
	semantics: 'Semantics',
	ir: 'Intermediate code',
	code: 'Target code',
	run: 'Run',
	language: 'Language'
};

export type StageId =
	'scanner' | 'parser' | 'semantic' | 'icg' | 'optimizer' | 'codegen' | 'peephole' | 'machine';

/**
 * `done`: it produced its result. `failed`: it reported errors. `paused`: the
 * run stopped before the end of the program. `off`: switched off.
 * `not-reached`: an earlier stage failed. `idle`: nothing to report yet.
 */
export type StageStatus = 'done' | 'failed' | 'paused' | 'off' | 'not-reached' | 'idle';

export interface StageView {
	id: StageId;
	/** The stage's name on the slide ("TINY Machine" for the run). */
	name: string;
	status: StageStatus;
	/** What it produced ("42 tokens"), its error count, "Off" or "Not reached". */
	text: string;
	/** The tab that shows it, and which of that tab's two versions. */
	tab: TabId;
	version?: Version;
}

interface StageInfo {
	id: StageId;
	name: string;
	tab: TabId;
	version?: Version;
}

/** Intro (cont’d): Compiler architecture, slide 4, then the machine that runs the result. */
export const STAGES: readonly StageInfo[] = [
	{ id: 'scanner', name: PHASE_NAME.scanner, tab: 'tokens' },
	{ id: 'parser', name: PHASE_NAME.parser, tab: 'syntax' },
	{ id: 'semantic', name: PHASE_NAME.semantic, tab: 'semantics' },
	{ id: 'icg', name: PHASE_NAME.ir, tab: 'ir', version: 'before' },
	{ id: 'optimizer', name: PHASE_NAME.optimizer, tab: 'ir', version: 'after' },
	{ id: 'codegen', name: PHASE_NAME.codegen, tab: 'code', version: 'before' },
	{ id: 'peephole', name: 'Peephole optimizer', tab: 'code', version: 'after' },
	{ id: 'machine', name: 'TINY Machine', tab: 'run' }
];

const NOT_REACHED = 'Not reached';
const MINUS = '−';

export const STOP_LABEL: Record<StopReason, string> = {
	halted: 'Halted',
	'input-exhausted': 'Waiting for input',
	'step-budget': 'Step budget used up',
	'memory-error': 'Memory error',
	'zero-divide': 'Division by zero',
	'negative-subscript': 'Negative subscript',
	'subscript-out-of-range': 'Subscript out of range'
};

const errorsOf = (c: Compilation, phase: Phase) =>
	c.diagnostics.filter((d) => d.phase === phase && d.severity === 'error').length;

/** Tokens without the closing ENDFILE. */
export function tokenCount(scanned: ScanResult): number {
	return scanned.tokens.filter((t) => t.type !== 'ENDFILE').length;
}

export function nodeCount(program: Program): number {
	return linesOf(program).length;
}

/** The symbols the program declares (input and output are predefined). */
export function declaredSymbols(c: Compilation): number {
	return c.semantic?.symbols.filter((s) => !s.builtin).length ?? 0;
}

function produced(c: Compilation, id: StageId): string {
	switch (id) {
		case 'scanner':
			return plural(tokenCount(c.scan), 'token');
		case 'parser':
			return `AST: ${plural(nodeCount(c.parse!.program), 'node')}`;
		case 'semantic': {
			const warnings = c.semantic!.diagnostics.filter((d) => d.severity === 'warning').length;
			const text = `${plural(c.semantic!.scopes.length, 'scope')}, ${plural(declaredSymbols(c), 'symbol')}`;
			return warnings ? `${text}, ${plural(warnings, 'warning')}` : text;
		}
		case 'icg':
			return plural(c.ir!.quads.length, 'quad');
		case 'optimizer': {
			const removed = c.optimized!.removed.length;
			if (removed) return `${MINUS}${plural(removed, 'quad')}`;
			const rewritten = c.optimized!.program.quads.filter((q) => q.changed?.length).length;
			return rewritten ? `${plural(rewritten, 'quad')} rewritten` : 'No change';
		}
		case 'codegen':
			return plural(c.codegen!.code.instructions.length, 'instruction');
		case 'peephole': {
			const removed = c.codegen!.peephole.changes.length;
			return removed ? `${MINUS}${plural(removed, 'instruction')}` : 'No change';
		}
		case 'machine':
			return '';
	}
}

/** The engine phase behind each stage of the strip (the last two come after every phase). */
const STAGE_PHASE: Record<StageId, Phase | null> = {
	scanner: 'scanner',
	parser: 'parser',
	semantic: 'semantic',
	icg: 'ir',
	optimizer: 'optimizer',
	codegen: 'codegen',
	peephole: null,
	machine: null
};

function machineStage(run: RunOutput | null): Pick<StageView, 'status' | 'text'> {
	if (!run) return { status: 'idle', text: 'Not run yet' };
	if (run.stop === 'halted') {
		return { status: 'done', text: `Halted, ${plural(run.printed, 'number')} printed` };
	}
	const paused = run.stop === 'input-exhausted' || run.stop === 'step-budget';
	return { status: paused ? 'paused' : 'failed', text: STOP_LABEL[run.stop] };
}

/**
 * The stages of the strip with what each produced. Stages after the first one
 * that failed are not reached. `run` is the newest run of the compiled
 * program, or null.
 */
export function stageViews(c: Compilation | null, run: RunOutput | null): StageView[] {
	const stopped = c?.stoppedAt ? PHASES.indexOf(c.stoppedAt) : Infinity;
	return STAGES.map((stage): StageView => {
		const view = (status: StageStatus, text: string): StageView => ({ ...stage, status, text });
		if (!c) return view('idle', 'Not compiled');
		if (stage.id === 'optimizer' && !c.options.optimize) return view('off', 'Off');
		const phase = STAGE_PHASE[stage.id];
		const at = phase ? PHASES.indexOf(phase) : PHASES.length;
		if (at > stopped) return view('not-reached', NOT_REACHED);
		if (at === stopped) return view('failed', plural(errorsOf(c, phase!), 'error'));
		if (stage.id === 'machine') {
			const m = machineStage(run);
			return view(m.status, m.text);
		}
		return view('done', produced(c, stage.id));
	});
}

/**
 * The version of the three-address code on display. Without the optimizer
 * there is one version only, the code as generated, whichever version was
 * chosen while the optimizer was on.
 */
export function irVersionShown(c: Compilation | null, chosen: Version): Version {
	return c && !c.options.optimize ? 'before' : chosen;
}

/**
 * The stage a tab shows, given the version each of the two-version tabs has
 * on display (`irVersionShown` for the three-address code); null for the
 * Language tab.
 */
export function stageOfTab(tab: TabId, ir: Version, code: Version): StageId | null {
	const version = tab === 'ir' ? ir : tab === 'code' ? code : undefined;
	return STAGES.find((s) => s.tab === tab && s.version === version)?.id ?? null;
}

/** What a tab needs from the compilation before it has something to show. */
const READY: Record<TabId, (c: Compilation) => boolean> = {
	tokens: () => true,
	syntax: (c) => c.parse !== null,
	semantics: (c) => c.semantic !== null,
	ir: (c) => c.ir !== null,
	code: (c) => c.codegen !== null,
	run: (c) => c.stoppedAt === null,
	language: () => true
};

/** The phase whose errors keep a tab empty, or null when the tab has its content. */
export function blockedBy(c: Compilation, tab: TabId): Phase | null {
	return READY[tab](c) ? null : c.stoppedAt;
}

/** "The parser reported 2 errors and stopped the compilation." */
export function stoppedText(c: Compilation): string | null {
	if (!c.stoppedAt) return null;
	const name = PHASE_NAME[c.stoppedAt].toLowerCase();
	return `The ${name} reported ${plural(errorsOf(c, c.stoppedAt), 'error')} and stopped the compilation.`;
}

/** One sentence on how the compilation went, for the page's status line. */
export function statusText(c: Compilation | null): string {
	if (!c) return 'The program is not compiled.';
	return stoppedText(c) ?? 'The program compiled.';
}

export function phaseDiagnostics(c: Compilation, phase: Phase): PhaseDiagnostic[] {
	return c.diagnostics.filter((d) => d.phase === phase);
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

/** Class of the selected range in the editor (styled by the page). */
export const SELECTED_CLASS = 'cm-sel';
/** Class of the lines the selected range touches. */
export const SELECTED_LINE_CLASS = 'cm-sel-line';

const OPERATORS = new Set<TokenType>([
	'PLUS',
	'MINUS',
	'TIMES',
	'OVER',
	'LT',
	'LTE',
	'GT',
	'GTE',
	'EQ',
	'NEQ',
	'ASSIGN'
]);
const BRACKETS = new Set<TokenType>([
	'LPAREN',
	'RPAREN',
	'LBRACKET',
	'RBRACKET',
	'LBRACE',
	'RBRACE'
]);
const KEYWORD_TYPES = new Set<TokenType>(Object.values(KEYWORDS));

/** The `hl-*` class of a token type; null for ERROR and ENDFILE. */
export function tokenClass(type: TokenType): string | null {
	if (KEYWORD_TYPES.has(type)) return 'hl-keyword';
	if (type === 'ID') return 'hl-name';
	if (type === 'NUM') return 'hl-number';
	if (OPERATORS.has(type)) return 'hl-operator';
	if (BRACKETS.has(type)) return 'hl-paren';
	if (type === 'SEMI' || type === 'COMMA') return 'hl-punct';
	return null;
}

/**
 * Colors for the editor, from the scanner's tokens and trivia: keywords,
 * identifiers, numbers, symbols and comments. The selected range gets
 * `SELECTED_CLASS` on top (white space included).
 */
export function highlightSource(
	text: string,
	identifiers: IdentifierMode,
	selection: SourceRange | null = null
): HighlightToken[] {
	const scanned = scan(text, { identifiers });
	const pieces: HighlightToken[] = [];
	for (const t of scanned.trivia) {
		if (t.kind === 'comment') {
			pieces.push({ from: t.span.start, to: t.span.end, className: 'hl-comment' });
		}
	}
	for (const t of scanned.tokens) {
		const className = tokenClass(t.type);
		if (className) pieces.push({ from: t.span.start, to: t.span.end, className });
	}
	if (!selection || selection.end <= selection.start) return pieces;
	// Later ranges win: the plain mark first, then the colored text inside it again.
	const marked: HighlightToken[] = [
		{ from: selection.start, to: selection.end, className: SELECTED_CLASS }
	];
	for (const p of pieces) {
		const from = Math.max(p.from, selection.start);
		const to = Math.min(p.to, selection.end);
		if (to > from) marked.push({ from, to, className: `${p.className} ${SELECTED_CLASS}` });
	}
	return [...pieces, ...marked];
}

/** A class per line of `text` (index 0 = line 1): the lines the selection touches are marked. */
export function selectionLineClasses(
	text: string,
	selection: SourceRange | null
): (string | null)[] {
	if (!selection || selection.end <= selection.start) return [];
	const out: (string | null)[] = [];
	let start = 0;
	for (;;) {
		const newline = text.indexOf('\n', start);
		const end = newline === -1 ? text.length : newline;
		// A line is touched when the range and [start, end] share a character (or the range starts on an empty line).
		const touched = selection.start <= end && selection.end > start;
		out.push(touched ? SELECTED_LINE_CLASS : null);
		if (newline === -1) break;
		start = newline + 1;
	}
	return out;
}

/** Diagnostics the editor lists at most; the rest are counted in one closing note. */
export const MAX_EDITOR_DIAGNOSTICS = 50;

/**
 * The diagnostics of every phase for the editor, each message prefixed with
 * its phase. With `stale` (the compilation is for an earlier text) they are
 * listed but not placed: their offsets belong to the earlier text.
 */
export function editorDiagnostics(
	c: Compilation | null,
	opts: { stale?: boolean; limit?: number } = {}
): Diagnostic[] {
	if (!c) return [];
	const limit = opts.limit ?? MAX_EDITOR_DIAGNOSTICS;
	const out: Diagnostic[] = c.diagnostics.slice(0, limit).map((d) => ({
		severity: d.severity,
		message: `${PHASE_NAME[d.phase]}: ${d.message}`,
		span: opts.stale ? { ...d.span, source: 'stale' } : d.span
	}));
	const more = c.diagnostics.length - out.length;
	if (more > 0)
		out.push({ severity: 'info', message: `${plural(more, 'more message')} not listed.` });
	return out;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export interface TokenRow {
	kind: 'token' | 'comment';
	/** Index in `scan.tokens`, or in `scan.trivia` for a comment. */
	index: number;
	line: number;
	column: number;
	/** Token type in the course's upper-case names; "comment" for a comment. */
	type: string;
	/** The characters, quoted; long text is shortened. */
	lexeme: string;
	/** The value of a NUM; '' otherwise. */
	value: string;
	error: boolean;
	/** The closing ENDFILE token. */
	end: boolean;
	span: SourceSpan;
}

const LEXEME_MAX = 40;

function shownLexeme(text: string): string {
	const oneLine = text.length > LEXEME_MAX ? `${text.slice(0, LEXEME_MAX - 1)}…` : text;
	return formatString(oneLine);
}

/** The rows of the token table, in source order; with `comments` the comments are listed too. */
export function tokenRows(scanned: ScanResult, opts: { comments?: boolean } = {}): TokenRow[] {
	const rows: TokenRow[] = scanned.tokens.map((t, index) => ({
		kind: 'token',
		index,
		line: t.span.line,
		column: t.span.column,
		type: t.type,
		lexeme: shownLexeme(t.lexeme),
		value: t.type === 'NUM' && t.value !== undefined ? String(t.value) : '',
		error: t.type === 'ERROR',
		end: t.type === 'ENDFILE',
		span: t.span
	}));
	if (!opts.comments) return rows;
	scanned.trivia.forEach((t, index) => {
		if (t.kind !== 'comment') return;
		rows.push({
			kind: 'comment',
			index,
			line: t.span.line,
			column: t.span.column,
			type: 'comment',
			lexeme: shownLexeme(t.text),
			value: '',
			error: false,
			end: false,
			span: t.span
		});
	});
	// Tokens and trivia never overlap, so the start offset orders them (ENDFILE stays last).
	return rows.sort((a, b) => a.span.start - b.span.start || Number(a.end) - Number(b.end));
}

// ---------------------------------------------------------------------------
// The syntax tree
// ---------------------------------------------------------------------------

const lineCache = new WeakMap<Program, AstLine[]>();

function linesOf(program: Program): AstLine[] {
	let lines = lineCache.get(program);
	if (!lines) {
		lines = astLines(program);
		lineCache.set(program, lines);
	}
	return lines;
}

export interface OutlineRow {
	/** Id of the AST node. */
	id: number;
	depth: number;
	/** "Binary +", "Var x". */
	label: string;
	/** Source line of the node's first character. */
	line: number;
	span: SourceSpan;
	hasChildren: boolean;
	/** False for a node whose children are folded away. */
	expanded: boolean;
	/** The type of an expression node, when types are asked for and known. */
	type: string | null;
}

/**
 * The AST as an outline: one row per node in preorder, without the rows
 * under a collapsed node. With `types`, expression nodes carry their type.
 */
export function outlineRows(
	program: Program,
	collapsed: ReadonlySet<number> = new Set(),
	types?: ReadonlyMap<number, CType>
): OutlineRow[] {
	const lines = linesOf(program);
	const rows: OutlineRow[] = [];
	/** Depth of the collapsed node whose subtree is being skipped. */
	let hidden = Infinity;
	lines.forEach((line, i) => {
		if (line.depth > hidden) return;
		hidden = Infinity;
		const hasChildren = i + 1 < lines.length && lines[i + 1].depth > line.depth;
		const expanded = hasChildren && !collapsed.has(line.id);
		if (hasChildren && !expanded) hidden = line.depth;
		const type = types?.get(line.id);
		rows.push({
			id: line.id,
			depth: line.depth,
			label: line.label,
			line: line.span.line,
			span: line.span,
			hasChildren,
			expanded,
			type: type ? typeText(type) : null
		});
	});
	return rows;
}

/** The collapsed ids that still name a node with children in `program`. */
export function keepCollapsed(collapsed: ReadonlySet<number>, program: Program): Set<number> {
	const lines = linesOf(program);
	const out = new Set<number>();
	for (const id of collapsed) {
		if (id + 1 < lines.length && lines[id + 1].depth > lines[id].depth) out.add(id);
	}
	return out;
}

/** Programs up to this many nodes are drawn whole. */
export const SMALL_TREE = 48;
/** No tree larger than this is drawn. */
export const MAX_DRAWN = 300;

export interface Drawing {
	/** The node at the root of the drawing. */
	root: AstNode;
	/** What is drawn: "The whole program", "Function gcd", "The statement on line 9". */
	caption: string;
	/** Nodes under the root, itself included. */
	size: number;
	/** The subtree as a tree to draw; null when it is larger than `MAX_DRAWN`. */
	tree: ParseNode | null;
	/** Path in `tree` (as `pathKey`) → id of the AST node there. */
	ids: Map<string, number>;
	/** Id of an AST node in the drawing → its path in `tree`. */
	paths: Map<number, number[]>;
}

function sizeOf(node: AstNode): number {
	let n = 0;
	walk(node, () => n++);
	return n;
}

const STATEMENT_KINDS = new Set(['Compound', 'If', 'While', 'Return', 'ExprStmt', 'VarDecl']);

function captionOf(node: AstNode): string {
	if (node.kind === 'Program') return 'The whole program';
	if (node.kind === 'FunDecl') return `Function ${node.name}`;
	const what =
		node.kind === 'VarDecl' ? 'declaration' : node.kind === 'Compound' ? 'block' : 'statement';
	return `The ${what} on line ${node.span.line}`;
}

/**
 * The node the tree drawing starts at. With a selection it is the statement,
 * declaration or function around the selected text (the whole program when
 * the text spans functions). Without one, a small program is drawn whole and
 * of a larger one its last function (main).
 */
export function drawnRoot(program: Program, selection: SourceRange | null): AstNode {
	if (!selection) {
		if (nodeCount(program) <= SMALL_TREE) return program;
		return program.decls[program.decls.length - 1] ?? program;
	}
	const inner = enclosingNode(program, selection);
	if (!inner) return program;
	// Up from the innermost node to the statement, declaration or function it is part of.
	const chain = [...ancestorsOf(program, inner.id), inner.id];
	for (let i = chain.length - 1; i >= 0; i--) {
		const node = nodeById(program, chain[i]);
		if (node && (STATEMENT_KINDS.has(node.kind) || node.kind === 'FunDecl')) return node;
	}
	return program;
}

/** The subtree under `root` as a tree to draw, with the maps between its paths and node ids. */
export function drawingOf(root: AstNode): Drawing {
	const size = sizeOf(root);
	const ids = new Map<string, number>();
	const paths = new Map<number, number[]>();
	if (size > MAX_DRAWN) return { root, caption: captionOf(root), size, tree: null, ids, paths };
	const build = (node: AstNode, path: number[]): ParseNode => {
		ids.set(pathKey(path), node.id);
		paths.set(node.id, path);
		const children = childrenOf(node).map((child, i) => build(child, [...path, i]));
		return { symbol: nodeLabel(node), terminal: children.length === 0, children };
	};
	return { root, caption: captionOf(root), size, tree: build(root, []), ids, paths };
}

// ---------------------------------------------------------------------------
// Scopes and symbol tables
// ---------------------------------------------------------------------------

export interface SymbolPlace {
	line: number;
	/** The name, where it is written. */
	span: SourceRange;
}

export interface SymbolDeclaration extends SymbolPlace {
	/** What choosing the declaration selects: `int x;`, a parameter, a function header. */
	range: SourceRange;
}

export interface SymbolRow {
	id: number;
	name: string;
	/** "variable", "array", "function", "parameter", "array parameter". */
	kind: string;
	/** "int", "int[10]", "(int, int) → int". */
	type: string;
	/** Where it is declared; null for input and output. */
	declared: SymbolDeclaration | null;
	/**
	 * Where it is used. Choosing a use selects `rangeOfUse` of its span, which
	 * is worked out when the use is chosen: a name can be used thousands of
	 * times, and a table lists the first few.
	 */
	uses: SymbolPlace[];
	/** "0(gp)", "-2(fp)", "-11(fp), 10 cells"; "—" for a function. */
	storage: string;
	builtin: boolean;
}

export interface ScopeView {
	id: number;
	kind: 'global' | 'function' | 'block';
	/** "global", "gcd", "main.1". */
	name: string;
	/** "Global scope", "Function gcd", "Block main.1". */
	title: string;
	depth: number;
	/** The text the scope covers; null for the global scope. */
	range: SourceRange | null;
	/** "lines 5–10"; '' for the global scope. */
	lines: string;
	symbols: SymbolRow[];
}

const KIND_WORDS = {
	variable: 'variable',
	array: 'array',
	function: 'function',
	parameter: 'parameter',
	'array-parameter': 'array parameter'
} as const;

function linesText(source: string, span: SourceSpan): string {
	const last = lineAt(source, Math.max(span.start, span.end - 1));
	return span.line === last ? `line ${span.line}` : `lines ${span.line}–${last}`;
}

/** The scopes in tree order (global, each function, its nested blocks), each with its symbol table. */
export function scopeViews(c: Compilation): ScopeView[] {
	const semantic = c.semantic;
	if (!semantic) return [];
	const out: ScopeView[] = [];
	const visit = (id: number) => {
		const scope = semantic.scopes[id];
		const symbols = scope.symbols.map((sid): SymbolRow => {
			const s = semantic.symbols[sid];
			const declRange = rangeOfDeclaration(c, s);
			let storage = '—';
			if (s.location) {
				storage = `${s.location.offset}(${s.location.base})`;
				if (s.kind === 'array') storage += `, ${plural(s.size ?? 1, 'cell')}`;
				else if (s.kind === 'array-parameter') storage += ', holds an address';
			}
			return {
				id: s.id,
				name: s.name,
				kind: KIND_WORDS[s.kind],
				type: s.kind === 'array' && s.size !== null ? `int[${s.size}]` : typeText(s.type),
				declared:
					s.declSpan && declRange
						? { line: s.declSpan.line, span: rangeOf(s.declSpan), range: declRange }
						: null,
				uses: s.uses.map((use) => ({ line: use.line, span: rangeOf(use) })),
				storage,
				builtin: s.builtin
			};
		});
		out.push({
			id: scope.id,
			kind: scope.kind,
			name: scope.name,
			title:
				scope.kind === 'global'
					? 'Global scope'
					: `${scope.kind === 'function' ? 'Function' : 'Block'} ${scope.name}`,
			depth: scope.depth,
			range: scope.span ? rangeOf(scope.span) : null,
			lines: scope.span ? linesText(c.source, scope.span) : '',
			symbols
		});
		scope.children.forEach(visit);
	};
	if (semantic.scopes.length) visit(0);
	return out;
}

// ---------------------------------------------------------------------------
// Three-address code
// ---------------------------------------------------------------------------

export interface QuadRow {
	/** Index in the list of quads shown. */
	index: number;
	/** `Quad.id`: its number in the code as generated. */
	id: number;
	/** op, arg1, arg2, result. */
	columns: [string, string, string, string];
	/** The one-line form: "t1 := x + 1". */
	text: string;
	/** Fields the optimizer rewrote (the optimized code only). */
	changed: readonly QuadField[];
	/** In the code as generated: what the optimizer does with the quad. */
	fate: 'kept' | 'removed' | 'rewritten';
	span: SourceSpan | null;
}

export interface QuadGroup {
	/** Name of the function. */
	name: string;
	rows: QuadRow[];
}

/**
 * The quads per function. For the code as generated, pass the optimizer's
 * result to get each quad's fate.
 */
export function quadGroups(program: IrProgram, optimized?: OptimizeResult | null): QuadGroup[] {
	const removed = new Set(optimized?.removed ?? []);
	const rewritten = new Set<number>();
	for (const q of optimized?.program.quads ?? []) if (q.changed?.length) rewritten.add(q.id);
	return program.functions.map((f) => ({
		name: f.name,
		rows: program.quads.slice(f.from, f.to).map((q, k): QuadRow => ({
			index: f.from + k,
			id: q.id,
			columns: quadColumns(q),
			text: quadText(q),
			changed: q.changed ?? [],
			fate: removed.has(q.id) ? 'removed' : rewritten.has(q.id) ? 'rewritten' : 'kept',
			span: q.span
		}))
	}));
}

/** What each pass of the optimizer is called in the log. */
export const PASS_NAME: Record<OptimizePass, string> = {
	constant: 'Constant propagation',
	copy: 'Copy propagation',
	fold: 'Constant folding',
	identity: 'Algebraic identity',
	branch: 'Branch on a constant',
	retarget: 'Result stored directly',
	'dead-temp': 'Unused temporary',
	jump: 'Jump to the next quad',
	label: 'Unused label',
	keep: 'Left as it is'
};

export interface LogRow {
	round: number;
	pass: string;
	function: string;
	/** `Quad.id` of the quad concerned. */
	quad: number;
	before: string;
	/** The quad after the change; null when it was removed. */
	after: string | null;
	text: string;
	/** The source text the quad came from. */
	span: SourceSpan | null;
}

export function logRows(c: Compilation): LogRow[] {
	if (!c.optimized || !c.ir) return [];
	const quads = c.ir.quads;
	return c.optimized.log.map((e) => ({
		round: e.round,
		pass: PASS_NAME[e.pass],
		function: e.function,
		quad: e.quad,
		before: e.before,
		after: e.after,
		text: e.text,
		span: quads[e.quad]?.span ?? null
	}));
}

// ---------------------------------------------------------------------------
// TINY Machine code
// ---------------------------------------------------------------------------

export interface ListingComment {
	kind: 'comment';
	text: string;
}

export interface ListingInstruction {
	kind: 'instruction';
	addr: number;
	/** "LD". */
	op: string;
	/** "0,-4(5)". */
	operands: string;
	comment: string;
	/** The source text of the quad it implements; null in the prelude and the built-ins. */
	span: SourceSpan | null;
	/** Before the peephole pass: why that pass removes the instruction; null when it stays. */
	dropped: string | null;
}

export type ListingRow = ListingComment | ListingInstruction;

export interface ListingSection {
	/**
	 * Tells the sections of one listing apart: the section's place in the
	 * listing. (A name does not: a C- function can be called "prelude".)
	 */
	key: string;
	/** The function whose code the section holds; null for the prelude. */
	function: string | null;
	/** "Prelude", "input", "gcd". */
	title: string;
	/** "addresses 14–47". */
	addresses: string;
	/** The function's activation record; null for the prelude. */
	frame: FrameLayout | null;
	rows: ListingRow[];
	/** Instructions in the section. */
	count: number;
}

const BUILTIN_HEAD: Record<string, string> = {
	input: 'int input(void)',
	output: 'void output(int x)'
};

/** Index of the header line that opens the code of function `name` (0 when there is none). */
function ownHeaderStart(header: readonly string[], name: string | null): number {
	if (name === null) return 0;
	const i = header.findIndex(
		(line) => line === BUILTIN_HEAD[name] || line.startsWith(`function ${name}:`)
	);
	return Math.max(0, i);
}

function operandsOf(code: TmCode, addr: number): string {
	const { op, a1, a2, a3 } = code.instructions[addr].instr;
	return opClass(op) === 'RR' ? `${a1},${a2},${a3}` : `${a1},${a2}(${a3})`;
}

/** The comment lines the listing prints after the last instruction. */
function trailerOf(code: TmCode): string[] {
	const last = code.instructions[code.instructions.length - 1];
	if (!last) return [];
	return code.listing
		.split('\n')
		.slice(last.line)
		.map((line) => line.replace(/^\* ?/, ''));
}

/**
 * The listing in sections: the prelude, input, output, then each function,
 * with its comment lines and its activation record. `version` picks the code
 * before or after the peephole pass.
 */
export function listingSections(codegen: CodegenResult, version: Version): ListingSection[] {
	const code = version === 'before' ? codegen.code : codegen.peephole.code;
	const dropped = new Map<number, string>();
	if (version === 'before')
		for (const ch of codegen.peephole.changes) dropped.set(ch.addr, ch.text);

	const sections: ListingSection[] = [];
	let current: ListingSection | null = null;
	let first = 0;
	const close = (last: number) => {
		if (!current) return;
		current.addresses = first === last ? `address ${first}` : `addresses ${first}–${last}`;
	};
	for (const i of code.instructions) {
		let own = i.header;
		if (!current || current.function !== i.function) {
			const cut = current ? ownHeaderStart(i.header, i.function) : 0;
			// Comment lines of quads that produced no instruction close the section before.
			for (const text of i.header.slice(0, cut)) current!.rows.push({ kind: 'comment', text });
			own = i.header.slice(cut);
			close(i.addr - 1);
			first = i.addr;
			current = {
				key: String(sections.length),
				function: i.function,
				title: i.function ?? 'Prelude',
				addresses: '',
				frame: codegen.frames.find((f) => f.function === i.function) ?? null,
				rows: [],
				count: 0
			};
			sections.push(current);
		}
		for (const text of own) current.rows.push({ kind: 'comment', text });
		current.rows.push({
			kind: 'instruction',
			addr: i.addr,
			op: i.instr.op,
			operands: operandsOf(code, i.addr),
			comment: i.comment,
			span: i.span,
			dropped: dropped.get(i.addr) ?? null
		});
		current.count++;
	}
	if (current) {
		for (const text of trailerOf(code)) current.rows.push({ kind: 'comment', text });
		close(code.instructions.length - 1);
	}
	return sections;
}

export interface FrameRow {
	/** "0(fp)", "-12(fp) … -3(fp)". */
	offset: string;
	/** What lives there. */
	what: string;
}

function cells(offset: number, size: number, base: string): string {
	const at = (o: number) => `${o}(${base})`;
	return size > 1 ? `${at(offset)} … ${at(offset + size - 1)}` : at(offset);
}

const elements = (name: string, size: number) =>
	size > 1 ? `${name}[0] … ${name}[${size - 1}]` : `${name}[0]`;

/** The activation record of a function as rows, from the base of the record down. */
export function frameRows(frame: FrameLayout): FrameRow[] {
	const fp = registerName(FP);
	return frame.slots.map((slot): FrameRow => {
		const offset = cells(slot.offset, slot.size, fp);
		switch (slot.kind) {
			case 'old-fp':
				return { offset, what: 'the caller’s fp' };
			case 'return-address':
				return { offset, what: 'the return address' };
			case 'parameter':
				return { offset, what: `parameter ${slot.name}` };
			case 'array-parameter':
				return { offset, what: `parameter ${slot.name}: the address of the array` };
			case 'variable':
				return { offset, what: `local ${slot.name}` };
			case 'array':
				return { offset, what: `local ${elements(slot.name, slot.size)}` };
			case 'temporary':
				return { offset, what: `temporary ${slot.name}` };
		}
	});
}

/** The global variables as rows, the first one at 0(gp). */
export function globalRows(globals: GlobalLayout): FrameRow[] {
	const gp = registerName(GP);
	return globals.slots.map((slot) => {
		const last = slot.address + slot.size - 1;
		const memory =
			slot.size > 1 ? `dMem[${slot.address}] … dMem[${last}]` : `dMem[${slot.address}]`;
		const name = slot.kind === 'array' ? elements(slot.name, slot.size) : slot.name;
		return { offset: cells(slot.offset, slot.size, gp), what: `${name}, in ${memory}` };
	});
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface StopView {
	/** "Halted", "Waiting for input", … */
	label: string;
	tone: 'accept' | 'active' | 'reject';
	/** How the run stopped, in a sentence. */
	text: string;
}

/** How a run stopped, in plain words. `supplied` is the number of input values given. */
export function stopView(run: RunOutput, supplied: number): StopView {
	const label = STOP_LABEL[run.stop];
	switch (run.stop) {
		case 'halted':
			return {
				label,
				tone: 'accept',
				text: 'The program ran to its end: main returned and the machine reached HALT.'
			};
		case 'input-exhausted':
			return {
				label,
				tone: 'active',
				text:
					supplied === 0
						? 'The program called input() and the Input field holds no number.'
						: `The program called input() after it had read ${supplied === 1 ? 'the one number' : `all ${supplied} numbers`} of the Input field.`
			};
		case 'step-budget':
			return {
				label,
				tone: 'active',
				text: `The run was stopped after ${run.budget.toLocaleString('en-US')} instructions, the step budget, before the program reached its end.`
			};
		case 'memory-error':
			return {
				label,
				tone: 'reject',
				text: 'An instruction used an address outside data memory: the stack of activation records ran out of cells, or a subscript was far past the end of its array.'
			};
		case 'zero-divide':
			return { label, tone: 'reject', text: 'A division by zero stopped the machine.' };
		case 'negative-subscript':
			return {
				label,
				tone: 'reject',
				text: 'An array was indexed with a negative subscript: the program jumped to the second HALT.'
			};
		case 'subscript-out-of-range':
			return { label, tone: 'reject', text: 'A subscript was past the end of its array.' };
	}
}

/** The source text of the instruction a run ended at; null for the HALT of a finished program. */
export function stopSpan(c: Compilation, run: RunOutput): SourceSpan | null {
	if (run.pc === null || run.stop === 'halted' || c.stoppedAt !== null) return null;
	return c.codegen?.peephole.code.instructions[run.pc]?.span ?? null;
}

// ---------------------------------------------------------------------------
// Long lists
// ---------------------------------------------------------------------------

/** Rows a list shows before "Show all" is used. */
export const ROW_LIMIT = 800;

/** Items a small list (an activation record, the uses of a name) shows before the rest is counted. */
export const SHORT_LIST = 32;

/** The first `limit` items of a list, and how many more there are. */
export function firstOf<T>(
	items: readonly T[],
	limit: number
): { shown: readonly T[]; more: number } {
	return items.length <= limit
		? { shown: items, more: 0 }
		: { shown: items.slice(0, limit), more: items.length - limit };
}

/** The first `limit` rows of the groups, in order; groups left without rows are dropped. */
export function capGroups<G extends { rows: readonly unknown[] }>(
	groups: readonly G[],
	limit: number
): { groups: G[]; shown: number; total: number } {
	const total = groups.reduce((n, g) => n + g.rows.length, 0);
	if (total <= limit) return { groups: [...groups], shown: total, total };
	const out: G[] = [];
	let left = limit;
	for (const g of groups) {
		if (left <= 0) break;
		const rows = g.rows.slice(0, left);
		left -= rows.length;
		out.push({ ...g, rows });
	}
	return { groups: out, shown: limit, total };
}
