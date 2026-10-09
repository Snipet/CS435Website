/**
 * The C- parser: a hand-written predictive recursive-descent parser that
 * builds the abstract syntax tree.
 *
 * It follows `CMINUS_EBNF`, the language's grammar (`CMINUS_BNF`) with its
 * left recursion turned into repetition, one function per non-terminal. Three
 * choices need more than the next token:
 *
 * - declaration: a variable and a function both start `type-specifier ID`; the
 *   token after the ID decides (`;` or `[` or `(`).
 * - params: `void` alone is the empty list; `void` followed by an ID is a
 *   (void) parameter.
 * - expression: `var = expression` and `simple-expression` can both start with
 *   a var. The parser reads the var (or call) first and then looks for `=`;
 *   without one, what it read is the first factor of the simple-expression.
 *   The token stream is never rewound.
 *
 * A syntax error is a diagnostic. Recovery is panic mode: the statement (or
 * declaration) in progress is dropped and tokens are skipped to the next `;`
 * or to a `}`, so one program can report several errors.
 *
 * Limits of this parser, not of the grammar: statements and expressions nest
 * at most MAX_NESTING deep and the tree is at most MAX_TREE_DEPTH levels deep,
 * so that everything that walks the tree afterwards may recurse. The grammar
 * nests `a + b + c` to the left, a level per operator, so an expression of
 * about MAX_TREE_DEPTH operators in a row is refused as too long.
 */
import {
	childrenOf,
	numberNodes,
	type BinaryOp,
	type Call,
	type Compound,
	type Decl,
	type Expr,
	type FunDecl,
	type If,
	type Index,
	type AstNode,
	type Param,
	type Program,
	type RelOp,
	type Stmt,
	type TypeSpec,
	type Var,
	type VarDecl
} from './ast';
import { scan, type ScanOptions } from './scanner';
import {
	joinSpans,
	spellingOf,
	type SourceDiagnostic,
	type SourceSpan,
	type Token,
	type TokenType
} from './tokens';

/** The grammar of the language definition (29 rules), in the site's notation. */
export const CMINUS_BNF = `program → declaration-list
declaration-list → declaration-list declaration | declaration
declaration → var-declaration | fun-declaration
var-declaration → type-specifier ID ; | type-specifier ID [ NUM ] ;
type-specifier → int | void
fun-declaration → type-specifier ID ( params ) compound-stmt
params → param-list | void
param-list → param-list , param | param
param → type-specifier ID | type-specifier ID [ ]
compound-stmt → { local-declarations statement-list }
local-declarations → local-declarations var-declaration | ε
statement-list → statement-list statement | ε
statement → expression-stmt | compound-stmt | selection-stmt | iteration-stmt | return-stmt
expression-stmt → expression ; | ;
selection-stmt → if ( expression ) statement | if ( expression ) statement else statement
iteration-stmt → while ( expression ) statement
return-stmt → return ; | return expression ;
expression → var = expression | simple-expression
var → ID | ID [ expression ]
simple-expression → additive-expression relop additive-expression | additive-expression
relop → "<=" | < | > | ">=" | "==" | "!="
additive-expression → additive-expression addop term | term
addop → + | -
term → term mulop factor | factor
mulop → * | /
factor → ( expression ) | var | call | NUM
call → ID ( args )
args → arg-list | ε
arg-list → arg-list , expression | expression`;

/**
 * The grammar the parser follows: the same language in EBNF, `{ α }` for zero
 * or more α and `[ α ]` for an optional α. The brackets and braces of C- itself
 * are quoted.
 */
