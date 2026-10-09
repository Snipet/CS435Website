/**
 * The C- semantic analyzer: symbol tables, types, and the static checks.
 *
 * Scopes. One global scope (depth 0) that starts with the predefined
 * `int input(void)` and `void output(int x)`; one scope per function (depth 1)
 * holding its parameters and the local declarations of its body; one scope per
 * nested compound statement (depth 2 and up). A name is declared before it is
 * used; a declaration hides the declarations of the same name in the scopes
 * around it.
 *
 * Types. Every expression node gets a type: int, void (a call of a void
 * function), int[] (an array name), a function type, or error. An expression
 * of type error has already been reported and is accepted everywhere, so one
 * mistake gives one message.
 *
 * Storage. After the checks every variable gets its place: a global an offset
 * from gp, a parameter or local an offset from fp (see runtime.ts).
 */
import type {
	Call,
	Compound,
	Expr,
	FunDecl,
	Index,
	Program,
	Stmt,
	TypeSpec,
	Var,
	VarDecl
} from './ast';
import { FRAME_HEADER, INT_MAX } from './runtime';
import type { SourceDiagnostic, SourceSpan } from './tokens';

export type ParamType = 'int' | 'array';

export type CType =
	| { kind: 'int' }
	| { kind: 'void' }
	/** A whole array (`int[]`). */
	| { kind: 'array' }
	| { kind: 'function'; returns: TypeSpec; params: ParamType[] }
	/** Already reported; accepted everywhere. */
	| { kind: 'error' };

export const INT_TYPE: CType = Object.freeze({ kind: 'int' });
export const VOID_TYPE: CType = Object.freeze({ kind: 'void' });
export const ARRAY_TYPE: CType = Object.freeze({ kind: 'array' });
export const ERROR_TYPE: CType = Object.freeze({ kind: 'error' });

/** "int", "void", "int[]", "(int, int[]) → int", "(void) → void", "error". */
export function typeText(t: CType): string {
	switch (t.kind) {
		case 'int':
		case 'void':
		case 'error':
			return t.kind;
		case 'array':
			return 'int[]';
		case 'function': {
			const params = t.params.map((p) => (p === 'array' ? 'int[]' : 'int')).join(', ');
			return `(${params || 'void'}) → ${t.returns}`;
		}
	}
}

export type SymbolKind = 'variable' | 'array' | 'function' | 'parameter' | 'array-parameter';

/** Where a variable lives: the cell (element 0 of an array) is at reg[base] + offset. */
export interface StorageLocation {
	base: 'gp' | 'fp';
	offset: number;
}

export interface ParamInfo {
	name: string;
	type: ParamType;
}

export interface SymbolInfo {
	/** Index in `SemanticResult.symbols`. */
	id: number;
	name: string;
	kind: SymbolKind;
	type: CType;
	/** Id of the scope that declares it. */
	scope: number;
	/** Depth of that scope: 0 global, 1 function, 2 and up nested blocks. */
	depth: number;
	/** The name in its declaration; null for input and output. */
	declSpan: SourceSpan | null;
	/** Id of the declaring node (VarDecl, Param, FunDecl); null for input and output. */
	node: number | null;
	/** The span of every use, in source order. */
	uses: SourceSpan[];
	/** Number of elements of an array; null otherwise. */
	size: number | null;
	/** Parameters of a function; null otherwise. */
	params: ParamInfo[] | null;
	/** True for input and output. */
	builtin: boolean;
	/** Set by the storage layout; null for functions. */
	location: StorageLocation | null;
}

export interface Scope {
	/** Index in `SemanticResult.scopes`. */
	id: number;
	kind: 'global' | 'function' | 'block';
	/** "global", the function's name, or "f.1", "f.1.2" for the blocks nested in f. */
	name: string;
	depth: number;
	parent: number | null;
	children: number[];
	/** Ids of the symbols declared here, in order. */
	symbols: number[];
	/** Symbol id of the function the scope belongs to; null for the global scope. */
	function: number | null;
	/** The FunDecl or Compound node; null for the global scope. */
	node: number | null;
	span: SourceSpan | null;
}

export interface FunctionInfo {
	name: string;
	/** Symbol id. */
	symbol: number;
	/** Id of the FunDecl node. */
	node: number;
	scope: number;
	returns: TypeSpec;
	/** Symbol ids of the parameters, in order. */
	params: number[];
	/** Symbol ids of every local variable (nested blocks included), in declaration order. */
	locals: number[];
	/** Cells for the caller's fp, the return address, the parameters and the locals. */
	frameSize: number;
}

