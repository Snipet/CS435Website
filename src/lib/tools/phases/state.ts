/**
 * The page's URL-hash state. No other tool links here yet (there is no
 * `LinkStates['phases']`), so the hash holds only this shape; any subset of
 * its fields is accepted and wrong-typed fields are ignored.
 */
import { GROUPINGS, VIEWS, type Grouping, type View } from './groupings';
import { MAX_SOURCE } from './pipeline';
import { DEFAULT_PRESET } from './presets';
import type { Decl, Type } from './semantic';

export interface PhasesState {
	source: string;
	decls: Decl[];
	view: View;
	grouping: Grouping;
}

/** Most rows the declarations table keeps. */
export const MAX_DECLS = 40;

export function defaultState(): PhasesState {
	return {
		source: DEFAULT_PRESET.value.source,
		decls: DEFAULT_PRESET.value.decls.map((d) => ({ ...d })),
		view: DEFAULT_PRESET.value.view,
		grouping: 'phases'
	};
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const TYPES: readonly Type[] = ['int', 'float'];

function toDecl(v: unknown): Decl | null {
	if (!isRecord(v) || typeof v.name !== 'string') return null;
	return {
		name: v.name.slice(0, 40),
		type: TYPES.includes(v.type as Type) ? (v.type as Type) : 'int',
		value: typeof v.value === 'string' ? v.value.slice(0, 40) : ''
	};
}

/** Accepts an object with at least one of the state's fields. */
export function isPhasesHash(v: unknown): v is Partial<PhasesState> {
	if (!isRecord(v)) return false;
	return (
		typeof v.source === 'string' ||
		Array.isArray(v.decls) ||
		VIEWS.includes(v.view as View) ||
		GROUPINGS.includes(v.grouping as Grouping)
	);
}

/** The state a hash value describes, on top of `base`. */
export function stateFromHash(base: PhasesState, v: Partial<PhasesState>): PhasesState {
	const next: PhasesState = { ...base, decls: base.decls.map((d) => ({ ...d })) };
	if (typeof v.source === 'string') next.source = v.source.slice(0, MAX_SOURCE);
	if (Array.isArray(v.decls))
		next.decls = v.decls
			.map(toDecl)
			.filter((d): d is Decl => d !== null)
			.slice(0, MAX_DECLS);
	if (VIEWS.includes(v.view as View)) next.view = v.view as View;
	if (GROUPINGS.includes(v.grouping as Grouping)) next.grouping = v.grouping as Grouping;
	return next;
}

// ---------------------------------------------------------------------------
// The slide's assumptions as switches (Intro (cont'd), slide 4)
// ---------------------------------------------------------------------------

const find = (decls: readonly Decl[], name: string) => decls.find((d) => d.name.trim() === name);

/** "B1 is int": null when no B1 is declared. */
export function b1IsInt(decls: readonly Decl[]): boolean | null {
	const d = find(decls, 'B1');
	return d ? d.type === 'int' : null;
}

export function setB1IsInt(decls: Decl[], on: boolean): void {
	const d = find(decls, 'B1');
	if (!d) return;
	d.type = on ? 'int' : 'float';
	if (on && d.value.includes('.')) d.value = '';
}

/** "C is the constant 2.3": null when no C is declared. */
export function cIsConstant(decls: readonly Decl[]): boolean | null {
	const d = find(decls, 'C');
	return d ? d.type === 'float' && d.value.trim() !== '' && Number(d.value) === 2.3 : null;
}

export function setCIsConstant(decls: Decl[], on: boolean): void {
	const d = find(decls, 'C');
	if (!d) return;
	if (on) {
		d.type = 'float';
		d.value = '2.3';
	} else d.value = '';
}
