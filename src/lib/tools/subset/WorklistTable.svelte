<!--
@component
The subset-construction worklist: one row per DFA state (in the order it came
off the FIFO worklist), then for each symbol class the move set, its
ε-closure, and the DFA state it becomes. Only what the construction has
reached by `index` is shown; the current row and cell are highlighted.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui';
	import type { Automaton, StateId, SubsetResult } from '$lib/theory/automata';
	import { classText, setText, stepCell, worklist, type WorkRow } from './logic';

	interface Props {
		result: SubsetResult;
		nfa: Automaton;
		/** Current step. */
		index: number;
	}

	let { result, nfa, index }: Props = $props();

	const rows = $derived(worklist(result));
	const shown = $derived(rows.filter((r) => r.created <= index));
	const step = $derived(result.steps[index]);
	const at = $derived(step ? stepCell(result, step) : null);
	const stage = $derived(step?.kind);
	const dfa = $derived(result.dfa);

	/** Sets longer than this (characters) wrap after a comma; shorter ones stay on one line. */
	const WRAP = 22;
	/** Set text that breaks only after a comma, never next to a brace. */
	const set = (ids: readonly StateId[]) =>
		setText(nfa, ids).replace(/^\{ /, '{\u00a0').replace(/ \}$/, '\u00a0}');
	const long = (text: string) => text.length > WRAP;

	/**
	 * Column widths (px) for the finished table, so columns keep their width
	 * while rows and cells fill in step by step.
	 */
	const widths = $derived.by(() => {
		const px = (chars: number) => Math.ceil(Math.min(chars, WRAP) * 0.6 * 14 + 26);
		let name = 0;
		let members = 0;
		const cols = result.classes.map(() => ({ move: 0, closure: 0, target: 0 }));
		for (const r of rows) {
			const s = dfa.states[r.state];
			name = Math.max(name, s.name.length + 3);
			members = Math.max(members, set(s.subset ?? []).length);
			r.cells.forEach((c, k) => {
				const col = cols[k];
				if (c.move) col.move = Math.max(col.move, set(c.move.targets).length);
				if (c.closure) col.closure = Math.max(col.closure, set(c.closure.order).length);
				if (c.target) {
					const t = c.target.to === null ? 1 : dfa.states[c.target.to].name.length;
					col.target = Math.max(col.target, t + (c.target.isNew ? 6 : 0));
				}
			});
		}
		return {
			name: px(Math.max(name, 10)),
			members: px(Math.max(members, 11)),
			cols: cols.map((c) => ({
				move: px(Math.max(c.move, 5)),
				closure: px(Math.max(c.closure, 9)),
				target: px(Math.max(c.target, 6))
			}))
		};
	});
	const minWidth = $derived(
		widths.name +
			widths.members +
			widths.cols.reduce((t, c) => t + c.move + c.closure + c.target, 0)
	);

	let wrap: HTMLDivElement | undefined = $state();

	/** Keeps the current cell in view inside the table's own scroll area. */
	$effect(() => {
		void index;
		const box = wrap;
		if (!box) return;
		const cell = box.querySelector<HTMLElement>('.now');
		if (!cell) return;
		const b = box.getBoundingClientRect();
		const c = cell.getBoundingClientRect();
		const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
		const stick = box.querySelector<HTMLElement>('tbody th')?.offsetWidth ?? 0;
		if (c.top < b.top + head) box.scrollTop -= b.top + head - c.top + 4;
		else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom + 4;
		if (c.left < b.left + stick) box.scrollLeft -= b.left + stick - c.left + 4;
		else if (c.right > b.right) box.scrollLeft += c.right - b.right + 4;
	});

	const isNow = (row: WorkRow, column: number, kind: 'move' | 'closure' | 'target') =>
		at !== null && at.from === row.state && at.column === column && stage === kind;
</script>

