/**
 * Three-address code for C-: quads (op, arg1, arg2, result) in the layout of
 * the site's other intermediate code (`#5` for a constant, `t1, t2, …` for
 * temporaries, `L1, L2, …` for labels, `_` for an empty field).
 *
 *   + - * /            op a b t          t := a op b
 *   < <= > >= == !=    op a b t          t := 1 when a op b holds, else 0
 *   :=                 := a _ x          x := a
 *   =[]                =[] a i t         t := a[i]
 *   []=                []= v i a         a[i] := v
 *   param              param a _ _       the next argument of the call that follows
 *   call               call f n t        t := f(the n params before it); `_` for t when no value is kept
 *   return             return a _ _      return a   (`return _ _ _` for a plain return)
 *   label              label _ _ L1      L1:
 *   goto               goto _ _ L1
 *   if_false           if_false a _ L1   jump to L1 when a is 0
 *   begin / end        begin f _ _       the first and last quad of function f
 *
 * Statements translate as
 *
 *   if (e) s1 else s2      e → t · if_false t _ L1 · s1 · goto _ _ L2 · label L1 · s2 · label L2
 *   while (e) s            label L1 · e → t · if_false t _ L2 · s · goto _ _ L1 · label L2
 *
 * (an if without else has the same shape with nothing between the labels).
 * Temporaries are numbered from t1 in each function; labels are numbered
 * through the whole program.
 *
 * Order of evaluation is left to right: the operands of an operator, the
 * arguments of a call, and the subscript of an assigned element before the
 * value assigned. Where a later operand can change a variable that an earlier
 * operand named, the earlier value is first copied to a temporary.
 *
 * Names. An operand that names a variable carries its symbol. In the text of
 * a quad a variable has its source name, except that a name that could stand
 * for two things in one function gets a number: the local of a nested block
 * that hides (or repeats) another name is `x.2`, and so is a variable that is
 * spelled like a temporary.
 */
import {
	childrenOf,
	type ArithOp,
	type Call,
	type Expr,
	type FunDecl,
	type AstNode,
	type Program,
	type RelOp,
	type Stmt
} from './ast';
import type { SemanticResult, SymbolInfo } from './semantic';
import type { SourceSpan } from './tokens';

export type QuadOp =
	| ArithOp
	| RelOp
	| ':='
	| '=[]'
	| '[]='
	| 'param'
	| 'call'
	| 'return'
	| 'label'
	| 'goto'
	| 'if_false'
	| 'begin'
	| 'end';

export type Operand =
	| { kind: 'const'; value: number }
	/** A variable, parameter or array, by its name in the function and its symbol id. */
	| { kind: 'var'; name: string; symbol: number }
	| { kind: 'temp'; name: string }
	| { kind: 'label'; name: string }
	| { kind: 'function'; name: string; symbol: number }
	/** The number of arguments of a call. */
	| { kind: 'count'; value: number };

export type QuadField = 'op' | 'arg1' | 'arg2' | 'result';

export interface Quad {
	/**
	 * The quad's index in the code the generator produced. The optimizer keeps
	 * it, so an optimized quad points back at the quad it was made from.
	 */
	id: number;
	op: QuadOp;
	arg1: Operand | null;
	arg2: Operand | null;
	result: Operand | null;
	/** Id of the AST node the quad was generated for. */
	node: number | null;
	/** The source text it came from. */
	span: SourceSpan | null;
	/** Fields the optimizer rewrote (absent in unoptimized code). */
	changed?: QuadField[];
}

export interface IrFunction {
	name: string;
	/** Symbol id of the function. */
	symbol: number;
	/** Its quads are `quads[from … to − 1]`: `begin` first, `end` last. */
	from: number;
	to: number;
	/** Symbol id → the name the function's quads use for it. */
	names: Map<number, string>;
}

export interface IrProgram {
	/** Every function's quads, in the order of the source. */
	quads: Quad[];
	functions: IrFunction[];
}

const TEMP = /^t[0-9]+$/;

export const constant = (value: number): Operand => ({ kind: 'const', value });
export const temporary = (n: number): Operand => ({ kind: 'temp', name: `t${n}` });
export const label = (n: number): Operand => ({ kind: 'label', name: `L${n}` });