export interface SemanticResult {
	/** Every symbol; `symbols[id].id === id`. input and output come first. */
	symbols: SymbolInfo[];
	/** Every scope; `scopes[0]` is the global scope. */
	scopes: Scope[];
	/** The functions the program declares, in order. */
	functions: FunctionInfo[];
	/** Expression node id → its type. */
	types: Map<number, CType>;
	/**
	 * Node id → symbol id: for a Var, Index or Call the symbol the name refers
	 * to (absent when it is not declared), for a VarDecl, Param or FunDecl the
	 * symbol it declares.
	 */
	refs: Map<number, number>;
	/** Cells the global variables take. */
	globalsSize: number;
	diagnostics: SourceDiagnostic[];
	/** True when there is no error (warnings allowed). */
	ok: boolean;
}

const isArrayKind = (k: SymbolKind) => k === 'array' || k === 'array-parameter';

class Analyzer {
	readonly symbols: SymbolInfo[] = [];
	readonly scopes: Scope[] = [];
	readonly functions: FunctionInfo[] = [];
	readonly types = new Map<number, CType>();
	readonly refs = new Map<number, number>();
	readonly diagnostics: SourceDiagnostic[] = [];
	/** Per scope: name → symbol id (the latest declaration of the name). */
	private readonly tables: Map<string, number>[] = [];
	private current = 0;
	private fn: FunctionInfo | null = null;

	constructor() {
		this.openScope('global', 'global', null, null, null);
		this.declare(
			'input',
			'function',
			{ kind: 'function', returns: 'int', params: [] },
			null,
			null,
			{
				params: [],
				builtin: true
			}
		);
		this.declare(
			'output',
			'function',
			{ kind: 'function', returns: 'void', params: ['int'] },
			null,
			null,
			{ params: [{ name: 'x', type: 'int' }], builtin: true }
		);
	}

	// --- Scopes and symbols -------------------------------------------------

	private error(message: string, span: SourceSpan): void {
		this.diagnostics.push({ severity: 'error', message, span });
	}

	private openScope(
		kind: Scope['kind'],
		name: string,
		fn: number | null,
		node: number | null,
		span: SourceSpan | null
	): Scope {
		const parent = this.scopes.length ? this.scopes[this.current] : null;
		const scope: Scope = {
			id: this.scopes.length,
			kind,
			name,
			depth: parent ? parent.depth + 1 : 0,
			parent: parent ? parent.id : null,
			children: [],
			symbols: [],
			function: fn,
			node,
			span
		};
		parent?.children.push(scope.id);
		this.scopes.push(scope);
		this.tables.push(new Map());
		this.current = scope.id;
		return scope;
	}

	private closeScope(): void {
		this.current = this.scopes[this.current].parent ?? 0;
	}

	private declare(
		name: string,
		kind: SymbolKind,
		type: CType,
		declSpan: SourceSpan | null,
		node: number | null,
		extra: { size?: number; params?: ParamInfo[]; builtin?: boolean } = {}
	): SymbolInfo {
		const scope = this.scopes[this.current];
		const table = this.tables[this.current];
		const earlier = table.get(name);
		if (earlier !== undefined && declSpan) {
			const first = this.symbols[earlier];
			this.error(
				first.declSpan
					? `${name} is already declared in this scope (line ${first.declSpan.line}).`
					: `${name} is a predefined function; it cannot be declared again.`,
				declSpan
			);
		}
		const symbol: SymbolInfo = {
			id: this.symbols.length,
			name,
			kind,
			type,
			scope: scope.id,
			depth: scope.depth,
			declSpan,
			node,
			uses: [],
			size: extra.size ?? null,
			params: extra.params ?? null,
			builtin: extra.builtin ?? false,
			location: null
		};
		this.symbols.push(symbol);
		scope.symbols.push(symbol.id);
		// A later declaration of the same name takes over, so its uses are checked against it.
		table.set(name, symbol.id);
		if (node !== null) this.refs.set(node, symbol.id);
		return symbol;
	}

	private lookup(name: string): SymbolInfo | null {
		for (let s: number | null = this.current; s !== null; s = this.scopes[s].parent) {
			const id = this.tables[s].get(name);
			if (id !== undefined) return this.symbols[id];
		}
		return null;
	}

