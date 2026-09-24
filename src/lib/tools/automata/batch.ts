/**
 * Batch runs: one input string per line, each accepted or rejected.
 *
 * A line holding just `""` is the empty string; a line wrapped in double
 * quotes is read with the escapes \" \\ \t \n; any other line is taken
 * literally. Blank lines are skipped.
 */
import { analyzeDeterminism, complete } from '$lib/theory/automata/core';
import { runDfa, runNfa } from '$lib/theory/automata/simulate';
import type { Automaton } from '$lib/theory/automata/types';
import { hasStates, quoteSymbol, stateName, stateSetText } from './model';
import type { MissingMode } from './run';

export const MAX_BATCH_LINES = 200;
export const MAX_BATCH_LENGTH = 2000;

export interface BatchLine {
	/** 1-based line number in the text. */
	line: number;
	input: string;
}

const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', t: '\t', n: '\n', r: '\r' };

function unquote(body: string): string {
	let out = '';
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '\\' && i + 1 < body.length && ESCAPES[body[i + 1]] !== undefined) {
			out += ESCAPES[body[++i]];
		} else out += ch;
	}
	return out;
}

export function parseBatch(text: string): { lines: BatchLine[]; truncated: boolean } {
	const lines: BatchLine[] = [];
	let truncated = false;
	text.split('\n').forEach((raw, i) => {
		const t = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (t === '') return;
		if (lines.length >= MAX_BATCH_LINES) {
			truncated = true;
			return;
		}
		const quoted = t.length >= 2 && t.startsWith('"') && t.endsWith('"');
		const input = quoted ? unquote(t.slice(1, -1)) : t;
		if (input.length > MAX_BATCH_LENGTH) {
			truncated = true;
			return;
		}
		lines.push({ line: i + 1, input });
	});
	return { lines, truncated };
}

/** Text for a list of strings, one per line, with `""` for the empty string. */
export function batchText(strings: readonly string[]): string {
	return strings.map((s) => (s === '' ? '""' : s)).join('\n');
}

export interface BatchResult extends BatchLine {
	accepted: boolean;
	/** Where the run ended: "ends in C", "ends in { A, C }", "no transition from B on '1'". */
	detail: string;
}

export function runBatch(
	a: Automaton,
	lines: readonly BatchLine[],
	opts: { missing?: MissingMode } = {}
): BatchResult[] {
	if (!hasStates(a)) return [];
	const kind = analyzeDeterminism(a).kind;
	if (kind === 'nfa')
		return lines.map((l) => {
			const run = runNfa(a, l.input);
			const final = run.steps[run.steps.length - 1].active;
			return { ...l, accepted: run.accepted, detail: `ends in ${stateSetText(a, final)}` };
		});
	const trapMode = kind === 'partial-dfa' && (opts.missing ?? 'trap') === 'trap';
	const m = trapMode ? complete(a).automaton : a;
	return lines.map((l) => {
		const run = runDfa(m, l.input);
		if (run.outcome === 'stuck') {
			const from = run.steps[run.steps.length - 2].state!;
			const ch = run.steps[run.steps.length - 1].char!;
			return {
				...l,
				accepted: false,
				detail: `no transition from ${stateName(m, from)} on ${quoteSymbol(ch)}`
			};
		}
		const end = run.steps[run.steps.length - 1].state!;
		const trap = m.states[end].trap;
		return {
			...l,
			accepted: run.accepted,
			detail: trap ? 'ends in the trap state' : `ends in ${stateName(m, end)}`
		};
	});
}
