/**
 * Line-by-line traces of the table-driven scanner.
 *
 * 'first' runs the driver of Lexical Analysis IV, slide 15 as printed: it
 * stops at the first accepting state (or the error state), retracts one
 * character when the state says so, and returns tokenFor (state).
 *
 * 'longest' runs the same table the way a scanner generator does (maximal
 * munch, Lexical Analysis II): it reads until T has no entry, remembering the
 * last accepting state and position, then backs up to it. This is
 * `longestMatchRun` of the engine with the lines spelled out; when nothing
 * accepts, one character is reported as an error (the Error rule).
 *
 * getChar () returns EOF at the end of the input without moving; T looks EOF
 * up in the `other` column. ungetChar (EOF) does nothing.
 */
import { ERROR_RULE, ERROR_TOKEN } from '$lib/theory/automata';
import { showChar, formatString } from '$lib/theory/chars';
import type { StateId } from '$lib/theory/automata/types';
import {
	EOF,
	ERROR_STATE,
	lookup,
	stateName,
	type Ch,
	type DriverTable,
	type Lookup
} from './table';

export type Mode = 'first' | 'longest';

/** Lexical Analysis IV, slide 15, verbatim. */
export const SLIDE_DRIVER: readonly string[] = [
	'state = start;',
	'// accept: 1D bool array [state]',
	'// retract: 1D bool array [state]',
	'// T: 2D int array [state, char]',
	'// error: fn(state)',
	'while (!(accept[state] || error (state)))',
	'{',
	'  ch = getChar ();',
	'  state = T[state, ch];',
	'}',
	'if (accept[state]) {',
	'  if (retract[state])',
	'    ungetChar (ch);',
	'  return tokenFor (state);',
	'}',
	'handleError ();'
];

/** The same arrays driven for the longest match. */
export const LONGEST_DRIVER: readonly string[] = [
	'state = start;',
	'begin = position ();',
	'lastAccept = none;',
	'while (!error (state)) {',
	'  ch = getChar ();',
	'  state = T[state, ch];',
	'  if (accept[state]) {',
	'    if (retract[state])',
	'      ungetChar (ch);',
	'    lastAccept = (state, position ());',
	'  }',
	'}',
	'if (lastAccept != none) {',
	'  resetTo (lastAccept.position);',
	'  return tokenFor (lastAccept.state);',
	'}',
	'resetTo (begin + 1);',
	'handleError ();'
];

export const DRIVER_CODE: Record<Mode, readonly string[]> = {
	first: SLIDE_DRIVER,
	longest: LONGEST_DRIVER
};

export interface DriverToken {
	name: string;
	lexeme: string;
	start: number;
	end: number;
	/** Rule index (colors); ERROR_RULE for errors. */
	rule: number;
	/** The accepting state the token came from, or null for an error. */
	state: StateId | null;
	skipped: boolean;
	error: boolean;
}

export interface TraceStep {
	/** 1-based line of the driver code. */
	line: number;
	/** `state` after the step (ERROR_STATE for the error state). */
	state: StateId;
	/** `ch` after the step; undefined before the first getChar (). */
	ch?: Ch;
	/** Input pointer after the step. */
	pos: number;
	/** T[state, ch] read in this step. */
	lookup?: Lookup;
	/** The array entry this step tests, for the table highlight. */
	reads?: 'accept' | 'retract' | 'error';
	/** Longest match: the remembered accepting state and position. */
	lastAccept?: { state: StateId; pos: number } | null;
	/** What the step does, in words. */
	text: string;
	/** Set on the last step: the token returned, or the error reported. */
	result?: DriverToken;
}

export interface DriverCall {
	/** Input position when getToken () is called. */
	start: number;
	/** Input position when it returns. */
	end: number;
	steps: TraceStep[];
	/** The token returned, or an error token for handleError (). */
	token: DriverToken;
	/** Furthest position read during the call. */
	reach: number;
}

