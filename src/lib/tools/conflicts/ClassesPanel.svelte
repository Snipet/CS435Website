<!--
	The grammar's classes (Bottom-up Parsing III, slide 26): LL(1), LR(0),
	SLR(1), LALR(1) and LR(1), each with the conflicts that keep the grammar
	out of it, whether the token string has two parse trees, and the Venn
	diagram with the grammar marked.
-->
<script lang="ts">
	import { GrammarClasses, LrItem } from '$lib/components/grammar';
	import { Badge, CitationTag } from '$lib/components/ui';
	import { printSymbols } from '$lib/theory/grammar/parse';
	import type { ClassesView } from './classes';
	import { placeCaption } from './view';

	interface Props {
		classes: ClassesView;
	}

	let { classes }: Props = $props();

	const uid = $props.id();
	const string = $derived(classes.string);
	const sentence = $derived(string ? printSymbols(string.tokens) : '');
</script>

<div class="classes-panel">
	<div class="table-wrap">
		<table aria-labelledby="{uid}-caption">
			<caption id="{uid}-caption" class="visually-hidden"
				>Grammar classes and their conflicts</caption
			>
			<thead>
				<tr>
					<th scope="col">Class</th>
					<th scope="col">Grammar in it</th>
					<th scope="col">Conflicts of its table</th>
				</tr>
			</thead>
			<tbody>
				{#each classes.rows as row (row.id)}
					<tr>
						<th scope="row">
							<span class="name">{row.name}</span>
							{#if row.states !== null}<span class="states">{row.states} states</span>{/if}
						</th>
						<td>
							{#if row.member === null}
								<Badge>not known</Badge>
							{:else if row.member}
								<Badge tone="accept">yes</Badge>
							{:else}
								<Badge tone="reject">no</Badge>
							{/if}
						</td>
						<td>
							{#if row.count === 0}
								<span class="none">none</span>
							{:else}
								<ul class="conflicts">
									{#each row.conflicts as c, i (i)}
										<li>
											{#if c.entry}
												<span class="f">[{c.entry.nonterminal}, {printSymbols([c.terminal])}]</span
												>:
												<span class="f">{c.entry.productions.join(' and ')}</span>
											{:else}
												state {c.state} on <span class="f">{printSymbols([c.terminal])}</span>,
												{c.kind}:
												<LrItem item={c.items[0]} /> and <LrItem item={c.items[1]} />
											{/if}
										</li>
									{/each}
									{#if row.count > row.conflicts.length}
										<li class="more">and {row.count - row.conflicts.length} more</li>
									{/if}
								</ul>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="ambiguity">
		{#if string}
			<span class="f">{sentence}</span>
			{string.ambiguous
				? 'has at least two parse trees: the grammar is ambiguous.'
				: 'has one parse tree.'}
		{/if}
		{#if classes.ambiguity === 'unambiguous'}
			LL(1) and LR(1) grammars are not ambiguous.
		{:else if classes.ambiguity === 'unknown'}
			The grammar is not LR(1); whether it is ambiguous {string
				? 'this token string does not show'
				: 'a token string with two parse trees would show'}.
		{/if}
	</p>

	<figure>
		<GrammarClasses highlight={classes.place} />
		<figcaption>
			<span>
				{placeCaption(classes.place, classes.llk)}
				Simple LR (SLR); Look-ahead LR (LALR). The slides only name LR(0), SLR and LALR(1); their tables
				are built here the standard way.
			</span>
			<CitationTag cite={{ deck: '15', slide: 26 }} />
		</figcaption>
	</figure>
</div>

<style>
	.classes-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.table-wrap {
		max-width: 100%;
		position: relative;
		overflow-x: auto;
	}
	table {
		width: 100%;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}
	thead th {
		color: var(--text-2);
		font-weight: 500;
	}
	tbody th {
		font-weight: 400;
		white-space: nowrap;
	}
	.name,
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.states {
		display: block;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.none {
		color: var(--text-3);
	}
	.conflicts {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.conflicts :global(.lr-item) {
		white-space: normal;
	}
	.more {
		color: var(--text-3);
	}
	.ambiguity {
		margin: 0;
		font-size: var(--text-sm);
	}
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
</style>
