<!--
	Three-address code as quads in aligned columns (op, arg1, arg2, result), as
	on the slide. Labels get a row of their own ("L1:"); fields the optimizer
	rewrote are highlighted.
-->
<script lang="ts">
	import type { Quad, QuadField } from './tac';

	interface Props {
		quads: readonly (Quad & { changed?: readonly QuadField[] })[];
		/** Accessible name of the table. */
		caption: string;
	}

	let { quads, caption }: Props = $props();

	const FIELDS = ['op', 'arg1', 'arg2', 'result'] as const;
</script>

{#if quads.length === 0}
	<p class="empty">No quads.</p>
{:else}
	<div class="scroll">
		<table class="quads">
			<caption class="visually-hidden">{caption}</caption>
			<thead>
				<tr>
					{#each FIELDS as f (f)}<th scope="col">{f}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each quads as q, i (i)}
					{#if q.op === 'label'}
						<tr class="label-row">
							<td colspan="4">{q.result}:</td>
						</tr>
					{:else}
						<tr>
							{#each FIELDS as f (f)}
								<td
									>{#if q.changed?.includes(f)}<span class="changed">{q[f] ?? ''}</span>{:else}{q[
											f
										] ?? ''}{/if}</td
								>
							{/each}
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.scroll {
		max-width: 100%;
		overflow-x: auto;
	}
	.quads {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.5;
	}
	/* Fixed minimum widths keep the columns of consecutive tables aligned. */
	th {
		width: 3.75rem;
		padding: 0 1.6em 2px 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 500;
		text-align: left;
		letter-spacing: 0.02em;
	}
	td {
		min-width: 2.5em;
		padding: 1px 1.6em 1px 0;
		white-space: pre;
	}
	th:first-child {
		width: 4.75rem;
	}
	td:first-child {
		font-weight: 600;
	}
	.label-row td {
		padding-top: 3px;
		color: var(--text-2);
		font-weight: 600;
	}
	.changed {
		margin: 0 -3px;
		padding: 0 3px;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
