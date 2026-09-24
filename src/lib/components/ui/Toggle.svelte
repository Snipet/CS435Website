<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		checked?: boolean;
		/** Visible label. */
		label?: string;
		/** Rich label instead of `label`. */
		children?: Snippet;
		/** Smaller helper text under the label. */
		description?: string;
		disabled?: boolean;
		id?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		label,
		children,
		description,
		disabled = false,
		id,
		onchange
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `toggle-${uid}`);
</script>

<label class={['toggle', { disabled }]} for={inputId}>
	<input
		id={inputId}
		type="checkbox"
		role="switch"
		bind:checked
		{disabled}
		aria-describedby={description ? `${inputId}-desc` : undefined}
		onchange={() => onchange?.(checked)}
	/>
	<span class="track" aria-hidden="true"><span class="thumb"></span></span>
	<span class="text">
		<span class="label"
			>{#if children}{@render children()}{:else}{label}{/if}</span
		>
		{#if description}<span class="desc" id="{inputId}-desc">{description}</span>{/if}
	</span>
</label>

<style>
	.toggle {
		position: relative;
		display: inline-flex;
		align-items: flex-start;
		gap: 10px;
		cursor: pointer;
		font-size: var(--text-sm);
		line-height: 1.4;
		user-select: none;
	}
	.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
		pointer-events: none;
	}
	.track {
		position: relative;
		flex: none;
		width: 34px;
		height: 20px;
		margin-top: 0;
		border-radius: 999px;
		background: var(--surface-3);
		border: 1px solid var(--border-strong);
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration) var(--ease);
	}
	input:checked + .track {
		background: var(--accent);
		border-color: var(--accent);
	}
	input:checked + .track .thumb {
		transform: translateX(14px);
		background: var(--accent-contrast);
	}
	input:focus-visible + .track {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.label {
		color: var(--text);
		font-weight: 500;
	}
	.desc {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
