<!--
	One parse of the token string with an LR table: the bottom-up tree in the
	baseline layout (§3.10), or where the parser stopped. The nodes built by
	the actions at conflict entries are marked; a large tree (the C- grammar's)
	scrolls in its own box, which opens on the first of them.
-->
<script lang="ts">
	import { ParseTreeView, TokenStream } from '$lib/components/grammar';
	import { Badge } from '$lib/components/ui';
	import type { Snippet } from 'svelte';
	import type { ParseView } from './analysis';
	import { markText, outcomeText } from './view';

	interface Props {
		title: string;
		parse: ParseView;
		/** The token string, without $. */
		tokens: readonly string[];
		/** Color of the tree: two parses side by side get two. */
		tone: number;
		/** What the table of this parse is. */
		children?: Snippet;
	}

	let { title, parse, tokens, tone, children }: Props = $props();

	const uid = $props.id();
	const outcome = $derived(outcomeText(parse));
	const highlight = $derived({ current: parse.marks.map((m) => m.path) });
	/** The tree's box shows the first conflict node at once, however large the tree. */
	const reveal = $derived(parse.marks[0]?.path ?? null);
</script>

<section class="parse-card" aria-labelledby="{uid}-title">
	<header>
		<h3 id="{uid}-title">{title}</h3>
		<Badge tone={outcome.tone}>{outcome.title}</Badge>
	</header>
	{@render children?.()}
	{#if parse.tree}
		<ParseTreeView
			tree={parse.tree}
			layout="baseline"
			{tone}
			{highlight}
			{reveal}
			ariaLabel="{title}: parse tree"
			minLabelSize={10}
			maxHeight="min(36rem, 70vh)"
		/>
		{#if parse.marks.length}
			<p class="marks">
				<span class="swatch" aria-hidden="true"></span>
				<span>
					Marked: {markText(parse.marks)}
				</span>
			</p>
		{/if}
	{:else}
		{#if parse.at !== null}
			<TokenStream
				{tokens}
				pointer={parse.at}
				endMarker
				ariaLabel="{title}: where the parser stopped"
			/>
		{/if}
	{/if}
	{#if outcome.detail}<p class="detail">{outcome.detail}</p>{/if}
</section>

<style>
	.parse-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	h3 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	.marks {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	/* The mark ParseTreeView draws for a current node. */
	.swatch {
		flex: none;
		width: 0.9em;
		height: 0.9em;
		border-bottom: 2px solid var(--active);
		border-radius: 3px;
		background: var(--active-soft);
		transform: translateY(0.1em);
	}
	.detail {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
</style>
