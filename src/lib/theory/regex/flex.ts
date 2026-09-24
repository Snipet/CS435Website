/**
 * Parser for flex patterns (docs/ARCHITECTURE.md §3.3), following the flex
 * manual: postfix and repetition bind tightest, then concatenation, then `|`;
 * `^`, `$`, and trailing context `/` apply to the whole pattern.
 *
 *   x  \.  \n \t \123 \x41   characters and escapes (any other \c is c)
 *   "string"                  a quoted string, one unit ("ab"* = ("ab")*)
 *   .                         any character except \n
 *   [xyz] [a-z] [^…] [[:alpha:]]  classes; negated classes include \n
 *   r* r+ r? r{n} r{n,} r{n,m}
 *   {NAME}                    a definition, expanded as if parenthesized
 *   r1r2  r1|r2  (r)  r1/r2  ^r  r$
 *
 * `^` counts as an anchor only at the very start and `$` only at the very end;
 * elsewhere they are ordinary characters (as in flex). `""` is ε. `\u{H…}` is
 * accepted as an escape for any code point.
 */
import { CharSet } from '../charset';
import { showChar } from '../chars';
import { hasErrors, type Diagnostic } from '../diagnostics';
import type { CharsNode, Regex, Span } from './ast';
import type { DefinitionEntry, DefinitionsResult } from './lecture';
import {
	MAX_REPEAT,
	Reporter,
	charAt,
	isDigit,
	isSpace,
	orderDefinitions,
	parseClass,
	readEscape,
	rotateCycle,
	sortDiagnostics
} from './internal';

export interface FlexPattern {
	regex: Regex;
	/** `^r`: matches only at the beginning of a line. */
	bol: boolean;
	/** `r$`: matches only at the end of a line (just before \n). */
	eol: boolean;
	/** `r/s`: the trailing context s, or null. */
	trailing: Regex | null;
}

export type FlexParseResult =
	| { ok: true; pattern: FlexPattern; diagnostics: Diagnostic[] }
	| { ok: false; diagnostics: Diagnostic[] };

export interface FlexParseOptions {
	/** Definitions that {NAME} may refer to. */
	defs?: ReadonlyMap<string, Regex>;
	/** Definitions that exist but could not be built; using one is an error that says so. */
	invalid?: ReadonlySet<string>;
}

export interface FlexDefinitionLine {
	name: string;
	/** The pattern after the name. */
	text: string;
	/** Line number to report back in the entry. */
	line: number;
	/** Offset of `text` in the enclosing document; spans are relative to `text` when omitted. */
	textStart?: number;
	/** Offset of `name` in the enclosing document. */
	nameStart?: number;
}

/** The set matched by `.`: every character except \n. */
export const FLEX_DOT = CharSet.single('\n').complement();

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*/;

type Mode = 'pattern' | 'definition';

class FlexParser {
	private pos = 0;
	private depth = 0;
	/** Where the pattern ends: trailing whitespace is not part of it. */
	private end: number;

	constructor(
		private readonly text: string,
		private readonly rep: Reporter,
		private readonly defs: ReadonlyMap<string, Regex> | undefined,
		private readonly invalid: ReadonlySet<string> | undefined,
		private readonly mode: Mode
	) {
		this.end = text.length;
	}

	private span(start: number, end: number): Span {
		return this.rep.span(start, end);
	}

	private placeholder(start: number, end: number): Regex {
		return { kind: 'epsilon', span: this.span(start, end) };
	}

	private restIsBlank(from: number): boolean {
		return this.text.slice(from).trim() === '';
	}

	/** `$` at `pos` is an anchor when nothing but whitespace follows it. */
	private isEolAt(pos: number): boolean {
		return this.text[pos] === '$' && this.depth === 0 && this.restIsBlank(pos + 1);
	}

