<!--
	Rewrite for LL(1) without EBNF (Table-based Predictive Parsing, slides 5–6):
	left recursion removed and common prefixes factored, each step with its
	rule, names for the new non-terminals, the grammar and its table before and
	after, and one action that puts the result in the editor.
-->
<script lang="ts">
	import { Badge, Button, CitationTag, TextField } from '$lib/components/ui';
	import type { LL1Table } from '$lib/theory/grammar';
	import { tableOrder } from './model';
	import type { LL1Rewrite, RewriteKind } from './rewrite';
	import TableView from './TableView.svelte';

	interface Props {
		rewrite: LL1Rewrite;
		/** The table of the grammar as written. */
		before: LL1Table;
		/** The table of the rewritten grammar. */
		after: LL1Table;
		/** Names of the new non-terminals by default name. */
		names: Record<string, string>;
		/** The order fields of the page, applied to both tables. */
		rows: string;
		columns: string;
		/** The editor holds the rewritten grammar already. */
		inUse: boolean;
		onuse: () => void;
	}

	let {
		rewrite,
		before,
		after,
		names = $bindable(),
		rows,
		columns,
		inUse,
		onuse
	}: Props = $props();

	const uid = $props.id();

	const KIND: Record<RewriteKind, string> = {
		'left-recursion': 'Left recursion removed',
		substitution: 'Substitution',
		'left-factor': 'Left-factored',
		dropped: 'Dropped'
	};

	const beforeOrder = $derived(tableOrder(before, rows, columns));
	const afterOrder = $derived(tableOrder(after, rows, columns));

	function rename(key: string, text: string) {
		const next = { ...names };
		if (text === key) delete next[key];
		else next[key] = text;
		names = next;
	}
</script>

{#snippet verdict(table: LL1Table)}
	{#if table.ll1}
		<Badge tone="accept">LL(1)</Badge>
	{:else}
		<Badge tone="reject"
			>{table.conflicts.length} multiply-defined {table.conflicts.length === 1
				? 'entry'
				: 'entries'}</Badge
		>
	{/if}
{/snippet}

<div class="rewrite">
	<ul class="rules" aria-label="Rules">
		<li>
			<span class="what">Remove left recursion</span>
			<span class="mono">A → A α | β</span> becomes
			<span class="mono">A → β A’</span>, <span class="mono">A’ → α A’ | ε</span>
			<CitationTag cite={{ deck: '11', slide: [24, 26] }} />
		</li>
		<li>
			<span class="what">Left-factor</span>
			<span class="mono">A → αβ | α γ</span> becomes
			<span class="mono">A → α A’</span>, <span class="mono">A’ → β | γ</span>
			<CitationTag cite={{ deck: '12', slide: 6 }} />
		</li>
	</ul>

	{#if rewrite.changes.length === 0}
		<p class="empty">No left recursion and no common prefixes: there is nothing to rewrite.</p>
	{:else}
		<ol class="changes">
			{#each rewrite.changes as change, i (i)}
				<li>
					<p class="kind">
						{KIND[change.kind]}
						{#if change.cite}<CitationTag cite={change.cite} />{/if}
					</p>
					<div class="lines mono">
						<span class="before"
							>{#each change.before as line, k (k)}<span class="line">{line}</span>{/each}</span
						>
						<span class="arrow" aria-hidden="true">⇒</span><span class="visually-hidden"
							>becomes</span
						>
						<span class="after"
							>{#each change.after as line, k (k)}<span class="line">{line}</span>{:else}<span
									class="line">(no rule)</span
								>{/each}</span
						>
					</div>
					<p class="text">{change.text}</p>
				</li>
			{/each}
		</ol>

		{#if rewrite.fresh.length > 0}
			<fieldset class="names">
				<legend>Names of the new non-terminals</legend>
				{#each rewrite.fresh as f (f.key)}
					<div class="name">
						<TextField
							label="From {f.base}"
							size="sm"
							mono
							spellcheck="false"
							autocapitalize="off"
							bind:value={() => names[f.key] ?? f.key, (text) => rename(f.key, text)}
							error={f.error ?? undefined}
						/>
					</div>
				{/each}
			</fieldset>
		{/if}

		{#each rewrite.notes as note, i (i)}
			<p class="note">{note.message}</p>
		{/each}

		<div class="compare">
			<section aria-labelledby="{uid}-before">
				<h3 id="{uid}-before">Before {@render verdict(before)}</h3>
				<pre class="grammar mono">{rewrite.before}</pre>
				<TableView
					table={before}
					rows={beforeOrder.rows}
					columns={beforeOrder.columns}
					compact
					label="LL(1) table of the grammar as written"
				/>
			</section>
			<section aria-labelledby="{uid}-after">
				<h3 id="{uid}-after">After {@render verdict(after)}</h3>
				<pre class="grammar mono">{rewrite.text}</pre>
				<TableView
					table={after}
					rows={afterOrder.rows}
					columns={afterOrder.columns}
					compact
					label="LL(1) table of the rewritten grammar"
				/>
			</section>
		</div>

		<div class="use">
			<Button variant="primary" size="sm" disabled={inUse} onclick={onuse}>
				Use the rewritten grammar
			</Button>
			<span class="hint">
				{inUse
					? 'The editor holds this grammar.'
					: 'Puts it in the grammar editor; the table, the sets and the parse follow it.'}
			</span>
		</div>
	{/if}
</div>

<style>
	.rewrite {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	.rules li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.what {
		flex-basis: 100%;
		color: var(--text-2);
		font-weight: 600;
	}
	@media (min-width: 640px) {
		.what {
			flex-basis: 11rem;
		}
	}
	.empty,
	.note,
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.note {
		color: var(--reject);
	}
	.changes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.changes li {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.kind {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.lines {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
	}
	.line {
		display: block;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.after {
		color: var(--epsilon);
	}
	.arrow {
		color: var(--text-3);
	}
	.text {
		margin: var(--space-1) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.names {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.names legend {
		padding: 0 4px;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.name {
		width: 9rem;
	}
	.compare {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 900px) {
		.compare {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	.grammar {
		margin: 0;
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: var(--text-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.use {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
</style>
