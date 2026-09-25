/**
 * Recursive-descent parser for the C subset (see c-ast.ts). Errors become
 * diagnostics; parsing of a block stops at its first syntax error.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Token } from './c-lexer';
import type {
	Base,
	CType,
	Declarator,
	Expr,
	FnDef,
	InitList,
	Loc,
	Param,
	Stmt,
	TopItem
} from './c-ast';

class SyntaxError_ extends Error {
	constructor(
		message: string,
		readonly loc: Loc
	) {
		super(message);
	}
}

/** Type names known across blocks (typedefs). */
export type Typedefs = Map<string, CType>;

const TYPE_WORDS = new Set([
	'void',
	'char',
	'short',
	'int',
	'long',
	'float',
	'double',
	'signed',
	'unsigned',
	'const',
	'volatile',
	'static',
	'extern',
	'register',
	'auto',
	'inline',
	'enum',
	'struct',
	'union',
	'typedef'
]);

const QUALIFIERS = new Set(['const', 'volatile', 'static', 'extern', 'register', 'auto', 'inline']);

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|=']);

const BINARY: Record<string, number> = {
	'||': 1,
	'&&': 2,
	'|': 3,
	'^': 4,
	'&': 5,
	'==': 6,
	'!=': 6,
	'<': 7,
	'>': 7,
	'<=': 7,
	'>=': 7,
	'<<': 8,
	'>>': 8,
	'+': 9,
	'-': 9,
	'*': 10,
	'/': 10,
	'%': 10
};

/** Deepest nesting of statements and expressions the parser accepts. */
const MAX_NESTING = 200;
const NESTED = `code is nested too deeply (more than ${MAX_NESTING} levels)`;

/** Names flex provides that user code cannot use (they are not simulated). */
const UNSUPPORTED: Record<string, string> = {
	REJECT: 'REJECT is not supported in this playground',
	yymore: 'yymore() is not supported in this playground',
	unput: 'unput() is not supported in this playground',
	yy_push_state: 'start-condition stacks are not supported in this playground',
	yy_pop_state: 'start-condition stacks are not supported in this playground',
	yyrestart: 'yyrestart() is not supported in this playground'
};

export class Parser {
	private i = 0;
	/** Nesting of statements and expressions, bounded so recursion stays shallow. */
	private depth = 0;
	readonly diagnostics: Diagnostic[] = [];

	constructor(
		private readonly toks: Token[],
		private readonly typedefs: Typedefs
	) {}

	private get t(): Token {
		return this.toks[this.i];
	}
	private peek(n = 1): Token {
		return this.toks[Math.min(this.i + n, this.toks.length - 1)];
	}
	private is(text: string): boolean {
		const t = this.t;
		return (t.kind === 'punct' || t.kind === 'kw') && t.text === text;
	}
	private eat(text: string): boolean {
		if (this.is(text)) {
			this.i++;
			return true;
		}
		return false;
	}
	private fail(message: string, tok: Token = this.t): never {
		throw new SyntaxError_(message, { start: tok.start, end: Math.max(tok.end, tok.start + 1) });
	}
	private expect(text: string, what?: string): Token {
		if (this.is(text)) return this.toks[this.i++];
		const found = this.t.kind === 'eof' ? 'the end of the code' : `${this.t.text}`;
		const prev = this.toks[this.i - 1];
		// Report a missing ; right after the previous token, where it belongs.
		if (text === ';' && prev)
			throw new SyntaxError_(`expected ; after ${what ?? prev.text}`, {
				start: prev.end,
				end: prev.end
			});
		return this.fail(`expected ${text}${what ? ` ${what}` : ''} but found ${found}`);
	}
	private loc(from: Token | Loc): Loc {
		const prev = this.toks[Math.max(0, this.i - 1)];
		return { start: from.start, end: Math.max(prev.end, from.start) };
	}

	/** Parses a block of top-level declarations and function definitions. */
	parseTop(): TopItem[] {
		const items: TopItem[] = [];
		try {
			while (this.t.kind !== 'eof') {
				if (this.eat(';')) continue;
				items.push(...this.topItem());
			}
		} catch (e) {
			this.report(e);
		}
		return items;
	}