	/** The symbol a use of `name` refers to; reports an undeclared name. */
	private resolve(name: string, span: SourceSpan, node: number): SymbolInfo | null {
		const symbol = this.lookup(name);
		if (!symbol) {
			this.error(`${name} is not declared.`, span);
			return null;
		}
		symbol.uses.push(span);
		this.refs.set(node, symbol.id);
		return symbol;
	}

	// --- Declarations -------------------------------------------------------

	program(program: Program): void {
		for (const decl of program.decls) {
			if (decl.kind === 'VarDecl') this.varDecl(decl);
			else this.funDecl(decl);
		}
		this.checkMain(program);
	}

	private varDecl(decl: VarDecl): SymbolInfo {
		if (decl.typeSpec === 'void') {
			this.error(`A variable cannot have the type void.`, decl.span);
		}
		if (decl.size === null) {
			return this.declare(decl.name, 'variable', INT_TYPE, decl.nameSpan, decl.id);
		}
		let size = decl.size;
		if (size < 1) {
			this.error('An array needs at least one element.', decl.sizeSpan ?? decl.span);
			size = 1;
		} else if (!(size <= INT_MAX)) {
			this.error('This array size does not fit in an int (32 bits).', decl.sizeSpan ?? decl.span);
			size = 1;
		}
		return this.declare(decl.name, 'array', ARRAY_TYPE, decl.nameSpan, decl.id, { size });
	}

	private funDecl(decl: FunDecl): void {
		const params: ParamInfo[] = decl.params.map((p) => ({
			name: p.name,
			type: p.isArray ? 'array' : 'int'
		}));
		// Declared before its body is read, so the function can call itself.
		const symbol = this.declare(
			decl.name,
			'function',
			{ kind: 'function', returns: decl.returnType, params: params.map((p) => p.type) },
			decl.nameSpan,
			decl.id,
			{ params }
		);
		const scope = this.openScope('function', decl.name, symbol.id, decl.id, decl.span);
		const info: FunctionInfo = {
			name: decl.name,
			symbol: symbol.id,
			node: decl.id,
			scope: scope.id,
			returns: decl.returnType,
			params: [],
			locals: [],
			frameSize: FRAME_HEADER
		};
		this.functions.push(info);
		this.fn = info;
		for (const p of decl.params) {
			if (p.typeSpec === 'void') this.error('A parameter cannot have the type void.', p.span);
			const s = this.declare(
				p.name,
				p.isArray ? 'array-parameter' : 'parameter',
				p.isArray ? ARRAY_TYPE : INT_TYPE,
				p.nameSpan,
				p.id
			);
			info.params.push(s.id);
		}
		// The body's declarations share the scope of the parameters.
		this.block(decl.body);
		if (decl.returnType === 'int' && !alwaysReturns(decl.body)) {
			this.diagnostics.push({
				severity: 'warning',
				message: `${decl.name} returns int, but it may reach the end of its body without returning a value.`,
				span: decl.body.closeSpan
			});
		}
		this.fn = null;
		this.closeScope();
	}

	private checkMain(program: Program): void {
		const decls = program.decls;
		const last = decls[decls.length - 1];
		let main: Program['decls'][number] | undefined;
		for (const d of decls) if (d.name === 'main') main = d;
		if (!main) {
			this.error(
				'The program has no main: its last declaration must be void main(void).',
				last ? last.nameSpan : program.span
			);
			return;
		}
		if (main.kind !== 'FunDecl') {
			this.error('main must be a function, declared void main(void).', main.nameSpan);
			return;
		}
		if (main.returnType !== 'void' || main.params.length > 0) {
			this.error('main must be declared void main(void).', main.headSpan);
		}
		if (main !== last) {
			this.error('main must be the last declaration of the program.', main.nameSpan);
		}
	}

	// --- Statements ---------------------------------------------------------

	/** The declarations and statements of a compound statement, in the current scope. */
	private block(block: Compound): void {
		for (const local of block.locals) {
			const s = this.varDecl(local);
			this.fn?.locals.push(s.id);
		}
		let blocks = 0;
		for (const stmt of block.body) blocks = this.stmt(stmt, blocks);
	}

