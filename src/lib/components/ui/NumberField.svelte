<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Size } from './types';

	interface Props {
		value: number;
		label: string;
		hideLabel?: boolean;
		inline?: boolean;
		min?: number;
		max?: number;
		step?: number;
		/** Unit text after the number, e.g. "chars". */
		suffix?: string;
		size?: Size;
		disabled?: boolean;
		id?: string;
		onchange?: (value: number) => void;
	}

	let {
		value = $bindable(),
		label,
		hideLabel = false,
		inline = false,
		min = -Infinity,
		max = Infinity,
		step = 1,
		suffix,
		size = 'md',
		disabled = false,
		id,
		onchange
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `number-${uid}`);

	// The text being edited; re-syncs whenever `value` changes from outside.
	let text = $derived(String(value));

	function clamp(n: number): number {
		const snapped =
			step > 0 && Number.isFinite(min) ? min + Math.round((n - min) / step) * step : n;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
	}

	function commit(n: number) {
		const next = clamp(n);
		if (next !== value) {
			value = next;
			onchange?.(next);
		}
		text = String(value);
	}

	function oninput(event: Event & { currentTarget: HTMLInputElement }) {
		text = event.currentTarget.value;
		const n = event.currentTarget.valueAsNumber;
		// Only accept complete, in-range numbers while typing; blur normalizes the rest.
		if (Number.isFinite(n) && n >= min && n <= max && n !== value) {
			value = n;
			onchange?.(n);
		}
	}

	function onblur(event: Event & { currentTarget: HTMLInputElement }) {
		const n = event.currentTarget.valueAsNumber;
		commit(Number.isFinite(n) ? n : value);
	}
</script>

<div class={['field', size, { inline }]}>
	<label class={['label', { 'visually-hidden': hideLabel }]} for={inputId}>{label}</label>
	<div class={['control', { disabled }]}>
		<button
			type="button"
			class="step"
			tabindex="-1"
			aria-label="Decrease {label}"
			disabled={disabled || value <= min}
			onclick={() => commit(value - step)}><Icon name="minus" size={14} /></button
		>
		<input
			id={inputId}
			type="number"
			inputmode="decimal"
			value={text}
			{min}
			{max}
			{step}
			{disabled}
			{oninput}
			{onblur}
			onkeydown={(e) => {
				if (e.key === 'Enter') commit(e.currentTarget.valueAsNumber);
			}}
		/>
		{#if suffix}<span class="suffix">{suffix}</span>{/if}
		<button
			type="button"
			class="step"
			tabindex="-1"
			aria-label="Increase {label}"
			disabled={disabled || value >= max}
			onclick={() => commit(value + step)}><Icon name="plus" size={14} /></button
		>
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
		display: inline-flex;
		align-items: stretch;
		width: fit-content;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
		transition: border-color var(--duration) var(--ease);
	}
	.control:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	.control.disabled {
		opacity: 0.5;
	}
	.md .control {
		height: 36px;
	}
	.sm .control {
		height: 30px;
	}
	input {
		width: 5ch;
		min-width: 0;
		padding: 0 2px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	input:focus {
		outline: none;
	}
	.suffix {
		display: flex;
		align-items: center;
		padding-right: 6px;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.step {
		display: grid;
		place-items: center;
		width: 30px;
		border: 0;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.sm .step {
		width: 26px;
	}
	.step:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text);
	}
	.step:disabled {
		color: var(--text-3);
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
