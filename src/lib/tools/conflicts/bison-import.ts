/**
 * Reads a bison grammar file (the Parser.yy of Bottom-up Parsing III,
 * slide 28) into the lecture notation and precedence lines of this tool:
 *
 *   %token INT                      INT is a terminal
 *   %left '+'                       →  %left '+'
 *   %left '*'                          %left '*'
 *   %%
 *   exp : exp '+' exp  { $$ = $1 + $3; }
 *       | exp '*' exp  { $$ = $1 * $3; }
 *       | INT                       →  exp → exp + exp | exp * exp | INT
 *       ;
 *   %%
 *
 * Actions, the C code of the prologue and epilogue, and the directives that
 * do not change the grammar (%union, %type, %define, …) are left out. What
 * would change the parser and is not read — %prec, mid-rule actions,
 * %precedence, %dprec, %merge — is reported, as is anything the lecture
 * notation reads differently. Diagnostics locate the problem in the text.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { makeGrammar, printGrammar } from '$lib/theory/grammar/parse';
import { END_MARKER, EPSILON } from '$lib/theory/grammar/types';
import type { Span } from '$lib/theory/regex/ast';
import { ASSOCS, bisonSymbol, printDeclaration, type Assoc } from './precedence';

export interface BisonImport {
	/** The grammar in lecture notation; '' when no rule was read. */
	grammar: string;
	/** The precedence declarations, one per line, as this tool reads them. */
	precedence: string;
	/** The start symbol: %start, else the first rule's left-hand side. */
	start: string | null;
	/** Number of productions read. */
	productions: number;
	diagnostics: Diagnostic[];
}

type TokenKind =
	| 'id'
	| 'char'
	| 'string'
	| 'directive'
	| 'separator' // %%
	| 'code' // { … } or %{ … %}
	| 'tag' // <type>
	| 'number'
	| 'punct'; // : | ; [ ] = ,

interface Token {
	kind: TokenKind;
	/** The identifier, the literal's value, the directive's name, the punctuation. */
	value: string;
	start: number;
	end: number;
	/** Code: whether it is the prologue's %{ … %}. */
	prologue?: boolean;
}

/**
 * What an escape in a literal stands for. Control characters keep their C
 * spelling as the terminal's name (`'\n'` is the terminal \n), so the
 * grammar text can write them; bisonSymbol prints them back as `'\n'`.
 */
const ESCAPES: Record<string, string> = {
	n: '\\n',
	t: '\\t',
	r: '\\r',
	'0': '\\0',
	'\\': '\\',
	"'": "'",
	'"': '"'
};

