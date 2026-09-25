<!--
@component
A run written as transitions, `A →b C →b C`, with each symbol as a superscript
on its arrow (docs/ARCHITECTURE.md §3.4). A long run wraps after an arrow, so
state names stay whole.
-->
<script lang="ts">
	interface Props {
		/** State names, first to last. */
		states: readonly string[];
		/** Symbol shown on each arrow; `symbols[i]` leads from `states[i]`. */
		symbols: readonly string[];
	}

	let { states, symbols }: Props = $props();
</script>

<span class="path"
	>{#each states as s, i (i)}{#if i > 0}<span class="arrow"
				>→<sup>{symbols[i - 1]}</sup><span class="visually-hidden">, then</span></span
			><wbr />{/if}<span class="state">{s}</span>{/each}</span
>

<style>
	.path {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
	}
	.arrow {
		margin: 0 0.3em;
		color: var(--text-3);
		white-space: nowrap;
	}
	sup {
		margin-left: 1px;
		color: var(--text-2);
		font-size: 0.72em;
	}
	.state {
		color: var(--text);
		/* Only a single name wider than the line breaks inside. */
		overflow-wrap: anywhere;
	}
</style>
