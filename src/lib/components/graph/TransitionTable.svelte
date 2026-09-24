<!--
@component
Transition table (docs/ARCHITECTURE.md §3.7): rows are states, columns are
symbol classes in ascending order (plus ε when the machine has ε-moves), cells
are next states. DFA cells show a state name; NFA cells show sets such as
{A, B}. The start row is marked →, accepting rows ◎, trap rows are muted.

Default columns cover the declared alphabet and every label, one column per
symbol when there are at most 16 of them (as on the slides). A class reached
only through labels shown as `other` (a display override) is headed `other`
and comes last.
-->
<script lang="ts">
	import type { CharSet } from '$lib/theory/charset';
	import type { NamedSet } from '$lib/theory/chars';
	import type { Automaton, State, StateId } from '$lib/theory/automata/types';
	import { tableColumns } from './table';

	interface Props {
		automaton: Automaton;
		/**
		 * Column classes, used as given. Default: classes of Σ and all labels
		 * (see above).
		 */
		classes?: readonly CharSet[];
		names?: readonly NamedSet[];
		/**
		 * Row and/or cell to emphasize. Columns count from 0 as shown; the ε
		 * column, when shown, comes last.
		 */
		highlight?: { state?: StateId; cell?: { state: StateId; column: number } };
		/** `symbols` is the column's class, or null for the ε column. */
		onCellClick?: (state: StateId, column: number, symbols: CharSet | null) => void;
		compact?: boolean;
		/** Accessible caption (visually hidden). */
		caption?: string;
	}

	let {
		automaton,
		classes,
		names,
		highlight,
		onCellClick,
		compact = false,
		caption = 'Transition table'
	}: Props = $props();

	const columns = $derived(tableColumns(automaton, { classes, names }));
	const hasEpsilon = $derived(automaton.transitions.some((t) => t.label === null));
	const hasTokens = $derived(automaton.states.some((s) => s.accept));

	/** targets[state][column] in state order; the ε column comes last. */
	const targets = $derived.by(() => {
		const width = columns.length + (hasEpsilon ? 1 : 0);
		const out = automaton.states.map(() => Array.from({ length: width }, () => new Set<StateId>()));
		for (const t of automaton.transitions) {
			const row = out[t.from];
			if (!row || !automaton.states[t.to]) continue;
			if (t.label === null) {
				row[columns.length].add(t.to);
				continue;
			}
			columns.forEach((c, i) => {
				if (t.label!.overlaps(c.set)) row[i].add(t.to);
			});
		}
		return out.map((row) => row.map((s) => [...s].sort((a, b) => a - b)));
	});

	const deterministic = $derived(
		!hasEpsilon && targets.every((row) => row.every((c) => c.length <= 1))
	);

	const nameOf = (s: State | undefined) => (s ? s.name || `#${s.id}` : '?');

	function cellText(ids: readonly StateId[]): string {
		if (ids.length === 0) return '—';
		const list = ids.map((id) => nameOf(automaton.states[id]));
		return deterministic ? list[0] : `{${list.join(', ')}}`;
	}

	const isCell = (state: StateId, column: number) =>
		highlight?.cell?.state === state && highlight.cell.column === column;
</script>

<div class="table-scroll" class:compact>
	<table class="transition-table">
		<caption class="visually-hidden">{caption}</caption>
		<thead>
			<tr>
				<th scope="col" class="corner"><span class="visually-hidden">State</span></th>
				{#each columns as c, i (i)}
					<th scope="col">{c.header}</th>
				{/each}
				{#if hasEpsilon}
					<th scope="col" class="eps">ε</th>
				{/if}
				{#if hasTokens}
					<th scope="col" class="token-head">Token</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each automaton.states as s (s.id)}
				<tr class:trap={s.trap} class:current={highlight?.state === s.id}>
					<th scope="row">
						<span class="marks">
							<span
								class="mark start"
								aria-hidden="true"
								title={s.id === automaton.start ? 'start' : undefined}
								>{s.id === automaton.start ? '→' : ''}</span
							>
							<span class="mark accept" title={s.accepting ? 'accepting' : undefined}>
								{#if s.accepting}
									<svg viewBox="0 0 12 12" aria-hidden="true">
										<circle cx="6" cy="6" r="5.1" />
										<circle cx="6" cy="6" r="2.9" />
									</svg>
								{/if}
							</span>
						</span>
						<span class="name">{nameOf(s)}</span>
						{#if s.id === automaton.start}<span class="visually-hidden">, start</span>{/if}
						{#if s.accepting}<span class="visually-hidden">, accepting</span>{/if}
						{#if s.trap}<span class="visually-hidden">, trap</span>{/if}
					</th>
					{#each targets[s.id] as ids, col (col)}
						{@const text = cellText(ids)}
						<td
							class:empty={ids.length === 0}
							class:eps={hasEpsilon && col === columns.length}
							class:hit={isCell(s.id, col)}
						>
							{#if onCellClick}
								<button
									type="button"
									onclick={() => onCellClick(s.id, col, columns[col]?.set ?? null)}
									aria-label="{nameOf(s)} on {columns[col]?.header ?? 'ε'}: {ids.length === 0
										? 'none'
										: text}">{text}</button
								>
							{:else}
								{text}
							{/if}
						</td>
					{/each}
					{#if hasTokens}
						<td class="token">{s.accept?.token ?? ''}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-scroll {
		width: fit-content;
		max-width: 100%;
		max-height: var(--table-max-height, 28rem);
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	th,
	td {
		padding: 6px 16px;
		min-width: 3.2em;
		text-align: center;
		white-space: nowrap;
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
	}
	th:last-child,
	td:last-child {
		border-right: 0;
	}
	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
		border-bottom: 1px solid var(--border-strong);
	}
	thead th.eps {
		color: var(--epsilon);
	}
	tbody th {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--surface);
		font-weight: 600;
		text-align: left;
		padding-left: 8px;
		border-right: 1px solid var(--border-strong);
	}
	thead th.corner {
		left: 0;
		z-index: 3;
		border-right: 1px solid var(--border-strong);
	}
	.marks {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-right: 6px;
		vertical-align: middle;
	}
	.mark {
		display: inline-grid;
		place-items: center;
		width: 1.1em;
		height: 1.1em;
		color: var(--text-2);
	}
	.mark svg {
		width: 0.85em;
		height: 0.85em;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
	}
	.name {
		vertical-align: middle;
	}
	td {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	td.empty {
		color: var(--text-3);
	}
	td.eps {
		background: color-mix(in srgb, var(--epsilon-soft) 45%, transparent);
	}
	td.token,
	th.token-head {
		font-family: var(--font-sans);
		text-align: left;
		color: var(--text-2);
	}
	tr.trap th,
	tr.trap td {
		color: var(--dead);
	}
	tr.current th,
	tr.current td {
		background: var(--active-soft);
	}
	td.hit {
		background: var(--active-soft);
		box-shadow: inset 0 0 0 2px var(--active);
		font-weight: 700;
	}
	td button {
		all: unset;
		display: block;
		margin: -6px -16px;
		padding: 6px 16px;
		cursor: pointer;
		border-radius: 2px;
	}
	td button:hover {
		background: var(--surface-2);
	}
	td button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.compact table {
		font-size: var(--text-xs);
	}
	.compact th,
	.compact td {
		padding: 3px 9px;
	}
	.compact tbody th {
		padding-left: 6px;
	}
	.compact td button {
		margin: -3px -9px;
		padding: 3px 9px;
	}
</style>
