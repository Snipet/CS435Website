<!--
	One T-diagram drawn like the slides: a crossbar with the source at its
	top-left and the target at its top-right, and a stem holding the host.
	Place it inside an <svg>; `geom` comes from tGeometry().
-->
<script lang="ts" module>
	export type ShapeTone = 'plain' | 'program' | 'translator' | 'accept' | 'reject' | 'muted';
	export type MarkTone = 'active' | 'accept' | 'reject';
	export type Region = 'leftArm' | 'rightArm' | 'stem';
</script>

<script lang="ts">
	import type { TGeom } from './geometry';
	import LangLabel from './LangLabel.svelte';
	import type { TDiagram } from './model';

	interface Props {
		t: TDiagram;
		geom: TGeom;
		x?: number;
		y?: number;
		tone?: ShapeTone;
		/** Dashed outline (a goal not reached yet, a drag ghost). */
		dashed?: boolean;
		/** Tinted parts: where a stem meets an arm, a new host, a mismatch. */
		marks?: Partial<Record<Region, MarkTone>>;
		class?: string;
	}

	let {
		t,
		geom,
		x = 0,
		y = 0,
		tone = 'plain',
		dashed = false,
		marks = {},
		class: className
	}: Props = $props();

	const marked = $derived(
		(Object.entries(marks) as [Region, MarkTone | undefined][]).filter(
			(e): e is [Region, MarkTone] => e[1] !== undefined
		)
	);
</script>

<g class={['tshape', `tone-${tone}`, { dashed }, className]} transform="translate({x} {y})">
	<path class="fill" d={geom.path} />
	{#each marked as [region, mark] (region)}
		{@const r = geom.regions[region]}
		<rect class="mark mark-{mark}" x={r.x} y={r.y} width={r.width} height={r.height} />
	{/each}
	<path class="outline" d={geom.path} />
	<LangLabel text={t.source} x={geom.source.x} y={geom.source.y} size={geom.font} />
	<LangLabel text={t.target} x={geom.target.x} y={geom.target.y} size={geom.font} anchor="end" />
	<LangLabel text={t.host} x={geom.host.x} y={geom.host.y} size={geom.font} />
</g>

<style>
	.fill {
		fill: var(--surface);
		stroke: none;
	}
	.outline {
		fill: none;
		stroke: var(--state-stroke);
		stroke-width: 1.6;
		stroke-linejoin: miter;
		transition: stroke var(--duration) var(--ease);
	}
	.tone-program .fill {
		fill: var(--tok-0-soft);
	}
	.tone-program .outline {
		stroke: var(--tok-0);
	}
	.tone-translator .fill {
		fill: var(--tok-2-soft);
	}
	.tone-translator .outline {
		stroke: var(--tok-2);
	}
	.tone-accept .fill {
		fill: var(--accept-soft);
	}
	.tone-accept .outline {
		stroke: var(--accept);
		stroke-width: 2;
	}
	.tone-reject .fill {
		fill: var(--reject-soft);
	}
	.tone-reject .outline {
		stroke: var(--reject);
	}
	.tone-muted .outline {
		stroke: var(--border-strong);
	}
	.tone-muted :global(.lang) {
		fill: var(--text-3);
	}
	.dashed .outline {
		stroke-dasharray: 5 4;
	}
	.mark {
		stroke: none;
	}
	.mark-active {
		fill: var(--active-soft);
	}
	.mark-accept {
		fill: var(--accept-soft);
	}
	.mark-reject {
		fill: var(--reject-soft);
	}
</style>
