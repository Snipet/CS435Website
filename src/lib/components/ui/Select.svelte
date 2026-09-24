<script lang="ts" generics="T extends string | number">
	import Icon from './Icon.svelte';
	import type { Size } from './types';

	interface Option {
		value: T;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		options: readonly Option[];
		value: T;
		/** Visible label (or accessible name when `hideLabel`). */
		label: string;
		hideLabel?: boolean;
		/** Place the label beside the control instead of above it. */
		inline?: boolean;
		size?: Size;
		disabled?: boolean;
		id?: string;
		onchange?: (value: T) => void;
	}

	let {
		options,
		value = $bindable(),
		label,
		hideLabel = false,
		inline = false,
		size = 'md',
		disabled = false,
		id,
		onchange
	}: Props = $props();

	const uid = $props.id();
	const selectId = $derived(id ?? `select-${uid}`);
	const index = $derived(options.findIndex((o) => o.value === value));

	function change(event: Event & { currentTarget: HTMLSelectElement }) {
		const opt = options[Number(event.currentTarget.value)];
		if (!opt) return;
		value = opt.value;
		onchange?.(opt.value);
	}
</script>

<div class={['field', size, { inline }]}>
	<label class={['label', { 'visually-hidden': hideLabel }]} for={selectId}>{label}</label>
	<div class="control">
		<select id={selectId} value={String(index)} {disabled} onchange={change}>
			{#each options as opt, i (i)}
				<option value={String(i)} disabled={opt.disabled}>{opt.label}</option>
			{/each}
		</select>
		<span class="chevron" aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
	</div>
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
		gap: var(--space-2);
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-2);
		white-space: nowrap;
	}
	.control {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}
	select {
		appearance: none;
		width: 100%;
		min-width: 0;
		padding: 0 30px 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: border-color var(--duration) var(--ease);
	}
	.md select {
		height: 36px;
	}
	.sm select {
		height: 30px;
		padding-left: 8px;
		padding-right: 26px;
		font-size: var(--text-xs);
	}
	select:hover {
		border-color: var(--text-3);
	}
	select:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.chevron {
		position: absolute;
		right: 9px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		color: var(--text-3);
		pointer-events: none;
	}
	.sm .chevron {
		right: 7px;
	}
</style>
