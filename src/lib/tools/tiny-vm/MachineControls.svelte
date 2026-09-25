<script lang="ts">
	import { Button, Icon, IconButton, Select } from '$lib/components/ui';

	interface Props {
		canBack: boolean;
		canStep: boolean;
		canRun: boolean;
		/** Play steps automatically; off when the next step cannot run by itself. */
		canPlay: boolean;
		playing: boolean;
		/** Playback speed multiplier. */
		speed: number;
		/** Noun for the step buttons: "instruction" or "phase". */
		unit: string;
		onreset: () => void;
		onback: () => void;
		onstep: () => void;
		onrun: () => void;
		ontoggle: () => void;
		onspeed: (speed: number) => void;
		/** The Step button, for returning focus to it. */
		stepButton?: HTMLButtonElement;
	}

	let {
		canBack,
		canStep,
		canRun,
		canPlay,
		playing,
		speed,
		unit,
		onreset,
		onback,
		onstep,
		onrun,
		ontoggle,
		onspeed,
		stepButton = $bindable()
	}: Props = $props();

	const speeds = [
		{ value: 0.5, label: '0.5×' },
		{ value: 1, label: '1×' },
		{ value: 2, label: '2×' },
		{ value: 4, label: '4×' }
	];

	const guard = (enabled: boolean, action: () => void) => () => {
		if (enabled) action();
	};
</script>

<div class="controls" role="group" aria-label="Machine controls">
	<Button
		size="sm"
		variant="ghost"
		aria-disabled={!canBack}
		aria-keyshortcuts="Home"
		title="Reset the machine (Home)"
		onclick={guard(canBack, onreset)}
	>
		{#snippet icon()}<Icon name="reset" size={15} />{/snippet}
		Reset
	</Button>
	<Button
		size="sm"
		aria-disabled={!canBack}
		aria-keyshortcuts="ArrowLeft"
		title="Back one {unit} (←)"
		onclick={guard(canBack, onback)}
	>
		{#snippet icon()}<Icon name="step-back" size={15} />{/snippet}
		Back
	</Button>
	<Button
		size="sm"
		variant="primary"
		class="step"
		bind:element={stepButton}
		aria-disabled={!canStep}
		aria-keyshortcuts="ArrowRight"
		title="Step one {unit} (→)"
		onclick={guard(canStep, onstep)}
	>
		Step
		<Icon name="step-forward" size={15} />
	</Button>
	<Button
		size="sm"
		aria-disabled={!canRun}
		aria-keyshortcuts="End"
		title="Run to HALT, an error, or an IN that needs a value (End)"
		onclick={guard(canRun, onrun)}
	>
		Run
		<Icon name="last" size={15} />
	</Button>
	<span class="sep" aria-hidden="true"></span>
	<IconButton
		icon={playing ? 'pause' : 'play'}
		label={playing ? 'Pause' : 'Play: step automatically'}
		shortcut="Space"
		size="sm"
		aria-keyshortcuts="Space"
		aria-disabled={!playing && !canPlay}
		onclick={guard(playing || canPlay, ontoggle)}
	/>
	<Select
		label="Playback speed"
		hideLabel
		size="sm"
		options={speeds}
		value={speed}
		onchange={(v) => onspeed(v)}
	/>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.controls :global(.step) {
		min-width: 5.5rem;
	}
	.sep {
		width: 1px;
		height: 20px;
		margin: 0 2px;
		background: var(--border);
	}
</style>
