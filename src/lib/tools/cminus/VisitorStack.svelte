<!--
	The calls in progress, innermost first: for each node the accept call
	(with the call that made it and the type of its pointer) and the visit
	method it called (with its local variables), and the driver at the
	bottom. A node's name selects it in the source. A deep stack scrolls
	inside its own box.
-->
<script lang="ts">
	import { rangeOf, type SourceRange } from './selection';
	import type { FrameRow } from './visitor-view';

	interface Props {
		/** Innermost first. */
		rows: readonly FrameRow[];
		onselect: (range: SourceRange) => void;
	}

	let { rows, onselect }: Props = $props();

	let box: HTMLOListElement | undefined = $state();
	const top = $derived(rows[0]?.key ?? -1);

	// The innermost call is at the top of the box.
	$effect(() => {
		void top;
		if (box) box.scrollTop = 0;
	});
</script>

<ol class="stack" aria-label="Call stack, innermost call first" bind:this={box}>
	{#each rows as row (row.key)}
		<li class={[row.kind, { top: row.top }]}>
			<div class="call">
				<span class="kind">{row.kind}</span>
				<code class="name">{row.name}</code>
			</div>
			{#if row.detail || row.span || row.locals.length}
				<div class="detail">
					{#if row.span}
						<button
							type="button"
							class="node"
							aria-label="Select {row.summary}, line {row.span.line}, in the source"
							onclick={() => onselect(rangeOf(row.span!))}>{row.summary}</button
						>
						<span class="cm-muted">line {row.span.line}</span>
					{/if}
					{#if row.detail}<code class="how">{row.detail}</code>{/if}
					{#each row.locals as v (v.name)}
						<code class="local">{v.name} = {v.value}</code>
					{/each}
				</div>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		max-height: min(26rem, 60vh);
		margin: 0;
		padding: 0;
		overflow: auto;
		overscroll-behavior: contain;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		min-width: 0;
		scrollbar-width: thin;
	}
	li {
		display: flex;
		flex-direction: column;
		flex: none;
		gap: 1px;
		min-width: 0;
		padding: 3px 10px 4px;
		border-left: 3px solid transparent;
		line-height: 1.45;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	/* The two calls of one node read as a pair: its visit above its accept. */
	li.accept + li.visit,
	li.accept + li.driver {
		border-top: 2px solid var(--border-strong);
	}
	li.top {
		border-left-color: var(--info);
		background: var(--info-soft);
	}
	li.driver {
		background: var(--surface-2);
	}
	.call {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}
	.kind {
		flex: none;
		width: 3.6rem;
		color: var(--text-3);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	code {
		padding: 0;
		border: 0;
		background: none;
		font-variant-ligatures: none;
	}
	.name {
		min-width: 0;
		font-size: 0.78125rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.detail {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-3);
		padding-left: calc(3.6rem + var(--space-2));
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.how,
	.local {
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}
	.local {
		color: var(--text);
	}
	.node {
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.node:hover {
		color: var(--accent-hover);
	}
	.node:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
</style>
