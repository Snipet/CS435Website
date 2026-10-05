/**
 * The generated C code as lines of text together with what each line does, so
 * that run.ts can execute it and name the line of every step.
 *
 * The same model holds the parser of Top-Down Parsing, slide 37 (codegen.ts)
 * and the functions that build an AST, slide 40 (ast.ts).
 */
import { END_MARKER } from '$lib/theory/grammar/types';

export interface CodeLine {
	text: string;
	/** Index of the function the line belongs to; null for the empty lines between functions. */
	fn: number | null;
}

/** Where the value of a call or of a new node goes. */
export type Target =
	/** `Node* tree = …` (declares) or `tree = …` */
	| { kind: 'variable'; name: string; declares: boolean }
	/** `plus->right = …` */
	| { kind: 'field'; object: string; field: 'left' | 'right' };

/** One branch of an if: `if (test) {`, its statements, and the line of its `}` (null without braces). */
export interface Arm {
	/** The tokens the test holds for. */
	tokens: string[];
	/** The test as written: `token == '('`. */
	test: string;
	line: number;
	body: Stmt[];
	close: number | null;
}

export type Stmt =
	/** `E ();`, `Node* tree = T ();`, `plus->right = T ();` */
	| { kind: 'call'; line: number; fn: number; target?: Target }
	/**
	 * `match ('+');`. `certain`: a test before it has shown that the token is
	 * `terminal`, so the match cannot fail; an int is then written `match (token);`.
	 */
	| { kind: 'match'; line: number; terminal: string; certain: boolean; text: string }
	| {
			kind: 'if';
			arms: Arm[];
			/** `else` with statements, or null. `line` is the line of the `else`. */
			otherwise: { line: number; body: Stmt[]; close: number | null } | null;
	  }
	| {
			kind: 'while';
			line: number;
			tokens: string[];
			test: string;
			body: Stmt[];
			close: number;
	  }
	/** `error ("T");` */
	| { kind: 'error'; line: number; name: string }
	/** `Node* tree;` */
	| { kind: 'declare'; line: number; name: string }
	/**
	 * `Node* plus = makeNode ('+');`; `label` is null for `makeNode (token)`.
	 * `leaf`: the node is for the token itself and is made before the token is
	 * matched; an operator's node is made after the operator is matched.
	 */
	| { kind: 'make'; line: number; label: string | null; leaf: boolean; target: Target }
	/** `plus->left  = tree;` and `tree = plus;` */
	| { kind: 'assign'; line: number; from: string; target: Target }
	/** `return tree;` */
	| { kind: 'return'; line: number; name: string };

export interface Fn {
	/** The function's name in the code: `E`, `E_` for E’, `main`. */
	name: string;
	/** The non-terminal it parses; null for main. */
	nonterminal: string | null;
	/** Its first line: the comment with the rule (`// E -> T [ + E ]`), `Node*`, or the head. */
	first: number;
	/** The line of `E () {`. */
	head: number;
	/** The line of the closing `}`. */
	close: number;
	body: Stmt[];
}

export interface Program {
	kind: 'parser' | 'ast';
	lines: CodeLine[];
	functions: Fn[];
	/** Index of main, or -1 when the code has none (the start function is called directly). */
	main: number;
	/** Index of the start symbol's function. */
	start: number;
}

export const programText = (program: Program): string =>
	program.lines.map((line) => line.text).join('\n');

/** The lines of one function, from its comment (or head) to its `}`. */
export function functionText(program: Program, fn: number): string {
	const f = program.functions[fn];
	return program.lines
		.slice(f.first, f.close + 1)
		.map((line) => line.text)
		.join('\n');
}

// ───────────────────────────── names ─────────────────────────────

/** Names the generated code uses itself, and C keywords a grammar symbol may be spelled like. */
const RESERVED = [
	'main',
	'match',
	'error',
	'token',
	'isdigit',
	'makeNode',
	'Node',
	'tree',
	'left',
	'right',
	'if',
	'else',
	'while',
	'for',
	'do',
	'return',
	'int',
	'char',
	'float',
	'double',
	'long',
	'short',
	'void',
	'switch',
	'case',
	'default',
	'break',
	'continue',
	'goto',
	'struct',
	'union',
	'enum',
	'typedef',
	'static',
	'const',
	'sizeof'
];

