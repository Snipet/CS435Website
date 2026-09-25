/**
 * Interpreter for the C subset that flex actions and user code use.
 *
 * Declarations: int, long, short, unsigned, char, double/float, char *,
 * FILE *, one-dimensional arrays, enum, typedef, #define NAME value.
 * Statements: expression, block, if/else, while, do-while, for, switch,
 * return, break, continue. Expressions: C operators with C precedence,
 * short-circuit && and ||, ?:, assignments, ++/--, indexing, pointer
 * arithmetic on arrays and strings, casts, sizeof, calls.
 *
 * Built-ins: printf/fprintf/sprintf, puts, putchar, fputs, fputc/putc,
 * strlen, strcmp, strncmp, strcpy, strncpy, strcat, strdup, strchr, strstr,
 * atoi, atol, atof, strtol, abs, the <ctype.h> tests, malloc/calloc/free,
 * exit, plus the flex hooks (yylex, ECHO, BEGIN, yyless, yyterminate,
 * input, YY_START) supplied by the runtime.
 *
 * Every run has a step budget, so a program that loops forever stops with a
 * diagnostic instead of freezing the page.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import {
	CHAR_PTR,
	INT,
	typeName,
	type CType,
	type Declarator,
	type Expr,
	type FnDef,
	type Loc,
	type Stmt
} from './c-ast';
import { formatC, type FormatArg } from './c-format';

export type Stream = 'stdin' | 'stdout' | 'stderr';

/** A C array or string: numbers for char/int/double elements, values for pointer elements. */
export interface Mem {
	elem: CType;
	data: (number | Val)[];
	readonly: boolean;
	/** For messages: the variable or "a string literal". */
	name: string;
}

export type Val =
	| { t: 'i'; v: number }
	| { t: 'd'; v: number }
	| { t: 'p'; m: Mem | null; o: number }
	| { t: 'f'; s: Stream }
	| { t: 'v' };

interface Slot {
	type: CType;
	val: Val;
	/** Arrays: the storage (the name reads as a pointer to it). */
	arr?: Mem;
	/** Enum constants, EOF, stdout, …: not assignable. */
	konst?: boolean;
}

export class Env {
	readonly vars = new Map<string, Slot>();
	constructor(readonly parent: Env | null) {}
	get(name: string): Slot | undefined {
		return this.vars.get(name) ?? this.parent?.get(name);
	}
}

/** A problem while the program runs; becomes a diagnostic. */
export class CRuntimeError extends Error {
	constructor(
		message: string,
		readonly loc?: Loc
	) {
		super(message);
	}
}

/** The step budget or the output limit ran out. */
export class CLimitError extends CRuntimeError {}

/** exit(status) */
export class ExitSignal {
	constructor(readonly status: number) {}
}

/**
 * yyterminate(). flex defines it as the macro `return YY_NULL` (YY_NULL is 0),
 * so it returns 0 from the function it is written in: yylex for an action or
 * the code before the first rule, otherwise the enclosing user function (main
 * included). The innermost function call or yylex action catches it.
 */
export class TerminateSignal {
	constructor(readonly value: number) {}
}

export interface OutputChunk {
	stream: 'stdout' | 'stderr';
	text: string;
	/** Written by ECHO (an action's ECHO or the default rule). */
	echo: boolean;
	/** Index of the scanner step this belongs to (-1 before the first match). */
	at: number;
	/** Written by a rule's action (as opposed to main or other user code). */
	inAction: boolean;
}

/** What the flex runtime provides to C code. */
export interface FlexHooks {
	yylex(loc: Loc): number;
	input(loc: Loc): number;
	yyless(n: number, loc: Loc): void;
	begin(sc: number, loc: Loc): void;
	echo(loc: Loc): void;
	/** yyterminate(): throws a TerminateSignal (`return 0` from the enclosing function or yylex). */
	terminate(loc: Loc): never;
	yyStart(): number;
}

const NORMAL = 0;
const BREAK = 1;
const CONTINUE = 2;
const RETURN = 3;

const VOID: Val = { t: 'v' };
/**
 * The value of a `return;` without an expression (a void value like VOID, but
 * a distinct object), so the runtime can tell it from `return f();` where f
 * returns void.
 */
export const BARE_RETURN: Val = { t: 'v' };
const i = (v: number): Val => ({ t: 'i', v });
const d = (v: number): Val => ({ t: 'd', v });
const NULLP: Val = { t: 'p', m: null, o: 0 };

export const MAX_CALL_DEPTH = 200;
const MAX_ARRAY = 1_000_000;

/** Names the machine provides (functions). */
export const BUILTIN_FUNCTIONS = new Set([
	'printf',
	'fprintf',
	'sprintf',
	'snprintf',
	'puts',
	'fputs',
	'putchar',
	'putc',
	'fputc',
	'fflush',
	'fwrite',
	'strlen',
	'strcmp',
	'strncmp',
	'strcpy',
	'strncpy',
	'strcat',
	'strdup',
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
	'malloc',
	'calloc',
	'free',
	'exit',
	'yylex',
	'yyless',
	'yyterminate',
	'input',
	'yywrap'
]);

/** Identifiers the machine provides (values). */
export const BUILTIN_VALUES = new Set(['ECHO', 'YY_START', 'YYSTATE']);

const isIntBase = (t: CType) =>
	t.ptr === 0 && t.base !== 'double' && t.base !== 'void' && t.base !== 'FILE';

