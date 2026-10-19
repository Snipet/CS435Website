import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	browserStorage,
	canWrite,
	parseFlags,
	parseIds,
	readFlags,
	readIds,
	serializeIds,
	storageKey,
	writeFlags,
	writeIds,
	type KeyValueStore
} from './checklist';

/** A storage held in a map, as the browser's would hold it. */
class MemoryStore implements KeyValueStore {
	readonly map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.map.set(key, String(value));
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
}

/** A storage that throws on every call, as one does when site data is blocked. */
const blocked: KeyValueStore = {
	getItem() {
		throw new DOMException('The operation is insecure.', 'SecurityError');
	},
	setItem() {
		throw new DOMException('The operation is insecure.', 'SecurityError');
	},
	removeItem() {
		throw new DOMException('The operation is insecure.', 'SecurityError');
	}
};

/** A storage that reads but refuses writes, as one does when its quota is used up. */
class FullStore extends MemoryStore {
	override setItem(): void {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	}
}

const KEY = 'test:checks:v1';
const VIEW = { hideChecked: false, starredOnly: false };

describe('storageKey', () => {
	it('puts the name and the version under the site’s own prefix', () => {
		expect(storageKey('midterm-checklist', 1)).toBe('cs435:midterm-checklist:v1');
		expect(storageKey('midterm-checklist-view', 2)).toBe('cs435:midterm-checklist-view:v2');
	});
});

describe('browserStorage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('gives the local storage when there is one', () => {
		const store = new MemoryStore();
		vi.stubGlobal('localStorage', store);
		expect(browserStorage()).toBe(store);
	});

	it('gives null when there is none', () => {
		vi.stubGlobal('localStorage', undefined);
		expect(browserStorage()).toBeNull();
	});

	it('gives null when reaching it throws', () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			}
		});
		try {
			expect(browserStorage()).toBeNull();
		} finally {
			if (original) Object.defineProperty(globalThis, 'localStorage', original);
			else delete (globalThis as { localStorage?: unknown }).localStorage;
		}
	});
});

describe('canWrite', () => {
	it('is true for a storage that keeps values, and leaves nothing behind', () => {
		const store = new MemoryStore();
		expect(canWrite(store)).toBe(true);
		expect(store.map.size).toBe(0);
	});

	it('is false without a storage, for a blocked one and for a full one', () => {
		expect(canWrite(null)).toBe(false);
		expect(canWrite(blocked)).toBe(false);
		expect(canWrite(new FullStore())).toBe(false);
	});
});

describe('ids', () => {
	it('read back what was stored, as a set', () => {
		const store = new MemoryStore();
		expect(writeIds(store, KEY, ['b', 'a', 'b'])).toBe(true);
		expect(store.getItem(KEY)).toBe('["a","b"]');
		expect(readIds(store, KEY)).toEqual(new Set(['a', 'b']));
	});

	it('are stored sorted, so equal sets are stored alike', () => {
		expect(serializeIds(['Parsing › Grammars', 'Lexical Analysis', 'History'])).toBe(
			'["History","Lexical Analysis","Parsing › Grammars"]'
		);
		expect(serializeIds(new Set(['y', 'x']))).toBe(serializeIds(['x', 'y']));
	});

	it('remove the key when none is left', () => {
		const store = new MemoryStore();
		writeIds(store, KEY, ['a']);
		expect(writeIds(store, KEY, [])).toBe(true);
		expect(store.map.has(KEY)).toBe(false);
		expect(readIds(store, KEY)).toEqual(new Set());
	});

	it('are none for text that is missing or not a JSON array, and skip entries that are not strings', () => {
		expect(parseIds(null)).toEqual(new Set());
		expect(parseIds('')).toEqual(new Set());
		expect(parseIds('{"a":1}')).toEqual(new Set());
		expect(parseIds('"a"')).toEqual(new Set());
		expect(parseIds('[1, "a", null, ["b"], "c"]')).toEqual(new Set(['a', 'c']));
		expect(parseIds('not json')).toEqual(new Set());
	});

	it('read as null and write as false when the storage is missing or blocked', () => {
		expect(readIds(null, KEY)).toBeNull();
		expect(readIds(blocked, KEY)).toBeNull();
		expect(writeIds(null, KEY, ['a'])).toBe(false);
		expect(writeIds(blocked, KEY, ['a'])).toBe(false);
	});

	it('write as false to a full storage, which still reads', () => {
		const store = new FullStore();
		store.map.set(KEY, '["a"]');
		expect(writeIds(store, KEY, ['a', 'b'])).toBe(false);
		expect(readIds(store, KEY)).toEqual(new Set(['a']));
	});
});

describe('flags', () => {
	it('read back what was stored', () => {
		const store = new MemoryStore();
		expect(writeFlags(store, KEY, { hideChecked: true, starredOnly: false }, VIEW)).toBe(true);
		expect(JSON.parse(store.getItem(KEY)!)).toEqual({ hideChecked: true, starredOnly: false });
		expect(readFlags(store, KEY, VIEW)).toEqual({ hideChecked: true, starredOnly: false });
	});

	it('remove the key when every option has its default', () => {
		const store = new MemoryStore();
		writeFlags(store, KEY, { hideChecked: true, starredOnly: true }, VIEW);
		expect(writeFlags(store, KEY, { ...VIEW }, VIEW)).toBe(true);
		expect(store.map.has(KEY)).toBe(false);
		expect(readFlags(store, KEY, VIEW)).toEqual(VIEW);
	});

	it('store only the options there are defaults for', () => {
		const store = new MemoryStore();
		const flags = { hideChecked: true, starredOnly: false, other: true };
		writeFlags(store, KEY, flags, VIEW);
		expect(JSON.parse(store.getItem(KEY)!)).toEqual({ hideChecked: true, starredOnly: false });
	});

	it('take the default for an option that is missing or not a boolean, and ignore other keys', () => {
		expect(parseFlags(null, VIEW)).toEqual(VIEW);
		expect(parseFlags('[true]', VIEW)).toEqual(VIEW);
		expect(parseFlags('null', VIEW)).toEqual(VIEW);
		expect(parseFlags('nope', VIEW)).toEqual(VIEW);
		expect(parseFlags('{"hideChecked":"yes","starredOnly":true,"x":true}', VIEW)).toEqual({
			hideChecked: false,
			starredOnly: true
		});
		// The defaults are not changed.
		expect(VIEW).toEqual({ hideChecked: false, starredOnly: false });
	});

	it('read as null and write as false when the storage is missing, blocked or full', () => {
		expect(readFlags(null, KEY, VIEW)).toBeNull();
		expect(readFlags(blocked, KEY, VIEW)).toBeNull();
		expect(writeFlags(null, KEY, VIEW, VIEW)).toBe(false);
		expect(writeFlags(blocked, KEY, { ...VIEW, hideChecked: true }, VIEW)).toBe(false);
		expect(writeFlags(new FullStore(), KEY, { ...VIEW, hideChecked: true }, VIEW)).toBe(false);
	});
});
