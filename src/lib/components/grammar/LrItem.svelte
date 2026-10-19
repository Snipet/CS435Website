<!--
	One LR item in the decks' notation (docs/ARCHITECTURE.md §3.10): bracketed
	[E → E + • ( E ), +], spaced, or compact as in a state box (E → E+(•E), $/+),
	with the dot as a red bullet.
-->
<script lang="ts">
	import { itemParts, type ItemStyle, type ItemView } from './lr-item';

	interface Props {
		item: ItemView;
		/** `bracketed` (default), `spaced` or `compact`. */
		style?: ItemStyle;
	}

	let { item, style = 'bracketed' }: Props = $props();

	const parts = $derived(itemParts(item, style));
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
	.dot {
		color: var(--reject);
		font-weight: 700;
	}
</style>
