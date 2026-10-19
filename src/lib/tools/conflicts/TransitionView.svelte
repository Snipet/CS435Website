<!--
	Part of the state before a conflict's state and part of the conflict's
	state, joined by ⇒ with the symbol between them as a superscript
	(Bottom-up Parsing III, slides 18, 20, 21): each conflict item beside the
	item it moved from, and … for the items left out. With mode "full", the
	whole states, as on slide 25, with the conflict items marked.
-->
<script lang="ts">
	import { LrItem } from '$lib/components/grammar';
	import type { ConflictContext } from './context';
	import type { ItemsView } from './state';

	interface Props {
		context: ConflictContext;
		/** The conflict's state. */
		state: number;
		mode: ItemsView;
	}

	let { context, state, mode }: Props = $props();

	const from = $derived(context.from);
	const fromMarked = $derived(new Set(context.fromMarked));
	const toMarked = $derived(new Set(context.toMarked));
	/** The partial view leaves items out of a state. */
	const moreLeft = $derived(context.fromItems.length > context.rows.filter((r) => r.left).length);
	const moreRight = $derived(context.toItems.length > context.rows.length);
	// What the marks say to a screen reader, with the spaces that keep it apart from the items.
	const movesOn = $derived(` moves on ${from?.symbol} to `);
	const MOVES_TO = 'moves to a conflict item: ';
	const CONFLICT_ITEM = 'conflict item: ';
</script>

{#snippet arrow()}
	<span class="arrow" aria-hidden="true">⇒<sup>{from?.symbol}</sup></span><span
		class="visually-hidden">{movesOn}</span
	>
{/snippet}

<div class={['transition', mode]}>
	{#if mode === 'partial'}
		<div class="pairs" style:--columns={from ? 3 : 1}>
			{#if from}
				<div class="caption">State {from.state}</div>
				<div></div>
			{/if}
			<div class="caption">State {state}</div>
			{#each context.rows as row, i (i)}
				{#if from}
					<div class="item">
						{#if row.left}<LrItem item={row.left} />{:else}<span class="visually-hidden"
								>no item moves to it</span
							>{/if}
					</div>
					{#if i === 0}<div
							class="arrow-cell"
							style:grid-column="2"
							style:grid-row="2 / span {context.rows.length}"
						>
							{@render arrow()}
						</div>{/if}
				{/if}
				<div class="item"><LrItem item={row.right} /></div>
			{/each}
			{#if from}<div class="omitted">{moreLeft ? '…' : ''}</div>
				<div></div>{/if}
			<div class="omitted">{moreRight ? '…' : ''}</div>
		</div>
	{:else}
		<div class="states">
			{#if from}
				<div class="column">
					<div class="caption">State {from.state}</div>
					<ul>
						{#each context.fromItems as item, i (i)}
							<li class={{ marked: fromMarked.has(i) }}>
								{#if fromMarked.has(i)}<span class="visually-hidden">{MOVES_TO}</span>{/if}<LrItem
									{item}
								/>
							</li>
						{/each}
					</ul>
				</div>
				<div class="arrow-cell">{@render arrow()}</div>
			{/if}
			<div class="column">
				<div class="caption">State {state}</div>
				<ul>
					{#each context.toItems as item, i (i)}
						<li class={{ marked: toMarked.has(i) }}>
							{#if toMarked.has(i)}<span class="visually-hidden">{CONFLICT_ITEM}</span>{/if}<LrItem
								{item}
							/>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</div>

<style>
	.transition {
		max-width: 100%;
		overflow-x: auto;
		font-size: var(--text-sm);
		scrollbar-width: thin;
	}
	.pairs {
		display: inline-grid;
		grid-template-columns: repeat(var(--columns), auto);
		align-items: center;
		gap: 2px var(--space-4);
	}
	.caption {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.item {
		white-space: nowrap;
	}
	.arrow-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		align-self: center;
	}
	.arrow {
		font-family: var(--font-sans);
		font-size: 1.5em;
		line-height: 1;
		white-space: nowrap;
	}
	.arrow sup {
		font-family: var(--font-mono);
		font-size: 0.55em;
		font-variant-ligatures: none;
	}
	.omitted {
		color: var(--text-2);
		line-height: 1;
	}
	.states {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.column {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.column ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.column li {
		padding: 0 6px;
		border-left: 3px solid transparent;
		white-space: nowrap;
	}
	.column li.marked {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
</style>
