/**
 * Prints a regex AST in lecture notation or flex syntax. Parsing the output
 * with the matching parser gives back the same tree (ignoring spans and
 * display text), except that flex has no spelling for ɸ or Σ: ɸ prints as an
 * empty class and Σ as `(.|\n)`.
 */
import { CharSet, MAX_CODE_POINT } from '../charset';
import { showChar, type CharContext } from '../chars';
import { children, type Regex } from './ast';
import { refsIn } from './analyze';
import { FLEX_DOT, type FlexPattern } from './flex';

export interface PrintOptions {
	dialect?: 'lecture' | 'flex';
	/** Print each definition's body in place of its name. */
	expandRefs?: boolean;
	/** 'minimal' adds parentheses only where the tree needs them; 'full' wraps every compound operand. */
	parens?: 'minimal' | 'full';
	/** Lecture notation: write letters, digits, and safe punctuation bare (0 instead of '0'). */
	symbols?: 'quoted' | 'bare';
	/**
	 * With symbols: 'bare', the names of the definitions the text will be read
	 * with (e.g. `defs.keys()`). A letter that spells one stays quoted, so it
	 * does not read back as a reference. Names used in the expression itself are
	 * always included.
	 */
	names?: Iterable<string>;
}

// Binding strength, loosest first.
const ALT = 1;
const CAT = 2;
const POST = 3;
const ATOM = 4;

/** Punctuation that reads as a plain symbol in lecture notation. */
const BARE_PUNCT = new Set('-@,;:/<>=!#&%$~{}`');
/** Characters with a meaning in flex patterns outside quotes and classes. */
const FLEX_SPECIAL = new Set('\\".[](){}*+?|/^$<>');

const NOTE_EMPTY = 'ɸ has no flex spelling; it is written as a class that matches nothing';
const NOTE_U =
	'\\u{…} is not a flex escape (flex reads \\u as u); it is used for characters flex cannot write directly';

/** Collects flex caveats while printing; null when nobody is asking. */
type Notes = Set<string> | null;

const lastCodePoint = `\\u{${MAX_CODE_POINT.toString(16).toUpperCase()}}`;

function hexEscape(cp: number, notes: Notes): string {
	if (cp <= 0xff) return `\\x${cp.toString(16).toUpperCase().padStart(2, '0')}`;
	notes?.add(NOTE_U);
	return `\\u{${cp.toString(16).toUpperCase()}}`;
}

/** Whitespace and lone surrogates, which showChar leaves as they are. */
const MUST_ESCAPE = /^[\s\uD800-\uDFFF]$/u;

/**
 * showChar, plus escapes for whitespace other than ' ' and the named escapes
 * (invisible, and flex ends a pattern at some of it) and for lone surrogates
 * (two adjacent halves would read back as one character).
 */
function show(cp: number, ctx: CharContext, notes: Notes): string {
	if (cp > 0x20 && MUST_ESCAPE.test(String.fromCodePoint(cp))) return hexEscape(cp, notes);
	const s = showChar(cp, ctx);
	if (s.startsWith('\\u{')) notes?.add(NOTE_U);
	return s;
}

/** One character inside [...]: `]`, `\`, `^`, `-`, `[` escaped; NUL as \x00 so a digit cannot extend it. */
function classChar(cp: number, notes: Notes): string {
	if (cp === 0) return '\\x00';
	if (cp === 0x5b) return '\\[';
	return show(cp, 'class', notes);
}

/** `[a-z]`, `[^\n]`, …; also the empty set and the full set, which formatClass cannot spell. */
function classText(set: CharSet, notes: Notes): string {
	if (set.isEmpty || set.equals(CharSet.ANY)) {
		notes?.add(NOTE_U);
		return `[${set.isEmpty ? '^' : ''}\\x00-${lastCodePoint}]`;
	}
	const comp = set.complement();
	const useComp = comp.size < set.size && comp.ranges.length < set.ranges.length;
	const body = (useComp ? comp : set).ranges
		.map(([lo, hi]) =>
			lo === hi
				? classChar(lo, notes)
				: hi === lo + 1
					? classChar(lo, notes) + classChar(hi, notes)
					: `${classChar(lo, notes)}-${classChar(hi, notes)}`
		)
		.join('');
	return `[${useComp ? '^' : ''}${body}]`;
}

/** A character inside a lecture '…' literal; curly quotes close literals too, so they are escaped. */
function quotedChar(cp: number): string {
	return cp === 0x2018 || cp === 0x2019
		? `\\${String.fromCodePoint(cp)}`
		: show(cp, 'quoted', null);
}

function lectureChar(cp: number, bare: boolean, reserved: ReadonlySet<string>): string {
	const ch = String.fromCodePoint(cp);
	if (bare && (/^[0-9]$/.test(ch) || BARE_PUNCT.has(ch))) return ch;
	if (bare && /^[A-Za-z]$/.test(ch) && !reserved.has(ch)) return ch;
	return `'${quotedChar(cp)}'`;
}