	/** Checks a statement. `blocks` counts the nested blocks opened so far in the current scope. */
	private stmt(s: Stmt, blocks: number): number {
		switch (s.kind) {
			case 'Compound': {
				const parent = this.scopes[this.current];
				const name = `${parent.name}.${++blocks}`;
				this.openScope('block', name, parent.function, s.id, s.span);
				this.block(s);
				this.closeScope();
				return blocks;
			}
			case 'If':
				this.needInt(s.test, this.expr(s.test), 'a condition');
				blocks = this.stmt(s.then, blocks);
				return s.else ? this.stmt(s.else, blocks) : blocks;
			case 'While':
				this.needInt(s.test, this.expr(s.test), 'a condition');
				return this.stmt(s.body, blocks);
			case 'Return': {
				const fn = this.fn!;
				if (s.value) {
					const t = this.expr(s.value);
					if (fn.returns === 'void') {
						this.error(`${fn.name} returns void, so its return cannot have a value.`, s.span);
					} else {
						this.needInt(s.value, t, 'a returned value');
					}
				} else if (fn.returns === 'int') {
					this.error(`${fn.name} returns int, so its return needs a value.`, s.span);
				}
				return blocks;
			}
			case 'ExprStmt':
				if (s.expr) {
					const t = this.expr(s.expr);
					// A call of a void function is a statement; a whole array or a function name is not.
					if (t.kind !== 'void') this.needInt(s.expr, t, 'a statement');
				}
				return blocks;
		}
	}

	// --- Expressions --------------------------------------------------------

	private expr(e: Expr): CType {
		const t = this.exprType(e);
		this.types.set(e.id, t);
		return t;
	}

	private exprType(e: Expr): CType {
		switch (e.kind) {
			case 'Num':
				if (!(e.value <= INT_MAX)) {
					this.error(`${e.text} does not fit in an int (32 bits).`, e.span);
				}
				return INT_TYPE;
			case 'Var': {
				const symbol = this.resolve(e.name, e.span, e.id);
				if (!symbol) return ERROR_TYPE;
				return symbol.kind === 'function'
					? symbol.type
					: isArrayKind(symbol.kind)
						? ARRAY_TYPE
						: INT_TYPE;
			}
			case 'Index':
				return this.index(e);
			case 'Call':
				return this.call(e);
			case 'Binary': {
				const left = this.expr(e.left);
				const right = this.expr(e.right);
				this.needInt(e.left, left, `an operand of ${e.op}`);
				this.needInt(e.right, right, `an operand of ${e.op}`);
				return INT_TYPE;
			}
			case 'Assign': {
				const target = this.target(e.target);
				const value = this.expr(e.value);
				this.needInt(e.value, value, 'the right side of =');
				this.types.set(e.target.id, target);
				return INT_TYPE;
			}
		}
	}

	/** The left side of an assignment: an int variable or an indexed array element. */
	private target(t: Var | Index): CType {
		if (t.kind === 'Index') return this.index(t);
		const symbol = this.resolve(t.name, t.span, t.id);
		if (!symbol) return ERROR_TYPE;
		if (isArrayKind(symbol.kind)) {
			this.error(
				`Cannot assign to the array ${t.name}: assign to an element, as in ${t.name}[0] = …`,
				t.span
			);
			return ERROR_TYPE;
		}
		if (symbol.kind === 'function') {
			this.error(`Cannot assign to the function ${t.name}.`, t.span);
			return ERROR_TYPE;
		}
		return INT_TYPE;
	}

	private index(e: Index): CType {
		const symbol = this.resolve(e.name, e.nameSpan, e.id);
		const subscript = this.expr(e.index);
		this.needInt(e.index, subscript, 'a subscript');
		if (!symbol) return ERROR_TYPE;
		if (!isArrayKind(symbol.kind)) {
			this.error(`${e.name} is not an array, so it cannot be indexed.`, e.nameSpan);
			return ERROR_TYPE;
		}
		return INT_TYPE;
	}

