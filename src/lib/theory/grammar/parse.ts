/**
 * Grammar text in the lecture notation (docs/ARCHITECTURE.md §3.10): reading
 * and printing context-free grammars, EBNF grammars and token strings.
 *
 *   E → T | T + E         alternatives of one non-terminal on a line,
 *   T → int               or one production per line with the left side repeated,
 *     | int * T           or continuation lines that start with |
 *     | ( E )
 *
 * Symbols are separated by spaces. A name is a letter or underscore followed
 * by letters, digits, underscores and inner hyphens (`var-declaration`), then
 * any number of primes (`S'` is read as `S’`). Every other character is a
 * symbol of its own, so `E+E` is `E + E` and `(E)` is `( E )`; `∗` is read as
 * `*`. A quoted symbol ("the cat", '==', “x”) may hold spaces, and its quotes
 * are not part of its name. `→` and `->` are the arrow; `ε` and `epsilon` are
 * the empty right-hand side. Comments run from `//` to the end of the line or
 * sit between slash-star and star-slash.
 *
 * A symbol is a non-terminal exactly when it is a left-hand side, and the
 * start symbol is the first left-hand side.
 */
import { hasErrors, type Diagnostic } from '../diagnostics';
import type { Span } from '../regex/ast';
import { unproductive, unreachable } from './analyze';
import {
	EPSILON,
	type Ebnf,
	type EbnfGrammar,
	type EbnfRule,
	type Grammar,
	type Production
} from './types';

const ARROW = '→';
const PRIME = '’';
/** Characters read as a prime after a name. */
const PRIMES = "'’′";
/** Opening quote → closing quote. */
const QUOTES = new Map([
	['"', '"'],
	["'", "'"],
	['“', '”'],
	['‘', '’']
]);
/** Spellings of the empty string besides the word `epsilon`. */
const EPSILONS = 'εϵ';
/** Deepest nesting of { } and [ ] that parseEbnf reads. */
const MAX_NESTING = 50;

const span = (start: number, end: number): Span => ({ start, end, source: null });

const problem = (
	severity: Diagnostic['severity'],
	message: string,
	start: number,
	end: number
): Diagnostic => ({ severity, message, span: span(start, end) });

const byPosition = (ds: Diagnostic[]): Diagnostic[] =>
	ds
		.map((d, i) => ({ d, i }))
		.sort((a, b) => (a.d.span?.start ?? 0) - (b.d.span?.start ?? 0) || a.i - b.i)
		.map(({ d }) => d);

// ───────────────────────────── lexing ─────────────────────────────

type TokenKind = 'symbol' | 'arrow' | 'bar' | 'epsilon' | 'open' | 'close' | 'newline';

interface Token {
	kind: TokenKind;
	/** A symbol's name (quotes removed, primes and ∗ normalized); otherwise the token's text. */
	name: string;
	start: number;
	end: number;
	quoted: boolean;
	/** A quoted symbol that is unclosed or empty: reported, and kept so the line still has a symbol there. */
	broken?: boolean;
}

interface LexMode {
	/** →, ->, | and ε are notation; otherwise they are symbols like any other. */
	meta: boolean;
	/** { } [ ] are metasymbols. */
	ebnf: boolean;
	comments: boolean;
}

const GRAMMAR_MODE: LexMode = { meta: true, ebnf: false, comments: true };
const EBNF_MODE: LexMode = { meta: true, ebnf: true, comments: true };
const INPUT_MODE: LexMode = { meta: false, ebnf: false, comments: false };

interface Lexed {
	tokens: Token[];
	comments: Span[];
	diagnostics: Diagnostic[];
}

const charAt = (text: string, i: number): string => String.fromCodePoint(text.codePointAt(i)!);
const isNameStart = (ch: string | undefined): boolean => ch !== undefined && /^[A-Za-z_]$/.test(ch);
const isNamePart = (ch: string | undefined): boolean =>
	ch !== undefined && /^[A-Za-z0-9_]$/.test(ch);

