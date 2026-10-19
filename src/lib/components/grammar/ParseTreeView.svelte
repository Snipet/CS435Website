<!--
	A parse tree drawn as on the lecture slides (docs/ARCHITECTURE.md §3.10): root
	at the top, children left to right, plain lines fanning out from a point under
	the parent, labels without boxes, every leaf one level below its own parent.
	With layout="baseline" (bottom-up trees) every leaf sits on one bottom row and
	the tree grows upward; `forest` draws several trees over one baseline (a
	partial bottom-up parse), and `marker` puts an up-arrow under the divider.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion, Tween } from 'svelte/motion';
	import type { ParseNode } from '$lib/theory/grammar/types';
	import { toneColors } from '$lib/components/ui/tones';
	import {
		EDGE_INSET,
		FONT_SIZE,
		LABEL_HEIGHT,
		MARKER_HALF,
		MARKER_LENGTH,
		SUB_SCALE,
		boxWidth,
		describeForest,
		describeTree,
		layoutForest,
		layoutTree,
		neighborOf,
		pathKey,
		treeSizing,
		type TreeDirection,
		type TreeLabeler,
		type TreeLayout,
		type TreeLayoutKind,
		type TreeLayoutNode
	} from './tree-layout';
	import type { TreeHighlight, TreeTone } from './types';

	/** One tree, or several side by side over one baseline. */
	type Source =
		| { tree: ParseNode; forest?: undefined }
		| {
				tree?: undefined;
				/**
				 * Trees side by side over one baseline, e.g. a partial bottom-up parse:
				 * the subtrees of the stack symbols, then bare leaves for the tokens
				 * still to come. Always drawn with the baseline layout. Paths (in
				 * `highlight`, `labels` and `onnodeclick`) start with the tree's index.
				 */
				forest: readonly ParseNode[];
		  };

	type Props = Source & {
		/**
		 * `tree` (default): top-down, every leaf one level below its parent.
		 * `baseline`: the leaves on one bottom row, the tree growing upward
		 * (bottom-up trees).
		 */
		layout?: TreeLayoutKind;
		/**
		 * Baseline layouts: an up-arrow under the leaves after this many of them
		 * (the divider of a shift-reduce parse; 0 = before the first leaf). Room
		 * for it is kept at both ends, so moving it does not resize the drawing.
		 */
		marker?: number;
		/**
		 * Baseline layouts: the least number of rows, so a tree that grows step by
		 * step keeps its height (pass the finished tree's `rows`).
		 */
		minRows?: number;
		/** Color of every label, so two trees for one string can be told apart. */
		tone?: TreeTone;
		/** Nodes to mark, by path (child indices from the root). */
		highlight?: TreeHighlight;
		/**
		 * Label per node instead of its symbol; trailing digits become a subscript
		 * (`E0`, `T1`). Return null or undefined to keep the symbol.
		 */
		labels?: TreeLabeler;
		/** Crosses the whole tree out with a large X. */
		rejected?: boolean;
		/** Makes nodes selectable: click, or arrow keys and Enter. */
		onnodeclick?: (path: number[], node: ParseNode) => void;
		ariaLabel?: string;
		/** Label size in px when the tree has room. */
		labelSize?: number;
		/**
		 * The tree shrinks with its container down to this label size, then scrolls
		 * sideways. With `onnodeclick` it stops shrinking sooner: every node stays a
		 * target of at least 24 px a side (see `treeSizing`).
		 */
		minLabelSize?: number;
	};

	let {
		tree,
		forest,
		layout: kind = 'tree',
		marker,
		minRows,
		tone,
		highlight,
		labels,
		rejected = false,
		onnodeclick,
		ariaLabel = 'Parse tree',
		labelSize = 16,
		minLabelSize = 11
	}: Props = $props();

	const uid = $props.id();

	/** Text baseline below the label center, so capitals and x-height letters both look centered. */
	const BASELINE = FONT_SIZE * 0.34;
	const SUB_DROP = FONT_SIZE * 0.25;
	const REACH = LABEL_HEIGHT / 2 + EDGE_INSET;
	/** Larger trees change without the move animation. */
	const ANIMATE_MAX = 400;
	/** Trees up to this size are spelled out for screen readers. */
	const DESCRIBE_MAX = 200;

	const interactive = $derived(!!onnodeclick);
	const sizing = $derived(treeSizing(labelSize, minLabelSize, interactive));
	const layout = $derived.by(() => {
		const opts = { labels, gap: sizing.gap, levelHeight: sizing.levelHeight, marker, minRows };
		if (forest) return layoutForest(forest, opts);
		// The props type rules out a view with neither.
		return layoutTree(tree as ParseNode, { ...opts, layout: kind });
	});

	type Mark = 'current' | 'matched' | 'fresh';
	const MARK_TONE = { current: 'active', matched: 'accept', fresh: 'info' } as const;
	const MARK_NAME = { current: 'current', matched: 'matched', fresh: 'new' } as const;
	// A node in several lists takes the last of fresh, matched, current.
	const marks = $derived.by(() => {
		const entries = (paths: TreeHighlight[Mark], mark: Mark) =>
			(paths ?? []).map((p): [string, Mark] => [pathKey(p), mark]);
		return new Map([
			...entries(highlight?.fresh, 'fresh'),
			...entries(highlight?.matched, 'matched'),
			...entries(highlight?.current, 'current')
		]);
	});
	const dimmed = $derived(new Set((highlight?.dim ?? []).map(pathKey)));

	// When the tree changes, nodes that stay (same path and symbol) move from
	// where they were drawn and new ones fade in.
	interface Origin {
		at: Map<string, { x: number; y: number }>;
		width: number;
		height: number;
		/** Where the marker's tip was, if there was one. */
		marker: { x: number; y: number } | null;
	}
	let origin = $state.raw<Origin | null>(null);
	const progress = new Tween(1, { duration: 220, easing: cubicOut });
	let drawn: TreeLayout | null = null;

	const mix = (a: number, b: number, t: number) => a + (b - a) * t;

	function place(n: TreeLayoutNode, from: Origin | null, t: number) {
		const o = from?.at.get(n.key);
		if (!o) return { x: n.x, y: n.y, opacity: from ? t : 1 };
		return { x: mix(o.x, n.x, t), y: mix(o.y, n.y, t), opacity: 1 };
	}

	function frameOf(l: TreeLayout, from: Origin | null, t: number) {
		const m = l.marker;
		return {
			nodes: l.nodes.map((n) => place(n, from, t)),
			width: from ? mix(from.width, l.width, t) : l.width,
			height: from ? mix(from.height, l.height, t) : l.height,
			marker: !m
				? null
				: from?.marker
					? { x: mix(from.marker.x, m.x, t), y: mix(from.marker.y, m.y1, t) }
					: { x: m.x, y: m.y1 }
		};
	}

	const frame = $derived.by(() => {
		const t = progress.current;
		return frameOf(layout, t < 1 ? origin : null, t);
	});

	$effect.pre(() => {
		const next = layout;
		untrack(() => {
			const prev = drawn;
			drawn = next;
			if (!prev || prev === next) return;
			if (prefersReducedMotion.current || next.nodes.length > ANIMATE_MAX) {
				void progress.set(1, { duration: 0 });
				return;
			}
			// Start from what is on screen, also in the middle of a move.
			const t = progress.current;
			const shown = frameOf(prev, t < 1 ? origin : null, t);
			origin = {
				at: new Map(prev.nodes.map((n, i) => [n.key, shown.nodes[i]])),
				width: shown.width,
				height: shown.height,
				marker: shown.marker
			};
			void progress.set(0, { duration: 0 });
			void progress.set(1);
		});
	});

	const color = $derived(tone === undefined ? null : toneColors(tone).fg);

	/** Where the marker stands, by the leaves around it. */
	const markerText = $derived.by(() => {
		const m = layout.marker;
		if (!m) return '';
		const text = (k: number) => layout.nodes[layout.leaves[k]]?.text;
		const before = m.leaves > 0 ? text(m.leaves - 1) : undefined;
		const after = text(m.leaves);
		if (before !== undefined && after !== undefined) return `; ↑ between ${before} and ${after}`;
		if (after !== undefined) return `; ↑ before ${after}`;
		return before !== undefined ? `; ↑ after ${before}` : '';
	});

	const label = $derived.by(() => {
		const crossed = rejected ? ' (crossed out)' : '';
		if (interactive) return ariaLabel + crossed + markerText;
		const current = (highlight?.current ?? [])
			.map((p) => layout.nodes.find((n) => n.id === pathKey(p))?.text)
			.filter((text) => text !== undefined);
		const body =
			layout.nodes.length > DESCRIBE_MAX
				? `${layout.nodes.length} nodes`
				: forest
					? describeForest(forest, labels)
					: describeTree(tree as ParseNode, labels);
		return `${ariaLabel}${crossed}: ${body}${current.length ? `; current: ${current.join(', ')}` : ''}${markerText}`;
	});

	function nodeName(n: TreeLayoutNode): string {
		const parent = n.parent === null ? null : layout.nodes[n.parent];
		const where = parent
			? `child ${n.path[n.path.length - 1] + 1} of ${parent.children.length} of ${parent.text}`
			: forest
				? `tree ${n.root + 1} of ${forest.length}`
				: 'root';
		const mark = marks.get(n.id);
		return `${n.text}, ${where}${mark ? `, ${MARK_NAME[mark]}` : ''}`;
	}

	// One tab stop: the node last focused, or the root.
	let svg: SVGSVGElement | undefined = $state();
	let focusId = $state('');
	const tabStop = $derived.by(() => {
		const i = layout.nodes.findIndex((n) => n.id === focusId && n.node !== null);
		return i === -1 ? 0 : i;
	});

	const ARROWS: Record<string, TreeDirection> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right'
	};

	function activate(n: TreeLayoutNode) {
		if (n.node) onnodeclick?.(n.path, n.node);
	}

	function onkeydown(event: KeyboardEvent, n: TreeLayoutNode) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			activate(n);
			return;
		}
		let target: number | null;
		if (event.key === 'Home') target = 0;
		else if (Object.hasOwn(ARROWS, event.key)) {
			target = neighborOf(layout, n.index, ARROWS[event.key]);
		} else return;
		event.preventDefault();
		if (target === null) return;
		// The tab stop moves with the focus (see `onfocus`).
		svg?.querySelector<SVGGElement>(`[data-index="${target}"]`)?.focus();
	}

	// A tree wider than its box at the smallest label size scrolls inside the
	// box; the box then takes keyboard focus so it can be scrolled without a mouse.
	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);
	$effect(() => {
		const el = box;
		const drawing = svg;
		if (!el || !drawing || typeof ResizeObserver === 'undefined') return;
		const check = () => (scrolls = el.scrollWidth > el.clientWidth + 1);
		const observer = new ResizeObserver(check);
		observer.observe(el);
		observer.observe(drawing);
		check();
		return () => observer.disconnect();
	});
	const scrollRegion = $derived(scrolls && !interactive);
