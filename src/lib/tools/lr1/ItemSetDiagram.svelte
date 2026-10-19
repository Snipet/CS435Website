<!--
	The parsing DFA as item sets (Bottom-up Parsing III, slide 14): each state a
	box of items with its number beside it, its reduce and accept labels beside
	that, the start arrow into state 0, and edges labeled with one grammar
	symbol. The boxes are drawn first with estimated sizes, then measured, and
	the layered layout (box-layout.ts) places them. The drawing scrolls inside
	its own box and zooms; states and edge labels are buttons that select them.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		LrState,
		annotationText,
		formatItem,
		symbolText,
		type StateAnnotation
	} from '$lib/components/grammar';
	import { IconButton } from '$lib/components/ui';
	import type { LrAutomaton } from '$lib/theory/grammar/lr';
	import { layoutBoxes, type BoxNodeInput } from './box-layout';
	import { estimateBox, inRange, monoWidth, type StateRange } from './diagram';
	import { itemLines, linesOf, type ItemForm } from './items';
	import type { DfaSelection } from './selection';

	interface Props {
		automaton: LrAutomaton;
		notes: readonly StateAnnotation[][];
		form: ItemForm;
		range: StateRange;
		/** States and edges made so far by the construction (all, when it is done). */
		made: { states: number; edges: number };
		selected: DfaSelection;
		onselect: (selection: DfaSelection) => void;
		/** The state the parser is in. */
		current?: number | null;
		/** Edge (index in `automaton.edges`) the parser just followed. */
		followed?: number | null;
		/** The construction's last step: the state it worked on, the edge it made, the state it made. */
		step?: { from: number | null; edge: number | null; made: number | null } | null;
		/** Items to mark, by state: indices into the state's items. */
		marks?: ReadonlyMap<number, readonly number[]>;
		ariaLabel?: string;
	}

	let {
		automaton,
		notes,
		form,
		range,
		made,
		selected,
		onselect,
		current = null,
		followed = null,
		step = null,
		marks,
		ariaLabel = 'Parsing DFA'
	}: Props = $props();

	const LABEL_H = 18;
	/** The least scale the drawing opens with. */
	const MIN_DEFAULT = 0.55;

	const ids = $derived.by(() => {
		const out: number[] = [];
		for (let s = range[0]; s <= range[1] && s < automaton.states.length; s++) out.push(s);
		return out;
	});
	const lines = $derived(
		new Map(ids.map((s) => [s, itemLines(automaton.augmented, automaton.states[s].items, form)]))
	);
	const noteTexts = $derived(new Map(ids.map((s) => [s, (notes[s] ?? []).map(annotationText)])));
	const edges = $derived(
		automaton.edges
			.map((e, index) => ({ ...e, index }))
			.filter((e) => inRange(range, e.from) && inRange(range, e.to))
	);
	const outside = $derived(
		automaton.edges.filter(
			(e, k) => k < made.edges && inRange(range, e.from) !== inRange(range, e.to)
		).length
	);

	// Sizes: measured once drawn, estimated until then. A change of content drops the measurements.
	const contentKey = $derived(
		`${ids.join(',')}|${form}|${automaton.states.length}|${automaton.kind}`
	);
	let measured = $state.raw<Record<number, BoxNodeInput>>({});
	let measuredFor = '';
	const nodes = $derived.by(() => {
		const key = contentKey;
		const known: Record<number, BoxNodeInput> = measuredFor === key ? measured : {};
		return ids.map((s) => {
			const m = known[s];
			if (m) return m;
			const est = estimateBox(
				lines.get(s)!.map((l) => l.view),
				noteTexts.get(s)!
			);
			return { id: s, ...est, attach: est.width - 39 };
		});
	});
	const layout = $derived(
		layoutBoxes(
			nodes,
			edges.map((e) => ({
				from: e.from,
				to: e.to,
				label: symbolText(e.symbol),
				labelWidth: monoWidth([...symbolText(e.symbol)].length) + 6
			})),
			{ start: inRange(range, 0) ? 0 : null, labelHeight: LABEL_H }
		)
	);

	const frameEls: Record<number, HTMLElement> = $state({});
	const noteEls: Record<number, HTMLElement> = $state({});

	function measure() {
		const key = contentKey;
		const next: Record<number, BoxNodeInput> = {};
		let changed = measuredFor !== key;
		for (const node of nodes) {
			const el = frameEls[node.id];
			if (!el || !el.isConnected) return;
			const items = el.querySelector<HTMLElement>('.items');
			const noteEl = noteEls[node.id];
			const m: BoxNodeInput = {
				id: node.id,
				width: el.offsetWidth,
				height: el.offsetHeight,
				attach: items?.offsetWidth ?? el.offsetWidth,
				note: noteEl ? { width: noteEl.offsetWidth, height: noteEl.offsetHeight } : null
			};
			if (m.width === 0) return;
			const old = node;
			if (
				Math.abs(m.width - old.width) > 0.5 ||
				Math.abs(m.height - old.height) > 0.5 ||
				Math.abs((m.note?.width ?? 0) - (old.note?.width ?? 0)) > 0.5 ||
				Math.abs((m.note?.height ?? 0) - (old.note?.height ?? 0)) > 0.5 ||
				Math.abs((m.attach ?? 0) - (old.attach ?? 0)) > 0.5
			)
				changed = true;
			next[node.id] = m;
		}
		if (!changed) return;
		measuredFor = key;
		measured = next;
	}

	$effect(() => {
		void layout;
		untrack(measure);
	});
	$effect(() => {
		// Web fonts change the boxes' sizes once they load.
		if (typeof document === 'undefined' || !document.fonts) return;
		let live = true;
		document.fonts.ready.then(() => {
			if (live) {
				measuredFor = '';
				measure();
			}
		});
		return () => {
			live = false;
		};
	});

	// Zoom: by default the drawing fits the width of its box (never enlarged).
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	let zoom = $state<number | null>(null);
	// On a narrow screen the drawing keeps a readable size and scrolls sideways instead.
	const fitWidth = $derived(
		viewportWidth > 0
			? Math.max(Math.min(1, (viewportWidth - 2) / Math.max(1, layout.width)), MIN_DEFAULT)
			: 1
	);
	const scale = $derived(zoom ?? fitWidth);
	const clampScale = (s: number) => Math.min(2.5, Math.max(0.15, s));
	function fitAll() {
		if (viewportWidth <= 0) return;
		zoom = clampScale(
			Math.min(
				1,
				(viewportWidth - 2) / layout.width,
				viewportHeight > 0 ? (viewportHeight - 2) / layout.height : 1
			)
		);
	}

	const placed = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
	const isSelectedState = (s: number) => selected?.kind === 'state' && selected.state === s;
	const isSelectedEdge = (e: number) => selected?.kind === 'edge' && selected.edge === e;

	function stateName(s: number): string {
		const parts = [`State ${s}`];
		if (current === s) parts.push('the parser is here');
		if (step?.made === s) parts.push('just made');
		else if (step?.from === s) parts.push('being worked on');
		const items = lines.get(s)!.map((l) => formatItem(l.view, 'compact'));
		return [parts.join(', '), ...items, ...noteTexts.get(s)!].join('; ');
	}

	function onkey(event: KeyboardEvent, selection: DfaSelection) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect(selection);
		}
	}