/** `'c'` for a character, EOF for the end of input. */
export function chText(ch: Ch | undefined): string {
	if (ch === undefined) return '—';
	if (ch === EOF) return 'EOF';
	return `'${showChar(ch, 'quoted')}'`;
}

/** Longest lexeme a step description spells out in full (code points). */
export const LEXEME_TEXT_MAX = 24;

/** `"abc"`; a long lexeme is cut short: `"abcd…" (2000 characters)`. */
export function lexemeText(lexeme: string): string {
	let n = 0;
	let cut = -1;
	for (let i = 0; i < lexeme.length; i += lexeme.codePointAt(i)! > 0xffff ? 2 : 1) {
		if (n === LEXEME_TEXT_MAX) cut = i;
		n++;
	}
	if (cut < 0) return formatString(lexeme);
	return `${formatString(lexeme.slice(0, cut)).slice(0, -1)}…" (${n} characters)`;
}

function getChar(input: string, pos: number): { ch: Ch; pos: number } {
	if (pos >= input.length) return { ch: EOF, pos };
	const ch = String.fromCodePoint(input.codePointAt(pos)!);
	return { ch, pos: pos + ch.length };
}

function nextCharEnd(input: string, pos: number): number {
	if (pos >= input.length) return pos;
	return pos + String.fromCodePoint(input.codePointAt(pos)!).length;
}

interface Tracer {
	steps: TraceStep[];
	state: StateId;
	ch: Ch | undefined;
	pos: number;
	reach: number;
	lastAccept: { state: StateId; pos: number } | null;
}

function tokenOf(
	table: DriverTable,
	state: StateId,
	input: string,
	start: number,
	end: number,
	skip: ReadonlySet<string>
): DriverToken {
	const name = table.token[state] ?? table.names[state];
	return {
		name,
		lexeme: input.slice(start, end),
		start,
		end,
		rule: table.rule[state] ?? 0,
		state,
		skipped: skip.has(name),
		error: false
	};
}

function errorToken(input: string, start: number, end: number): DriverToken {
	return {
		name: ERROR_TOKEN,
		lexeme: input.slice(start, end),
		start,
		end,
		rule: ERROR_RULE,
		state: null,
		skipped: false,
		error: true
	};
}

function lookupText(table: DriverTable, lk: Lookup): string {
	const cell = `T[${stateName(table, lk.from)}, ${chText(lk.ch)}]`;
	const col = lk.column === null ? '' : table.columns[lk.column];
	const via = col && col.other && lk.ch !== EOF ? ` (the ${col.header} column)` : '';
	const eof = col && lk.ch === EOF ? ` (EOF uses the ${col.header} column)` : '';
	if (lk.to === ERROR_STATE) return `${cell} is empty${via}${eof}: state is the error state.`;
	return `${cell} = ${stateName(table, lk.to)}${via}${eof}, so state is ${stateName(table, lk.to)}.`;
}

function readText(ch: Ch, pos: number, before: number): string {
	if (ch === EOF) return 'getChar () returns EOF: the input is used up.';
	return `getChar () returns ${chText(ch)} and moves the input pointer from ${before} to ${pos}.`;
}

function ungetText(ch: Ch | undefined, pos: number): string {
	if (ch === undefined || ch === EOF)
		return `ungetChar (${chText(ch)}) has nothing to put back; the input pointer stays at ${pos}.`;
	return `ungetChar (${chText(ch)}) puts ${chText(ch)} back: the input pointer moves back to ${pos}.`;
}

/** Most characters one call reads before the trace gives up on a loop that cannot end. */
const readLimit = (input: string, start: number) => input.length - start + 3;

