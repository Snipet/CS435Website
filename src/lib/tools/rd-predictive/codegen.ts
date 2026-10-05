/**
 * The predictive recursive-descent parser of an EBNF grammar, written as on
 * Top-Down Parsing, slide 37:
 *
 *   main () {
 *     // E $
 *     E ();
 *     if (token == '$')
 *       match ('$');
 *     else
 *       error ("main");
 *   }
 *
 *   // E -> T [ + E ]
 *   E () {
 *     T ();
 *     if (token == '+') {
 *       match ('+');
 *       E ();
 *     }
 *   }
 *
 * One function per rule, with the rule above it as a comment. A terminal is
 * `match (…)` and a non-terminal is a call. Alternatives become if / else if
 * on `token`, with `error ("T")` as the last else; `[ α ]` becomes
 * `if (token == …) { … }` and `{ α }` becomes `while (token == …) { … }`. The
 * tokens of every test are the ones that can start the part it guards.
 *
 * Two cases the slide does not show:
 *
 * - An alternative that can derive ε is the one taken when no test holds. The
 *   alternative ε itself needs no code, so the function has no last else; any
 *   other such alternative is the last `else { … }`.
 * - An `int` with no test of the token before it is written with one, the way
 *   main matches `$`: `if (isdigit (token)) match (token); else error ("F");`.
 */
import { END_MARKER, type EbnfGrammar } from '$lib/theory/grammar/types';
import { printAlts, printSymbol, type Alt, type Item } from './ebnf';
import { lookaheadOf, type Lookahead } from './predict';
import {
	INT,
	Names,
	Writer,
	writeError,
	writeGuard,
	writeIf,
	writeMatch,
	writeWhile,
	type Branch,
	type Fn,
	type Program,
	type Stmt
} from './program';

/** What the writers of one function share. */
export interface Scope {
	w: Writer;
	names: Names;
	lookahead: Lookahead;
	/** Index of each non-terminal's function; -1 when it has none. */
	functions: ReadonlyMap<string, number>;
	/** The name `error` is called with: the non-terminal of the function. */
	error: string;
}

/** The rule as the comment above its function: `// E -> T [ + E ]`. */
export const ruleComment = (lhs: string, alts: readonly Alt[]): string =>
	`// ${printSymbol(lhs)} -> ${printAlts(alts)}`;

/**
 * The terminal the token is known to be inside a branch: the one token of its
 * test, when the alternative starts with that terminal.
 */
export function knownToken(alt: Alt, tokens: readonly string[]): string | null {
	const first = alt[0];
	return tokens.length === 1 && first?.kind === 'sym' && first.name === tokens[0]
		? tokens[0]
		: null;
}

/** `match (…);` for a terminal, with the test an `int` needs when the token is not known. */
export function writeTerminal(
	scope: Scope,
	depth: number,
	terminal: string,
	certain: boolean
): Stmt {
	const { w, names } = scope;
	if (terminal !== INT || certain) return writeMatch(w, depth, names, terminal, certain);
	return writeGuard(
		w,
		depth,
		{
			tokens: [INT],
			test: names.test([INT]),
			write: (d) => [writeMatch(w, d, names, INT, true)]
		},
		scope.error
	);
}

/** `E ();` */
function writeCall(scope: Scope, depth: number, nonterminal: string, fn: number): Stmt {
	const name = scope.names.functions.get(nonterminal) ?? nonterminal;
	return { kind: 'call', line: scope.w.line(depth, `${name} ();`), fn };
}

/** The statements of one alternative. `known`: the terminal the token is known to be. */
function writeSequence(scope: Scope, depth: number, alt: Alt, known: string | null): Stmt[] {
	const out: Stmt[] = [];
	alt.forEach((item, at) => {
		if (item.kind !== 'sym') {
			out.push(...writeBracket(scope, depth, item));
			return;
		}
		const fn = scope.functions.get(item.name);
		if (fn !== undefined) out.push(writeCall(scope, depth, item.name, fn));
		else out.push(writeTerminal(scope, depth, item.name, at === 0 && known === item.name));
	});
	return out;
}

/** One branch per alternative that some token can start, with the tokens that start it. */
export function branchesOf(
	scope: Scope,
	alts: readonly Alt[],
	write: (depth: number, alt: Alt, known: string | null) => Stmt[],
	skip = -1
): Branch[] {
	const out: Branch[] = [];
	alts.forEach((alt, i) => {
		if (i === skip) return;
		const { tokens } = scope.lookahead.firstOf(alt);
		if (tokens.length === 0) return;
		out.push({
			tokens,
			test: scope.names.test(tokens),
			write: (depth) => write(depth, alt, knownToken(alt, tokens))
		});
	});
	return out;
}

