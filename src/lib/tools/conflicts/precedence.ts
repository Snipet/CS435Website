/**
 * Precedence and associativity declarations in bison syntax (Bottom-up
 * Parsing III, slide 19), one per line, lowest precedence first:
 *
 *   %left '+'
 *   %left '*'
 *   // %right '^'
 *
 * A terminal is a quoted character (`'+'`, as bison writes it), a quoted
 * string (`"=="`) or a bare name (`then`, `INT`, and `+` as the decks write
 * it in running text). A line that starts with `//` is turned off: it is kept
 * in the text but declares nothing, and the lines after it move down a level.
 * `%right` and `%nonassoc` are bison's other two declarations; `%precedence`
 * and the other directives of a bison file are not read here.
 */
import type { Span } from '$lib/theory/regex/ast';
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Grammar } from '$lib/theory/grammar/types';
import type { Assoc, PrecedenceDeclaration } from '$lib/theory/grammar/lr-table';

export type { Assoc };

export const ASSOCS: readonly Assoc[] = ['left', 'right', 'nonassoc'];

/** One declaration line of the text. */
export interface PrecedenceLine {
	/** 0-based line of the text. */
	line: number;
	/** false: the line starts with `//`. */
	on: boolean;
	assoc: Assoc;
	/** The terminals, in the order written (repeats on the line dropped). */
	terminals: string[];
	/** Where each terminal is written (offsets into the whole text). */
	spans: Span[];
	/** 1 for the first line that is on, 2 for the next, …; null when off. */
	level: number | null;
	/** The declaration as bison writes it: `%left '+' '-'`. */
	text: string;
}

export interface PrecedenceText {
	/** The declaration lines, on and off, in text order. */
	lines: PrecedenceLine[];
	/** The lines that are on, lowest first: what the table is built with. */
	declarations: PrecedenceDeclaration[];
	diagnostics: Diagnostic[];
}

const DIRECTIVE = /^%([A-Za-z-]+)/;

/**
 * A terminal as bison writes it: one character other than a letter quoted
 * (`'+'`, `'1'`, `'\''`), as is a control character spelled as its escape
 * (the terminal \n is `'\n'`); a name bare (`then`, `INT`); anything else as
 * a string (`"=="`).
 */