function wrap(v: number, t: CType): number {
	switch (t.base) {
		case 'char':
			return (v << 24) >> 24;
		case 'uchar':
			return v & 0xff;
		case 'short':
			return (v << 16) >> 16;
		case 'ushort':
			return v & 0xffff;
		case 'int':
			return Number.isSafeInteger(v) ? v | 0 : Number(BigInt.asIntN(32, BigInt(Math.trunc(v))));
		case 'uint':
			return Number.isSafeInteger(v) ? v >>> 0 : Number(BigInt.asUintN(32, BigInt(Math.trunc(v))));
		default:
			return v;
	}
}

function sizeOf(t: CType): number {
	if (t.ptr) return 8;
	switch (t.base) {
		case 'char':
		case 'uchar':
			return 1;
		case 'short':
		case 'ushort':
			return 2;
		case 'int':
		case 'uint':
			return 4;
		case 'void':
			return 1;
		default:
			return 8;
	}
}

export interface MachineOptions {
	/** Statements and loop iterations before the run stops. */
	budget: number;
	/** Characters of output before the run stops. */
	outputLimit: number;
	hooks: FlexHooks;
}

export class CMachine {
	readonly globals = new Env(null);
	readonly functions = new Map<string, FnDef>();
	readonly output: OutputChunk[] = [];
	readonly warnings: Diagnostic[] = [];
	private readonly warned = new Set<string>();
	private outputSize = 0;
	steps = 0;
	/** Output attribution, set by the runtime. */
	at = -1;
	inAction = false;
	private depth = 0;
	private retVal: Val = VOID;
	private readonly literals = new WeakMap<Expr, Mem>();
	/** Block-scope static variables, created the first time their declaration runs. */
	private readonly statics = new WeakMap<Declarator, Slot>();

	constructor(private readonly opts: MachineOptions) {
		const g = this.globals.vars;
		const file = (s: Stream): Slot => ({
			type: { base: 'FILE', ptr: 1 },
			val: { t: 'f', s },
			konst: true
		});
		g.set('stdin', file('stdin'));
		g.set('stdout', file('stdout'));
		g.set('stderr', file('stderr'));
		g.set('yyin', { type: { base: 'FILE', ptr: 1 }, val: { t: 'f', s: 'stdin' } });
		g.set('yyout', { type: { base: 'FILE', ptr: 1 }, val: { t: 'f', s: 'stdout' } });
		g.set('EOF', { type: INT, val: i(-1), konst: true });
		g.set('NULL', { type: { base: 'void', ptr: 1 }, val: NULLP, konst: true });
		g.set('yytext', { type: CHAR_PTR, val: { t: 'p', m: this.chars('', 'yytext'), o: 0 } });
		g.set('yyleng', { type: INT, val: i(0) });
		g.set('yylineno', { type: INT, val: i(1) });
	}

	// ---------------------------------------------------------------------------
	// Setup and access from the runtime

	/** Defines an int constant (start condition names, INITIAL). */
	defineConstant(name: string, value: number): void {
		this.globals.vars.set(name, { type: INT, val: i(value), konst: true });
	}

	/** A new char array holding `s` and a terminating NUL. */
	chars(s: string, name: string, readonly = false): Mem {
		const data: number[] = [];
		for (const ch of s) data.push(ch.codePointAt(0)!);
		data.push(0);
		return { elem: { base: 'char', ptr: 0 }, data, readonly, name };
	}

	setGlobalInt(name: string, v: number): void {
		const slot = this.globals.vars.get(name);
		if (slot) slot.val = i(v);
	}

	getGlobalInt(name: string): number {
		const slot = this.globals.vars.get(name);
		return slot && (slot.val.t === 'i' || slot.val.t === 'd') ? slot.val.v : 0;
	}

	setYytext(text: string): void {
		const slot = this.globals.vars.get('yytext')!;
		slot.val = { t: 'p', m: this.chars(text, 'yytext'), o: 0 };
		this.globals.vars.get('yyleng')!.val = i(text.length);
	}

	/** The stream yyout points to. */
	yyout(): 'stdout' | 'stderr' {
		const v = this.globals.vars.get('yyout')?.val;
		return v?.t === 'f' && v.s === 'stderr' ? 'stderr' : 'stdout';
	}

	/** Int/double globals declared by the program (for watches). */
	numericGlobal(name: string): boolean {
		const s = this.globals.vars.get(name);
		return !!s && !s.konst && !s.arr && s.type.ptr === 0 && s.type.base !== 'FILE';
	}

	write(stream: 'stdout' | 'stderr', text: string, echo = false): void {
		if (!text) return;
		this.outputSize += text.length;
		if (this.outputSize > this.opts.outputLimit) {
			throw new CLimitError(
				`stopped: the program wrote more than ${this.opts.outputLimit.toLocaleString('en-US')} characters`
			);
		}
		const last = this.output[this.output.length - 1];
		if (
			last &&
			last.stream === stream &&
			last.echo === echo &&
			last.at === this.at &&
			last.inAction === this.inAction
		)
			last.text += text;
		else this.output.push({ stream, text, echo, at: this.at, inAction: this.inAction });
	}

	private warnOnce(message: string, loc?: Loc): void {
		const key = `${message}@${loc?.start}`;
		if (this.warned.has(key)) return;
		this.warned.add(key);
		this.warnings.push({
			severity: 'warning',
			message,
			span: loc ? { start: loc.start, end: loc.end, source: null } : undefined
		});
	}

	tick(loc?: Loc): void {
		if (++this.steps > this.opts.budget) {
			throw new CLimitError(
				`stopped after ${this.opts.budget.toLocaleString('en-US')} steps: the program may loop forever`,
				loc
			);
		}
	}

	/** Runs top-level declarations and registers functions. */
	loadGlobals(stmts: Stmt[]): void {
		for (const s of stmts) this.exec(s, this.globals);
	}

	addFunction(fn: FnDef): void {
		this.functions.set(fn.name, fn);
	}

