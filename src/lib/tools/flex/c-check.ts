/**
 * Compile-time checks a C compiler would make before the program runs:
 * undeclared names, unknown functions, argument counts, and misplaced
 * break / continue / case labels.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Expr, FnDef, Loc, Stmt } from './c-ast';
import { BUILTIN_FUNCTIONS, BUILTIN_VALUES } from './c';

export interface CheckScope {
	/** Global variables, enum constants, start conditions, and flex's own names. */
	globals: ReadonlySet<string>;
	/** User functions: parameter count and whether they take `...`. */
	functions: ReadonlyMap<string, { params: number; variadic: boolean }>;
}

interface Frame {
	names: Set<string>;
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
		private readonly voidFn: boolean
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

	push(names: Iterable<string> = []): void {
		this.frames.push({ names: new Set(names) });
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

	stmts(body: Stmt[]): void {
		for (const s of body) this.stmt(s);
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
						if (d.init.k === 'list') d.init.items.forEach((e) => this.expr(e));
						else this.expr(d.init);
					}
					this.declare(d.name, d.loc);
				}
				break;
			case 'enum':
				for (const item of s.items) {
					if (item.value) this.expr(item.value);
					this.declare(item.name, item.loc);
				}
				break;
			case 'block':
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
	for (const s of prologue) {
		if (s.k === 'decl') s.decls.forEach((d) => locals.add(d.name));
		if (s.k === 'enum') s.items.forEach((it) => locals.add(it.name));
	}
	const out = actions.map((body) => {
		const c = new Checker(scope, true, false);
		c.push(locals);
		c.push();
		c.stmts(body);
		return c.diagnostics;
	});
	return { prologue: pc.diagnostics, actions: out, locals };
}