function lex(text: string, mode: LexMode): Lexed {
	const tokens: Token[] = [];
	const comments: Span[] = [];
	const diagnostics: Diagnostic[] = [];
	const push = (kind: TokenKind, name: string, start: number, end: number, quoted = false) =>
		tokens.push({ kind, name, start, end, quoted });
	const n = text.length;
	let i = 0;
	while (i < n) {
		const ch = charAt(text, i);
		const after = i + ch.length;
		if (ch === '\n') {
			push('newline', ch, i, after);
			i = after;
		} else if (/\s/u.test(ch)) {
			i = after;
		} else if (mode.comments && text.startsWith('//', i)) {
			const newline = text.indexOf('\n', i);
			const end = newline < 0 ? n : newline;
			comments.push(span(i, end));
			i = end;
		} else if (mode.comments && text.startsWith('/*', i)) {
			const close = text.indexOf('*/', i + 2);
			const end = close < 0 ? n : close + 2;
			if (close < 0) diagnostics.push(problem('error', 'Comment is not closed. Add */', i, i + 2));
			comments.push(span(i, end));
			// A comment that spans lines ends the line it starts on.
			if (text.slice(i, end).includes('\n')) push('newline', '\n', i, end);
			i = end;
		} else if (QUOTES.has(ch)) {
			const closer = QUOTES.get(ch)!;
			let j = after;
			let name = '';
			let closed = false;
			while (j < n && text[j] !== '\n' && text[j] !== '\r') {
				const c = charAt(text, j);
				if (c === '\\' && j + 1 < n) {
					const escaped = charAt(text, j + 1);
					if (escaped === '\\' || escaped === closer) {
						name += escaped;
						j += 1 + escaped.length;
						continue;
					}
				}
				j += c.length;
				if (c === closer) {
					closed = true;
					break;
				}
				name += c;
			}
			if (!closed)
				diagnostics.push(problem('error', `Quoted symbol is not closed. Add ${closer}`, i, j));
			else if (name === '')
				diagnostics.push(
					problem('error', 'A quoted symbol cannot be empty. Write ε for the empty string.', i, j)
				);
			push('symbol', name, i, j, true);
			if (!closed || name === '') tokens[tokens.length - 1].broken = true;
			i = j;
		} else if (isNameStart(ch)) {
			let j = after;
			while (isNamePart(text[j]) || (text[j] === '-' && isNamePart(text[j + 1]))) j++;
			const base = text.slice(i, j);
			let primes = 0;
			while (j < n && PRIMES.includes(text[j])) {
				primes++;
				j++;
			}
			if (mode.meta && primes === 0 && base === 'epsilon') push('epsilon', base, i, j);
			else push('symbol', base + PRIME.repeat(primes), i, j);
			i = j;
		} else if (mode.meta && (ch === ARROW || ch === '⟶')) {
			push('arrow', ARROW, i, after);
			i = after;
		} else if (mode.meta && text.startsWith('->', i)) {
			push('arrow', ARROW, i, i + 2);
			i += 2;
		} else if (mode.meta && ch === '|') {
			push('bar', ch, i, after);
			i = after;
		} else if (mode.meta && EPSILONS.includes(ch)) {
			push('epsilon', ch, i, after);
			i = after;
		} else if (mode.ebnf && '{}[]'.includes(ch)) {
			push(ch === '{' || ch === '[' ? 'open' : 'close', ch, i, after);
			i = after;
		} else {
			push('symbol', ch === '∗' ? '*' : ch, i, after);
			i = after;
		}
	}
	return { tokens, comments, diagnostics };
}

/** The tokens of each non-empty line. */
function linesOf(tokens: readonly Token[]): Token[][] {
	const lines: Token[][] = [];
	let line: Token[] = [];
	for (const t of tokens) {
		if (t.kind !== 'newline') line.push(t);
		else if (line.length > 0) {
			lines.push(line);
			line = [];
		}
	}
	if (line.length > 0) lines.push(line);
	return lines;
}

// ───────────────────────────── right-hand sides ─────────────────────────────

/** One item of an alternative: a symbol, or a bracketed group with its own alternatives. */
type Atom = { kind: 'sym'; name: string } | { kind: 'opt' | 'rep'; alts: Atom[][] };

interface Alternative {
	/** Empty for ε. */
	atoms: Atom[];
	start: number;
	end: number;
}

const closerOf = (open: string): string => (open === '{' ? '}' : ']');
const openerOf = (close: string): string => (close === '}' ? '{' : '[');

