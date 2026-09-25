<!--
@component
The construction rule applied by the current step, drawn as on Lexical
Analysis IV, slides 3–5: operands as ellipses labeled A and B with their start
on the left edge and their final state inside; new states as circles.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import { ELIDED, type Elided, type RuleCardModel, type RuleEdge } from './rules';

	interface Props {
		model: RuleCardModel;
	}

	let { model }: Props = $props();

	const uid = $props.id();
	const markerId = (kind: string) => `${uid}-arrow-${kind}`;
	const fig = $derived(model.figure);
	const vb = $derived(fig.viewBox);
	const LABEL_H = 14;
	const labelWidth = (s: string) => [...s].length * 7.4 + 6;

	const edgeText = (e: RuleEdge | Elided) => (e === ELIDED ? ELIDED : `${e[0]} →${e[1]} ${e[2]}`);
	const summary = $derived(
		[
			`Rule for ${model.formula}.`,
			model.fresh.length ? `New states ${model.fresh.join(' and ')}.` : 'No new states.',
			model.adds.length ? `Adds ${model.adds.map(edgeText).join(', ')}.` : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div class="rule-card">
	<div class="head">
		<span class="clause">{model.clause}</span>
		<span class={['formula', { mono: model.mono }]}>{model.formula}</span>
	</div>

	<figure class="figure">
		<svg
			viewBox="{vb.x} {vb.y} {vb.width} {vb.height}"
			style="max-width: {Math.round(vb.width * 1.05)}px"
			role="img"
			aria-label={summary}
		>
			<defs>
				{#each ['eps', 'sym', 'start'] as kind (kind)}
					<marker
						id={markerId(kind)}
						class="arrow {kind}"
						viewBox="0 0 10 8"
						refX="9.5"
						refY="4"
						markerWidth="9"
						markerHeight="7.2"
						markerUnits="userSpaceOnUse"
						orient="auto"
					>
						<path d="M0 0L10 4L0 8Z" />
					</marker>
				{/each}
			</defs>

			{#each fig.boxes as b, i (i)}
				<g class="box">
					<ellipse cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} />
					<text class="box-label" x={b.cx - 7} y={b.cy}>{b.label}</text>
					{#if b.final.accepting}
						<circle class="final ring" cx={b.final.x} cy={b.final.y} r={b.final.r + 3.5} />
					{/if}
					<circle class="final" cx={b.final.x} cy={b.final.y} r={b.final.r} />
				</g>
			{/each}

			{#each fig.edges as e, i (i)}
				<path class="edge {e.kind}" d={e.d} marker-end="url(#{markerId(e.kind)})" />
			{/each}
			{#each fig.edges as e, i (i)}
				{#if e.label !== undefined && e.lx !== undefined && e.ly !== undefined}
					<g class="edge-label {e.kind}">
						<rect
							x={e.lx - labelWidth(e.label) / 2}
							y={e.ly - LABEL_H / 2}
							width={labelWidth(e.label)}
							height={LABEL_H}
							rx="3"
						/>
						<text x={e.lx} y={e.ly}>{e.label}</text>
					</g>
				{/if}
			{/each}

			{#each fig.states as s, i (i)}
				<g class="state">
					{#if s.accepting}<circle class="ring" cx={s.x} cy={s.y} r={s.r + 3.5} />{/if}
					<circle cx={s.x} cy={s.y} r={s.r} />
				</g>
			{/each}

			{#each fig.texts as t, i (i)}
				<text class="gap" x={t.x} y={t.y}>{t.text}</text>
			{/each}
		</svg>
	</figure>

	{#if model.fresh.length || model.adds.length}
		<p class="adds">
			{#if model.fresh.length}
				<span class="lead">New</span>
				{#each model.fresh as s, i (s)}<span class="f">{s}</span>{i < model.fresh.length - 1
						? ', '
						: ''}{/each}{#if model.adds.length}<span class="sep">·</span>{/if}
			{/if}
			{#each model.adds as e, i (i)}
				{#if e === ELIDED}<span class="gap-text">…</span>{:else}<span class="f move"
						>{e[0]} →<sup>{e[1]}</sup> {e[2]}</span
					>{/if}{i < model.adds.length - 1 ? ', ' : ''}
			{/each}
		</p>
	{/if}

	{#each model.notes as note, i (i)}
		<p class="note">{note}</p>
	{/each}

	{#if model.bindings.length}
		<p class="bindings">
			<span class="lead">Here</span>
			{#each model.bindings as b, i (i)}
				{#if b === ELIDED}<span class="gap-text">…</span>{:else}<span class="binding"
						><span class="f name">{b.name}</span> = <code>{b.text}</code></span
					>{/if}{i < model.bindings.length - 1 ? ', ' : ''}
			{/each}
		</p>
	{/if}

	{#if model.cite}
		<div class="cite"><CitationTag cite={model.cite} /></div>
	{:else}
		<p class="default">
			Not drawn on the slides; built as described in
			<a href={resolve('/notation#defaults')}>Conventions beyond the slides</a>.
		</p>
	{/if}
</div>

<style>
	.rule-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}
	.clause {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.formula {
		min-width: 0;
		font-family: var(--font-serif);
		font-size: 1.125rem;
		font-style: italic;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.formula.mono {
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-style: normal;
		font-weight: 500;
		font-variant-ligatures: none;
	}
	.figure {
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow-x: auto;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
	}
	.box ellipse {
		fill: var(--surface-2);
		stroke: var(--border-strong);
		stroke-width: 1.3;
	}
	.box-label {
		fill: var(--text-2);
		font-family: var(--font-serif);
		font-size: 15px;
		font-style: italic;
		font-weight: 600;
		text-anchor: middle;
		dominant-baseline: central;
	}
	.final,
	.state circle {
		fill: var(--state-fill);
		stroke: var(--state-stroke);
		stroke-width: 1.4;
	}
	.final.ring,
	.state .ring {
		fill: none;
	}
	.state circle {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 1.8;
	}
	.state .ring {
		fill: none;
	}
	.edge {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.3;
	}
	.edge.eps {
		stroke: var(--epsilon);
	}
	.arrow path {
		fill: var(--edge);
	}
	.arrow.eps path {
		fill: var(--epsilon);
	}
	.edge-label rect {
		fill: var(--surface);
	}
	.edge-label text {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 12px;
		text-anchor: middle;
		dominant-baseline: central;
	}
	.edge-label.eps text {
		fill: var(--epsilon);
	}
	.gap {
		fill: var(--text-3);
		font-size: 16px;
		text-anchor: middle;
		dominant-baseline: central;
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.adds,
	.bindings {
		color: var(--text);
	}
	.lead {
		margin-right: 0.3em;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.sep {
		margin: 0 0.5em;
		color: var(--text-3);
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
	}
	.move {
		white-space: nowrap;
	}
	sup {
		font-size: 0.75em;
		line-height: 0;
	}
	.name {
		font-family: var(--font-serif);
		font-style: italic;
		font-weight: 600;
		font-size: 1em;
	}
	/* "A =" stays together; a long sub-expression wraps. */
	.binding {
		white-space: nowrap;
	}
	.binding code {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.gap-text {
		color: var(--text-3);
	}
	.note {
		color: var(--text-2);
	}
	.default {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.cite {
		display: flex;
	}
</style>