	/** Calls a user function with ints/strings from outside (main's argc/argv). */
	call(name: string, args: Val[], loc: Loc): Val {
		const fn = this.functions.get(name);
		if (!fn) throw new CRuntimeError(`${name}() is not defined`, loc);
		return this.callUser(fn, args, loc);
	}

	/** argv for main: { "./a.out", NULL }. */
	argv(): Val {
		const prog = this.chars('./a.out', 'argv[0]', true);
		const arr: Mem = {
			elem: CHAR_PTR,
			data: [{ t: 'p', m: prog, o: 0 }, NULLP],
			readonly: false,
			name: 'argv'
		};
		return { t: 'p', m: arr, o: 0 };
	}

	/**
	 * Runs statements in `env` (an action or the code before the first rule).
	 * Returns the value of a `return` (BARE_RETURN for `return;`), or null
	 * when the code finishes.
	 */
	runBody(body: Stmt[], env: Env): Val | null {
		for (const s of body) {
			const c = this.exec(s, env);
			if (c === RETURN) return this.retVal;
			// break/continue at the top of an action end the action (flex wraps it in a switch).
			if (c !== NORMAL) return null;
		}
		return null;
	}

	toInt(v: Val, loc?: Loc): number {
		if (v.t === 'i') return v.v;
		if (v.t === 'd') return Math.trunc(v.v);
		if (v.t === 'p' && v.m === null) return 0;
		throw new CRuntimeError('expected a number here', loc);
	}

	// ---------------------------------------------------------------------------
	// Statements

	exec(s: Stmt, env: Env): number {
		this.tick(s.loc);
		switch (s.k) {
			case 'expr':
				this.eval(s.e, env);
				return NORMAL;
			case 'decl':
				if (s.static && env !== this.globals) {
					// Block-scope static: one variable for the whole run, initialized once.
					for (const decl of s.decls) {
						let slot = this.statics.get(decl);
						if (!slot) {
							slot = this.makeSlot(decl, env);
							this.statics.set(decl, slot);
						}
						env.vars.set(decl.name, slot);
					}
					return NORMAL;
				}
				for (const decl of s.decls) env.vars.set(decl.name, this.makeSlot(decl, env));
				return NORMAL;
			case 'enum': {
				let next = 0;
				for (const item of s.items) {
					if (item.value) next = this.toInt(this.eval(item.value, env), item.loc);
					env.vars.set(item.name, { type: INT, val: i(next), konst: true });
					next++;
				}
				return NORMAL;
			}
			case 'block': {
				const inner = s.inline ? env : new Env(env);
				for (const st of s.body) {
					const c = this.exec(st, inner);
					if (c !== NORMAL) return c;
				}
				return NORMAL;
			}
			case 'if':
				if (this.truthy(this.eval(s.test, env), s.test.loc)) return this.exec(s.then, env);
				return s.else ? this.exec(s.else, env) : NORMAL;
			case 'while':
				while (this.truthy(this.eval(s.test, env), s.test.loc)) {
					const c = this.exec(s.body, env);
					if (c === BREAK) break;
					if (c === RETURN) return c;
				}
				return NORMAL;
			case 'do':
				do {
					const c = this.exec(s.body, env);
					if (c === BREAK) break;
					if (c === RETURN) return c;
				} while (this.truthy(this.eval(s.test, env), s.test.loc));
				return NORMAL;
			case 'for': {
				const inner = new Env(env);
				if (s.init) this.exec(s.init, inner);
				for (;;) {
					if (s.test && !this.truthy(this.eval(s.test, inner), s.test.loc)) break;
					const c = this.exec(s.body, inner);
					if (c === BREAK) break;
					if (c === RETURN) return c;
					if (s.update) this.eval(s.update, inner);
					this.tick(s.loc);
				}
				return NORMAL;
			}
			case 'return':
				this.retVal = s.e ? this.eval(s.e, env) : BARE_RETURN;
				return RETURN;
			case 'break':
				return BREAK;
			case 'continue':
				return CONTINUE;
			case 'switch': {
				const v = this.toInt(this.eval(s.e, env), s.e.loc);
				let start = -1;
				let dflt = -1;
				for (let k = 0; k < s.body.length && start < 0; k++) {
					const st = s.body[k];
					if (st.k === 'case' && this.toInt(this.eval(st.e, env), st.loc) === v) start = k;
					else if (st.k === 'default') dflt = k;
				}
				if (start < 0) start = dflt;
				if (start < 0) return NORMAL;
				const inner = new Env(env);
				for (let k = start; k < s.body.length; k++) {
					const st = s.body[k];
					if (st.k === 'case' || st.k === 'default') continue;
					const c = this.exec(st, inner);
					if (c === BREAK) return NORMAL;
					if (c !== NORMAL) return c;
				}
				return NORMAL;
			}
			case 'case':
			case 'default':
			case 'empty':
				return NORMAL;
		}
	}

	private zero(t: CType): Val {
		if (t.ptr) return NULLP;
		if (t.base === 'double') return d(0);
		return i(0);
	}