export function sameOperand(a: Operand | null, b: Operand | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case 'const':
		case 'count':
			return a.value === (b as typeof a).value;
		case 'var':
		case 'function':
			return a.symbol === (b as typeof a).symbol;
		case 'temp':
		case 'label':
			return a.name === (b as typeof a).name;
	}
}

/** An operand in the four-column layout: `#5`, `x`, `t1`, `L1`, `2` (an argument count). */
export function operandText(o: Operand | null): string {
	if (o === null) return '_';
	switch (o.kind) {
		case 'const':
			return `#${o.value}`;
		case 'count':
			return String(o.value);
		default:
			return o.name;
	}
}

/** The four columns of a quad: op, arg1, arg2, result. */
export function quadColumns(q: Quad): [string, string, string, string] {
	return [q.op, operandText(q.arg1), operandText(q.arg2), operandText(q.result)];
}

/** "+ x #1 t1": the four columns separated by spaces. */
export function formatQuad(q: Quad): string {
	return quadColumns(q).join(' ');
}

/** An operand in running text: a constant is written without `#`. */
const plain = (o: Operand | null): string =>
	o === null ? '_' : o.kind === 'const' || o.kind === 'count' ? String(o.value) : o.name;

/** The quad on one line: "t1 := x + 1", "a[i] := t2", "if_false t3 goto L1", "L1:". */
export function quadText(q: Quad): string {
	const a = plain(q.arg1);
	const b = plain(q.arg2);
	const r = plain(q.result);
	switch (q.op) {
		case ':=':
			return `${r} := ${a}`;
		case '=[]':
			return `${r} := ${a}[${b}]`;
		case '[]=':
			return `${r}[${b}] := ${a}`;
		case 'param':
			return `param ${a}`;
		case 'call':
			return q.result ? `${r} := call ${a}, ${b}` : `call ${a}, ${b}`;
		case 'return':
			return q.arg1 ? `return ${a}` : 'return';
		case 'label':
			return `${r}:`;
		case 'goto':
			return `goto ${r}`;
		case 'if_false':
			return `if_false ${a} goto ${r}`;
		case 'begin':
		case 'end':
			return `${q.op} ${a}`;
		default:
			return `${r} := ${a} ${q.op} ${b}`;
	}
}

/** The quads as four aligned columns, one quad per line. */
export function printQuads(quads: readonly Quad[]): string {
	const rows = quads.map(quadColumns);
	const width = [0, 1, 2].map((c) => rows.reduce((w, row) => Math.max(w, row[c].length), 0));
	return rows
		.map((row) =>
			row
				.map((cell, c) => (c < 3 ? cell.padEnd(width[c]) : cell))
				.join('  ')
				.trimEnd()
		)
		.join('\n');
}

/** The quads in the one-line form, labels at the margin and the rest indented. */
export function printCode(quads: readonly Quad[]): string {
	return quads
		.map((q) =>
			q.op === 'label' || q.op === 'begin' || q.op === 'end' ? quadText(q) : `    ${quadText(q)}`
		)
		.join('\n');
}

/** The temporaries a list of quads mentions, in order of first appearance. */
export function temporariesOf(quads: readonly Quad[]): string[] {
	const seen = new Set<string>();
	for (const q of quads)
		for (const o of [q.arg1, q.arg2, q.result]) if (o?.kind === 'temp') seen.add(o.name);
	return [...seen];
}

/** The ranges of `quads` that belong to each function (from `begin` through `end`). */
export function functionRanges(
	quads: readonly Quad[]
): { name: string; symbol: number; from: number; to: number }[] {
	const out: { name: string; symbol: number; from: number; to: number }[] = [];
	for (let i = 0; i < quads.length; i++) {
		const q = quads[i];
		if (q.op === 'begin' && q.arg1?.kind === 'function') {
			out.push({ name: q.arg1.name, symbol: q.arg1.symbol, from: i, to: quads.length });
		} else if (q.op === 'end' && out.length) {
			out[out.length - 1].to = i + 1;
		}
	}
	return out;
}

/** First index ≥ `lo` in the ascending list, or its length. */
function lowerBound(sorted: readonly number[], lo: number): number {
	let a = 0;
	let b = sorted.length;
	while (a < b) {
		const mid = (a + b) >> 1;
		if (sorted[mid] < lo) a = mid + 1;
		else b = mid;
	}
	return a;
}