/**
 * `[ α ]` as an if and `{ α }` as a while. With several alternatives inside,
 * an option is an if / else if without a last else, and a repetition tests
 * for any of them and chooses inside the loop.
 */
export function writeBracketWith(
	scope: Scope,
	depth: number,
	item: Extract<Item, { kind: 'opt' | 'rep' }>,
	write: (depth: number, alt: Alt, known: string | null) => Stmt[]
): Stmt[] {
	const { w, names, lookahead } = scope;
	const branches = branchesOf(scope, item.alts, write);
	if (branches.length === 0) return [];
	if (item.kind === 'opt') return [writeIf(w, depth, branches, null)];
	if (branches.length === 1) return [writeWhile(w, depth, branches[0])];
	const tokens = lookahead.sorted(branches.flatMap((b) => b.tokens));
	return [
		writeWhile(w, depth, {
			tokens,
			test: names.test(tokens),
			write: (d) => [writeIf(w, d, branches, null)]
		})
	];
}

function writeBracket(
	scope: Scope,
	depth: number,
	item: Extract<Item, { kind: 'opt' | 'rep' }>
): Stmt[] {
	return writeBracketWith(scope, depth, item, (d, alt, known) =>
		writeSequence(scope, d, alt, known)
	);
}

/**
 * The alternatives of a rule: the statements of the one alternative, or an
 * if / else if with one branch per alternative. The first alternative that
 * can derive ε is taken when no test holds; without one, the last else is
 * `error ("T")`.
 */
export function writeAlternatives(
	scope: Scope,
	depth: number,
	alts: readonly Alt[],
	write: (depth: number, alt: Alt, known: string | null) => Stmt[]
): Stmt[] {
	const { w, lookahead } = scope;
	if (alts.length === 1) return write(depth, alts[0], null);
	const fallback = alts.findIndex((alt) => lookahead.firstOf(alt).nullable);
	const branches = branchesOf(scope, alts, write, fallback);
	if (branches.length === 0) {
		if (fallback !== -1) return write(depth, alts[fallback], null);
		return [writeError(w, depth, scope.error)];
	}
	if (fallback === -1) return [writeIf(w, depth, branches, { error: scope.error })];
	const rest = alts[fallback];
	return [
		writeIf(w, depth, branches, rest.length === 0 ? null : { write: (d) => write(d, rest, null) })
	];
}

/** The index each rule's function gets when `first` functions come before them. */
export function functionIndices(lookahead: Lookahead, first: number): Map<string, number> {
	return new Map(lookahead.rules.map((rule, i) => [rule.lhs, first + i]));
}

/**
 * The parser of `e`: main, then one function per rule in the order of the
 * grammar. A grammar that is not suitable for prediction still gets its code;
 * where two alternatives start with the same token, the first one is taken.
 */
export function generateParser(e: EbnfGrammar, lookahead: Lookahead = lookaheadOf(e)): Program {
	const names = new Names(e.nonterminals, e.terminals);
	const w = new Writer();
	const indices = functionIndices(lookahead, 1);
	const functions: Fn[] = [];
	const startName = names.functions.get(e.start) ?? e.start;

	w.fn = 0;
	const head = w.line(0, 'main () {');
	w.line(1, `// ${printSymbol(e.start)} ${END_MARKER}`);
	const body: Stmt[] = [{ kind: 'call', line: w.line(1, `${startName} ();`), fn: 1 }];
	body.push(
		writeGuard(
			w,
			1,
			{
				tokens: [END_MARKER],
				test: names.test([END_MARKER]),
				write: (d) => [writeMatch(w, d, names, END_MARKER, true)]
			},
			'main'
		)
	);
	functions.push({
		name: 'main',
		nonterminal: null,
		first: head,
		head,
		close: w.line(0, '}'),
		body
	});

	lookahead.rules.forEach((rule, i) => {
		w.blank();
		w.fn = i + 1;
		const name = names.functions.get(rule.lhs) ?? rule.lhs;
		const scope: Scope = { w, names, lookahead, functions: indices, error: rule.lhs };
		const first = w.line(0, ruleComment(rule.lhs, rule.alts));
		const fnHead = w.line(0, `${name} () {`);
		const stmts = writeAlternatives(scope, 1, rule.alts, (d, alt, known) =>
			writeSequence(scope, d, alt, known)
		);
		functions.push({
			name,
			nonterminal: rule.lhs,
			first,
			head: fnHead,
			close: w.line(0, '}'),
			body: stmts
		});
	});

	return { kind: 'parser', lines: w.lines, functions, main: 0, start: 1 };
}