/** Splits the text into tokens up to the epilogue; comments and white space are dropped. */
function tokenize(text: string, report: (d: Diagnostic) => void): Token[] {
	const tokens: Token[] = [];
	const span = (start: number, end: number): Span => ({ start, end, source: null });
	let i = 0;
	const n = text.length;
	/** Skips a quoted literal in code; returns the index after it. */
	const skipQuoted = (at: number): number => {
		const q = text[at];
		let j = at + 1;
		while (j < n && text[j] !== q && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
		return Math.min(n, j + 1);
	};
	/** Skips braced code from the `{` at `at`; returns the index after the matching `}`. */
	const skipCode = (at: number): number => {
		let depth = 0;
		let j = at;
		while (j < n) {
			const c = text[j];
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) return j + 1;
			} else if (c === '"' || c === "'") {
				j = skipQuoted(j);
				continue;
			} else if (text.startsWith('//', j)) {
				const nl = text.indexOf('\n', j);
				j = nl < 0 ? n : nl;
				continue;
			} else if (text.startsWith('/*', j)) {
				const close = text.indexOf('*/', j + 2);
				j = close < 0 ? n : close + 2;
				continue;
			}
			j++;
		}
		return -1;
	};
	while (i < n) {
		const c = text[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (text.startsWith('//', i)) {
			const nl = text.indexOf('\n', i);
			i = nl < 0 ? n : nl;
			continue;
		}
		if (text.startsWith('/*', i)) {
			const close = text.indexOf('*/', i + 2);
			if (close < 0) {
				report({ severity: 'error', message: 'The comment is not closed.', span: span(i, n) });
				break;
			}
			i = close + 2;
			continue;
		}
		if (text.startsWith('%%', i)) {
			tokens.push({ kind: 'separator', value: '%%', start: i, end: i + 2 });
			i += 2;
			// After the second %% comes the epilogue: C code, copied as it is.
			if (tokens.filter((t) => t.kind === 'separator').length === 2) break;
			continue;
		}
		if (text.startsWith('%{', i)) {
			const close = text.indexOf('%}', i + 2);
			const end = close < 0 ? n : close + 2;
			if (close < 0)
				report({
					severity: 'error',
					message: 'The %{ code is not closed by %}.',
					span: span(i, n)
				});
			tokens.push({ kind: 'code', value: '', start: i, end, prologue: true });
			i = end;
			continue;
		}
		if (c === '%') {
			const m = /^%[A-Za-z][A-Za-z0-9_-]*/.exec(text.slice(i, i + 40));
			if (m) {
				tokens.push({ kind: 'directive', value: m[0].slice(1), start: i, end: i + m[0].length });
				i += m[0].length;
				continue;
			}
		}
		if (c === '{') {
			const end = skipCode(i);
			if (end < 0) {
				report({ severity: 'error', message: 'The braces { } are not closed.', span: span(i, n) });
				break;
			}
			tokens.push({ kind: 'code', value: '', start: i, end });
			i = end;
			continue;
		}
		if (c === "'" || c === '"') {
			let j = i + 1;
			let value = '';
			while (j < n && text[j] !== c && text[j] !== '\n') {
				if (text[j] === '\\' && j + 1 < n) {
					value += ESCAPES[text[j + 1]] ?? text[j + 1];
					j += 2;
				} else value += text[j++];
			}
			if (j >= n || text[j] !== c) {
				report({ severity: 'error', message: 'The quote is not closed.', span: span(i, j) });
				i = j;
				continue;
			}
			tokens.push({ kind: c === "'" ? 'char' : 'string', value, start: i, end: j + 1 });
			i = j + 1;
			continue;
		}
		if (c === '<') {
			const close = text.indexOf('>', i);
			if (close > i && !text.slice(i, close).includes('\n')) {
				tokens.push({ kind: 'tag', value: text.slice(i + 1, close), start: i, end: close + 1 });
				i = close + 1;
				continue;
			}
		}
		const id = /^[A-Za-z_.][A-Za-z0-9_.-]*/.exec(text.slice(i, i + 200));
		if (id) {
			// A trailing dash belongs to what follows (bison reads `a-` badly anyway).
			const value = id[0].replace(/-+$/, '');
			tokens.push({ kind: 'id', value, start: i, end: i + value.length });
			i += value.length;
			continue;
		}
		const num = /^-?[0-9]+/.exec(text.slice(i, i + 20));
		if (num) {
			tokens.push({ kind: 'number', value: num[0], start: i, end: i + num[0].length });
			i += num[0].length;
			continue;
		}
		if (':|;[]=,'.includes(c)) {
			tokens.push({ kind: 'punct', value: c, start: i, end: i + 1 });
			i++;
			continue;
		}
		report({
			severity: 'error',
			message: `${c} is not part of bison's grammar syntax here.`,
			span: span(i, i + 1)
		});
		i++;
	}
	return tokens;
}

/** Directives that do not change the grammar; their arguments are skipped. */
const QUIET = new Set([
	'union',
	'type',
	'nterm',
	'define',
	'code',
	'expect',
	'expect-rr',
	'debug',
	'locations',
	'defines',
	'header',
	'output',
	'file-prefix',
	'name-prefix',
	'skeleton',
	'language',
	'require',
	'param',
	'parse-param',
	'lex-param',
	'initial-action',
	'destructor',
	'printer',
	'verbose',
	'token-table',
	'pure-parser',
	'error-verbose',
	'no-lines',
	'yacc',
	'glr-parser',
	'default-prec',
	'no-default-prec',
	'header'
]);

interface PrecedenceLineDraft {
	assoc: Assoc | 'precedence';
	/** Terminals as written: names, or literal values. */
	symbols: { kind: 'id' | 'char' | 'string'; value: string; span: Span }[];
}

interface Alternative {
	symbols: { kind: 'id' | 'char' | 'string'; value: string; span: Span }[];
	span: Span;
}

