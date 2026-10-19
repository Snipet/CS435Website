<!--
	Why the selected entry of the LL(1) table holds what it holds, in the words
	of Table-based Predictive Parsing, slide 25 ("Y → * T in columns of
	First( *T ) = { * }"), or why it is blank.
-->
<script lang="ts">
	import { Badge, CitationTag } from '$lib/components/ui';
	import type { EntryView } from './model';

	interface Props {
		view: EntryView | null;
	}

	let { view }: Props = $props();
</script>

<div class="entry" aria-live="polite">
	{#if view}
		<p class="head">
			<span class="name mono">{view.name}</span>
			{#if view.kind === 'blank'}
				<Badge tone="muted">Blank: error</Badge>
			{:else if view.kind === 'conflict'}
				<Badge tone="reject">Multiply defined</Badge>
			{/if}
		</p>
		{#if view.kind === 'blank'}
			<p class="lead">No production goes in this entry:</p>
		{/if}
		<ul>
			{#each view.lines as line, i (i)}<li class="mono">{line}</li>{/each}
		</ul>
		<p class="where">
			{#if view.kind === 'blank'}
				<CitationTag cite={{ deck: '12', slide: 9 }} />
			{:else}
				<CitationTag cite={{ deck: '12', slide: [24, 25] }} />
			{/if}
		</p>
	{:else}
		<p class="empty">
			Select an entry: the productions in it, and the First or Follow set that put each one there,
			are listed here.
		</p>
	{/if}
</div>

<style>
	.entry {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	p {
		margin: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.name {
		font-weight: 600;
	}
	.lead,
	.empty {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.empty {
		color: var(--text-3);
	}
	ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding-left: 1.1rem;
		font-size: var(--text-sm);
	}
	li {
		overflow-wrap: anywhere;
	}
</style>
