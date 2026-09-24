<script lang="ts">
	import { resolve } from '$app/paths';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import { stages, toolsForStage } from '$lib/tools/registry';
	import type { Stage } from '$lib/tools/types';

	type Node = { kind: 'end'; label: string } | { kind: 'stage'; id: Stage; label: string };

	const flow: Node[] = [
		{ kind: 'end', label: 'Source' },
		{ kind: 'stage', id: 'lexical', label: 'Lexical analysis' },
		{ kind: 'stage', id: 'syntax', label: 'Syntax analysis' },
		{ kind: 'stage', id: 'semantic', label: 'Semantic analysis' },
		{ kind: 'stage', id: 'intermediate', label: 'Intermediate code' },
		{ kind: 'stage', id: 'codegen', label: 'Code generation' },
		{ kind: 'end', label: 'Target' }
	];

	const blurb = (id: Stage) => stages.find((s) => s.id === id)?.blurb ?? '';
	const count = (id: Stage) => toolsForStage(id).length;
</script>

<figure class="pipeline" aria-labelledby="pipeline-caption">
	<ol class="flow">
		{#each flow as node, i (node.label)}
			<li class="step">
				{#if node.kind === 'end'}
					<span class="end">{node.label}</span>
				{:else if count(node.id) > 0}
					<a class="node live" href={resolve(`/#${node.id}`)} title={blurb(node.id)}>
						<span class="label">{node.label}</span>
						<span class="count">{count(node.id)} tool{count(node.id) === 1 ? '' : 's'}</span>
					</a>
				{:else}
					<span class="node" title={blurb(node.id)}>
						<span class="label">{node.label}</span>
					</span>
				{/if}
				{#if i < flow.length - 1}
					<svg class="arrow" viewBox="0 0 28 12" aria-hidden="true">
						<path d="M1 6h24M20 1.5 25 6l-5 4.5" />
					</svg>
				{/if}
			</li>
		{/each}
	</ol>
	<figcaption id="pipeline-caption">
		<span>Phases of a compiler.</span>
		<CitationTag cite={{ deck: '01', slide: 4 }} />
	</figcaption>
</figure>

<style>
	.pipeline {
		margin: 0;
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	.flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		row-gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.step {
		display: flex;
		align-items: center;
	}
	.end {
		padding: 0 var(--space-1);
		color: var(--text-2);
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-style: italic;
	}
	.node {
		display: inline-flex;
		flex-direction: column;
		justify-content: center;
		min-height: 48px;
		padding: 6px 12px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-3);
		line-height: 1.25;
		text-decoration: none;
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
	}
	.live {
		border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
		background: var(--accent-soft);
		color: var(--text);
		transition:
			border-color var(--duration) var(--ease),
			background var(--duration) var(--ease);
	}
	.live:hover {
		border-color: var(--accent);
		color: var(--text);
	}
	.count {
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.arrow {
		flex: none;
		width: 28px;
		height: 12px;
		margin: 0 6px;
		fill: none;
		stroke: var(--text-3);
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	@media (max-width: 560px) {
		.pipeline {
			padding: var(--space-4);
		}
		.node {
			min-height: 40px;
			padding: 4px 10px;
		}
		.arrow {
			width: 20px;
			margin: 0 4px;
		}
	}
</style>