	parse(): FlexPattern {
		const t = this.text;
		if (t[0] !== undefined && isSpace(t[0])) {
			let j = 0;
			while (j < t.length && isSpace(t[j])) j++;
			this.rep.error('a flex pattern cannot start with a space', 0, j);
			this.pos = j;
		}
		let bol = false;
		if (t[this.pos] === '^') {
			if (this.mode === 'definition')
				this.rep.error('^ belongs in a rule, not a definition', this.pos, this.pos + 1);
			else bol = true;
			this.pos++;
		}
		let regex = this.parseAlt();
		let trailing: Regex | null = null;
		let eol = false;
		let slash = -1;

		while (this.pos < this.end) {
			const c = t[this.pos];
			if (c === '/') {
				if (this.mode === 'definition')
					this.rep.error(
						'trailing context / belongs in a rule, not a definition',
						this.pos,
						this.pos + 1
					);
				else if (slash >= 0)
					this.rep.error('a pattern can have only one trailing context /', this.pos, this.pos + 1);
				else slash = this.pos;
				this.pos++;
				const s = this.parseAlt();
				if (!s) this.rep.error('missing trailing context after /', this.pos - 1, this.pos);
				else if (slash >= 0 && trailing === null) trailing = s;
			} else if (this.isEolAt(this.pos)) {
				if (this.mode === 'definition')
					this.rep.error('$ belongs in a rule, not a definition', this.pos, this.pos + 1);
				else if (slash >= 0)
					this.rep.error(
						'a pattern cannot have both / and $; write r/s\\n instead',
						this.pos,
						this.pos + 1
					);
				else eol = true;
				this.pos++;
				this.end = this.pos;
			} else if (c === ')') {
				this.rep.error('unmatched )', this.pos, this.pos + 1);
				this.pos++;
				const more = this.parseAlt();
				if (more && regex)
					regex = {
						kind: 'concat',
						parts: [regex, more],
						span: { ...regex.span!, end: more.span!.end }
					};
				else regex ??= more;
			} else break; // unreachable: parseAlt consumes everything else
		}

		if (!regex) {
			if (bol && this.pos >= this.end) this.rep.error('nothing after ^', 0, 1);
			else if (eol) this.rep.error('nothing before $', this.end - 1, this.end);
			else if (slash >= 0) this.rep.error('missing pattern before /', slash, slash + 1);
			regex = this.placeholder(this.pos, this.pos);
		}
		return { regex, bol, eol, trailing };
	}

	private parseAlt(): Regex | null {
		const ops: Regex[] = [];
		let lastBar = -1;
		for (;;) {
			const op = this.parseConcat();
			if (op) ops.push(op);
			else if (lastBar >= 0 || this.text[this.pos] === '|') {
				if (lastBar >= 0) this.rep.error('missing operand after |', lastBar, lastBar + 1);
				else this.rep.error('missing operand before |', this.pos, this.pos + 1);
				ops.push(this.placeholder(this.pos, this.pos));
			}
			if (this.pos < this.end && this.text[this.pos] === '|') {
				lastBar = this.pos++;
				continue;
			}
			break;
		}
		if (ops.length === 0) return null;
		if (ops.length === 1) return ops[0];
		return {
			kind: 'alt',
			options: ops,
			span: { ...ops[0].span!, end: ops[ops.length - 1].span!.end }
		};
	}

	private parseConcat(): Regex | null {
		const items: Regex[] = [];
		const t = this.text;
		while (this.pos < this.end) {
			const c = t[this.pos];
			if (c === '|' || c === ')') break;
			if (c === '/') {
				if (this.depth === 0) break;
				this.rep.error('trailing context / cannot be inside parentheses', this.pos, this.pos + 1);
				this.pos++;
				continue;
			}
			if (this.isEolAt(this.pos)) break;
			if (isSpace(c)) {
				let j = this.pos;
				while (j < t.length && isSpace(t[j])) j++;
				if (j >= t.length) {
					this.end = this.pos;
					break;
				}
				this.rep.error(
					'unquoted space ends a flex pattern; write " " or \\  for a space',
					this.pos,
					j
				);
				this.pos = j;
				continue;
			}
			const node = this.parsePostfix();
			if (node) items.push(node);
		}
		if (items.length === 0) return null;
		if (items.length === 1) return items[0];
		return {
			kind: 'concat',
			parts: items,
			span: { ...items[0].span!, end: items[items.length - 1].span!.end }
		};
	}

