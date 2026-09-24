/**
 * Share-link state in the URL hash.
 *
 * A tool keeps its user-editable state (inputs, options, current step) as a
 * JSON-serializable value and mirrors it into `location.hash` so "Copy link"
 * reproduces the exact view. The hash is `v1.` followed by the lz-string
 * compressed JSON; anything else (including plain anchors) decodes to null.
 *
 * Import from `$lib/url-state`. This file is a `.svelte.ts` module only because
 * `syncToHash` uses `$effect`.
 */
import { onMount } from 'svelte';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import lz from 'lz-string';

/** Bump when the envelope format (not a tool's own state shape) changes. */
export const HASH_VERSION = 1;
const PREFIX = `v${HASH_VERSION}.`;

/** Default delay before a changed value is written to the URL. */
export const WRITE_DELAY = 250;

/** Encodes a JSON-serializable value as a URL-safe string: `v1.<lz-string>`. */
export function encode(value: unknown): string {
	const json = JSON.stringify(value);
	if (json === undefined) return '';
	return PREFIX + lz.compressToEncodedURIComponent(json);
}

/**
 * Decodes text produced by `encode`. Returns null for anything else: other
 * versions, plain anchors, truncated or corrupted links. A leading `#` is
 * ignored. `validate` can reject values of the wrong shape.
 */
export function decode<T>(text: string, validate?: (value: unknown) => value is T): T | null {
	const body = text.startsWith('#') ? text.slice(1) : text;
	if (!body.startsWith(PREFIX)) return null;
	try {
		const json = lz.decompressFromEncodedURIComponent(body.slice(PREFIX.length));
		if (!json) return null;
		const value: unknown = JSON.parse(json);
		if (value === null) return null;
		if (validate && !validate(value)) return null;
		return value as T;
	} catch {
		return null;
	}
}

/** Reads and decodes the current URL hash. Returns null on the server. */
export function readHash<T>(validate?: (value: unknown) => value is T): T | null {
	if (typeof location === 'undefined') return null;
	return decode<T>(location.hash, validate);
}

let pending: { text: string; path: string; timer: ReturnType<typeof setTimeout> } | null = null;

function applyHash(text: string, path: string): void {
	if (typeof location === 'undefined' || location.pathname !== path) return;
	if (location.hash.slice(1) === text) return;
	const url = `${location.pathname}${location.search}#${text}`;
	try {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same-page hash update, not a navigation
		replaceState(url, page.state);
	} catch {
		// The router is not ready yet (or we are outside SvelteKit): update history directly.
		history.replaceState(history.state, '', url);
	}
}

function schedule(text: string, delay: number): void {
	if (typeof location === 'undefined') return;
	if (pending) clearTimeout(pending.timer);
	const path = location.pathname;
	pending = {
		text,
		path,
		timer: setTimeout(() => {
			pending = null;
			applyHash(text, path);
		}, delay)
	};
}

/**
 * Writes `value` into the URL hash after `delay` ms (debounced; only the last
 * value is written). Only the hash changes; no navigation or history entry is
 * created.
 */
export function writeHash(value: unknown, delay = WRITE_DELAY): void {
	schedule(encode(value), delay);
}

/** Writes any pending hash update immediately (e.g. right before copying the link). */
export function flushHash(): void {
	if (!pending) return;
	clearTimeout(pending.timer);
	const { text, path } = pending;
	pending = null;
	applyHash(text, path);
}

/** Drops a pending hash update without writing it. */
export function cancelHashWrite(): void {
	if (!pending) return;
	clearTimeout(pending.timer);
	pending = null;
}

export interface SyncOptions<T> {
	/** Called with the decoded hash on mount, and again when the hash changes (a pasted link). */
	onLoad: (value: T) => void;
	/** Rejects hash values of the wrong shape; they are ignored. */
	validate?: (value: unknown) => value is T;
	/** Debounce delay in ms (default 250). */
	delay?: number;
}

/**
 * Keeps a component's state in the URL hash. Call during component
 * initialisation:
 *
 * ```ts
 * let state = $state({ regex: '(0 | 1)*00', input: '' });
 * syncToHash(() => state, { onLoad: (v) => Object.assign(state, v) });
 * ```
 *
 * The hash is read once on mount (and on `hashchange`). After that, every
 * change to the value returned by `get` is written back, debounced. The getter
 * is serialized inside an effect, so nested fields are tracked. The initial
 * state is never written, so an untouched page keeps a clean URL.
 */
export function syncToHash<T>(get: () => T, options: SyncOptions<T>): void {
	let last: string | null = null;

	onMount(() => {
		const load = () => {
			const value = readHash(options.validate);
			if (value === null) return;
			last = encode(value);
			options.onLoad(value);
		};
		load();
		addEventListener('hashchange', load);
		return () => {
			removeEventListener('hashchange', load);
			flushHash();
		};
	});

	$effect(() => {
		const text = encode(get());
		if (last === null) {
			// First run: remember the starting point without touching the URL.
			last = text;
			return;
		}
		if (text === last) return;
		last = text;
		schedule(text, options.delay ?? WRITE_DELAY);
	});
}