	/** A new variable for `decl`, initialized (initializers are evaluated in `env`). */
	private makeSlot(decl: Declarator, env: Env): Slot {
		if (decl.array === undefined) {
			let val: Val;
			if (!decl.init) val = this.zero(decl.type);
			else if (decl.init.k === 'list') {
				if (decl.init.items.length !== 1)
					throw new CRuntimeError(`${decl.name} is not an array`, decl.init.loc);
				val = this.convert(this.eval(decl.init.items[0], env), decl.type, decl.loc);
			} else val = this.convert(this.eval(decl.init, env), decl.type, decl.init.loc);
			return { type: decl.type, val };
		}
		const init = decl.init;
		let len: number | null = decl.array
			? this.toInt(this.eval(decl.array, env), decl.array.loc)
			: null;
		let str: string | null = null;
		if (init && init.k !== 'list') {
			const v = this.eval(init, env);
			if (v.t !== 'p' || decl.type.ptr !== 0 || !decl.type.base.includes('char'))
				throw new CRuntimeError(
					`array ${decl.name} needs { … } or a string to initialize it`,
					init.loc
				);
			str = this.cstr(v, init.loc) ?? '';
			len ??= [...str].length + 1;
		}
		if (init && init.k === 'list') len ??= init.items.length;
		if (len === null) throw new CRuntimeError(`array ${decl.name} needs a size`, decl.loc);
		if (len <= 0 || len > MAX_ARRAY)
			throw new CRuntimeError(`array ${decl.name} has a bad size (${len})`, decl.loc);
		const elem = decl.type;
		const data: (number | Val)[] = new Array(len);
		const zero = this.zero(elem);
		for (let k = 0; k < len; k++) data[k] = elem.ptr ? zero : 0;
		const mem: Mem = { elem, data, readonly: false, name: decl.name };
		if (str !== null) {
			const cps = [...str].map((c) => c.codePointAt(0)!);
			if (cps.length > len)
				throw new CRuntimeError(`the string is too long for ${decl.name}[${len}]`, decl.loc);
			cps.forEach((cp, k) => (data[k] = cp));
		} else if (init && init.k === 'list') {
			if (init.items.length > len)
				throw new CRuntimeError(`too many initializers for ${decl.name}[${len}]`, init.loc);
			init.items.forEach((item, k) => this.storeMem(mem, k, this.eval(item, env), item.loc));
		}
		return { type: elem, val: { t: 'p', m: mem, o: 0 }, arr: mem };
	}

	// ---------------------------------------------------------------------------
	// Values

	truthy(v: Val, loc?: Loc): boolean {
		switch (v.t) {
			case 'i':
			case 'd':
				return v.v !== 0;
			case 'p':
				return v.m !== null;
			case 'f':
				return true;
			default:
				throw new CRuntimeError('a void value cannot be tested', loc);
		}
	}

	convert(v: Val, t: CType, loc?: Loc): Val {
		if (t.base === 'void' && t.ptr === 0) return VOID;
		if (t.ptr > 0) {
			if (v.t === 'p' || v.t === 'f') return v;
			if (v.t === 'i' && v.v === 0) return NULLP;
			throw new CRuntimeError(`cannot use ${describe(v)} as ${typeName(t)}`, loc);
		}
		if (v.t === 'v') throw new CRuntimeError('a void value cannot be used', loc);
		if (v.t === 'p' || v.t === 'f')
			throw new CRuntimeError(`cannot use a pointer as ${typeName(t)}`, loc);
		if (t.base === 'double') return d(v.v);
		return i(wrap(Math.trunc(v.v), t));
	}

	/** A C string from a char pointer; null for NULL. */
	cstr(v: Val, loc?: Loc): string | null {
		if (v.t !== 'p') throw new CRuntimeError('expected a string (char *)', loc);
		if (!v.m) return null;
		const { data } = v.m;
		if (v.o < 0 || v.o > data.length)
			throw new CRuntimeError(`pointer is outside ${v.m.name}`, loc);
		let s = '';
		for (let k = v.o; k < data.length; k++) {
			const c = data[k];
			if (typeof c !== 'number') throw new CRuntimeError('expected a string (char *)', loc);
			if (c === 0) return s;
			s += String.fromCodePoint(c < 0 ? c & 0xff : c);
		}
		return s;
	}

	private load(m: Mem, o: number, loc: Loc): Val {
		if (o < 0 || o >= m.data.length)
			throw new CRuntimeError(
				`index ${o} is outside ${m.name} (valid: 0…${m.data.length - 1})`,
				loc
			);
		const c = m.data[o];
		if (typeof c !== 'number') return c;
		return m.elem.base === 'double' ? d(c) : i(c);
	}

	private storeMem(m: Mem, o: number, v: Val, loc: Loc): Val {
		if (m.readonly) throw new CRuntimeError(`cannot modify ${m.name}`, loc);
		if (o < 0 || o >= m.data.length)
			throw new CRuntimeError(
				`index ${o} is outside ${m.name} (valid: 0…${m.data.length - 1})`,
				loc
			);
		const c = this.convert(v, m.elem, loc);
		m.data[o] = m.elem.ptr ? c : (c as { v: number }).v;
		return c;
	}

	private literal(e: Expr & { k: 'str' }): Mem {
		let m = this.literals.get(e);
		if (!m) {
			m = this.chars(e.v, 'a string literal', true);
			this.literals.set(e, m);
		}
		return m;
	}

	private ref(
		e: Expr,
		env: Env
	): { k: 'slot'; slot: Slot; name: string } | { k: 'mem'; m: Mem; o: number } {
		if (e.k === 'id') {
			const slot = env.get(e.name);
			if (!slot) throw new CRuntimeError(`${e.name} is undeclared`, e.loc);
			if (slot.arr) throw new CRuntimeError(`cannot assign to the array ${e.name}`, e.loc);
			if (slot.konst) throw new CRuntimeError(`${e.name} is a constant`, e.loc);
			return { k: 'slot', slot, name: e.name };
		}
		if (e.k === 'index') {
			const base = this.eval(e.arr, env);
			const idx = this.toInt(this.eval(e.index, env), e.index.loc);
			return this.pointee(base, idx, e.loc);
		}
		if (e.k === 'unary' && e.op === '*') return this.pointee(this.eval(e.arg, env), 0, e.loc);
		throw new CRuntimeError('this expression cannot be assigned to', e.loc);
	}