function traceFirst(
	table: DriverTable,
	input: string,
	start: number,
	skip: ReadonlySet<string>
): DriverCall {
	const t: Tracer = {
		steps: [],
		state: table.dfa.start,
		ch: undefined,
		pos: start,
		reach: start,
		lastAccept: null
	};
	const name = (s: StateId) => stateName(table, s);
	const push = (step: Omit<TraceStep, 'state' | 'ch' | 'pos'>) =>
		t.steps.push({ state: t.state, ch: t.ch, pos: t.pos, ...step });

	push({ line: 1, text: `state = start: state is ${name(t.state)}.` });
	let reads = 0;
	for (;;) {
		const s = t.state;
		const acc = s !== ERROR_STATE && table.accept[s];
		const err = s === ERROR_STATE || table.dead[s];
		if (acc) {
			push({ line: 6, reads: 'accept', text: `accept[${name(s)}] is true, so the loop ends.` });
			break;
		}
		if (err) {
			push({
				line: 6,
				reads: 'error',
				text:
					s === ERROR_STATE
						? 'error (state) is true for the error state, so the loop ends.'
						: `error (${name(s)}) is true: no accepting state can be reached from ${name(s)}, so the loop ends.`
			});
			break;
		}
		if (reads >= readLimit(input, start)) {
			push({ line: 6, text: 'The loop reads EOF without end; the trace stops here.' });
			t.state = ERROR_STATE;
			break;
		}
		push({
			line: 6,
			reads: 'accept',
			text: `accept[${name(s)}] is false and error (${name(s)}) is false, so the loop body runs.`
		});
		const before = t.pos;
		const r = getChar(input, t.pos);
		reads++;
		t.ch = r.ch;
		t.pos = r.pos;
		t.reach = Math.max(t.reach, t.pos);
		push({ line: 8, text: readText(r.ch, r.pos, before) });
		const lk = lookup(table, s, r.ch);
		t.state = lk.to;
		push({ line: 9, lookup: lk, text: lookupText(table, lk) });
	}

	const s = t.state;
	if (s !== ERROR_STATE && table.accept[s]) {
		push({ line: 11, reads: 'accept', text: `accept[${name(s)}] is true.` });
		if (table.retract[s]) {
			push({ line: 12, reads: 'retract', text: `retract[${name(s)}] is true.` });
			if (t.ch !== undefined && t.ch !== EOF) t.pos -= t.ch.length;
			push({ line: 13, text: ungetText(t.ch, t.pos) });
		} else {
			push({
				line: 12,
				reads: 'retract',
				text: `retract[${name(s)}] is false, so nothing is put back.`
			});
		}
		const token = tokenOf(table, s, input, start, t.pos, skip);
		const tok = table.token[s];
		push({
			line: 14,
			text:
				(tok
					? `tokenFor (${name(s)}) is ${tok}`
					: `${name(s)} names no token, so tokenFor (${name(s)}) is ${name(s)}`) +
				`: getToken () returns (${token.name}, ${lexemeText(token.lexeme)}).`,
			result: token
		});
		return { start, end: t.pos, steps: t.steps, token, reach: t.reach };
	}
	push({
		line: 11,
		reads: s === ERROR_STATE ? undefined : 'accept',
		text: s === ERROR_STATE ? 'The error state does not accept.' : `accept[${name(s)}] is false.`
	});
	const token = errorToken(input, start, t.pos);
	push({
		line: 16,
		text:
			token.lexeme === ''
				? 'handleError (): no token, and no input was read.'
				: `handleError (): no token. The characters read, ${lexemeText(token.lexeme)}, are an error; the next call starts at ${t.pos}.`,
		result: token
	});
	return { start, end: t.pos, steps: t.steps, token, reach: t.reach };
}

