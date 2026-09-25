/**
 * The tool's state in the URL hash. The page saves the machine in the JSON
 * form of `codec.ts`; links from other tools send `LinkStates['automata']`
 * (`{ text, input? }`, the plain-text automaton format), which is accepted too.
 * A Text-tab draft that does not parse is saved next to the machine (`draft`),
 * so a reload or a copied link still shows it.
 */
import type { LinkStates } from '$lib/tools/links';
import type { Automaton, Positions } from '$lib/theory/automata/types';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	decodeMachine,
	decodePositions,
	encodeMachine,
	encodePositions,
	type MachineJson,
	type PositionsJson
} from './codec';
import { batchText } from './batch';
import type { AutomataPreset } from './presets';
import type { MissingMode } from './run';
import { checkAutomatonText } from './text-sync';

/** Longest machine text read from a link or a saved draft. */
export const MAX_TEXT_LENGTH = 100_000;

export const TABS = ['definition', 'table', 'text', 'challenges'] as const;
export type TabId = (typeof TABS)[number];

/** Everything but the machine: options, inputs, and the open tab. */
export interface ViewState {
	input: string;
	hideNames: boolean;
	showTrap: boolean;
	missing: MissingMode;
	closureStep: boolean;
	tab: TabId;
	batch: string;
	/** RE typed under "What language?". */
	guess: string;
	/** Selected "Build a DFA" challenge. */
	challenge: string;
	/** Id of the loaded preset, for its question and the check mark in the menu. */
	preset: string | null;
	startLabel: string;
}

export const DEFAULT_VIEW: ViewState = {
	input: '',
	hideNames: false,
	showTrap: false,
	missing: 'trap',
	closureStep: false,
	tab: 'definition',
	batch: '',
	guess: '',
	challenge: 'ends-00',
	preset: null,
	startLabel: ''
};

export type SavedState = Partial<ViewState> & {
	machine?: MachineJson;
	pos?: PositionsJson;
	/** Text-tab draft with errors (not applied to the machine). */
	draft?: string;
} & Partial<LinkStates['automata']>;

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** A saved state or a link: it must carry a machine (JSON) or automaton text. */
export function isSavedState(v: unknown): v is SavedState {
	if (!isObject(v)) return false;
	if (v.machine !== undefined) return decodeMachine(v.machine) !== null;
	return typeof v.text === 'string' && v.text.length <= MAX_TEXT_LENGTH;
}

export interface LoadedState {
	machine: Automaton | null;
	positions: Positions | null;
	view: ViewState;
	/** Link text or a saved draft that did not parse (shown in the Text tab with its diagnostics). */
	badText: { text: string; diagnostics: Diagnostic[] } | null;
}

function pick<K extends keyof ViewState>(
	v: Record<string, unknown>,
	key: K,
	ok: (x: unknown) => boolean
): ViewState[K] {
	return ok(v[key]) ? (v[key] as ViewState[K]) : DEFAULT_VIEW[key];
}

const isString = (x: unknown) => typeof x === 'string';
const isBool = (x: unknown) => typeof x === 'boolean';

/** Reads a validated hash value; fields that are missing or malformed get defaults. */
export function loadSaved(value: SavedState): LoadedState {
	const v = value as Record<string, unknown>;
	const view: ViewState = {
		input: pick(v, 'input', isString),
		hideNames: pick(v, 'hideNames', isBool),
		showTrap: pick(v, 'showTrap', isBool),
		missing: pick(v, 'missing', (x) => x === 'trap' || x === 'crash'),
		closureStep: pick(v, 'closureStep', isBool),
		tab: pick(v, 'tab', (x) => (TABS as readonly unknown[]).includes(x)),
		batch: pick(v, 'batch', isString),
		guess: pick(v, 'guess', isString),
		challenge: pick(v, 'challenge', isString),
		preset: pick(v, 'preset', (x) => x === null || typeof x === 'string'),
		startLabel: pick(v, 'startLabel', isString)
	};
	if (value.machine !== undefined) {
		const machine = decodeMachine(value.machine);
		const positions = machine ? decodePositions(value.pos, machine.states.length) : null;
		return { machine, positions, view, badText: machine ? savedDraft(value.draft) : null };
	}
	const text = value.text ?? '';
	const checked = checkAutomatonText(text);
	if (!checked.automaton)
		return {
			machine: null,
			positions: null,
			view: { ...view, tab: 'text' },
			badText: { text, diagnostics: checked.diagnostics }
		};
	return { machine: checked.automaton, positions: null, view, badText: null };
}

/** A saved draft, when it is text that still has errors. */
function savedDraft(draft: unknown): LoadedState['badText'] {
	if (typeof draft !== 'string' || draft.length > MAX_TEXT_LENGTH) return null;
	const { diagnostics } = checkAutomatonText(draft);
	return hasErrors(diagnostics) ? { text: draft, diagnostics } : null;
}

/** The value written to the hash; `draft` is a Text-tab draft that has errors. */
export function saveState(
	machine: Automaton,
	positions: Positions | null,
	view: ViewState,
	draft: string | null = null
): SavedState {
	const out: SavedState = {
		...view,
		machine: encodeMachine(machine),
		pos: encodePositions(machine, positions)
	};
	if (draft !== null && draft.length <= MAX_TEXT_LENGTH) out.draft = draft;
	return out;
}

/** The view a preset loads with (inputs from the slide, everything else reset). */
export function presetView(
	id: string,
	p: AutomataPreset,
	keep: Pick<ViewState, 'tab' | 'challenge' | 'guess'>
): ViewState {
	return {
		...DEFAULT_VIEW,
		...keep,
		input: p.input,
		hideNames: p.hideNames,
		batch: batchText(p.batch),
		preset: id,
		startLabel: p.startLabel ?? ''
	};
}
