<!--
	The action/goto table (Bottom-up Parsing II, slide 19): a row per state,
	the terminal columns and $ (action), a vertical rule, the non-terminal
	columns (goto). Entries sN, gN, r with the production as a subscript, and
	accept; blank is an error. A cell with a conflict is marked and shows every
	action in it. The selected state's row, the cell of a selected edge and the
	cell the parser looks up are marked.
-->
<script lang="ts">
	import { symbolText } from '$lib/components/grammar';
	import type { LrTable } from '$lib/theory/grammar/lr-table';
	import type { StateRange } from './diagram';
	import {
		actionCell,
		actionCellName,
		conflictCells,
		gotoCellName,
		gotoEntry,
		type CellRef,
		type EntryView
	} from './table-view';

	interface Props {
		table: LrTable;
		range: StateRange;
		/** The selected state's row. */
		row?: number | null;
		/** The cell of the selected edge. */
		cell?: CellRef | null;
		/** The cell the parser looks up. */
		lookup?: CellRef | null;
		/** The state the parser is in. */
		current?: number | null;
		/** Select a state by its row. */
		onrow?: (state: number) => void;
		caption: string;
	}

	let {
		table,
		range,
		row = null,
		cell = null,
		lookup = null,
		current = null,
		onrow,
		caption
	}: Props = $props();

	const conflicts = $derived(conflictCells(table));
	const actionColumns = $derived(table.terminals.map((_, k) => k));
	const gotoColumns = $derived(table.nonterminals.map((_, k) => k));
	const rows = $derived.by(() => {
		const out: number[] = [];
		for (let s = range[0]; s <= range[1] && s < table.action.length; s++) out.push(s);
		return out;
	});
	const same = (a: CellRef | null, state: number, kind: CellRef['kind'], column: number) =>
		a !== null && a.state === state && a.kind === kind && a.column === column;
</script>

{#snippet entry(e: EntryView)}<span class="entry"
		>{e.code}{#if e.sub}<sub>{e.sub}</sub>{/if}</span
	>{/snippet}

<div class="wrap">
	<table class="lr">
		<caption class="visually-hidden">{caption}</caption>
		<thead>
			<tr class="parts" aria-hidden="true">
				<th class="state-col"></th>
				<th colspan={table.terminals.length}>action</th>
				{#if table.nonterminals.length > 0}
					<th colspan={table.nonterminals.length} class="rule">goto</th>
				{/if}
			</tr>
			<tr class="symbols">
				<th scope="col" class="state-col"><span class="visually-hidden">State</span></th>
				{#each table.terminals as t, k (k)}
					<th scope="col">{symbolText(t)}</th>
				{/each}
				{#each table.nonterminals as n, k (k)}
					<th scope="col" class={{ rule: k === 0 }}>{symbolText(n)}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as s (s)}
				<tr class={{ selected: row === s, current: current === s }}>
					<th scope="row" class="state-col">
						{#if onrow}
							<button
								type="button"
								class="row-button"
								aria-pressed={row === s}
								aria-label="State {s}{current === s ? ', the parser is here' : ''}"
								onclick={() => onrow?.(s)}>{s}</button
							>
						{:else}{s}{/if}
					</th>
					{#each actionColumns as k (k)}
						{@const c = actionCell(table, s, k, conflicts)}
						<td
							class={{
								conflict: c.conflicts.length > 0,
								picked: same(cell, s, 'action', k),
								lookup: same(lookup, s, 'action', k)
							}}
							aria-label={actionCellName(table, s, k, c)}
						>
							{#each c.entries as e, i (i)}{#if i > 0}<span class="or" aria-hidden="true">/</span
									>{/if}{@render entry(e)}{/each}
						</td>
					{/each}
					{#each gotoColumns as k (k)}
						{@const to = table.goto[s]?.[k] ?? null}
						<td
							class={{
								rule: k === 0,
								picked: same(cell, s, 'goto', k),
								lookup: same(lookup, s, 'goto', k)
							}}
							aria-label={gotoCellName(table, s, k)}
						>
							{#if to !== null}{@render entry(gotoEntry(to))}{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		max-width: 100%;
		max-height: min(70vh, 40rem);
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	table {
		min-width: 100%;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	th,
	td {
		padding: 4px 10px;
		text-align: left;
		white-space: nowrap;
	}
	thead th {
		background: var(--surface-2);
		font-weight: 600;
	}
	thead .symbols th {
		position: sticky;
		top: 0;
		z-index: 1;
		border-bottom: 1px solid var(--border-strong);
	}
	thead .parts th {
		padding-bottom: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 400;
		text-align: center;
	}
	.state-col {
		position: sticky;
		left: 0;
		z-index: 1;
		border-right: 1px solid var(--border-strong);
		background: var(--surface-2);
		text-align: right;
	}
	thead .state-col {
		z-index: 3;
	}
	tbody .state-col {
		background: var(--surface);
	}
	.rule {
		border-left: 2px solid var(--border-strong);
	}
	tbody tr + tr td,
	tbody tr + tr th {
		border-top: 1px solid var(--border);
	}
	tr.selected td,
	tr.selected th {
		background: var(--accent-soft);
	}
	tr.current .state-col {
		box-shadow: inset 3px 0 0 var(--active);
	}
	td.conflict {
		background: var(--reject-soft);
		box-shadow: inset 0 0 0 1.5px var(--reject);
	}
	td.picked {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	td.lookup {
		background: var(--active-soft);
		box-shadow: inset 0 0 0 2px var(--active);
		font-weight: 700;
	}
	sub {
		font-size: 0.72em;
		line-height: 0;
	}
	.or {
		margin: 0 4px;
		color: var(--reject);
	}
	.row-button {
		min-width: 2rem;
		padding: 0 4px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: right;
		cursor: pointer;
	}
	.row-button:hover {
		background: var(--surface-3);
	}
	.row-button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
</style>