export const CMINUS_EBNF = `program → declaration { declaration }
declaration → var-declaration | fun-declaration
var-declaration → type-specifier ID [ "[" NUM "]" ] ;
type-specifier → int | void
fun-declaration → type-specifier ID ( params ) compound-stmt
params → void | param { , param }
param → type-specifier ID [ "[" "]" ]
compound-stmt → "{" { var-declaration } { statement } "}"
statement → expression-stmt | compound-stmt | selection-stmt | iteration-stmt | return-stmt
expression-stmt → [ expression ] ;
selection-stmt → if ( expression ) statement [ else statement ]
iteration-stmt → while ( expression ) statement
return-stmt → return [ expression ] ;
expression → var = expression | simple-expression
var → ID [ "[" expression "]" ]
simple-expression → additive-expression [ relop additive-expression ]
relop → "<=" | < | > | ">=" | "==" | "!="
additive-expression → term { addop term }
addop → + | -
term → factor { mulop factor }
mulop → * | /
factor → ( expression ) | var | call | NUM
call → ID ( args )
args → [ expression { , expression } ]`;

/** Statements and parenthesized expressions nest at most this deep. */
export const MAX_NESTING = 200;
/**
 * The tree is at most this deep. A chain `a + a + a + …` deepens it by one per
 * operator, so this also bounds the operators an expression can have in a row.
 */
export const MAX_TREE_DEPTH = 500;
/** Parsing stops after this many syntax errors. */
export const MAX_SYNTAX_ERRORS = 50;

export interface ParseResult {
	/** The tree of everything that parsed; statements and declarations with a syntax error are left out. */
	program: Program;
	diagnostics: SourceDiagnostic[];
	/** True when there is no syntax error. */
	ok: boolean;
}

const RELOPS: Partial<Record<TokenType, RelOp>> = {
	LT: '<',
	LTE: '<=',
	GT: '>',
	GTE: '>=',
	EQ: '==',
	NEQ: '!='
};

/** A syntax error that drops the construct in progress (caught by the nearest list). */
class SyntaxFailure {}
/** Parsing cannot go on (nesting too deep, too many errors). */
class Abort {}

/** `";"`, `an identifier`, `a number`: how a message names a token type. */
function describeType(type: TokenType): string {
	const text = spellingOf(type);
	if (text !== null) return `"${text}"`;
	if (type === 'ID') return 'an identifier';
	if (type === 'NUM') return 'a number';
	return type === 'ENDFILE' ? 'the end of the program' : 'a token';
}

function describeToken(t: Token): string {
	if (t.type === 'ENDFILE') return 'the end of the program';
	return t.lexeme.length > 20 ? `"${t.lexeme.slice(0, 20)}…"` : `"${t.lexeme}"`;
}

class Parser {
	private pos = 0;
	private nesting = 0;
	private errors = 0;
	readonly diagnostics: SourceDiagnostic[] = [];
	/** Depth of the subtree under each expression and statement node. */
	private readonly depth = new WeakMap<AstNode, number>();
	/** A parenthesized expression's span with its parentheses. */
	private readonly outer = new WeakMap<AstNode, SourceSpan>();

	constructor(private readonly tokens: readonly Token[]) {}

	// --- Tokens -----------------------------------------------------------

	private peek(ahead = 0): Token {
		return this.tokens[Math.min(this.pos + ahead, this.tokens.length - 1)];
	}

	private at(type: TokenType): boolean {
		return this.peek().type === type;
	}

	private advance(): Token {
		const t = this.peek();
		if (t.type !== 'ENDFILE') this.pos++;
		return t;
	}

	private report(message: string, span: SourceSpan = this.peek().span): void {
		// A block left open at the end of the program is reported once, not once per level.
		const last = this.diagnostics[this.diagnostics.length - 1];
		if (last && last.message === message && last.span?.start === span.start) return;
		this.diagnostics.push({ severity: 'error', message, span });
		if (++this.errors >= MAX_SYNTAX_ERRORS) {
			this.diagnostics.push({
				severity: 'error',
				message: `Parsing stopped after ${MAX_SYNTAX_ERRORS} syntax errors.`,
				span
			});
			throw new Abort();
		}
	}

	private fail(message: string, span?: SourceSpan): never {
		this.report(message, span);
		throw new SyntaxFailure();
	}