const anyIn = (sorted: readonly number[] | undefined, lo: number, hi: number): boolean => {
	if (!sorted) return false;
	const i = lowerBound(sorted, lo);
	return i < sorted.length && sorted[i] <= hi;
};

/**
 * Translates a checked program (no semantic errors) into three-address code.
 */
export function generateIr(program: Program, semantic: SemanticResult): IrProgram {
	const quads: Quad[] = [];
	const functions: IrFunction[] = [];
	let labels = 0;

	// Node ids are preorder numbers, so a subtree is the id range [id, last[id]].
	const last = new Map<number, number>();
	/** Ids of the Call nodes, ascending. */
	const calls: number[] = [];
	/** Symbol id → ids of the Assign nodes that assign to it as a whole variable, ascending. */
	const assigns = new Map<number, number[]>();
	const index = (node: AstNode): number => {
		if (node.kind === 'Call') calls.push(node.id);
		if (node.kind === 'Assign' && node.target.kind === 'Var') {
			const symbol = semantic.refs.get(node.target.id);
			if (symbol !== undefined) {
				const list = assigns.get(symbol);
				if (list) list.push(node.id);
				else assigns.set(symbol, [node.id]);
			}
		}
		let end = node.id;
		for (const child of childrenOf(node)) end = index(child);
		last.set(node.id, end);
		return end;
	};
	index(program);

	const symbolOf = (node: AstNode): SymbolInfo => {
		const id = semantic.refs.get(node.id);
		if (id === undefined) throw new Error(`generateIr: ${node.kind} ${node.id} is not resolved`);
		return semantic.symbols[id];
	};

	for (const decl of program.decls) if (decl.kind === 'FunDecl') genFunction(decl);
	return { quads, functions };

	function genFunction(decl: FunDecl): void {
		const fnSymbol = symbolOf(decl);
		const info = semantic.functions.find((f) => f.symbol === fnSymbol.id)!;
		const names = nameSymbols(semantic, info.scope, fnSymbol.id);
		const from = quads.length;
		let temps = 0;

		const emit = (
			op: QuadOp,
			arg1: Operand | null,
			arg2: Operand | null,
			result: Operand | null,
			node: number | null,
			span: SourceSpan | null
		) => {
			quads.push({ id: quads.length, op, arg1, arg2, result, node, span });
		};
		const temp = (): Operand => temporary(++temps);
		const variable = (symbol: SymbolInfo): Operand => ({
			kind: 'var',
			name: names.get(symbol.id) ?? symbol.name,
			symbol: symbol.id
		});
		const fnOperand: Operand = { kind: 'function', name: decl.name, symbol: fnSymbol.id };

		/**
		 * The operand to use for `o` when the expressions `later` are evaluated
		 * before it is used: a copy, if one of them can change the variable.
		 */
		const stable = (
			o: Operand,
			firstLater: Expr | undefined,
			lastLater: Expr | undefined,
			at: Expr
		): Operand => {
			if (o.kind !== 'var' || !firstLater || !lastLater) return o;
			const symbol = semantic.symbols[o.symbol];
			if (symbol.kind !== 'variable' && symbol.kind !== 'parameter') return o;
			const lo = firstLater.id;
			const hi = last.get(lastLater.id)!;
			// An assignment to it, or (for a global) a call, which may assign to it.
			const changes =
				anyIn(assigns.get(symbol.id), lo, hi) || (symbol.depth === 0 && anyIn(calls, lo, hi));
			if (!changes) return o;
			const t = temp();
			emit(':=', o, null, t, at.id, at.span);
			return t;
		};

		const call = (e: Call, wantValue: boolean): Operand => {
			const callee = symbolOf(e);
			const args: Operand[] = [];
			const lastArg = e.args[e.args.length - 1];
			e.args.forEach((arg, i) => {
				args.push(stable(expr(arg), e.args[i + 1], lastArg, arg));
			});
			e.args.forEach((arg, i) => emit('param', args[i], null, null, arg.id, arg.span));
			const returnsInt = callee.type.kind === 'function' && callee.type.returns === 'int';
			const result = wantValue && returnsInt ? temp() : null;
			emit(
				'call',
				{ kind: 'function', name: callee.name, symbol: callee.id },
				{ kind: 'count', value: args.length },
				result,
				e.id,
				e.span
			);
			// A void call has no value; the checker never lets one be used.
			return result ?? constant(0);
		};

		const expr = (e: Expr): Operand => {
			switch (e.kind) {
				case 'Num':
					return constant(e.value | 0);
				case 'Var':
					return variable(symbolOf(e));
				case 'Index': {
					const i = expr(e.index);
					const t = temp();
					emit('=[]', variable(symbolOf(e)), i, t, e.id, e.span);
					return t;
				}
				case 'Call':
					return call(e, true);
				case 'Binary': {
					const left = stable(expr(e.left), e.right, e.right, e.left);
					const right = expr(e.right);
					const t = temp();
					emit(e.op, left, right, t, e.id, e.span);
					return t;
				}
				case 'Assign': {
					if (e.target.kind === 'Var') {
						const value = expr(e.value);
						emit(':=', value, null, variable(symbolOf(e.target)), e.id, e.span);
						return value;
					}
					const i = stable(expr(e.target.index), e.value, e.value, e.target.index);
					const value = expr(e.value);
					emit('[]=', value, i, variable(symbolOf(e.target)), e.id, e.span);
					return value;
				}
			}
		};

		const stmt = (s: Stmt): void => {
			switch (s.kind) {
				case 'Compound':
					s.body.forEach(stmt);
					return;
				case 'ExprStmt':
					if (s.expr?.kind === 'Call') call(s.expr, false);
					else if (s.expr) expr(s.expr);
					return;
				case 'Return':
					emit('return', s.value ? expr(s.value) : null, null, null, s.id, s.span);
					return;
				case 'If': {
					const test = expr(s.test);
					const l1 = label(++labels);
					const l2 = label(++labels);
					emit('if_false', test, null, l1, s.id, s.headSpan);
					stmt(s.then);
					emit('goto', null, null, l2, s.id, s.elseSpan ?? s.headSpan);
					emit('label', null, null, l1, s.id, s.elseSpan ?? s.headSpan);
					if (s.else) stmt(s.else);
					emit('label', null, null, l2, s.id, s.headSpan);
					return;
				}
				case 'While': {
					const l1 = label(++labels);
					const l2 = label(++labels);
					emit('label', null, null, l1, s.id, s.headSpan);
					const test = expr(s.test);
					emit('if_false', test, null, l2, s.id, s.headSpan);
					stmt(s.body);
					emit('goto', null, null, l1, s.id, s.headSpan);
					emit('label', null, null, l2, s.id, s.headSpan);
					return;
				}
			}
		};

		emit('begin', fnOperand, null, null, decl.id, decl.headSpan);
		stmt(decl.body);
		emit('end', fnOperand, null, null, decl.id, decl.body.closeSpan);
		functions.push({ name: decl.name, symbol: fnSymbol.id, from, to: quads.length, names });
	}
}