/** Reads the alternatives of one line (everything after the arrow or the leading |). */
class BodyParser {
	private pos = 0;
	private tooDeep = false;

	constructor(
		private readonly tokens: readonly Token[],
		private readonly diagnostics: Diagnostic[],
		/** Message for an arrow inside the body. */
		private readonly arrowMessage: string
	) {}

	private error(message: string, start: number, end: number): void {
		if (!this.tooDeep) this.diagnostics.push(problem('error', message, start, end));
	}

	/**
	 * Alternatives up to the end of the line (depth 0) or up to a closing
	 * bracket. `lead` is the token just before the first alternative.
	 */
	alternatives(lead: Token, depth: number): Alternative[] {
		const out: Alternative[] = [];
		let atoms: Atom[] = [];
		let epsilons: Token[] = [];
		let first: Token | null = null;
		let last: Token | null = null;
		let before = lead;
		const finish = (after: Token | null): void => {
			if (first && last) {
				if (atoms.length > 0)
					for (const e of epsilons)
						this.diagnostics.push(
							problem('warning', 'ε has no effect next to other symbols.', e.start, e.end)
						);
				out.push({ atoms, start: first.start, end: last.end });
			} else if (after) {
				this.error('Nothing before |. Write ε for an empty alternative.', after.start, after.end);
			} else if (before.kind === 'bar') {
				this.error('Nothing after |. Write ε for an empty alternative.', before.start, before.end);
			} else if (before.kind === 'arrow') {
				this.error(
					'Nothing after →. Write ε for an empty right-hand side.',
					before.start,
					before.end
				);
			}
			atoms = [];
			epsilons = [];
			first = last = null;
		};
		for (;;) {
			const t = this.tokens[this.pos];
			if (!t) break;
			if (t.kind === 'close') {
				if (depth > 0) break;
				this.error(`${t.name} has no matching ${openerOf(t.name)}`, t.start, t.end);
				this.pos++;
				continue;
			}
			this.pos++;
			if (t.kind === 'bar') {
				finish(t);
				before = t;
				continue;
			}
			if (t.kind === 'arrow') {
				this.error(this.arrowMessage, t.start, t.end);
				continue;
			}
			first ??= t;
			if (t.kind === 'epsilon') epsilons.push(t);
			else if (t.kind === 'symbol') atoms.push({ kind: 'sym', name: t.name });
			else {
				const group = this.group(t, depth + 1);
				if (group) atoms.push(group);
			}
			last = this.tokens[this.pos - 1];
		}
		finish(null);
		return out;
	}

	/** The group opened by `open` (already consumed), through its closing bracket. */
	private group(open: Token, depth: number): Atom | null {
		const closer = closerOf(open.name);
		if (depth > MAX_NESTING) {
			this.error(
				`Brackets are nested too deeply (more than ${MAX_NESTING} levels).`,
				open.start,
				open.end
			);
			this.tooDeep = true;
			this.pos = this.tokens.length;
			return null;
		}
		const next = this.tokens[this.pos];
		if (next?.kind === 'close' && next.name === closer) {
			this.pos++;
			this.error(
				`Empty ${open.name} ${closer}. Put at least one symbol inside.`,
				open.start,
				next.end
			);
			return null;
		}
		const alts = this.alternatives(open, depth);
		const close = this.tokens[this.pos];
		if (!close) {
			this.error(`${open.name} is not closed. Add ${closer}`, open.start, open.end);
			return null;
		}
		this.pos++;
		if (close.name !== closer) {
			this.error(
				`Expected ${closer} to close ${open.name}, found ${close.name}`,
				close.start,
				close.end
			);
			return null;
		}
		return { kind: open.name === '{' ? 'rep' : 'opt', alts: alts.map((a) => a.atoms) };
	}
}

// ───────────────────────────── rule lines ─────────────────────────────

/** One alternative with the left-hand side it belongs to (the token of its rule line). */
interface Entry {
	lhs: Token;
	alt: Alternative;
}