	/** Consumes a token of the given type, or fails with "Expected … <where>, found …". */
	private expect(type: TokenType, where: string): Token {
		if (this.at(type)) return this.advance();
		return this.fail(
			`Expected ${describeType(type)} ${where}, found ${describeToken(this.peek())}.`
		);
	}

	// --- Tree bookkeeping ---------------------------------------------------

	/** The span of an operand, parentheses included. */
	private extent(node: AstNode): SourceSpan {
		return this.outer.get(node) ?? node.span;
	}

	/** Records the depth of a new node and refuses trees deeper than MAX_TREE_DEPTH. */
	private built<T extends AstNode>(node: T, ...children: (AstNode | null)[]): T {
		let d = 1;
		for (const c of children) if (c) d = Math.max(d, 1 + (this.depth.get(c) ?? 1));
		if (d > MAX_TREE_DEPTH) this.tooDeep(node);
		this.depth.set(node, d);
		return node;
	}

	/**
	 * Reports a tree deeper than MAX_TREE_DEPTH and ends the parse. The message
	 * says what made it deep: nesting, or one long chain of operators, which is
	 * written flat but is a level of the tree per operator.
	 */
	private tooDeep(node: AstNode): never {
		// Down the deepest path, the longest run of operators that are each the
		// left operand of the one above.
		let longest: { top: AstNode; operators: number } | null = null;
		let run: { top: AstNode; operators: number } | null = null;
		for (let at: AstNode | undefined = node; at;) {
			let deepest: AstNode | undefined;
			for (const child of childrenOf(at)) {
				if (!deepest || (this.depth.get(child) ?? 1) > (this.depth.get(deepest) ?? 1)) {
					deepest = child;
				}
			}
			if (at.kind === 'Binary') {
				if (run) run.operators++;
				else run = { top: at, operators: 1 };
				if (!longest || run.operators > longest.operators) longest = run;
				if (deepest !== at.left || deepest.kind !== 'Binary') run = null;
			}
			at = deepest;
		}
		if (longest && longest.operators * 2 > MAX_TREE_DEPTH) {
			this.report(
				`This expression is too long for this compiler: its chain of operators makes the syntax tree more than ${MAX_TREE_DEPTH} levels deep.`,
				longest.top.span
			);
		} else {
			this.report(`This is nested more than ${MAX_TREE_DEPTH} levels deep.`, node.span);
		}
		throw new Abort();
	}

	private enter(): void {
		if (++this.nesting > MAX_NESTING) {
			this.report(`This is nested more than ${MAX_NESTING} levels deep.`);
			throw new Abort();
		}
	}

	private leave(): void {
		this.nesting--;
	}

	// --- Declarations -------------------------------------------------------

	/** program → declaration { declaration } */
	program(): Program {
		const decls: Decl[] = [];
		const first = this.peek().span;
		try {
			while (!this.at('ENDFILE')) {
				const before = this.pos;
				try {
					decls.push(this.declaration());
				} catch (e) {
					if (!(e instanceof SyntaxFailure)) throw e;
					this.skipDeclaration();
				}
				// Always move on, whatever the error was.
				if (this.pos === before) this.advance();
			}
			if (decls.length === 0 && this.errors === 0) {
				this.report('Expected a declaration: a program is a list of declarations.');
			}
		} catch (e) {
			if (!(e instanceof Abort)) throw e;
		}
		const last = decls.length ? decls[decls.length - 1].span : first;
		const span: SourceSpan = decls.length
			? joinSpans(decls[0].span, last)
			: { ...first, end: first.start };
		return { kind: 'Program', id: 0, span, decls };
	}

	/** type-specifier → int | void */
	private typeSpecifier(where: string): Token {
		if (this.at('INT') || this.at('VOID')) return this.advance();
		return this.fail(`Expected "int" or "void" ${where}, found ${describeToken(this.peek())}.`);
	}