	/** Parses statements up to the end (an action or the code before the first rule). */
	parseStatements(): Stmt[] {
		const body: Stmt[] = [];
		try {
			while (this.t.kind !== 'eof') body.push(this.statement());
		} catch (e) {
			this.report(e);
		}
		return body;
	}

	private report(e: unknown): void {
		if (!(e instanceof SyntaxError_)) throw e;
		this.diagnostics.push({
			severity: 'error',
			message: e.message,
			span: { start: e.loc.start, end: e.loc.end, source: null }
		});
	}

	private startsType(): boolean {
		const t = this.t;
		if (t.kind === 'kw' && TYPE_WORDS.has(t.text)) return true;
		if (t.kind === 'id' && (t.text === 'FILE' || this.typedefs.has(t.text))) {
			// `name = …` or `name(…)` use a typedef name as a variable; treat as a type only before a declarator.
			const n = this.peek();
			return n.kind === 'id' || (n.kind === 'punct' && n.text === '*');
		}
		return false;
	}

	/** Declaration specifiers; returns the base type and whether it was a typedef. */
	private specifiers(implicitOk = false): {
		type: CType;
		typedef: boolean;
		ext: boolean;
		stat: boolean;
		enumItems: { name: string; value: Expr | null; loc: Loc }[] | null;
		start: Token;
	} {
		const start = this.t;
		let signed: boolean | null = null;
		let longs = 0;
		let short = false;
		let base: Base | null = null;
		let typedef = false;
		let ext = false;
		let stat = false;
		let ptr = 0;
		let enumItems: { name: string; value: Expr | null; loc: Loc }[] | null = null;
		let any = false;
		for (;;) {
			const t = this.t;
			if (t.kind === 'kw') {
				const w = t.text;
				if (QUALIFIERS.has(w)) {
					if (w === 'extern') ext = true;
					if (w === 'static') stat = true;
					this.i++;
					continue;
				}
				if (w === 'typedef') {
					typedef = true;
					this.i++;
					continue;
				}
				if (w === 'enum') {
					this.i++;
					enumItems = this.enumBody();
					base = 'int';
					any = true;
					continue;
				}
				if (w === 'struct' || w === 'union') this.fail(`${w} is not supported in this playground`);
				if (w === 'signed') signed = true;
				else if (w === 'unsigned') signed = false;
				else if (w === 'short') short = true;
				else if (w === 'long') longs++;
				else if (w === 'int') base ??= 'int';
				else if (w === 'char') base = 'char';
				else if (w === 'float' || w === 'double') base = 'double';
				else if (w === 'void') base = 'void';
				else break;
				any = true;
				this.i++;
				continue;
			}
			if (t.kind === 'id' && !any && (t.text === 'FILE' || this.typedefs.has(t.text))) {
				const td =
					t.text === 'FILE' ? { base: 'FILE' as Base, ptr: 0 } : this.typedefs.get(t.text)!;
				base = td.base;
				ptr = td.ptr;
				any = true;
				this.i++;
				continue;
			}
			break;
		}
		if (!any) {
			if (implicitOk) base = 'int';
			else this.fail(`expected a type but found ${this.t.text || 'the end'}`);
		}
		let b: Base;
		if (base === 'double') b = 'double';
		else if (base === 'void') b = 'void';
		else if (base === 'FILE') b = 'FILE';
		else if (base === 'char') b = signed === false ? 'uchar' : 'char';
		else if (short) b = signed === false ? 'ushort' : 'short';
		else if (longs > 0) b = signed === false ? 'ulong' : 'long';
		else b = signed === false ? 'uint' : 'int';
		return { type: { base: b, ptr }, typedef, ext, stat, enumItems, start };
	}

	private enumBody(): { name: string; value: Expr | null; loc: Loc }[] | null {
		if (this.t.kind === 'id') this.i++; // tag
		if (!this.eat('{')) return null;
		const items: { name: string; value: Expr | null; loc: Loc }[] = [];
		while (!this.is('}')) {
			const t = this.t;
			if (t.kind !== 'id') this.fail('expected an enumeration constant name');
			this.i++;
			let value: Expr | null = null;
			if (this.eat('=')) value = this.assignment();
			items.push({ name: t.text, value, loc: { start: t.start, end: t.end } });
			if (!this.eat(',')) break;
		}
		this.expect('}', 'to close enum');
		return items;
	}

