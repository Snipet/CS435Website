<!--
@component
Questions printed on the slides, each with its answer behind "Show answer".
-->
<script lang="ts">
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import type { SlideQuestion } from './presets';

	interface Props {
		questions: readonly SlideQuestion[];
	}

	let { questions }: Props = $props();
</script>

<ul class="questions" aria-label="Questions from the slides">
	{#each questions as q (q.question)}
		<li>
			<p class="q">
				<span class="text">{q.question}</span>
				<CitationTag cite={q.cite} />
			</p>
			<Disclosure summary="Show answer" openSummary="Hide answer">
				<p class="a">{q.answer}</p>
				{#if q.table}
					<table class="answer-table">
						<thead>
							<tr>
								{#each q.table.head as h, i (i)}<th scope="col">{h}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each q.table.rows as row, r (r)}
								<tr>
									{#each row as cell, c (c)}
										{#if c === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</Disclosure>
		</li>
	{/each}
</ul>

<style>
	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius) var(--radius) 0;
		background: var(--surface-2);
		list-style: none;
	}
	.q {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin: 0 0 var(--space-1);
	}
	.text {
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-weight: 600;
	}
	.answer-table {
		margin-top: var(--space-2);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	.answer-table th,
	.answer-table td {
		min-width: 2.75em;
		padding: 4px 12px;
		border: 1px solid var(--border);
		text-align: center;
	}
	.answer-table thead th {
		background: var(--surface-2);
	}
	.a {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
</style>