	/**
	 * declaration → var-declaration | fun-declaration
	 * Both start `type-specifier ID`; the next token chooses.
	 */
	private declaration(): Decl {
		const type = this.typeSpecifier('at the start of a declaration');
		const name = this.expect('ID', `after "${type.lexeme}"`);
		if (this.at('LPAREN')) return this.funDeclaration(type, name);
		if (this.at('SEMI') || this.at('LBRACKET')) return this.varDeclarationRest(type, name);
		return this.fail(
			`Expected ";", "[" or "(" after the name ${name.lexeme}, found ${describeToken(this.peek())}.`
		);
	}

	/** var-declaration → type-specifier ID [ "[" NUM "]" ] ;   (after `type-specifier ID`) */
	private varDeclarationRest(type: Token, name: Token): VarDecl {
		let size: number | null = null;
		let sizeSpan: SourceSpan | null = null;
		if (this.at('LBRACKET')) {
			this.advance();
			const num = this.expect('NUM', 'for the size of the array');
			size = num.value ?? 0;
			sizeSpan = num.span;
			this.expect('RBRACKET', 'after the size of the array');
		}
		const semi = this.expect('SEMI', 'after the declaration');
		return this.built({
			kind: 'VarDecl',
			id: 0,
			span: joinSpans(type.span, semi.span),
			typeSpec: type.lexeme as TypeSpec,
			name: name.lexeme,
			nameSpan: name.span,
			size,
			sizeSpan
		});
	}

	/** A declaration inside a compound statement: only variables are declared there. */
	private localDeclaration(): VarDecl {
		const type = this.typeSpecifier('at the start of a declaration');
		const name = this.expect('ID', `after "${type.lexeme}"`);
		if (this.at('LPAREN')) {
			this.fail(`A function cannot be declared inside a function.`, name.span);
		}
		if (!this.at('SEMI') && !this.at('LBRACKET')) {
			this.fail(
				`Expected ";" or "[" after the name ${name.lexeme}, found ${describeToken(this.peek())}.`
			);
		}
		return this.varDeclarationRest(type, name);
	}

	/** fun-declaration → type-specifier ID ( params ) compound-stmt   (after `type-specifier ID`) */
	private funDeclaration(type: Token, name: Token): FunDecl {
		this.expect('LPAREN', `after the name ${name.lexeme}`);
		const params = this.params();
		const close = this.expect('RPAREN', 'after the parameters');
		const body = this.compound();
		return this.built(
			{
				kind: 'FunDecl',
				id: 0,
				span: joinSpans(type.span, body.span),
				returnType: type.lexeme as TypeSpec,
				name: name.lexeme,
				nameSpan: name.span,
				headSpan: joinSpans(type.span, close.span),
				params,
				body
			},
			body
		);
	}

	/** params → void | param { , param } */
	private params(): Param[] {
		if (this.at('VOID') && this.peek(1).type === 'RPAREN') {
			this.advance();
			return [];
		}
		if (this.at('RPAREN')) {
			// Not fatal: read it as (void) and go on.
			this.report('Expected the parameters, or "void" for none, found ")".');
			return [];
		}
		const params = [this.param()];
		while (this.at('COMMA')) {
			this.advance();
			params.push(this.param());
		}
		return params;
	}

	/** param → type-specifier ID [ "[" "]" ] */
	private param(): Param {
		const type = this.typeSpecifier('at the start of a parameter');
		const name = this.expect('ID', `after "${type.lexeme}"`);
		let end = name.span;
		let isArray = false;
		if (this.at('LBRACKET')) {
			this.advance();
			if (this.at('NUM')) {
				this.fail('An array parameter is written with empty brackets, as in int a[].');
			}
			end = this.expect('RBRACKET', 'after "[" (an array parameter is written a[])').span;
			isArray = true;
		}
		return this.built({
			kind: 'Param',
			id: 0,
			span: joinSpans(type.span, end),
			typeSpec: type.lexeme as TypeSpec,
			name: name.lexeme,
			nameSpan: name.span,
			isArray
		});
	}