function readRules(
	text: string,
	mode: LexMode
): { entries: Entry[]; tokens: Token[]; diagnostics: Diagnostic[] } {
	const { tokens, diagnostics } = lex(text, mode);
	const entries: Entry[] = [];
	const error = (message: string, start: number, end: number) =>
		diagnostics.push(problem('error', message, start, end));
	/** The left-hand side that lines starting with | continue. */
	let current: Token | null = null;
	/** The rule line above had an error: its | lines are checked but not kept. */
	let broken = false;
	for (const line of linesOf(tokens)) {
		const head = line[0];
		if (head.kind === 'bar') {
			const alts = new BodyParser(
				line.slice(1),
				diagnostics,
				'A line that starts with | cannot contain →. Start the production on a new line.'
			).alternatives(head, 0);
			if (current) for (const alt of alts) entries.push({ lhs: current, alt });
			else if (!broken)
				error(
					'A line that starts with | continues the production above it, and there is none.',
					head.start,
					head.end
				);
			continue;
		}
		const at = line.findIndex((t) => t.kind === 'arrow');
		if (at < 0) {
			error(
				'Missing →. Write a production as A → α (-> also works).',
				head.start,
				line[line.length - 1].end
			);
			current = null;
			broken = true;
			continue;
		}
		const arrow = line[at];
		const alts = new BodyParser(
			line.slice(at + 1),
			diagnostics,
			'A production has one →. Start the next production on a new line.'
		).alternatives(arrow, 0);
		if (at !== 1 || head.kind !== 'symbol') {
			if (at === 0)
				error('Nothing before →. The left-hand side is one non-terminal.', arrow.start, arrow.end);
			else error('The left-hand side must be a single symbol.', head.start, line[at - 1].end);
			current = null;
			broken = true;
			continue;
		}
		current = head;
		broken = false;
		for (const alt of alts) entries.push({ lhs: head, alt });
	}
	return { entries, tokens, diagnostics };
}

/** The first left-hand-side token of each non-terminal, in order of appearance. */
function leftSides(entries: readonly Entry[]): Map<string, Token> {
	const out = new Map<string, Token>();
	for (const { lhs } of entries) if (!out.has(lhs.name)) out.set(lhs.name, lhs);
	return out;
}

const EMPTY_GRAMMAR = 'Enter a grammar, e.g. E → E + E | int';

/** Notes and warnings about a grammar that parsed: naming convention, unused and empty non-terminals. */
function review(
	g: Grammar,
	lhs: ReadonlyMap<string, Token>,
	tokens: readonly Token[],
	ebnf: boolean,
	diagnostics: Diagnostic[]
): void {
	const at = (name: string): [number, number] => {
		const t = lhs.get(name)!;
		return [t.start, t.end];
	};
	const show = (name: string) => printSymbol(name, ebnf);
	const own = [...lhs.keys()];
	const lower = own.filter((name) => !/^\p{Lu}/u.test(name));
	if (lower.length > 0) {
		const shown = lower.slice(0, 3).map(show).join(', ');
		const more = lower.length > 3 ? ` and ${lower.length - 3} more` : '';
		diagnostics.push(
			problem(
				'info',
				`By convention, non-terminals start with a capital letter: ${shown}${more}`,
				...at(lower[0])
			)
		);
	}
	for (const name of unreachable(g))
		if (lhs.has(name))
			diagnostics.push(
				problem(
					'warning',
					`${show(name)} cannot be reached from the start symbol ${show(g.start)}.`,
					...at(name)
				)
			);
	for (const name of unproductive(g))
		if (lhs.has(name))
			diagnostics.push(
				problem(
					'warning',
					name === g.start
						? `${show(name)} derives no string of terminals: L(G) = { }`
						: `${show(name)} derives no string of terminals.`,
					...at(name)
				)
			);
	const noted = new Set<string>();
	for (const t of tokens) {
		if (t.kind !== 'symbol' || t.quoted || !t.name.includes('-')) continue;
		if (lhs.has(t.name) || noted.has(t.name)) continue;
		const parts = t.name.replace(/’+$/u, '').split('-');
		if (!parts.some((part) => lhs.has(part))) continue;
		noted.add(t.name);
		diagnostics.push(
			problem(
				'info',
				`${t.name} is one symbol. Write ${parts.join(' - ')} with spaces for ${parts.length * 2 - 1} symbols.`,
				t.start,
				t.end
			)
		);
	}
}

// ───────────────────────────── grammars ─────────────────────────────

