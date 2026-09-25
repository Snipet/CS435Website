/**
 * Parser for flex specification files (.l): the definitions section
 * (%top{ … }, %{ … %}, indented code, NAME pattern definitions, %option,
 * %s / %x, /* comments *\/), the rules section (optional <SC,…> prefix,
 * pattern, action), and the user code section.
 *
 * Offsets in the result index into the spec text; diagnostics carry spans
 * with `source: null`, so the spec editor can underline them.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import {
	parseFlexDefinitions,
	parseFlexPattern,
	type DefinitionsResult,
	type FlexDefinitionLine,
	type FlexPattern
} from '$lib/theory/regex';

export type RegionKind =
	/** %%, %top{ and its closing }, %{, %} */
	| 'delimiter'
	/** %option, %s, %x */
	| 'directive'
	/** Words after a directive. */
	| 'directive-arg'
	| 'def-name'
	| 'def-pattern'
	| 'comment'
	/** C code: %top, %{ %}, indented lines, code before the first rule, user code. */
	| 'code'
	/** <SC,…> before a rule. */
	| 'sc'
	/** <<EOF>> */
	| 'eof'
	| 'pattern'
	| 'action'
	/** The | action (same action as the next rule). */
	| 'bar';

export interface Region {
	kind: RegionKind;
	start: number;
	end: number;
	/** Rule index for pattern, sc, eof, action, and bar regions. */
	rule?: number;
}

export type BlockKind = 'top' | 'defs' | 'prologue' | 'user';

/** A stretch of C code copied into the scanner. */
export interface CodeBlock {
	kind: BlockKind;
	start: number;
	end: number;
}

export interface StartCondition {
	name: string;
	/** %x (exclusive) rather than %s (inclusive). */
	exclusive: boolean;
	line: number;
	start: number;
	end: number;
}

export interface SpecRule {
	/** 0-based; shown as rule index + 1. */
	index: number;
	/** 1-based line of the rule. */
	line: number;
	/** Start conditions from a <…> prefix, or null (INITIAL and the %s conditions). */
	sc: string[] | null;
	eof: boolean;
	patternText: string;
	patternStart: number;
	patternEnd: number;
	/** Parsed pattern; null for <<EOF>> rules and patterns with errors. */
	pattern: FlexPattern | null;
	actionText: string;
	actionStart: number;
	actionEnd: number;
	/** The action is |: run the next rule's action. */
	bar: boolean;
	/** Rule whose action runs when this rule matches (differs for |), or -1. */
	actionRule: number;
}

export interface FlexSpec {
	text: string;
	regions: Region[];
	blocks: CodeBlock[];
	definitions: FlexDefinitionLine[];
	defs: DefinitionsResult;
	startConditions: StartCondition[];
	/** %option words (lower case). */
	options: Set<string>;
	rules: SpecRule[];
	/** Line ranges (1-based, inclusive) of the three sections; rules and user code start at their %% line. */
	sections: {
		definitions: [number, number];
		rules: [number, number] | null;
		user: [number, number] | null;
	};
	diagnostics: Diagnostic[];
}

