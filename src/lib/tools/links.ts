/**
 * Cross-tool links. Each tool accepts the state shape listed here in its URL
 * hash (its own saved state may add fields), so any tool can open another one
 * on a specific example: "Open in Thompson's construction", "Minimize this
 * DFA", and so on.
 */
import { encode } from '$lib/url-state';
import { toolHref } from '$lib/site';
import { toolBySlug } from './registry';

/** Rule rows shared by the scanner tools. */
export interface RuleState {
	name: string;
	/** Lecture-notation RE; may use the helper definitions. */
	re: string;
	/** Matched, then dropped (e.g. Whitespace). */
	drop?: boolean;
}

export interface LinkStates {
	regex: {
		re: string;
		defs?: string;
		dialect?: 'lecture' | 'flex';
		alphabet?: string;
		tests?: string[];
		compare?: string;
	};
	/** `text` uses the automaton text format (formatAutomatonText). */
	automata: { text: string; input?: string };
	thompson: { re: string; defs?: string };
	subset: { from: 're'; re: string; defs?: string } | { from: 'nfa'; text: string };
	minimize: { from: 're'; re: string; defs?: string } | { from: 'dfa'; text: string };
	lexer: { defs?: string; rules: RuleState[]; input: string; errorRule?: boolean };
	'scanner-dfa': { defs?: string; rules: RuleState[]; input: string };
	flex: { spec: string; input: string };
}

export type LinkSlug = keyof LinkStates;

/**
 * URL of `slug` opened on `state`, or null when that tool is not part of the
 * site (so callers can hide the link rather than point at a missing page).
 */
export function toolLink<S extends LinkSlug>(slug: S, state: LinkStates[S]): string | null {
	if (!toolBySlug(slug)) return null;
	return `${toolHref(slug)}#${encode(state)}`;
}