	/** `*`s, name, and array / function suffixes. */
	private declarator(base: CType): {
		name: string;
		nameTok: Token;
		type: CType;
		array?: Expr | null;
		params?: { params: Param[]; variadic: boolean };
	} {
		let ptr = base.ptr;
		while (this.eat('*')) {
			while (this.t.kind === 'kw' && (this.t.text === 'const' || this.t.text === 'volatile'))
				this.i++;
			ptr++;
		}
		if (this.is('(')) this.fail('function pointers are not supported in this playground');
		const nameTok = this.t;
		if (nameTok.kind !== 'id')
			this.fail(`expected a name but found ${nameTok.text || 'the end of the code'}`);
		this.i++;
		let array: Expr | null | undefined;
		let params: { params: Param[]; variadic: boolean } | undefined;
		if (this.eat('[')) {
			array = this.is(']') ? null : this.expression();
			this.expect(']');
			if (this.is('[')) this.fail('arrays of arrays are not supported in this playground');
		} else if (this.is('(')) {
			params = this.paramList();
		}
		return { name: nameTok.text, nameTok, type: { base: base.base, ptr }, array, params };
	}

	private paramList(): { params: Param[]; variadic: boolean } {
		this.expect('(');
		const params: Param[] = [];
		let variadic = false;
		if (this.is('void') && this.peek().kind === 'punct' && this.peek().text === ')') this.i++;
		while (!this.is(')')) {
			if (this.eat('...')) {
				variadic = true;
				break;
			}
			const spec = this.specifiers(true);
			let ptr = spec.type.ptr;
			while (this.eat('*')) ptr++;
			let name: string | null = null;
			if (this.t.kind === 'id') {
				name = this.t.text;
				this.i++;
			}
			while (this.eat('[')) {
				while (!this.is(']') && this.t.kind !== 'eof') this.i++;
				this.expect(']');
				ptr++;
			}
			params.push({ name, type: { base: spec.type.base, ptr } });
			if (!this.eat(',')) break;
		}
		this.expect(')', 'to close the parameter list');
		return { params, variadic };
	}

	private topItem(): TopItem[] {
		// K&R style `main() { … }`: a name followed by ( at the start of an item.
		const implicit =
			this.t.kind === 'id' &&
			!this.typedefs.has(this.t.text) &&
			this.t.text !== 'FILE' &&
			this.peek().kind === 'punct' &&
			this.peek().text === '(';
		const spec = this.specifiers(implicit);
		if (this.eat(';')) {
			return spec.enumItems
				? [{ k: 'global', stmt: { k: 'enum', items: spec.enumItems, loc: this.loc(spec.start) } }]
				: [];
		}
		const items: TopItem[] = [];
		if (spec.enumItems)
			items.push({
				k: 'global',
				stmt: { k: 'enum', items: spec.enumItems, loc: this.loc(spec.start) }
			});
		const first = this.declarator(spec.type);
		if (first.params && this.is('{')) {
			const bodyStart = this.t;
			const body = this.block();
			const fn: FnDef = {
				name: first.name,
				ret: first.type,
				params: first.params.params,
				variadic: first.params.variadic,
				body: body.k === 'block' ? body.body : [body],
				loc: { start: spec.start.start, end: this.loc(bodyStart).end },
				nameLoc: { start: first.nameTok.start, end: first.nameTok.end }
			};
			items.push({ k: 'fn', fn });
			return items;
		}
		const decls: Declarator[] = [];
		let d = first;
		for (;;) {
			if (d.params) {
				items.push({
					k: 'proto',
					name: d.name,
					loc: { start: d.nameTok.start, end: d.nameTok.end }
				});
			} else if (spec.typedef) {
				this.typedefs.set(d.name, d.type);
			} else decls.push(this.finishDeclarator(d));
			if (!this.eat(',')) break;
			d = this.declarator(spec.type);
		}
		this.expect(';', 'the declaration');
		if (decls.length)
			items.push({
				k: 'global',
				stmt: { k: 'decl', decls, extern: spec.ext, loc: this.loc(spec.start) }
			});
		return items;
	}

