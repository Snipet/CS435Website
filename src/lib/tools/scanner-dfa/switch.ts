/**
 * getToken () from Lexical Analysis IV, slides 17–19, exactly as printed (no
 * `break;` after the cases), and a small interpreter for this one program
 * with C semantics: `switch` jumps to the matching case label and runs on
 * through the following cases until a `break;` or the end of the switch;
 * getchar () takes pushed-back characters first (last pushed, first
 * returned); ungetc (EOF, stdin) does nothing.
 */
import { formatString, showChar } from '$lib/theory/chars';

export type LineId =
	| 'fn'
	| 'const'
	| 'init'
	| 'while'
	| 'getchar'
	| 'switch'
	| 'open'
	| 'case0'
	| 'if-lt'
	| 'set1'
	| 'if-eq'
	| 'set5'
	| 'if-gt'
	| 'set6'
	| 'set9'
	| 'break0'
	| 'case1'
	| 'c1-eq'
	| 'set2'
	| 'c1-gt'
	| 'set3'
	| 'c1-else'
	| 'c1-unget'
	| 'set4'
	| 'c1-close'
	| 'break1'
	| 'case6'
	| 'c6-eq'
	| 'set7'
	| 'c6-else'
	| 'c6-unget'
	| 'set8'
	| 'c6-close'
	| 'break6'
	| 'end-switch'
	| 'end-while'
	| 'ret2'
	| 'ret3'
	| 'ret4'
	| 'ret5'
	| 'ret7'
	| 'ret8'
	| 'err'
	| 'end';

export interface ProgramLine {
	id: LineId;
	text: string;
	/** A `break;` added by the toggle (not on the slides). */
	inserted?: boolean;
}

/** Slides 17–19, verbatim. */
export const GET_TOKEN: readonly ProgramLine[] = [
	{ id: 'fn', text: 'Token getToken () {' },
	{ id: 'const', text: '  const int ERROR_STATE = 9;' },
	{ id: 'init', text: '  int state = 0;' },
	{ id: 'while', text: '  while (state == 0 || state == 1 || state == 6) {' },
	{ id: 'getchar', text: '    int ch = getchar ();' },
	{ id: 'switch', text: '    switch (state)' },
	{ id: 'open', text: '    {' },
	{ id: 'case0', text: '    case 0:' },
	{ id: 'if-lt', text: "      if (ch == '<')" },
	{ id: 'set1', text: '        state = 1;' },
	{ id: 'if-eq', text: "      else if (ch == '=')" },
	{ id: 'set5', text: '        state = 5;' },
	{ id: 'if-gt', text: "      else if (ch == '>')" },
	{ id: 'set6', text: '        state = 6;' },
	{ id: 'set9', text: '      else state = ERROR_STATE;' },
	{ id: 'case1', text: '    case 1:' },
	{ id: 'c1-eq', text: "      if (ch == '=')" },
	{ id: 'set2', text: '        state = 2;' },
	{ id: 'c1-gt', text: "      else if (ch == '>')" },
	{ id: 'set3', text: '        state = 3;' },
	{ id: 'c1-else', text: '      else {' },
	{ id: 'c1-unget', text: '        ungetc (ch, stdin);' },
	{ id: 'set4', text: '        state = 4;' },
	{ id: 'c1-close', text: '      }' },
	{ id: 'case6', text: '    case 6:' },
	{ id: 'c6-eq', text: "      if (ch == '=')" },
	{ id: 'set7', text: '        state = 7;' },
	{ id: 'c6-else', text: '      else {' },
	{ id: 'c6-unget', text: '        ungetc (ch, stdin);' },
	{ id: 'set8', text: '        state = 8;' },
	{ id: 'c6-close', text: '      }' },
	{ id: 'end-switch', text: '    } // switch' },
	{ id: 'end-while', text: '  } // while' },
	{ id: 'ret2', text: '  if (state == 2)      return LE;' },
	{ id: 'ret3', text: '  else if (state == 3) return NE;' },
	{ id: 'ret4', text: '  else if (state == 4) return LT;' },
	{ id: 'ret5', text: '  else if (state == 5) return EQ;' },
	{ id: 'ret7', text: '  else if (state == 7) return GE;' },
	{ id: 'ret8', text: '  else if (state == 8) return GT;' },
	{ id: 'err', text: '  else error ();' },
	{ id: 'end', text: '}' }
];