/** Token names for terminals of several characters that are not words. */
const TOKEN_NAMES: Record<string, string> = {
	'==': 'EQ',
	'!=': 'NE',
	'<=': 'LE',
	'>=': 'GE',
	'<>': 'NE',
	':=': 'ASSIGN',
	'&&': 'AND',
	'||': 'OR',
	'->': 'ARROW',
	'++': 'INCREMENT',
	'--': 'DECREMENT',
	'**': 'POWER',
	'<<': 'SHIFT_LEFT',
	'>>': 'SHIFT_RIGHT',
	'+=': 'PLUS_ASSIGN',
	'-=': 'MINUS_ASSIGN',
	'*=': 'TIMES_ASSIGN',
	'/=': 'DIVIDE_ASSIGN',
	'::': 'SCOPE',
	'..': 'RANGE'
};

/** Names of single characters, for token names and for the variables of operator nodes. */
const CHAR_NAMES: Record<string, string> = {
	'+': 'plus',
	'-': 'minus',
	'*': 'times',
	'/': 'divide',
	'%': 'mod',
	'^': 'power',
	'=': 'assign',
	'<': 'less',
	'>': 'greater',
	'&': 'and',
	'|': 'or',
	'!': 'not',
	'~': 'tilde',
	',': 'comma',
	';': 'semi',
	':': 'colon',
	'.': 'dot',
	'?': 'question',
	'@': 'at',
	'#': 'hash',
	'(': 'open',
	')': 'close',
	'[': 'lbracket',
	']': 'rbracket',
	'{': 'lbrace',
	'}': 'rbrace',
	$: 'dollar',
	'"': 'quote',
	"'": 'apostrophe',
	'\\': 'backslash'
};

const chars = (s: string): string[] => [...s];

/** A terminal written as one character: it is a character literal in the code. */
export const isCharacter = (terminal: string): boolean => chars(terminal).length === 1;

/** `'+'`, with the apostrophe and the backslash escaped. */
export function characterLiteral(ch: string): string {
	return ch === "'" ? "'\\''" : ch === '\\' ? "'\\\\'" : `'${ch}'`;
}

/** An upper-case token name for a terminal of several characters: `id` → ID, `==` → EQ. */
function tokenName(terminal: string): string {
	const known = TOKEN_NAMES[terminal];
	if (known) return known;
	const parts: string[] = [];
	let word = '';
	const flush = () => {
		if (word) parts.push(word.toUpperCase());
		word = '';
	};
	for (const ch of chars(terminal)) {
		if (/[A-Za-z0-9]/.test(ch)) word += ch;
		else {
			flush();
			if (ch === '_' || ch === '-' || /\s/u.test(ch)) continue;
			parts.push((CHAR_NAMES[ch] ?? `u${ch.codePointAt(0)!.toString(16)}`).toUpperCase());
		}
	}
	flush();
	const name = parts.join('_') || 'TOKEN';
	return /^[0-9]/.test(name) ? `T_${name}` : name;
}

/** A C identifier for a non-terminal: primes and hyphens become underscores (E’ → E_). */
function functionName(nonterminal: string): string {
	const name = nonterminal.replace(/[^A-Za-z0-9_]/gu, '_');
	return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
}

/** The terminal the slides test with `isdigit (token)` and match with `match (token)`. */
export const INT = 'int';

/** The names the code uses for the symbols of a grammar. */
export class Names {
	readonly functions = new Map<string, string>();
	readonly tokens = new Map<string, string>();
	private readonly taken = new Set(RESERVED);

	constructor(nonterminals: readonly string[], terminals: readonly string[]) {
		for (const n of nonterminals) this.functions.set(n, this.unique(functionName(n)));
		for (const t of terminals) {
			if (t === INT || t === END_MARKER || isCharacter(t)) continue;
			this.tokens.set(t, this.unique(tokenName(t)));
		}
	}

	/** `name` with underscores added until it is free; it is then taken. */
	unique(name: string): string {
		let out = name;
		while (this.taken.has(out)) out += '_';
		this.taken.add(out);
		return out;
	}

	/** A terminal as the code writes it: `'+'`, `ID`. */
	literal(terminal: string): string {
		if (isCharacter(terminal)) return characterLiteral(terminal);
		return this.tokens.get(terminal) ?? tokenName(terminal);
	}

	/** The test that the token is one of `tokens`: `token == '+' || token == '-'`, `isdigit (token)`. */
	test(tokens: readonly string[]): string {
		return tokens
			.map((t) => (t === INT ? 'isdigit (token)' : `token == ${this.literal(t)}`))
			.join(' || ');
	}

