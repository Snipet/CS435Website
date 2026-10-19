<!--
	"G is not LL(1) if any entry is multiply defined or …" (Table-based
	Predictive Parsing, slide 26): the multiply-defined entries and, of the
	slide's cases, the ones this grammar shows.
-->
<script lang="ts">
	import { Callout, CitationTag } from '$lib/components/ui';
	import { printSymbols, type LL1Table } from '$lib/theory/grammar';
	import { entryName, entryView, productionText, type Causes } from './model';

	interface Props {
		causes: Causes;
		table: LL1Table;
		/** The Ambiguity tool on the ambiguous string, when it is part of the site. */
		ambiguityHref?: string | null;
		/** Bottom-up tools on the same grammar. */
		bottomUp?: readonly { title: string; href: string }[];
		/** The Rewrite panel has a rewrite to offer. */
		rewrite?: boolean;
		/** Selects an entry of the table. */
		onentry?: (row: number, column: number) => void;
	}

	let {
		causes,
		table,
		ambiguityHref = null,
		bottomUp = [],
		rewrite = false,
		onentry
	}: Props = $props();

	const g = $derived(table.grammar);
	const count = $derived(causes.conflicts.length);
	const at = (nonterminal: string, terminal: string) => ({
		row: table.rows.indexOf(nonterminal),
		column: table.columns.indexOf(terminal)
	});
	const list = (parts: readonly string[]) =>
		new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);
</script>

<Callout tone="warn" title="G is not LL(1)">
	<p>
		{count === 1 ? 'An entry is' : `${count} entries are`} multiply defined:
		{#each causes.conflicts as c, i (i)}{i > 0 ? ', ' : ''}{#if onentry}<button
					type="button"
					class="entry mono"
					onclick={() => {
						const { row, column } = at(c.nonterminal, c.terminal);
						onentry(row, column);
					}}>{entryName(c.nonterminal, c.terminal)}</button
				>{:else}<span class="mono">{entryName(c.nonterminal, c.terminal)}</span>{/if}{/each}.
	</p>
	<ul class="causes">
		{#if causes.ambiguous}
			<li>
				<b>G is ambiguous:</b>
				<span class="mono">{printSymbols(causes.ambiguous.tokens)}</span> has two parse trees.
				{#if ambiguityHref}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
					<a href={ambiguityHref}>See both trees</a>.
				{/if}
			</li>
		{/if}
		{#if causes.leftRecursion.length > 0}
			<li>
				<b>G is left recursive:</b>
				{#each causes.leftRecursion as r, i (r.nonterminal)}{i > 0 ? '; ' : ''}<span class="mono"
						>{r.derivation}</span
					>{/each}.
			</li>
		{/if}
		{#if causes.prefixes.length > 0}
			<li>
				<b>G is not left-factored:</b>
				{#each causes.prefixes as p, i (i)}{i > 0 ? '; ' : ''}{list(
						p.productions.map((id) => productionText(g, id))
					)} share the prefix <span class="mono">{printSymbols(p.prefix)}</span>{/each}.
			</li>
		{/if}
		{#if causes.other.length > 0}
			<li>
				<b>And in other cases as well:</b>
				{#each causes.other as c, i (i)}
					{@const { row, column } = at(c.nonterminal, c.terminal)}
					{@const view = entryView(table, row, column)}
					<span class="other">
						<span class="mono">{view.name}</span>: {view.lines.join('; ')}.
					</span>
				{/each}
			</li>
		{/if}
	</ul>
	{#if rewrite || bottomUp.length > 0}
		<p>
			{#if rewrite}Rewrite for LL(1), below, removes left recursion and left-factors.{/if}
			{#if bottomUp.length > 0}
				A bottom-up parser needs no left factoring and no removal of left recursion: open this
				grammar in
				{#each bottomUp as link, i (link.href)}{i > 0 ? ' or ' : ''}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
					<a href={link.href}>{link.title}</a>{/each}.
			{/if}
		</p>
	{/if}
	<p class="cite"><CitationTag cite={{ deck: '12', slide: 26 }} /></p>
</Callout>

<style>
	p {
		margin: 0 0 var(--space-2);
	}
	.causes {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0 0 var(--space-2);
		padding-left: 1.1rem;
	}
	.causes li {
		overflow-wrap: anywhere;
	}
	.other {
		display: block;
	}
	.entry {
		padding: 0 4px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: inherit;
		font-size: 0.92em;
		cursor: pointer;
	}
	.entry:hover {
		border-color: var(--reject);
	}
	.cite {
		margin: 0;
	}
</style>
