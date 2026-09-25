/**
 * Compile-time checks a C compiler would make before the program runs:
 * undeclared names, unknown functions, argument counts, misplaced
 * break / continue / case labels, and the initializers of global variables.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Expr, FnDef, Loc, Stmt } from './c-ast';
import {
	BUILTIN_FUNCTIONS,
	BUILTIN_VALUES,
	CLimitError,
	CMachine,
	CRuntimeError,
	type FlexHooks
} from './c';

export interface CheckScope {
	/** Global variables, enum constants, start conditions, and flex's own names. */
	globals: ReadonlySet<string>;
	/** User functions: parameter count and whether they take `...`. */
	functions: ReadonlyMap<string, { params: number; variadic: boolean }>;
	/** Names in `globals` that are constants (enum constants, start conditions, EOF, …). */
	constants?: ReadonlySet<string>;
}

interface Frame {
	names: Set<string>;
	/** Enum constants declared in this block. */
	constants: Set<string>;
}

class Checker {
	readonly diagnostics: Diagnostic[] = [];
	private frames: Frame[] = [];
	private loops = 0;
	private switches = 0;

	constructor(
		private readonly scope: CheckScope,
		/** Action code: break and continue at the top end the action, as in flex. */
		private readonly inAction: boolean,
		private readonly voidFn: boolean,
		/** Initializers of global declarations (outside every function). */
		private readonly fileScope = false
	) {}

	private error(message: string, loc: Loc): void {
		this.diagnostics.push({
			severity: 'error',
			message,
			span: { start: loc.start, end: loc.end, source: null }
		});
	}

	private warn(message: string, loc: Loc): void {
		this.diagnostics.push({
			severity: 'warning',
			message,
			span: { start: loc.start, end: loc.end, source: null }
		});
	}

	push(names: Iterable<string> = [], constants: Iterable<string> = []): void {
		this.frames.push({ names: new Set(names), constants: new Set(constants) });
	}
	pop(): void {
		this.frames.pop();
	}

	private declare(name: string, loc: Loc): void {
		const top = this.frames[this.frames.length - 1];
		if (top.names.has(name)) this.error(`${name} is already declared here`, loc);
		top.names.add(name);
	}

	private known(name: string): boolean {
		for (let k = this.frames.length - 1; k >= 0; k--)
			if (this.frames[k].names.has(name)) return true;
		return this.scope.globals.has(name) || BUILTIN_VALUES.has(name);
	}

	/** Whether `name` is a constant where it is used (not a variable). */
	private constantName(name: string): boolean {
		for (let k = this.frames.length - 1; k >= 0; k--) {
			const f = this.frames[k];
			if (f.names.has(name)) return f.constants.has(name);
		}
		return !!this.scope.constants?.has(name);
	}

	/**
	 * A constant expression, as a static variable's initializer must be.
	 * Addresses (`&x`) are accepted without checking what they point to.
	 */
	private constant(e: Expr): boolean {
		switch (e.k) {
			case 'num':
			case 'char':
			case 'str':
			case 'sizeof':
				return true;
			case 'id':
				return this.constantName(e.name);
			case 'unary':
				return e.op === '&' || (e.op !== '*' && this.constant(e.arg));
			case 'cast':
				return this.constant(e.arg);
			case 'binary':
			case 'logical':
				return this.constant(e.left) && this.constant(e.right);
			case 'cond':
				return this.constant(e.test) && this.constant(e.then) && this.constant(e.else);
			default:
				return false;
		}
	}

	stmts(body: Stmt[]): void {
		for (const s of body) this.stmt(s);
	}

	/**
	 * A global declaration or enum: its expressions see only the names declared
	 * before them (the globals are initialized in text order). Repeated names
	 * are reported by the compiler, not here.
	 */
	global(s: Stmt): void {
		const top = this.frames[this.frames.length - 1];
		if (s.k === 'decl') {
			for (const d of s.decls) {
				if (d.array) this.expr(d.array);
				if (d.init) (d.init.k === 'list' ? d.init.items : [d.init]).forEach((e) => this.expr(e));
				top.names.add(d.name);
			}
		} else if (s.k === 'enum') {
			for (const item of s.items) {
				if (item.value) this.expr(item.value);
				top.names.add(item.name);
				top.constants.add(item.name);
			}
		}
	}

