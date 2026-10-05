<!-- A labelled row under a tree: "Bracket form", "Value", "Leftmost derivation". -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** Formal notation: set in the mono font. */
		mono?: boolean;
		children: Snippet;
	}

	let { label, mono = false, children }: Props = $props();
</script>

<div class="fact">
	<span class="label">{label}</span>
	<div class={['value', { mono }]}>{@render children()}</div>
</div>

<style>
	.fact {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.value {
		min-width: 0;
		color: var(--text);
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.value.mono {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-ligatures: none;
	}
</style>
