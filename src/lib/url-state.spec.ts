import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decode, encode, HASH_VERSION, readHash } from './url-state';

interface ToolState {
	regex: string;
	input: string;
	step: number;
	options: { minimal: boolean };
}

const isToolState = (v: unknown): v is ToolState =>
	typeof v === 'object' &&
	v !== null &&
	typeof (v as ToolState).regex === 'string' &&
	typeof (v as ToolState).step === 'number';

describe('encode / decode', () => {
	it('round-trips plain JSON values', () => {
		const values: unknown[] = [
			{ regex: '(0 | 1)*00', input: '1100', step: 3, options: { minimal: true } },
			[1, 2, 3],
			'text',
			0,
			false,
			{ nested: { deep: [{ a: null }] } }
		];
		for (const v of values) expect(decode(encode(v))).toEqual(v);
	});

	it('round-trips lecture symbols, whitespace, and non-BMP characters', () => {
		const v = { re: "ε | ɸ | Σ | '\\t' | ‘if’", text: 'a\tb\nc\r\n "q" \\ 😀 ⁺³' };
		expect(decode(encode(v))).toEqual(v);
	});

	it('produces a URL-safe, versioned string', () => {
		const text = encode({ regex: "('a' | 'b')* 'abb'", input: 'a b/c?d#e&f=g%h' });
		expect(text.startsWith(`v${HASH_VERSION}.`)).toBe(true);
		expect(text).toMatch(/^[A-Za-z0-9+\-$.]+$/);
		expect(encodeURIComponent(text).replace(/%24/g, '$').replace(/%2B/g, '+')).toBe(text);
	});

	it('ignores a leading #', () => {
		const v = { step: 2 };
		expect(decode('#' + encode(v))).toEqual(v);
	});

	it('returns null for bad input instead of throwing', () => {
		const good = encode({ regex: 'a*', step: 1 });
		const bad = [
			'',
			'#',
			'#section-anchor',
			'v1.',
			'v1.!!!!',
			'v1.notlzstring',
			good.slice(0, good.length - 6),
			'v2.' + good.slice(3),
			'N4IgdghgtgpiBcIA',
			encode(null)
		];
		for (const text of bad) expect(decode(text)).toBeNull();
	});

	it('applies the validator', () => {
		expect(
			decode(encode({ regex: 'a', input: '', step: 0, options: { minimal: false } }), isToolState)
		).not.toBeNull();
		expect(decode(encode({ regex: 42 }), isToolState)).toBeNull();
		expect(decode(encode([1, 2]), isToolState)).toBeNull();
	});

	it('encodes undefined as an empty string', () => {
		expect(encode(undefined)).toBe('');
		expect(decode(encode(undefined))).toBeNull();
	});
});

describe('readHash', () => {
	it('is safe on the server', () => {
		expect(readHash()).toBeNull();
	});
});

/** A stand-in for `location`, `history` and window events, enough for the hash writers. */
function fakeBrowser(start: string) {
	let url = new URL(start, 'https://cs435.test');
	const hashListeners = new Set<() => void>();
	const location = {
		get href() {
			return url.href;
		},
		get pathname() {
			return url.pathname;
		},
		get search() {
			return url.search;
		},
		get hash() {
			return url.hash;
		}
	};
	const history = {
		state: null as unknown,
		replaceState: vi.fn((state: unknown, _title: string, next: string) => {
			history.state = state;
			url = new URL(next, url);
		})
	};
	vi.stubGlobal('location', location);
	vi.stubGlobal('history', history);
	vi.stubGlobal('addEventListener', (type: string, fn: () => void) => {
		if (type === 'hashchange') hashListeners.add(fn);
	});
	vi.stubGlobal('removeEventListener', (type: string, fn: () => void) => {
		if (type === 'hashchange') hashListeners.delete(fn);
	});
	return {
		location,
		history,
		get listeners() {
			return hashListeners.size;
		},
		/** Follows an in-page link or a pasted URL: sets the hash and fires `hashchange`. */
		goHash(hash: string) {
			url = new URL(hash, url);
			for (const fn of hashListeners) fn();
		},
		/** Moves to another page without events (the router has already pushed). */
		goPath(path: string) {
			url = new URL(path, url);
		}
	};
}