/** Where the toggle adds `break;`: after the last statement of each case. */
const BREAK_AFTER: Partial<Record<LineId, LineId>> = {
	set9: 'break0',
	'c1-close': 'break1',
	'c6-close': 'break6'
};

/** The program as shown, with `break;` after each case when `breaks` is on. */
export function programLines(breaks: boolean): ProgramLine[] {
	const out: ProgramLine[] = [];
	for (const line of GET_TOKEN) {
		out.push(line);
		const b = BREAK_AFTER[line.id];
		if (breaks && b) out.push({ id: b, text: '      break;', inserted: true });
	}
	return out;
}

/** Inputs offered by the picker (relop lexemes, and lexemes followed by another character). */
export const SWITCH_INPUTS = ['<=', '<>', '<x', '=', '>=', '>a', 'x'] as const;
export type SwitchInput = (typeof SWITCH_INPUTS)[number];

/** A character value of `ch`, or null for EOF. */
export type CChar = string | null;

export interface SwitchStep {
	line: LineId;
	/** `state` after the step, or null before it is declared. */
	state: number | null;
	/** `ch` after the step; undefined before the first getchar (). */
	ch?: CChar;
	/** Characters taken from the input so far (the read position). */
	pos: number;
	/** ungetc pushback, oldest first; getchar () takes the last one. */
	pushback: string[];
	text: string;
	/** Second ungetc without a getchar () in between. */
	warning?: string;
	/** On the last step: the token returned, or 'error ()'. */
	returned?: string;
}

export interface SwitchTrace {
	steps: SwitchStep[];
	/** Token returned (LE, …, GT) or 'error ()'. */
	result: string;
	/** Pushback left when getToken () returns. */
	pushback: string[];
	/** Characters taken from the input. */
	pos: number;
	/** Successful ungetc calls. */
	ungetcs: number;
	/** Largest number of characters pushed back at once. */
	maxPushback: number;
}

export const PUSHBACK_WARNING =
	'Second ungetc without a getchar () in between: C guarantees only one character of pushback.';

const q = (ch: CChar | undefined) =>
	ch === undefined ? '—' : ch === null ? 'EOF' : `'${showChar(ch, 'quoted')}'`;

const TOKENS: [number, LineId, string][] = [
	[2, 'ret2', 'LE'],
	[3, 'ret3', 'NE'],
	[4, 'ret4', 'LT'],
	[5, 'ret5', 'EQ'],
	[7, 'ret7', 'GE'],
	[8, 'ret8', 'GT']
];

/** Loop iterations before the interpreter gives up (the program never needs more than the input length + 1). */
const MAX_ITERATIONS = 64;

