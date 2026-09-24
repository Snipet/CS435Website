<script lang="ts">
	import { resolve } from '$app/paths';
	import PipelineFigure from '$lib/components/layout/PipelineFigure.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { site, toolHref } from '$lib/site';
	import { stages, toolsForStage } from '$lib/tools/registry';

	const sections = stages
		.map((stage) => ({ ...stage, tools: toolsForStage(stage.id) }))
		.filter((stage) => stage.tools.length > 0);
</script>

<svelte:head>
	<title>{site.name}</title>
	<meta name="description" content={site.description} />
</svelte:head>

<div class="home">
	<section class="hero">
		<h1>{site.name}</h1>
		<p class="lede">{site.description}</p>
	</section>

	<PipelineFigure />

	{#each sections as section (section.id)}
		<section class="section" id={section.id} aria-labelledby="{section.id}-title">
			<header class="section-head">
				<h2 id="{section.id}-title">{section.title}</h2>
				<p>{section.blurb}</p>
			</header>
			<ul class="cards">
				{#each section.tools as tool (tool.slug)}
					<li>
						<a class="card" href={toolHref(tool.slug)}>
							<span class="card-title">
								{tool.title}
								<Icon name="arrow-right" size={18} class="card-arrow" />
							</span>
							<span class="card-summary">{tool.summary}</span>
							{#if tool.cites.length}
								<span class="card-cites">
									{#each tool.cites as cite, i (i)}<CitationTag {cite} />{/each}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<section class="section" id="reference" aria-labelledby="reference-title">
		<header class="section-head">
			<h2 id="reference-title">Reference</h2>
			<p>Symbols and conventions shared by the tools</p>
		</header>
		<ul class="cards">
			<li>
				<a class="card" href={resolve('/notation')}>
					<span class="card-title">
						Notation
						<Icon name="arrow-right" size={18} class="card-arrow" />
					</span>
					<span class="card-summary"
						>Regular expression clauses, flex patterns, automata diagrams, state names, table
						markers, and token formats, as written on the slides.</span
					>
					<span class="card-sample mono" aria-hidden="true"
						>L(A | B) = &#123; s | s ∈ L(A) or s ∈ L(B) &#125;</span
					>
				</a>
			</li>
		</ul>
	</section>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		gap: var(--space-7);
	}
	.hero {
		max-width: var(--content-width);
		padding-top: var(--space-4);
	}
	.hero h1 {
		margin-bottom: var(--space-3);
		font-size: clamp(2.25rem, 1.7rem + 2.2vw, 3.25rem);
		letter-spacing: -0.02em;
	}
	.lede {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-lg);
		line-height: 1.55;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
	}
	.section-head h2 {
		margin: 0;
	}
	.section-head p {
		margin: 0;
		color: var(--text-3);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.cards li {
		display: flex;
		min-width: 0;
	}
	.card {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-4) var(--space-5) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		color: var(--text);
		text-decoration: none;
		transition:
			border-color var(--duration) var(--ease),
			box-shadow var(--duration) var(--ease),
			transform var(--duration) var(--ease);
	}
	.card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow);
		color: var(--text);
	}
	.card:focus-visible {
		border-color: var(--accent);
		outline-offset: 3px;
	}
	.card-title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		font-family: var(--font-serif);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.25;
	}
	.card :global(.card-arrow) {
		align-self: center;
		color: var(--text-3);
		transition:
			transform var(--duration) var(--ease),
			color var(--duration) var(--ease);
	}
	.card:hover :global(.card-arrow),
	.card:focus-visible :global(.card-arrow) {
		color: var(--accent);
		transform: translateX(3px);
	}
	.card-summary {
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.card-cites {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		margin-top: auto;
		padding-top: var(--space-2);
	}
	.card-sample {
		margin-top: auto;
		padding-top: var(--space-2);
		overflow: hidden;
		color: var(--text-3);
		font-size: var(--text-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 560px) {
		.home {
			gap: var(--space-6);
		}
		.card {
			padding: var(--space-4);
		}
	}
</style>
