<!--
	The retargetable compiler of slide 6: frontends feed one common optimizer,
	which feeds the backends. Languages and targets can be added and removed;
	the counts compare m × n separate compilers with m + 1 + n components.
-->
<script lang="ts">
	import { CitationTag, IconButton, Panel, SegmentedControl } from '$lib/components/ui';
	import {
		ARCH_FONT,
		archLayout,
		counts,
		SLIDE_LANGUAGES,
		SLIDE_TARGETS,
		type Box
	} from './architecture';
	import EndList from './EndList.svelte';

	interface Props {
		languages: string[];
		targets: string[];
	}

	let { languages = $bindable(), targets = $bindable() }: Props = $props();

	const uid = $props.id();
	let view = $state<'shared' | 'separate'>('shared');

	const layout = $derived(archLayout(languages, targets));
	const n = $derived(counts(languages.length, targets.length));
	const isSlide = $derived(
		languages.join('\n') === SLIDE_LANGUAGES.join('\n') &&
			targets.join('\n') === SLIDE_TARGETS.join('\n')
	);
	const PAD = 6;

	const label = $derived(
		`${languages.map((l) => `${l} Frontend`).join(', ')} feed a Common Optimizer, which feeds ${targets
			.map((t) => `${t} Backend`)
			.join(', ')}.`
	);

	function reset() {
		languages = [...SLIDE_LANGUAGES];
		targets = [...SLIDE_TARGETS];
	}

	const boxText = (b: Box) =>
		b.lines.map((line, i) => ({
			line,
			y: b.y + b.height / 2 + (i - (b.lines.length - 1) / 2) * (ARCH_FONT + 3)
		}));
</script>

<Panel title="Retargetable compiler architecture" class="arch-panel">
	{#snippet actions()}
		<CitationTag cite={{ deck: '02', slide: 6 }} />
		<IconButton
			icon="reset"
			size="sm"
			label="Restore the slide’s languages and targets"
			disabled={isSlide}
			onclick={reset}
		/>
	{/snippet}

	<div class="arch">
		<div class="summary">
			<dl class="stats">
				<div class={['stat', { on: view === 'separate' }]}>
					<dt>Separate compilers</dt>
					<dd>
						<span class="formula">{languages.length} × {targets.length}</span>
						<span class="eq">=</span>
						<strong>{n.separate}</strong>
					</dd>
				</div>
				<div class={['stat', { on: view === 'shared' }]}>
					<dt>Components</dt>
					<dd>
						<span class="formula">{languages.length} + 1 + {targets.length}</span>
						<span class="eq">=</span>
						<strong>{n.components}</strong>
					</dd>
				</div>
			</dl>
			<SegmentedControl
				label="Drawing"
				size="sm"
				bind:value={view}
				options={[
					{ value: 'shared', label: 'Shared optimizer' },
					{ value: 'separate', label: 'Separate compilers' }
				]}
			/>
		</div>

		<div class="scroll">
			{#if view === 'shared'}
				<svg
					class="diagram"
					viewBox="{-PAD} {-PAD} {layout.width + 2 * PAD} {layout.height + 2 * PAD}"
					width={layout.width + 2 * PAD}
					height={layout.height + 2 * PAD}
					role="img"
					aria-label={label}
				>
					<defs>
						<marker
							id="{uid}-tip"
							viewBox="0 0 10 10"
							refX="9"
							refY="5"
							markerWidth="7"
							markerHeight="7"
							orient="auto-start-reverse"
						>
							<path class="tip" d="M0 0L10 5L0 10z" />
						</marker>
					</defs>
					{#each layout.arrows as a, i (i)}
						<line
							class="arrow"
							x1={a.from.x}
							y1={a.from.y}
							x2={a.to.x}
							y2={a.to.y}
							marker-end="url(#{uid}-tip)"
						/>
					{/each}
					{#each layout.inputs as t (t.text)}
						<text class="end" x={t.at.x} y={t.at.y} dy="0.34em" text-anchor="end">{t.text}</text>
					{/each}
					{#each layout.outputs as t (t.text)}
						<text class="end" x={t.at.x} y={t.at.y} dy="0.34em">{t.text}</text>
					{/each}
					{#each [...layout.frontends, layout.optimizer, ...layout.backends] as b, i (i)}
						<rect
							class={['box', { optimizer: b === layout.optimizer }]}
							x={b.x}
							y={b.y}
							width={b.width}
							height={b.height}
							rx="3"
						/>
						{#each boxText(b) as t, k (k)}
							<text
								class="box-text"
								x={b === layout.optimizer ? b.x + b.width / 2 : b.x + 10}
								y={t.y}
								dy="0.34em"
								text-anchor={b === layout.optimizer ? 'middle' : 'start'}>{t.line}</text
							>
						{/each}
					{/each}
				</svg>
			{:else}
				<table class="matrix">
					<caption class="visually-hidden"
						>One compiler for each language and target: {n.separate} compilers</caption
					>
					<thead>
						<tr>
							<th scope="col"><span class="visually-hidden">Language</span></th>
							{#each targets as t (t)}<th scope="col">{t}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each languages as l (l)}
							<tr>
								<th scope="row">{l}</th>
								{#each targets as t (t)}
									<td><span class="cell">{l} → {t}</span></td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<div class="editors">
			<EndList title="Languages" noun="language" bind:items={languages} placeholder="e.g. Rust" />
			<EndList title="Targets" noun="target" bind:items={targets} placeholder="e.g. RISC-V" />
		</div>
	</div>
</Panel>

<style>
	/* A long citation shrinks with an ellipsis instead of widening the page. */
	:global(.arch-panel .head .actions),
	:global(.arch-panel .head .actions .cite) {
		min-width: 0;
		max-width: 100%;
	}
	:global(.arch-panel .head .actions) {
		flex-wrap: nowrap;
	}
	.arch {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3) var(--space-5);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		margin: 0;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 10rem;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		transition:
			border-color var(--duration) var(--ease),
			background var(--duration) var(--ease);
	}
	.stat.on {
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
		background: var(--accent-soft);
	}
	dt {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	dd {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.formula {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	.eq {
		color: var(--text-3);
	}
	dd strong {
		font-family: var(--font-serif);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.1;
	}
	.scroll {
		max-width: 100%;
		overflow-x: auto;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.diagram {
		display: block;
		margin: 0 auto;
		max-width: none;
	}
	.box {
		fill: var(--surface);
		stroke: var(--state-stroke);
		stroke-width: 1.3;
	}
	.box.optimizer {
		fill: var(--surface-2);
	}
	.box-text {
		fill: var(--text);
		font-family: var(--font-sans);
		font-size: 13px;
	}
	.end {
		fill: var(--text-2);
		font-family: var(--font-sans);
		font-size: 13px;
	}
	.arrow {
		stroke: var(--edge);
		stroke-width: 1.3;
	}
	.tip {
		fill: var(--edge);
	}
	.matrix {
		margin: 0 auto;
		font-size: var(--text-sm);
	}
	.matrix th,
	.matrix td {
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	.matrix thead th {
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.matrix tbody th {
		color: var(--text-2);
		font-weight: 500;
	}
	.matrix tbody tr:last-child > * {
		border-bottom: 0;
	}
	.cell {
		display: inline-block;
		padding: 2px 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
	}
	.editors {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 720px) {
		.editors {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-6);
		}
	}
</style>