/** Runs getToken () on `input`, one step per statement. */
export function runGetToken(input: string, breaks: boolean): SwitchTrace {
	const steps: SwitchStep[] = [];
	let state: number | null = null;
	let ch: CChar | undefined;
	let pos = 0;
	const pushback: string[] = [];
	let ungetsSinceRead = 0;
	let ungetcs = 0;
	let maxPushback = 0;

	const emit = (line: LineId, text: string, extra: Partial<SwitchStep> = {}) =>
		steps.push({ line, state, ch, pos, pushback: [...pushback], text, ...extra });
	const test = (c: string) => `ch is ${q(ch)}: ch == ${q(c)} is ${ch === c ? 'true' : 'false'}.`;
	const set = (line: LineId, value: number, text?: string) => {
		state = value;
		emit(line, text ?? `state = ${value}.`);
	};
	const ungetc = (line: LineId) => {
		if (ch === null || ch === undefined) {
			emit(line, 'ungetc (EOF, stdin) does nothing: EOF cannot be pushed back.');
			return;
		}
		pushback.push(ch);
		ungetcs++;
		ungetsSinceRead++;
		maxPushback = Math.max(maxPushback, pushback.length);
		const text = `ungetc (${q(ch)}, stdin) pushes ${q(ch)} back; the next getchar () returns it.`;
		if (ungetsSinceRead >= 2) emit(line, text, { warning: PUSHBACK_WARNING });
		else emit(line, text);
	};

	emit('const', 'ERROR_STATE is 9.');
	state = 0;
	emit('init', 'state = 0.');

	for (let iteration = 0; ; iteration++) {
		const s: number = state;
		const loop = s === 0 || s === 1 || s === 6;
		emit(
			'while',
			loop
				? `state is ${s}, so state == 0 || state == 1 || state == 6 is true: the loop body runs.`
				: `state is ${s}, so state == 0 || state == 1 || state == 6 is false: the loop ends.`
		);
		if (!loop || iteration >= MAX_ITERATIONS) break;

		if (pushback.length > 0) {
			ch = pushback.pop()!;
			ungetsSinceRead = 0;
			emit('getchar', `getchar () returns ${q(ch)} from the pushback.`);
		} else if (pos < input.length) {
			const c = String.fromCodePoint(input.codePointAt(pos)!);
			ch = c;
			pos += c.length;
			ungetsSinceRead = 0;
			emit('getchar', `getchar () reads ${q(ch)} from the input.`);
		} else {
			ch = null;
			ungetsSinceRead = 0;
			emit('getchar', 'getchar () returns EOF: the input is used up.');
		}

		const entry = s;
		emit('switch', `switch (state): state is ${entry}, so execution jumps to case ${entry}.`);
		let running = false;

		// case 0
		if (entry === 0) running = true;
		if (running) {
			emit('if-lt', test('<'));
			if (ch === '<') set('set1', 1);
			else {
				emit('if-eq', test('='));
				if (ch === '=') set('set5', 5);
				else {
					emit('if-gt', test('>'));
					if (ch === '>') set('set6', 6);
					else set('set9', 9, 'No test matched: state = ERROR_STATE, which is 9.');
				}
			}
			if (breaks) {
				emit('break0', `break leaves the switch; state is ${state}.`);
				continue;
			}
		}

		// case 1
		if (entry === 1) running = true;
		else if (running)
			emit('case1', `No break before case 1: execution continues into case 1 with ch = ${q(ch)}.`);
		if (running) {
			emit('c1-eq', test('='));
			if (ch === '=') set('set2', 2);
			else {
				emit('c1-gt', test('>'));
				if (ch === '>') set('set3', 3);
				else {
					ungetc('c1-unget');
					set('set4', 4);
				}
			}
			if (breaks) {
				emit('break1', `break leaves the switch; state is ${state}.`);
				continue;
			}
		}

		// case 6
		if (entry === 6) running = true;
		else if (running)
			emit('case6', `No break before case 6: execution continues into case 6 with ch = ${q(ch)}.`);
		if (running) {
			emit('c6-eq', test('='));
			if (ch === '=') set('set7', 7);
			else {
				ungetc('c6-unget');
				set('set8', 8);
			}
			if (breaks) {
				emit('break6', `break leaves the switch; state is ${state}.`);
				continue;
			}
		}
		emit('end-switch', `End of the switch; state is ${state}. Back to the loop condition.`);
	}

	let result = 'error ()';
	const final: number = state;
	let matched = false;
	for (const [value, line, token] of TOKENS) {
		if (final === value) {
			result = token;
			emit(line, `state == ${value} is true: getToken () returns ${token}.`, { returned: token });
			matched = true;
			break;
		}
		emit(line, `state == ${value} is false.`);
	}
	if (!matched) {
		emit('err', `state is ${final}: no test matched, so error () is called.`, {
			returned: 'error ()'
		});
	}
	return { steps, result, pushback: [...pushback], pos, ungetcs, maxPushback };
}

/** `"<<"` style text for a pushback stack (oldest first), or "empty". */
export function pushbackText(pushback: readonly string[]): string {
	return pushback.length === 0 ? 'empty' : formatString(pushback.join(''));
}