	private parsePostfix(): Regex | null {
		const start = this.pos;
		const atom = this.parseAtom();
		if (!atom) return null;
		let node = atom.node;
		let first = true;
		const t = this.text;
		while (this.pos < this.end) {
			const c = t[this.pos];
			const opStart = this.pos;
			let next: Regex;
			if (c === '*' || c === '+' || c === '?') {
				this.pos++;
				const kind = c === '*' ? 'star' : c === '+' ? 'plus' : 'optional';
				next = { kind, body: node, span: this.span(start, this.pos) };
			} else if (c === '{' && isDigit(t[this.pos + 1])) {
				const rep = this.repetition();
				if (!rep) continue;
				next = {
					kind: 'repeat',
					body: node,
					min: rep.min,
					max: rep.max,
					span: this.span(start, this.pos)
				};
			} else break;
			if (first && atom.string && node.kind === 'concat') {
				const lit = t.slice(start, opStart);
				const op = t.slice(opStart, this.pos);
				const verb = op === '?' ? 'applies to' : 'repeats';
				this.rep.info(`${lit}${op} ${verb} the whole string: (${lit})${op}`, start, this.pos);
			}
			node = next;
			first = false;
		}
		return node;
	}

	/** Reads {n}, {n,}, or {n,m} at pos; null (after reporting) when malformed. */
	private repetition(): { min: number; max: number | null } | null {
		const start = this.pos;
		const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(this.text.slice(start, this.end));
		if (!m) {
			const close = this.text.indexOf('}', start);
			const end = close < 0 || close >= this.end ? this.end : close + 1;
			this.rep.error('bad repetition; write {n}, {n,}, or {n,m}', start, end);
			this.pos = end;
			return null;
		}
		this.pos = start + m[0].length;
		const min = Number(m[1]);
		const max = m[2] ? (m[3] ? Number(m[3]) : null) : min;
		if (Math.max(min, max ?? 0) > MAX_REPEAT) {
			this.rep.error(`count is too large (at most ${MAX_REPEAT})`, start, this.pos);
			return null;
		}
		if (max !== null && max < min) {
			this.rep.error(`bad repetition ${m[0]}: ${max} is less than ${min}`, start, this.pos);
			return null;
		}
		return { min, max };
	}

	private parseAtom(): { node: Regex; string: boolean } | null {
		const t = this.text;
		const start = this.pos;
		const c = charAt(t, start)!;
		const plain = (node: Regex) => ({ node, string: false });
		const literal = (cp: number, end: number): CharsNode => ({
			kind: 'chars',
			set: CharSet.single(cp),
			text: t.slice(start, end),
			span: this.span(start, end)
		});

		switch (c) {
			case '(': {
				this.pos++;
				if (t[this.pos] === ')') {
					this.pos++;
					this.rep.error('empty group (); use "" for the empty string', start, this.pos);
					return plain(this.placeholder(start, this.pos));
				}
				this.depth++;
				const inner = this.parseAlt();
				this.depth--;
				if (t[this.pos] === ')' && this.pos < this.end) this.pos++;
				else this.rep.error('( is never closed', start, start + 1);
				const node = inner ?? this.placeholder(start, this.pos);
				node.span = this.span(start, this.pos);
				return plain(node);
			}
			case '[': {
				const cls = parseClass(t, start, this.end, 'flex', this.rep);
				this.pos = cls.end;
				return plain({
					kind: 'chars',
					set: cls.set,
					text: t.slice(start, cls.end),
					span: this.span(start, cls.end)
				});
			}
			case '"':
				return this.string();
			case '.':
				this.pos++;
				return plain({ kind: 'chars', set: FLEX_DOT, text: '.', span: this.span(start, this.pos) });
			case '\\': {
				const esc = readEscape(t, start, this.end, 'flex');
				this.pos = esc.end;
				if ('error' in esc) {
					this.rep.error(esc.error, start, esc.end);
					return null;
				}
				return plain(literal(esc.cp, esc.end));
			}
			case '{':
				return this.reference();
			case '*':
			case '+':
			case '?':
				this.pos++;
				this.rep.error(`${c} has nothing to repeat`, start, this.pos);
				return null;
			case '^':
			case '$': {
				this.pos++;
				const where = c === '^' ? 'at the start' : 'at the end';
				this.rep.info(
					`${c} matches the character ${c} here; it is an anchor only ${where} of a pattern`,
					start,
					this.pos
				);
				return plain(literal(c.codePointAt(0)!, this.pos));
			}
			default:
				this.pos += c.length;
				return plain(literal(c.codePointAt(0)!, this.pos));
		}
	}