const symbolNames = (atoms: readonly Atom[]): string[] =>
	atoms.map((atom) => {
		if (atom.kind !== 'sym') throw new Error('brackets are symbols outside EBNF');
		return atom.name;
	});

/** N and T of a list of productions; `order` lists terminals that come first, in that order. */
function assemble(productions: Production[], order: readonly string[] = []): Grammar {
	const nonterminals = [...new Set(productions.map((p) => p.lhs))];
	const isNonterminal = new Set(nonterminals);
	const used = new Set(productions.flatMap((p) => p.rhs).filter((s) => !isNonterminal.has(s)));
	const terminals = [...new Set([...order.filter((s) => used.has(s)), ...used])];
	return { start: productions[0].lhs, nonterminals, terminals, productions };
}

/**
 * A grammar from productions in order. The start symbol is the first
 * left-hand side; non-terminals are the left-hand sides; every other symbol is
 * a terminal. Repeated productions are listed once and ids are assigned in
 * order. `opts.terminals` fixes the order of the terminals it names (the rest
 * follow in order of appearance).
 */
export function makeGrammar(
	productions: readonly { lhs: string; rhs: readonly string[]; span?: Span }[],
	opts?: { terminals?: readonly string[] }
): Grammar {
	if (productions.length === 0) throw new Error('makeGrammar: a grammar needs a production');
	const seen = new Set<string>();
	const list: Production[] = [];
	for (const p of productions) {
		const key = JSON.stringify([p.lhs, p.rhs]);
		if (seen.has(key)) continue;
		seen.add(key);
		const production: Production = { id: list.length, lhs: p.lhs, rhs: [...p.rhs] };
		if (p.span) production.span = p.span;
		list.push(production);
	}
	return assemble(list, opts?.terminals);
}

/**
 * Parses a context-free grammar. `grammar` is null when there is an error.
 * Braces and square brackets are ordinary terminals here.
 *
 * Errors: no productions, a line without an arrow, a left-hand side that is
 * not one symbol, an empty alternative (it must be written ε), an unclosed
 * quote or comment. Warnings: a repeated production (listed once), a
 * non-terminal that cannot be reached from the start symbol, a non-terminal
 * that derives no terminal string. Info: left-hand sides that do not start
 * with a capital letter.
 */
export function parseGrammar(text: string): { grammar: Grammar | null; diagnostics: Diagnostic[] } {
	const { entries, tokens, diagnostics } = readRules(text, GRAMMAR_MODE);
	const productions: Production[] = [];
	const seen = new Set<string>();
	for (const { lhs, alt } of entries) {
		const rhs = symbolNames(alt.atoms);
		const key = JSON.stringify([lhs.name, rhs]);
		if (seen.has(key)) {
			diagnostics.push(
				problem(
					'warning',
					`Duplicate production ${printSymbol(lhs.name)} ${ARROW} ${printSymbols(rhs)}`,
					alt.start,
					alt.end
				)
			);
			continue;
		}
		seen.add(key);
		productions.push({
			id: productions.length,
			lhs: lhs.name,
			rhs,
			span: span(alt.start, alt.end)
		});
	}
	if (hasErrors(diagnostics)) return { grammar: null, diagnostics: byPosition(diagnostics) };
	if (productions.length === 0) {
		diagnostics.push(problem('error', EMPTY_GRAMMAR, 0, text.length));
		return { grammar: null, diagnostics };
	}
	const grammar = assemble(productions);
	review(grammar, leftSides(entries), tokens, false, diagnostics);
	return { grammar, diagnostics: byPosition(diagnostics) };
}

// ───────────────────────────── EBNF ─────────────────────────────

const sequenceOf = (atoms: readonly Atom[]): Ebnf => {
	const items = atoms.map((atom): Ebnf =>
		atom.kind === 'sym'
			? { kind: 'sym', name: atom.name }
			: { kind: atom.kind, body: choiceOf(atom.alts) }
	);
	return items.length === 0
		? { kind: 'eps' }
		: items.length === 1
			? items[0]
			: { kind: 'seq', items };
};

/** The EBNF tree of a list of alternatives: no one-item sequences or one-option choices. */
const choiceOf = (alts: readonly Atom[][]): Ebnf => {
	const options = alts.map(sequenceOf);
	return options.length === 1 ? options[0] : { kind: 'alt', options };
};

