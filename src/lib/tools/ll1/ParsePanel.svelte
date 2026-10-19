<!--
	The LL(1) parsing algorithm (Table-based Predictive Parsing, slide 11) on a
	token string, one row at a time: the Stack | Input | Action trace of slide
	12, the token stream with the matched prefix and the next token, the parse
	tree growing top-down with the current non-terminal marked (slides 14–17),
	and the table with the entry T[A, b] the row looks up.
-->
<script lang="ts">
	import { ParseTreeView, TokenStream } from '$lib/components/grammar';
	import { Callout, StepControls, type Stepper } from '$lib/components/ui';
	import type { LL1Parse, LL1Table, ParseNode } from '$lib/theory/grammar';
	import TableView from './TableView.svelte';
	import {
		pointerOf,
		rowMessage,
		streamHighlights,
		symbolsText,
		traceWindow,
		treeMarks
	} from './trace';

	interface Props {
		parse: LL1Parse;
		/** The tokens parsed, without the closing $. */
		tokens: readonly string[];
		/** The table the parse uses. */
		table: LL1Table;
		/** Display order of the table's rows and columns (indices). */
		order: { rows: readonly number[]; columns: readonly number[] };
		stepper: Stepper;
	}

	let { parse, tokens, table, order, stepper }: Props = $props();

	const g = $derived(table.grammar);
	const index = $derived(stepper.index);
	const row = $derived(parse.rows[index]);
	const shown = $derived(traceWindow(parse.rows.length, index));
	const last = $derived(parse.rows[parse.rows.length - 1]);

	function levels(root: ParseNode): number {
		let depth = 0;
		const open: [ParseNode, number][] = [[root, 1]];
		while (open.length > 0) {
			const [node, level] = open.pop()!;
			depth = Math.max(depth, level);
			for (const child of node.children) open.push([child, level + 1]);
		}
		return depth;
	}
	/** Room for the run's last tree, so the panels do not move while stepping. */
	const treeHeight = $derived(last ? Math.min(460, 40 + levels(last.tree) * 46) : 120);

	const mark = $derived.by(() => {
		const cell = row?.cell;
		if (!cell) return null;
		return {
			...cell,
			tone: row.action.kind === 'blank' ? ('reject' as const) : ('active' as const)
		};
	});

	const kindOf = (r: (typeof parse.rows)[number]) =>
		r.action.kind === 'expand'
			? 'rhs'
			: r.action.kind === 'blank' || r.action.kind === 'mismatch'
				? 'error'
				: r.action.kind;

	function show(i: number) {
		stepper.pause();
		stepper.set(i);
	}

	/**
	 * Scrolls the boxes between `el` and `outer` (not the page) so that `el` is
	 * in view; sideways too unless `vertical` only.
	 */
	function reveal(el: Element, outer: HTMLElement, vertical = false) {
		for (let box = el.parentElement; box; box = box.parentElement) {
			const scrolls = box.scrollHeight > box.clientHeight || box.scrollWidth > box.clientWidth;
			if (scrolls) {
				const r = el.getBoundingClientRect();
				const b = box.getBoundingClientRect();
				if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
				else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
				// A row wider than its box keeps its start in view: only the tree scrolls sideways.
				if (!vertical) {
					if (r.left < b.left) box.scrollLeft -= b.left - r.left + 24;
					else if (r.right > b.right) box.scrollLeft += r.right - b.right + 24;
				}
			}
			if (box === outer) break;
		}
	}

	let traceBox: HTMLDivElement | undefined = $state();
	let treeBox: HTMLDivElement | undefined = $state();
	// The current row of the trace and the current node of the tree stay in view.
	$effect(() => {
		void index;
		const trace = traceBox;
		const tree = treeBox;
		const row = trace?.querySelector('tr[aria-current="step"]');
		if (trace && row) reveal(row, trace, true);
		// The tree moves its nodes for a moment after a step.
		const timer = setTimeout(() => {
			const node = tree?.querySelector('text.current');
			if (tree && node) reveal(node, tree);
		}, 260);
		return () => clearTimeout(timer);
	});
</script>

