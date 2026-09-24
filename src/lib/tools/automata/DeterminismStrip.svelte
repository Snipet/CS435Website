<!--
@component
Says whether the machine is a DFA, a partial DFA, or an NFA, and lists what
decides it. Choosing an item highlights it in the diagram.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { DeterminismSummary, StripItem } from './determinism';
	import Segs from './Segs.svelte';

	interface Props {
		summary: DeterminismSummary;
		/** Key of the highlighted item. */
		focused: string | null;
		onfocus: (item: StripItem | null) => void;
		/** Links shown at the end (e.g. to another tool). */
		links?: Snippet;
	}

	let { summary, focused, onfocus, links }: Props = $props();

	const LIMIT = 12;
	let expanded = $state(false);
	const shown = $derived(expanded ? summary.items : summary.items.slice(0, LIMIT));
	const tone = $derived(
		summary.title === 'Empty'
			? 'muted'
			: summary.kind === 'dfa'
				? 'accept'
				: summary.kind === 'partial-dfa'
					? 'info'
					: 'epsilon'
	);
	const label = (item: StripItem) =>
		item.kind === 'missing'
			? 'Missing transitions'
			: item.kind === 'epsilon'
				? 'ε-move'
				: 'Several transitions on one symbol';
</script>

<div class="strip" role="group" aria-label="Determinism">
	<div class="head">
		<Badge {tone} variant="solid">{summary.title}</Badge>
		<span class="detail">{summary.detail}</span>
		{#if links}<span class="links">{@render links()}</span>{/if}
	</div>
	{#if summary.items.length}
		<ul class="items">
			{#each shown as item (item.key)}
				<li>
					<button
						type="button"
						class={['item', item.kind]}
						aria-pressed={focused === item.key}
						title="{label(item)}: highlight in the diagram"
						onclick={() => onfocus(focused === item.key ? null : item)}
					>
						<Segs segs={item.segs} />
					</button>
				</li>
			{/each}
			{#if summary.items.length > LIMIT}
				<li>
					<button type="button" class="more" onclick={() => (expanded = !expanded)}>
						{expanded ? 'Show fewer' : `${summary.items.length - LIMIT} more`}
					</button>
				</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.strip {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.detail {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.links {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-left: auto;
		font-size: var(--text-sm);
	}
	.items {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.item,
	.more {
		display: inline-block;
		padding: 2px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		line-height: 1.5;
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.item:hover,
	.more:hover {
		background: var(--surface-2);
	}
	.item.epsilon {
		border-color: color-mix(in srgb, var(--epsilon) 40%, var(--border));
	}
	.item[aria-pressed='true'] {
		border-color: var(--info);
		background: var(--info-soft);
	}
	.more {
		color: var(--accent);
	}
</style>