	private finishDeclarator(d: ReturnType<Parser['declarator']>): Declarator {
		let init: Expr | InitList | undefined;
		if (this.eat('=')) init = this.initializer();
		if (d.array === null && !init)
			this.fail(`array ${d.name}[] needs a size or an initializer`, d.nameTok);
		return {
			name: d.name,
			type: d.type,
			array: d.array,
			init,
			loc: { start: d.nameTok.start, end: this.loc(d.nameTok).end }
		};
	}

	private initializer(): Expr | InitList {
		const start = this.t;
		if (this.eat('{')) {
			const items: Expr[] = [];
			while (!this.is('}')) {
				if (this.is('{')) this.fail('nested initializer lists are not supported');
				items.push(this.assignment());
				if (!this.eat(',')) break;
			}
			this.expect('}', 'to close the initializer');
			return { k: 'list', items, loc: this.loc(start) };
		}
		return this.assignment();
	}

	private localDeclaration(): Stmt {
		const spec = this.specifiers();
		if (this.eat(';')) {
			return spec.enumItems
				? { k: 'enum', items: spec.enumItems, loc: this.loc(spec.start) }
				: { k: 'empty', loc: this.loc(spec.start) };
		}
		const decls: Declarator[] = [];
		let enumStmt: Stmt | null = null;
		if (spec.enumItems) enumStmt = { k: 'enum', items: spec.enumItems, loc: this.loc(spec.start) };
		for (;;) {
			const d = this.declarator(spec.type);
			if (d.params) this.fail('functions cannot be defined inside a function', d.nameTok);
			if (spec.typedef) this.typedefs.set(d.name, d.type);
			else decls.push(this.finishDeclarator(d));
			if (!this.eat(',')) break;
		}
		this.expect(';', 'the declaration');
		const decl: Stmt = { k: 'decl', decls, extern: spec.ext, loc: this.loc(spec.start) };
		if (spec.stat) decl.static = true;
		return enumStmt ? { k: 'block', body: [enumStmt, decl], inline: true, loc: decl.loc } : decl;
	}

	private block(): Stmt {
		const start = this.expect('{');
		const body: Stmt[] = [];
		while (!this.is('}')) {
			if (this.t.kind === 'eof') this.fail('{ is never closed', start);
			body.push(this.statement());
		}
		this.i++;
		return { k: 'block', body, loc: this.loc(start) };
	}

	private statement(): Stmt {
		if (++this.depth > MAX_NESTING) this.fail(NESTED);
		try {
			return this.statementInner();
		} finally {
			this.depth--;
		}
	}

	private statementInner(): Stmt {
		const t = this.t;
		if (this.is('{')) return this.block();
		if (this.eat(';')) return { k: 'empty', loc: this.loc(t) };
		if (t.kind === 'kw') {
			switch (t.text) {
				case 'if': {
					this.i++;
					this.expect('(', 'after if');
					const test = this.expression();
					this.expect(')', 'after the condition');
					const then = this.statement();
					const els = this.eat('else') ? this.statement() : null;
					return { k: 'if', test, then, else: els, loc: this.loc(t) };
				}
				case 'while': {
					this.i++;
					this.expect('(', 'after while');
					const test = this.expression();
					this.expect(')', 'after the condition');
					const body = this.statement();
					return { k: 'while', test, body, loc: this.loc(t) };
				}
				case 'do': {
					this.i++;
					const body = this.statement();
					this.expect('while', 'after the do body');
					this.expect('(');
					const test = this.expression();
					this.expect(')');
					this.expect(';', 'do … while (…)');
					return { k: 'do', body, test, loc: this.loc(t) };
				}
				case 'for': {
					this.i++;
					this.expect('(', 'after for');
					let init: Stmt | null = null;
					if (this.startsType()) init = this.localDeclaration();
					else if (!this.eat(';')) {
						const e = this.expression();
						this.expect(';', 'the for initializer');
						init = { k: 'expr', e, loc: e.loc };
					}
					const test = this.is(';') ? null : this.expression();
					this.expect(';', 'the for condition');
					const update = this.is(')') ? null : this.expression();
					this.expect(')', 'to close for (…)');
					const body = this.statement();
					return { k: 'for', init, test, update, body, loc: this.loc(t) };
				}
				case 'return': {
					this.i++;
					const e = this.is(';') ? null : this.expression();
					this.expect(';', e ? 'the return value' : 'return');
					return { k: 'return', e, loc: this.loc(t) };
				}
				case 'break':
				case 'continue': {
					this.i++;
					this.expect(';', t.text);
					const loc = this.loc(t);
					return t.text === 'break' ? { k: 'break', loc } : { k: 'continue', loc };
				}
				case 'switch': {
					this.i++;
					this.expect('(', 'after switch');
					const e = this.expression();
					this.expect(')');
					const body = this.statement();
					return {
						k: 'switch',
						e,
						body: body.k === 'block' ? body.body : [body],
						loc: this.loc(t)
					};
				}
				case 'case': {
					this.i++;
					const e = this.conditional();
					this.expect(':', 'after the case value');
					return { k: 'case', e, loc: this.loc(t) };
				}
				case 'default':
					this.i++;
					this.expect(':', 'after default');
					return { k: 'default', loc: this.loc(t) };
				case 'goto':
					this.fail('goto is not supported in this playground');
					break;
				case 'else':
					this.fail('else without a matching if');
					break;
			}
		}
		if (this.startsType()) return this.localDeclaration();
		if (t.kind === 'id' && this.peek().kind === 'punct' && this.peek().text === ':')
			this.fail('labels are not supported in this playground');
		const e = this.expression();
		this.expect(';', exprLabel(e));
		return { k: 'expr', e, loc: this.loc(t) };
	}

