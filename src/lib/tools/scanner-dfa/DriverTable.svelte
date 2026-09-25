<!--
@component
The arrays of the table-driven scanner: T[state, char] (rows are states,
columns are symbol classes), then accept[state] (the token tokenFor returns,
or —) and retract[state] (✓ or —). Start row →, accepting rows ◎.
-->
<script lang="ts" module>
	export interface DriverTableHighlight {
		/** Current state's row. */
		row?: number;
		/** T[state, column] being read. */
		cell?: { state: number; column: number | null };
		/** accept[state] being tested. */
		accept?: number;
		/** retract[state] being tested. */
		retract?: number;
		/** Row of the state whose token is returned. */
		result?: number;
	}
</script>

<script lang="ts">
	import { toneStyle } from '$lib/components/ui/tones';
	import { ERROR_STATE, type DriverTable } from './table';

	interface Props {
		table: DriverTable;
		highlight?: DriverTableHighlight;
		caption?: string;
	}

	let {
		table,
		highlight = {},
		caption = 'Transition table T with accept and retract'
	}: Props = $props();

	const cellText = (s: number) => (s === ERROR_STATE ? '—' : table.names[s]);
	const acceptText = (s: number) => (table.accept[s] ? (table.token[s] ?? table.names[s]) : '—');
</script>

<div class="scroll">
	<table>
		<caption class="visually-hidden">{caption}</caption>
		<thead>
			<tr>
				<th scope="col" class="corner"><span class="visually-hidden">State</span></th>
				{#each table.columns as c, k (k)}
					<th scope="col" class={{ other: c.other }}>{c.header}</th>
				{/each}
				<th scope="col" class="arr first">accept</th>
				<th scope="col" class="arr">retract</th>
			</tr>
		</thead>
		<tbody>
			{#each table.dfa.states as s (s.id)}
				{@const current = highlight.row === s.id}
				<tr class={{ current, result: highlight.result === s.id, trap: s.trap }}>
					<th scope="row">
						<span class="marks" aria-hidden="true">
							<span class="mark">{s.id === table.dfa.start ? '→' : ''}</span>
							<span class="mark">
								{#if s.accepting}
									<svg viewBox="0 0 12 12"
										><circle cx="6" cy="6" r="5.1" /><circle cx="6" cy="6" r="2.9" /></svg
									>
								{/if}
							</span>
						</span>
						<span class="name">{table.names[s.id]}</span>
						{#if s.id === table.dfa.start}<span class="visually-hidden">, start</span>{/if}
						{#if s.accepting}<span class="visually-hidden">, accepting</span>{/if}
					</th>
					{#each table.T[s.id] as to, k (k)}
						<td
							class={{
								empty: to === ERROR_STATE,
								hit: highlight.cell?.state === s.id && highlight.cell.column === k
							}}>{cellText(to)}</td
						>
					{/each}
					<td
						class={['arr', 'first', 'tok', { hit: highlight.accept === s.id, empty: !s.accepting }]}
						style={s.accepting && table.rule[s.id] !== null
							? toneStyle(table.rule[s.id]!)
							: undefined}>{acceptText(s.id)}</td
					>
					<td class={['arr', { hit: highlight.retract === s.id, empty: !table.retract[s.id] }]}
						>{table.retract[s.id] ? '✓' : '—'}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		width: fit-content;
		max-width: 100%;
		max-height: var(--table-max-height, 30rem);
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		scrollbar-width: thin;
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1.35;
	}
	th,
	td {
		padding: 6px 14px;
		min-width: 3em;
		text-align: center;
		white-space: nowrap;
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		transition: background var(--duration) var(--ease);
	}
	th:last-child,
	td:last-child {
		border-right: 0;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-2);
		font-weight: 600;
		border-bottom: 1px solid var(--border-strong);
	}
	thead th.other {
		font-family: var(--font-sans);
		font-style: italic;
		font-weight: 500;
	}
	thead th.arr {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-2);
	}
	.first {
		border-left: 2px solid var(--border-strong);
	}
	tbody th {
		position: sticky;
		left: 0;
		z-index: 1;
		padding-left: 8px;
		background: var(--surface);
		font-weight: 600;
		text-align: left;
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
	td.tok:not(.empty) {
		color: var(--tone-fg, var(--text));
		font-family: var(--font-sans);
		font-weight: 600;
	}
	tr.trap > * {
		color: var(--dead);
	}
	tr.current > th,
	tr.current > td {
		background: var(--active-soft);
	}
	tr.result > th,
	tr.result > td.tok {
		background: var(--accept-soft);
	}
	td.hit {
		background: var(--active-soft);
		box-shadow: inset 0 0 0 2px var(--active);
		color: var(--text);
		font-weight: 700;
	}
</style>