<!-- The table scrolls inside this box, so the box takes focus for keyboard scrolling. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-wrap" bind:this={wrap} tabindex="0" role="region" aria-label="Worklist table">
	<table class="worklist" style="min-width: {minWidth}px">
		<caption class="visually-hidden">
			Worklist: each DFA state, its NFA states, and for each input symbol the move set, its
			ε-closure, and the target DFA state.
		</caption>
		<colgroup>
			<col style="width: {widths.name}px" />
			<col style="width: {widths.members}px" />
			{#each widths.cols as w, k (k)}
				<col style="width: {w.move}px" />
				<col style="width: {w.closure}px" />
				<col style="width: {w.target}px" />
			{/each}
		</colgroup>
		<thead>
			<tr class="top">
				<th scope="col" rowspan="2" class="corner">DFA state</th>
				<th scope="col" rowspan="2">NFA states</th>
				{#each result.classes as c, k (k)}
					<th scope="colgroup" colspan="3" class="group">
						on <span class="sym">{classText(c)}</span>
					</th>
				{/each}
			</tr>
			<tr class="sub">
				{#each result.classes, k (k)}
					<th scope="col" class="first">move</th>
					<th scope="col">ε-closure</th>
					<th scope="col">target</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each shown as row (row.state)}
				{@const s = dfa.states[row.state]}
				{@const startRow = stage === 'start' && row.state === 0}
				{@const members = set(s.subset ?? [])}
				<tr class:current={at?.from === row.state || startRow}>
					<th scope="row" class={['name', { now: startRow }]}>
						<span class="marks" aria-hidden="true"
							>{row.state === dfa.start ? '→' : ''}{s.accepting ? '◎' : ''}</span
						>
						<span class="f">{s.name}</span>
						{#if row.state === dfa.start}<span class="visually-hidden">(start)</span>{/if}
						{#if s.accepting}<span class="visually-hidden">(accepting)</span>{/if}
					</th>
					<td class={['set', 'f', { now: startRow, long: long(members) }]}>{members}</td>
					{#each row.cells as cell, k (k)}
						{@const move = cell.move && cell.move.step <= index ? set(cell.move.targets) : ''}
						{@const closure =
							cell.closure && cell.closure.step <= index ? set(cell.closure.order) : ''}
						{@const target = cell.target && cell.target.step <= index ? cell.target : null}
						<td class={['set', 'f', 'first', { now: isNow(row, k, 'move'), long: long(move) }]}
							>{move}</td
						>
						<td class={['set', 'f', { now: isNow(row, k, 'closure'), long: long(closure) }]}
							>{closure}</td
						>
						<td class={['target', { now: isNow(row, k, 'target') }]}>
							{#if target}
								{#if target.to === null}
									<span class="none" title="Empty set; the ∅ state is hidden">—</span>
									<span class="visually-hidden">no transition</span>
								{:else}
									<span class="f">{dfa.states[target.to].name}</span>
									{#if target.isNew}<Badge tone="accent" class="new">new</Badge>{/if}
								{/if}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-wrap {
		max-width: 100%;
		max-height: 32rem;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overscroll-behavior-x: contain;
	}
	.table-wrap:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.worklist {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	th,
	td {
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}
	thead th {
		position: sticky;
		z-index: 2;
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.top th {
		top: 0;
		height: 32px;
	}
	.sub th {
		top: 32px;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: none;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	thead th.corner {
		left: 0;
		z-index: 3;
	}
	.group {
		border-left: 1px solid var(--border);
		text-align: left;
	}
	.sym {
		margin-left: 2px;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text);
	}
	.first {
		border-left: 1px solid var(--border);
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	tbody th {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--surface);
		font-weight: 500;
		white-space: nowrap;
	}
	.marks {
		display: inline-block;
		min-width: 2.2ch;
		color: var(--text-3);
		font-family: var(--font-mono);
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.set {
		color: var(--text-2);
		white-space: nowrap;
	}
	.set.long {
		white-space: normal;
	}
	.target {
		white-space: nowrap;
	}
	.target :global(.new) {
		margin-left: 6px;
		height: 18px;
		padding: 0 6px;
	}
	.none {
		color: var(--text-3);
	}
	tr.current > * {
		background: var(--surface-2);
	}
	tr.current > th {
		box-shadow: inset 3px 0 0 var(--active);
	}
	.now,
	tr.current > .now {
		background: var(--active-soft);
		color: var(--text);
	}
	@media (max-width: 560px) {
		th,
		td {
			padding: 6px 9px;
		}
	}
</style>