/**
 * An EBNF tree as alternatives of atoms. A choice inside a sequence, which
 * the notation cannot write without grouping, is multiplied out.
 */
function expand(e: Ebnf): Atom[][] {
	switch (e.kind) {
		case 'sym':
			return [[{ kind: 'sym', name: e.name }]];
		case 'eps':
			return [[]];
		case 'opt':
		case 'rep':
			return [[{ kind: e.kind, alts: expand(e.body) }]];
		case 'alt':
			return e.options.flatMap(expand);
		case 'seq':
			return e.items.reduce<Atom[][]>(
				(heads, item) => {
					const tails = expand(item);
					return heads.flatMap((head) => tails.map((tail) => [...head, ...tail]));
				},
				[[]]
			);
	}
}

function atomSymbols(atoms: readonly Atom[], out: string[]): string[] {
	for (const atom of atoms) {
		if (atom.kind === 'sym') out.push(atom.name);
		else for (const alt of atom.alts) atomSymbols(alt, out);
	}
	return out;
}

/**
 * Parses an EBNF grammar: the notation of parseGrammar plus `{ α }` (zero or
 * more α) and `[ α ]` (optional α). Alternation is allowed inside brackets,
 * brackets nest, and parentheses stay ordinary terminals; a brace or square
 * bracket used as a terminal is quoted. Each non-terminal gets one rule: lines
 * for the same non-terminal merge into an alternation. `grammar` is null when
 * there is an error (parseGrammar's, plus unbalanced or empty brackets).
 */
export function parseEbnf(text: string): {
	grammar: EbnfGrammar | null;
	diagnostics: Diagnostic[];
} {
	const { entries, tokens, diagnostics } = readRules(text, EBNF_MODE);
	const rules = new Map<string, { lhs: Token; alts: Atom[][]; keys: Set<string>; end: number }>();
	for (const { lhs, alt } of entries) {
		let rule = rules.get(lhs.name);
		if (!rule) {
			rule = { lhs, alts: [], keys: new Set(), end: alt.end };
			rules.set(lhs.name, rule);
		}
		const key = JSON.stringify(alt.atoms);
		if (rule.keys.has(key)) {
			diagnostics.push(
				problem(
					'warning',
					`Duplicate alternative ${printSymbol(lhs.name, true)} ${ARROW} ${printAlternatives([alt.atoms])}`,
					alt.start,
					alt.end
				)
			);
			continue;
		}
		rule.keys.add(key);
		rule.alts.push(alt.atoms);
		// The rule's span covers its first line and that line's | lines.
		if (lhs === rule.lhs) rule.end = alt.end;
	}
	if (hasErrors(diagnostics)) return { grammar: null, diagnostics: byPosition(diagnostics) };
	if (rules.size === 0) {
		diagnostics.push(problem('error', EMPTY_GRAMMAR, 0, text.length));
		return { grammar: null, diagnostics };
	}
	const nonterminals = [...rules.keys()];
	// In rule order (not text order), so that the printed grammar lists them the same way.
	const symbols = [...rules.values()].flatMap((rule) =>
		rule.alts.flatMap((atoms) => atomSymbols(atoms, []))
	);
	const grammar: EbnfGrammar = {
		start: nonterminals[0],
		nonterminals,
		terminals: [...new Set(symbols.filter((s) => !rules.has(s)))],
		rules: [...rules.values()].map((rule): EbnfRule => ({
			lhs: rule.lhs.name,
			body: choiceOf(rule.alts),
			span: span(rule.lhs.start, rule.end)
		}))
	};
	review(ebnfToGrammar(grammar), leftSides(entries), tokens, true, diagnostics);
	return { grammar, diagnostics: byPosition(diagnostics) };
}

/**
 * A plain grammar for the same language. Within the rule of X, each `{ α }`
 * becomes a new non-terminal X’ → α X’ | ε and each `[ α ]` becomes
 * X’ → α | ε; primes are added until the name is unused. New non-terminals
 * are named left to right, outer brackets before the ones nested in them, and
 * their productions follow the rule's own in that order.
 */
