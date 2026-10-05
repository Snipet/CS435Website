<!--
	The calls in progress, innermost first: each function with the line it was
	called from and the token it was entered on and, in the functions that
	build an AST, its local variables with the trees they point to.
-->
<script lang="ts">
	import type { StackRow } from './view';

	interface Props {
		/** Innermost first. */
		rows: readonly StackRow[];
		/** Rows drawn before the rest is summed up in one line. */
		limit?: number;
		ariaLabel?: string;
	}

	let { rows, limit = 12, ariaLabel = 'Call stack, innermost call first' }: Props = $props();

	const shown = $derived(rows.slice(0, limit));
	const hidden = $derived(rows.length - shown.length);
</script>

{#if rows.length === 0}
	<p class="none">No call in progress.</p>
{:else}
	<ol class="stack" aria-label={ariaLabel}>
		{#each shown as row, i (row.key)}
			<li class={{ top: i === 0 }}>
				<div class="call">
					<span class="name">{row.name}</span>
					<span class="detail">
						{#if row.calledFrom === null}called first{:else}called from line {row.calledFrom}{/if}{#if row.entered.token !== null},
							on <span class="token">{row.entered.token}</span>{/if}
					</span>
				</div>
				{#if row.variables.length > 0}
					<dl class="variables">
						{#each row.variables as v (v.name)}
							<div>
								<dt>{v.name}</dt>
								<dd class={{ unset: v.node === null }}>{v.node === null ? 'not set' : v.value}</dd>
							</div>
						{/each}
					</dl>
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
	.call {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 var(--space-3);
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
	.token {
		padding: 0 0.35em;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		color: var(--text);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	li.top .token {
		background: color-mix(in srgb, var(--surface) 70%, transparent);
	}
	.variables {
		display: flex;
		flex-direction: column;
		margin: 2px 0 1px;
	}
	.variables div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}
	.variables dt,
	.variables dd {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
	}
	.variables dt::after {
		content: ' =';
		color: var(--text-3);
	}
	.variables dt {
		flex: none;
	}
	.variables dd {
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.variables dd.unset {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-style: italic;
	}
	.more {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
