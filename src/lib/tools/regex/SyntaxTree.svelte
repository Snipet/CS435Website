<!--
	The syntax tree of R, top-down: one row per node with its sub-expression,
	clause name, and set-builder rule. Arrow keys move between rows (the
	selection follows focus); → and ← open and close nodes. The selected row
	also lists strings of its language.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Icon from '$lib/components/ui/Icon.svelte';
	import StringSetView from '$lib/components/ui/StringSetView.svelte';
	import { clauseName, type PrintOptions, type Regex } from '$lib/theory/regex';
	import { sampleOf, type Sigma } from './analysis';
	import type { Dialect } from './state';
	import { expandedByDefault, nodeText, pathKey, ruleFor, visibleRows, type TreeRow } from './tree';

	interface Props {
		root: Regex;
		/** Path of the selected node (a valid path into `root`). */
		selected: number[];
		onselect: (path: number[]) => void;
		print: PrintOptions;
		dialect: Dialect;
		/** A definition's text as written, for the rule of a definition use. */
		definition: (name: string) => string | undefined;
		sigma: Sigma | null;
	}

	let { root, selected, onselect, print, dialect, definition, sigma }: Props = $props();

	const uid = $props.id();
	const rowId = (key: string) => `${uid}-row${key ? `-${key}` : ''}`;

	/** Nodes the user opened or closed; others follow `expandedByDefault`. */
	const overrides = new SvelteMap<string, boolean>();
	const selectedKey = $derived(pathKey(selected));
	const isAncestor = (key: string, of: string) =>
		key === '' ? of !== '' : of.startsWith(`${key}.`);

	const tree = $derived(
		visibleRows(
			root,
			(key, node) => overrides.get(key) ?? (isAncestor(key, selectedKey) || expandedByDefault(node))
		)
	);
	const focusKey = $derived(
		tree.rows.some((r) => r.key === selectedKey) ? selectedKey : (tree.rows[0]?.key ?? '')
	);

	// A node selected from elsewhere (a derivation bracket) is shown even inside a closed node.
	$effect(() => {
		const key = selectedKey;
		untrack(() => {
			for (const [k, open] of overrides) if (!open && isAncestor(k, key)) overrides.delete(k);
		});
	});

	const text = (node: Regex) => nodeText(node, print);
	const rule = (node: Regex) => ruleFor(node, { dialect, text, definition });

	const selectedRow = $derived(tree.rows.find((r) => r.key === selectedKey) ?? null);
	const sample = $derived(selectedRow ? sampleOf(selectedRow.node, sigma) : null);

	function focusRow(key: string) {
		tick().then(() => document.getElementById(rowId(key))?.focus());
	}

	function go(row: TreeRow | undefined) {
		if (!row) return;
		onselect(row.path);
		focusRow(row.key);
	}

	function toggle(row: TreeRow, open: boolean) {
		overrides.set(row.key, open);
		// Closing a node around the selection moves the selection to it.
		if (!open && isAncestor(row.key, selectedKey)) go(row);
	}

	function onkeydown(event: KeyboardEvent, row: TreeRow, index: number) {
		const rows = tree.rows;
		switch (event.key) {
			case 'ArrowDown':
				go(rows[index + 1]);
				break;
			case 'ArrowUp':
				go(rows[index - 1]);
				break;
			case 'Home':
				go(rows[0]);
				break;
			case 'End':
				go(rows[rows.length - 1]);
				break;
			case 'ArrowRight':
				if (row.hasChildren && !row.expanded) toggle(row, true);
				else if (row.expanded) go(rows[index + 1]);
				break;
			case 'ArrowLeft':
				if (row.expanded) toggle(row, false);
				else if (row.parent !== null) go(rows.find((r) => r.key === row.parent));
				break;
			case 'Enter':
			case ' ':
				if (row.hasChildren) toggle(row, !row.expanded);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	/** Sub-expression short enough to write as L(…) before its strings. */
	const setPrefix = (node: Regex) => {
		const t = text(node);
		return t.length <= 24 ? `L(${t}) =` : 'L =';
	};
</script>

<div class="tree" role="tree" aria-label="Syntax tree of R">
	{#each tree.rows as row, i (row.key)}
		{@const isSelected = row.key === selectedKey}
		{@const expr = text(row.node)}
		{@const clause = clauseName(row.node)}
		<div
			id={rowId(row.key)}
			class={['row', { selected: isSelected }]}
			style="--depth: {Math.min(row.depth, 14)}"
			role="treeitem"
			aria-level={row.depth + 1}
			aria-selected={isSelected}
			aria-expanded={row.hasChildren ? row.expanded : undefined}
			aria-label="{expr}, {clause}"
			tabindex={row.key === focusKey ? 0 : -1}
			onclick={() => onselect(row.path)}
			onkeydown={(e) => onkeydown(e, row, i)}
		>
			<!-- Mouse shortcut; the keyboard opens and closes rows with → and ←. -->
			<span
				class={['twisty', { leaf: !row.hasChildren }]}
				aria-hidden="true"
				onclick={(e) => {
					if (!row.hasChildren) return;
					e.stopPropagation();
					toggle(row, !row.expanded);
				}}
			>
				{#if row.hasChildren}
					<Icon name={row.expanded ? 'chevron-down' : 'chevron-right'} size={14} />
				{/if}
			</span>
			<span class="content">
				<span class="head">
					<code class="expr">{expr}</code>
					<span class="clause">{clause}</span>
				</span>
				<span class="rule">{rule(row.node)}</span>
				{#if isSelected && sample}
					<span class="detail">
						{#if sample.ok}
							<StringSetView
								prefix={setPrefix(row.node)}
								strings={sample.strings}
								more={sample.truncated}
							/>
						{:else if sample.reason === 'sigma'}
							<span class="note">Σ is needed to list these strings.</span>
						{:else}
							<span class="note">This node's automaton is too large to list its strings.</span>
						{/if}
						{#if row.node.span?.source}
							<span class="note">Written in the definition of {row.node.span.source}.</span>
						{/if}
					</span>
				{/if}
			</span>
		</div>
	{/each}
	{#if tree.truncated}
		<p class="note more">The tree is cut off after {tree.rows.length} rows.</p>
	{/if}
</div>

<style>
	.tree {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.row {
		--step: 18px;
		display: flex;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
		padding: 6px 10px 7px calc(var(--depth) * var(--step) + 4px);
		border-radius: var(--radius);
		/* One guide line per level, like a file tree. */
		background-image: repeating-linear-gradient(
			to right,
			transparent 0 12px,
			var(--border) 12px 13px,
			transparent 13px var(--step)
		);
		background-size: calc(var(--depth) * var(--step)) 100%;
		background-repeat: no-repeat;
		cursor: pointer;
	}
	.row:hover {
		background-color: var(--surface-2);
	}
	.row.selected {
		background-color: var(--accent-soft);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.row:focus-visible {
		outline-offset: -2px;
	}
	.twisty {
		display: grid;
		flex: none;
		place-items: center;
		width: 20px;
		height: 22px;
		border-radius: var(--radius-sm);
		color: var(--text-3);
	}
	.twisty:not(.leaf):hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
		min-width: 0;
	}
	.expr {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font-size: 0.9375rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.clause {
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.02em;
	}
	.rule {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-variant-ligatures: none;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.selected .rule {
		color: var(--text-2);
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
		cursor: auto;
	}
	.note {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.more {
		margin: var(--space-2) 0 0;
	}
</style>
