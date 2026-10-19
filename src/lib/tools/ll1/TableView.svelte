<!--
	An LL(1) parsing table as Table-based Predictive Parsing, slides 7–9 draw
	it: an empty corner, a row per non-terminal, a column per terminal and $,
	and in each cell only the right-hand side (ε for an ε-production); a blank
	cell is an error. A multiply-defined entry lists its right-hand sides and is
	marked. With `onselect` the entries are buttons (one tab stop, arrow keys
	move between them).
-->
<script lang="ts">
	import { printSymbols, type LL1Table } from '$lib/theory/grammar';
	import { entryName } from './model';

	interface Props {
		table: LL1Table;
		/** Row indices in display order (default: the table's order). */
		rows?: readonly number[];
		/** Column indices in display order. */
		columns?: readonly number[];
		/** The selected entry, by table indices. */
		selected?: { row: number; column: number } | null;
		/** An entry to mark, e.g. the one a parse step looks up. */
		mark?: { row: number; column: number; tone: 'active' | 'reject' } | null;
		onselect?: (row: number, column: number) => void;
		/** Smaller type, for a second copy of a table. */
		compact?: boolean;
		/** Accessible name of the table. */
		label: string;
	}

	let {
		table,
		rows,
		columns,
		selected = null,
		mark = null,
		onselect,
		compact = false,
		label
	}: Props = $props();

	const rowOrder = $derived(rows ?? table.rows.map((_, i) => i));
	const columnOrder = $derived(columns ?? table.columns.map((_, i) => i));

	const rhsOf = (id: number) => printSymbols(table.grammar.productions[id].rhs);

	function cellText(r: number, c: number): string {
		const ps = table.cells[r][c].productions;
		const name = entryName(table.rows[r], table.columns[c]);
		if (ps.length === 0) return `${name}: blank`;
		if (ps.length === 1) return `${name}: ${rhsOf(ps[0])}`;
		return `${name}: multiply defined: ${ps.map(rhsOf).join(' and ')}`;
	}

	/** The one tab stop, by display position. */
	let focus = $state<{ r: number; c: number } | null>(null);
	const tabStop = $derived.by(() => {
		if (focus && focus.r < rowOrder.length && focus.c < columnOrder.length) return focus;
		if (selected) {
			const r = rowOrder.indexOf(selected.row);
			const c = columnOrder.indexOf(selected.column);
			if (r >= 0 && c >= 0) return { r, c };
		}
		return { r: 0, c: 0 };
	});

	let grid: HTMLTableElement | undefined = $state();

	function move(event: KeyboardEvent, r: number, c: number) {
		let next: { r: number; c: number } | null = null;
		if (event.key === 'ArrowUp') next = { r: Math.max(0, r - 1), c };
		else if (event.key === 'ArrowDown') next = { r: Math.min(rowOrder.length - 1, r + 1), c };
		else if (event.key === 'ArrowLeft') next = { r, c: Math.max(0, c - 1) };
		else if (event.key === 'ArrowRight') next = { r, c: Math.min(columnOrder.length - 1, c + 1) };
		else if (event.key === 'Home') next = { r, c: 0 };
		else if (event.key === 'End') next = { r, c: columnOrder.length - 1 };
		if (!next) return;
		event.preventDefault();
		focus = next;
		grid?.querySelector<HTMLButtonElement>(`[data-cell="${next.r}-${next.c}"]`)?.focus();
	}
</script>

<div class={['scroll', { compact }]}>
	<table bind:this={grid} aria-label={label}>
		<thead>
			<tr>
				<th scope="col" class="corner"><span class="visually-hidden">Non-terminal</span></th>
				{#each columnOrder as c (c)}
					<th scope="col" class="mono">{printSymbols([table.columns[c]])}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rowOrder as r, ri (r)}
				<tr>
					<th scope="row" class="mono">{printSymbols([table.rows[r]])}</th>
					{#each columnOrder as c, ci (c)}
						{@const cell = table.cells[r][c]}
						{@const isSelected = selected?.row === r && selected?.column === c}
						{@const marked = mark?.row === r && mark?.column === c ? mark.tone : null}
						<td
							class={[
								{ conflict: cell.productions.length > 1, selected: isSelected },
								marked && `mark-${marked}`
							]}
						>
							{#if onselect}
								<button
									type="button"
									data-cell="{ri}-{ci}"
									tabindex={tabStop.r === ri && tabStop.c === ci ? 0 : -1}
									aria-pressed={isSelected}
									aria-label={cellText(r, c)}
									onclick={() => {
										focus = { r: ri, c: ci };
										onselect(r, c);
									}}
									onfocus={() => (focus = { r: ri, c: ci })}
									onkeydown={(e) => move(e, ri, ci)}
								>
									{#each cell.productions as p (p)}<span class="rhs mono">{rhsOf(p)}</span>{/each}
								</button>
							{:else}
								<span class="visually-hidden">{cellText(r, c)}</span>
								<span aria-hidden="true" class="content">
									{#each cell.productions as p (p)}<span class="rhs mono">{rhsOf(p)}</span>{/each}
								</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		max-width: 100%;
		position: relative;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	table {
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		border: 1px solid var(--border-strong);
		text-align: center;
	}
	th {
		padding: 4px 12px;
		background: var(--surface-2);
		font-weight: 600;
		white-space: nowrap;
	}
	thead th {
		min-width: 3.25rem;
	}
	tbody th {
		min-width: 2.5rem;
	}
	.corner {
		background: var(--surface);
	}
	td {
		height: 2.5rem;
		min-width: 4.5rem;
		padding: 0;
		background: var(--surface);
	}
	td button,
	td .content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: 100%;
		min-height: 2.5rem;
		padding: 4px 10px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	td .content {
		cursor: default;
	}
	td button:hover {
		background: var(--surface-2);
	}
	td button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -4px;
	}
	.rhs {
		color: var(--epsilon);
		white-space: nowrap;
	}
	td.conflict {
		background: var(--reject-soft);
		box-shadow: inset 0 0 0 2px var(--reject);
	}
	td.conflict .rhs {
		color: var(--reject);
		font-weight: 600;
	}
	/*
	 * Selected: a tint and a thick bar along the bottom. Focus is a ring
	 * (above), so a focused cell and the selected one never look alike.
	 */
	td.selected {
		box-shadow: inset 0 -5px 0 var(--accent);
		background: var(--accent-soft);
	}
	td.selected .rhs {
		color: var(--text);
		font-weight: 600;
	}
	td.conflict.selected .rhs {
		color: var(--reject);
	}
	td.conflict.selected {
		box-shadow:
			inset 0 0 0 2px var(--reject),
			inset 0 -7px 0 var(--accent);
	}
	td.mark-active {
		background: var(--active-soft);
		box-shadow: inset 0 0 0 2px var(--active);
	}
	td.mark-reject {
		background: var(--reject-soft);
		box-shadow: inset 0 0 0 2px var(--reject);
	}
	.compact table {
		font-size: var(--text-xs);
	}
	.compact td {
		height: 1.9rem;
		min-width: 3.25rem;
	}
	.compact td .content,
	.compact td button {
		min-height: 1.9rem;
		padding: 2px 6px;
	}
	.compact th {
		padding: 2px 8px;
	}
	.compact thead th {
		min-width: 2.5rem;
	}
</style>
