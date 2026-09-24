<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { stages } from '$lib/tools/registry';
	import type { ToolMeta } from '$lib/tools/types';
	import CitationTag from './CitationTag.svelte';
	import CopyLinkButton from './CopyLinkButton.svelte';

	interface Props {
		tool: ToolMeta;
		/** Controls next to "Copy link" (presets, options). */
		actions?: Snippet;
		/** Hide the "Copy link" button (for tools without URL state). */
		shareable?: boolean;
		children: Snippet;
	}

	let { tool, actions, shareable = true, children }: Props = $props();

	const stage = $derived(stages.find((s) => s.id === tool.stage));
</script>

<svelte:head>
	<title>{tool.title} · {site.shortName}</title>
	<meta name="description" content={tool.summary} />
</svelte:head>

<article class="tool-page">
	<header class="tool-header">
		<div class="heading">
			{#if stage}
				<a class="stage" href={resolve(`/#${tool.stage}`)}>{stage.title}</a>
			{/if}
			<h1>{tool.title}</h1>
			<p class="summary">{tool.summary}</p>
			{#if tool.cites.length}
				<ul class="cites" aria-label="Lecture references">
					{#each tool.cites as cite, i (i)}
						<li><CitationTag {cite} /></li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if actions || shareable}
			<div class="actions">
				{@render actions?.()}
				{#if shareable}<CopyLinkButton />{/if}
			</div>
		{/if}
	</header>
	<div class="tool-body">
		{@render children()}
	</div>
</article>

<style>
	.tool-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.tool-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4) var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--border);
	}
	.heading {
		flex: 1 1 32rem;
		min-width: 0;
		max-width: var(--content-width);
	}
	.stage {
		display: inline-block;
		margin-bottom: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-decoration: none;
		text-transform: uppercase;
	}
	.stage:hover {
		color: var(--accent);
	}
	h1 {
		margin-bottom: var(--space-2);
	}
	.summary {
		margin-bottom: var(--space-3);
		color: var(--text-2);
		font-size: var(--text-lg);
		line-height: 1.5;
	}
	.cites {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.tool-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (max-width: 560px) {
		h1 {
			font-size: var(--text-2xl);
		}
		.summary {
			font-size: var(--text-base);
		}
		.tool-page {
			gap: var(--space-5);
		}
	}
</style>
