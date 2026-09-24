/**
 * Prints a regex AST in lecture notation or flex syntax. Parsing the output
 * with the matching parser gives back the same tree (ignoring spans and
 * display text), except that flex has no spelling for ɸ or Σ: ɸ prints as an
 * empty class and Σ as `(.|\n)`.
 */
import { CharSet, MAX_CODE_POINT } from '../charset';
import { showChar } from '../chars';
import type { Regex } from './ast';
import { FLEX_DOT, type FlexPattern } from './flex';

export interface PrintOptions {
	dialect?: 'lecture' | 'flex';
	/** Print each definition's body in place of its name. */
	expandRefs?: boolean;
	/** 'minimal' adds parentheses only where the tree needs them; 'full' wraps every compound operand. */
	parens?: 'minimal' | 'full';
	/** Lecture notation: write letters, digits, and safe punctuation bare (0 instead of '0'). */
	symbols?: 'quoted' | 'bare';
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

const lastCodePoint = `\\u{${MAX_CODE_POINT.toString(16).toUpperCase()}}`;

/** One character inside [...]: `]`, `\`, `^`, `-`, `[` escaped; NUL as \x00 so a digit cannot extend it. */
function classChar(cp: number): string {
	if (cp === 0) return '\\x00';
	if (cp === 0x5b) return '\\[';
	return showChar(cp, 'class');
}

/** `[a-z]`, `[^\n]`, …; also the empty set and the full set, which formatClass cannot spell. */
function classText(set: CharSet): string {
	if (set.isEmpty) return `[^\\x00-${lastCodePoint}]`;
	if (set.equals(CharSet.ANY)) return `[\\x00-${lastCodePoint}]`;
	const comp = set.complement();
	const useComp = comp.size < set.size && comp.ranges.length < set.ranges.length;
	const body = (useComp ? comp : set).ranges
		.map(([lo, hi]) =>
			lo === hi
				? classChar(lo)
				: hi === lo + 1
					? classChar(lo) + classChar(hi)
					: `${classChar(lo)}-${classChar(hi)}`
		)
		.join('');
	return `[${useComp ? '^' : ''}${body}]`;
}

/** A character inside a lecture '…' literal; curly quotes close literals too, so they are escaped. */
function quotedChar(cp: number): string {
	return cp === 0x2018 || cp === 0x2019 ? `\\${String.fromCodePoint(cp)}` : showChar(cp, 'quoted');
}

function lectureChar(cp: number, bare: boolean): string {
	const ch = String.fromCodePoint(cp);
	if (bare && (/^[A-Za-z0-9]$/.test(ch) || BARE_PUNCT.has(ch))) return ch;
	return `'${quotedChar(cp)}'`;
}

/** A character inside a double-quoted string (lecture "…" is never printed; flex "…" is). */
function stringChar(cp: number): string {
	return cp === 0 ? '\\x00' : showChar(cp, 'string');
}

function flexChar(cp: number): string {
	const ch = String.fromCodePoint(cp);
	if (cp === 0x20) return '" "';
	const escaped = stringChar(cp);
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

/** Prints a regex in lecture notation (default) or flex syntax. */
export function printRegex(r: Regex, opts: PrintOptions = {}): string {
	const flex = opts.dialect === 'flex';
	const full = opts.parens === 'full';
	const bare = opts.symbols === 'bare';

	const wrap = (child: Regex, min: number): string => {
		const { s, p } = emit(child);
		return (full ? p < ATOM : p < min) ? `(${s})` : s;
	};

	const emit = (node: Regex): { s: string; p: number } => {
		switch (node.kind) {
			case 'empty':
				return { s: flex ? classText(CharSet.EMPTY) : 'ɸ', p: ATOM };
			case 'epsilon':
				return { s: flex ? '""' : 'ε', p: ATOM };
			case 'any':
				return { s: flex ? '(.|\\n)' : 'Σ', p: ATOM };
			case 'chars': {
				const set = node.set;
				if (set.isSingleton) {
					const cp = set.first()!;
					return { s: flex ? flexChar(cp) : lectureChar(cp, bare), p: ATOM };
				}
				if (flex && set.equals(FLEX_DOT)) return { s: '.', p: ATOM };
				return { s: classText(set), p: ATOM };
			}
			case 'concat': {
				const cps = node.quoted ? quotedText(node.parts) : null;
				if (cps && cps.length > 1) {
					const q = flex ? '"' : "'";
					const body = cps.map((c) => (flex ? stringChar(c) : quotedChar(c))).join('');
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

/** Prints a whole flex pattern: `^`, the regex, `/trailing`, `$`. */
export function printFlexPattern(p: FlexPattern, opts: Omit<PrintOptions, 'dialect'> = {}): string {
	const o: PrintOptions = { ...opts, dialect: 'flex' };
	const trailing = p.trailing ? `/${printRegex(p.trailing, o)}` : '';
	return `${p.bol ? '^' : ''}${printRegex(p.regex, o)}${trailing}${p.eol ? '$' : ''}`;
}