	expression(): Expr {
		const first = this.assignment();
		if (!this.is(',')) return first;
		const items = [first];
		while (this.eat(',')) items.push(this.assignment());
		return { k: 'comma', items, loc: { start: first.loc.start, end: items.at(-1)!.loc.end } };
	}

	private assignment(): Expr {
		const left = this.conditional();
		const t = this.t;
		if (t.kind === 'punct' && ASSIGN_OPS.has(t.text)) {
			this.i++;
			const value = this.assignment();
			return {
				k: 'assign',
				op: t.text,
				target: left,
				value,
				loc: { start: left.loc.start, end: value.loc.end }
			};
		}
		return left;
	}

	private conditional(): Expr {
		const test = this.binary(1);
		if (!this.eat('?')) return test;
		const then = this.expression();
		this.expect(':', 'in ?: expression');
		const els = this.conditional();
		return { k: 'cond', test, then, else: els, loc: { start: test.loc.start, end: els.loc.end } };
	}

	private binary(min: number): Expr {
		let left = this.unary();
		for (let n = 0; ; n++) {
			if (n > MAX_NESTING) this.fail(NESTED);
			const t = this.t;
			const prec = t.kind === 'punct' ? BINARY[t.text] : undefined;
			if (prec === undefined || prec < min) return left;
			this.i++;
			const right = this.binary(prec + 1);
			const loc = { start: left.loc.start, end: right.loc.end };
			left =
				t.text === '&&' || t.text === '||'
					? { k: 'logical', op: t.text, left, right, loc }
					: { k: 'binary', op: t.text, left, right, loc };
		}
	}

	private unary(): Expr {
		if (++this.depth > MAX_NESTING) this.fail(NESTED);
		try {
			return this.unaryInner();
		} finally {
			this.depth--;
		}
	}

	private unaryInner(): Expr {
		const t = this.t;
		if (t.kind === 'punct') {
			switch (t.text) {
				case '++':
				case '--': {
					this.i++;
					const arg = this.unary();
					return { k: 'incdec', op: t.text, prefix: true, arg, loc: this.loc(t) };
				}
				case '-':
				case '+':
				case '!':
				case '~':
				case '*':
				case '&': {
					this.i++;
					const arg = this.unary();
					return { k: 'unary', op: t.text, arg, loc: this.loc(t) };
				}
				case '(':
					if (this.castAhead()) {
						this.i++;
						const type = this.typeName();
						this.expect(')', 'to close the cast');
						const arg = this.unary();
						return { k: 'cast', type, arg, loc: this.loc(t) };
					}
					break;
			}
		}
		if (t.kind === 'kw' && t.text === 'sizeof') {
			this.i++;
			if (this.is('(') && this.castAhead()) {
				this.i++;
				const type = this.typeName();
				this.expect(')');
				return { k: 'sizeof', type, arg: null, loc: this.loc(t) };
			}
			const arg = this.unary();
			return { k: 'sizeof', type: null, arg, loc: this.loc(t) };
		}
		if (t.kind === 'id' && t.text === 'BEGIN') {
			this.i++;
			const arg = this.unary();
			return { k: 'begin', arg, loc: this.loc(t) };
		}
		return this.postfix();
	}

