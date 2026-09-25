<!--
	A compact field for one language name; `'` becomes a prime when the field
	is left. The field is as wide as its name: `field-sizing: content` where
	supported, elsewhere a width in `ch` from the name's length.
-->
<script lang="ts">
	import { fieldChars, MAX_LABEL, normalizePrimes } from './labels';

	interface Props {
		value: string;
		/** Accessible name. */
		label: string;
		placeholder?: string;
		invalid?: boolean;
		describedby?: string;
	}

	let { value = $bindable(), label, placeholder, invalid = false, describedby }: Props = $props();

	const chars = $derived(fieldChars(value, placeholder));
</script>

<input
	class="lang-input"
	type="text"
	bind:value
	style:--chars={chars}
	aria-label={label}
	aria-invalid={invalid ? 'true' : undefined}
	aria-describedby={describedby}
	{placeholder}
	maxlength={MAX_LABEL}
	autocomplete="off"
	autocapitalize="off"
	spellcheck="false"
	onchange={() => {
		const next = normalizePrimes(value);
		if (next !== value) value = next;
	}}
/>

<style>
	/* A field grows with its name (M_NATIVE) and the short ones give way. */
	.lang-input {
		flex: 1 1 auto;
		/* The name in monospace characters, plus padding, border and the caret. */
		width: calc(var(--chars, 1) * 1ch + 20px);
		min-width: 2.5rem;
		height: 32px;
		padding: 0 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		transition: border-color var(--duration) var(--ease);
	}
	/* Where supported, the browser measures the text itself. */
	@supports (field-sizing: content) {
		.lang-input {
			width: auto;
			field-sizing: content;
		}
	}
	.lang-input::placeholder {
		color: var(--text-3);
	}
	.lang-input:placeholder-shown {
		border-style: dashed;
	}
	.lang-input:hover {
		border-color: var(--text-3);
	}
	.lang-input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	.lang-input[aria-invalid='true'] {
		border-color: var(--reject);
	}
</style>
