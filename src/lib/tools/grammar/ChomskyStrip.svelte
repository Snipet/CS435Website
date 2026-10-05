<!--
	The grammar's type in the Chomsky hierarchy by the form of its productions
	(Introduction to Parsing, slide 23), the link that opens a regular grammar as
	an NFA, and the slide's table.
-->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { CHOMSKY_TABLE, type ChomskyView } from './tuple';

	interface Props {
		chomsky: ChomskyView;
		/** Link that opens the grammar's NFA in Finite Automata; null when there is none. */
		nfaHref?: string | null;
		/** Why a regular grammar has no NFA link. */
		nfaNote?: string | null;
	}

	let { chomsky, nfaHref = null, nfaNote = null }: Props = $props();
</script>

<div class="chomsky">
	<p class="type">
		<Badge tone={chomsky.type === 3 ? 'accept' : 'accent'}>{chomsky.name}</Badge>
		<span class="what">
			{#if chomsky.type === 3}
				every production has the form <span class="formal">V → w | wU</span>
			{:else}
				<span class="formal">{chomsky.form}</span>
			{/if}
			<span class="dash" aria-hidden="true">—</span>
			recognizer: {chomsky.recognizer}
		</span>
	</p>
	{#if chomsky.breakingText}
		<p class="note">{chomsky.breakingText}</p>
	{/if}
	{#if nfaHref}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
		<a class="tool-link" href={nfaHref}>
			Open as an NFA in Finite Automata <Icon name="arrow-right" size={15} />
		</a>
	{:else if nfaNote}
		<p class="note">{nfaNote}</p>
	{/if}
	<Disclosure summary="Chomsky hierarchy">
		<div class="table-head">
			<CitationTag cite={{ deck: '09', slide: 23 }} />
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Type</th>
						<th scope="col">Language</th>
						<th scope="col">Form</th>
						<th scope="col">Recognizer</th>
					</tr>
				</thead>
				<tbody>
					{#each CHOMSKY_TABLE as row (row.type)}
						<tr class={{ current: row.type === chomsky.type }}>
							<th scope="row">
								{row.type}
								{#if row.type === chomsky.type}
									<span class="visually-hidden">(this grammar)</span>
								{/if}
							</th>
							<td>{row.language}</td>
							<td class="formal">
								{#each row.form as line (line)}<span class="line">{line}</span>{/each}
							</td>
							<td>{row.recognizer}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Disclosure>
</div>

<style>
	.chomsky {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.type {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.what {
		min-width: 0;
		color: var(--text-2);
	}
	.dash {
		margin: 0 0.15em;
		color: var(--text-3);
	}
	.formal {
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.95em;
		font-variant-ligatures: none;
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}
	.tool-link:hover {
		text-decoration: underline;
	}
	.chomsky > :global(.disclosure) {
		align-self: stretch;
	}
	.table-head {
		margin-bottom: var(--space-2);
	}
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	table {
		width: 100%;
		min-width: 30rem;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 6px 12px;
		text-align: left;
		vertical-align: top;
	}
	thead th {
		border-bottom: 1px solid var(--border);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	tbody tr + tr {
		border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}
	tbody th {
		width: 3.5rem;
		font-family: var(--font-mono);
		font-weight: 600;
	}
	td.formal .line {
		display: block;
		white-space: nowrap;
	}
	tr.current {
		background: var(--accent-soft);
	}
	tr.current th {
		box-shadow: inset 3px 0 0 var(--accent);
	}
</style>
