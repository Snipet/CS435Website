<!--
@component
The partition after a round in set notation, P1 = { A, B } { C }, each block
with its number and color.
-->
<script lang="ts">
	import type { StateId } from '$lib/theory/automata';
	import BlockChip from './BlockChip.svelte';
	import { blockColor, setText, type Partition } from './refinement';

	interface Props {
		partition: Partition;
		round: number;
		name: (s: StateId) => string;
	}

	let { partition, round, name }: Props = $props();
</script>

<p class="partition">
	<span class="lead">P<sub>{round}</sub> =</span>
	{#each partition.blocks as b (b.id)}
		<span class="block" style="--g: {blockColor(b.tone)}">
			<BlockChip id={b.id} tone={b.tone} />
			<span class="set">{setText(b.states.map(name))}</span>
		</span>
	{/each}
</p>

<style>
	.partition {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.lead {
		margin-right: var(--space-1);
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-style: italic;
		white-space: nowrap;
	}
	.lead sub {
		font-size: 0.7em;
		font-style: normal;
	}
	.block {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 2px 10px 2px 3px;
		border: 1px solid color-mix(in srgb, var(--g) 30%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--g) 6%, var(--surface));
	}
	.set {
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		overflow-wrap: break-word;
	}
</style>