function traceLongest(
	table: DriverTable,
	input: string,
	start: number,
	skip: ReadonlySet<string>
): DriverCall {
	const t: Tracer = {
		steps: [],
		state: table.dfa.start,
		ch: undefined,
		pos: start,
		reach: start,
		lastAccept: null
	};
	const name = (s: StateId) => stateName(table, s);
	const push = (step: Omit<TraceStep, 'state' | 'ch' | 'pos' | 'lastAccept'>) =>
		t.steps.push({ state: t.state, ch: t.ch, pos: t.pos, lastAccept: t.lastAccept, ...step });

	push({ line: 1, text: `state = start: state is ${name(t.state)}.` });
	push({ line: 2, text: `begin = position (): ${start}.` });
	push({ line: 3, text: 'lastAccept = none: nothing has been accepted yet.' });
	let reads = 0;
	for (;;) {
		const s = t.state;
		const err = s === ERROR_STATE || table.dead[s];
		if (err) {
			push({
				line: 4,
				reads: 'error',
				text:
					s === ERROR_STATE
						? 'error (state) is true for the error state, so the loop ends.'
						: `error (${name(s)}) is true: no accepting state can be reached from ${name(s)}, so the loop ends.`
			});
			break;
		}
		if (reads >= readLimit(input, start)) {
			push({ line: 4, text: 'The loop reads EOF without end; the trace stops here.' });
			t.state = ERROR_STATE;
			break;
		}
		push({ line: 4, reads: 'error', text: `error (${name(s)}) is false, so the loop body runs.` });
		const before = t.pos;
		const r = getChar(input, t.pos);
		reads++;
		t.ch = r.ch;
		t.pos = r.pos;
		t.reach = Math.max(t.reach, t.pos);
		push({ line: 5, text: readText(r.ch, r.pos, before) });
		const lk = lookup(table, s, r.ch);
		t.state = lk.to;
		push({ line: 6, lookup: lk, text: lookupText(table, lk) });
		const n = t.state;
		if (n === ERROR_STATE || !table.accept[n]) {
			push({
				line: 7,
				reads: n === ERROR_STATE ? undefined : 'accept',
				text:
					n === ERROR_STATE ? 'The error state does not accept.' : `accept[${name(n)}] is false.`
			});
			continue;
		}
		push({ line: 7, reads: 'accept', text: `accept[${name(n)}] is true.` });
		if (table.retract[n]) {
			push({ line: 8, reads: 'retract', text: `retract[${name(n)}] is true.` });
			if (t.ch !== undefined && t.ch !== EOF) t.pos -= t.ch.length;
			push({ line: 9, text: ungetText(t.ch, t.pos) });
		} else {
			push({ line: 8, reads: 'retract', text: `retract[${name(n)}] is false.` });
		}
		t.lastAccept = { state: n, pos: t.pos };
		push({
			line: 10,
			text: `lastAccept = (${name(n)}, ${t.pos}): ${name(n)} accepts ${lexemeText(input.slice(start, t.pos))}.`
		});
	}

	const last = t.lastAccept;
	if (last) {
		push({ line: 13, text: `lastAccept is (${name(last.state)}, ${last.pos}).` });
		const from = t.pos;
		t.pos = last.pos;
		t.state = last.state;
		push({
			line: 14,
			text:
				from === last.pos
					? `resetTo (${last.pos}): the input pointer is already there.`
					: `resetTo (${last.pos}) moves the input pointer back from ${from} to ${last.pos}.`
		});
		const token = tokenOf(table, last.state, input, start, last.pos, skip);
		const tok = table.token[last.state];
		push({
			line: 15,
			text:
				(tok
					? `tokenFor (${name(last.state)}) is ${tok}`
					: `${name(last.state)} names no token, so tokenFor (${name(last.state)}) is ${name(last.state)}`) +
				`: getToken () returns (${token.name}, ${lexemeText(token.lexeme)}).`,
			result: token
		});
		return { start, end: last.pos, steps: t.steps, token, reach: t.reach };
	}
	push({ line: 13, text: 'lastAccept is none: no prefix of length 1 or more is accepted.' });
	const from = t.pos;
	t.pos = nextCharEnd(input, start);
	push({
		line: 17,
		text:
			from === t.pos
				? `resetTo (begin + 1): the input pointer is at ${t.pos}.`
				: `resetTo (begin + 1) moves the input pointer from ${from} to ${t.pos}.`
	});
	const token = errorToken(input, start, t.pos);
	push({
		line: 18,
		text: `handleError (): no token. ${lexemeText(token.lexeme)} is reported as an error; the next call starts at ${t.pos}.`,
		result: token
	});
	return { start, end: t.pos, steps: t.steps, token, reach: t.reach };
}

