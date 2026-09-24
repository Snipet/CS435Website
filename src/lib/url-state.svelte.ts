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
import { beforeNavigate, replaceState } from '$app/navigation';
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

/**
 * The hash that reproduces the current page's state: the last value written
 * or scheduled, or the one loaded from the URL. `''` means no hash (a synced
 * tool whose state is untouched).
 */
let current: { path: string; text: string } | null = null;
let pending: { text: string; path: string; timer: ReturnType<typeof setTimeout> } | null = null;

function applyHash(text: string, path: string): void {
	if (typeof location === 'undefined' || location.pathname !== path) return;
	if (location.hash.slice(1) === text) return;
	const url = `${location.pathname}${location.search}${text ? `#${text}` : ''}`;
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
	if (current?.path === path) current.text = text;
	else current = { path, text };
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

/**
 * Brings the URL up to date now: writes any pending update, and puts the
 * state back if something else replaced the hash since (an in-page anchor, a
 * link that did not decode). Call it before reading `location.href` to share
 * the page.
 */
export function flushHash(): void {
	if (pending) {
		clearTimeout(pending.timer);
		const { text, path } = pending;
		pending = null;
		applyHash(text, path);
	}
	if (current) applyHash(current.text, current.path);
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

/** The DOM-free core of `syncToHash`; exported for tests. */
export interface HashSync<T> {
	/** Loads the hash and starts listening for `hashchange`; returns the cleanup. */
	start(): () => void;
	/** Reports the state. The first value is the starting point; later changes are written. */
	update(value: T): void;
}

export function createHashSync<T>(options: SyncOptions<T>): HashSync<T> {
	const delay = options.delay ?? WRITE_DELAY;
	let last: string | null = null;
	let link: { path: string; text: string } | null = null;

	function load(): void {
		if (!link || current !== link) return;
		const value = readHash(options.validate);
		if (value === null) {
			// An in-page anchor (e.g. "Skip to content") replaced the state: put it back.
			if (link.text) applyHash(link.text, link.path);
			return;
		}
		cancelHashWrite();
		link.text = location.hash.slice(1);
		last = encode(value);
		options.onLoad(value);
	}

	return {
		start() {
			if (typeof location === 'undefined') return () => {};
			const mine = { path: location.pathname, text: '' };
			link = current = mine;
			load();
			addEventListener('hashchange', load);
			return () => {
				removeEventListener('hashchange', load);
				flushHash();
				if (current === mine) current = null;
			};
		},
		update(value) {
			const text = encode(value);
			if (last === null) {
				// The starting state: leave the URL alone so an untouched page keeps a clean URL.
				last = text;
				return;
			}
			if (text === last) return;
			last = text;
			schedule(text, delay);
		}
	};
}

/**
 * Keeps a component's state in the URL hash. Call during component
 * initialisation, once per page:
 *
 * ```ts
 * let state = $state({ regex: '(0 | 1)*00', input: '' });
 * syncToHash(() => state, { onLoad: (v) => Object.assign(state, v) });
 * ```
 *
 * The hash is read once on mount (and on `hashchange`). After that, every
 * change to the value returned by `get` is written back, debounced. The getter
 * is serialized inside an effect, so nested fields are tracked. The initial
 * state is never written, so an untouched page keeps a clean URL. If an
 * in-page anchor replaces the hash, the state is put back; `flushHash()` (used
 * by `CopyLinkButton`) does the same before a link is copied.
 */
export function syncToHash<T>(get: () => T, options: SyncOptions<T>): void {
	const sync = createHashSync(options);
	onMount(() => sync.start());
	// Write a pending change to the entry being left, so Back restores it.
	beforeNavigate(() => flushHash());
	$effect(() => sync.update(get()));
}