</script>

<div class="diagram">
	<div class="toolbar">
		<span class="count">
			{#if ids.length < automaton.states.length}
				States {range[0]}–{range[1]} of {automaton.states.length}{outside > 0
					? `; ${outside} ${outside === 1 ? 'edge leads' : 'edges lead'} to states not drawn`
					: ''}
			{:else}
				{automaton.states.length} states
			{/if}
		</span>
		<div class="zoom">
			<IconButton
				icon="minus"
				label="Zoom out"
				size="sm"
				onclick={() => (zoom = clampScale(scale / 1.25))}
			/>
			<span class="pct" aria-live="polite">{Math.round(scale * 100)}%</span>
			<IconButton
				icon="plus"
				label="Zoom in"
				size="sm"
				onclick={() => (zoom = clampScale(scale * 1.25))}
			/>
			<IconButton icon="fit" label="Zoom to fit" size="sm" onclick={fitAll} />
			<IconButton icon="reset" label="Fit the width" size="sm" onclick={() => (zoom = null)} />
		</div>
	</div>
	<div
		class="viewport"
		bind:clientWidth={viewportWidth}
		bind:clientHeight={viewportHeight}
		role="group"
		aria-label={ariaLabel}
	>
		<div class="sizer" style="width: {layout.width * scale}px; height: {layout.height * scale}px;">
			<div
				class="canvas"
				style="width: {layout.width}px; height: {layout.height}px; transform: scale({scale});"
			>
				<svg
					width={layout.width}
					height={layout.height}
					viewBox="0 0 {layout.width} {layout.height}"
					aria-hidden="true"
				>
					{#if layout.start && made.states > 0}
						<g class="edge start">
							<path class="line" d={layout.start.d} />
							<path class="head" d={layout.start.arrow} />
						</g>
					{/if}
					{#each layout.edges as e (e.index)}
						{@const k = edges[e.index].index}
						{#if k < made.edges}
							<g
								class={[
									'edge',
									{
										marked: followed === k || isSelectedEdge(k),
										fresh: step?.edge === k
									}
								]}
							>
								<path class="line" d={e.d} />
								<path class="head" d={e.arrow} />
							</g>
						{/if}
					{/each}
				</svg>
				{#each ids as s (s)}
					{@const p = placed.get(s)}
					{#if p}
						{@const shown = s < made.states}
						{@const stateLines = lines.get(s)!}
						{@const marked = marks?.get(s)}
						<div
							class={[
								'node',
								{
									hidden: !shown,
									selected: isSelectedState(s),
									fresh: step?.made === s,
									working: step?.from === s && step?.made !== s
								}
							]}
							style="left: {p.frame.x}px; top: {p.frame.y}px;"
							bind:this={frameEls[s]}
							role="button"
							tabindex={shown ? 0 : -1}
							aria-hidden={shown ? undefined : 'true'}
							aria-pressed={isSelectedState(s)}
							aria-label={stateName(s)}
							onclick={() => onselect({ kind: 'state', state: s })}
							onkeydown={(event) => onkey(event, { kind: 'state', state: s })}
						>
							<LrState
								number={s}
								items={stateLines.map((l) => l.view)}
								merge={false}
								annotations={[]}
								current={current === s}
								highlight={marked ? linesOf(stateLines, marked) : []}
							/>
						</div>
						{#if p.note}
							<div
								class={['note', { hidden: !shown }]}
								style="left: {p.note.x}px; top: {p.note.y}px;"
								bind:this={noteEls[s]}
								aria-hidden="true"
							>
								{#each noteTexts.get(s)! as text, i (i)}<span>{text}</span>{/each}
							</div>
						{/if}
					{/if}
				{/each}
				{#each layout.edges as e (e.index)}
					{@const edge = edges[e.index]}
					{#if edge.index < made.edges}
						<button
							type="button"
							class={[
								'edge-label',
								{
									marked: followed === edge.index || isSelectedEdge(edge.index),
									fresh: step?.edge === edge.index
								}
							]}
							style="left: {e.labelBox.x}px; top: {e.labelBox.y}px; width: {e.labelBox
								.width}px; height: {e.labelBox.height}px;"
							aria-pressed={isSelectedEdge(edge.index)}
							aria-label="Edge from state {edge.from} to state {edge.to} on {symbolText(
								edge.symbol
							)}"
							onclick={() => onselect({ kind: 'edge', edge: edge.index })}>{e.label}</button
						>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.diagram {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.count {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.pct {
		min-width: 3.2em;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.viewport {
		max-height: min(72vh, 44rem);
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overscroll-behavior: contain;
	}
	.sizer {
		position: relative;
		margin: 0 auto;
		overflow: hidden;
	}
	.canvas {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}
	.edge .line {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.4;
	}
	.edge .head {
		fill: var(--edge);
	}
	.edge.fresh .line {
		stroke: var(--accept);
		stroke-width: 2.4;
	}
	.edge.fresh .head {
		fill: var(--accept);
	}
	.edge.marked .line {
		stroke: var(--active);
		stroke-width: 2.6;
	}
	.edge.marked .head {
		fill: var(--active);
	}
	.node {
		position: absolute;
		display: flex;
		width: max-content;
		border-radius: 2px;
		cursor: pointer;
	}
	.node.hidden,
	.note.hidden {
		visibility: hidden;
	}
	.node:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 3px;
	}
	.node.selected {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.node.fresh :global(.items) {
		box-shadow: 0 0 0 3px var(--accept-soft);
		border-color: var(--accept);
	}
	.node.working :global(.items) {
		border-style: dashed;
	}
	.note {
		position: absolute;
		display: flex;
		flex-direction: column;
		width: max-content;
		color: var(--tok-3);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1.5;
		white-space: pre;
	}
	.edge-label {
		position: absolute;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 3px;
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1;
		white-space: pre;
		cursor: pointer;
	}
	.edge-label:hover {
		background: var(--surface-3);
	}
	.edge-label.fresh {
		color: var(--accept);
		font-weight: 700;
	}
	.edge-label.marked {
		background: var(--active-soft);
		color: var(--text);
		font-weight: 700;
		box-shadow: 0 0 0 1px var(--active);
	}
	.edge-label:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
