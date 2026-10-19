<!--
	One parse of the token string with an LR table: the bottom-up tree in the
	baseline layout (§3.10), or where the parser stopped.
-->
<script lang="ts">
	import { ParseTreeView, TokenStream } from '$lib/components/grammar';
	import { Badge } from '$lib/components/ui';
	import type { Snippet } from 'svelte';
	import type { ParseView } from './analysis';
	import { outcomeText } from './view';

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
			ariaLabel="{title}: parse tree"
			minLabelSize={10}
		/>
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
	.detail {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
</style>