	// --- Statements ---------------------------------------------------------

	/** compound-stmt → "{" { var-declaration } { statement } "}" */
	private compound(): Compound {
		const open = this.expect('LBRACE', 'at the start of a block');
		const locals: VarDecl[] = [];
		const body: Stmt[] = [];
		let inDeclarations = true;
		while (!this.at('RBRACE') && !this.at('ENDFILE')) {
			const before = this.pos;
			try {
				if (this.at('INT') || this.at('VOID')) {
					if (!inDeclarations) {
						this.report('The declarations of a block come before its statements.');
					}
					locals.push(this.localDeclaration());
				} else {
					inDeclarations = false;
					body.push(this.statement());
				}
			} catch (e) {
				if (!(e instanceof SyntaxFailure)) throw e;
				this.skipStatement();
			}
			if (this.pos === before) this.advance();
		}
		const close = this.expect('RBRACE', 'at the end of the block');
		return this.built(
			{
				kind: 'Compound',
				id: 0,
				span: joinSpans(open.span, close.span),
				locals,
				body,
				closeSpan: close.span
			},
			...body
		);
	}

	/** statement → expression-stmt | compound-stmt | selection-stmt | iteration-stmt | return-stmt */
	private statement(): Stmt {
		this.enter();
		try {
			switch (this.peek().type) {
				case 'LBRACE':
					return this.compound();
				case 'IF':
					return this.selection();
				case 'WHILE':
					return this.iteration();
				case 'RETURN':
					return this.returnStmt();
				case 'ELSE':
					return this.fail('This "else" has no "if" before it.');
				default:
					return this.expressionStmt();
			}
		} finally {
			this.leave();
		}
	}

	/** expression-stmt → [ expression ] ; */
	private expressionStmt(): Stmt {
		if (this.at('SEMI')) {
			const semi = this.advance();
			return this.built({ kind: 'ExprStmt', id: 0, span: semi.span, expr: null });
		}
		const expr = this.expression();
		const semi = this.expect('SEMI', 'after the expression');
		return this.built(
			{ kind: 'ExprStmt', id: 0, span: joinSpans(this.extent(expr), semi.span), expr },
			expr
		);
	}

	/** selection-stmt → if ( expression ) statement [ else statement ] */
	private selection(): If {
		const keyword = this.advance();
		this.expect('LPAREN', 'after "if"');
		const test = this.expression();
		const close = this.expect('RPAREN', 'after the condition');
		const then = this.statement();
		let otherwise: Stmt | null = null;
		let elseSpan: SourceSpan | null = null;
		// An else belongs to the nearest if: the innermost call takes it.
		if (this.at('ELSE')) {
			elseSpan = this.advance().span;
			otherwise = this.statement();
		}
		return this.built(
			{
				kind: 'If',
				id: 0,
				span: joinSpans(keyword.span, (otherwise ?? then).span),
				test,
				then,
				else: otherwise,
				headSpan: joinSpans(keyword.span, close.span),
				elseSpan
			},
			test,
			then,
			otherwise
		);
	}

	/** iteration-stmt → while ( expression ) statement */
	private iteration(): Stmt {
		const keyword = this.advance();
		this.expect('LPAREN', 'after "while"');
		const test = this.expression();
		const close = this.expect('RPAREN', 'after the condition');
		const body = this.statement();
		return this.built(
			{
				kind: 'While',
				id: 0,
				span: joinSpans(keyword.span, body.span),
				test,
				body,
				headSpan: joinSpans(keyword.span, close.span)
			},
			test,
			body
		);
	}

	/** return-stmt → return [ expression ] ; */
	private returnStmt(): Stmt {
		const keyword = this.advance();
		if (this.at('SEMI')) {
			const semi = this.advance();
			return this.built({
				kind: 'Return',
				id: 0,
				span: joinSpans(keyword.span, semi.span),
				value: null
			});
		}
		const value = this.expression();
		const semi = this.expect('SEMI', 'after the returned value');
		return this.built(
			{ kind: 'Return', id: 0, span: joinSpans(keyword.span, semi.span), value },
			value
		);
	}

