/**
 * Basic queries and transformations on the shared automaton model: alphabets,
 * symbol classes, determinism, completion with a trap state, reachability,
 * transition tables, and the plain-text automaton format.
 */
import { CharSet, partitionCharSets, type Range } from '../charset';
import { formatClass, showChar } from '../chars';
import type { Diagnostic } from '../diagnostics';
import type { Automaton, State, StateId, Transition } from './types';

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Spreadsheet-style letters: 0 → A … 25 → Z, 26 → AA, 27 → AB, … */
export function letterName(i: number): string {
	let n = Math.floor(i) + 1;
	let s = '';
	while (n > 0) {
		n--;
		s = String.fromCharCode(65 + (n % 26)) + s;
		n = Math.floor(n / 26);
	}
	return s;
}

const UPPER = /^[A-Z]+$/;
const CHUNKS = /\d+|\D+/g;

function compareDigits(a: string, b: string): number {
	const x = a.replace(/^0+(?=\d)/, '');
	const y = b.replace(/^0+(?=\d)/, '');
	if (x.length !== y.length) return x.length - y.length;
	return x < y ? -1 : x > y ? 1 : a.length - b.length;
}

/**
 * Natural order for state names: digit runs compare numerically (q2 < q10), and
 * all-capital names follow `letterName` order (Z < AA). This is the "name
 * order" used by `move`.
 */
export function compareNames(a: string, b: string): number {
	if (UPPER.test(a) && UPPER.test(b) && a.length !== b.length) return a.length - b.length;
	const ca = a.match(CHUNKS) ?? [];
	const cb = b.match(CHUNKS) ?? [];
	for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
		const x = ca[i];
		const y = cb[i];
		if (x === y) continue;
		const dx = x.charCodeAt(0) >= 48 && x.charCodeAt(0) <= 57;
		const dy = y.charCodeAt(0) >= 48 && y.charCodeAt(0) <= 57;
		if (dx && dy) return compareDigits(x, y);
		return x < y ? -1 : 1;
	}
	return ca.length - cb.length;
}

/** State ids sorted by name order (ties by id). */
export function sortByName(a: Automaton, ids: Iterable<StateId>): StateId[] {
	return [...ids].sort((x, y) => compareNames(a.states[x].name, a.states[y].name) || x - y);
}

/** The first state with this name, if any. */
export function stateNamed(a: Automaton, name: string): StateId | undefined {
	return a.states.find((s) => s.name === name)?.id;
}

