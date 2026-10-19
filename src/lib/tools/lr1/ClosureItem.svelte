<!--
	One LR(1) item as Bottom-up Parsing III writes the items of Closure and
	Transition (slides 10, 11 and 13): symbols spaced, the dot against the
	symbol after it (S → •E, $), drawn as a red bullet like LrItem's.
-->
<script lang="ts">
	import type { ItemView } from '$lib/components/grammar';
	import { closureItemParts } from './items';

	interface Props {
		item: ItemView;
		/** In square brackets, [E → •int, )], as in definitions and pseudocode. */
		brackets?: boolean;
	}

	let { item, brackets = false }: Props = $props();

	const parts = $derived(closureItemParts(item, brackets));
</script>

<span class="lr-item"
	>{#each parts as part, i (i)}{#if part.kind === 'dot'}<span class="dot">{part.text}</span
			>{:else}{part.text}{/if}{/each}</span
>

<style>
	.lr-item {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre;
	}
	/* As in LrItem: the decks' large red bullet, scaled so the line keeps its height. */
	.dot {
		display: inline-block;
		color: var(--reject);
		font-weight: 700;
		transform: scale(1.5);
	}
</style>
