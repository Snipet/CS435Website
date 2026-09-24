/**
 * The T-diagram tool's user-editable state, kept in the URL hash: the toolbox,
 * the language facts, the goal, the composition on the bench, the
 * walkthrough step, and the retargetable architecture's languages and
 * targets. No other tool links here yet, so the hash holds only this shape.
 */
import { MAX_LABEL, normalizeLang } from './labels';
import { sameT, type SubsetDecl, type TDiagram } from './model';
import {
	presets,
	DEFAULT_PRESET_ID,
	type TDiagramsPreset,
	type TDiagramsPresetValue
} from './presets';
import { SLIDE_LANGUAGES, SLIDE_TARGETS, sanitizeEnds } from './architecture';

/** Most diagrams the toolbox holds. */
export const MAX_TOOLBOX = 12;
/** Most subset declarations. */
export const MAX_SUBSETS = 8;
/** Longest "run directly" list, in characters. */
export const MAX_RUNNABLE_TEXT = 120;

export interface ToolboxItem extends TDiagram {
	/** Stable key; not shown. */
	id: string;
}

export interface TDiagramsState {
	toolbox: ToolboxItem[];
	subsets: SubsetDecl[];
	/** Comma-separated languages that run directly. */
	runnable: string;
	goal: TDiagram | null;
	/** The pair on the bench (toolbox ids), legal or not. */
	compose: { program: string; translator: string } | null;
	/** Which walkthrough is shown (slide 8), if any. */
	guide: 'bootstrap' | null;
	/** Walkthrough step (0-based). */
	step: number;
	/** Retargetable architecture (slide 6). */
	languages: string[];
	targets: string[];
}