	private pointee(base: Val, idx: number, loc: Loc): { k: 'mem'; m: Mem; o: number } {
		if (base.t !== 'p') throw new CRuntimeError('only arrays and pointers can be indexed', loc);
		if (!base.m) throw new CRuntimeError('NULL pointer used', loc);
		return { k: 'mem', m: base.m, o: base.o + idx };
	}

	private get(r: ReturnType<CMachine['ref']>, loc: Loc): Val {
		return r.k === 'slot' ? r.slot.val : this.load(r.m, r.o, loc);
	}

	private set(r: ReturnType<CMachine['ref']>, v: Val, loc: Loc): Val {
		if (r.k === 'slot') {
			const c = this.convert(v, r.slot.type, loc);
			r.slot.val = c;
			return c;
		}
		return this.storeMem(r.m, r.o, v, loc);
	}

	// ---------------------------------------------------------------------------
	// Expressions

	eval(e: Expr, env: Env): Val {
		switch (e.k) {
			case 'num':
				return e.float ? d(e.v) : i(e.v);
			case 'char':
				return i(e.v);
			case 'str':
				return { t: 'p', m: this.literal(e), o: 0 };
			case 'id':
				return this.readId(e.name, env, e.loc);
			case 'unary':
				return this.unary(e, env);
			case 'incdec': {
				const r = this.ref(e.arg, env);
				const old = this.get(r, e.loc);
				const next = this.set(r, this.binop(e.op === '++' ? '+' : '-', old, i(1), e.loc), e.loc);
				return e.prefix ? next : old;
			}
			case 'binary':
				return this.binop(e.op, this.eval(e.left, env), this.eval(e.right, env), e.loc);
			case 'logical': {
				const l = this.truthy(this.eval(e.left, env), e.left.loc);
				if (e.op === '&&') return i(l && this.truthy(this.eval(e.right, env), e.right.loc) ? 1 : 0);
				return i(l || this.truthy(this.eval(e.right, env), e.right.loc) ? 1 : 0);
			}
			case 'assign': {
				const r = this.ref(e.target, env);
				const v = this.eval(e.value, env);
				if (e.op === '=') return this.set(r, v, e.loc);
				const old = this.get(r, e.loc);
				return this.set(r, this.binop(e.op.slice(0, -1), old, v, e.loc), e.loc);
			}
			case 'cond':
				return this.truthy(this.eval(e.test, env), e.test.loc)
					? this.eval(e.then, env)
					: this.eval(e.else, env);
			case 'call':
				return this.callExpr(e, env);
			case 'index': {
				const base = this.eval(e.arr, env);
				const idx = this.toInt(this.eval(e.index, env), e.index.loc);
				const r = this.pointee(base, idx, e.loc);
				return this.load(r.m, r.o, e.loc);
			}
			case 'cast': {
				const v = this.eval(e.arg, env);
				if (e.type.ptr > 0 && v.t === 'p') return v;
				return this.convert(v, e.type, e.loc);
			}
			case 'sizeof': {
				if (e.type) return i(sizeOf(e.type));
				const a = e.arg!;
				if (a.k === 'id') {
					const slot = env.get(a.name);
					if (slot?.arr) return i(slot.arr.data.length * sizeOf(slot.arr.elem));
					if (slot) return i(sizeOf(slot.type));
				}
				if (a.k === 'str') return i([...a.v].length + 1);
				const v = this.eval(a, env);
				return i(v.t === 'd' ? 8 : v.t === 'i' ? 4 : 8);
			}
			case 'comma': {
				let v: Val = VOID;
				for (const item of e.items) v = this.eval(item, env);
				return v;
			}
			case 'begin':
				this.opts.hooks.begin(this.toInt(this.eval(e.arg, env), e.arg.loc), e.loc);
				return VOID;
		}
	}

	private readId(name: string, env: Env, loc: Loc): Val {
		const slot = env.get(name);
		if (slot) return slot.val;
		if (name === 'ECHO') {
			this.opts.hooks.echo(loc);
			return VOID;
		}
		if (name === 'YY_START' || name === 'YYSTATE') return i(this.opts.hooks.yyStart());
		if (this.functions.has(name) || BUILTIN_FUNCTIONS.has(name))
			throw new CRuntimeError(`${name} is a function; call it as ${name}(…)`, loc);
		throw new CRuntimeError(`${name} is undeclared`, loc);
	}

	private unary(e: Expr & { k: 'unary' }, env: Env): Val {
		if (e.op === '&') {
			const a = e.arg;
			if (a.k === 'index') {
				const base = this.eval(a.arr, env);
				const idx = this.toInt(this.eval(a.index, env), a.index.loc);
				const r = this.pointee(base, idx, e.loc);
				return { t: 'p', m: r.m, o: r.o };
			}
			if (a.k === 'id' && env.get(a.name)?.arr) return this.eval(a, env);
			throw new CRuntimeError('& (address-of) works only on array elements here', e.loc);
		}
		const v = this.eval(e.arg, env);
		switch (e.op) {
			case '*': {
				const r = this.pointee(v, 0, e.loc);
				return this.load(r.m, r.o, e.loc);
			}
			case '!':
				return i(this.truthy(v, e.loc) ? 0 : 1);
			case '-':
				if (v.t === 'd') return d(-v.v);
				return i(-this.toInt(v, e.loc));
			case '+':
				if (v.t === 'd') return v;
				return i(this.toInt(v, e.loc));
			case '~':
				if (v.t === 'd') throw new CRuntimeError('~ needs an integer', e.loc);
				return i(~this.toInt(v, e.loc));
		}
	}

