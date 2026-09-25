<!--
	A small tree or forest drawn as SVG at its natural size. A tree wider than
	its box shrinks to fit, down to MIN_SCALE; a still wider one scrolls inside
	its box, which then takes keyboard focus. `orientation="up"` puts the root
	at the bottom and `alignLeaves` puts every leaf in the top row (a sentence
	diagram).
-->
<script lang="ts">
	import { scrollRegion } from './scroll-region';
	import { layoutTree } from './tree-layout';
	import { treeText, type DisplayNode } from './trees';

	interface Props {
		roots: readonly DisplayNode[];
		orientation?: 'down' | 'up';
		alignLeaves?: boolean;
		/** Accessible name; the tree's text is appended. */
		label: string;
	}

	let { roots, orientation = 'down', alignLeaves = false, label }: Props = $props();

	const layout = $derived(layoutTree(roots, { orientation, alignLeaves }));
	const text = $derived(`${label}: ${roots.map(treeText).join('; ')}`);
	const BOXED = new Set(['node', 'convert', 'error']);
	/** Smallest scale a tree is drawn at (13 px labels become about 10 px). */
	const MIN_SCALE = 0.75;

	/** Where an edge meets a node: its top or bottom edge. */
	function end(i: number, towardsBelow: boolean) {
		const n = layout.nodes[i];
		return { x: n.x, y: towardsBelow ? n.y + n.height / 2 - 2 : n.y - n.height / 2 + 2 };
	}
</script>

<div class="tree-scroll" {@attach scrollRegion(label)}>
	<svg
		class="tree"
		width={layout.width}
		height={layout.height}
		style:min-width="{Math.ceil(layout.width * MIN_SCALE)}px"
		viewBox="0 0 {layout.width} {layout.height}"
		role="img"
		aria-label={text}
	>
		<g class="edges">
			{#each layout.edges as [p, c] (`${p}-${c}`)}
				{@const parentAbove = layout.nodes[p].y < layout.nodes[c].y}
				{@const a = end(p, parentAbove)}
				{@const b = end(c, !parentAbove)}
				<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
			{/each}
		</g>
		{#each layout.nodes as n, i (i)}
			<g class="node {n.node.tone}" transform="translate({n.x} {n.y})">
				{#if BOXED.has(n.node.tone)}
					<rect x={-n.width / 2} y={-n.height / 2} width={n.width} height={n.height} rx="6" />
				{/if}
				<text class="label" y={n.node.note ? -6 : 0}>{n.node.label}</text>
				{#if n.node.note}<text class="note" y="9">{n.node.note}</text>{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.tree-scroll {
		max-width: 100%;
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.tree {
		display: block;
		max-width: 100%;
		height: auto;
		overflow: visible;
	}
	.edges line {
		stroke: var(--edge);
		stroke-width: 1.25;
	}
	text {
		dominant-baseline: central;
		text-anchor: middle;
	}
	.label {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 13px;
		font-variant-ligatures: none;
	}
	.note {
		fill: var(--info);
		font-family: var(--font-sans);
		font-size: 11px;
		font-style: italic;
	}
	rect {
		fill: var(--surface-2);
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.node .label {
		font-weight: 600;
	}
	.convert rect {
		fill: var(--epsilon-soft);
		stroke: var(--epsilon);
	}
	.convert .label {
		fill: var(--epsilon);
	}
	.error rect {
		fill: var(--reject-soft);
		stroke: var(--reject);
	}
	.error .label,
	.error .note {
		fill: var(--reject);
	}
	.category .label {
		fill: var(--accent);
		font-style: italic;
	}
	.word .label {
		fill: var(--tok-3);
	}
</style>