/** Converts a bison grammar file; see the module comment. */
export function importBison(text: string): BisonImport {
	const diagnostics: Diagnostic[] = [];
	const report = (d: Diagnostic) => diagnostics.push(d);
	const span = (start: number, end: number): Span => ({ start, end, source: null });
	const tokens = tokenize(text, report);

	const separators = tokens.filter((t) => t.kind === 'separator');
	let k = 0;
	const declared = new Set<string>(); // %token names
	const aliasOf = new Map<string, string>(); // "==" → EQ
	const precedence: PrecedenceLineDraft[] = [];
	let start: { name: string; span: Span } | null = null;
	const ignored = new Set<string>();

	// ───────── declarations ─────────
	if (separators.length === 0) {
		if (tokens.length > 0)
			report({
				severity: 'info',
				message: 'There is no %% line: the whole text is read as the rules section.',
				span: span(tokens[0].start, tokens[0].start)
			});
	} else {
		while (k < tokens.length && tokens[k].kind !== 'separator') {
			const t = tokens[k];
			if (t.kind === 'code') {
				if (t.prologue && !ignored.has('%{')) {
					ignored.add('%{');
					report({
						severity: 'info',
						message: 'The C code in %{ … %} is left out.',
						span: span(t.start, t.end)
					});
				}
				k++;
				continue;
			}
			if (t.kind !== 'directive') {
				report({
					severity: 'error',
					message: 'Declarations start with a % directive.',
					span: span(t.start, t.end)
				});
				k++;
				continue;
			}
			// The directive's arguments: everything up to the next directive, code block of the
			// prologue, or %%.
			const args: Token[] = [];
			k++;
			while (
				k < tokens.length &&
				tokens[k].kind !== 'directive' &&
				tokens[k].kind !== 'separator' &&
				!(tokens[k].kind === 'code' && tokens[k].prologue)
			)
				args.push(tokens[k++]);
			const name = t.value;
			const where = span(t.start, args.length ? args[args.length - 1].end : t.end);
			if (name === 'token') {
				let last: string | null = null;
				for (const a of args) {
					if (a.kind === 'id') {
						declared.add(a.value);
						last = a.value;
					} else if (a.kind === 'string' && last !== null) aliasOf.set(a.value, last);
					else if (a.kind === 'char') declared.add(a.value);
				}
			} else if ((ASSOCS as readonly string[]).includes(name) || name === 'precedence') {
				const symbols: PrecedenceLineDraft['symbols'] = [];
				let last: string | null = null;
				for (const a of args) {
					if (a.kind === 'id' || a.kind === 'char' || a.kind === 'string') {
						if (a.kind === 'string' && last !== null && aliasOf.get(a.value) === undefined) {
							// %left PLUS "+": the string is an alias of the name before it.
							aliasOf.set(a.value, last);
							continue;
						}
						symbols.push({ kind: a.kind, value: a.value, span: span(a.start, a.end) });
						if (a.kind === 'id') {
							declared.add(a.value);
							last = a.value;
						}
					} else if (a.kind !== 'tag' && a.kind !== 'number')
						report({
							severity: 'warning',
							message: `%${name} lists tokens; this is left out.`,
							span: span(a.start, a.end)
						});
				}
				precedence.push({ assoc: name as PrecedenceLineDraft['assoc'], symbols });
				if (name === 'precedence')
					report({
						severity: 'warning',
						message:
							'%precedence (a precedence without associativity) is not read by this tool; the line is turned off. Write %left, %right or %nonassoc.',
						span: where
					});
			} else if (name === 'start') {
				const id = args.find((a) => a.kind === 'id');
				if (id) start = { name: id.value, span: span(id.start, id.end) };
			} else if (QUIET.has(name)) {
				if (!ignored.has(name)) {
					ignored.add(name);
					report({
						severity: 'info',
						message: `%${name} does not change the grammar; it is left out.`,
						span: span(t.start, t.end)
					});
				}
			} else
				report({
					severity: 'warning',
					message: `%${name} is not read; it is left out.`,
					span: span(t.start, t.end)
				});
		}
		k++; // past %%
	}

	// ───────── rules ─────────
	const rules: { lhs: string; lhsSpan: Span; alternatives: Alternative[] }[] = [];
	const end = separators.length >= 2 ? tokens.indexOf(separators[1]) : tokens.length;
	const isRuleStart = (at: number): boolean => {
		if (tokens[at]?.kind !== 'id') return false;
		let j = at + 1;
		// A named reference: exp[result] :
		if (tokens[j]?.value === '[' && tokens[j + 2]?.value === ']') j += 3;
		return tokens[j]?.kind === 'punct' && tokens[j].value === ':';
	};
	while (k < end) {
		const t = tokens[k];
		if (t.kind === 'punct' && t.value === ';') {
			k++;
			continue;
		}
		if (!isRuleStart(k)) {
			report({
				severity: 'error',
				message: 'A rule starts with its left-hand side and a colon: exp : …',
				span: span(t.start, t.end)
			});
			// Skip to the next rule.
			k++;
			while (k < end && !isRuleStart(k)) k++;
			continue;
		}
		const lhs = t.value;
		const lhsSpan = span(t.start, t.end);
		k++;
		if (tokens[k]?.value === '[') {
			report({
				severity: 'info',
				message: `The named reference ${text.slice(tokens[k].start, tokens[k + 2].end)} is left out.`,
				span: span(tokens[k].start, tokens[k + 2].end)
			});
			k += 3;
		}
		k++; // the colon
		const alternatives: Alternative[] = [];
		let current: Alternative = { symbols: [], span: span(tokens[k - 1].end, tokens[k - 1].end) };
		/** Actions of the current alternative not yet followed by anything: one may be mid-rule. */
		let pendingAction: Token | null = null;
		const close = (at: number) => {
			current.span = span(current.span.start, at);
			alternatives.push(current);
		};
		while (k < end) {
			const a = tokens[k];
			if (a.kind === 'punct' && (a.value === '|' || a.value === ';')) {
				close(a.start);
				pendingAction = null;
				k++;
				if (a.value === ';') break;
				current = { symbols: [], span: span(a.end, a.end) };
				continue;
			}
			if (isRuleStart(k)) break;
			if (a.kind === 'code') {
				if (pendingAction) midRule(pendingAction);
				pendingAction = a;
				k++;
				continue;
			}
			if (a.kind === 'id' || a.kind === 'char' || a.kind === 'string') {
				if (pendingAction) {
					midRule(pendingAction);
					pendingAction = null;
				}
				const symbol: Alternative['symbols'][number] = {
					kind: a.kind,
					value: a.value,
					span: span(a.start, a.end)
				};
				k++;
				if (tokens[k]?.value === '[' && tokens[k + 2]?.value === ']' && a.kind === 'id') {
					report({
						severity: 'info',
						message: `The named reference ${text.slice(tokens[k].start, tokens[k + 2].end)} is left out.`,
						span: span(tokens[k].start, tokens[k + 2].end)
					});
					k += 3;
				}
				if (a.kind === 'id' && a.value === 'error')
					report({
						severity: 'warning',
						message:
							'error is bison’s token for error recovery; it is read as an ordinary terminal here.',
						span: symbol.span
					});
				current.symbols.push(symbol);
				continue;
			}
			if (a.kind === 'directive') {
				k++;
				if (a.value === 'empty') continue;
				if (a.value === 'prec') {
					const of = tokens[k];
					const named =
						of && (of.kind === 'id' || of.kind === 'char' || of.kind === 'string') ? of : null;
					if (named) k++;
					const written = named ? `%prec ${text.slice(named.start, named.end)}` : '%prec';
					report({
						severity: 'warning',
						message: `${written} is not read: the rule keeps the precedence of its last terminal, which can change how its conflicts are resolved.`,
						span: span(a.start, named ? named.end : a.end)
					});
					continue;
				}
				// %dprec N, %merge <tag>, %expect N inside a rule: GLR and bookkeeping.
				if (tokens[k]?.kind === 'number' || tokens[k]?.kind === 'tag') k++;
				report({
					severity: 'warning',
					message: `%${a.value} is not read; it is left out.`,
					span: span(a.start, a.end)
				});
				continue;
			}
			if (a.kind === 'tag' && tokens[k + 1]?.kind === 'code') {
				// <type>{ … }: a typed mid-rule action.
				k++;
				continue;
			}
			report({
				severity: 'error',
				message: `${text.slice(a.start, a.end)} cannot stand in a rule.`,
				span: span(a.start, a.end)
			});
			k++;
		}
		if (k >= end || isRuleStart(k)) {
			if (!alternatives.includes(current)) close(tokens[k - 1]?.end ?? text.length);
		}
		rules.push({ lhs, lhsSpan, alternatives });
	}

	function midRule(action: Token) {
		report({
			severity: 'warning',
			message:
				'A mid-rule action is left out: bison makes a new empty rule for it, which can add conflicts that the grammar here does not have.',
			span: span(action.start, action.end)
		});
	}

	if (rules.length === 0) {
		report({
			severity: 'error',
			message:
				separators.length === 0 && tokens.length === 0
					? 'Paste a bison grammar file: declarations, %%, the rules.'
					: "No rule was found: write rules such as exp : exp '+' exp | INT ; after %%.",
			span: span(0, Math.min(text.length, 1))
		});
		return { grammar: '', precedence: '', start: null, productions: 0, diagnostics };
	}

	// ───────── symbols ─────────
	const nonterminals = new Set(rules.map((r) => r.lhs));
	const nameOf = (s: Alternative['symbols'][number]): string => {
		if (s.kind === 'string') return aliasOf.get(s.value) ?? s.value;
		return s.value;
	};
	const warnedStrings = new Set<string>();
	const warnedNames = new Set<string>();
	for (const rule of rules)
		for (const alt of rule.alternatives)
			for (const s of alt.symbols) {
				if (s.kind === 'string' && !aliasOf.has(s.value) && !warnedStrings.has(s.value)) {
					warnedStrings.add(s.value);
					report({
						severity: 'info',
						message: `"${s.value}" is not declared with %token NAME "${s.value}": it is read as the terminal ${s.value}.`,
						span: s.span
					});
				}
				if (
					s.kind === 'id' &&
					s.value !== 'error' &&
					!nonterminals.has(s.value) &&
					!declared.has(s.value)
				) {
					if (!warnedNames.has(s.value)) {
						warnedNames.add(s.value);
						report({
							severity: 'warning',
							message: `${s.value} is not declared with %token and has no rules: it is read as a terminal.`,
							span: s.span
						});
					}
				}
				if (s.kind !== 'id' && nonterminals.has(nameOf(s)))
					report({
						severity: 'warning',
						message: `${text.slice(s.span.start, s.span.end)} is read as the symbol ${nameOf(s)}, which is a non-terminal here.`,
						span: s.span
					});
				const name = nameOf(s);
				if (name === END_MARKER || name === EPSILON)
					report({
						severity: 'warning',
						message: `The terminal ${name} is written like the ${name === END_MARKER ? 'end marker' : 'empty string'} of the lecture notation.`,
						span: s.span
					});
			}

	// ───────── the start symbol first ─────────
	let first = rules[0].lhs;
	if (start) {
		if (nonterminals.has(start.name)) first = start.name;
		else
			report({
				severity: 'warning',
				message: `%start ${start.name}: ${start.name} has no rules; the first rule's left-hand side is the start symbol.`,
				span: start.span
			});
	}
	const order = [first, ...[...nonterminals].filter((nt) => nt !== first)];
	const productions = order.flatMap((lhs) =>
		rules
			.filter((r) => r.lhs === lhs)
			.flatMap((r) => r.alternatives.map((alt) => ({ lhs, rhs: alt.symbols.map(nameOf) })))
	);
	const g = makeGrammar(productions);
	if (g.productions.length < productions.length)
		report({
			severity: 'info',
			message: 'A repeated rule is listed once.',
			span: rules[0].lhsSpan
		});

	// ───────── precedence ─────────
	const lines = precedence.map((d) => {
		const symbols = d.symbols.map((s) =>
			s.kind === 'string' ? (aliasOf.get(s.value) ?? s.value) : s.value
		);
		return d.assoc === 'precedence'
			? ['// %precedence', ...symbols.map(bisonSymbol)].join(' ')
			: printDeclaration(d.assoc, symbols);
	});

	return {
		grammar: printGrammar(g),
		precedence: lines.join('\n'),
		start: g.start,
		productions: g.productions.length,
		diagnostics: diagnostics.sort((a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0))
	};
}
