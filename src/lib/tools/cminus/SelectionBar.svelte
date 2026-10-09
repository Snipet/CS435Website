<!--
	The selection in words: where it is, its text, and how much of every phase
	belongs to it, with a button to clear it.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui';
	import type { SelectionSummary } from './selection';

	interface Props {
		summary: SelectionSummary | null;
		onclear: () => void;
	}

	let { summary, onclear }: Props = $props();
</script>

<div class={['bar', { empty: !summary }]}>
	<p class="text" role="status">
		{#if summary}
			<span class="where">{summary.where}:</span>
			<code class="piece">{summary.text}</code>
			<span class="counts"><span aria-hidden="true">—</span> {summary.counts.join(', ')}</span>
		{:else}
			Nothing is selected. A token, a tree node, a symbol, a quad, an instruction or the caret in
			the source selects a piece of the program; every view then marks what belongs to it.
		{/if}
	</p>
	{#if summary}
		<Button size="sm" variant="ghost" onclick={onclear}>Clear selection</Button>
	{/if}
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--active) 45%, var(--border));
		border-left: 3px solid var(--active);
		border-radius: var(--radius);
		background: var(--active-soft);
	}
	.bar.empty {
		border-color: var(--border);
		border-left-color: var(--border-strong);
		background: var(--surface-2);
	}
	.text {
		flex: 1 1 16rem;
		min-width: 0;
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.empty .text {
		color: var(--text-2);
	}
	.where {
		font-weight: 600;
	}
	.piece {
		padding: 0 0.35em;
		border: 1px solid color-mix(in srgb, var(--active) 35%, var(--border));
		border-radius: var(--radius-sm);
		background: var(--surface);
		overflow-wrap: anywhere;
	}
	.counts {
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
</style>