	stmt(s: Stmt, inSwitchBody = false): void {
		switch (s.k) {
			case 'expr':
				this.expr(s.e);
				break;
			case 'decl':
				for (const d of s.decls) {
					if (d.array) this.expr(d.array);
					if (d.init) {
						const items = d.init.k === 'list' ? d.init.items : [d.init];
						items.forEach((e) => this.expr(e));
						const bad = s.static ? items.find((e) => !this.constant(e)) : undefined;
						if (bad)
							this.error(`${d.name} is static, so its initializer must be a constant`, bad.loc);
					}
					this.declare(d.name, d.loc);
				}
				break;
			case 'enum':
				for (const item of s.items) {
					if (item.value) this.expr(item.value);
					this.declare(item.name, item.loc);
					this.frames[this.frames.length - 1].constants.add(item.name);
				}
				break;
			case 'block':
				if (s.inline) {
					this.stmts(s.body);
					break;
				}
				this.push();
				this.stmts(s.body);
				this.pop();
				break;
			case 'if':
				this.expr(s.test);
				this.stmt(s.then);
				if (s.else) this.stmt(s.else);
				break;
			case 'while':
			case 'do':
				this.expr(s.test);
				this.loops++;
				this.stmt(s.body);
				this.loops--;
				break;
			case 'for':
				this.push();
				if (s.init?.k === 'decl' && s.init.static)
					this.error('a for loop cannot declare a static variable', s.init.loc);
				if (s.init) this.stmt(s.init);
				if (s.test) this.expr(s.test);
				if (s.update) this.expr(s.update);
				this.loops++;
				this.stmt(s.body);
				this.loops--;
				this.pop();
				break;
			case 'return':
				if (s.e) {
					this.expr(s.e);
					if (this.voidFn) this.warn('a void function returns a value', s.loc);
				} else if (this.inAction) {
					// Actions are the body of yylex, which returns int; gcc compiles a bare
					// `return;` there with this warning (yylex then returns 0 here, see CMachine).
					this.warn("'return' with no value, in function returning non-void", s.loc);
				}
				break;
			case 'break':
				if (!this.loops && !this.switches && !this.inAction)
					this.error('break is not inside a loop or switch', s.loc);
				break;
			case 'continue':
				if (!this.loops && !this.inAction) this.error('continue is not inside a loop', s.loc);
				break;
			case 'switch':
				this.expr(s.e);
				this.switches++;
				this.push();
				for (const st of s.body) this.stmt(st, true);
				this.pop();
				this.switches--;
				break;
			case 'case':
				if (!inSwitchBody)
					this.error('case must be directly inside a switch body in this playground', s.loc);
				this.expr(s.e);
				break;
			case 'default':
				if (!inSwitchBody)
					this.error('default must be directly inside a switch body in this playground', s.loc);
				break;
			case 'empty':
				break;
		}
	}

	expr(e: Expr): void {
		switch (e.k) {
			case 'num':
			case 'char':
			case 'str':
				return;
			case 'id':
				if (!this.known(e.name)) {
					if (this.scope.functions.has(e.name) || BUILTIN_FUNCTIONS.has(e.name))
						this.error(`${e.name} is a function; call it as ${e.name}(…)`, e.loc);
					else this.error(`${e.name} is undeclared`, e.loc);
				}
				return;
			case 'unary':
			case 'incdec':
			case 'cast':
			case 'begin':
				this.expr(e.arg);
				return;
			case 'sizeof':
				if (e.arg) this.expr(e.arg);
				return;
			case 'binary':
			case 'logical':
				this.expr(e.left);
				this.expr(e.right);
				return;
			case 'assign':
				this.expr(e.target);
				this.expr(e.value);
				return;
			case 'cond':
				this.expr(e.test);
				this.expr(e.then);
				this.expr(e.else);
				return;
			case 'index':
				this.expr(e.arr);
				this.expr(e.index);
				return;
			case 'comma':
				e.items.forEach((x) => this.expr(x));
				return;
			case 'call': {
				e.args.forEach((x) => this.expr(x));
				const fn = this.scope.functions.get(e.name);
				if (this.fileScope) {
					// The runtime initializes the globals before any user function exists.
					if (fn) {
						this.error(
							`a global's initializer cannot call ${e.name}(): globals are set before main runs`,
							e.loc
						);
						return;
					}
					if (e.name === 'yyterminate') {
						this.error(
							"yyterminate() is flex's return 0, so it can only be used inside a function",
							e.loc
						);
						return;
					}
					if (e.name === 'yyless') {
						this.error('yyless() can only be used in a rule’s action', e.loc);
						return;
					}
				}
				// yyterminate() is flex's macro for `return 0`.
				if (e.name === 'yyterminate' && this.voidFn && !fn)
					this.warn('yyterminate() returns 0, but this function returns void', e.loc);
				if (fn) {
					const n = e.args.length;
					if (n < fn.params || (!fn.variadic && n > fn.params)) {
						this.error(
							`${e.name}() takes ${fn.params} argument${fn.params === 1 ? '' : 's'} but got ${n}`,
							e.loc
						);
					}
				} else if (!BUILTIN_FUNCTIONS.has(e.name)) {
					this.error(`${e.name}() is not defined`, e.nameLoc);
				}
				return;
			}
		}
	}
}

