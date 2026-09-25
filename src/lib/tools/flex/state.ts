/**
 * The Flex Playground's URL state. It accepts `LinkStates['flex']`
 * ({ spec, input }) from other tools; the other fields are optional.
 */
import type { LinkStates } from '$lib/tools/links';
import { DEFAULT_PRESET_ID, presetById } from './presets';

export type FlexView = 'run' | 'step' | 'rules';

export type FlexState = LinkStates['flex'] & {
	/** Preset the spec came from (for its sample inputs), or null. */
	preset?: string | null;
	view?: FlexView;
	/** Step index in the step view. */
	step?: number;
};

const VIEWS: readonly FlexView[] = ['run', 'step', 'rules'];

export function isFlexState(v: unknown): v is FlexState {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
	const o = v as Record<string, unknown>;
	if (typeof o.spec !== 'string' || typeof o.input !== 'string') return false;
	if (o.preset !== undefined && o.preset !== null && typeof o.preset !== 'string') return false;
	if (o.view !== undefined && !VIEWS.includes(o.view as FlexView)) return false;
	if (
		o.step !== undefined &&
		(typeof o.step !== 'number' || !Number.isInteger(o.step) || o.step < 0)
	)
		return false;
	return true;
}

export function defaultState(): Required<FlexState> {
	const preset = presetById(DEFAULT_PRESET_ID)!;
	return {
		spec: preset.value.spec,
		input: preset.value.inputs[0].value,
		preset: preset.id,
		view: 'run',
		step: 0
	};
}

/** A loaded hash: missing fields take their defaults; a link without `preset` has none. */
export function fromLink(v: FlexState): Required<FlexState> {
	return {
		spec: v.spec,
		input: v.input,
		preset: v.preset && presetById(v.preset) ? v.preset : null,
		view: v.view ?? 'run',
		step: v.step ?? 0
	};
}
