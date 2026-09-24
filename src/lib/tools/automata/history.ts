/**
 * Undo/redo history of snapshots. Pushing after an undo drops the redo
 * branch. Consecutive pushes with the same `merge` tag (e.g. nudging one state
 * with the arrow keys) replace each other, so one undo reverts the whole run.
 */
export class History<T> {
	#past: T[] = [];
	#future: T[] = [];
	#current: T;
	#mergeTag: string | null = null;
	readonly limit: number;

	constructor(initial: T, limit = 100) {
		this.#current = initial;
		this.limit = Math.max(1, limit);
	}

	get current(): T {
		return this.#current;
	}

	get canUndo(): boolean {
		return this.#past.length > 0;
	}

	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	/** Records `value` as the new current snapshot. */
	push(value: T, opts: { merge?: string } = {}): void {
		const tag = opts.merge ?? null;
		if (tag !== null && tag === this.#mergeTag && this.#past.length > 0) {
			this.#current = value;
			this.#future = [];
			return;
		}
		this.#past.push(this.#current);
		if (this.#past.length > this.limit) this.#past.shift();
		this.#current = value;
		this.#future = [];
		this.#mergeTag = tag;
	}

	/** Steps back; returns the snapshot to restore, or null at the oldest one. */
	undo(): T | null {
		const prev = this.#past.pop();
		if (prev === undefined) return null;
		this.#future.push(this.#current);
		this.#current = prev;
		this.#mergeTag = null;
		return prev;
	}

	redo(): T | null {
		const next = this.#future.pop();
		if (next === undefined) return null;
		this.#past.push(this.#current);
		this.#current = next;
		this.#mergeTag = null;
		return next;
	}

	/** Forgets everything and starts again from `value`. */
	reset(value: T): void {
		this.#past = [];
		this.#future = [];
		this.#current = value;
		this.#mergeTag = null;
	}
}
