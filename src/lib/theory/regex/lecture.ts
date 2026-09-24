/**
 * Parser for the lecture RE notation (docs/ARCHITECTURE.md §3.2):
 *
 *   'c' 'if' ‘c’ "if"      quoted literals ('if' is one unit: 'if'* = ('i' 'f')*)
 *   0 1 - @ .              bare one-character symbols
 *   digit letter           references to regular definitions (else read as symbols)
 *   ε ɸ Σ  (\e \p \S)      epsilon, empty language, any symbol
 *   [a-z] [^'\n]           classes
 *   A* A+ A⁺ A? A^3 A³     postfix operators (tightest)
 *   A B                    concatenation (juxtaposition)
 *   A | B                  alternation (loosest)
 *   'A' | … | 'Z'          a range between single characters
 *
 * Extensions so every AST can be printed and read back: A^{n,m} and A^{n,}
 * (bounded repetition), \u{H…} escapes, and A^* / A^+ as spellings of A* / A+.
 */
import { CharSet } from '../charset';
import { showChar } from '../chars';
import { hasErrors, type Diagnostic } from '../diagnostics';
import type { CharsNode, Regex, RepeatNode, Span } from './ast';
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

export type ParseResult =
	{ ok: true; regex: Regex; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] };

export interface ParseOptions {
	/** Regular definitions that names may refer to. */
	defs?: ReadonlyMap<string, Regex>;
	/** Span source for nodes and diagnostics: null for a main expression, or a definition name. */
	source?: string | null;
	/**
	 * Names of definitions that exist but could not be built (errors, cycles).
	 * A use of one is reported as an error instead of being read as symbols.
	 */
	invalid?: ReadonlySet<string>;
}

export interface DefinitionEntry {
	name: string;
	/** 1-based line number. */
	line: number;
	/** The RE text after '='. */
	text: string;
	nameSpan: Span;
	exprSpan: Span;
	/** Null when the definition has errors, is part of a cycle, or uses a definition that failed. */
	regex: Regex | null;
}