	binop(op: string, a: Val, b: Val, loc: Loc): Val {
		if (a.t === 'p' || b.t === 'p') return this.ptrOp(op, a, b, loc);
		if (a.t === 'f' || b.t === 'f') {
			if (op === '==' || op === '!=') {
				const same = a.t === b.t && (a as { s: Stream }).s === (b as { s: Stream }).s;
				return i(same === (op === '==') ? 1 : 0);
			}
			throw new CRuntimeError(`invalid operands to ${op}`, loc);
		}
		if (a.t === 'v' || b.t === 'v') throw new CRuntimeError('a void value cannot be used', loc);
		const dbl = a.t === 'd' || b.t === 'd';
		const x = a.v;
		const y = b.v;
		switch (op) {
			case '+':
				return dbl ? d(x + y) : i(x + y);
			case '-':
				return dbl ? d(x - y) : i(x - y);
			case '*': {
				if (dbl) return d(x * y);
				const p = x * y;
				return i(Number.isSafeInteger(p) ? p : Number(BigInt.asIntN(64, BigInt(x) * BigInt(y))));
			}
			case '/':
				if (dbl) return d(x / y);
				if (y === 0) throw new CRuntimeError('division by zero', loc);
				return i(Math.trunc(x / y));
			case '%':
				if (dbl) throw new CRuntimeError('% needs integer operands', loc);
				if (y === 0) throw new CRuntimeError('division by zero (%)', loc);
				return i(x % y);
			case '<':
				return i(x < y ? 1 : 0);
			case '>':
				return i(x > y ? 1 : 0);
			case '<=':
				return i(x <= y ? 1 : 0);
			case '>=':
				return i(x >= y ? 1 : 0);
			case '==':
				return i(x === y ? 1 : 0);
			case '!=':
				return i(x !== y ? 1 : 0);
		}
		if (dbl) throw new CRuntimeError(`${op} needs integer operands`, loc);
		switch (op) {
			case '<<':
				return i(x << y);
			case '>>':
				return i(x >> y);
			case '&':
				return i(x & y);
			case '|':
				return i(x | y);
			case '^':
				return i(x ^ y);
		}
		throw new CRuntimeError(`unknown operator ${op}`, loc);
	}

	private ptrOp(op: string, a: Val, b: Val, loc: Loc): Val {
		const asPtr = (v: Val) => (v.t === 'i' && v.v === 0 ? NULLP : v);
		if (op === '+' || op === '-') {
			if (a.t === 'p' && b.t === 'i') return { t: 'p', m: a.m, o: a.o + (op === '+' ? b.v : -b.v) };
			if (op === '+' && a.t === 'i' && b.t === 'p') return { t: 'p', m: b.m, o: b.o + a.v };
			if (op === '-' && a.t === 'p' && b.t === 'p') {
				if (a.m !== b.m) throw new CRuntimeError('subtracting pointers into different arrays', loc);
				return i(a.o - b.o);
			}
			throw new CRuntimeError(`invalid pointer arithmetic with ${op}`, loc);
		}
		const x = asPtr(a);
		const y = asPtr(b);
		if (x.t !== 'p' || y.t !== 'p')
			throw new CRuntimeError(`cannot compare a pointer with a number`, loc);
		if (op === '==' || op === '!=') {
			const same = x.m === y.m && (x.m === null || x.o === y.o);
			return i(same === (op === '==') ? 1 : 0);
		}
		if (x.m !== y.m) throw new CRuntimeError('comparing pointers into different arrays', loc);
		switch (op) {
			case '<':
				return i(x.o < y.o ? 1 : 0);
			case '>':
				return i(x.o > y.o ? 1 : 0);
			case '<=':
				return i(x.o <= y.o ? 1 : 0);
			case '>=':
				return i(x.o >= y.o ? 1 : 0);
		}
		throw new CRuntimeError(`invalid operands to ${op}`, loc);
	}

	// ---------------------------------------------------------------------------
	// Calls

	private callUser(fn: FnDef, args: Val[], loc: Loc): Val {
		if (args.length < fn.params.length || (!fn.variadic && args.length > fn.params.length)) {
			throw new CRuntimeError(
				`${fn.name}() takes ${fn.params.length} argument${fn.params.length === 1 ? '' : 's'} but got ${args.length}`,
				loc
			);
		}
		if (this.depth >= MAX_CALL_DEPTH)
			throw new CRuntimeError(
				`calls nested more than ${MAX_CALL_DEPTH} deep (endless recursion?)`,
				loc
			);
		this.depth++;
		try {
			const env = new Env(this.globals);
			fn.params.forEach((p, k) => {
				if (p.name) env.vars.set(p.name, { type: p.type, val: this.convert(args[k], p.type, loc) });
			});
			let ret: Val | null = null;
			try {
				for (const s of fn.body) {
					const c = this.exec(s, env);
					if (c === RETURN) {
						ret = this.retVal;
						break;
					}
				}
			} catch (e) {
				// yyterminate() in this function's own code: `return 0` from it.
				if (!(e instanceof TerminateSignal)) throw e;
				ret = i(e.value);
			}
			if (fn.ret.base === 'void' && fn.ret.ptr === 0) return VOID;
			return ret && ret.t !== 'v' ? this.convert(ret, fn.ret, loc) : this.zero(fn.ret);
		} finally {
			this.depth--;
		}
	}

	private callExpr(e: Expr & { k: 'call' }, env: Env): Val {
		const fn = this.functions.get(e.name);
		if (fn) {
			const args = e.args.map((a) => this.eval(a, env));
			return this.callUser(fn, args, e.loc);
		}
		const args = e.args.map((a) => this.eval(a, env));
		return this.builtin(e.name, args, e);
	}

	private stream(v: Val, loc: Loc): 'stdout' | 'stderr' {
		if (v.t !== 'f') throw new CRuntimeError('expected a stream (stdout or stderr)', loc);
		if (v.s === 'stdin') throw new CRuntimeError('cannot write to stdin', loc);
		return v.s;
	}

