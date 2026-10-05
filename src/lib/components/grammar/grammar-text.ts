/**
 * A small tokenizer for grammar text in the notation of docs/ARCHITECTURE.md
 * §3.10, used by GrammarEditor for coloring, for turning a typed `->` into
 * `→`, and for spacing the symbols its palette inserts. It only splits the
 * text; the grammar engine's parser is what decides whether it is a grammar.
 *
 * Offsets are JavaScript string indices (UTF-16 code units).
 */
import type { HighlightToken } from '$lib/components/ui/types';

export type GrammarTokenKind =
	/** `→` or `->` */
	| 'arrow'
	/** `|` between alternatives */
	| 'bar'
	/** `ε` (also `ϵ` or the word `epsilon`) */
	| 'epsilon'
	/** EBNF `{ } [ ]`; in a plain grammar these are symbols */
	| 'bracket'
	/** A name, or one punctuation character */
	| 'symbol'
	/** A quoted terminal: `"the cat"`, `'=='` */
	| 'quoted'
	/** A line starting with `//`, or `/* … *\/` */
	| 'comment'
	/** A declaration keyword at the start of a line: `%left` */
	| 'directive';

export interface GrammarToken {
	kind: GrammarTokenKind;
	from: number;
	to: number;
	/**
	 * The symbol's name for `symbol` and `quoted` tokens (without the quotes,
	 * with primes written `’`); otherwise the text as written.
	 */
	text: string;
}

export interface GrammarTextOptions {
	/** Read `{ } [ ]` as EBNF metasymbols. */
	ebnf?: boolean;
}