type UrlState = typeof import('./url-state');

describe('hash writing', () => {
	let mod: UrlState;

	beforeEach(async () => {
		vi.useFakeTimers();
		// Fresh module state (pending write, current link) for every test.
		vi.resetModules();
		mod = await import('./url-state');
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('debounces writeHash and writes only the last value', () => {
		const b = fakeBrowser('/tool');
		mod.writeHash({ n: 1 });
		vi.advanceTimersByTime(100);
		mod.writeHash({ n: 2 });
		vi.advanceTimersByTime(mod.WRITE_DELAY - 1);
		expect(b.location.hash).toBe('');
		vi.advanceTimersByTime(1);
		expect(b.location.hash).toBe('#' + encode({ n: 2 }));
		expect(b.location.pathname).toBe('/tool');
		expect(b.history.replaceState).toHaveBeenCalledTimes(1);
	});

	it('keeps the query string and replaces only the hash', () => {
		const b = fakeBrowser('/tool?x=1#old');
		mod.writeHash({ n: 1 }, 0);
		vi.runAllTimers();
		expect(b.location.href).toBe(`https://cs435.test/tool?x=1#${encode({ n: 1 })}`);
	});

	it('never writes to a page other than the one that scheduled the write', () => {
		const b = fakeBrowser('/tool');
		mod.writeHash({ n: 1 });
		b.goPath('/notation');
		vi.runAllTimers();
		mod.flushHash();
		expect(b.location.href).toBe('https://cs435.test/notation');
		expect(b.history.replaceState).not.toHaveBeenCalled();
	});

	it('flushHash writes a pending update at once', () => {
		const b = fakeBrowser('/tool');
		mod.writeHash({ n: 3 });
		mod.flushHash();
		expect(b.location.hash).toBe('#' + encode({ n: 3 }));
		vi.runAllTimers();
		expect(b.history.replaceState).toHaveBeenCalledTimes(1);
	});

	it('cancelHashWrite drops a pending update', () => {
		const b = fakeBrowser('/tool');
		mod.writeHash({ n: 3 });
		mod.cancelHashWrite();
		vi.runAllTimers();
		expect(b.location.hash).toBe('');
	});

	it('flushHash puts written state back after an in-page anchor replaced it', () => {
		const b = fakeBrowser('/tool');
		mod.writeHash({ n: 4 });
		vi.runAllTimers();
		b.goHash('#main');
		mod.flushHash();
		expect(b.location.hash).toBe('#' + encode({ n: 4 }));
	});
});

describe('createHashSync', () => {
	let mod: UrlState;
	const cleanups: (() => void)[] = [];

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		mod = await import('./url-state');
	});

	afterEach(() => {
		for (const fn of cleanups.splice(0)) fn();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	/** Mounts a sync the way `syncToHash` does: start, then report the (possibly loaded) state. */
	function mount<T>(initial: T, validate?: (value: unknown) => value is T) {
		const loaded: T[] = [];
		const sync = mod.createHashSync<T>({ onLoad: (v) => loaded.push(v), validate });
		const stop = sync.start();
		cleanups.push(stop);
		sync.update(loaded.at(-1) ?? initial);
		return { sync, loaded, stop };
	}

	it('leaves the URL alone for the starting state, then writes changes', () => {
		const b = fakeBrowser('/tool');
		const { sync, loaded } = mount({ re: 'a' });
		expect(loaded).toEqual([]);
		vi.runAllTimers();
		expect(b.location.hash).toBe('');
		sync.update({ re: 'ab' });
		vi.runAllTimers();
		expect(b.location.hash).toBe('#' + encode({ re: 'ab' }));
		// The same value again is not rewritten.
		sync.update({ re: 'ab' });
		vi.runAllTimers();
		expect(b.history.replaceState).toHaveBeenCalledTimes(1);
	});

	it('loads a state link on start without writing it back', () => {
		const text = encode({ re: 'b*' });
		const b = fakeBrowser('/tool#' + text);
		const { loaded } = mount({ re: 'a' });
		expect(loaded).toEqual([{ re: 'b*' }]);
		vi.runAllTimers();
		expect(b.history.replaceState).not.toHaveBeenCalled();
		mod.flushHash();
		expect(b.location.hash).toBe('#' + text);
	});

	it('restores the state when an in-page anchor replaces it (skip link)', () => {
		const b = fakeBrowser('/tool');
		const { sync } = mount({ re: 'a' });
		sync.update({ re: 'a|b' });
		vi.runAllTimers();
		const text = encode({ re: 'a|b' });
		b.goHash('#main');
		expect(b.location.hash).toBe('#' + text);
		// Copy link after the anchor still carries the state.
		mod.flushHash();
		expect(b.location.href).toBe(`https://cs435.test/tool#${text}`);
	});

	it('flushHash restores the state even without a hashchange event', () => {
		const b = fakeBrowser('/tool');
		const { sync } = mount({ re: 'a' });
		sync.update({ re: 'c' });
		vi.runAllTimers();
		b.goPath('/tool#main');
		mod.flushHash();
		expect(b.location.hash).toBe('#' + encode({ re: 'c' }));
	});

	it('flushHash writes a change made just before copying', () => {
		const b = fakeBrowser('/tool');
		const { sync } = mount({ re: 'a' });
		sync.update({ re: 'd' });
		mod.flushHash();
		expect(b.location.hash).toBe('#' + encode({ re: 'd' }));
	});

	it('keeps an anchor while the state is untouched, but copies a clean link', () => {
		const b = fakeBrowser('/tool');
		mount({ re: 'a' });
		b.goHash('#main');
		expect(b.location.hash).toBe('#main');
		mod.flushHash();
		expect(b.location.href).toBe('https://cs435.test/tool');
	});

	it('ignores a broken or invalid link and drops it from the copied URL', () => {
		const isRe = (v: unknown): v is { re: string } =>
			typeof v === 'object' && v !== null && typeof (v as { re: unknown }).re === 'string';
		for (const hash of ['#v1.garbage', '#' + encode({ re: 42 })]) {
			const b = fakeBrowser('/tool' + hash);
			const { loaded, stop } = mount({ re: 'a' }, isRe);
			expect(loaded).toEqual([]);
			mod.flushHash();
			expect(b.location.href).toBe('https://cs435.test/tool');
			stop();
		}
	});

	it('loads a pasted link and cancels an older pending write', () => {
		const b = fakeBrowser('/tool');
		const { sync, loaded } = mount({ re: 'a' });
		sync.update({ re: 'typed' });
		const pasted = encode({ re: 'pasted' });
		b.goHash('#' + pasted);
		expect(loaded).toEqual([{ re: 'pasted' }]);
		sync.update({ re: 'pasted' });
		vi.runAllTimers();
		expect(b.location.hash).toBe('#' + pasted);
	});

	it('stops listening and flushes on cleanup', () => {
		const b = fakeBrowser('/tool');
		const { sync, stop } = mount({ re: 'a' });
		expect(b.listeners).toBe(1);
		sync.update({ re: 'e' });
		stop();
		expect(b.listeners).toBe(0);
		expect(b.location.hash).toBe('#' + encode({ re: 'e' }));
		// Nothing is restored after the tool is gone.
		b.goHash('#main');
		mod.flushHash();
		expect(b.location.hash).toBe('#main');
	});

	it('does nothing on the server', () => {
		const sync = mod.createHashSync({ onLoad: () => {} });
		const stop = sync.start();
		sync.update({ re: 'a' });
		sync.update({ re: 'b' });
		stop();
		expect(typeof location).toBe('undefined');
	});
});