	/** `(` followed by a type name. */
	private castAhead(): boolean {
		const n = this.peek();
		if (n.kind === 'kw') return TYPE_WORDS.has(n.text) && n.text !== 'typedef';
		if (n.kind === 'id' && (n.text === 'FILE' || this.typedefs.has(n.text))) {
			const after = this.peek(2);
			return after.kind === 'punct' && (after.text === ')' || after.text === '*');
		}
		return false;
	}

	private typeName(): CType {
		const spec = this.specifiers();
		let ptr = spec.type.ptr;
		while (this.eat('*')) ptr++;
		return { base: spec.type.base, ptr };
	}

	private postfix(): Expr {
		let e = this.primary();
		for (;;) {
			const t = this.t;
			if (this.eat('[')) {
				const index = this.expression();
				this.expect(']', 'to close the index');
				e = { k: 'index', arr: e, index, loc: { start: e.loc.start, end: this.loc(t).end } };
			} else if (this.is('(')) {
				if (e.k !== 'id') this.fail('only named functions can be called');
				const name = e.name;
				if (UNSUPPORTED[name]) this.fail(UNSUPPORTED[name], this.toks[this.i - 1]);
				this.i++;
				const args: Expr[] = [];
				while (!this.is(')')) {
					args.push(this.assignment());
					if (!this.eat(',')) break;
				}
				this.expect(')', 'to close the call');
				e = {
					k: 'call',
					name,
					args,
					loc: { start: e.loc.start, end: this.loc(t).end },
					nameLoc: e.loc
				};
			} else if (this.is('++') || this.is('--')) {
				this.i++;
				e = {
					k: 'incdec',
					op: t.text as '++' | '--',
					prefix: false,
					arg: e,
					loc: { start: e.loc.start, end: t.end }
				};
			} else if (this.is('.') || this.is('->')) {
				this.fail('structs are not supported in this playground');
			} else return e;
		}
	}

	private primary(): Expr {
		const t = this.t;
		const loc = { start: t.start, end: t.end };
		switch (t.kind) {
			case 'int':
				this.i++;
				return { k: 'num', v: t.value as number, float: false, loc };
			case 'float':
				this.i++;
				return { k: 'num', v: t.value as number, float: true, loc };
			case 'char':
				this.i++;
				return { k: 'char', v: t.value as number, loc };
			case 'str':
				this.i++;
				return { k: 'str', v: t.value as string, loc };
			case 'id':
				if (UNSUPPORTED[t.text] && t.text === 'REJECT') this.fail(UNSUPPORTED[t.text]);
				this.i++;
				return { k: 'id', name: t.text, loc };
			case 'punct':
				if (t.text === '(') {
					this.i++;
					const e = this.expression();
					this.expect(')', 'to close (');
					return e;
				}
				break;
			case 'eof':
				this.fail('expected an expression but the code ended');
		}
		return this.fail(`expected an expression but found ${t.text}`);
	}
}

function exprLabel(e: Expr): string {
	if (e.k === 'call') return `${e.name}(…)`;
	if (e.k === 'id') return e.name;
	return 'the statement';
}

/** Parses top-level code (globals and functions). */
export function parseTop(
	tokens: Token[],
	typedefs: Typedefs
): { items: TopItem[]; diagnostics: Diagnostic[] } {
	const p = new Parser(tokens, typedefs);
	const items = p.parseTop();
	return { items, diagnostics: p.diagnostics };
}

/** Parses a statement list (an action, or code run when yylex starts). */
export function parseBody(
	tokens: Token[],
	typedefs: Typedefs
): { body: Stmt[]; diagnostics: Diagnostic[] } {
	const p = new Parser(tokens, typedefs);
	const body = p.parseStatements();
	return { body, diagnostics: p.diagnostics };
}
