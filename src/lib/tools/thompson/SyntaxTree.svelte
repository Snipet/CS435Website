<!--
@component
The expression with the current step's sub-expression marked, and its syntax
tree numbered in step order (post-order). Nodes are buttons that go to their
step; with a node focused, ←/→ (or ↑/↓) move one step and Home/End go to the
first or last step.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import type { SourceMarks } from './construction';
	import { NODE_H, subtreeKeys, type TreeLayout, type TreeNode } from './tree';

	interface Props {
		layout: TreeLayout;
		/** Current step index. */
		current: number;
		total: number;
		/** Sub-expression and clause name of each step. */
		texts: readonly string[];
		clauses: readonly string[];
		/** The main expression as written, and where the current step sits in it. */
		source: string;
		marks: SourceMarks | null;
		onselect: (step: number) => void;
	}

	let { layout, current, total, texts, clauses, source, marks, onselect }: Props = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let svg: SVGSVGElement | undefined = $state();

	const currentNode = $derived(layout.nodes.find((n) => n.step === current) ?? null);
	const inCurrent = $derived(
		currentNode ? subtreeKeys(layout, currentNode.key) : new Set<string>()
	);

	type Look = 'current' | 'part' | 'done' | 'todo' | 'unbuilt';
	function look(n: TreeNode): Look {
		if (n.step === null) return 'unbuilt';
		if (n.step === current) return 'current';
		if (inCurrent.has(n.key)) return 'part';
		return n.step < current ? 'done' : 'todo';
	}

	const edges = $derived(
		layout.nodes.flatMap((n) =>
			n.children.map((k) => {
				const child = layout.byKey.get(k)!;
				return { key: `${n.key}>${k}`, from: n, to: child };
			})
		)
	);

	function edgeLook(from: TreeNode, to: TreeNode): string {
		if (inCurrent.has(from.key) && inCurrent.has(to.key)) return 'part';
		const l = look(to);
		return l === 'todo' || l === 'unbuilt' || look(from) === 'todo' ? 'todo' : 'done';
	}

	const excerpt = (text: string, mark: { start: number; end: number } | null) => {
		if (!mark) return { before: text, mark: '', after: '' };
		const start = Math.max(0, Math.min(mark.start, text.length));
		const end = Math.max(start, Math.min(mark.end, text.length));
		return { before: text.slice(0, start), mark: text.slice(start, end), after: text.slice(end) };
	};
	const main = $derived(excerpt(source, marks?.main ?? null));
	const def = $derived(marks?.def ? excerpt(marks.def.line, marks.def) : null);

	function go(step: number) {
		const s = Math.max(0, Math.min(total - 1, step));
		if (s !== current) onselect(s);
	}

	async function onkeydown(event: KeyboardEvent, n: TreeNode) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const map: Record<string, number> = {
			ArrowRight: current + 1,
			ArrowDown: current + 1,
			ArrowLeft: current - 1,
			ArrowUp: current - 1,
			Home: 0,
			End: total - 1
		};
		if (event.key in map) {
			event.preventDefault();
			go(map[event.key]);
			await tick();
			svg?.querySelector<SVGGElement>('[data-current]')?.focus();
		} else if ((event.key === 'Enter' || event.key === ' ') && n.step !== null) {
			event.preventDefault();
			go(n.step);
		}
	}

	// Keep the current node in view when the tree is wider than its box.
	$effect(() => {
		const n = currentNode;
		const box = scroller;
		if (!n || !box || box.scrollWidth <= box.clientWidth) return;
		const margin = 40;
		const left = box.scrollLeft;
		const right = left + box.clientWidth;
		if (n.x - n.w / 2 - margin < left || n.x + n.w / 2 + margin > right)
			box.scrollLeft = Math.max(0, n.x - box.clientWidth / 2);
	});
</script>

