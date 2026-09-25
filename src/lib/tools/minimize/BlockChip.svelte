<!--
@component
A partition block's number in its color. The colors follow the group outlines
of AutomatonView, so a chip matches its block in the diagram.
-->
<script lang="ts">
	import { blockColor } from './refinement';

	interface Props {
		/** Display number of the block. */
		id: number;
		/** Palette index 0–5. */
		tone: number;
		/** Stronger outline, e.g. for a cell that decides a split. */
		strong?: boolean;
		/** Announce "block" before the number (off when the text already says "block"). */
		prefix?: boolean;
	}

	let { id, tone, strong = false, prefix = true }: Props = $props();
</script>

<span class={['chip', { strong }]} style="--g: {blockColor(tone)}" title="Block {id}"
	>{#if prefix}<span class="visually-hidden">block </span>{/if}{id}</span
>

<style>
	.chip {
		display: inline-grid;
		place-items: center;
		flex: none;
		min-width: 1.45rem;
		height: 1.3rem;
		padding: 0 5px;
		border: 1px solid color-mix(in srgb, var(--g) 48%, transparent);
		border-radius: 5px;
		background: color-mix(in srgb, var(--g) 13%, var(--surface));
		color: color-mix(in srgb, var(--g) 78%, var(--text));
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-ligatures: none;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		line-height: 1;
		vertical-align: middle;
	}
	.strong {
		border-color: var(--g);
		box-shadow: 0 0 0 1px var(--g);
	}
</style>
