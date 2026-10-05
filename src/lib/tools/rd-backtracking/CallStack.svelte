<!--
	The calls in progress, innermost first. A non-terminal's function shows its
	save; a production's function shows its production.
-->
<script lang="ts">
	import Pieces from './Pieces.svelte';
	import { pointerPlace, type StackRow } from './view';

	interface Props {
		/** Innermost first. */
		rows: readonly StackRow[];
		tokens: readonly string[];
		/** Rows drawn before the rest is summed up in one line. */
		limit?: number;
	}

	let { rows, tokens, limit = 14 }: Props = $props();

	const shown = $derived(rows.slice(0, limit));
	const hidden = $derived(rows.length - shown.length);
</script>

{#if rows.length === 0}
	<p class="none">No call in progress.</p>
{:else}
	<ol class="stack" aria-label="Call stack, innermost call first">
		{#each shown as row, i (rows.length - i)}
			<li class={{ top: i === 0 }}>
				<span class="name"><Pieces pieces={row.name} /></span>
				{#if row.save !== null}
					{@const place = pointerPlace(row.save, tokens)}
					<span class="detail">
						<span class="var">save</span> →
						{#if place.token !== null}<span class="var token">{place.token}</span>{/if}
						{place.where}
					</span>
				{:else if row.production}
					<span class="detail production">{row.production}</span>
				{/if}
			</li>
		{/each}
		{#if hidden > 0}
			<li class="more">… {hidden} more below</li>
		{/if}
	</ol>
{/if}

<style>
	.none {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.stack {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 var(--space-3);
		padding: 5px 10px;
		border-left: 3px solid transparent;
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li.top {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
	.name {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-weight: 600;
	}
	.detail {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.var,
	.production {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.token {
		padding: 0 0.35em;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		color: var(--text);
	}
	li.top .token {
		background: color-mix(in srgb, var(--surface) 70%, transparent);
	}
	.more {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