	// --- Expressions --------------------------------------------------------

	/**
	 * expression → var = expression | simple-expression
	 * Both can start with a var, so the var (or call) is read first and the
	 * token after it decides.
	 */
	private expression(): Expr {
		this.enter();
		try {
			if (!this.at('ID')) return this.simpleExpression(null);
			const first = this.varOrCall();
			if (first.kind !== 'Call' && this.at('ASSIGN')) {
				this.advance();
				const value = this.expression();
				return this.built(
					{
						kind: 'Assign',
						id: 0,
						span: joinSpans(first.span, this.extent(value)),
						target: first,
						value
					},
					first,
					value
				);
			}
			return this.simpleExpression(first);
		} finally {
			this.leave();
		}
	}

	/**
	 * simple-expression → additive-expression [ relop additive-expression ]
	 * `first`, when given, is the factor that has already been read.
	 */
	private simpleExpression(first: Expr | null): Expr {
		let left = this.additive(first);
		let relops = 0;
		for (let op = RELOPS[this.peek().type]; op; op = RELOPS[this.peek().type]) {
			const opToken = this.advance();
			if (++relops === 2) {
				// Not fatal: read on as if it associated to the left.
				this.report(
					`Relational operators do not associate: a ${left.kind === 'Binary' ? left.op : op} b ${op} c is not an expression.`,
					opToken.span
				);
			}
			left = this.binary(op, opToken, left, this.additive(null));
		}
		if (this.at('ASSIGN')) {
			this.report('The left side of "=" must be a variable or an array element.');
			this.advance();
			this.expression();
		}
		return left;
	}

	/** additive-expression → term { addop term } */
	private additive(first: Expr | null): Expr {
		let left = this.term(first);
		while (this.at('PLUS') || this.at('MINUS')) {
			const opToken = this.advance();
			left = this.binary(opToken.lexeme as BinaryOp, opToken, left, this.term(null));
		}
		return left;
	}

	/** term → factor { mulop factor } */
	private term(first: Expr | null): Expr {
		let left = first ?? this.factor();
		while (this.at('TIMES') || this.at('OVER')) {
			const opToken = this.advance();
			left = this.binary(opToken.lexeme as BinaryOp, opToken, left, this.factor());
		}
		return left;
	}

	private binary(op: BinaryOp, opToken: Token, left: Expr, right: Expr): Expr {
		return this.built(
			{
				kind: 'Binary',
				id: 0,
				span: joinSpans(this.extent(left), this.extent(right)),
				op,
				opSpan: opToken.span,
				left,
				right
			},
			left,
			right
		);
	}

	/** factor → ( expression ) | var | call | NUM */
	private factor(): Expr {
		const t = this.peek();
		switch (t.type) {
			case 'LPAREN': {
				this.advance();
				const inner = this.expression();
				const close = this.expect('RPAREN', 'after the expression');
				this.outer.set(inner, joinSpans(t.span, close.span));
				return inner;
			}
			case 'ID':
				return this.varOrCall();
			case 'NUM':
				this.advance();
				return this.built({
					kind: 'Num',
					id: 0,
					span: t.span,
					value: t.value ?? 0,
					text: t.lexeme
				});
			case 'MINUS':
				return this.fail('C- has no unary minus: write 0 - x.');
			default:
				return this.fail(`Expected an expression, found ${describeToken(t)}.`);
		}
	}

