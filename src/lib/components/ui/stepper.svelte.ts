/**
 * Step-through state for algorithm traces: a clamped index into `total()`
 * steps plus timed playback. Pair with `StepControls` and the `stepperKeys`
 * attachment.
 *
 * ```ts
 * const stepper = new Stepper(() => result.steps.length);
 * const step = $derived(result.steps[stepper.index]);
 * ```
 */
import { onDestroy, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';

export const DEFAULT_SPEED = 1.5;

/** Clamps a step index into `[0, total - 1]` (0 when there are no steps). */
export function clampIndex(index: number, total: number): number {
	if (!Number.isFinite(index) || total <= 0) return 0;
	return Math.max(0, Math.min(Math.trunc(index), Math.floor(total) - 1));
}

export class Stepper {
	#index = $state(0);
	#playing = $state(false);
	#speed = $state(DEFAULT_SPEED);
	#total: () => number;
	#timer: ReturnType<typeof setInterval> | null = null;
	/** The speed the stepper was created with; the "1×" of the speed menu. */
	readonly baseSpeed: number;

	constructor(total: () => number, options: { speed?: number; index?: number } = {}) {
		this.#total = total;
		this.baseSpeed = options.speed && options.speed > 0 ? options.speed : DEFAULT_SPEED;
		this.#speed = this.baseSpeed;
		this.#index = options.index ?? 0;
		try {
			onDestroy(() => this.dispose());
		} catch {
			// Created outside component initialisation: the owner must call dispose().
		}
	}

	/** Number of steps (a non-negative integer). */
	get total(): number {
		const n = this.#total();
		return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
	}

	/**
	 * Current step, always within range. When `total` shrinks below it, the
	 * clamped position is kept, so the step does not jump when `total` grows again.
	 */
	get index(): number {
		const i = clampIndex(this.#index, this.total);
		// Allowed inside templates and deriveds: the write is untracked and settles in one pass.
		if (i !== this.#index) untrack(() => (this.#index = i));
		return i;
	}
	set index(i: number) {
		this.set(i);
	}

	get atStart(): boolean {
		return this.index <= 0;
	}

	get atEnd(): boolean {
		return this.index >= this.total - 1;
	}

	get playing(): boolean {
		return this.#playing;
	}
	set playing(on: boolean) {
		if (on) this.play();
		else this.pause();
	}

	/** Playback rate in steps per second. */
	get speed(): number {
		return this.#speed;
	}
	set speed(stepsPerSecond: number) {
		if (!(stepsPerSecond > 0)) return;
		this.#speed = stepsPerSecond;
		if (this.#playing) this.#schedule();
	}

	set(i: number): void {
		this.#index = clampIndex(i, this.total);
	}

	next(): void {
		if (!this.atEnd) this.#index = this.index + 1;
	}

	prev(): void {
		if (!this.atStart) this.#index = this.index - 1;
	}

	first(): void {
		this.#index = 0;
	}

	last(): void {
		this.#index = Math.max(0, this.total - 1);
	}

	/** Starts playback; from the last step it restarts at the first. */
	play(): void {
		if (this.total <= 1) return;
		if (this.atEnd) this.first();
		this.#playing = true;
		this.#schedule();
	}

	pause(): void {
		this.#playing = false;
		this.#clear();
	}

	toggle(): void {
		if (this.#playing) this.pause();
		else this.play();
	}

	/** Stops timers. Called automatically when the owning component is destroyed. */
	dispose(): void {
		this.pause();
	}

	#tick = () => {
		if (this.atEnd) {
			this.pause();
			return;
		}
		this.next();
		if (this.atEnd) this.pause();
	};

	#schedule() {
		this.#clear();
		if (typeof setInterval === 'undefined') return;
		this.#timer = setInterval(this.#tick, 1000 / this.#speed);
	}

	#clear() {
		if (this.#timer !== null) clearInterval(this.#timer);
		this.#timer = null;
	}
}

export type StepCommand = 'next' | 'prev' | 'first' | 'last' | 'toggle';

/** What a keydown target is, as far as stepper shortcuts care. */
export interface KeyTarget {
	tagName: string;
	role?: string | null;
	type?: string | null;
	isContentEditable?: boolean;
}

// Roles whose own arrow/Home/End/Space handling must win.
const WIDGET_ROLES = new Set([
	'textbox',
	'searchbox',
	'combobox',
	'listbox',
	'option',
	'menu',
	'menuitem',
	'menuitemradio',
	'menuitemcheckbox',
	'radio',
	'radiogroup',
	'tab',
	'tablist',
	'slider',
	'spinbutton',
	'grid',
	'gridcell',
	'tree',
	'treeitem'
]);

const KEY_COMMANDS: Record<string, StepCommand> = {
	ArrowRight: 'next',
	ArrowLeft: 'prev',
	Home: 'first',
	End: 'last',
	' ': 'toggle',
	Spacebar: 'toggle'
};

const BUTTON_TYPES = new Set(['button', 'submit', 'reset', 'image']);
const SPACE_ACTIVATES = new Set(['button', 'link', 'switch', 'checkbox']);

/**
 * Maps a key to a stepper command, or null when the key belongs to the focused
 * element: text fields, selects, radios and other widgets with their own arrow
 * keys, and Space on buttons, links, and checkboxes. A range slider keeps its
 * arrows but Space toggles playback.
 */
export function keyToCommand(
	key: string,
	target: KeyTarget,
	modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}
): StepCommand | null {
	if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null;
	const command = KEY_COMMANDS[key];
	if (!command) return null;
	const tag = target.tagName.toUpperCase();
	const type = (target.type ?? '').toLowerCase();
	const role = target.role ?? '';
	const space = command === 'toggle';
	if (target.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT') return null;
	if (tag === 'INPUT') {
		if (type === 'range') return space ? command : null;
		if (type === 'checkbox' || BUTTON_TYPES.has(type)) return space ? null : command;
		return null;
	}
	if (WIDGET_ROLES.has(role)) return null;
	if (
		space &&
		(tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || SPACE_ACTIVATES.has(role))
	) {
		return null;
	}
	return command;
}

/**
 * Attachment that enables ←/→ (step), Home/End (first/last) and Space
 * (play/pause) while focus is inside the element:
 * `<div tabindex="-1" {@attach stepperKeys(stepper)}>`.
 */
export function stepperKeys(stepper: Stepper): Attachment<HTMLElement> {
	return (node) => {
		const onkeydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			const el = event.target instanceof HTMLElement ? event.target : node;
			const command = keyToCommand(
				event.key,
				{
					tagName: el.tagName,
					role: el.getAttribute('role'),
					type: el instanceof HTMLInputElement ? el.type : null,
					isContentEditable: el.isContentEditable
				},
				{ ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey }
			);
			if (!command) return;
			event.preventDefault();
			stepper[command]();
		};
		node.addEventListener('keydown', onkeydown);
		return () => node.removeEventListener('keydown', onkeydown);
	};
}