export interface DefinitionsResult {
	/** Successfully built definitions, in source order. */
	defs: Map<string, Regex>;
	/** One entry per definition line, in source order. */
	entries: DefinitionEntry[];
	diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type PostfixOp = 'star' | 'plus' | 'optional' | 'repeat';

interface TokBase {
	start: number;
	end: number;
}

type Token = TokBase &
	(
		| { kind: 'char'; cp: number; text: string; double: boolean }
		| { kind: 'string'; chars: { cp: number; start: number; end: number }[]; double: boolean }
		| { kind: 'name'; name: string }
		| { kind: 'class'; set: CharSet }
		| { kind: 'postfix'; op: PostfixOp; min: number; max: number | null; text: string }
		| { kind: 'eps' | 'empty' | 'any' | 'lparen' | 'rparen' | 'bar' | 'ellipsis' | 'eof' }
	);

const SINGLE_QUOTES = "'‘’";
const DOUBLE_QUOTES = '"“”';
const EPSILONS = 'εϵ';
const EMPTIES = 'ɸφϕ∅';
const SUPERSCRIPTS = new Map([...'⁰¹²³⁴⁵⁶⁷⁸⁹'].map((c, n) => [c, n]));
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

/** Splits text[from, to) into tokens; problems go to `rep`. */
function tokenize(text: string, from: number, to: number, rep: Reporter): Token[] {
	const toks: Token[] = [];
	let i = from;
	const push = (t: Token) => toks.push(t);

	while (i < to) {
		const ch = charAt(text, i)!;
		const start = i;
		if (isSpace(ch)) {
			i += ch.length;
			continue;
		}
		if (SINGLE_QUOTES.includes(ch) || DOUBLE_QUOTES.includes(ch)) {
			i = quoted(start, DOUBLE_QUOTES.includes(ch));
			continue;
		}
		if (ch === '(' || ch === ')' || ch === '|') {
			push({ kind: ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : 'bar', start, end: i + 1 });
			i++;
			continue;
		}
		if (ch === '*' || ch === '+' || ch === '⁺' || ch === '?') {
			const op: PostfixOp = ch === '*' ? 'star' : ch === '?' ? 'optional' : 'plus';
			push({ kind: 'postfix', op, min: 0, max: null, text: ch, start, end: i + 1 });
			i++;
			continue;
		}
		if (SUPERSCRIPTS.has(ch)) {
			let n = 0;
			while (i < to && SUPERSCRIPTS.has(text[i])) n = n * 10 + SUPERSCRIPTS.get(text[i++])!;
			pushCount(n, start, i);
			continue;
		}
		if (ch === '^') {
			i = caret(start);
			continue;
		}
		if (ch === '[') {
			const cls = parseClass(text, start, to, 'lecture', rep);
			push({ kind: 'class', set: cls.set, start, end: cls.end });
			i = cls.end;
			continue;
		}
		if (ch === ']') {
			rep.error('] without a matching [', start, start + 1);
			stand(start, ++i);
			continue;
		}
		if (ch === '…' || (i + 3 <= to && text.startsWith('...', i))) {
			i += ch === '…' ? 1 : 3;
			push({ kind: 'ellipsis', start, end: i });
			continue;
		}
		if (EPSILONS.includes(ch) || EMPTIES.includes(ch) || ch === 'Σ') {
			push({
				kind: ch === 'Σ' ? 'any' : EPSILONS.includes(ch) ? 'eps' : 'empty',
				start,
				end: i + 1
			});
			i++;
			continue;
		}
		if (ch === '\\') {
			const next = text[i + 1];
			if (i + 1 < to && (next === 'e' || next === 'p' || next === 'S')) {
				push({ kind: next === 'e' ? 'eps' : next === 'p' ? 'empty' : 'any', start, end: i + 2 });
				i += 2;
				continue;
			}
			const esc = readEscape(text, i, to, 'lecture');
			if ('error' in esc) {
				rep.error(escapeHint(esc.error), start, esc.end);
				stand(start, esc.end);
			} else
				push({
					kind: 'char',
					cp: esc.cp,
					text: text.slice(start, esc.end),
					double: false,
					start,
					end: esc.end
				});
			i = esc.end;
			continue;
		}
		if (NAME_START.test(ch)) {
			while (i < to && NAME_CHAR.test(text[i])) i++;
			push({ kind: 'name', name: text.slice(start, i), start, end: i });
			continue;
		}
		push({
			kind: 'char',
			cp: ch.codePointAt(0)!,
			text: ch,
			double: false,
			start,
			end: i + ch.length
		});
		i += ch.length;
	}
	push({ kind: 'eof', start: to, end: to });
	return toks;

	// After a reported problem: an ε stand-in, so the parser does not also report a missing operand.
	function stand(start: number, end: number): void {
		push({ kind: 'eps', start, end });
	}

	function pushCount(n: number, start: number, end: number): void {
		if (n > MAX_REPEAT) rep.error(`count ${n} is too large (at most ${MAX_REPEAT})`, start, end);
		else
			push({
				kind: 'postfix',
				op: 'repeat',
				min: n,
				max: n,
				text: text.slice(start, end),
				start,
				end
			});
	}

	// ^n, ^{n}, ^{n,m}, ^{n,}, ^*, ^+
	function caret(start: number): number {
		let j = start + 1;
		const next = j < to ? text[j] : undefined;
		if (next === '*' || next === '+') {
			const op = next === '*' ? 'star' : 'plus';
			push({ kind: 'postfix', op, min: 0, max: null, text: `^${next}`, start, end: j + 1 });
			return j + 1;
		}
		if (isDigit(next)) {
			while (j < to && isDigit(text[j])) j++;
			pushCount(Number(text.slice(start + 1, j)), start, j);
			return j;
		}
		const m = next === '{' ? /^\{(\d+)(?:(,)(\d*))?\}/.exec(text.slice(j, to)) : null;
		if (!m) {
			rep.error('^ needs a count, e.g. digit^3', start, start + 1);
			return start + 1;
		}
		const end = j + m[0].length;
		const min = Number(m[1]);
		const max = m[2] ? (m[3] ? Number(m[3]) : null) : min;
		if (Math.max(min, max ?? 0) > MAX_REPEAT)
			rep.error(`count is too large (at most ${MAX_REPEAT})`, start, end);
		else if (max !== null && max < min)
			rep.error(`bad count ${m[0]}: ${max} is less than ${min}`, start, end);
		else
			push({ kind: 'postfix', op: 'repeat', min, max, text: text.slice(start, end), start, end });
		return end;
	}

	// 'c', 'if', "if", with escapes; any quote of the same family closes.
	function quoted(start: number, double: boolean): number {
		const closers = double ? DOUBLE_QUOTES : SINGLE_QUOTES;
		const chars: { cp: number; start: number; end: number }[] = [];
		let j = start + 1;
		let closed = false;
		while (j < to) {
			const c = charAt(text, j)!;
			if (closers.includes(c)) {
				closed = true;
				j++;
				break;
			}
			if (c === '\\') {
				const esc = readEscape(text, j, to, 'lecture');
				if ('error' in esc) rep.error(escapeHint(esc.error), j, esc.end);
				else chars.push({ cp: esc.cp, start: j, end: esc.end });
				j = esc.end;
				continue;
			}
			chars.push({ cp: c.codePointAt(0)!, start: j, end: j + c.length });
			j += c.length;
		}
		if (!closed) rep.error(`unterminated literal: missing closing ${double ? '"' : "'"}`, start, j);
		if (chars.length === 0) {
			// Only when nothing was written between the quotes (a bad escape is already reported).
			if (closed && j === start + 2)
				rep.error('empty literal; use ε for the empty string', start, j);
			stand(start, j);
			return j;
		}
		if (chars.length === 1)
			push({ kind: 'char', cp: chars[0].cp, text: text.slice(start, j), double, start, end: j });
		else push({ kind: 'string', chars, double, start, end: j });
		return j;
	}
}

function escapeHint(message: string): string {
	if (message === 'unknown escape \\d') return 'unknown escape \\d; write [0-9] or a definition';
	if (message === 'unknown escape \\w')
		return 'unknown escape \\w; write [A-Za-z0-9_] or a definition';
	if (message === 'unknown escape \\s')
		return "unknown escape \\s; write (' ' | '\\t' | '\\n') or a definition";
	return message;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface Primary {
	nodes: Regex[];
	/** Came from parentheses, so a postfix operator applies to the group as written. */
	grouped: boolean;
}

interface Ellipsis {
	ellipsis: Token;
}

/** Endpoints of a range built from 'a' | … | 'z', so later ellipses can extend it. */
interface RangeInfo {
	lo: number;
	hi: number;
	texts: string[];
}

class Parser {
	private k = 0;
	/** One-character literals and symbols: the only operands an ellipsis accepts. */
	private readonly literals = new WeakSet<Regex>();
	private readonly ranges = new WeakMap<Regex, RangeInfo>();

	constructor(
		private readonly toks: Token[],
		private readonly text: string,
		private readonly rep: Reporter,
		private readonly defs: ReadonlyMap<string, Regex> | undefined,
		private readonly invalid: ReadonlySet<string> | undefined
	) {}

	private peek(ahead = 0): Token {
		return this.toks[Math.min(this.k + ahead, this.toks.length - 1)];
	}

	private next(): Token {
		return this.toks[this.k++];
	}

	private span(start: number, end: number): Span {
		return this.rep.span(start, end);
	}

	private placeholder(start: number, end: number): Regex {
		return { kind: 'epsilon', span: this.span(start, end) };
	}

	parseTop(): Regex {
		let node = this.parseAlt();
		while (this.peek().kind !== 'eof') {
			const t = this.next();
			this.rep.error('unmatched )', t.start, t.end);
			if (this.peek().kind !== 'eof') {
				const rest = this.parseAlt();
				node = {
					kind: 'concat',
					parts: [node, rest],
					span: { ...node.span!, end: rest.span!.end }
				};
			}
		}
		return node;
	}

	private parseAlt(): Regex {
		const ops: (Regex | Ellipsis)[] = [];
		let lastBar: Token | null = null;
		for (;;) {
			const t = this.peek();
			if (t.kind === 'ellipsis' && isOperandEnd(this.peek(1))) {
				this.next();
				ops.push({ ellipsis: t });
			} else if (isOperandEnd(t)) {
				if (lastBar) this.rep.error('missing operand after |', lastBar.start, lastBar.end);
				else if (t.kind === 'bar') this.rep.error('missing operand before |', t.start, t.end);
				ops.push(this.placeholder(t.start, t.start));
			} else ops.push(this.parseConcat());
			if (this.peek().kind !== 'bar') break;
			lastBar = this.next();
		}
		const options = this.resolveEllipses(ops);
		if (options.length === 1) return options[0];
		const span = { ...options[0].span!, end: options[options.length - 1].span!.end };
		return { kind: 'alt', options, span };
	}

	/** Replaces each `x | … | y` run with one CharsNode for the inclusive range. */
	private resolveEllipses(ops: (Regex | Ellipsis)[]): Regex[] {
		const out: Regex[] = [];
		for (let j = 0; j < ops.length; j++) {
			const op = ops[j];
			if (!('ellipsis' in op)) {
				out.push(op);
				continue;
			}
			const tok = op.ellipsis;
			const left = out[out.length - 1];
			const right = ops[j + 1];
			const leftRange = left ? this.rangeOf(left) : null;
			const rightChar = right && !('ellipsis' in right) ? this.singleChar(right) : null;
			if (!leftRange || rightChar === null) {
				this.rep.error(
					`${this.src(tok)} needs a single character on each side, e.g. 'a' | … | 'z'`,
					tok.start,
					tok.end
				);
				continue;
			}
			if (rightChar < leftRange.hi) {
				const l = showChar(leftRange.hi, 'quoted');
				const r = showChar(rightChar, 'quoted');
				this.rep.error(
					`'${l}' | … | '${r}' is backwards: '${l}' comes after '${r}'`,
					tok.start,
					tok.end
				);
				continue;
			}
			out.pop();
			const info: RangeInfo = {
				lo: leftRange.lo,
				hi: rightChar,
				texts: [...leftRange.texts, this.src(tok), this.nodeText(right as Regex)]
			};
			let startNode = left;
			// '0' | '1' | … | '9': fold in the contiguous run of single characters before the range.
			for (let prev = out[out.length - 1]; prev; prev = out[out.length - 1]) {
				const c = this.singleChar(prev);
				if (c === null || c !== info.lo - 1) break;
				out.pop();
				info.lo = c;
				info.texts.unshift(this.nodeText(prev));
				startNode = prev;
			}
			let endNode = right as Regex;
			j++;
			// …and the run after it: 'a' | … | 'y' | 'z'.
			while (j + 1 < ops.length) {
				const nxt = ops[j + 1];
				const c = 'ellipsis' in nxt ? null : this.singleChar(nxt);
				if (c === null || c !== info.hi + 1) break;
				info.hi = c;
				info.texts.push(this.nodeText(nxt as Regex));
				endNode = nxt as Regex;
				j++;
			}
			const node: CharsNode = {
				kind: 'chars',
				set: CharSet.range(info.lo, info.hi),
				text: info.texts.join(' | '),
				span: { ...startNode.span!, end: endNode.span!.end }
			};
			this.ranges.set(node, info);
			out.push(node);
		}
		if (out.length > 0) return out;
		// Only ellipses, all rejected above.
		const tok = (ops[0] as Ellipsis).ellipsis;
		return [this.placeholder(tok.start, tok.end)];
	}

	private singleChar(node: Regex): number | null {
		return node.kind === 'chars' && this.literals.has(node) ? node.set.first()! : null;
	}

	private rangeOf(node: Regex): RangeInfo | null {
		const r = this.ranges.get(node);
		if (r) return r;
		const c = this.singleChar(node);
		return c === null ? null : { lo: c, hi: c, texts: [this.nodeText(node)] };
	}

	private nodeText(node: Regex): string {
		return node.kind === 'chars' && node.text !== undefined ? node.text : this.srcSpan(node.span!);
	}

	private src(t: TokBase): string {
		return this.text.slice(t.start, t.end);
	}

	private srcSpan(s: Span): string {
		return this.text.slice(s.start, s.end);
	}

	private parseConcat(): Regex {
		const items: Regex[] = [];
		const startTok = this.peek();
		while (!isOperandEnd(this.peek())) items.push(...this.parsePostfix());
		if (items.length === 0) return this.placeholder(startTok.start, this.peek().start);
		if (items.length === 1) return items[0];
		return {
			kind: 'concat',
			parts: items,
			span: { ...items[0].span!, end: items[items.length - 1].span!.end }
		};
	}

	private parsePostfix(): Regex[] {
		const prim = this.parsePrimary();
		if (!prim) return [];
		const nodes = prim.nodes;
		let first = true;
		while (this.peek().kind === 'postfix') {
			const op = this.next() as Token & { kind: 'postfix' };
			const body = nodes.pop()!;
			const span: Span = { ...body.span!, end: op.end };
			if (first && !prim.grouped && body.kind === 'concat' && body.quoted) {
				const lit = this.srcSpan(body.span!);
				const parts = body.parts
					.map((p) => (p.kind === 'chars' ? `'${showChar(p.set.first()!, 'quoted')}'` : '?'))
					.join(' ');
				const verb = op.op === 'optional' ? 'applies to' : 'repeats';
				this.rep.info(
					`${lit}${op.text} ${verb} the whole literal: (${parts})${op.text}`,
					body.span!.start,
					op.end
				);
			}
			nodes.push(applyPostfix(op.op, op.min, op.max, body, span));
			first = false;
		}
		return nodes;
	}

	private parsePrimary(): Primary | null {
		const t = this.next();
		const single = (node: Regex): Primary => ({ nodes: [node], grouped: false });
		switch (t.kind) {
			case 'char': {
				const node: CharsNode = {
					kind: 'chars',
					set: CharSet.single(t.cp),
					text: t.text,
					span: this.span(t.start, t.end)
				};
				this.literals.add(node);
				if (t.double) this.doubleQuoteInfo(t, [t.cp]);
				else if (t.text === '.')
					this.rep.info('. is the character "." here; use Σ for any symbol', t.start, t.end);
				return single(node);
			}
			case 'string': {
				if (t.double)
					this.doubleQuoteInfo(
						t,
						t.chars.map((c) => c.cp)
					);
				const parts: CharsNode[] = t.chars.map((c) => ({
					kind: 'chars',
					set: CharSet.single(c.cp),
					text: `'${showChar(c.cp, 'quoted')}'`,
					span: this.span(c.start, c.end)
				}));
				return single({ kind: 'concat', parts, quoted: true, span: this.span(t.start, t.end) });
			}
			case 'name':
				return this.name(t.name, t.start, t.end);
			case 'eps':
				return single({ kind: 'epsilon', span: this.span(t.start, t.end) });
			case 'empty':
				return single({ kind: 'empty', span: this.span(t.start, t.end) });
			case 'any':
				return single({ kind: 'any', span: this.span(t.start, t.end) });
			case 'class':
				return single({
					kind: 'chars',
					set: t.set,
					text: this.src(t),
					span: this.span(t.start, t.end)
				});
			case 'lparen': {
				if (this.peek().kind === 'rparen') {
					const close = this.next();
					this.rep.error('empty group (); use ε for the empty string', t.start, close.end);
					return single(this.placeholder(t.start, close.end));
				}
				const inner = this.parseAlt();
				if (this.peek().kind === 'rparen') {
					const close = this.next();
					inner.span = this.span(t.start, close.end);
				} else this.rep.error('( is never closed', t.start, t.end);
				return { nodes: [inner], grouped: true };
			}
			case 'postfix':
				this.rep.error(`${t.text} has nothing to repeat`, t.start, t.end);
				return null;
			case 'ellipsis':
				this.rep.error(
					`${this.src(t)} must be a whole alternative between two characters, e.g. 'a' | … | 'z'`,
					t.start,
					t.end
				);
				return null;
			default:
				// bar, rparen, eof never reach here (callers stop at them).
				throw new Error(`unexpected token ${t.kind}`);
		}
	}

	private name(name: string, start: number, end: number): Primary {
		const def = this.defs?.get(name);
		if (def)
			return {
				nodes: [{ kind: 'ref', name, body: def, span: this.span(start, end) }],
				grouped: false
			};
		if (this.invalid?.has(name)) {
			this.rep.error(`definition ${name} has errors`, start, end);
			return { nodes: [this.placeholder(start, end)], grouped: false };
		}
		const chars = [...name];
		if (chars.length > 1)
			this.rep.info(
				`${name} read as the symbols ${chars.join(' ')}; no definition named ${name}`,
				start,
				end
			);
		const nodes = chars.map((ch, j): CharsNode => {
			const node: CharsNode = {
				kind: 'chars',
				set: CharSet.single(ch),
				text: ch,
				span: this.span(start + j, start + j + 1)
			};
			this.literals.add(node);
			return node;
		});
		return { nodes, grouped: false };
	}

	private doubleQuoteInfo(t: TokBase, cps: number[]): void {
		const body = cps.map((c) => showChar(c, 'quoted')).join('');
		this.rep.info(
			`${this.src(t)} read as '${body}' — RE literals use single quotes`,
			t.start,
			t.end
		);
	}
}

function isOperandEnd(t: Token): boolean {
	return t.kind === 'bar' || t.kind === 'rparen' || t.kind === 'eof';
}

function applyPostfix(
	op: PostfixOp,
	min: number,
	max: number | null,
	body: Regex,
	span: Span
): Regex {
	switch (op) {
		case 'star':
			return { kind: 'star', body, span };
		case 'plus':
			return { kind: 'plus', body, span };
		case 'optional':
			return { kind: 'optional', body, span };
		case 'repeat': {
			const node: RepeatNode = { kind: 'repeat', body, min, max, span };
			return node;
		}
	}
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Parses text[from, to) with spans relative to the start of `text` (for definitions). */
function parseRange(
	text: string,
	from: number,
	to: number,
	source: string | null,
	defs: ReadonlyMap<string, Regex> | undefined,
	invalid: ReadonlySet<string> | undefined
): ParseResult {
	const diagnostics: Diagnostic[] = [];
	const rep = new Reporter(diagnostics, source);
	if (text.slice(from, to).trim() === '') {
		rep.error('Enter a regular expression', from, to);
		return { ok: false, diagnostics };
	}
	const toks = tokenize(text, from, to, rep);
	const regex = new Parser(toks, text, rep, defs, invalid).parseTop();
	const sorted = sortDiagnostics(diagnostics);
	return hasErrors(sorted)
		? { ok: false, diagnostics: sorted }
		: { ok: true, regex, diagnostics: sorted };
}

/** Parses one RE in lecture notation. */
export function parseRegex(text: string, opts: ParseOptions = {}): ParseResult {
	return parseRange(text, 0, text.length, opts.source ?? null, opts.defs, opts.invalid);
}

const DEF_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFINITIONS = '<definitions>';

/**
 * Parses regular definitions, one `name = RE` per line (blank lines and lines
 * starting with // are skipped). Definitions may refer to each other in any
 * order; cycles are errors. Spans are absolute offsets into `text`, with
 * source = the definition name ('<definitions>' for line-level problems).
 */
export function parseDefinitions(text: string): DefinitionsResult {
	const diagnostics: Diagnostic[] = [];
	const lineRep = new Reporter(diagnostics, DEFINITIONS);
	interface Pending {
		entry: DefinitionEntry;
		exprStart: number;
		exprEnd: number;
		eq: number;
		duplicate: boolean;
	}
	const pending: Pending[] = [];
	const firstLine = new Map<string, number>();

	let offset = 0;
	text.split('\n').forEach((raw, idx) => {
		const lineStart = offset;
		offset += raw.length + 1;
		const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		const lead = content.length - content.trimStart().length;
		const body = content.trim();
		if (body === '' || body.startsWith('//')) return;
		const lineEnd = lineStart + content.trimEnd().length;
		const eq = content.indexOf('=');
		if (eq < 0) {
			lineRep.error('expected a definition: name = RE', lineStart + lead, lineEnd);
			return;
		}
		const name = content.slice(0, eq).trim();
		const nameStart = lineStart + lead;
		if (!DEF_NAME.test(name)) {
			lineRep.error(
				name === ''
					? 'missing definition name before ='
					: `${name} is not a valid name: use letters, digits, and _, starting with a letter or _`,
				name === '' ? lineStart + eq : nameStart,
				name === '' ? lineStart + eq + 1 : nameStart + name.length
			);
			return;
		}
		const after = content.slice(eq + 1);
		const exprStart = lineStart + eq + 1 + (after.length - after.trimStart().length);
		const exprEnd = Math.max(exprStart, lineEnd);
		const entry: DefinitionEntry = {
			name,
			line: idx + 1,
			text: text.slice(exprStart, exprEnd),
			nameSpan: { start: nameStart, end: nameStart + name.length, source: name },
			exprSpan: { start: exprStart, end: exprEnd, source: name },
			regex: null
		};
		const prior = firstLine.get(name);
		if (prior !== undefined)
			diagnostics.push({
				severity: 'error',
				message: `${name} is already defined on line ${prior}`,
				span: entry.nameSpan
			});
		else firstLine.set(name, idx + 1);
		pending.push({ entry, exprStart, exprEnd, eq: lineStart + eq, duplicate: prior !== undefined });
	});

	const live = pending.filter((p) => !p.duplicate);
	const byName = new Map(live.map((p) => [p.entry.name, p]));
	const deps = new Map<string, string[]>();
	for (const p of live) {
		const scratch = new Reporter([], null);
		const names = tokenize(text, p.exprStart, p.exprEnd, scratch)
			.filter((t): t is Token & { kind: 'name' } => t.kind === 'name' && byName.has(t.name))
			.map((t) => t.name);
		deps.set(p.entry.name, names);
	}

	const { order, cycles } = orderDefinitions([...byName.keys()], deps);
	for (const cycle of cycles)
		for (const name of new Set(cycle)) {
			const walk = rotateCycle(cycle, name).join(' → ');
			diagnostics.push({
				severity: 'error',
				message: `${name} is defined in terms of itself: ${walk}`,
				span: byName.get(name)!.entry.nameSpan
			});
		}

	const built = new Map<string, Regex>();
	for (const name of order) {
		const p = byName.get(name)!;
		if (p.exprStart >= p.exprEnd) {
			diagnostics.push({
				severity: 'error',
				message: `missing RE after ${name} =`,
				span: { start: p.eq, end: p.eq + 1, source: name }
			});
			continue;
		}
		const invalid = new Set([...byName.keys()].filter((n) => !built.has(n)));
		const res = parseRange(text, p.exprStart, p.exprEnd, name, built, invalid);
		diagnostics.push(...res.diagnostics);
		if (res.ok) {
			p.entry.regex = res.regex;
			built.set(name, res.regex);
		}
	}

	const defs = new Map<string, Regex>();
	for (const p of live) if (p.entry.regex) defs.set(p.entry.name, p.entry.regex);
	return { defs, entries: pending.map((p) => p.entry), diagnostics: sortDiagnostics(diagnostics) };
}
