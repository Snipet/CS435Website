/**
 * Checklists kept in the browser: the ids of the checked items of a list, and
 * a few on/off options of how the list is shown, saved as JSON under keys of
 * the site's own (`storageKey('midterm-checklist', 1)` →
 * "cs435:midterm-checklist:v1"). The version in a key changes when the shape
 * of what is stored under it changes.
 *
 * Every access goes through a guard: a storage that is missing or throws (a
 * private window, blocked site data, a full quota) reads as null and writes as
 * false, so a page keeps its state in memory and can say so. Nothing here
 * touches the browser on import; call `browserStorage` from `onMount` or an
 * effect.
 */
import { site } from '$lib/site';

/** The part of the Web Storage API the helpers use (tests pass their own). */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** On/off options, each with a default. */
export type Flags = Record<string, boolean>;

/** A key of the site's own: `storageKey('midterm-checklist', 1)` = "cs435:midterm-checklist:v1". */
export function storageKey(name: string, version: number): string {
	return `${site.shortName.toLowerCase()}:${name}:v${version}`;
}

/** The browser's local storage, or null where there is none or it cannot be reached. */
export function browserStorage(): KeyValueStore | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/**
 * Whether the storage keeps what is written to it: a probe value is written
 * and removed again. A storage can be readable and still refuse writes.
 */
export function canWrite(store: KeyValueStore | null): boolean {
	if (!store) return false;
	const probe = storageKey('probe', 1);
	try {
		store.setItem(probe, '1');
		store.removeItem(probe);
		return true;
	} catch {
		return false;
	}
}

/** The ids in stored text, a JSON array of strings. Other text gives none; entries that are not strings are skipped. */
export function parseIds(text: string | null): Set<string> {
	if (text === null) return new Set();
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return new Set();
		return new Set(value.filter((v): v is string => typeof v === 'string'));
	} catch {
		return new Set();
	}
}

/** The stored text of a set of ids: a JSON array, sorted, so that equal sets are stored alike. */
export function serializeIds(ids: Iterable<string>): string {
	return JSON.stringify([...new Set(ids)].sort());
}

/** The ids stored under `key` (none when nothing is stored), or null when the storage cannot be read. */
export function readIds(store: KeyValueStore | null, key: string): Set<string> | null {
	if (!store) return null;
	try {
		return parseIds(store.getItem(key));
	} catch {
		return null;
	}
}

/**
 * Stores the ids under `key`, or removes the key when there are none.
 * Returns false when the storage is missing or refuses.
 */
export function writeIds(store: KeyValueStore | null, key: string, ids: Iterable<string>): boolean {
	if (!store) return false;
	const list = [...ids];
	try {
		if (list.length === 0) store.removeItem(key);
		else store.setItem(key, serializeIds(list));
		return true;
	} catch {
		return false;
	}
}

/**
 * Options in stored text, a JSON object: each option of `defaults` takes the
 * stored value when it is a boolean, and its default otherwise. Other keys are
 * ignored.
 */
export function parseFlags<T extends Flags>(text: string | null, defaults: T): T {
	const out: T = { ...defaults };
	if (text === null) return out;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return out;
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
	const stored = value as Record<string, unknown>;
	for (const key of Object.keys(defaults) as (keyof T & string)[]) {
		const v = stored[key];
		if (typeof v === 'boolean') out[key] = v as T[keyof T & string];
	}
	return out;
}

/** The options stored under `key` (the defaults when nothing is stored), or null when the storage cannot be read. */
export function readFlags<T extends Flags>(
	store: KeyValueStore | null,
	key: string,
	defaults: T
): T | null {
	if (!store) return null;
	try {
		return parseFlags(store.getItem(key), defaults);
	} catch {
		return null;
	}
}

/**
 * Stores the options of `defaults` under `key`, or removes the key when every
 * one has its default. Returns false when the storage is missing or refuses.
 */
export function writeFlags<T extends Flags>(
	store: KeyValueStore | null,
	key: string,
	flags: T,
	defaults: T
): boolean {
	if (!store) return false;
	const keys = Object.keys(defaults);
	const value = Object.fromEntries(keys.map((k) => [k, flags[k] ?? defaults[k]]));
	try {
		if (keys.every((k) => value[k] === defaults[k])) store.removeItem(key);
		else store.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}