export function acceptingStates(a: Automaton): StateId[] {
	return a.states.filter((s) => s.accepting).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// Alphabet and symbol classes
// ---------------------------------------------------------------------------

/** A transition that can actually be taken on some symbol. */
export const isLabeled = (t: Transition): t is Transition & { label: CharSet } =>
	t.label !== null && !t.label.isEmpty;

/** Union of all transition labels. */
export function labelUnion(a: Automaton): CharSet {
	const ranges: Range[] = [];
	for (const t of a.transitions) if (t.label) ranges.push(...t.label.ranges);
	return CharSet.fromRanges(ranges);
}

/** Σ: the declared alphabet (plus any label symbols outside it), or else the union of the labels. */
export function alphabetOf(a: Automaton): CharSet {
	const labels = labelUnion(a);
	return a.alphabet ? a.alphabet.union(labels) : labels;
}

/**
 * Disjoint symbol classes, ascending, such that every label, the declared
 * alphabet, and every set in `extra` is a union of classes. Two symbols of one
 * class behave identically everywhere in the machine.
 */
export function symbolClasses(a: Automaton, extra: readonly CharSet[] = []): CharSet[] {
	const seen = new Map<string, CharSet>();
	const add = (s: CharSet) => {
		if (!s.isEmpty) seen.set(s.key(), s);
	};
	if (a.alphabet) add(a.alphabet);
	for (const t of a.transitions) if (t.label) add(t.label);
	for (const s of extra) add(s);
	return partitionCharSets(seen.values());
}

export function outgoing(a: Automaton, s: StateId): Transition[] {
	return a.transitions.filter((t) => t.from === s);
}

export function incoming(a: Automaton, s: StateId): Transition[] {
	return a.transitions.filter((t) => t.to === s);
}

/** Outgoing transitions of every state, each list in creation order. */
export function outgoingIndex(a: Automaton): Transition[][] {
	const out: Transition[][] = a.states.map(() => []);
	for (const t of a.transitions) out[t.from]?.push(t);
	for (const list of out) list.sort((x, y) => x.id - y.id);
	return out;
}

// ---------------------------------------------------------------------------
// Determinism and completion
// ---------------------------------------------------------------------------

export interface DeterminismReport {
	kind: 'dfa' | 'partial-dfa' | 'nfa';
	/** Every ε-transition. */
	epsilonMoves: Transition[];
	/** Symbols on which a state has transitions to two or more different states. */
	conflicts: { state: StateId; symbols: CharSet; transitions: Transition[] }[];
	/** Symbols of Σ on which a state has no transition. */
	missing: { state: StateId; symbols: CharSet }[];
}

/**
 * Classifies a machine as a DFA (total), a partial DFA (some missing
 * transitions, which go to the trap state), or an NFA (ε-moves or a symbol
 * with several possible next states).
 */
export function analyzeDeterminism(a: Automaton): DeterminismReport {
	const sigma = alphabetOf(a);
	const out = outgoingIndex(a);
	const epsilonMoves = a.transitions.filter((t) => t.label === null);
	const conflicts: DeterminismReport['conflicts'] = [];
	const missing: DeterminismReport['missing'] = [];
	for (const state of a.states) {
		const labeled = out[state.id].filter(isLabeled);
		const byKey = new Map<string, { symbols: CharSet; transitions: Transition[] }>();
		for (const cls of partitionCharSets(labeled.map((t) => t.label))) {
			const ts = labeled.filter((t) => t.label.overlaps(cls));
			if (new Set(ts.map((t) => t.to)).size < 2) continue;
			const key = ts.map((t) => t.id).join(',');
			const prev = byKey.get(key);
			if (prev) prev.symbols = prev.symbols.union(cls);
			else byKey.set(key, { symbols: cls, transitions: ts });
		}
		for (const c of byKey.values()) conflicts.push({ state: state.id, ...c });
		const covered = CharSet.fromRanges(labeled.flatMap((t) => t.label.ranges));
		const gap = sigma.subtract(covered);
		if (!gap.isEmpty) missing.push({ state: state.id, symbols: gap });
	}
	const kind =
		epsilonMoves.length > 0 || conflicts.length > 0
			? 'nfa'
			: missing.length > 0
				? 'partial-dfa'
				: 'dfa';
	return { kind, epsilonMoves, conflicts, missing };
}

/** True for DFAs and partial DFAs. */
export function isDeterministic(a: Automaton): boolean {
	return analyzeDeterminism(a).kind !== 'nfa';
}

function freshName(a: Automaton, base: string): string {
	const taken = new Set(a.states.map((s) => s.name));
	if (!taken.has(base)) return base;
	for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Makes every state total over Σ by sending missing symbols to an explicit
 * trap state (Lexical Analysis III, slide 6). Returns the input unchanged,
 * with `trap: null`, when nothing is missing.
 */
export function complete(
	a: Automaton,
	opts: { trapName?: string } = {}
): { automaton: Automaton; trap: StateId | null } {
	const sigma = alphabetOf(a);
	const report = analyzeDeterminism(a);
	if (report.missing.length === 0) return { automaton: a, trap: null };
	const trap = a.states.length;
	const states: State[] = [
		...a.states,
		{ id: trap, name: freshName(a, opts.trapName ?? 'trap'), accepting: false, trap: true }
	];
	let nextId = a.transitions.reduce((m, t) => Math.max(m, t.id + 1), 0);
	const transitions: Transition[] = [...a.transitions];
	for (const m of report.missing)
		transitions.push({ id: nextId++, from: m.state, to: trap, label: m.symbols });
	transitions.push({ id: nextId, from: trap, to: trap, label: sigma });
	return { automaton: { ...a, states, transitions }, trap };
}

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

/** States reachable from the start (following ε-moves and labeled transitions). */
export function reachableStates(a: Automaton): Set<StateId> {
	const out = outgoingIndex(a);
	const seen = new Set<StateId>([a.start]);
	const stack = [a.start];
	while (stack.length > 0) {
		const s = stack.pop()!;
		for (const t of out[s] ?? []) {
			if (t.label !== null && t.label.isEmpty) continue;
			if (!seen.has(t.to)) {
				seen.add(t.to);
				stack.push(t.to);
			}
		}
	}
	return seen;
}

/** States from which some accepting state can be reached. */
export function coReachableStates(a: Automaton): Set<StateId> {
	const into: StateId[][] = a.states.map(() => []);
	for (const t of a.transitions) {
		if (t.label !== null && t.label.isEmpty) continue;
		into[t.to]?.push(t.from);
	}
	const seen = new Set<StateId>(acceptingStates(a));
	const stack = [...seen];
	while (stack.length > 0) {
		const s = stack.pop()!;
		for (const p of into[s]) {
			if (!seen.has(p)) {
				seen.add(p);
				stack.push(p);
			}
		}
	}
	return seen;
}

/**
 * Keeps only the states in `keep` (renumbered in original order). Transitions
 * between kept states keep their order and are renumbered from 0.
 */
export function restrictStates(
	a: Automaton,
	keep: ReadonlySet<StateId>
): { automaton: Automaton; removed: StateId[]; map: Map<StateId, StateId> } {
	const map = new Map<StateId, StateId>();
	const states: State[] = [];
	const removed: StateId[] = [];
	for (const s of a.states) {
		if (keep.has(s.id)) {
			map.set(s.id, states.length);
			states.push({ ...s, id: states.length });
		} else removed.push(s.id);
	}
	const transitions: Transition[] = [];
	for (const t of a.transitions) {
		const from = map.get(t.from);
		const to = map.get(t.to);
		if (from === undefined || to === undefined) continue;
		transitions.push({ ...t, id: transitions.length, from, to });
	}
	const start = map.get(a.start);
	if (start === undefined) throw new Error('restrictStates: the start state must be kept');
	return { automaton: { ...a, states, transitions, start }, removed, map };
}

/** Drops states that cannot be reached from the start. `map` sends old ids to new ids. */
export function removeUnreachable(a: Automaton): {
	automaton: Automaton;
	removed: StateId[];
	map: Map<StateId, StateId>;
} {
	return restrictStates(a, reachableStates(a));
}

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

export interface TableRow {
	state: StateId;
	/** cells[classIndex] = target states in name order ([] = no transition). */
	cells: StateId[][];
	/** ε-targets in name order. */
	epsilon: StateId[];
}

/** Rows = states (id order), columns = symbol classes (ascending), cells = next states. */
export function transitionTable(
	a: Automaton,
	classes: CharSet[] = symbolClasses(a)
): { classes: CharSet[]; rows: TableRow[] } {
	const out = outgoingIndex(a);
	const rows = a.states.map((s): TableRow => {
		const ts = out[s.id];
		const targets = (pick: (t: Transition) => boolean) =>
			sortByName(a, new Set(ts.filter(pick).map((t) => t.to)));
		return {
			state: s.id,
			cells: classes.map((c) => targets((t) => t.label !== null && t.label.overlaps(c))),
			epsilon: targets((t) => t.label === null)
		};
	});
	return { classes, rows };
}

// ---------------------------------------------------------------------------
// Text format
// ---------------------------------------------------------------------------
//
//   # comment
//   states: A B C          (optional; fixes the order of states)
//   start: A
//   accept: B C
//   alphabet: 0,1          (optional; declares Σ)
//   A 0,1 B                symbols separated by commas
//   A ε B                  ε-move (also eps)
//   A ' ' B                quoted symbol, for space, comma, quotes, #
//   A [a-z] B              class
//   A -0,1-> B             arrow form
//
// States are created in order of first mention. Names containing spaces or
// punctuation are written in double quotes: "{A, B}".

interface Word {
	text: string;
	start: number;
	end: number;
}

const DIRECTIVE = /^(\s*)(start|initial|accept|accepting|final|finals|states|alphabet)(\s*):/i;
const EPSILON_WORDS = new Set(['ε', 'ϵ', 'eps', 'epsilon', '\\e']);
const BARE_NAME = /^[^\s"'#[\],:-][^\s"'#[\],:]*$/u;
const UNSAFE_SYMBOL = new Set([...' \'",[]#:-\\', 'ε', 'ϵ']);

const span = (start: number, end: number) => ({ start, end, source: null });

function splitWords(
	line: string,
	offset: number,
	diagnostics: Diagnostic[]
): { words: Word[]; ok: boolean } {
	const words: Word[] = [];
	let i = 0;
	while (i < line.length) {
		while (i < line.length && /\s/.test(line[i])) i++;
		if (i >= line.length || line[i] === '#') break;
		const start = i;
		let comment = false;
		while (i < line.length && !/\s/.test(line[i])) {
			const ch = line[i];
			if (ch === '#') {
				comment = true;
				break;
			}
			if (ch === "'" || ch === '"' || ch === '[') {
				const close = ch === '[' ? ']' : ch;
				let j = i + 1;
				while (j < line.length && line[j] !== close) j += line[j] === '\\' ? 2 : 1;
				if (j >= line.length) {
					const what = ch === '[' ? 'class: missing ]' : `quote: missing ${close}`;
					diagnostics.push({
						severity: 'error',
						message: `Unterminated ${what}`,
						span: span(offset + i, offset + line.length)
					});
					return { words, ok: false };
				}
				i = j + 1;
			} else i++;
		}
		if (i > start)
			words.push({ text: line.slice(start, i), start: offset + start, end: offset + i });
		if (comment) break;
	}
	return { words, ok: true };
}

/** Decodes one escape at `text[i]` (just after the backslash). */
function readEscape(text: string, i: number): { cp: number; next: number } {
	const c = text[i];
	const named: Record<string, number> = { t: 9, n: 10, r: 13, v: 11, f: 12, '0': 0 };
	if (c in named) return { cp: named[c], next: i + 1 };
	if (c === 'x' && /^[0-9a-fA-F]{2}/.test(text.slice(i + 1)))
		return { cp: parseInt(text.slice(i + 1, i + 3), 16), next: i + 3 };
	if (c === 'u') {
		const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(text.slice(i + 1));
		if (braced) return { cp: parseInt(braced[1], 16), next: i + 1 + braced[0].length };
		if (/^[0-9a-fA-F]{4}/.test(text.slice(i + 1)))
			return { cp: parseInt(text.slice(i + 1, i + 5), 16), next: i + 5 };
	}
	const cp = text.codePointAt(i) ?? 92;
	return { cp, next: i + (cp > 0xffff ? 2 : 1) };
}

/** Code points of a quoted body with escapes decoded. */
function unescape(body: string): number[] {
	const out: number[] = [];
	let i = 0;
	while (i < body.length) {
		if (body[i] === '\\' && i + 1 < body.length) {
			const { cp, next } = readEscape(body, i + 1);
			out.push(cp);
			i = next;
		} else {
			const cp = body.codePointAt(i)!;
			out.push(cp);
			i += cp > 0xffff ? 2 : 1;
		}
	}
	return out;
}

/** Parses the inside of `[...]`; `null` on malformed input. */
function parseClassBody(body: string): CharSet | null {
	let i = 0;
	let negate = false;
	if (body[0] === '^') {
		negate = true;
		i = 1;
	}
	const read = (): number | null => {
		if (i >= body.length) return null;
		if (body[i] === '\\') {
			if (i + 1 >= body.length) return null;
			const { cp, next } = readEscape(body, i + 1);
			i = next;
			return cp;
		}
		const cp = body.codePointAt(i)!;
		i += cp > 0xffff ? 2 : 1;
		return cp;
	};
	const ranges: Range[] = [];
	while (i < body.length) {
		const lo = read();
		if (lo === null) return null;
		if (body[i] === '-' && i + 1 < body.length) {
			i++;
			const hi = read();
			if (hi === null || hi < lo) return null;
			ranges.push([lo, hi]);
		} else ranges.push([lo, lo]);
	}
	const set = CharSet.fromRanges(ranges);
	return negate ? set.complement() : set;
}

/** Splits on commas outside quotes and brackets; `at` is each piece's offset in `text`. */
function splitItems(text: string): { text: string; at: number }[] {
	const items: { text: string; at: number }[] = [];
	let i = 0;
	let start = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "'" || ch === '"' || ch === '[') {
			const close = ch === '[' ? ']' : ch;
			i++;
			while (i < text.length && text[i] !== close) i += text[i] === '\\' ? 2 : 1;
			i++;
		} else if (ch === ',') {
			items.push({ text: text.slice(start, i), at: start });
			start = ++i;
		} else i++;
	}
	items.push({ text: text.slice(start), at: start });
	return items;
}

/** Parses a label such as `0,1`, `ε`, `' '`, `[a-z]`, `a,[0-9]`. */
function parseLabel(
	word: Word,
	text: string,
	diagnostics: Diagnostic[]
): { symbols: CharSet; epsilon: boolean; epsilonFirst: boolean } | null {
	const where = span(word.start, word.end);
	const fail = (message: string) => {
		diagnostics.push({ severity: 'error', message, span: where });
		return null;
	};
	const ranges: Range[] = [];
	let epsilon = false;
	let epsilonFirst = false;
	for (const { text: item } of splitItems(text)) {
		if (item === '') return fail(`Empty symbol in "${text}". Write a comma as ','.`);
		if (EPSILON_WORDS.has(item)) {
			if (!epsilon && ranges.length === 0) epsilonFirst = true;
			epsilon = true;
		} else if (item.startsWith("'")) {
			if (item.length < 2 || !item.endsWith("'")) return fail(`Malformed quoted symbol ${item}`);
			const cps = unescape(item.slice(1, -1));
			if (cps.length !== 1)
				return fail(`${item} must hold exactly one symbol; separate symbols with commas`);
			ranges.push([cps[0], cps[0]]);
		} else if (item.startsWith('[')) {
			if (!item.endsWith(']')) return fail(`Malformed class ${item}`);
			const set = parseClassBody(item.slice(1, -1));
			if (set === null) return fail(`Malformed class ${item}`);
			if (set.isEmpty)
				diagnostics.push({
					severity: 'warning',
					message: `${item} matches no symbol`,
					span: where
				});
			ranges.push(...set.ranges);
		} else {
			const cps = [...item];
			if (cps.length !== 1)
				return fail(
					`"${item}" is not one symbol. Use one character, a quoted symbol like 'x', a class like [a-z], or ε.`
				);
			const cp = cps[0].codePointAt(0)!;
			ranges.push([cp, cp]);
		}
	}
	return { symbols: CharSet.fromRanges(ranges), epsilon, epsilonFirst };
}

function parseName(word: Word, diagnostics: Diagnostic[]): string | null {
	const t = word.text;
	if (t.startsWith('"')) {
		if (t.length < 2 || !t.endsWith('"')) {
			diagnostics.push({
				severity: 'error',
				message: `Malformed quoted name ${t}`,
				span: span(word.start, word.end)
			});
			return null;
		}
		return String.fromCodePoint(...unescape(t.slice(1, -1)));
	}
	if (t.startsWith("'") || t.startsWith('[')) {
		diagnostics.push({
			severity: 'error',
			message: `State names go in double quotes, e.g. "${t.replace(/^['[]|['\]]$/g, '')}"`,
			span: span(word.start, word.end)
		});
		return null;
	}
	return t;
}

/** Names in a `states:` / `accept:` list, separated by spaces and/or commas. */
function parseNameList(words: Word[], diagnostics: Diagnostic[]): (Word & { name: string })[] {
	const out: (Word & { name: string })[] = [];
	for (const w of words) {
		for (const piece of splitItems(w.text)) {
			if (piece.text === '') continue;
			const sub = {
				text: piece.text,
				start: w.start + piece.at,
				end: w.start + piece.at + piece.text.length
			};
			const name = parseName(sub, diagnostics);
			if (name !== null) out.push({ ...sub, name });
		}
	}
	return out;
}

/**
 * Parses the plain-text automaton format (see the comment above). Problems are
 * reported as diagnostics with spans; `automaton` is null when there is an error.
 */
export function parseAutomatonText(text: string): {
	automaton: Automaton | null;
	diagnostics: Diagnostic[];
} {
	const diagnostics: Diagnostic[] = [];
	const states: State[] = [];
	const ids = new Map<string, StateId>();
	const transitions: Transition[] = [];
	const accept = new Set<StateId>();
	let start: { id: StateId; word: Word } | null = null;
	let alphabet: CharSet | undefined;
	const idOf = (name: string): StateId => {
		let id = ids.get(name);
		if (id === undefined) {
			id = states.length;
			ids.set(name, id);
			states.push({ id, name, accepting: false });
		}
		return id;
	};

	let offset = 0;
	for (const raw of text.split('\n')) {
		const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		const lineStart = offset;
		offset += raw.length + 1;
		const directive = DIRECTIVE.exec(line);
		const bodyStart = directive ? directive[0].length : 0;
		const { words, ok } = splitWords(line.slice(bodyStart), lineStart + bodyStart, diagnostics);
		if (!ok) continue;
		const lineSpan = span(lineStart, lineStart + line.length);

		if (directive) {
			const key = directive[2].toLowerCase();
			if (key === 'alphabet') {
				const ranges: Range[] = [];
				for (const w of words) {
					const label = parseLabel(w, w.text, diagnostics);
					if (!label) continue;
					if (label.epsilon)
						diagnostics.push({
							severity: 'error',
							message: 'ε is not a symbol of the alphabet',
							span: span(w.start, w.end)
						});
					ranges.push(...label.symbols.ranges);
				}
				alphabet = (alphabet ?? CharSet.EMPTY).union(CharSet.fromRanges(ranges));
				continue;
			}
			const names = parseNameList(words, diagnostics);
			if (key === 'start' || key === 'initial') {
				if (names.length !== 1) {
					diagnostics.push({
						severity: 'error',
						message: 'Give exactly one start state, e.g. "start: A"',
						span: lineSpan
					});
				} else if (start) {
					diagnostics.push({
						severity: 'error',
						message: `The start state is already ${states[start.id].name || '""'}`,
						span: span(names[0].start, names[0].end)
					});
				} else start = { id: idOf(names[0].name), word: names[0] };
			} else if (key === 'states') {
				for (const n of names) idOf(n.name);
			} else {
				for (const n of names) accept.add(idOf(n.name));
			}
			continue;
		}

		if (words.length === 0) continue;
		if (words[0].text.endsWith(':') && !words[0].text.startsWith('"')) {
			diagnostics.push({
				severity: 'error',
				message: `Unknown directive "${words[0].text}". Use start:, accept:, states:, or alphabet:`,
				span: span(words[0].start, words[0].end)
			});
			continue;
		}
		if (words.length !== 3) {
			diagnostics.push({
				severity: 'error',
				message: 'Expected a transition "from symbols to", e.g. "A 0,1 B"',
				span: lineSpan
			});
			continue;
		}
		const [fromWord, labelWord, toWord] = words;
		const arrow = /^-(.+)->$/su.exec(labelWord.text);
		const labelText = arrow ? arrow[1] : labelWord.text;
		if (!arrow && labelWord.text.startsWith('-') && labelWord.text.endsWith('>')) {
			diagnostics.push({
				severity: 'error',
				message: 'Put the symbols inside the arrow, e.g. "A -0,1-> B"',
				span: span(labelWord.start, labelWord.end)
			});
			continue;
		}
		const from = parseName(fromWord, diagnostics);
		const label = parseLabel(labelWord, labelText, diagnostics);
		const to = parseName(toWord, diagnostics);
		if (from === null || to === null || label === null) continue;
		const f = idOf(from);
		const t = idOf(to);
		const add = (l: CharSet | null) =>
			transitions.push({ id: transitions.length, from: f, to: t, label: l });
		if (label.epsilon && label.epsilonFirst) add(null);
		if (!label.symbols.isEmpty || !label.epsilon) add(label.symbols);
		if (label.epsilon && !label.epsilonFirst) add(null);
	}

	if (states.length === 0) {
		if (!diagnostics.some((d) => d.severity === 'error'))
			diagnostics.push({
				severity: 'error',
				message: 'No states yet. Add a transition such as "A 0 B" and a line "start: A".'
			});
		return { automaton: null, diagnostics };
	}
	if (!start)
		diagnostics.push({
			severity: 'warning',
			message: `No start state given; using ${states[0].name || '""'}. Add a line "start: ${states[0].name || 'A'}".`
		});
	if (diagnostics.some((d) => d.severity === 'error')) return { automaton: null, diagnostics };
	for (const id of accept) states[id].accepting = true;
	const automaton: Automaton = { states, transitions, start: start?.id ?? 0 };
	if (alphabet) automaton.alphabet = alphabet;
	return { automaton, diagnostics };
}

/** Parses the text format and throws on errors. For presets and tests. */
export function automatonFromText(text: string): Automaton {
	const { automaton, diagnostics } = parseAutomatonText(text);
	if (!automaton)
		throw new Error(
			`Invalid automaton text: ${diagnostics.map((d) => d.message).join('; ') || 'unknown error'}`
		);
	return automaton;
}

function formatName(name: string): string {
	if (BARE_NAME.test(name)) return name;
	let out = '"';
	for (const ch of name) out += showChar(ch, 'string');
	return out + '"';
}

function formatSymbol(cp: number): string {
	const ch = String.fromCodePoint(cp);
	if (!UNSAFE_SYMBOL.has(ch) && showChar(cp, 'label') === ch) return ch;
	return `'${showChar(cp, 'quoted')}'`;
}

/** Label text for the text format: `0,1`, `' '`, `[a-z]`, `[^\n]`. */
export function formatLabelText(set: CharSet): string {
	if (set.isEmpty) return '[]';
	if (set.size <= 8 && set.ranges.every(([lo, hi]) => hi - lo < 2))
		return [...set.codePoints()].map(formatSymbol).join(',');
	return formatClass(set);
}

/** Writes a machine in the text format; `parseAutomatonText` reads it back unchanged. */
export function formatAutomatonText(a: Automaton): string {
	const lines: string[] = [];
	const mention: StateId[] = [];
	const seen = new Set<StateId>();
	const note = (id: StateId) => {
		if (!seen.has(id)) {
			seen.add(id);
			mention.push(id);
		}
	};
	note(a.start);
	for (const s of a.states) if (s.accepting) note(s.id);
	for (const t of a.transitions) {
		note(t.from);
		note(t.to);
	}
	if (mention.length !== a.states.length || mention.some((id, i) => id !== i))
		lines.push(`states: ${a.states.map((s) => formatName(s.name)).join(' ')}`);
	lines.push(`start: ${formatName(a.states[a.start].name)}`);
	const acc = a.states.filter((s) => s.accepting);
	if (acc.length > 0) lines.push(`accept: ${acc.map((s) => formatName(s.name)).join(' ')}`);
	if (a.alphabet) lines.push(`alphabet: ${formatLabelText(a.alphabet)}`);
	for (const t of a.transitions)
		lines.push(
			`${formatName(a.states[t.from].name)} ${t.label ? formatLabelText(t.label) : 'ε'} ${formatName(a.states[t.to].name)}`
		);
	return lines.join('\n') + '\n';
}
