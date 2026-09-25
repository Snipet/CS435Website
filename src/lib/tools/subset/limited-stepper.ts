/**
 * A Stepper that can be held back: `limit()` is the last step it may show
 * (null for no limit). The counter still counts every step; Next, End,
 * playback, the scrubber and the keys stop at the limit.
 */
import { Stepper } from '$lib/components/ui/stepper.svelte';

export class LimitedStepper extends Stepper {
	readonly #limit: () => number | null;

	constructor(
		total: () => number,
		limit: () => number | null,
		options: { speed?: number; index?: number } = {}
	) {
		super(total, options);
		this.#limit = limit;
	}

	/** The last step that can be shown. */
	get max(): number {
		const end = Math.max(0, this.total - 1);
		const l = this.#limit();
		return l === null || !Number.isFinite(l) ? end : Math.max(0, Math.min(end, Math.trunc(l)));
	}

	override get index(): number {
		return Math.min(super.index, this.max);
	}
	override set index(i: number) {
		this.set(i);
	}

	override get atEnd(): boolean {
		return this.index >= this.max;
	}

	override set(i: number): void {
		super.set(Math.min(i, this.max));
	}

	override next(): void {
		if (!this.atEnd) super.set(this.index + 1);
	}

	override last(): void {
		super.set(this.max);
	}

	/** Plays up to the limit; nothing to play when only the first step can be shown. */
	override play(): void {
		if (this.max <= 0) return;
		super.play();
	}
}
