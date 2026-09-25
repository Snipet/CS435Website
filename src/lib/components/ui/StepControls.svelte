<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';
	import Select from './Select.svelte';
	import { stepperKeys, type Stepper } from './stepper.svelte';

	interface Props {
		stepper: Stepper;
		/** Describes the current step; announced politely while not playing. */
		label?: Snippet<[number]>;
		/** Speed multipliers of `stepper.baseSpeed` (default 0.5×, 1×, 2×, 4×). */
		speeds?: readonly number[];
		showSpeed?: boolean;
		/** Accessible name of the control group. */
		ariaLabel?: string;
		/** Word used in the counter, e.g. "Step 3 of 12". */
		noun?: string;
	}

	let {
		stepper,
		label,
		speeds = [0.5, 1, 2, 4],
		showSpeed = true,
		ariaLabel = 'Step controls',
		noun = 'Step'
	}: Props = $props();

	const uid = $props.id();
	const total = $derived(stepper.total);
	const index = $derived(stepper.index);
	const multiplier = $derived.by(() => {
		const m = stepper.speed / stepper.baseSpeed;
		return speeds.reduce((best, s) => (Math.abs(s - m) < Math.abs(best - m) ? s : best), speeds[0]);
	});
	const speedOptions = $derived(speeds.map((s) => ({ value: s, label: `${s}×` })));
	const counter = $derived(
		total === 0 ? `No ${noun.toLowerCase()}s` : `${noun} ${index + 1} of ${total}`
	);

	/** Nothing to play: one step, or a stepper held on its first step (e.g. a subclass with a limit). */
	const stuck = $derived(stepper.atStart && stepper.atEnd);

	function scrub(e: Event & { currentTarget: HTMLInputElement }) {
		const el = e.currentTarget;
		stepper.set(el.valueAsNumber);
		// A stepper may stop short of the step asked for; keep the thumb on the step shown.
		if (stepper.index !== el.valueAsNumber) el.value = String(stepper.index);
	}

	function guard(disabled: boolean, action: () => void) {
		return () => {
			if (!disabled) action();
		};
	}
</script>

<div class="step-controls" role="group" aria-label={ariaLabel} {@attach stepperKeys(stepper)}>
	<div class="row">
		<div class="buttons">
			<IconButton
				icon="first"
				label="First {noun.toLowerCase()}"
				shortcut="Home"
				aria-keyshortcuts="Home"
				aria-disabled={stepper.atStart}
				onclick={guard(stepper.atStart, () => stepper.first())}
			/>
			<IconButton
				icon="step-back"
				label="Previous {noun.toLowerCase()}"
				shortcut="←"
				aria-keyshortcuts="ArrowLeft"
				aria-disabled={stepper.atStart}
				onclick={guard(stepper.atStart, () => stepper.prev())}
			/>
			<IconButton
				icon={stepper.playing ? 'pause' : 'play'}
				label={stepper.playing ? 'Pause' : 'Play'}
				shortcut="Space"
				variant="primary"
				class="play"
				aria-keyshortcuts="Space"
				aria-disabled={stuck}
				onclick={guard(stuck, () => stepper.toggle())}
			/>
			<IconButton
				icon="step-forward"
				label="Next {noun.toLowerCase()}"
				shortcut="→"
				aria-keyshortcuts="ArrowRight"
				aria-disabled={stepper.atEnd}
				onclick={guard(stepper.atEnd, () => stepper.next())}
			/>
			<IconButton
				icon="last"
				label="Last {noun.toLowerCase()}"
				shortcut="End"
				aria-keyshortcuts="End"
				aria-disabled={stepper.atEnd}
				onclick={guard(stepper.atEnd, () => stepper.last())}
			/>
		</div>
		<input
			class="scrub"
			type="range"
			min="0"
			max={Math.max(0, total - 1)}
			step="1"
			value={index}
			disabled={total <= 1}
			aria-label={noun}
			aria-valuetext={counter}
			style="--fill: {total > 1 ? (index / (total - 1)) * 100 : 0}%"
			oninput={scrub}
		/>
		<span
			class="count"
			id="{uid}-count"
			aria-live={stepper.playing ? 'off' : 'polite'}
			aria-atomic="true">{counter}</span
		>
		{#if showSpeed}
			<div class="speed">
				<Select
					label="Playback speed"
					hideLabel
					size="sm"
					options={speedOptions}
					value={multiplier}
					onchange={(m) => (stepper.speed = stepper.baseSpeed * m)}
				/>
			</div>
		{/if}
	</div>
	{#if label && total > 0}
		<div class="caption" aria-live={stepper.playing ? 'off' : 'polite'}>{@render label(index)}</div>
	{/if}
</div>

<style>
	.step-controls {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.row {
		display: grid;
		grid-template-columns: auto minmax(80px, 1fr) auto auto;
		grid-template-areas: 'buttons scrub count speed';
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.buttons {
		grid-area: buttons;
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.buttons :global(.play) {
		margin: 0 4px;
		border-radius: 50%;
	}
	.scrub {
		grid-area: scrub;
		width: 100%;
		min-width: 0;
		height: 20px;
		margin: 0;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}
	.scrub:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.scrub::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--accent) var(--fill), var(--surface-3) var(--fill));
	}
	.scrub::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: var(--surface-3);
	}
	.scrub::-moz-range-progress {
		height: 4px;
		border-radius: 2px;
		background: var(--accent);
	}
	.scrub::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -6px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	.scrub::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--surface);
	}
	.scrub:focus-visible {
		outline: none;
	}
	.scrub:focus-visible::-webkit-slider-thumb {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.scrub:focus-visible::-moz-range-thumb {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.count {
		grid-area: count;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.speed {
		grid-area: speed;
	}
	.caption {
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--active);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--text-sm);
		line-height: 1.55;
		min-height: 2.4em;
	}
	@container (max-width: 520px) {
		.row {
			grid-template-columns: 1fr auto;
			grid-template-areas:
				'buttons buttons'
				'scrub scrub'
				'count speed';
			row-gap: var(--space-1);
		}
		.buttons {
			justify-content: center;
		}
	}
</style>
