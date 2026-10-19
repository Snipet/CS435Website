<!--
	A configuration of a shift-reduce parser (§3.10): the stack, the red divider
	I, then the next terminal and … for the rest of the input: E * E I + …
-->
<script lang="ts">
	import { DIVIDER, configurationParts } from './view';

	interface Props {
		stack: readonly string[];
		/** The next terminal; null once it has been shifted. */
		next: string | null;
	}

	let { stack, next }: Props = $props();

	const parts = $derived(configurationParts(stack, next));
	/** Text around the divider, with the spaces that separate it. */
	const before = $derived(parts.stack ? `${parts.stack} ` : '');
	const after = $derived(`${parts.next ? ` ${parts.next}` : ''}${parts.rest ? ' …' : ''}`);
	const SPOKEN_DIVIDER = ' divider';
</script>

<span class="config"
	>{before}<span class="divider" aria-hidden="true">{DIVIDER}</span><span class="visually-hidden"
		>{SPOKEN_DIVIDER}</span
	>{after}</span
>

<style>
	.config {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.divider {
		color: var(--reject);
		font-family: var(--font-sans);
		font-weight: 700;
	}
</style>