interface Line {
	start: number;
	end: number;
	text: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*/;
const SC_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** %option words that change how the playground runs a scanner. */
const KNOWN_OPTIONS = new Set([
	'noyywrap',
	'yywrap',
	'yylineno',
	'noyylineno',
	'nodefault',
	'default',
	'main',
	'nomain',
	'noinput',
	'nounput',
	'input',
	'unput',
	'never-interactive',
	'always-interactive',
	'interactive',
	'batch',
	'8bit',
	'7bit',
	'warn',
	'nowarn',
	'debug',
	'nodebug',
	'perf-report',
	'verbose',
	'array',
	'pointer',
	'noyymore',
	'noreject',
	'fast',
	'full',
	'ecs',
	'meta-ecs',
	'read',
	'stdinit',
	'noyy_top_state',
	'noyy_push_state',
	'noyy_pop_state',
	'noyyget_text',
	'noyyget_leng',
	'noyyget_lineno',
	'noyyset_lineno',
	'noyyget_in',
	'noyyset_in',
	'noyyget_out',
	'noyyset_out',
	'noyyget_debug',
	'noyyset_debug',
	'noyyget_extra',
	'noyyset_extra'
]);

const UNSUPPORTED_OPTIONS: Record<string, string> = {
	'case-insensitive': 'case-insensitive scanners are not supported in this playground',
	caseless: 'case-insensitive scanners are not supported in this playground',
	stack: 'start-condition stacks are not supported in this playground',
	reentrant: 'reentrant scanners are not supported in this playground',
	'c++': 'C++ scanners are not supported in this playground',
	'bison-bridge': 'bison bridges are not supported in this playground',
	yymore: 'yymore() is not supported in this playground',
	reject: 'REJECT is not supported in this playground'
};

function splitLines(text: string): Line[] {
	const lines: Line[] = [];
	let start = 0;
	for (;;) {
		const nl = text.indexOf('\n', start);
		const end = nl < 0 ? text.length : nl;
		lines.push({ start, end, text: text.slice(start, end).replace(/\r$/, '') });
		if (nl < 0) break;
		start = nl + 1;
	}
	return lines;
}

/** Skips a C string or character literal starting at `i` (the quote); returns the index after it. */
function skipLiteral(text: string, i: number): number {
	const q = text[i];
	let j = i + 1;
	while (j < text.length && text[j] !== '\n') {
		if (text[j] === '\\') j += 2;
		else if (text[j] === q) return j + 1;
		else j++;
	}
	return j;
}

/**
 * The end of a flex pattern starting at `from`: the first space or tab that is
 * not inside quotes or brackets and not escaped.
 */
export function patternEnd(text: string, from: number, limit: number): number {
	let j = from;
	let quote = false;
	let bracket = false;
	let classStart = -1;
	while (j < limit) {
		const c = text[j];
		if (c === '\\') {
			j += 2;
			continue;
		}
		if (quote) {
			if (c === '"') quote = false;
			j++;
			continue;
		}
		if (bracket) {
			if (c === '[' && text[j + 1] === ':') {
				const close = text.indexOf(':]', j + 2);
				if (close >= 0 && close < limit) {
					j = close + 2;
					continue;
				}
			}
			// A ] right after [ or [^ is a literal ].
			if (c === ']' && j !== classStart) bracket = false;
			j++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') break;
		if (c === '"') quote = true;
		else if (c === '[') {
			bracket = true;
			classStart = text[j + 1] === '^' ? j + 2 : j + 1;
		}
		j++;
	}
	return Math.min(j, limit);
}

/**
 * The end of an action starting at `from`: the end of the line, or later when
 * braces are still open (strings, character constants and comments are skipped).
 */
function actionEnd(
	text: string,
	from: number
): { end: number; unclosed: number | null; stray: number | null } {
	let depth = 0;
	let firstOpen: number | null = null;
	let stray: number | null = null;
	let j = from;
	while (j < text.length) {
		const c = text[j];
		if (c === '\n' && depth === 0) return { end: j, unclosed: null, stray };
		if (c === '"' || c === "'") {
			j = skipLiteral(text, j);
			continue;
		}
		if (c === '/' && text[j + 1] === '*') {
			const close = text.indexOf('*/', j + 2);
			j = close < 0 ? text.length : close + 2;
			continue;
		}
		if (c === '/' && text[j + 1] === '/') {
			while (j < text.length && text[j] !== '\n') j++;
			continue;
		}
		if (c === '{') {
			if (depth === 0) firstOpen = j;
			depth++;
		} else if (c === '}') {
			if (depth === 0) stray ??= j;
			else depth--;
		}
		j++;
	}
	return { end: text.length, unclosed: depth > 0 ? firstOpen : null, stray };
}

/** Offset of the `}` closing a %top{ block whose `{` is at `open`, or -1. */
function closingBrace(text: string, open: number): number {
	let depth = 0;
	let j = open;
	while (j < text.length) {
		const c = text[j];
		if (c === '"' || c === "'") {
			j = skipLiteral(text, j);
			continue;
		}
		if (c === '/' && text[j + 1] === '*') {
			const close = text.indexOf('*/', j + 2);
			j = close < 0 ? text.length : close + 2;
			continue;
		}
		if (c === '/' && text[j + 1] === '/') {
			while (j < text.length && text[j] !== '\n') j++;
			continue;
		}
		if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return j;
		j++;
	}
	return -1;
}

export function parseSpec(text: string): FlexSpec {
	const lines = splitLines(text);
	const regions: Region[] = [];
	const blocks: CodeBlock[] = [];
	const diagnostics: Diagnostic[] = [];
	const definitions: FlexDefinitionLine[] = [];
	const startConditions: StartCondition[] = [];
	const options = new Set<string>();
	const rules: SpecRule[] = [];

	const diag = (severity: Diagnostic['severity'], message: string, start: number, end: number) =>
		diagnostics.push({ severity, message, span: { start, end, source: null } });
	const region = (kind: RegionKind, start: number, end: number, rule?: number) => {
		if (end > start)
			regions.push(rule === undefined ? { kind, start, end } : { kind, start, end, rule });
	};
	const lineAt = (offset: number): number => {
		let lo = 0;
		let hi = lines.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lines[mid].start <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};

	/** A C comment starting at `start`; returns the index of the line after it. */
	const comment = (li: number, start: number): number => {
		const close = text.indexOf('*/', start + 2);
		if (close < 0) {
			diag('error', 'comment /* is never closed', start, start + 2);
			region('comment', start, text.length);
			return lines.length;
		}
		region('comment', start, close + 2);
		const endLine = lineAt(close);
		const after = text.slice(close + 2, lines[endLine].end);
		if (after.trim())
			diag('warning', 'text after */ on this line is ignored', close + 2, lines[endLine].end);
		return Math.max(li, endLine) + 1;
	};

	/** %{ … %} starting on line li; returns the index of the line after %}. */
	const percentBlock = (li: number, kind: BlockKind | null): number => {
		const open = lines[li];
		region('delimiter', open.start, open.start + 2);
		for (let k = li + 1; k < lines.length; k++) {
			if (lines[k].text.startsWith('%}')) {
				if (k > li + 1 && kind)
					blocks.push({ kind, start: lines[li + 1].start, end: lines[k].start });
				if (k > li + 1) region(kind ? 'code' : 'comment', lines[li + 1].start, lines[k].start);
				region('delimiter', lines[k].start, lines[k].start + 2);
				return k + 1;
			}
			if (/^%%/.test(lines[k].text)) break;
		}
		diag('error', '%{ is never closed; add a line with %}', open.start, open.start + 2);
		return li + 1;
	};

	/** Consecutive indented lines as one code block; returns the next line index. */
	const indented = (li: number, kind: BlockKind | null): number => {
		let k = li;
		while (k < lines.length && /^[ \t]/.test(lines[k].text) && lines[k].text.trim()) k++;
		const start = lines[li].start;
		const end = lines[k - 1].end;
		if (kind) {
			blocks.push({ kind, start, end });
			region('code', start, end);
		}
		return k;
	};

	// --- Section 1: definitions ---------------------------------------------
	let li = 0;
	let section2: number | null = null;
	while (li < lines.length) {
		const L = lines[li];
		const t = L.text;
		if (t.startsWith('%%')) {
			region('delimiter', L.start, L.start + 2);
			if (t.slice(2).trim()) diag('warning', 'text after %% is ignored', L.start + 2, L.end);
			section2 = li;
			li++;
			break;
		}
		if (!t.trim()) {
			li++;
			continue;
		}
		if (t.startsWith('%top{') || /^%top\s*\{/.test(t)) {
			const open = text.indexOf('{', L.start);
			const close = closingBrace(text, open);
			region('delimiter', L.start, open + 1);
			if (close < 0) {
				diag('error', '%top{ is never closed; add a line with }', L.start, open + 1);
				li++;
				continue;
			}
			blocks.push({ kind: 'top', start: open + 1, end: close });
			region('code', open + 1, close);
			region('delimiter', close, close + 1);
			const endLine = lineAt(close);
			if (text.slice(close + 1, lines[endLine].end).trim())
				diag(
					'warning',
					'text after the closing } of %top is ignored',
					close + 1,
					lines[endLine].end
				);
			li = endLine + 1;
			continue;
		}
		if (t.startsWith('%{')) {
			li = percentBlock(li, 'defs');
			continue;
		}
		if (/^[ \t]/.test(t)) {
			const trimmed = t.trimStart();
			if (trimmed.startsWith('/*')) li = comment(li, L.start + (t.length - trimmed.length));
			else li = indented(li, 'defs');
			continue;
		}
		if (t.startsWith('/*')) {
			li = comment(li, L.start);
			continue;
		}
		if (t.startsWith('%')) {
			const m = /^%([A-Za-z]+)/.exec(t);
			const word = m ? m[1] : '';
			const wordEnd = L.start + 1 + word.length;
			const args = [...t.slice(1 + word.length).matchAll(/\S+/g)].map((a) => ({
				text: a[0],
				start: wordEnd + a.index!,
				end: wordEnd + a.index! + a[0].length
			}));
			region('directive', L.start, wordEnd);
			for (const a of args) region('directive-arg', a.start, a.end);
			if (word === 'option') {
				for (const a of args) {
					const opt = a.text.toLowerCase();
					if (UNSUPPORTED_OPTIONS[opt]) diag('error', UNSUPPORTED_OPTIONS[opt], a.start, a.end);
					else if (!KNOWN_OPTIONS.has(opt) && !/=/.test(opt))
						diag('warning', `unknown option ${a.text}`, a.start, a.end);
					options.add(opt);
				}
			} else if (word === 's' || word === 'x' || word === 'S' || word === 'X') {
				if (!args.length) diag('error', `%${word} needs start condition names`, L.start, wordEnd);
				for (const a of args) {
					if (!SC_NAME.test(a.text))
						diag('error', `${a.text} is not a valid start condition name`, a.start, a.end);
					else if (a.text === 'INITIAL' || startConditions.some((s) => s.name === a.text))
						diag('error', `start condition ${a.text} is already declared`, a.start, a.end);
					else
						startConditions.push({
							name: a.text,
							exclusive: word.toLowerCase() === 'x',
							line: li + 1,
							start: a.start,
							end: a.end
						});
				}
			} else if (word === 'array' || word === 'pointer') {
				// yytext as an array or a pointer: no difference here.
			} else {
				diag('error', `unknown directive %${word}`, L.start, wordEnd);
			}
			li++;
			continue;
		}
		const nm = NAME.exec(t);
		if (nm) {
			const rest = t.slice(nm[0].length);
			const ws = /^[ \t]+/.exec(rest);
			const body = ws ? rest.slice(ws[0].length).replace(/[ \t\r]+$/, '') : '';
			if (!ws && rest.trim()) {
				diag(
					'error',
					`put spaces between the name ${nm[0]} and its pattern`,
					L.start,
					L.start + nm[0].length + 1
				);
			} else if (!body) {
				diag('error', `definition ${nm[0]} has no pattern`, L.start, L.start + nm[0].length);
			} else {
				const textStart = L.start + nm[0].length + ws![0].length;
				region('def-name', L.start, L.start + nm[0].length);
				region('def-pattern', textStart, textStart + body.length);
				definitions.push({ name: nm[0], text: body, line: li + 1, textStart, nameStart: L.start });
			}
			li++;
			continue;
		}
		diag(
			'error',
			'expected a definition (NAME pattern), %option, %s, %x, %{ … %}, or %%',
			L.start,
			Math.max(L.end, L.start + 1)
		);
		li++;
	}

	const defs = parseFlexDefinitions(definitions);
	for (const dg of defs.diagnostics) {
		diagnostics.push(dg.span ? { ...dg, span: { ...dg.span, source: null } } : dg);
	}

	const scNames = new Set(startConditions.map((s) => s.name));
	let section3: number | null = null;

	// --- Section 2: rules -----------------------------------------------------
	if (section2 === null) {
		diag(
			'error',
			'missing %%: a flex spec needs a line with %% before its rules',
			text.length,
			text.length
		);
	} else {
		while (li < lines.length) {
			const L = lines[li];
			const t = L.text;
			if (t.startsWith('%%')) {
				region('delimiter', L.start, L.start + 2);
				section3 = li;
				break;
			}
			if (!t.trim()) {
				li++;
				continue;
			}
			if (/^[ \t]/.test(t)) {
				const trimmed = t.trimStart();
				if (trimmed.startsWith('/*')) li = comment(li, L.start + (t.length - trimmed.length));
				else if (!rules.length) li = indented(li, 'prologue');
				else {
					const k = indented(li, null);
					diag(
						'warning',
						'indented code between rules is ignored; an action must start on the same line as its pattern',
						L.start,
						lines[k - 1].end
					);
					li = k;
				}
				continue;
			}
			if (t.startsWith('%{')) {
				if (!rules.length) li = percentBlock(li, 'prologue');
				else {
					const next = percentBlock(li, null);
					diag('warning', '%{ … %} between rules is ignored', L.start, L.start + 2);
					li = next;
				}
				continue;
			}
			if (t.startsWith('/*')) {
				li = comment(li, L.start);
				continue;
			}
			if (t.startsWith('//')) {
				diag(
					'error',
					'flex does not read // comments between rules; use an indented /* … */ comment',
					L.start,
					L.end
				);
				li++;
				continue;
			}
			li = rule(li);
		}
	}

	function rule(li: number): number {
		const L = lines[li];
		const index = rules.length;
		let p = L.start;
		let sc: string[] | null = null;
		if (text[p] === '<' && !text.startsWith('<<EOF>>', p)) {
			const close = text.indexOf('>', p);
			if (close < 0 || close > L.end) {
				diag('error', 'start condition list < is never closed with >', p, L.end);
				return li + 1;
			}
			const listStart = p + 1;
			sc = [];
			let off = listStart;
			for (const raw of text.slice(listStart, close).split(',')) {
				const name = raw.trim();
				const s = off + raw.indexOf(name);
				if (name === '*' || name === 'INITIAL' || scNames.has(name)) sc.push(name);
				else if (!name) diag('error', 'empty start condition name', off, off + raw.length + 1);
				else
					diag(
						'error',
						`start condition ${name} is not declared with %s or %x`,
						s,
						s + name.length
					);
				off += raw.length + 1;
			}
			region('sc', p, close + 1, index);
			p = close + 1;
			const rest = text.slice(p, L.end).trim();
			if (rest === '{') {
				diag(
					'error',
					'start condition scopes <SC>{ … } are not supported; put <SC> before each rule',
					L.start,
					L.end
				);
				let k = li + 1;
				while (k < lines.length && lines[k].text.trim() !== '}' && !lines[k].text.startsWith('%%'))
					k++;
				return lines[k]?.text.trim() === '}' ? k + 1 : k;
			}
			if (text[p] === ' ' || text[p] === '\t' || p >= L.end) {
				diag('error', 'a pattern must follow the start conditions directly', p, p + 1);
				return li + 1;
			}
		}
		let eof = false;
		const patternStart = p;
		let pEnd: number;
		if (text.startsWith('<<EOF>>', p)) {
			eof = true;
			pEnd = p + 7;
			region('eof', p, pEnd, index);
		} else {
			pEnd = patternEnd(text, p, L.end);
			region('pattern', p, pEnd, index);
		}
		const patternText = text.slice(patternStart, pEnd);
		let a = pEnd;
		while (a < L.end && (text[a] === ' ' || text[a] === '\t' || text[a] === '\r')) a++;
		let aEnd = a;
		let bar = false;
		let nextLine = li + 1;
		if (a < L.end) {
			const r = actionEnd(text, a);
			aEnd = r.end;
			while (aEnd > a && /[ \t\r]/.test(text[aEnd - 1])) aEnd--;
			if (r.unclosed !== null)
				diag(
					'error',
					'this { is never closed, so the action runs to the end of the file',
					r.unclosed,
					r.unclosed + 1
				);
			if (r.stray !== null && r.unclosed === null)
				diag('error', 'unmatched } in the action', r.stray, r.stray + 1);
			nextLine = lineAt(r.end) + 1;
			const actionOnly = text
				.slice(a, aEnd)
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.trim();
			bar = actionOnly === '|';
			region(bar ? 'bar' : 'action', a, aEnd, index);
		}
		let pattern: FlexPattern | null = null;
		if (!eof) {
			const res = parseFlexPattern(patternText, { defs: defs.defs, invalid: defs.invalid });
			for (const dg of res.diagnostics) {
				diagnostics.push(
					dg.span
						? {
								...dg,
								span: {
									start: dg.span.start + patternStart,
									end: dg.span.end + patternStart,
									source: null
								}
							}
						: dg
				);
			}
			if (res.ok) pattern = res.pattern;
		}
		rules.push({
			index,
			line: li + 1,
			sc,
			eof,
			patternText,
			patternStart,
			patternEnd: pEnd,
			pattern,
			actionText: text.slice(a, aEnd),
			actionStart: a,
			actionEnd: aEnd,
			bar,
			actionRule: index
		});
		return nextLine;
	}

	// | actions: the next rule's action.
	for (let k = rules.length - 1; k >= 0; k--) {
		const r = rules[k];
		if (!r.bar) continue;
		const next = rules[k + 1];
		if (!next) {
			r.actionRule = -1;
			diag(
				'error',
				'| means "same action as the next rule", but no rule follows',
				r.actionStart,
				r.actionEnd
			);
		} else r.actionRule = next.actionRule;
	}
	if (
		section2 !== null &&
		!rules.some((r) => !r.eof) &&
		!diagnostics.some((x) => x.severity === 'error')
	) {
		diag(
			'info',
			'the rules section is empty: every character is copied to the output by the default rule',
			lines[section2].start,
			lines[section2].start + 2
		);
	}

	// --- Section 3: user code -------------------------------------------------
	if (section3 !== null && section3 + 1 < lines.length) {
		const start = lines[section3 + 1].start;
		if (text.slice(start).trim()) {
			blocks.push({ kind: 'user', start, end: text.length });
			region('code', start, text.length);
		}
	}

	// Each section starts at its %% line; a final empty line does not count.
	const lastLine =
		lines.length > 1 && lines[lines.length - 1].text === '' ? lines.length - 1 : lines.length;
	const sections: FlexSpec['sections'] = {
		definitions: [1, section2 === null ? lastLine : Math.max(1, section2)],
		rules: section2 === null ? null : [section2 + 1, section3 === null ? lastLine : section3],
		user: section3 === null ? null : [section3 + 1, lastLine]
	};

	regions.sort((x, y) => x.start - y.start);
	diagnostics.sort((x, y) => (x.span?.start ?? 0) - (y.span?.start ?? 0));
	return {
		text,
		regions,
		blocks,
		definitions,
		defs,
		startConditions,
		options,
		rules,
		sections,
		diagnostics
	};
}

/** Rules active in start condition `sc` (0 = INITIAL, k = the k-th declared condition). */
export function activeRules(spec: FlexSpec, sc: number): Set<number> {
	const cond = sc === 0 ? null : spec.startConditions[sc - 1];
	const name = cond ? cond.name : 'INITIAL';
	const out = new Set<number>();
	for (const r of spec.rules) {
		if (r.eof) continue;
		const listed = r.sc !== null && (r.sc.includes(name) || r.sc.includes('*'));
		const unmarked = r.sc === null && (!cond || !cond.exclusive);
		if (listed || unmarked) out.add(r.index);
	}
	return out;
}

/** The <<EOF>> rule for start condition `sc`, or null for the default (yyterminate). */
export function eofRule(spec: FlexSpec, sc: number): SpecRule | null {
	const name = sc === 0 ? 'INITIAL' : spec.startConditions[sc - 1]?.name;
	const eofs = spec.rules.filter((r) => r.eof);
	return (
		eofs.find((r) => r.sc !== null && (r.sc.includes(name) || r.sc.includes('*'))) ??
		eofs.find((r) => r.sc === null) ??
		null
	);
}

/** Name of start condition number `sc`. */
export function scName(spec: FlexSpec, sc: number): string {
	return sc === 0 ? 'INITIAL' : (spec.startConditions[sc - 1]?.name ?? String(sc));
}
