/**
 * Recursive-descent parser of the tiny compiler.
 *
 *   program → stmt*
 *   stmt    → ID '=' expr ';'
 *           | 'if' cond 'then' stmt [ 'else' stmt ]
 *   cond    → expr relop expr          relop: == != < <= > >=
 *   expr    → term (('+' | '-') term)*
 *   term    → factor (('*' | '/') factor)*
 *   factor  → ID | NUM | FNUM | '(' expr ')'
 *
 * An `else` belongs to the nearest `if`. The parser stops at the first error.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Span } from '$lib/theory/regex/ast';
import type { Token, TokenKind } from './scanner';

export type BinOp = '+' | '-' | '*' | '/';
export type RelOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

interface ExprBase {
	span: Span;
	/** Pairs of parentheses written around this expression. */
	parens: number;
}

export type Expr =
	| (ExprBase & { kind: 'id'; name: string })
	| (ExprBase & { kind: 'num'; text: string; value: number; float: boolean })
	| (ExprBase & { kind: 'bin'; op: BinOp; left: Expr; right: Expr; opSpan: Span });

export interface Cond {
	op: RelOp;
	left: Expr;
	right: Expr;
	span: Span;
	opSpan: Span;
}

export type Stmt =
	| {
			kind: 'assign';
			target: { name: string; span: Span };
			value: Expr;
			span: Span;
			opSpan: Span;
	  }
	| { kind: 'if'; cond: Cond; then: Stmt; else: Stmt | null; span: Span };

export interface Program {
	stmts: Stmt[];
}

export interface ParseOutput {
	/** Null when there is a syntax error. */
	program: Program | null;
	diagnostics: Diagnostic[];
}

/** Deepest nesting of parentheses and `if` statements the parser accepts. */
export const MAX_NESTING = 64;

const BIN_OPS: Partial<Record<TokenKind, BinOp>> = {
	PLUS: '+',
	MINUS: '-',
	TIMES: '*',
	OVER: '/'
};
const REL_OPS: Partial<Record<TokenKind, RelOp>> = {
	EQ: '==',
	NE: '!=',
	LT: '<',
	LE: '<=',
	GT: '>',
	GE: '>='
};

const span = (start: number, end: number): Span => ({ start, end, source: null });

class SyntaxError {
	constructor(
		readonly message: string,
		readonly span: Span
	) {}
}

export function parse(tokens: readonly Token[], sourceLength: number): ParseOutput {
	let pos = 0;
	let depth = 0;

	const peek = (): Token | undefined => tokens[pos];
	const found = (): string => {
		const t = peek();
		return t ? `'${t.lexeme}'` : 'the end of the input';
	};
	const here = (): Span => {
		const t = peek();
		return t ? span(t.start, t.end) : span(sourceLength, sourceLength);
	};
	const fail = (message: string): never => {
		throw new SyntaxError(message, here());
	};
	const expect = (kind: TokenKind, text: string, after: string): Token => {
		const t = peek();
		if (t?.kind !== kind) fail(`Expected '${text}' ${after}, found ${found()}.`);
		pos++;
		return t!;
	};
	const enter = () => {
		if (++depth > MAX_NESTING) fail(`Nested more than ${MAX_NESTING} levels deep.`);
	};

	function factor(): Expr {
		const t = peek();
		if (t?.kind === 'ID') {
			pos++;
			return { kind: 'id', name: t.lexeme, span: span(t.start, t.end), parens: 0 };
		}
		if (t?.kind === 'NUM' || t?.kind === 'FNUM') {
			pos++;
			return {
				kind: 'num',
				text: t.lexeme,
				value: Number(t.lexeme),
				float: t.kind === 'FNUM',
				span: span(t.start, t.end),
				parens: 0
			};
		}
		if (t?.kind === 'LPAREN') {
			pos++;
			enter();
			const inner = expr();
			const close = expect('RPAREN', ')', 'to close the parenthesis');
			depth--;
			return { ...inner, span: span(t.start, close.end), parens: inner.parens + 1 };
		}
		return fail(`Expected an identifier, a number, or '(', found ${found()}.`);
	}

	function binary(next: () => Expr, ops: TokenKind[]): Expr {
		let left = next();
		for (;;) {
			const t = peek();
			if (!t || !ops.includes(t.kind)) return left;
			pos++;
			const right = next();
			left = {
				kind: 'bin',
				op: BIN_OPS[t.kind]!,
				left,
				right,
				span: span(left.span.start, right.span.end),
				opSpan: span(t.start, t.end),
				parens: 0
			};
		}
	}

	const term = () => binary(factor, ['TIMES', 'OVER']);
	const expr = () => binary(term, ['PLUS', 'MINUS']);

	function cond(): Cond {
		const left = expr();
		const t = peek();
		const op = t ? REL_OPS[t.kind] : undefined;
		if (!t || !op) return fail(`Expected a comparison (== != < <= > >=), found ${found()}.`);
		pos++;
		const right = expr();
		return {
			op,
			left,
			right,
			span: span(left.span.start, right.span.end),
			opSpan: span(t.start, t.end)
		};
	}

	function stmt(): Stmt {
		const t = peek();
		if (t?.kind === 'ID') {
			pos++;
			const eq = expect('ASSIGN', '=', `after '${t.lexeme}'`);
			const value = expr();
			const semi = expect('SEMI', ';', 'at the end of the assignment');
			return {
				kind: 'assign',
				target: { name: t.lexeme, span: span(t.start, t.end) },
				value,
				span: span(t.start, semi.end),
				opSpan: span(eq.start, eq.end)
			};
		}
		if (t?.kind === 'IF') {
			pos++;
			enter();
			const c = cond();
			expect('THEN', 'then', 'after the condition');
			const then = stmt();
			let other: Stmt | null = null;
			if (peek()?.kind === 'ELSE') {
				pos++;
				other = stmt();
			}
			depth--;
			const end = (other ?? then).span.end;
			return { kind: 'if', cond: c, then, else: other, span: span(t.start, end) };
		}
		return fail(`A statement starts with an identifier or 'if'; found ${found()}.`);
	}

	try {
		const stmts: Stmt[] = [];
		while (pos < tokens.length) stmts.push(stmt());
		return { program: { stmts }, diagnostics: [] };
	} catch (e) {
		if (!(e instanceof SyntaxError)) throw e;
		return {
			program: null,
			diagnostics: [{ severity: 'error', message: e.message, span: e.span }]
		};
	}
}

const PREC: Record<BinOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/**
 * Source-like text of an expression with the parentheses it needs (a - (b - c)
 * keeps them; (a * b) + c drops them).
 */
export function exprText(e: Expr, parent?: { prec: number; right: boolean }): string {
	if (e.kind === 'id') return e.name;
	if (e.kind === 'num') return e.text;
	const prec = PREC[e.op];
	const text = `${exprText(e.left, { prec, right: false })} ${e.op} ${exprText(e.right, { prec, right: true })}`;
	const wrap = parent && (prec < parent.prec || (prec === parent.prec && parent.right));
	return wrap ? `(${text})` : text;
}