	/**
	 * var → ID [ "[" expression "]" ]   and   call → ID ( args )
	 * args → [ expression { , expression } ]
	 */
	private varOrCall(): Var | Index | Call {
		const name = this.expect('ID', 'at the start of the expression');
		if (this.at('LPAREN')) {
			this.advance();
			const args: Expr[] = [];
			if (!this.at('RPAREN')) {
				args.push(this.expression());
				while (this.at('COMMA')) {
					this.advance();
					args.push(this.expression());
				}
			}
			const close = this.expect('RPAREN', 'after the arguments');
			return this.built(
				{
					kind: 'Call',
					id: 0,
					span: joinSpans(name.span, close.span),
					name: name.lexeme,
					nameSpan: name.span,
					args
				},
				...args
			);
		}
		if (this.at('LBRACKET')) {
			this.advance();
			const index = this.expression();
			const close = this.expect('RBRACKET', 'after the subscript');
			return this.built(
				{
					kind: 'Index',
					id: 0,
					span: joinSpans(name.span, close.span),
					name: name.lexeme,
					nameSpan: name.span,
					index
				},
				index
			);
		}
		return this.built({ kind: 'Var', id: 0, span: name.span, name: name.lexeme });
	}

	// --- Recovery -----------------------------------------------------------

	/** Skips the rest of a statement: through the next `;`, or up to a `}` or the start of a statement. */
	private skipStatement(): void {
		while (!this.at('ENDFILE')) {
			switch (this.peek().type) {
				case 'SEMI':
					this.advance();
					return;
				case 'RBRACE':
				case 'LBRACE':
				case 'IF':
				case 'WHILE':
				case 'RETURN':
					return;
				default:
					this.advance();
			}
		}
	}

	/** Skips the rest of a declaration: through its `;` or its `{ … }`, or up to the next `int` or `void`. */
	private skipDeclaration(): void {
		let braces = 0;
		while (!this.at('ENDFILE')) {
			const type = this.peek().type;
			if (type === 'LBRACE') {
				braces++;
			} else if (type === 'RBRACE') {
				this.advance();
				if (--braces <= 0) return;
				continue;
			} else if (braces === 0) {
				if (type === 'SEMI') {
					this.advance();
					return;
				}
				// The start of the next declaration (and not a parameter such as `int a` or `int a[]`).
				if ((type === 'INT' || type === 'VOID') && this.startsDeclaration()) return;
			}
			this.advance();
		}
	}

	/** At a type specifier: true when `ID ;`, `ID (` or `ID [ NUM` follows. */
	private startsDeclaration(): boolean {
		if (this.peek(1).type !== 'ID') return false;
		const after = this.peek(2).type;
		if (after === 'SEMI' || after === 'LPAREN') return true;
		// `int a[10];` is a declaration; `int a[]` is a parameter.
		return after === 'LBRACKET' && this.peek(3).type === 'NUM';
	}
}

/** Parses a token list (as `scan` returns it, ENDFILE last). */
export function parse(tokens: readonly Token[]): ParseResult {
	const list =
		tokens.length && tokens[tokens.length - 1].type === 'ENDFILE'
			? tokens
			: [...tokens, endOfFile(tokens)];
	const parser = new Parser(list);
	const program = parser.program();
	numberNodes(program);
	return {
		program,
		diagnostics: parser.diagnostics,
		ok: !parser.diagnostics.some((d) => d.severity === 'error')
	};
}

function endOfFile(tokens: readonly Token[]): Token {
	const last = tokens[tokens.length - 1];
	const span: SourceSpan = last
		? { ...last.span, start: last.span.end, column: last.span.column + last.lexeme.length }
		: { start: 0, end: 0, line: 1, column: 1, source: null };
	return { type: 'ENDFILE', lexeme: '', span: { ...span, end: span.start } };
}

/** Scans and parses source text. Scanner errors are included in the diagnostics. */
export function parseSource(source: string, options: ScanOptions = {}): ParseResult {
	const scanned = scan(source, options);
	const result = parse(scanned.tokens);
	const diagnostics = [...scanned.diagnostics, ...result.diagnostics];
	return { ...result, diagnostics, ok: !diagnostics.some((d) => d.severity === 'error') };
}
