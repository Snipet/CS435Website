<!--
	The tree the visitor walks, one node per row: the field that holds it, its
	class and key fields, and its line. The node of the current step is
	marked, the nodes whose visit is in progress are marked lightly, and the
	nodes not visited yet are dimmed. A row goes to the step that visits its
	node and selects the node in the source. A long tree lists a stretch of
	its rows (around the current node, chosen by the caller).

	Keys, as in a tree view: Up and Down move, Left moves to the parent, Right
	to the first child, Home and End jump, Enter or Space picks the node.
-->
<script lang="ts">
	import MoreRows from './MoreRows.svelte';
	import { revealBlock } from './reveal';
	import type { VisitRow, VisitStatus } from './visitor-view';

	interface Props {
		rows: readonly VisitRow[];
		/** The rows listed: `rows.slice(start, end)`. */
		start: number;
		end: number;
		status: (id: number) => VisitStatus;
		/** The node of the current step. */
		current: number | null;
		/** Ids of the nodes that belong to the selection. */
		marked: ReadonlySet<number>;
		onpick: (id: number) => void;
		onshowall: () => void;
	}

	let { rows, start, end, status, current, marked, onpick, onshowall }: Props = $props();

	const uid = $props.id();
	const listed = $derived(rows.slice(start, end));
	let focusId = $state<number | null>(null);
	const tabStop = $derived(
		focusId !== null && listed.some((r) => r.id === focusId)
			? focusId
			: (current ?? listed[0]?.id ?? 0)
	);
	let box: HTMLDivElement | undefined = $state();

	const STATUS_TEXT: Record<VisitStatus, string> = {
		current: 'current step',
		open: 'visit in progress',
		done: 'visited',
		pending: 'not visited yet'
	};

	// The row of the current step stays in view inside the box.
	$effect(() => {
		const el = box;
		const id = current;
		if (!el || id === null) return;
		const frame = requestAnimationFrame(() => {
			const row = el.querySelector(`[data-id="${id}"]`);
			if (row) revealBlock(el, row);
		});
		return () => cancelAnimationFrame(frame);
	});

	function focusRow(id: number) {
		focusId = id;
		box?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
	}

	function onkeydown(event: KeyboardEvent, row: VisitRow, i: number) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		let target: VisitRow | undefined;
		switch (event.key) {
			case 'ArrowDown':
				target = listed[i + 1];
				break;
			case 'ArrowUp':
				target = listed[i - 1];
				break;
			case 'Home':
				target = listed[0];
				break;
			case 'End':
				target = listed[listed.length - 1];
				break;
			case 'ArrowRight':
				if (listed[i + 1]?.depth === row.depth + 1) target = listed[i + 1];
				break;
			case 'ArrowLeft':
				for (let k = i - 1; k >= 0; k--) {
					if (listed[k].depth < row.depth) {
						target = listed[k];
						break;
					}
				}
				break;
			case 'Enter':
			case ' ':
				onpick(row.id);
				break;
			default:
				return;
		}
		event.preventDefault();
		if (target) focusRow(target.id);
	}
</script>

<div class="tree-wrap">
	<div class="cm-box rows" role="tree" aria-label="The tree the visitor walks" bind:this={box}>
		{#each listed as row, i (row.id)}
			{@const st = status(row.id)}
			<div
				class={['item', st, { 'cm-marked': marked.has(row.id) }]}
				role="treeitem"
				id="{uid}-{row.id}"
				data-id={row.id}
				aria-level={row.depth + 1}
				aria-selected={marked.has(row.id)}
				aria-current={st === 'current' ? 'step' : undefined}
				aria-label="{row.field ? `${row.field}: ` : ''}{row.label}, line {row.line}, {STATUS_TEXT[
					st
				]}"
				tabindex={row.id === tabStop ? 0 : -1}
				style="--depth: {row.depth}"
				onclick={() => {
					focusId = row.id;
					onpick(row.id);
				}}
				onkeydown={(event) => onkeydown(event, row, i)}
				onfocus={() => (focusId = row.id)}
			>
				<span class="node"
					>{#if row.field}<span class="field">{row.field}:</span>{/if}<span class="label"
						>{row.label}</span
					></span
				>
				<span class="line">{row.line}</span>
			</div>
		{/each}
	</div>
	<MoreRows shown={listed.length} total={rows.length} from={start} noun="nodes" {onshowall} />
</div>

<style>
	.tree-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.rows {
		display: grid;
		grid-template-columns: minmax(max-content, 1fr) 2.5rem;
		align-content: start;
		max-height: min(26rem, 60vh);
		padding: 4px 0;
	}
	.item {
		--row: var(--surface);
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: baseline;
		padding: 0 10px;
		border-left: 3px solid transparent;
		background: var(--row);
		font-family: var(--font-mono);
		font-size: 0.78125rem;
		font-variant-ligatures: none;
		line-height: 1.6;
		cursor: pointer;
	}
	.item:hover {
		--row: var(--surface-2);
	}
	.item:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
		border-radius: var(--radius-sm);
	}
	/* Dimmed, and still at 4.5:1 or more (the field names are --text-3 on every row). */
	.item.pending .label {
		color: color-mix(in srgb, var(--text-2) 40%, var(--text-3));
	}
	.item.open {
		border-left-color: color-mix(in srgb, var(--info) 45%, transparent);
	}
	.item:global(.cm-marked) {
		--row: var(--active-soft);
	}
	.item.current {
		--row: var(--info-soft);
		border-left-color: var(--info);
	}
	.item.current .label {
		font-weight: 650;
	}
	.node {
		padding-left: calc(var(--depth) * 0.75rem);
		white-space: nowrap;
	}
	.field {
		margin-right: 0.5em;
		color: var(--text-3);
	}
	/* The line stays at the right edge while a wide row scrolls sideways under it. */
	.line {
		position: sticky;
		right: 0;
		margin-right: -10px;
		padding: 0 10px 0 6px;
		background: var(--row);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>
