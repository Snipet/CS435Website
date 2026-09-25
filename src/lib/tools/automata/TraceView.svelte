<!--
@component
The path of a run in lecture notation, A →¹ A →⁰ B for a DFA and
{ A } →¹ { A, B } for an NFA. Each state (or set) jumps to its step.
-->
<script lang="ts">
	import type { TraceItem } from './run';

	interface Props {
		trace: readonly TraceItem[];
		/** Index of the item the current step belongs to. */
		current: number;
		onselect: (step: number) => void;
	}

	let { trace, current, onselect }: Props = $props();
</script>

<ol class="trace" aria-label="Path of the run">
	{#each trace as item, i (i)}
		<li class={{ past: i < current, now: i === current, future: i > current }}>
			{#if item.symbol !== undefined}
				<span class="arrow" aria-label="on {item.symbol}">→<sup>{item.symbol}</sup></span>
			{/if}
			<button
				type="button"
				class={['node', { set: item.isSet, stuck: item.stuck }]}
				aria-current={i === current ? 'step' : undefined}
				onclick={() => onselect(item.step)}>{item.text}</button
			>
		</li>
	{/each}
</ol>

<style>
	.trace {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 0;
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1.8;
	}
	li {
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
	}
	.arrow {
		margin: 0 0.35em;
		color: var(--text-3);
	}
	sup {
		margin-left: 1px;
		font-size: 0.75em;
	}
	.node {
		padding: 0 5px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.node.set {
		font-weight: 500;
	}
	.node:hover {
		background: var(--surface-2);
	}
	.future .node,
	.future .arrow {
		color: var(--text-3);
	}
	.future .node {
		font-weight: 400;
	}
	.now .node {
		border-color: var(--active);
		background: var(--active-soft);
	}
	.node.stuck {
		color: var(--reject);
		font-family: var(--font-sans);
		font-style: italic;
		font-weight: 500;
	}
</style>
