<!--
	The result of the bounded check that a rewritten grammar generates the
	strings of the grammar as written (compare.ts). The page computes it off
	the main thread with a WorkerTask and passes what it has.
-->
<script lang="ts" module>
	import type { TaskStatus } from '$lib/components/ui';
	import type { CompareResult } from './compare';

	/** A comparison as the page holds it. */
	export interface Comparison {
		/** The newest finished comparison; null before the first. */
		result: CompareResult | null;
		/** `result` is for other grammars than the ones shown now. */
		stale: boolean;
		status: TaskStatus;
		error: string | null;
	}
</script>

<script lang="ts">
	import { Badge, Callout, Updating } from '$lib/components/ui';
	import { compareSummary } from './compare';

	interface Props {
		comparison: Comparison;
		/** What the second grammar is called in the lists. */
		name?: string;
	}

	let { comparison, name = 'the rewritten grammar' }: Props = $props();

	const result = $derived(comparison.result);
	const stale = $derived(comparison.stale);
	const failed = $derived(comparison.status === 'timed-out' || comparison.status === 'error');
	const summary = $derived(result ? compareSummary(result) : null);
	const done = $derived(result?.status === 'done' ? result : null);
	const strings = (n: number) => `${n} ${n === 1 ? 'string' : 'strings'}`;
</script>

{#snippet side(title: string, only: { count: number; examples: string[] })}
	{#if only.count > 0}
		<div class="side">
			<p class="side-title">{title} <span class="count">({strings(only.count)})</span></p>
			<ul class="sentences">
				{#each only.examples as sentence, i (i)}
					<li>{sentence}</li>
				{/each}
				{#if only.count > only.examples.length}
					<li class="more">… and {only.count - only.examples.length} more</li>
				{/if}
			</ul>
		</div>
	{/if}
{/snippet}

<div class="same" aria-live="polite" aria-busy={stale && !failed}>
	{#if comparison.status === 'timed-out'}
		<Callout tone="warn">
			<p>Listing the strings of these grammars takes too long, so they are not compared.</p>
		</Callout>
	{:else if comparison.status === 'error'}
		<Callout tone="error">
			<p>The comparison stopped: {comparison.error ?? 'unknown error'}</p>
		</Callout>
	{:else if !summary || (stale && result?.status === 'none')}
		<p class="line"><Updating label="Comparing…" standalone /></p>
	{:else}
		<div class={['outcome', { 'stale-data': stale }]}>
			<p class="line">
				{#if summary.same === true}<Badge tone="accept">Same strings</Badge>
				{:else if summary.same === false}<Badge tone="reject">Different</Badge>{/if}
				<span>{summary.text}</span>
				{#if stale}<Updating />{/if}
			</p>
			{#if done && summary.same === false}
				{@render side('Only the grammar as written generates', done.onlyOriginal)}
				{@render side(`Only ${name} generates`, done.onlyRewritten)}
			{/if}
			{#if done && done.checkedUpTo >= 1 && done.checkedUpTo < done.maxLength}
				<p class="note">There are too many longer strings to list.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.same {
		min-width: 0;
	}
	.outcome {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.side {
		min-width: 0;
	}
	.side-title {
		margin: 0 0 4px;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.count {
		color: var(--text-3);
		font-weight: 400;
	}
	.sentences {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sentences li {
		padding: 1px 7px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.sentences li.more {
		border-color: transparent;
		background: none;
		color: var(--text-3);
		font-family: var(--font-sans);
	}
</style>