/** The next unused id: t1, t2, … */
export function nextId(toolbox: readonly { id: string }[]): string {
	let max = 0;
	for (const { id } of toolbox) {
		const m = /^t(\d+)$/.exec(id);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `t${max + 1}`;
}

/** Gives each diagram an id: t1, t2, … in order. */
export function withIds(diagrams: readonly TDiagram[]): ToolboxItem[] {
	return diagrams.map((d, i) => ({
		id: `t${i + 1}`,
		source: d.source,
		target: d.target,
		host: d.host
	}));
}

/** The workbench part of a preset as state; the architecture is kept as given. */
export function stateFromPreset(
	value: TDiagramsPresetValue,
	arch: { languages: readonly string[]; targets: readonly string[] } = {
		languages: SLIDE_LANGUAGES,
		targets: SLIDE_TARGETS
	}
): TDiagramsState {
	return {
		toolbox: withIds(value.toolbox),
		subsets: value.subsets.map((d) => ({ sub: d.sub, sup: d.sup })),
		runnable: value.runnable,
		goal: value.goal ? { ...value.goal } : null,
		compose: null,
		guide: value.guide,
		step: 0,
		languages: [...arch.languages],
		targets: [...arch.targets]
	};
}

const defaultPreset = presets.find((p) => p.id === DEFAULT_PRESET_ID)!;

/** Bootstrapping (slide 8) with slide 6's architecture. */
export function defaultState(): TDiagramsState {
	return stateFromPreset(defaultPreset.value);
}

/** What the hash may hold: a saved view; missing fields take their defaults. */
export interface TDiagramsHash {
	toolbox: { id?: string; source: string; target: string; host: string }[];
	subsets?: SubsetDecl[];
	runnable?: string | string[];
	goal?: TDiagram | null;
	compose?: { program: string; translator: string } | null;
	guide?: 'bootstrap' | null;
	step?: number;
	languages?: string[];
	targets?: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isDiagram = (v: unknown): v is TDiagram =>
	isRecord(v) &&
	typeof v.source === 'string' &&
	typeof v.target === 'string' &&
	typeof v.host === 'string';

const isToolboxEntry = (v: unknown): boolean =>
	isDiagram(v) &&
	((v as { id?: unknown }).id === undefined || typeof (v as { id?: unknown }).id === 'string');

const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Accepts the saved shape with the right types; extra fields are ignored. */
export function isTDiagramsHash(value: unknown): value is TDiagramsHash {
	if (!isRecord(value)) return false;
	const { toolbox, subsets, runnable, goal, compose, guide, step, languages, targets } = value;
	if (!Array.isArray(toolbox) || !toolbox.every(isToolboxEntry)) return false;
	if (
		subsets !== undefined &&
		!(
			Array.isArray(subsets) &&
			subsets.every((d) => isRecord(d) && typeof d.sub === 'string' && typeof d.sup === 'string')
		)
	) {
		return false;
	}
	if (runnable !== undefined && typeof runnable !== 'string' && !isStringArray(runnable)) {
		return false;
	}
	if (goal !== undefined && goal !== null && !isDiagram(goal)) return false;
	if (
		compose !== undefined &&
		compose !== null &&
		!(
			isRecord(compose) &&
			typeof compose.program === 'string' &&
			typeof compose.translator === 'string'
		)
	) {
		return false;
	}
	if (guide !== undefined && guide !== null && guide !== 'bootstrap') return false;
	if (step !== undefined && !(typeof step === 'number' && Number.isInteger(step) && step >= 0)) {
		return false;
	}
	if (languages !== undefined && !isStringArray(languages)) return false;
	if (targets !== undefined && !isStringArray(targets)) return false;
	return true;
}

const clip = (s: string, n: number) => [...s].slice(0, n).join('');
const clipT = (t: TDiagram): TDiagram => ({
	source: clip(t.source, MAX_LABEL),
	target: clip(t.target, MAX_LABEL),
	host: clip(t.host, MAX_LABEL)
});

/** The state a hash value describes, within the tool's limits. */
export function stateFromHash(value: TDiagramsHash): TDiagramsState {
	const items = value.toolbox.slice(0, MAX_TOOLBOX);
	// Keep well-formed ids (first use wins); give the rest fresh ones.
	const used = new Set<string>();
	const kept = items.map((t) => {
		const ok = typeof t.id === 'string' && /^t\d+$/.test(t.id) && !used.has(t.id);
		if (ok) used.add(t.id!);
		return ok ? t.id! : null;
	});
	const toolbox: ToolboxItem[] = items.map((t, i) => {
		const id = kept[i] ?? nextId([...used].map((x) => ({ id: x })));
		used.add(id);
		return { id, ...clipT(t) };
	});
	const ids = new Set(toolbox.map((t) => t.id));
	const compose =
		value.compose && ids.has(value.compose.program) && ids.has(value.compose.translator)
			? { program: value.compose.program, translator: value.compose.translator }
			: null;
	const runnable = Array.isArray(value.runnable)
		? value.runnable.join(', ')
		: (value.runnable ?? '');
	return {
		toolbox,
		subsets: (value.subsets ?? [])
			.slice(0, MAX_SUBSETS)
			.map((d) => ({ sub: clip(d.sub, MAX_LABEL), sup: clip(d.sup, MAX_LABEL) })),
		runnable: clip(runnable, MAX_RUNNABLE_TEXT),
		goal: value.goal ? clipT(value.goal) : null,
		compose,
		guide: value.guide === 'bootstrap' ? 'bootstrap' : null,
		step: value.step ?? 0,
		languages: sanitizeEnds(value.languages, SLIDE_LANGUAGES),
		targets: sanitizeEnds(value.targets, SLIDE_TARGETS)
	};
}

const sameSubsets = (a: readonly SubsetDecl[], b: readonly SubsetDecl[]) =>
	a.length === b.length &&
	a.every(
		(d, i) =>
			normalizeLang(d.sub) === normalizeLang(b[i].sub) &&
			normalizeLang(d.sup) === normalizeLang(b[i].sup)
	);

const sameRunnable = (a: string, b: string) => {
	const set = (s: string) => s.split(/[,;]/).map(normalizeLang).filter(Boolean).sort().join(',');
	return set(a) === set(b);
};

/** The preset whose toolbox, facts and goal the state shows, if any. */
export function matchPreset(
	state: Pick<TDiagramsState, 'toolbox' | 'subsets' | 'runnable' | 'goal'>,
	list: readonly TDiagramsPreset[] = presets
): TDiagramsPreset | undefined {
	return list.find((p) => {
		const v = p.value;
		if (v.toolbox.length !== state.toolbox.length) return false;
		if (!v.toolbox.every((t, i) => sameT(t, state.toolbox[i]))) return false;
		if (!sameSubsets(v.subsets, state.subsets)) return false;
		if (!sameRunnable(v.runnable, state.runnable)) return false;
		if (!v.goal || !state.goal) return !v.goal && !state.goal;
		return sameT(v.goal, state.goal);
	});
}
