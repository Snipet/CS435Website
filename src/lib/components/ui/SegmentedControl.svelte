<script lang="ts" generics="T extends string | number | boolean">
	import Icon, { type IconName } from './Icon.svelte';
	import type { Size } from './types';

	interface Option {
		value: T;
		label: string;
		icon?: IconName;
		/** Tooltip, e.g. a longer description. */
		title?: string;
		disabled?: boolean;
	}

	interface Props {
		options: readonly Option[];
		value: T;
		/** Accessible name of the group (required: segmented controls rarely have a visible label). */
		label: string;
		/** Show `label` as a visible caption before the control. */
		showLabel?: boolean;
		size?: Size;
		/** Mono font for option labels (e.g. notation choices). */
		mono?: boolean;
		onchange?: (value: T) => void;
	}

	let {
		options,
		value = $bindable(),
		label,
		showLabel = false,
		size = 'md',
		mono = false,
		onchange
	}: Props = $props();

	const uid = $props.id();
	const name = `seg-${uid}`;
</script>

<div class={['segmented-wrap', size]}>
	{#if showLabel}<span class="caption" id="{name}-label">{label}</span>{/if}
	<div
		class="segmented"
		role="radiogroup"
		aria-label={showLabel ? undefined : label}
		aria-labelledby={showLabel ? `${name}-label` : undefined}
	>
		{#each options as opt, i (i)}
			<label class={['seg', { mono, disabled: opt.disabled }]} title={opt.title}>
				<input
					type="radio"
					{name}
					value={opt.value}
					checked={opt.value === value}
					disabled={opt.disabled}
					onchange={() => {
						value = opt.value;
						onchange?.(opt.value);
					}}
				/>
				<span class="face">
					{#if opt.icon}<Icon name={opt.icon} size={size === 'sm' ? 14 : 16} />{/if}
					{opt.label}
				</span>
			</label>
		{/each}
	</div>
</div>

<style>
	.segmented-wrap {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		max-width: 100%;
	}
	.caption {
		font-size: var(--text-sm);
		color: var(--text-2);
		font-weight: 500;
	}
	.segmented {
		display: inline-flex;
		max-width: 100%;
		overflow-x: auto;
		padding: 2px;
		gap: 2px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		scrollbar-width: none;
	}
	.seg {
		position: relative;
		display: inline-flex;
		cursor: pointer;
	}
	.seg.disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		pointer-events: none;
	}
	.face {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
		transition:
			background var(--duration) var(--ease),
			color var(--duration) var(--ease),
			box-shadow var(--duration) var(--ease);
	}
	.md .face {
		height: 30px;
	}
	.sm .face {
		height: 24px;
		padding: 0 9px;
		font-size: var(--text-xs);
	}
	.mono .face {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.seg:hover .face {
		color: var(--text);
	}
	input:checked + .face {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	input:focus-visible + .face {
		outline: 2px solid var(--focus);
		outline-offset: 0;
	}
</style>