export function bisonSymbol(t: string): string {
	if (/^\\[ntr0]$/.test(t)) return `'${t}'`;
	if ([...t].length === 1 && !/[\p{L}_]/u.test(t))
		return t === "'" ? "'\\''" : t === '\\' ? "'\\\\'" : `'${t}'`;
	if (/^[A-Za-z_.][A-Za-z0-9_.-]*$/.test(t) && !t.endsWith('-')) return t;
	return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `%left '+' '-'` */
export function printDeclaration(assoc: Assoc, terminals: readonly string[]): string {
	return [`%${assoc}`, ...terminals.map(bisonSymbol)].join(' ');
}

/** Escapes in quotes; control characters keep their C spelling as the terminal's name (\n). */
const ESCAPES: Record<string, string> = {
	n: '\\n',
	t: '\\t',
	r: '\\r',
	'0': '\\0',
	'\\': '\\',
	"'": "'",
	'"': '"'
};

interface Word {
	/** A terminal, or a type tag `<…>` (ignored). */
	kind: 'symbol' | 'tag';
	text: string;
	start: number;
	end: number;
	quote: "'" | '"' | null;
}

/**
 * The words of a declaration after its directive: from `from` to the end of
 * the line or a `//` comment, skipping `/* … *\/` comments.
 */
function words(text: string, from: number, to: number, report: (d: Diagnostic) => void): Word[] {
	const out: Word[] = [];
	let i = from;
	const span = (start: number, end: number): Span => ({ start, end, source: null });
	while (i < to) {
		const ch = text[i];
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (text.startsWith('//', i)) break;
		if (text.startsWith('/*', i)) {
			const close = text.indexOf('*/', i + 2);
			if (close < 0 || close + 2 > to) {
				report({ severity: 'error', message: 'The comment is not closed.', span: span(i, to) });
				break;
			}
			i = close + 2;
			continue;
		}
		if (ch === "'" || ch === '"') {
			let j = i + 1;
			let value = '';
			let closed = false;
			while (j < to) {
				const c = text[j];
				if (c === ch) {
					closed = true;
					break;
				}
				if (c === '\\' && j + 1 < to) {
					value += ESCAPES[text[j + 1]] ?? text[j + 1];
					j += 2;
					continue;
				}
				value += c;
				j++;
			}
			if (!closed) {
				report({ severity: 'error', message: 'The quote is not closed.', span: span(i, to) });
				break;
			}
			if (value === '')
				report({
					severity: 'error',
					message: 'Empty quotes name no terminal.',
					span: span(i, j + 1)
				});
			else out.push({ kind: 'symbol', text: value, start: i, end: j + 1, quote: ch });
			i = j + 1;
			continue;
		}
		if (ch === '<') {
			const close = text.indexOf('>', i);
			if (close > i && close < to) {
				out.push({
					kind: 'tag',
					text: text.slice(i, close + 1),
					start: i,
					end: close + 1,
					quote: null
				});
				i = close + 1;
				continue;
			}
		}
		let j = i;
		while (j < to && !/\s/.test(text[j]) && !text.startsWith('//', j) && !text.startsWith('/*', j))
			j++;
		out.push({ kind: 'symbol', text: text.slice(i, j), start: i, end: j, quote: null });
		i = j;
	}
	return out;
}

/**
 * Reads the declaration text. With a grammar, a name that is not one of its
 * terminals is reported; a terminal declared on two lines keeps the first
 * (bison reports a redeclaration as an error).
 */
export function readPrecedenceText(text: string, g?: Grammar | null): PrecedenceText {
	const lines: PrecedenceLine[] = [];
	const diagnostics: Diagnostic[] = [];
	const report = (d: Diagnostic) => diagnostics.push(d);
	const terminals = g ? new Set(g.terminals) : null;
	const nonterminals = g ? new Set(g.nonterminals) : null;
	const declaredOn = new Map<string, number>();
	let offset = 0;
	let level = 0;
	text.split('\n').forEach((raw, index) => {
		const start = offset;
		offset += raw.length + 1;
		const end = start + raw.length;
		const span = (a: number, b: number): Span => ({ start: a, end: b, source: null });
		let at = start + (raw.length - raw.trimStart().length);
		if (at >= end) return;
		let on = true;
		if (text.startsWith('//', at)) {
			on = false;
			at += 2;
			while (at < end && /\s/.test(text[at])) at++;
		}
		const match = DIRECTIVE.exec(text.slice(at, end));
		// A line turned off that is not a declaration is a comment.
		if (!on && (!match || !ASSOCS.includes(match[1] as Assoc))) return;
		if (!match) {
			if (text.startsWith('/*', at) && text.indexOf('*/', at) >= 0 && text.indexOf('*/', at) < end)
				return;
			report({
				severity: 'error',
				message: 'A declaration starts with %left, %right or %nonassoc.',
				span: span(at, end)
			});
			return;
		}
		const name = match[1];
		const directiveEnd = at + match[0].length;
		if (name === 'precedence') {
			report({
				severity: 'warning',
				message:
					'%precedence (a precedence without associativity) is not read here; the line is left out. Write %left, %right or %nonassoc.',
				span: span(at, directiveEnd)
			});
			return;
		}
		if (!ASSOCS.includes(name as Assoc)) {
			report({
				severity: 'error',
				message: `Only %left, %right and %nonassoc lines go here, not %${name}.`,
				span: span(at, directiveEnd)
			});
			return;
		}
		const assoc = name as Assoc;
		let broken = false;
		const found = words(text, directiveEnd, end, (d) => {
			broken = true;
			if (on) report(d);
		});
		const symbols: string[] = [];
		const spans: Span[] = [];
		for (const w of found) {
			if (w.kind === 'tag') {
				if (on)
					report({
						severity: 'info',
						message: `The type ${w.text} is ignored: only the precedence is read.`,
						span: span(w.start, w.end)
					});
				continue;
			}
			if (symbols.includes(w.text)) continue;
			symbols.push(w.text);
			spans.push(span(w.start, w.end));
			if (!on) continue;
			const shown = bisonSymbol(w.text);
			if (w.quote === "'" && [...w.text].length > 1)
				report({
					severity: 'info',
					message: `bison quotes one character with ' '; ${w.text} is read as one terminal, which bison writes ${shown}.`,
					span: span(w.start, w.end)
				});
			const earlier = declaredOn.get(w.text);
			if (earlier !== undefined) {
				report({
					severity: 'warning',
					message: `${shown} is already declared on line ${earlier + 1}; line ${index + 1} does not change it.`,
					span: span(w.start, w.end)
				});
				continue;
			}
			declaredOn.set(w.text, index);
			if (nonterminals?.has(w.text))
				report({
					severity: 'warning',
					message: `${w.text} is a non-terminal: precedence is declared for terminals.`,
					span: span(w.start, w.end)
				});
			else if (terminals && !terminals.has(w.text))
				report({
					severity: 'warning',
					message: `${shown} is not a terminal of the grammar.`,
					span: span(w.start, w.end)
				});
		}
		if (on && symbols.length === 0 && !broken)
			report({
				severity: 'warning',
				message: `Line ${index + 1} declares no terminal.`,
				span: span(at, end)
			});
		lines.push({
			line: index,
			on,
			assoc,
			terminals: symbols,
			spans,
			level: on ? ++level : null,
			text: printDeclaration(assoc, symbols)
		});
	});
	return {
		lines,
		declarations: lines
			.filter((l) => l.on)
			.map((l) => ({ assoc: l.assoc, terminals: [...l.terminals] })),
		diagnostics
	};
}

/**
 * The text with one line turned on or off: `//` is put before the
 * declaration, or taken away with the space after it.
 */
export function toggleLine(text: string, line: number, on: boolean): string {
	const lines = text.split('\n');
	const raw = lines[line];
	if (raw === undefined) return text;
	const indent = raw.length - raw.trimStart().length;
	const body = raw.slice(indent);
	const isOff = body.startsWith('//');
	if (on && isOff) lines[line] = raw.slice(0, indent) + body.slice(2).replace(/^ /, '');
	else if (!on && !isOff) lines[line] = `${raw.slice(0, indent)}// ${body}`;
	else return text;
	return lines.join('\n');
}