</script>

{#snippet body(n: TreeLayoutNode, w: number)}
	{@const mark = marks.get(n.id)}
	{@const hit = boxWidth(n.width, sizing.target)}
	<rect class="hit" x={-hit / 2} y={-sizing.target / 2} width={hit} height={sizing.target} rx="5" />
	{#if mark}
		{@const c = toneColors(MARK_TONE[mark])}
		<rect
			class="mark"
			x={-w / 2}
			y={-LABEL_HEIGHT / 2}
			width={w}
			height={LABEL_HEIGHT}
			rx="4"
			fill={c.bg}
		/>
		<rect
			class="bar"
			x={-w / 2 + 2}
			y={LABEL_HEIGHT / 2 - 2}
			width={w - 4}
			height="2"
			fill={c.fg}
		/>
	{/if}
	<text class={['label', mark]} y={BASELINE} font-size={FONT_SIZE}
		>{n.label.base}{#if n.label.sub}<tspan dy={SUB_DROP} font-size={FONT_SIZE * SUB_SCALE}
				>{n.label.sub}</tspan
			>{/if}</text
	>
	<rect
		class="ring"
		x={-w / 2 - 1}
		y={-LABEL_HEIGHT / 2 - 2}
		width={w + 2}
		height={LABEL_HEIGHT + 4}
		rx="6"
	/>
{/snippet}

<!-- A box that scrolls must be reachable from the keyboard. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={box}
	class="parse-tree"
	style="--tree-w: {frame.width * sizing.scale}px; --tree-min: {frame.width *
		sizing.minScale}px;{color ? ` --tree-fg: ${color};` : ''}"
	role={scrollRegion ? 'group' : undefined}
	aria-label={scrollRegion ? `${ariaLabel}, scrolls sideways` : undefined}
	tabindex={scrollRegion ? 0 : undefined}
>
	<svg
		bind:this={svg}
		viewBox="0 0 {frame.width} {frame.height}"
		width={frame.width * sizing.scale}
		height={frame.height * sizing.scale}
		role={interactive ? 'group' : 'img'}
		aria-label={label}
		aria-describedby={interactive ? `${uid}-keys` : undefined}
	>
		<g class="edges" aria-hidden="true">
			{#each layout.edges as e (e.key)}
				{@const a = frame.nodes[e.parent]}
				{@const b = frame.nodes[e.child]}
				<line
					x1={a.x}
					y1={a.y + REACH}
					x2={b.x}
					y2={b.y - REACH}
					opacity={b.opacity * (dimmed.has(layout.nodes[e.child].id) ? 0.35 : 1)}
				/>
			{/each}
		</g>
		{#each layout.nodes as n (n.key)}
			{@const p = frame.nodes[n.index]}
			{@const w = boxWidth(n.width)}
			{@const opacity = p.opacity * (dimmed.has(n.id) ? 0.4 : 1)}
			{#if interactive && n.node}
				<g
					class="node button"
					transform="translate({p.x} {p.y})"
					{opacity}
					role="button"
					tabindex={n.index === tabStop ? 0 : -1}
					aria-label={nodeName(n)}
					data-index={n.index}
					onclick={() => activate(n)}
					onkeydown={(event) => onkeydown(event, n)}
					onfocus={() => (focusId = n.id)}
				>
					{@render body(n, w)}
				</g>
			{:else}
				<g class="node" transform="translate({p.x} {p.y})" {opacity} aria-hidden="true">
					{@render body(n, w)}
				</g>
			{/if}
		{/each}
		{#if frame.marker}
			{@const m = frame.marker}
			<g class="marker" aria-hidden="true">
				<line x1={m.x} y1={m.y + 6} x2={m.x} y2={m.y + MARKER_LENGTH} />
				<path d="M {m.x} {m.y} l -{MARKER_HALF} 9 h {2 * MARKER_HALF} z" />
			</g>
		{/if}
		{#if rejected}
			<g class="cross" aria-hidden="true">
				<line x1="4" y1="4" x2={frame.width - 4} y2={frame.height - 4} />
				<line x1={frame.width - 4} y1="4" x2="4" y2={frame.height - 4} />
			</g>
		{/if}
	</svg>
	{#if interactive}
		<span class="visually-hidden" id="{uid}-keys"
			>Arrow keys move between nodes. Enter selects a node.</span
		>
	{/if}
</div>

<style>
	.parse-tree {
		position: relative;
		max-width: 100%;
		min-width: 0;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		border-radius: var(--radius-sm);
	}
	svg {
		display: block;
		width: 100%;
		min-width: var(--tree-min);
		max-width: var(--tree-w);
		height: auto;
		margin-inline: auto;
	}
	.edges line {
		stroke: var(--edge);
		stroke-width: 1.25;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.label {
		fill: var(--tree-fg, var(--text));
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		text-anchor: middle;
		white-space: pre;
		user-select: none;
	}
	.label.current {
		font-weight: 700;
	}
	.hit,
	.ring {
		fill: none;
	}
	.hit {
		pointer-events: all;
	}
	.ring {
		pointer-events: none;
	}
	.button {
		cursor: pointer;
		outline: none;
	}
	.button:hover .hit {
		fill: var(--surface-2);
	}
	.button:focus-visible .ring {
		stroke: var(--focus);
		stroke-width: 2;
	}
	.marker line {
		stroke: var(--text);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.marker path {
		fill: var(--text);
	}
	.cross line {
		stroke: var(--reject);
		stroke-width: 3.5;
		stroke-linecap: round;
		pointer-events: none;
	}
</style>