/** One call of getToken () starting at `start`. */
export function traceCall(
	table: DriverTable,
	input: string,
	start: number,
	mode: Mode,
	skip: ReadonlySet<string> = new Set()
): DriverCall {
	return mode === 'first'
		? traceFirst(table, input, start, skip)
		: traceLongest(table, input, start, skip);
}

export type CallSummary = Pick<DriverCall, 'start' | 'end' | 'token'>;

/** The getToken () calls over the whole input, without their steps. */
export interface DriverRun {
	/** Each call's start, end and token, in order. */
	calls: CallSummary[];
	/** A call returned without consuming input, so calling again would repeat it. */
	stalled: boolean;
	/** The read budget ran out before the end of the input. */
	truncated: boolean;
}

/**
 * Most characters `runCalls` reads in total. The longest match can reread the
 * rest of the input on every call, so this is well above the square of the
 * longest input the page keeps (2000 characters).
 */
export const MAX_RUN_READS = 5_000_000;

/**
 * Calls getToken () from position 0 until the input is used up or a call
 * makes no progress. Each call runs the same loop as `traceCall` (same end
 * and token) without recording steps; `traceCall` from a call's start gives
 * its steps.
 */
export function runCalls(
	table: DriverTable,
	input: string,
	mode: Mode,
	opts: { skip?: ReadonlySet<string>; maxReads?: number } = {}
): DriverRun {
	const skip = opts.skip ?? new Set<string>();
	let budget = opts.maxReads ?? MAX_RUN_READS;
	const columns = new Map<number, number | null>();
	/** T[from, cp]; cp = -1 is EOF. */
	const next = (from: StateId, cp: number): StateId => {
		let col = cp < 0 ? table.eofColumn : columns.get(cp);
		if (col === undefined) {
			const i = table.columns.findIndex((c) => c.set.has(cp));
			col = i < 0 ? null : i;
			columns.set(cp, col);
		}
		return col === null ? ERROR_STATE : table.T[from][col];
	};
	const accepts = (s: StateId) => s !== ERROR_STATE && table.accept[s];
	const stops = (s: StateId) => s === ERROR_STATE || table.dead[s];

	const call = (start: number): CallSummary | null => {
		const limit = readLimit(input, start);
		let state = table.dfa.start;
		let pos = start;
		/** Code units of the last character read; 0 for EOF (ungetChar (EOF) does nothing). */
		let width = 0;
		let reads = 0;
		let last: { state: StateId; pos: number } | null = null;
		for (;;) {
			if (mode === 'first' && accepts(state)) break;
			if (stops(state)) break;
			if (reads >= limit) {
				state = ERROR_STATE;
				break;
			}
			if (--budget < 0) return null;
			reads++;
			let cp = -1;
			width = 0;
			if (pos < input.length) {
				cp = input.codePointAt(pos)!;
				width = cp > 0xffff ? 2 : 1;
				pos += width;
			}
			state = next(state, cp);
			if (mode === 'longest' && accepts(state)) {
				if (table.retract[state]) pos -= width;
				last = { state, pos };
			}
		}
		if (mode === 'first') {
			if (!accepts(state)) return { start, end: pos, token: errorToken(input, start, pos) };
			if (table.retract[state]) pos -= width;
			return { start, end: pos, token: tokenOf(table, state, input, start, pos, skip) };
		}
		if (last) {
			const token = tokenOf(table, last.state, input, start, last.pos, skip);
			return { start, end: last.pos, token };
		}
		const end = nextCharEnd(input, start);
		return { start, end, token: errorToken(input, start, end) };
	};

	const calls: CallSummary[] = [];
	let pos = 0;
	while (pos < input.length) {
		const c = call(pos);
		if (!c) return { calls, stalled: false, truncated: true };
		calls.push(c);
		if (c.end <= pos) return { calls, stalled: true, truncated: false };
		pos = c.end;
	}
	return { calls, stalled: false, truncated: false };
}
