<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import type { Size } from './types';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'size' | 'type' | 'onsubmit'> {
		value?: string;
		label: string;
		hideLabel?: boolean;
		inline?: boolean;
		/** Helper text under the label. */
		description?: string;
		/** Error text under the field; also marks it invalid. */
		error?: string;
		type?: 'text' | 'search';
		mono?: boolean;
		size?: Size;
		/** Called with the value when Enter is pressed. */
		onsubmit?: (value: string) => void;
		element?: HTMLInputElement;
	}

	let {
		value = $bindable(''),
		label,
		hideLabel = false,
		inline = false,
		description,
		error,
		type = 'text',
		mono = false,
		size = 'md',
		id,
		onsubmit,
		onkeydown,
		element = $bindable(),
		...rest
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `text-${uid}`);
	const describedBy = $derived(
		[description && `${inputId}-desc`, error && `${inputId}-err`].filter(Boolean).join(' ') ||
			undefined
	);
</script>

<div class={['field', size, { inline }]}>
	<label class={['label', { 'visually-hidden': hideLabel }]} for={inputId}>{label}</label>
	{#if description}<span class="desc" id="{inputId}-desc">{description}</span>{/if}
	<input
		bind:this={element}
		bind:value
		id={inputId}
		{type}
		class={{ mono }}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		autocomplete="off"
		onkeydown={(e) => {
			onkeydown?.(e);
			if (e.key === 'Enter' && !e.isComposing && onsubmit) {
				e.preventDefault();
				onsubmit(value);
			}
		}}
		{...rest}
	/>
	{#if error}<span class="error" id="{inputId}-err">{error}</span>{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.field.inline {
		flex-direction: row;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-2);
	}
	.desc {
		margin-top: -2px;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	input {
		width: 100%;
		min-width: 0;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		transition: border-color var(--duration) var(--ease);
	}
	.inline input {
		width: auto;
		flex: 1;
	}
	.md input {
		height: 36px;
	}
	.sm input {
		height: 30px;
		padding: 0 8px;
	}
	input.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:hover {
		border-color: var(--text-3);
	}
	input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	input[aria-invalid='true'] {
		border-color: var(--reject);
	}
	input:disabled {
		opacity: 0.5;
	}
	.error {
		font-size: var(--text-xs);
		color: var(--reject);
	}
</style>