<div class="parse">
	<StepControls {stepper} ariaLabel="Parse steps" noun="Row">
		{#snippet label(i: number)}
			{@const r = parse.rows[i]}
			{#if r}<span class="message">{rowMessage(g, r)}</span>{/if}
		{/snippet}
	</StepControls>

	{#if stepper.atEnd && last}
		{#if parse.outcome === 'accept'}
			<Callout tone="success" title="ACCEPT">
				<p>End of input, with the stack down to $: the token string is in L(G).</p>
			</Callout>
		{:else if parse.outcome === 'error'}
			<Callout tone="error" title="Error">
				<p class="mono">{last.text}</p>
			</Callout>
		{:else}
			<Callout tone="warn" title="The run stopped">
				<p>{rowMessage(g, last)}</p>
				{#if !table.ll1}
					<p>
						With a multiply-defined entry the parser takes the entry’s first production. A
						left-recursive one is taken again and again without a token being matched.
					</p>
				{/if}
			</Callout>
		{/if}
	{/if}

	<div class="grid">
		<div class="left">
			<TokenStream
				{tokens}
				pointer={row ? pointerOf(tokens.length, row) : null}
				highlights={row ? streamHighlights(tokens.length, row) : []}
				endMarker
				size="lg"
				ariaLabel="Input"
			/>
			<div class="trace" bind:this={traceBox}>
				{#if shown.start > 0}
					<p class="cut">Rows 1–{shown.start} are not shown.</p>
				{/if}
				<table aria-label="Trace: Stack, Input, Action">
					<thead>
						<tr>
							<th scope="col" class="num"><span class="visually-hidden">Row</span></th>
							<th scope="col">Stack</th>
							<th scope="col">Input</th>
							<th scope="col">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each parse.rows.slice(shown.start, shown.end) as r, k (shown.start + k)}
							{@const i = shown.start + k}
							<tr class={{ current: i === index }} aria-current={i === index ? 'step' : undefined}>
								<th scope="row" class="num">
									<button type="button" aria-label="Show row {i + 1}" onclick={() => show(i)}
										>{i + 1}</button
									>
								</th>
								<td class="mono stack">{symbolsText(r.stack)}</td>
								<td class="mono">{symbolsText(r.input)}</td>
								<td class={['mono', 'action', kindOf(r)]}>{r.text}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="right">
			<div class="tree" style:min-height="{treeHeight}px" bind:this={treeBox}>
				{#if row}
					<ParseTreeView
						tree={row.tree}
						highlight={treeMarks(parse, index)}
						labelSize={17}
						ariaLabel="Parse tree"
					/>
				{/if}
			</div>
			<ul class="legend" aria-label="Legend">
				<li><span class="swatch current" aria-hidden="true"></span>On top of the stack</li>
				<li><span class="swatch fresh" aria-hidden="true"></span>Just pushed</li>
				<li><span class="swatch matched" aria-hidden="true"></span>Matched</li>
			</ul>
			<div class="small-table">
				<p class="caption">
					{#if row?.cell}
						Entry used: <span class="mono"
							>T[{table.rows[row.cell.row]}, {table.columns[row.cell.column]}]</span
						>
					{:else}
						The table
					{/if}
				</p>
				<TableView
					{table}
					rows={order.rows}
					columns={order.columns}
					{mark}
					compact
					label="LL(1) parsing table, with the entry this row looks up marked"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.parse {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.message {
		font-size: var(--text-sm);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
		align-items: start;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	.left,
	.right {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.trace {
		max-height: 30rem;
		position: relative;
		overflow: auto;
		scrollbar-width: thin;
	}
	.cut {
		margin: 0 0 var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	thead th {
		padding: 4px 10px;
		border-bottom: 1px solid var(--text-2);
		text-align: left;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	td {
		padding: 3px 10px;
		white-space: nowrap;
	}
	.num {
		width: 2.5rem;
		padding: 0 4px;
		text-align: right;
		text-decoration: none;
	}
	.num button {
		min-width: 1.75rem;
		padding: 2px 4px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-3);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.num button:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	tr.current td,
	tr.current th {
		background: var(--active-soft);
	}
	.stack {
		color: var(--epsilon);
	}
	td.rhs {
		color: var(--epsilon);
	}
	td.error {
		color: var(--reject);
		font-weight: 600;
	}
	td.accept {
		font-weight: 600;
	}
	.tree {
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-height: 34rem;
		position: relative;
		overflow: auto;
		scrollbar-width: thin;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}
	.swatch.current {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	.swatch.fresh {
		background: var(--info-soft);
		box-shadow: inset 0 -2px 0 var(--info);
	}
	.swatch.matched {
		background: var(--accept-soft);
		box-shadow: inset 0 -2px 0 var(--accept);
	}
	.small-table {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.caption {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
</style>