export function ebnfToGrammar(e: EbnfGrammar): Grammar {
	const used = new Set<string>([...e.nonterminals, ...e.terminals]);
	for (const rule of e.rules)
		for (const alt of expand(rule.body)) atomSymbols(alt, []).forEach((s) => used.add(s));
	const productions: { lhs: string; rhs: string[]; span?: Span }[] = [];
	for (const rule of e.rules) {
		const fresh = (): string => {
			let name = rule.lhs + PRIME;
			while (used.has(name)) name += PRIME;
			used.add(name);
			return name;
		};
		const queue: { lhs: string; alts: Atom[][] }[] = [{ lhs: rule.lhs, alts: expand(rule.body) }];
		for (let next = 0; next < queue.length; next++) {
			const { lhs, alts } = queue[next];
			for (const atoms of alts) {
				const rhs = atoms.map((atom) => {
					if (atom.kind === 'sym') return atom.name;
					const name = fresh();
					const again: Atom = { kind: 'sym', name };
					queue.push({
						lhs: name,
						alts:
							atom.kind === 'rep'
								? [...atom.alts.filter((a) => a.length > 0).map((a) => [...a, again]), []]
								: [...atom.alts, []]
					});
					return name;
				});
				productions.push(rule.span ? { lhs, rhs, span: rule.span } : { lhs, rhs });
			}
		}
	}
	return makeGrammar(productions, { terminals: e.terminals });
}

// ───────────────────────────── printing ─────────────────────────────

/** True when `name` written bare reads back as that one symbol. */
function isBare(name: string, ebnf: boolean): boolean {
	if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name !== 'epsilon';
	const { tokens, diagnostics } = lex(name, ebnf ? EBNF_MODE : GRAMMAR_MODE);
	return (
		diagnostics.length === 0 &&
		tokens.length === 1 &&
		tokens[0].kind === 'symbol' &&
		!tokens[0].quoted &&
		tokens[0].name === name
	);
}

function quote(name: string): string {
	if (name.includes('"') && !name.includes("'") && !name.includes('\\')) return `'${name}'`;
	let out = '"';
	for (let i = 0; i < name.length; i++) {
		const ch = name[i];
		const next = name[i + 1];
		if (ch === '"') out += '\\"';
		else if (ch === '\\' && (next === undefined || next === '\\' || next === '"')) out += '\\\\';
		else out += ch;
	}
	return out + '"';
}

const printSymbol = (name: string, ebnf = false): string =>
	isBare(name, ebnf) ? name : quote(name);

/**
 * A string of grammar symbols as the decks write it: `E + T`, and `ε` for the
 * empty string. A symbol is quoted only when it would not read back as itself
 * (`"the cat"`, `"|"`); with `opts.ebnf`, braces and square brackets are
 * quoted too.
 */
export function printSymbols(symbols: readonly string[], opts?: { ebnf?: boolean }): string {
	return symbols.length === 0 ? EPSILON : symbols.map((s) => printSymbol(s, opts?.ebnf)).join(' ');
}

/**
 * Grammar text that parseGrammar reads back as the same grammar. Productions
 * keep their order: `nonterminal` (default) joins neighbouring productions of
 * one non-terminal with ` | `; `production` writes one production per line;
 * `alternative` puts each further alternative on its own line under the arrow.
 */
export function printGrammar(
	g: Grammar,
	opts?: { perLine?: 'nonterminal' | 'production' | 'alternative' }
): string {
	const perLine = opts?.perLine ?? 'nonterminal';
	const lines: string[] = [];
	let previous: string | null = null;
	for (const p of g.productions) {
		const lhs = printSymbol(p.lhs);
		const rhs = printSymbols(p.rhs);
		if (perLine === 'production' || previous !== p.lhs) lines.push(`${lhs} ${ARROW} ${rhs}`);
		else if (perLine === 'nonterminal') lines[lines.length - 1] += ` | ${rhs}`;
		else lines.push(`${' '.repeat(lhs.length + 1)}| ${rhs}`);
		previous = p.lhs;
	}
	return lines.join('\n');
}

function printAlternatives(alts: readonly Atom[][]): string {
	return alts
		.map((atoms) =>
			atoms.length === 0
				? EPSILON
				: atoms
						.map((atom) => {
							if (atom.kind === 'sym') return printSymbol(atom.name, true);
							const inner = printAlternatives(atom.alts);
							return atom.kind === 'rep' ? `{ ${inner} }` : `[ ${inner} ]`;
						})
						.join(' ')
		)
		.join(' | ');
}

