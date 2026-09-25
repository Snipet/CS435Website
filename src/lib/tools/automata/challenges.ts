/**
 * Challenges: "What language?" (type an RE for the machine) and "Build a DFA"
 * (draw a machine for a description; it is checked against a reference RE).
 */
import type { Citation } from '$lib/lectures';
import { formatString } from '$lib/theory/chars';
import { alphabetOf, analyzeDeterminism } from '$lib/theory/automata/core';
import { regexToNfa } from '$lib/theory/automata/language';
import type { Automaton } from '$lib/theory/automata/types';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import { containsAny, symbolsOf } from '$lib/theory/regex/analyze';
import type { Regex } from '$lib/theory/regex/ast';
import { parseRegex } from '$lib/theory/regex/lecture';
import { compareBounded, estimateNfaSize } from './compare';
import { hasStates } from './model';

/** Largest reference NFA the checks build. */
export const MAX_REGEX_STATES = 2000;

export interface BuildChallenge {
	id: string;
	title: string;
	/** Σ in set notation, as stated with the task. */
	alphabet: string;
	/** Lecture-notation RE for the language (kept out of sight until solved). */
	regex: string;
	cite?: Citation;
}

export const BUILD_CHALLENGES: readonly BuildChallenge[] = [
	{
		id: 'exactly-1',
		title: 'Accepts exactly the string 1',
		alphabet: '{ 1 }',
		regex: '1',
		cite: { deck: '06', slide: 6 }
	},
	{
		id: 'ones-then-0',
		title: 'Any number of 1-s followed by a single 0',
		alphabet: '{ 0, 1 }',
		regex: '1*0',
		cite: { deck: '06', slide: 7 }
	},
	{
		id: 'ends-00',
		title: 'Strings over { 0, 1 } ending in 00',
		alphabet: '{ 0, 1 }',
		regex: '(0 | 1)*00',
		cite: { deck: '06', slide: 8 }
	},
	{
		id: 'third-from-end',
		title: 'Third symbol from the end is 1',
		alphabet: '{ 0, 1 }',
		regex: '(0 | 1)* 1 (0|1)^2',
		cite: { deck: '06', slide: 16 }
	},
	{
		id: 'even-zeros',
		title: 'An even number of 0s',
		alphabet: '{ 0, 1 }',
		regex: '(1 | 0 1* 0)*'
	},
	{
		id: 'contains-101',
		title: 'Contains 101',
		alphabet: '{ 0, 1 }',
		regex: '(0 | 1)* 101 (0 | 1)*'
	}
];

export function challengeById(id: string): BuildChallenge | undefined {
	return BUILD_CHALLENGES.find((c) => c.id === id);
}

/** Thompson NFA for `r`, with Σ read as the machine's alphabet plus the RE's own symbols. */
function nfaFor(r: Regex, machine: Automaton): Automaton | null {
	if (estimateNfaSize(r, MAX_REGEX_STATES + 1) > MAX_REGEX_STATES) return null;
	const alphabet = containsAny(r) ? alphabetOf(machine).union(symbolsOf(r)) : undefined;
	return regexToNfa(r, alphabet ? { alphabet } : {});
}

export type GuessResult =
	| { kind: 'empty' }
	| { kind: 'invalid'; diagnostics: Diagnostic[] }
	| { kind: 'no-machine'; diagnostics: Diagnostic[] }
	| { kind: 'too-large'; diagnostics: Diagnostic[] }
	| { kind: 'same'; diagnostics: Diagnostic[] }
	| {
			kind: 'differ';
			diagnostics: Diagnostic[];
			/** Shortest string accepted by the machine but not in L(R). */
			onlyMachine: string | null;
			/** Shortest string in L(R) the machine does not accept. */
			onlyRegex: string | null;
	  };

/** "What language?": compares L(R) for the typed RE with L(M). */
export function checkGuess(machine: Automaton, text: string): GuessResult {
	if (text.trim() === '') return { kind: 'empty' };
	const parsed = parseRegex(text);
	if (!parsed.ok || hasErrors(parsed.diagnostics))
		return { kind: 'invalid', diagnostics: parsed.diagnostics };
	const diagnostics = parsed.diagnostics;
	if (!hasStates(machine)) return { kind: 'no-machine', diagnostics };
	const nfa = nfaFor(parsed.regex, machine);
	if (!nfa) return { kind: 'too-large', diagnostics };
	const cmp = compareBounded(machine, nfa);
	if (cmp.kind === 'too-large') return { kind: 'too-large', diagnostics };
	if (cmp.kind === 'same') return { kind: 'same', diagnostics };
	return { kind: 'differ', diagnostics, onlyMachine: cmp.onlyA, onlyRegex: cmp.onlyB };
}

export type BuildResult =
	| { kind: 'no-machine' }
	| { kind: 'too-large' }
	| {
			kind: 'checked';
			correct: boolean;
			/** The first string the machine gets wrong. */
			witness: string | null;
			/** Whether `witness` is in the language (so the machine should accept it). */
			shouldAccept: boolean;
			determinism: 'dfa' | 'partial-dfa' | 'nfa';
	  };

/** "Build a DFA": the drawing against the challenge's reference RE. */
export function checkBuild(machine: Automaton, challenge: BuildChallenge): BuildResult {
	if (!hasStates(machine)) return { kind: 'no-machine' };
	const parsed = parseRegex(challenge.regex);
	if (!parsed.ok) throw new Error(`Challenge ${challenge.id}: invalid reference RE`);
	const nfa = nfaFor(parsed.regex, machine);
	if (!nfa) return { kind: 'too-large' };
	const cmp = compareBounded(machine, nfa);
	if (cmp.kind === 'too-large') return { kind: 'too-large' };
	const determinism = analyzeDeterminism(machine).kind;
	if (cmp.kind === 'same')
		return { kind: 'checked', correct: true, witness: null, shouldAccept: false, determinism };
	// Report whichever mistake comes first in shortlex order.
	const first = shortlexFirst(cmp.onlyA, cmp.onlyB);
	return {
		kind: 'checked',
		correct: false,
		witness: first,
		shouldAccept: first === cmp.onlyB,
		determinism
	};
}

function shortlexFirst(x: string | null, y: string | null): string | null {
	if (x === null) return y;
	if (y === null) return x;
	return shortlexCompare(x, y) <= 0 ? x : y;
}

/** The part of a "What language?" message after the quoted string. */
export function guessTail(inMachine: boolean): string {
	return inMachine
		? ' is accepted by the machine but is not in L(R).'
		: ' is in L(R) but is not accepted by the machine.';
}

/** "\"110\" is accepted by the machine but is not in L(R)." and its converse. */
export function guessMessage(witness: string, inMachine: boolean): string {
	return formatString(witness) + guessTail(inMachine);
}

/** The part of a "Build a DFA" message after the quoted string. */
export function buildTail(shouldAccept: boolean): string {
	return shouldAccept
		? ' is in the language, but the machine rejects it.'
		: ' is not in the language, but the machine accepts it.';
}

export function buildMessage(witness: string, shouldAccept: boolean): string {
	return formatString(witness) + buildTail(shouldAccept);
}

/** Shortlex order: shorter strings first, then by code point. */
export function shortlexCompare(x: string, y: string): number {
	const cx = [...x];
	const cy = [...y];
	if (cx.length !== cy.length) return cx.length - cy.length;
	for (let i = 0; i < cx.length; i++) {
		const d = cx[i].codePointAt(0)! - cy[i].codePointAt(0)!;
		if (d !== 0) return d;
	}
	return 0;
}