<div class="syntax-tree">
	<div class="source" aria-hidden="true">
		<p class="line mono">
			{main.before}<mark class:empty={!main.mark}>{main.mark}</mark>{main.after}
		</p>
		{#if def && marks?.def}
			<p class="line def mono">
				<span class="in">in</span>
				{def.before}<mark>{def.mark}</mark>{def.after}
			</p>
		{/if}
	</div>

	<div class="scroll" bind:this={scroller}>
		<svg
			bind:this={svg}
			width={layout.width}
			height={layout.height}
			viewBox="0 0 {layout.width} {layout.height}"
			role="group"
			aria-label="Syntax tree, numbered in step order"
		>
			<g class="edges" aria-hidden="true">
				{#each edges as e (e.key)}
					<line
						class="edge {edgeLook(e.from, e.to)}"
						x1={e.from.x}
						y1={e.from.y + NODE_H / 2}
						x2={e.to.x}
						y2={e.to.y - NODE_H / 2}
					/>
				{/each}
			</g>
			{#each layout.nodes as n (n.key)}
				{@const l = look(n)}
				{#if n.step !== null}
					{@const step = n.step}
					<g
						class="node {l}"
						role="button"
						tabindex={step === current ? 0 : -1}
						aria-label="Step {step + 1} of {total}: {texts[step]}, {clauses[step]}"
						aria-current={step === current ? 'step' : undefined}
						data-current={step === current ? '' : undefined}
						onclick={() => go(step)}
						onkeydown={(e) => onkeydown(e, n)}
					>
						{@render shape(n)}
						<text class="num" x={n.x + n.w / 2 + 2} y={n.y - NODE_H / 2 + 3}>{step + 1}</text>
					</g>
				{:else}
					<g class="node {l}" aria-hidden="true">
						<title>Not built: zero copies</title>
						{@render shape(n)}
					</g>
				{/if}
			{/each}
		</svg>
	</div>
</div>

{#snippet shape(n: TreeNode)}
	{#if n.circle}
		<circle class="ring-focus" cx={n.x} cy={n.y} r={NODE_H / 2 + 4} />
		<circle class="body" cx={n.x} cy={n.y} r={NODE_H / 2} />
	{:else}
		<rect
			class="ring-focus"
			x={n.x - n.w / 2 - 4}
			y={n.y - NODE_H / 2 - 4}
			width={n.w + 8}
			height={NODE_H + 8}
			rx={NODE_H / 2 + 4}
		/>
		<rect
			class="body"
			x={n.x - n.w / 2}
			y={n.y - NODE_H / 2}
			width={n.w}
			height={NODE_H}
			rx={NODE_H / 2}
		/>
	{/if}
	<text class="label" x={n.x} y={n.y}>{n.label}</text>
{/snippet}

<style>
	.syntax-tree {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.source {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.line {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.line.def {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.in {
		margin-right: 0.35em;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	mark {
		padding: 1px 1px;
		border-radius: 3px;
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
		color: var(--text);
	}
	mark.empty {
		display: none;
	}
	.scroll {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 2px 0;
		overscroll-behavior-x: contain;
	}
	svg {
		display: block;
		margin: 0 auto;
		overflow: visible;
	}
	.edge {
		stroke: var(--border-strong);
		stroke-width: 1.3;
	}
	.edge.part {
		stroke: var(--accent);
	}
	.edge.todo {
		stroke-dasharray: 3 3;
		opacity: 0.6;
	}
	.node {
		cursor: pointer;
		outline: none;
	}
	.node[aria-hidden='true'] {
		cursor: default;
	}
	.body {
		fill: var(--surface);
		stroke: var(--border-strong);
		stroke-width: 1.3;
		transition:
			fill var(--duration) var(--ease),
			stroke var(--duration) var(--ease);
	}
	.label {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 13px;
		font-variant-ligatures: none;
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	.num {
		fill: var(--text-3);
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		dominant-baseline: central;
		pointer-events: none;
	}
	.ring-focus {
		fill: none;
		stroke: var(--focus);
		stroke-width: 2;
		opacity: 0;
	}
	.node:focus-visible .ring-focus {
		opacity: 1;
	}
	.node:hover .body {
		stroke: var(--text-3);
	}
	.node.part .body {
		fill: var(--accent-soft);
		stroke: var(--accent);
	}
	.node.current .body {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 2.2;
	}
	.node.current .label {
		font-weight: 700;
	}
	.node.current .num {
		fill: var(--active);
	}
	.node.todo .body,
	.node.unbuilt .body {
		fill: var(--surface);
		stroke-dasharray: 3 3;
	}
	.node.todo .label,
	.node.todo .num,
	.node.unbuilt .label {
		fill: var(--text-3);
	}
	.node.todo,
	.node.unbuilt {
		opacity: 0.75;
	}
</style>
