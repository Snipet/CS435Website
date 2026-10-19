<!--
	The abstract syntax tree as an outline in the classes of the course's C- AST:
	one node per row, indented by depth, with the field of its parent that holds
	it, its class, its other fields and its source line (and, when `types` are
	given, the type of every expression). Nodes fold and unfold; a row selects
	its node.

	Keys, as in a tree view: Up and Down move, Right unfolds or moves to the
	first child, Left folds or moves to the parent, Home and End jump, Enter or
	Space selects.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Icon } from '$lib/components/ui';
	import type { CType, CourseNode, Program } from '$lib/theory/cminus';
	import MoreRows from './MoreRows.svelte';
	import { revealMarked } from './reveal';
	import { ancestorsOf, rangeOf, type SourceRange } from './selection';
	import { ROW_LIMIT, keepCollapsed, outlineRows, type OutlineRow } from './views';

	interface Props {
		program: Program;
		/**
		 * The tree in the course's classes (`courseTree`), with the fields later
		 * phases set; without it the tree of `program` alone, those fields not set.
		 */
		tree?: CourseNode | null;
		/** Expression node id → type; with it a type column is shown. */
		types?: ReadonlyMap<number, CType>;
		/** Ids of the nodes that belong to the selection. */
		marked: ReadonlySet<number>;
		/** Changes with the selection: the marked rows are unfolded and brought into view. */
		selKey?: string;
		/** Accessible name of the tree. */
		label: string;
		onselect: (range: SourceRange) => void;
	}

	let { program, tree = null, types, marked, selKey = '', label, onselect }: Props = $props();

	const uid = $props.id();

	let folded = $state.raw<ReadonlySet<number>>(new Set());
	let all = $state(false);
	let focusId = $state(0);
	let box: HTMLDivElement | undefined = $state();

	// Ids are preorder numbers: after an edit, a folded id is kept while it still names a node with children.
	const collapsed = $derived(keepCollapsed(folded, program));
	const rows = $derived(outlineRows(tree ?? program, collapsed, types));
	const shown = $derived(all ? rows : rows.slice(0, ROW_LIMIT));
	const tabStop = $derived(shown.some((r) => r.id === focusId) ? focusId : (shown[0]?.id ?? 0));
	const firstMarked = $derived.by(() => {
		let first: number | null = null;
		for (const id of marked) if (first === null || id < first) first = id;
		return first;
	});

	// A new selection unfolds the nodes above its first node, so it can be seen.
	$effect(() => {
		void selKey;
		const first = firstMarked;
		if (first === null) return;
		untrack(() => {
			const above = new Set(ancestorsOf(program, first));
			if ([...collapsed].some((id) => above.has(id))) {
				folded = new Set([...collapsed].filter((id) => !above.has(id)));
			}
		});
	});

	function toggle(row: OutlineRow) {
		if (!row.hasChildren) return;
		const others = [...collapsed].filter((id) => id !== row.id);
		folded = new Set(row.expanded ? [...others, row.id] : others);
	}

	function focusRow(id: number) {
		focusId = id;
		box?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
	}

	function onkeydown(event: KeyboardEvent, row: OutlineRow, i: number) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		let target: OutlineRow | undefined;
		switch (event.key) {
			case 'ArrowDown':
				target = shown[i + 1];
				break;
			case 'ArrowUp':
				target = shown[i - 1];
				break;
			case 'Home':
				target = shown[0];
				break;
			case 'End':
				target = shown[shown.length - 1];
				break;
			case 'ArrowRight':
				if (row.hasChildren && !row.expanded) toggle(row);
				else if (row.hasChildren) target = shown[i + 1];
				break;
			case 'ArrowLeft':
				if (row.expanded) toggle(row);
				else {
					// The parent: the nearest row above that is one level up.
					for (let k = i - 1; k >= 0; k--) {
						if (shown[k].depth < row.depth) {
							target = shown[k];
							break;
						}
					}
				}
				break;
			case 'Enter':
			case ' ':
				onselect(rangeOf(row.span));
				break;
			default:
				return;
		}
		event.preventDefault();
		if (target) focusRow(target.id);
	}
</script>