/**
 * The names a function's quads use: its parameters and outermost locals keep
 * their names, then the globals they do not hide, then the locals of nested
 * blocks. A name that is taken (or looks like a temporary) gets `.2`, `.3`, ….
 */
function nameSymbols(semantic: SemanticResult, scopeId: number, fn: number): Map<number, string> {
	const names = new Map<number, string>();
	const taken = new Set<string>();
	const assign = (symbol: SymbolInfo) => {
		let name = symbol.name;
		for (let k = 2; taken.has(name) || TEMP.test(name); k++) name = `${symbol.name}.${k}`;
		taken.add(name);
		names.set(symbol.id, name);
	};
	const variables = (scope: number) =>
		semantic.scopes[scope].symbols
			.map((id) => semantic.symbols[id])
			.filter((s) => s.kind !== 'function');

	const own = variables(scopeId);
	own.forEach(assign);
	const hidden = new Set(own.map((s) => s.name));
	const declaredAt = semantic.symbols[fn].declSpan?.start ?? Infinity;
	for (const g of variables(0)) {
		// Only the globals declared before the function can be used in it.
		if (!hidden.has(g.name) && (g.declSpan?.start ?? 0) < declaredAt) assign(g);
	}
	const nested = (scope: number) => {
		for (const child of semantic.scopes[scope].children) {
			variables(child).forEach(assign);
			nested(child);
		}
	};
	nested(scopeId);
	return names;
}