/** A character inside a double-quoted string (lecture "…" is never printed; flex "…" is). */
function stringChar(cp: number, notes: Notes): string {
	return cp === 0 ? '\\x00' : show(cp, 'string', notes);
}

function flexChar(cp: number, notes: Notes): string {
	const ch = String.fromCodePoint(cp);
	if (cp === 0x20) return '" "';
	const escaped = stringChar(cp, notes);
	if (escaped !== ch) return escaped;
	return FLEX_SPECIAL.has(ch) ? `\\${ch}` : ch;
}

function quotedText(parts: Regex[]): number[] | null {
	const cps: number[] = [];
	for (const p of parts) {
		if (p.kind !== 'chars' || !p.set.isSingleton) return null;
		cps.push(p.set.first()!);
	}
	return cps;
}

function print(r: Regex, opts: PrintOptions, notes: Notes): string {
	const flex = opts.dialect === 'flex';
	const full = opts.parens === 'full';
	const bare = !flex && opts.symbols === 'bare';
	const reserved = new Set<string>(bare ? [...(opts.names ?? []), ...refsIn(r)] : []);

	const wrap = (child: Regex, min: number): string => {
		const { s, p } = emit(child);
		return (full ? p < ATOM : p < min) ? `(${s})` : s;
	};

	const emit = (node: Regex): { s: string; p: number } => {
		switch (node.kind) {
			case 'empty':
				if (!flex) return { s: 'ɸ', p: ATOM };
				notes?.add(NOTE_EMPTY);
				return { s: classText(CharSet.EMPTY, notes), p: ATOM };
			case 'epsilon':
				return { s: flex ? '""' : 'ε', p: ATOM };
			case 'any':
				return { s: flex ? '(.|\\n)' : 'Σ', p: ATOM };
			case 'chars': {
				const set = node.set;
				if (set.isSingleton) {
					const cp = set.first()!;
					return { s: flex ? flexChar(cp, notes) : lectureChar(cp, bare, reserved), p: ATOM };
				}
				if (flex && set.equals(FLEX_DOT)) return { s: '.', p: ATOM };
				return { s: classText(set, notes), p: ATOM };
			}
			case 'concat': {
				const cps = node.quoted ? quotedText(node.parts) : null;
				if (cps && cps.length > 1) {
					const q = flex ? '"' : "'";
					const body = cps.map((c) => (flex ? stringChar(c, notes) : quotedChar(c))).join('');
					return { s: `${q}${body}${q}`, p: ATOM };
				}
				const parts = node.parts.map((c) => wrap(c, CAT + 1));
				return { s: parts.join(flex ? '' : ' '), p: CAT };
			}
			case 'alt':
				return { s: node.options.map((c) => wrap(c, ALT + 1)).join(flex ? '|' : ' | '), p: ALT };
			case 'star':
				return { s: `${wrap(node.body, ATOM)}*`, p: POST };
			case 'plus':
				return { s: `${wrap(node.body, ATOM)}+`, p: POST };
			case 'optional':
				return { s: `${wrap(node.body, ATOM)}?`, p: POST };
			case 'repeat': {
				const { min, max } = node;
				const count = flex
					? `{${min}${max === min ? '' : `,${max ?? ''}`}}`
					: max === min
						? `^${min}`
						: `^{${min},${max ?? ''}}`;
				return { s: `${wrap(node.body, ATOM)}${count}`, p: POST };
			}
			case 'ref':
				if (opts.expandRefs) return emit(node.body);
				return { s: flex ? `{${node.name}}` : node.name, p: ATOM };
		}
	};

	return emit(r).s;
}

/** Prints a regex in lecture notation (default) or flex syntax. */
export function printRegex(r: Regex, opts: PrintOptions = {}): string {
	return print(r, opts, null);
}

/** Prints a whole flex pattern: `^`, the regex, `/trailing`, `$`. */
export function printFlexPattern(p: FlexPattern, opts: Omit<PrintOptions, 'dialect'> = {}): string {
	const o: PrintOptions = { ...opts, dialect: 'flex' };
	const trailing = p.trailing ? `/${printRegex(p.trailing, o)}` : '';
	return `${p.bol ? '^' : ''}${printRegex(p.regex, o)}${trailing}${p.eol ? '$' : ''}`;
}

/**
 * What the flex printout of `r` (and of every definition it uses) writes that
 * flex itself would read differently: ɸ, and the site's \u{…} escape. Empty
 * when the printout is plain flex.
 */
export function flexCaveats(r: Regex): string[] {
	const notes = new Set<string>();
	const bodies = new Set<Regex>([r]);
	const find = (node: Regex): void => {
		if (node.kind === 'ref') {
			if (bodies.has(node.body)) return;
			bodies.add(node.body);
		}
		for (const c of children(node)) find(c);
	};
	find(r);
	for (const b of bodies) print(b, { dialect: 'flex' }, notes);
	return [...notes];
}