	private format(fmtVal: Val, rest: Val[], loc: Loc): string {
		const fmt = this.cstr(fmtVal, loc);
		if (fmt === null) throw new CRuntimeError('the format string is NULL', loc);
		let k = 0;
		const res = formatC(fmt, (): FormatArg | undefined => {
			const v = rest[k++];
			if (!v) return undefined;
			if (v.t === 'i') return { t: 'int', v: v.v };
			if (v.t === 'd') return { t: 'double', v: v.v };
			if (v.t === 'p') return { t: 'str', v: this.cstr(v, loc) };
			return { t: 'int', v: 0 };
		});
		for (const w of res.warnings) this.warnOnce(w, loc);
		if (res.error) throw new CRuntimeError(res.error, loc);
		if (k < rest.length) this.warnOnce('more arguments than the format string uses', loc);
		return res.text;
	}

	private need(name: string, args: Val[], n: number, loc: Loc): void {
		if (args.length !== n)
			throw new CRuntimeError(
				`${name}() takes ${n} argument${n === 1 ? '' : 's'} but got ${args.length}`,
				loc
			);
	}

	private builtin(name: string, args: Val[], e: Expr & { k: 'call' }): Val {
		const loc = e.loc;
		const hooks = this.opts.hooks;
		const str = (v: Val) => {
			const s = this.cstr(v, loc);
			if (s === null) throw new CRuntimeError(`${name}() got a NULL pointer`, loc);
			return s;
		};
		const ctype = (test: (c: number) => boolean): Val => {
			this.need(name, args, 1, loc);
			return i(test(this.toInt(args[0], loc)) ? 1 : 0);
		};
		switch (name) {
			case 'printf': {
				if (args.length < 1) throw new CRuntimeError('printf() needs a format string', loc);
				const text = this.format(args[0], args.slice(1), loc);
				this.write('stdout', text);
				return i(text.length);
			}
			case 'fprintf': {
				if (args.length < 2)
					throw new CRuntimeError('fprintf() needs a stream and a format string', loc);
				const text = this.format(args[1], args.slice(2), loc);
				this.write(this.stream(args[0], loc), text);
				return i(text.length);
			}
			case 'sprintf':
			case 'snprintf': {
				const n = name === 'snprintf' ? 1 : 0;
				if (args.length < 2 + n)
					throw new CRuntimeError(`${name}() needs a buffer and a format string`, loc);
				let text = this.format(args[1 + n], args.slice(2 + n), loc);
				const full = text.length;
				if (n) {
					const max = this.toInt(args[1], loc);
					if (max <= 0) return i(full);
					text = [...text].slice(0, max - 1).join('');
				}
				this.writeString(args[0], text, loc, name);
				return i(full);
			}
			case 'puts':
				this.need(name, args, 1, loc);
				this.write('stdout', str(args[0]) + '\n');
				return i(1);
			case 'fputs':
				this.need(name, args, 2, loc);
				this.write(this.stream(args[1], loc), str(args[0]));
				return i(1);
			case 'putchar': {
				this.need(name, args, 1, loc);
				const c = this.toInt(args[0], loc);
				this.write('stdout', String.fromCodePoint(c < 0 ? c & 0xff : c));
				return i(c);
			}
			case 'putc':
			case 'fputc': {
				this.need(name, args, 2, loc);
				const c = this.toInt(args[0], loc);
				this.write(this.stream(args[1], loc), String.fromCodePoint(c < 0 ? c & 0xff : c));
				return i(c);
			}
			case 'fwrite': {
				this.need(name, args, 4, loc);
				const n = this.toInt(args[1], loc) * this.toInt(args[2], loc);
				const s = [...str(args[0])].slice(0, n).join('');
				this.write(this.stream(args[3], loc), s);
				return i(this.toInt(args[2], loc));
			}
			case 'fflush':
				return i(0);
			case 'strlen':
				this.need(name, args, 1, loc);
				return i([...str(args[0])].length);
			case 'strcmp':
			case 'strncmp': {
				this.need(name, args, name === 'strcmp' ? 2 : 3, loc);
				let a = [...str(args[0])];
				let b = [...str(args[1])];
				if (name === 'strncmp') {
					const n = this.toInt(args[2], loc);
					a = a.slice(0, n);
					b = b.slice(0, n);
				}
				for (let k = 0; k < Math.max(a.length, b.length); k++) {
					const x = a[k]?.codePointAt(0) ?? 0;
					const y = b[k]?.codePointAt(0) ?? 0;
					if (x !== y) return i(x < y ? -1 : 1);
				}
				return i(0);
			}
			case 'strcpy':
			case 'strncpy': {
				this.need(name, args, name === 'strcpy' ? 2 : 3, loc);
				let s = str(args[1]);
				if (name === 'strncpy') s = [...s].slice(0, this.toInt(args[2], loc)).join('');
				this.writeString(args[0], s, loc, name);
				return args[0];
			}
			case 'strcat': {
				this.need(name, args, 2, loc);
				const dst = args[0];
				const before = str(dst);
				this.writeString(dst, before + str(args[1]), loc, name);
				return dst;
			}
			case 'strdup': {
				this.need(name, args, 1, loc);
				return { t: 'p', m: this.chars(str(args[0]), 'a strdup() copy'), o: 0 };
			}
			case 'strchr':
			case 'strrchr': {
				this.need(name, args, 2, loc);
				const p = args[0];
				const s = [...str(p)];
				const c = this.toInt(args[1], loc);
				if (c === 0) return { ...(p as Val & { t: 'p' }), o: (p as { o: number }).o + s.length };
				const k =
					name === 'strchr'
						? s.findIndex((ch) => ch.codePointAt(0) === c)
						: s.findLastIndex((ch) => ch.codePointAt(0) === c);
				return k < 0 ? NULLP : { ...(p as Val & { t: 'p' }), o: (p as { o: number }).o + k };
			}
			case 'strstr': {
				this.need(name, args, 2, loc);
				const hay = [...str(args[0])];
				const needle = str(args[1]);
				const at = hay.join('').indexOf(needle);
				if (at < 0) return NULLP;
				const k = [...hay.join('').slice(0, at)].length;
				return { ...(args[0] as Val & { t: 'p' }), o: (args[0] as { o: number }).o + k };
			}
			case 'atoi':
			case 'atol': {
				this.need(name, args, 1, loc);
				const m = /^[ \t\n\v\f\r]*([+-]?\d+)/.exec(str(args[0]));
				const v = m ? Number(m[1]) : 0;
				return i(name === 'atoi' ? wrap(v, INT) : v);
			}
			case 'strtol': {
				if (args.length < 1) throw new CRuntimeError('strtol() needs a string', loc);
				const base = args[2] ? this.toInt(args[2], loc) : 10;
				const s = str(args[0]).trimStart();
				const digits =
					base === 16 ? /^[+-]?(0[xX])?[0-9A-Fa-f]+/ : base === 8 ? /^[+-]?[0-7]+/ : /^[+-]?\d+/;
				const m = digits.exec(s);
				return i(m ? parseInt(m[0], base || 10) || 0 : 0);
			}
			case 'atof':
			case 'strtod': {
				if (args.length < 1) throw new CRuntimeError(`${name}() needs a string`, loc);
				const m = /^[ \t\n\v\f\r]*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(str(args[0]));
				return d(m ? Number(m[1]) : 0);
			}
			case 'abs':
			case 'labs':
				this.need(name, args, 1, loc);
				return i(Math.abs(this.toInt(args[0], loc)));
			case 'isalpha':
				return ctype((c) => /^[A-Za-z]$/.test(String.fromCharCode(c)));
			case 'isdigit':
				return ctype((c) => c >= 48 && c <= 57);
			case 'isalnum':
				return ctype((c) => /^[A-Za-z0-9]$/.test(String.fromCharCode(c)));
			case 'isspace':
				return ctype((c) => c === 32 || (c >= 9 && c <= 13));
			case 'isupper':
				return ctype((c) => c >= 65 && c <= 90);
			case 'islower':
				return ctype((c) => c >= 97 && c <= 122);
			case 'isxdigit':
				return ctype((c) => /^[0-9A-Fa-f]$/.test(String.fromCharCode(c)));
			case 'ispunct':
				return ctype((c) => c > 32 && c < 127 && !/^[A-Za-z0-9]$/.test(String.fromCharCode(c)));
			case 'isprint':
				return ctype((c) => c >= 32 && c < 127);
			case 'toupper':
			case 'tolower': {
				this.need(name, args, 1, loc);
				const c = this.toInt(args[0], loc);
				if (name === 'toupper') return i(c >= 97 && c <= 122 ? c - 32 : c);
				return i(c >= 65 && c <= 90 ? c + 32 : c);
			}
			case 'malloc':
			case 'calloc': {
				const n =
					name === 'malloc'
						? this.toInt(args[0] ?? i(0), loc)
						: this.toInt(args[0] ?? i(0), loc) * this.toInt(args[1] ?? i(0), loc);
				if (n <= 0 || n > MAX_ARRAY) throw new CRuntimeError(`${name}(${n}): bad size`, loc);
				const data: number[] = new Array(n).fill(0);
				return {
					t: 'p',
					m: { elem: { base: 'char', ptr: 0 }, data, readonly: false, name: `${name}() memory` },
					o: 0
				};
			}
			case 'free':
				return VOID;
			case 'exit':
				this.need(name, args, 1, loc);
				throw new ExitSignal(this.toInt(args[0], loc));
			case 'yylex':
				this.need(name, args, 0, loc);
				return i(hooks.yylex(loc));
			case 'yyless':
				this.need(name, args, 1, loc);
				hooks.yyless(this.toInt(args[0], loc), loc);
				return VOID;
			case 'yyterminate':
				this.need(name, args, 0, loc);
				return hooks.terminate(loc);
			case 'input':
				this.need(name, args, 0, loc);
				return i(hooks.input(loc));
			case 'yywrap':
				return i(1);
		}
		throw new CRuntimeError(`${name}() is not defined`, e.nameLoc);
	}

	/** Writes a string and its NUL through a char pointer, checking the bounds. */
	private writeString(dst: Val, s: string, loc: Loc, fn: string): void {
		if (dst.t !== 'p' || !dst.m)
			throw new CRuntimeError(`${fn}() needs a char array to write to`, loc);
		const m = dst.m;
		if (m.readonly) throw new CRuntimeError(`${fn}() cannot modify ${m.name}`, loc);
		const cps = [...s].map((c) => c.codePointAt(0)!);
		if (dst.o < 0 || dst.o + cps.length + 1 > m.data.length) {
			throw new CRuntimeError(
				`${fn}() writes ${cps.length + 1} characters into ${m.name}, which has room for ${Math.max(0, m.data.length - dst.o)}`,
				loc
			);
		}
		cps.forEach((cp, k) => (m.data[dst.o + k] = cp));
		m.data[dst.o + cps.length] = 0;
	}
}

function describe(v: Val): string {
	switch (v.t) {
		case 'i':
			return `the number ${v.v}`;
		case 'd':
			return `the number ${v.v}`;
		case 'p':
			return 'a pointer';
		case 'f':
			return 'a stream';
		default:
			return 'a void value';
	}
}

export { isIntBase };
