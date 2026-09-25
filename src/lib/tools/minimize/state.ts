/**
 * The page's state, kept in the URL hash. It also accepts the link shape other
 * tools send (`LinkStates['minimize']` in $lib/tools/links.ts).
 */
import type { LinkStates } from '$lib/tools/links';

export type Source = 're' | 'rules' | 'dfa';

export interface MinimizeState {
	from: Source;
	/** Lecture-notation RE (from: 're'). */
	re: string;
	/** Regular definitions, one `name = RE` per line (from: 're' and 'rules'). */
	defs: string;
	/** Token rules, one `Name = RE` per line in priority order (from: 'rules'). */
	rules: string;
	/** Automaton text (from: 'dfa'). */
	text: string;
	/** Keep accepting states that report different tokens apart. */
	byToken: boolean;
	/** Current step of the refinement (round index). */
	round: number;
	/** Names of the two states compared by the pair check ('' = default). */
	p: string;
	q: string;
}

/** The starting point every loaded value is laid over. */
export const BLANK: MinimizeState = {
	from: 're',
	re: '',
	defs: '',
	rules: '',
	text: '',
	byToken: true,
	round: 0,
	p: '',
	q: ''
};

const SOURCES: readonly Source[] = ['re', 'rules', 'dfa'];

type Saved = Partial<MinimizeState> & Pick<MinimizeState, 'from'>;

// Compile-time check: every link shape other tools send is a valid saved value.
type Accepts<T extends Saved> = T;
export type MinimizeLink = Accepts<LinkStates['minimize']>;

const optional = (v: Record<string, unknown>, key: string, type: 'string' | 'boolean') =>
	v[key] === undefined || typeof v[key] === type;

/** Accepts the page's saved state and the cross-tool link shapes. */
export function isSavedState(value: unknown): value is Saved {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	if (!SOURCES.includes(v.from as Source)) return false;
	const main = v.from === 're' ? 're' : v.from === 'dfa' ? 'text' : 'rules';
	if (typeof v[main] !== 'string') return false;
	for (const key of ['re', 'defs', 'rules', 'text', 'p', 'q'])
		if (!optional(v, key, 'string')) return false;
	if (!optional(v, 'byToken', 'boolean')) return false;
	if (v.round !== undefined && !(Number.isInteger(v.round) && (v.round as number) >= 0))
		return false;
	return true;
}

/** A complete state from a saved or linked value; missing fields take their blank values. */
export function fromSaved(value: Saved): MinimizeState {
	const out: MinimizeState = { ...BLANK };
	for (const key of Object.keys(BLANK) as (keyof MinimizeState)[]) {
		const v = value[key];
		if (v !== undefined) (out as unknown as Record<string, unknown>)[key] = v;
	}
	return out;
}

/** The fields that define the machine (for comparing with presets). */
export function inputKey(
	s: Pick<MinimizeState, 'from' | 're' | 'defs' | 'rules' | 'text'>
): string {
	const norm = (t: string) => t.replace(/\r\n?/g, '\n').trim();
	switch (s.from) {
		case 're':
			return JSON.stringify(['re', s.re.trim(), norm(s.defs)]);
		case 'rules':
			return JSON.stringify(['rules', norm(s.rules), norm(s.defs)]);
		case 'dfa':
			return JSON.stringify(['dfa', norm(s.text)]);
	}
}