	private string(): { node: Regex; string: boolean } {
		const t = this.text;
		const start = this.pos;
		const chars: CharsNode[] = [];
		let j = start + 1;
		let closed = false;
		while (j < this.end) {
			const c = charAt(t, j)!;
			if (c === '"') {
				closed = true;
				j++;
				break;
			}
			if (c === '\\') {
				const esc = readEscape(t, j, this.end, 'flex');
				if ('error' in esc) this.rep.error(esc.error, j, esc.end);
				else chars.push(this.stringChar(esc.cp, j, esc.end));
				j = esc.end;
				continue;
			}
			chars.push(this.stringChar(c.codePointAt(0)!, j, j + c.length));
			j += c.length;
		}
		this.pos = j;
		if (!closed) this.rep.error('unterminated string: missing closing "', start, j);
		const span = this.span(start, j);
		if (chars.length === 0) return { node: { kind: 'epsilon', span }, string: true };
		if (chars.length === 1)
			return { node: { ...chars[0], text: t.slice(start, j), span }, string: true };
		return { node: { kind: 'concat', parts: chars, quoted: true, span }, string: true };
	}

	private stringChar(cp: number, start: number, end: number): CharsNode {
		return {
			kind: 'chars',
			set: CharSet.single(cp),
			text: `"${showChar(cp, 'string')}"`,
			span: this.span(start, end)
		};
	}

	/** `{NAME}` at pos; a `{` that starts neither a name nor a count is an error. */
	private reference(): { node: Regex; string: boolean } | null {
		const t = this.text;
		const start = this.pos;
		const m = NAME_RE.exec(t.slice(start + 1, this.end));
		if (m && t[start + 1 + m[0].length] !== '}') {
			this.pos = start + 1 + m[0].length;
			this.rep.error(`missing } after {${m[0]}`, start, this.pos);
			return null;
		}
		if (m) {
			const name = m[0];
			this.pos = start + name.length + 2;
			const span = this.span(start, this.pos);
			const def = this.defs?.get(name);
			if (def) return { node: { kind: 'ref', name, body: def, span }, string: false };
			if (this.invalid?.has(name))
				this.rep.error(`definition {${name}} has errors`, start, this.pos);
			else this.rep.error(`undefined definition {${name}}`, start, this.pos);
			return { node: this.placeholder(start, this.pos), string: false };
		}
		if (isDigit(t[start + 1])) {
			const rep = this.repetition();
			if (rep) this.rep.error(`${t.slice(start, this.pos)} has nothing to repeat`, start, this.pos);
			return null;
		}
		this.pos++;
		this.rep.error(
			'{ starts a repetition {n,m} or a definition {NAME}; write \\{ for a literal {',
			start,
			start + 1
		);
		return null;
	}
}

function parseFlex(
	text: string,
	rep: Reporter,
	opts: FlexParseOptions,
	mode: Mode
): FlexParseResult {
	if (text.trim() === '') {
		rep.error(mode === 'pattern' ? 'Enter a flex pattern' : 'missing pattern', 0, text.length);
		return { ok: false, diagnostics: rep.diagnostics };
	}
	const pattern = new FlexParser(text, rep, opts.defs, opts.invalid, mode).parse();
	const diagnostics = sortDiagnostics(rep.diagnostics);
	return hasErrors(diagnostics) ? { ok: false, diagnostics } : { ok: true, pattern, diagnostics };
}

