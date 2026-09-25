/**
 * The TINY Machine tool's user-editable state, kept in the URL hash. No other
 * tool links here yet, so the hash holds this shape only.
 */
import { DEFAULT_PRESET_ID, presetById, type TinyVmPreset } from './presets';
import { MAX_TRACE } from './trace';
import type { Granularity } from './view';

export interface TinyVmState {
	/** TM program text. */
	program: string;
	/** Input queue text ("3", "5 12 30 0"). */
	input: string;
	/** Step by whole instructions or by fetch / decode / execute phases. */
	mode: Granularity;
	/** Position in the run, counted in phases from reset (see view.ts). */
	step: number;
	/** The preset last loaded, for its note. */
	preset: string | null;
}

/** What the hash may hold: missing fields take their defaults. */
export interface TinyVmHash {
	program: string;
	input?: string;
	mode?: Granularity;
	step?: number;
	preset?: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function isTinyVmHash(v: unknown): v is TinyVmHash {
	if (!isRecord(v) || typeof v.program !== 'string') return false;
	if (v.input !== undefined && typeof v.input !== 'string') return false;
	if (v.mode !== undefined && v.mode !== 'instruction' && v.mode !== 'phase') return false;
	if (v.step !== undefined && typeof v.step !== 'number') return false;
	if (v.preset !== undefined && v.preset !== null && typeof v.preset !== 'string') return false;
	return true;
}

export function normalizeState(v: TinyVmHash): TinyVmState {
	const step = typeof v.step === 'number' && Number.isFinite(v.step) ? Math.floor(v.step) : 0;
	return {
		program: v.program,
		input: v.input ?? '',
		mode: v.mode ?? 'instruction',
		step: Math.min(Math.max(0, step), 3 * MAX_TRACE),
		preset: presetById(v.preset) ? v.preset! : null
	};
}

export function stateFromPreset(p: TinyVmPreset, mode: Granularity = 'instruction'): TinyVmState {
	return { ...p.value, mode, step: 0, preset: p.id };
}

export function defaultState(): TinyVmState {
	return stateFromPreset(presetById(DEFAULT_PRESET_ID)!);
}