/** Checks a function definition. */
export function checkFunction(fn: FnDef, scope: CheckScope): Diagnostic[] {
	const c = new Checker(scope, false, fn.ret.base === 'void' && fn.ret.ptr === 0);
	c.push(fn.params.flatMap((p) => (p.name ? [p.name] : [])));
	c.push();
	c.stmts(fn.body);
	return c.diagnostics;
}

/**
 * Checks the code before the first rule (`prologue`) and each action, which
 * see the prologue's declarations.
 */
export function checkScanner(
	prologue: Stmt[],
	actions: Stmt[][],
	scope: CheckScope
): { prologue: Diagnostic[]; actions: Diagnostic[][]; locals: Set<string> } {
	const pc = new Checker(scope, true, false);
	pc.push();
	pc.stmts(prologue);
	const locals = new Set<string>();
	const constants = new Set<string>();
	const collect = (s: Stmt): void => {
		if (s.k === 'decl') s.decls.forEach((d) => locals.add(d.name));
		if (s.k === 'enum')
			s.items.forEach((it) => {
				locals.add(it.name);
				constants.add(it.name);
			});
		if (s.k === 'block' && s.inline) s.body.forEach(collect);
	};
	prologue.forEach(collect);
	const out = actions.map((body) => {
		const c = new Checker(scope, true, false);
		c.push(locals, constants);
		c.push();
		c.stmts(body);
		return c.diagnostics;
	});
	return { prologue: pc.diagnostics, actions: out, locals };
}

/** Library functions without side effects: evaluating a global's initializer may call them. */
const PURE_BUILTINS = new Set([
	'strlen',
	'strcmp',
	'strncmp',
	'strchr',
	'strrchr',
	'strstr',
	'atoi',
	'atol',
	'atof',
	'strtol',
	'strtod',
	'abs',
	'labs',
	'isalpha',
	'isdigit',
	'isalnum',
	'isspace',
	'isupper',
	'islower',
	'ispunct',
	'isxdigit',
	'isprint',
	'toupper',
	'tolower',
	'strdup',
	'malloc',
	'calloc'
]);

/** Names whose value comes from the running scanner (ECHO also writes output). */
const SCANNER_VALUES = new Set(['ECHO', 'YY_START', 'YYSTATE']);

function subexpressions(e: Expr): Expr[] {
	switch (e.k) {
		case 'unary':
		case 'incdec':
		case 'cast':
		case 'begin':
			return [e.arg];
		case 'sizeof':
			return e.arg ? [e.arg] : [];
		case 'binary':
		case 'logical':
			return [e.left, e.right];
		case 'assign':
			return [e.target, e.value];
		case 'cond':
			return [e.test, e.then, e.else];
		case 'index':
			return [e.arr, e.index];
		case 'comma':
			return e.items;
		case 'call':
			return e.args;
		default:
			return [];
	}
}

type Functions = CheckScope['functions'];

/** Whether the node itself (not counting its operands) can change a variable, write output, or switch the start condition. */
function effectAt(e: Expr, functions: Functions): boolean {
	if (e.k === 'assign' || e.k === 'incdec' || e.k === 'begin') return true;
	if (e.k === 'id') return e.name === 'ECHO';
	return e.k === 'call' && (functions.has(e.name) || !PURE_BUILTINS.has(e.name));
}

function hasEffects(e: Expr, functions: Functions): boolean {
	return effectAt(e, functions) || subexpressions(e).some((x) => hasEffects(x, functions));
}