	/** The argument of match and makeNode for a terminal. */
	argument(terminal: string, known: boolean): string {
		return terminal === INT && known ? 'token' : this.literal(terminal);
	}

	/** A variable for the node of an operator: `plus` for +, `times` for *. */
	variable(operator: string, inUse: ReadonlySet<string>): string {
		const word = isCharacter(operator)
			? CHAR_NAMES[operator]
			: /^[A-Za-z_][A-Za-z0-9_]*$/.test(operator)
				? operator
				: undefined;
		let name = word !== undefined && !this.taken.has(word) ? word : 'node';
		while (inUse.has(name) || [...this.functions.values()].includes(name)) name += '_';
		return name;
	}
}

// ───────────────────────────── writing lines ─────────────────────────────

const INDENT = '  ';

/** Collects the lines of a program; statements keep the indices of their lines. */
export class Writer {
	readonly lines: CodeLine[] = [];
	/** The function being written. */
	fn: number | null = null;

	line(depth: number, text: string): number {
		this.lines.push({ text: INDENT.repeat(depth) + text, fn: this.fn });
		return this.lines.length - 1;
	}

	/** An empty line between two functions. */
	blank(): void {
		this.lines.push({ text: '', fn: null });
	}
}

/** `error ("T");`: `name` is the non-terminal as the grammar writes it. */
export function writeError(w: Writer, depth: number, name: string): Stmt {
	const text = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return { kind: 'error', line: w.line(depth, `error ("${text}");`), name };
}

/**
 * The test of one branch and the statements it guards. `write` is called with
 * the depth of the body, after the line of the test has been written.
 */
export interface Branch {
	tokens: string[];
	test: string;
	write: (depth: number) => Stmt[];
}

/**
 * An if with braces, in the layout of slide 37:
 *
 *   if (token == '(') {
 *     …
 *   }
 *   else if (isdigit (token)) {
 *     …
 *   }
 *   else
 *     error ("T");
 *
 * `otherwise` is the name for error, statements for a last `else { … }`, or
 * null for no else.
 */
export function writeIf(
	w: Writer,
	depth: number,
	branches: readonly Branch[],
	otherwise: { error: string } | { write: (depth: number) => Stmt[] } | null
): Stmt {
	const arms: Arm[] = branches.map((branch, i) => {
		const line = w.line(depth, `${i === 0 ? 'if' : 'else if'} (${branch.test}) {`);
		const body = branch.write(depth + 1);
		const close = w.line(depth, '}');
		return { tokens: branch.tokens, test: branch.test, line, body, close };
	});
	if (otherwise === null) return { kind: 'if', arms, otherwise: null };
	if ('error' in otherwise) {
		const line = w.line(depth, 'else');
		return {
			kind: 'if',
			arms,
			otherwise: { line, body: [writeError(w, depth + 1, otherwise.error)], close: null }
		};
	}
	const line = w.line(depth, 'else {');
	const body = otherwise.write(depth + 1);
	const close = w.line(depth, '}');
	return { kind: 'if', arms, otherwise: { line, body, close } };
}

/**
 * An if and an else of one statement each, without braces, as main is written
 * on slide 37:
 *
 *   if (token == '$')
 *     match ('$');
 *   else
 *     error ("main");
 */
export function writeGuard(w: Writer, depth: number, branch: Branch, error: string): Stmt {
	const line = w.line(depth, `if (${branch.test})`);
	const body = branch.write(depth + 1);
	const otherwise = w.line(depth, 'else');
	return {
		kind: 'if',
		arms: [{ tokens: branch.tokens, test: branch.test, line, body, close: null }],
		otherwise: { line: otherwise, body: [writeError(w, depth + 1, error)], close: null }
	};
}

/** `while (test) { … }` */
export function writeWhile(w: Writer, depth: number, branch: Branch): Stmt {
	const line = w.line(depth, `while (${branch.test}) {`);
	const body = branch.write(depth + 1);
	const close = w.line(depth, '}');
	return { kind: 'while', line, tokens: branch.tokens, test: branch.test, body, close };
}

/** `match ('+');`, or `match (token);` when the token is known to be an int. */
export function writeMatch(
	w: Writer,
	depth: number,
	names: Names,
	terminal: string,
	known: boolean
): Stmt {
	const text = `match (${names.argument(terminal, known)})`;
	return { kind: 'match', line: w.line(depth, `${text};`), terminal, certain: known, text };
}