const NAME = /[\p{L}\p{N}_]/u;
const PRIME = /['’′]/;
const SPACE = /\s/;
const CLOSING: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’' };
const BRACKETS = '{}[]';

/** Primes are written `’`; `S'` names the same symbol. */
export function normalizeSymbol(name: string): string {
	return name.replace(/['′]/g, '’');
}

export function tokenizeGrammarText(text: string, opts: GrammarTextOptions = {}): GrammarToken[] {
	const tokens: GrammarToken[] = [];
	const push = (kind: GrammarTokenKind, from: number, to: number, name?: string) =>
		tokens.push({ kind, from, to, text: name ?? text.slice(from, to) });
	let lineStart = true;
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\n') {
			lineStart = true;
			i++;
			continue;
		}
		if (SPACE.test(ch)) {
			i++;
			continue;
		}
		const first: boolean = lineStart;
		lineStart = false;

		if (text.startsWith('/*', i)) {
			const close = text.indexOf('*/', i + 2);
			const end = close === -1 ? text.length : close + 2;
			push('comment', i, end);
			// Like white space: what follows a comment that opens a line still opens it.
			lineStart = first;
			i = end;
			continue;
		}
		if (first && text.startsWith('//', i)) {
			const nl = text.indexOf('\n', i);
			const end = nl === -1 ? text.length : nl;
			push('comment', i, end);
			i = end;
			continue;
		}
		if (first && ch === '%' && i + 1 < text.length && /[A-Za-z]/.test(text[i + 1])) {
			let end = i + 1;
			while (end < text.length && /[A-Za-z]/.test(text[end])) end++;
			push('directive', i, end);
			i = end;
			continue;
		}
		if (ch === '→') {
			push('arrow', i, i + 1);
			i++;
			continue;
		}
		if (ch === '-' && text[i + 1] === '>') {
			push('arrow', i, i + 2);
			i += 2;
			continue;
		}
		if (ch === '|') {
			push('bar', i, i + 1);
			i++;
			continue;
		}
		if (ch === 'ε' || ch === 'ϵ') {
			push('epsilon', i, i + 1);
			i++;
			continue;
		}
		if (ch in CLOSING) {
			// A quoted terminal ends at its closing quote, or with the line.
			const close = CLOSING[ch];
			let end = i + 1;
			while (end < text.length && text[end] !== '\n' && text[end] !== close) end++;
			const closed = text[end] === close;
			push('quoted', i, closed ? end + 1 : end, text.slice(i + 1, end));
			i = closed ? end + 1 : end;
			continue;
		}
		if (opts.ebnf && BRACKETS.includes(ch)) {
			push('bracket', i, i + 1);
			i++;
			continue;
		}
		const cp = String.fromCodePoint(text.codePointAt(i)!);
		if (NAME.test(cp)) {
			let end = i;
			while (end < text.length) {
				const next = String.fromCodePoint(text.codePointAt(end)!);
				if (!NAME.test(next)) break;
				end += next.length;
			}
			// Primes belong to the name: S’ (typed S').
			while (end < text.length && PRIME.test(text[end])) end++;
			const name = normalizeSymbol(text.slice(i, end));
			push(name === 'epsilon' ? 'epsilon' : 'symbol', i, end, name);
			i = end;
			continue;
		}
		// Each punctuation character is its own symbol: E+E reads as E + E.
		push('symbol', i, i + cp.length);
		i += cp.length;
	}
	return tokens;
}

/** Symbols written directly before an arrow: the left-hand sides in the text. */
export function leftHandSides(tokens: readonly GrammarToken[]): Set<string> {
	const names = new Set<string>();
	for (let k = 0; k + 1 < tokens.length; k++) {
		if (tokens[k].kind === 'symbol' && tokens[k + 1].kind === 'arrow') names.add(tokens[k].text);
	}
	return names;
}

export type GrammarTokenClass =
	'nonterminal' | 'terminal' | 'meta' | 'epsilon' | 'comment' | 'directive';

export interface GrammarHighlightOptions extends GrammarTextOptions {
	/** N and T of the parsed grammar. Symbols in neither list are classified from the text. */
	nonterminals?: readonly string[];
	terminals?: readonly string[];
}

export interface ClassifiedToken extends GrammarToken {
	class: GrammarTokenClass;
}

/**
 * Tokens with what each one is. A symbol is looked up in the two lists; one
 * that is in neither (the lists come from the last grammar that parsed) is a
 * non-terminal exactly when the text has it on a left-hand side.
 */
export function classifyGrammarText(
	text: string,
	opts: GrammarHighlightOptions = {}
): ClassifiedToken[] {
	const tokens = tokenizeGrammarText(text, opts);
	const nonterminals = new Set((opts.nonterminals ?? []).map(normalizeSymbol));
	const terminals = new Set((opts.terminals ?? []).map(normalizeSymbol));
	const local = leftHandSides(tokens);
	const classOf = (t: GrammarToken): GrammarTokenClass => {
		switch (t.kind) {
			case 'arrow':
			case 'bar':
			case 'bracket':
				return 'meta';
			case 'epsilon':
				// The word `epsilon` is ε unless the parsed grammar lists it as a symbol.
				if (t.text !== 'epsilon') return 'epsilon';
				if (nonterminals.has(t.text)) return 'nonterminal';
				return terminals.has(t.text) ? 'terminal' : 'epsilon';
			case 'comment':
				return 'comment';
			case 'directive':
				return 'directive';
			case 'quoted':
				return 'terminal';
			case 'symbol':
				if (nonterminals.has(t.text)) return 'nonterminal';
				if (terminals.has(t.text)) return 'terminal';
				return local.has(t.text) ? 'nonterminal' : 'terminal';
		}
	};
	return tokens.map((t) => ({ ...t, class: classOf(t) }));
}

/** Global highlight classes (src/app.css). Plain terminals keep the text color. */
const CLASS_NAME: Record<GrammarTokenClass, string> = {
	nonterminal: 'hl-name',
	terminal: '',
	meta: 'hl-operator',
	epsilon: 'hl-special',
	comment: 'hl-comment',
	directive: 'hl-keyword'
};

/** Coloring for `CodeEditor`: non-terminals, metasymbols, ε, quoted terminals, comments. */
export function highlightGrammar(
	text: string,
	opts: GrammarHighlightOptions = {}
): HighlightToken[] {
	const out: HighlightToken[] = [];
	for (const t of classifyGrammarText(text, opts)) {
		const className = t.kind === 'quoted' ? 'hl-string' : CLASS_NAME[t.class];
		if (className) out.push({ from: t.from, to: t.to, className });
	}
	return out;
}

export interface ArrowConversion {
	text: string;
	/** The caret, moved with the text. */
	caret: number;
	changed: boolean;
	/** Each `->` that was replaced, as a range of the original text, in order. */
	ranges: { start: number; end: number }[];
}

/**
 * Replaces each `->` that stands for the production arrow with `→`. Quoted
 * terminals (`'->'`) and comments are left alone.
 */
export function convertArrows(
	text: string,
	caret: number,
	opts: GrammarTextOptions = {}
): ArrowConversion {
	const ranges = tokenizeGrammarText(text, opts)
		.filter((t) => t.kind === 'arrow' && t.to - t.from === 2)
		.map((t) => ({ start: t.from, end: t.to }));
	let out = '';
	let last = 0;
	let moved = caret;
	for (const r of ranges) {
		out += text.slice(last, r.start) + '→';
		last = r.end;
		// A caret after the two characters moves back by one; a caret between
		// them ends up after the arrow.
		if (caret >= r.end) moved--;
	}
	out += text.slice(last);
	return {
		text: out,
		caret: Math.max(0, Math.min(moved, out.length)),
		changed: ranges.length > 0,
		ranges
	};
}

/** Symbols written with a space on both sides. */
const SPACED = new Set(['→', '|', 'ε', '{', '}', '[', ']']);
/** Symbols the next thing is typed after, so a space follows them even at the end of a line. */
const LEADING = new Set(['→', '|', '{', '[']);

/**
 * The text a palette button inserts for `symbol` when `text[start, end)` is
 * selected: the symbol with the spaces the notation puts around it
 * (`E → T { + T }`), without doubling spaces that are already there.
 */
export function paletteInsertion(symbol: string, text: string, start: number, end: number): string {
	if (!SPACED.has(symbol)) return symbol;
	const before = start > 0 ? text[start - 1] : '\n';
	const after = end < text.length ? text[end] : '\n';
	const pre = SPACE.test(before) ? '' : ' ';
	const post = SPACE.test(after) ? (after === '\n' && LEADING.has(symbol) ? ' ' : '') : ' ';
	return pre + symbol + post;
}