	private call(e: Call): CType {
		const symbol = this.resolve(e.name, e.nameSpan, e.id);
		const args = e.args.map((a) => this.expr(a));
		if (!symbol) return ERROR_TYPE;
		if (symbol.kind !== 'function' || symbol.type.kind !== 'function') {
			this.error(`${e.name} is not a function, so it cannot be called.`, e.nameSpan);
			return ERROR_TYPE;
		}
		const params = symbol.type.params;
		if (args.length !== params.length) {
			const takes =
				params.length === 0
					? 'takes no arguments'
					: `takes ${params.length} argument${params.length === 1 ? '' : 's'}`;
			const given = args.length === 1 ? '1 is given' : `${args.length} are given`;
			this.error(`${e.name} ${takes}, but ${given}.`, e.span);
		}
		for (let i = 0; i < Math.min(args.length, params.length); i++) {
			const arg = e.args[i];
			const role = `argument ${i + 1} of ${e.name}`;
			if (params[i] === 'int') {
				this.needInt(arg, args[i], role);
			} else if (args[i].kind !== 'array' && args[i].kind !== 'error') {
				this.error(
					`${role[0].toUpperCase()}${role.slice(1)} must be an array: its parameter is declared with [ ].`,
					arg.span
				);
			}
		}
		return symbol.type.returns === 'int' ? INT_TYPE : VOID_TYPE;
	}

	/** Reports an expression that is not an int where one is needed (`role` says where). */
	private needInt(e: Expr, t: CType, role: string): void {
		switch (t.kind) {
			case 'int':
			case 'error':
				return;
			case 'array': {
				const name = e.kind === 'Var' ? e.name : 'a';
				this.error(
					`The array ${name} cannot be used as ${role}: use one element, as in ${name}[0].`,
					e.span
				);
				return;
			}
			case 'void': {
				const name = e.kind === 'Call' ? e.name : 'The function';
				this.error(`${name} returns void, so its call cannot be used as ${role}.`, e.span);
				return;
			}
			case 'function': {
				const name = e.kind === 'Var' ? e.name : 'This';
				this.error(
					`${name} is a function: it cannot be used as ${role} without being called.`,
					e.span
				);
				return;
			}
		}
	}

	// --- Storage ------------------------------------------------------------

	/** Globals downward from 0(gp); parameters and locals downward from -2(fp). */
	layout(): number {
		const place = (symbol: SymbolInfo, base: 'gp' | 'fp', used: number): number => {
			const cells = symbol.kind === 'array' ? (symbol.size ?? 1) : 1;
			// Element 0 of an array is its lowest cell.
			symbol.location = { base, offset: 1 - used - cells };
			return used + cells;
		};
		let globals = 0;
		for (const id of this.scopes[0].symbols) {
			const symbol = this.symbols[id];
			if (symbol.kind !== 'function') globals = place(symbol, 'gp', globals);
		}
		for (const fn of this.functions) {
			let used = FRAME_HEADER;
			for (const id of [...fn.params, ...fn.locals]) used = place(this.symbols[id], 'fp', used);
			fn.frameSize = used;
		}
		return globals;
	}
}

/** True when control cannot reach the end of the statement: every path through it returns. */
function alwaysReturns(s: Stmt): boolean {
	switch (s.kind) {
		case 'Return':
			return true;
		case 'Compound':
			return s.body.some(alwaysReturns);
		case 'If':
			return s.else !== null && alwaysReturns(s.then) && alwaysReturns(s.else);
		case 'While':
		case 'ExprStmt':
			return false;
	}
}

/** Checks a parsed program. Run it only on a tree without syntax errors. */
export function analyze(program: Program): SemanticResult {
	const a = new Analyzer();
	a.program(program);
	const globalsSize = a.layout();
	const diagnostics = a.diagnostics
		.map((d, i) => ({ d, i }))
		.sort((x, y) => (x.d.span?.start ?? 0) - (y.d.span?.start ?? 0) || x.i - y.i)
		.map((x) => x.d);
	return {
		symbols: a.symbols,
		scopes: a.scopes,
		functions: a.functions,
		types: a.types,
		refs: a.refs,
		globalsSize,
		diagnostics,
		ok: !diagnostics.some((d) => d.severity === 'error')
	};
}

/** The symbols visible at a scope, innermost declaration of each name first. */
export function visibleSymbols(result: SemanticResult, scopeId: number): SymbolInfo[] {
	const seen = new Set<string>();
	const out: SymbolInfo[] = [];
	for (let s: number | null = scopeId; s !== null; s = result.scopes[s].parent) {
		const ids = result.scopes[s].symbols;
		for (let i = ids.length - 1; i >= 0; i--) {
			const symbol = result.symbols[ids[i]];
			if (!seen.has(symbol.name)) {
				seen.add(symbol.name);
				out.push(symbol);
			}
		}
	}
	return out;
}
