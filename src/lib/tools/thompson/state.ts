/**
 * The Thompson tool's user-editable state, kept in the URL hash. It accepts
 * the cross-tool link shape `LinkStates['thompson']` ({ re, defs? }) as well
 * as its own saved shape, which adds the step being shown.
 */
import type { LinkStates } from '$lib/tools/links';

export interface ThompsonState {
	/** Regular expression in lecture notation. */
	re: string;
	/** Regular definitions, one `name = RE` per line. */
	defs: string;
	/** Step index being shown (0-based); null shows the last step, the finished NFA. */
	step: number | null;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type ThompsonHash = LinkStates['thompson'] & { step?: number | null };

export const DEFAULT_STATE: ThompsonState = { re: '(1 | 0)*1', defs: '', step: null };

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts `{ re, defs?, step? }` with the right types; extra fields are ignored. */
export function isThompsonHash(value: unknown): value is ThompsonHash {
	if (!isRecord(value)) return false;
	if (typeof value.re !== 'string') return false;
	if (value.defs !== undefined && typeof value.defs !== 'string') return false;
	const step = value.step;
	if (step !== undefined && step !== null) {
		if (typeof step !== 'number' || !Number.isInteger(step) || step < 0) return false;
	}
	return true;
}

/** The state a hash value describes (missing fields take their defaults). */
export function stateFromHash(value: ThompsonHash): ThompsonState {
	return {
		re: value.re,
		defs: value.defs ?? '',
		step: typeof value.step === 'number' ? value.step : null
	};
}