/** EBNF text that parseEbnf reads back as the same grammar: one rule per line, spaces inside brackets. */
export function printEbnf(g: EbnfGrammar): string {
	return g.rules
		.map(
			(rule) => `${printSymbol(rule.lhs, true)} ${ARROW} ${printAlternatives(expand(rule.body))}`
		)
		.join('\n');
}

// ───────────────────────────── token strings ─────────────────────────────

/**
 * Splits a token string such as `( int + int ) * int` into symbols, with the
 * lexing of grammar symbols (names, primes, one-character symbols, quoted
 * symbols, ∗ as *); there are no comments, and → and | are symbols like any
 * other. A symbol that is not in `terminals` gets an error with its span, so
 * a closing `$` is accepted only when `$` is one of the terminals passed.
 * `ε` (or `epsilon`) stands for the empty string unless it is a terminal.
 * `tokens` and `spans` list every symbol read, known or not.
 */
export function tokenizeInput(
	text: string,
	terminals: readonly string[],
	opts?: { nonterminals?: readonly string[] }
): { tokens: string[]; spans: Span[]; diagnostics: Diagnostic[] } {
	const { tokens: lexed, diagnostics } = lex(text, INPUT_MODE);
	const known = new Set(terminals);
	const nonterminals = new Set(opts?.nonterminals);
	const tokens: string[] = [];
	const spans: Span[] = [];
	for (const t of lexed) {
		if (t.kind !== 'symbol' || t.broken) continue;
		const empty = !t.quoted && (t.name === 'epsilon' || EPSILONS.includes(t.name));
		if (empty && !known.has(t.name)) continue;
		tokens.push(t.name);
		spans.push(span(t.start, t.end));
		if (known.has(t.name)) continue;
		const parts = t.name.split('-');
		let message = `${printSymbol(t.name)} is not a terminal of the grammar.`;
		if (nonterminals.has(t.name))
			message = `${printSymbol(t.name)} is a non-terminal. The input is a string of terminals.`;
		else if (!t.quoted && parts.length > 1 && parts.every((part) => known.has(part)))
			message += ` Write ${parts.join(' - ')} with spaces.`;
		diagnostics.push(problem('error', message, t.start, t.end));
	}
	return { tokens, spans, diagnostics: byPosition(diagnostics) };
}

// ───────────────────────────── highlighting ─────────────────────────────

export type GrammarTokenKind =
	'nonterminal' | 'terminal' | 'arrow' | 'bar' | 'epsilon' | 'bracket' | 'comment';

/** A stretch of grammar text and what it is, for syntax highlighting. */
export interface GrammarToken {
	kind: GrammarTokenKind;
	span: Span;
	/** The symbol's name, for non-terminals and terminals. */
	name?: string;
}

/**
 * The pieces of grammar text in order: symbols (non-terminal when the symbol
 * starts some line before an arrow), arrows, bars, ε, EBNF brackets (with
 * `opts.ebnf`) and comments. Works on text with errors.
 */
export function scanGrammar(text: string, opts?: { ebnf?: boolean }): GrammarToken[] {
	const { tokens, comments } = lex(text, opts?.ebnf ? EBNF_MODE : GRAMMAR_MODE);
	const nonterminals = new Set<string>();
	for (const line of linesOf(tokens))
		if (line[0].kind === 'symbol' && line[1]?.kind === 'arrow') nonterminals.add(line[0].name);
	const out: GrammarToken[] = comments.map((c) => ({ kind: 'comment', span: c }));
	for (const t of tokens) {
		if (t.kind === 'newline') continue;
		const at = span(t.start, t.end);
		if (t.kind === 'symbol')
			out.push({
				kind: nonterminals.has(t.name) ? 'nonterminal' : 'terminal',
				span: at,
				name: t.name
			});
		else if (t.kind === 'open' || t.kind === 'close') out.push({ kind: 'bracket', span: at });
		else out.push({ kind: t.kind, span: at });
	}
	return out.sort((a, b) => a.span.start - b.span.start);
}