/** Whether `e` can be evaluated before the program runs: no effects, no scanner state, no unknown values. */
function evaluable(e: Expr, unknown: ReadonlySet<string>, functions: Functions): boolean {
	if (effectAt(e, functions)) return false;
	if (e.k === 'id' && (unknown.has(e.name) || SCANNER_VALUES.has(e.name))) return false;
	return subexpressions(e).every((x) => evaluable(x, unknown, functions));
}

/** Hooks for the scratch machine; initializers that reach the scanner are never evaluated. */
const unavailable = (what: string) => (loc?: Loc) => {
	throw new CRuntimeError(`${what} is not available here`, loc);
};
const NO_SCANNER: FlexHooks = {
	yylex: unavailable('yylex()'),
	input: unavailable('input()'),
	yyless: (_n, loc) => unavailable('yyless()')(loc),
	begin: (_sc, loc) => unavailable('BEGIN')(loc),
	echo: unavailable('ECHO'),
	terminate: unavailable('yyterminate()'),
	yyStart: () => 0
};

/**
 * Elements of array, malloc() / calloc(), and strdup() memory the scratch
 * evaluation of the globals may allocate in total (see MachineOptions.memoryLimit). The spec is compiled on every edit, so a global whose
 * memory does not fit (with the ones before it) is left to the run, like one
 * that is not evaluable; its size is still checked.
 */
export const GLOBAL_CHECK_MEMORY = 100_000;

export interface GlobalScope extends CheckScope {
	/** Start condition names in declaration order (their values are 1, 2, …). */
	startConditions: readonly string[];
}

/**
 * Checks the global declarations and enums (`globals`, in text order) the way
 * the runtime initializes them before main runs, so their problems are
 * reported when the spec is compiled:
 *
 * - an initializer, array size, or enum value may use only names declared
 *   before it (`scope.globals` holds the names that exist from the start:
 *   flex's names, the start conditions, and extern declarations);
 * - it cannot call user functions, yyterminate(), or yyless();
 * - initializers without side effects are evaluated in a scratch interpreter,
 *   which reports what the runtime would (a pointer used as a number, a string
 *   too long for its array, too many initializers, division by zero, …). An
 *   initializer that reads a value not evaluated here, or a variable an earlier
 *   initializer with side effects may have changed, is left to the runtime, and
 *   so is an array or malloc() buffer past GLOBAL_CHECK_MEMORY elements in total.
 */
export function checkGlobals(globals: readonly Stmt[], scope: GlobalScope): Diagnostic[] {
	const c = new Checker(scope, false, false, true);
	c.push();
	const machine = new CMachine({
		budget: 100_000,
		outputLimit: 10_000,
		memoryLimit: GLOBAL_CHECK_MEMORY,
		hooks: NO_SCANNER
	});
	machine.defineConstant('INITIAL', 0);
	scope.startConditions.forEach((name, k) => machine.defineConstant(name, k + 1));
	/** Names whose value at run time is not known here. */
	const unknown = new Set<string>();
	/** Variables declared so far (not enum constants). */
	const variables: string[] = [];
	const out: Diagnostic[] = [];
	for (const s of globals) {
		if (s.k !== 'decl' && s.k !== 'enum') continue;
		const before = c.diagnostics.length;
		c.global(s);
		const exprs: Expr[] = [];
		const names: string[] = [];
		if (s.k === 'decl') {
			for (const d of s.decls) {
				if (d.array) exprs.push(d.array);
				if (d.init) exprs.push(...(d.init.k === 'list' ? d.init.items : [d.init]));
				names.push(d.name);
			}
		} else {
			for (const item of s.items) {
				if (item.value) exprs.push(item.value);
				names.push(item.name);
			}
		}
		let known =
			c.diagnostics.length === before && exprs.every((e) => evaluable(e, unknown, scope.functions));
		if (known) {
			try {
				machine.exec(s, machine.globals);
			} catch (e) {
				known = false;
				if (e instanceof CRuntimeError && !(e instanceof CLimitError)) {
					const loc = e.loc ?? s.loc;
					out.push({
						severity: 'error',
						message: e.message,
						span: { start: loc.start, end: loc.end, source: null }
					});
				}
			}
		}
		if (!known) names.forEach((n) => unknown.add(n));
		if (s.k === 'decl') variables.push(...names);
		// A call or an assignment may have changed any variable declared so far.
		if (exprs.some((e) => hasEffects(e, scope.functions))) variables.forEach((n) => unknown.add(n));
	}
	return [...c.diagnostics, ...out];
}