<div class="outline">
	<div class={['cols', { typed: !!types }]} aria-hidden="true">
		<span>Node</span>
		{#if types}<span class="type">Type</span>{/if}
		<span class="line">Line</span>
	</div>
	<div
		class={['cm-box', 'rows', { typed: !!types }]}
		role="tree"
		aria-label={label}
		aria-multiselectable="true"
		bind:this={box}
		{@attach revealMarked(selKey)}
	>
		{#each shown as row, i (row.id)}
			{@const on = marked.has(row.id)}
			<div
				class={['item', { 'cm-marked': on }]}
				role="treeitem"
				id="{uid}-{row.id}"
				data-id={row.id}
				aria-level={row.depth + 1}
				aria-expanded={row.hasChildren ? row.expanded : undefined}
				aria-selected={on}
				aria-label="{row.label}{row.type ? `, type ${row.type}` : ''}, line {row.line}"
				tabindex={row.id === tabStop ? 0 : -1}
				style="--depth: {row.depth}"
				onclick={() => {
					focusId = row.id;
					onselect(rangeOf(row.span));
				}}
				onkeydown={(event) => onkeydown(event, row, i)}
				onfocus={() => (focusId = row.id)}
			>
				<span class="node">
					{#if row.hasChildren}
						<!-- The keyboard folds with the Left and Right arrow keys on the row. -->
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<span
							class="twist"
							title={row.expanded ? 'Fold' : 'Unfold'}
							onclick={(event) => {
								event.stopPropagation();
								toggle(row);
							}}><Icon name={row.expanded ? 'chevron-down' : 'chevron-right'} size={13} /></span
						>
					{:else}
						<span class="twist leaf" aria-hidden="true"></span>
					{/if}
					{#if row.field}<span class="field">{row.field}:</span>{/if}<span class="kind"
						>{row.node}</span
					>{#each row.attrs as attr (attr.name)}<span class="attr" title={attr.note}
							><span class="attr-name">{attr.name}</span>
							<span class={['attr-value', attr.tone]}>{attr.text}</span></span
						>{/each}
				</span>
				{#if types}
					<span class="tail"
						><span class="type">{row.type ?? ''}</span><span class="line">{row.line}</span></span
					>
				{:else}
					<span class="line">{row.line}</span>
				{/if}
			</div>
		{/each}
	</div>
	<MoreRows shown={shown.length} total={rows.length} noun="rows" onshowall={() => (all = true)} />
</div>

<style>
	.outline {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	/* One grid for the box: every row shares its columns, and a deep tree scrolls sideways. */
	.cols,
	.rows {
		display: grid;
		grid-template-columns: minmax(max-content, 1fr) 3rem;
		column-gap: var(--space-3);
		align-items: baseline;
	}
	.rows.typed {
		grid-template-columns: minmax(max-content, 1fr) minmax(5rem, auto) 3rem;
	}
	.cols {
		grid-template-columns: minmax(0, 1fr) 3rem;
		padding: 0 12px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.02em;
	}
	.cols.typed {
		grid-template-columns: minmax(0, 1fr) minmax(5rem, auto) 3rem;
	}
	.rows {
		align-content: start;
		padding: 4px 0;
	}
	.item {
		--row: var(--surface);
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: baseline;
		padding: 1px 12px;
		background: var(--row);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.55;
		cursor: pointer;
	}
	.item:hover {
		--row: var(--surface-2);
	}
	.item:global(.cm-marked) {
		--row: var(--active-soft);
		background: var(--row);
		box-shadow: inset 3px 0 0 var(--active);
	}
	.item:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
		border-radius: var(--radius-sm);
	}
	.node {
		display: flex;
		align-items: baseline;
		padding-left: calc(var(--depth) * 0.8rem);
		white-space: nowrap;
	}
	.twist {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		align-self: center;
		width: 18px;
		height: 18px;
		margin-right: 2px;
		border-radius: var(--radius-sm);
		color: var(--text-3);
	}
	.twist:not(.leaf):hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.field {
		margin-right: 0.5em;
		color: var(--text-3);
	}
	.kind {
		font-weight: 600;
	}
	.attr {
		margin-left: 0.9em;
	}
	.attr-name {
		color: var(--text-3);
	}
	.attr-value.enum {
		color: var(--syn-keyword);
	}
	.attr-value.name {
		color: var(--syn-name);
	}
	.attr-value.number {
		color: var(--syn-number);
	}
	.attr-value.none {
		color: var(--text-2);
	}
	.attr-value.unset {
		color: var(--text-3);
		font-style: italic;
	}
	.type {
		color: var(--info);
		white-space: nowrap;
	}
	/* The line (and the type) stay at the right edge while a wide row scrolls sideways under them. */
	.line,
	.tail {
		position: sticky;
		right: 0;
		margin-right: -12px;
		padding: 0 12px 0 8px;
		background: var(--row);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.tail {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: span 2;
		align-items: baseline;
		text-align: left;
	}
	.tail .line,
	.cols .line {
		position: static;
		margin: 0;
		padding: 0;
		background: none;
	}
	.cols .type,
	.cols .line {
		color: inherit;
	}
</style>
