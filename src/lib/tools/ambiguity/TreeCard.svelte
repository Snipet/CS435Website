<!--
	One parse tree of the string with its number, the grouping it stands for and,
	below the drawing, whatever the page lists for it (bracket form, derivation,
	value, the reason it is crossed out).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		ParseTreeView,
		type TreeHighlight,
		type TreeLabeler,
		type TreeTone
	} from '$lib/components/grammar';
	import { toneColors } from '$lib/components/ui';
	import type { ParseNode } from '$lib/theory/grammar';

	interface Props {
		/** "Tree 1". */
		title: string;
		/** The grouping the tree stands for: `(int * int) + int`. */
		grouping?: string;
		tree: ParseNode;
		tone: TreeTone;
		labels?: TreeLabeler;
		highlight?: TreeHighlight;
		/** Crossed out with a large X. */
		rejected?: boolean;
		/** Heading level of the title. */
		level?: 3 | 4;
		labelSize?: number;
		/** After the title, e.g. a badge. */
		status?: Snippet;
		/** Rows under the drawing. */
		children?: Snippet;
	}

	let {
		title,
		grouping,
		tree,
		tone,
		labels,
		highlight,
		rejected = false,
		level = 3,
		labelSize = 16,
		status,
		children
	}: Props = $props();

	const swatch = $derived(toneColors(tone).fg);
</script>

<article class={['tree-card', { rejected }]}>
	<header class="head">
		<svelte:element this={`h${level}`} class="title">
			<span class="swatch" style="background: {swatch}" aria-hidden="true"></span>
			{title}
		</svelte:element>
		{#if grouping}<span class="grouping" title="The grouping this tree stands for">{grouping}</span
			>{/if}
		{#if status}<span class="status">{@render status()}</span>{/if}
	</header>
	<div class="drawing">
		<ParseTreeView
			{tree}
			{tone}
			{labels}
			{highlight}
			{rejected}
			{labelSize}
			ariaLabel={grouping ? `${title}, ${grouping}` : title}
		/>
	</div>
	{#if children}<div class="rows">{@render children()}</div>{/if}
</article>

<style>
	.tree-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--space-3);
		min-height: 40px;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
		white-space: nowrap;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.grouping {
		min-width: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.status {
		display: inline-flex;
		margin-left: auto;
	}
	.drawing {
		display: flex;
		flex: 1;
		align-items: flex-start;
		justify-content: center;
		min-width: 0;
		padding: var(--space-3) var(--space-2);
	}
	.drawing > :global(.parse-tree) {
		flex: 1;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		border-top: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface-2) 55%, transparent);
		border-radius: 0 0 var(--radius) var(--radius);
		font-size: var(--text-sm);
	}
	/* A card with nothing to list under its tree has no rows. */
	.rows:not(:has(*)),
	.status:not(:has(*)) {
		display: none;
	}
</style>