/** Parses one flex pattern (the part of a rule before its action). */
export function parseFlexPattern(text: string, opts: FlexParseOptions = {}): FlexParseResult {
	return parseFlex(text, new Reporter([], null), opts, 'pattern');
}

/** Names used as {NAME} in a flex pattern, skipping escapes, strings, and classes. */
function flexRefNames(text: string): string[] {
	const names: string[] = [];
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '\\') i += 2;
		else if (c === '"') {
			i++;
			while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
			i++;
		} else if (c === '[') {
			i++;
			if (text[i] === '^') i++;
			if (text[i] === ']') i++;
			while (i < text.length && text[i] !== ']') {
				if (text[i] === '\\') i += 2;
				else if (text.startsWith('[:', i) && text.indexOf(':]', i) > 0)
					i = text.indexOf(':]', i) + 2;
				else i++;
			}
			i++;
		} else if (c === '{') {
			const m = NAME_RE.exec(text.slice(i + 1));
			if (m && text[i + 1 + m[0].length] === '}') {
				names.push(m[0]);
				i += m[0].length + 2;
			} else i++;
		} else i++;
	}
	return names;
}

/**
 * Builds the definitions section of a flex spec (`NAME pattern` lines, already
 * split). Definitions may use each other in any order; cycles are errors.
 * Spans have source = the definition name and are relative to its `text`
 * (shifted by `textStart` when given).
 */
export function parseFlexDefinitions(lines: FlexDefinitionLine[]): DefinitionsResult {
	const entries: DefinitionEntry[] = [];
	// Diagnostics per definition line: spans may be relative to each line's text, so they are
	// ordered by line first.
	const perLine: Diagnostic[][] = lines.map(() => []);
	const byName = new Map<string, { line: FlexDefinitionLine; entry: DefinitionEntry; k: number }>();
	const error = (k: number, message: string, span: Span) =>
		perLine[k].push({ severity: 'error', message, span });

	lines.forEach((line, k) => {
		const nameStart = line.nameStart ?? 0;
		const textStart = line.textStart ?? 0;
		const entry: DefinitionEntry = {
			name: line.name,
			line: line.line,
			text: line.text,
			nameSpan: { start: nameStart, end: nameStart + line.name.length, source: line.name },
			exprSpan: { start: textStart, end: textStart + line.text.length, source: line.name },
			regex: null
		};
		entries.push(entry);
		const whole = NAME_RE.exec(line.name);
		if (!whole || whole[0] !== line.name) {
			error(
				k,
				`${line.name} is not a valid name: use letters, digits, _ and -, starting with a letter or _`,
				entry.nameSpan
			);
			return;
		}
		const prior = byName.get(line.name);
		if (prior) {
			error(k, `${line.name} is already defined on line ${prior.line.line}`, entry.nameSpan);
			return;
		}
		byName.set(line.name, { line, entry, k });
	});

	const deps = new Map([...byName].map(([name, d]) => [name, flexRefNames(d.line.text)]));
	const { order, cycles } = orderDefinitions([...byName.keys()], deps);
	for (const cycle of cycles)
		for (const name of new Set(cycle)) {
			const walk = rotateCycle(cycle, name)
				.map((n) => `{${n}}`)
				.join(' → ');
			const d = byName.get(name)!;
			error(d.k, `${name} is defined in terms of itself: ${walk}`, d.entry.nameSpan);
		}

	const built = new Map<string, Regex>();
	for (const name of order) {
		const { line, entry, k } = byName.get(name)!;
		const invalid = new Set([...byName.keys()].filter((n) => !built.has(n)));
		const rep = new Reporter([], name, line.textStart ?? 0);
		const res = parseFlex(line.text, rep, { defs: built, invalid }, 'definition');
		perLine[k].push(...res.diagnostics);
		if (res.ok) {
			entry.regex = res.pattern.regex;
			built.set(name, res.pattern.regex);
		}
	}

	const defs = new Map<string, Regex>();
	for (const e of entries) if (e.regex && !defs.has(e.name)) defs.set(e.name, e.regex);
	return { defs, entries, diagnostics: perLine.flatMap(sortDiagnostics) };
}
