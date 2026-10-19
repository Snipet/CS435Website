<!--
	The shift-reduce trace of Bottom-up Parsing II, slides 4–14, row by row:
	one configuration per row with the action taken on it, and beside it the
	parse forest growing over the tokens, the up-arrow under the divider.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { ParseTreeView } from '$lib/components/grammar';
	import { Button, StepControls, Toggle, type Stepper } from '$lib/components/ui';
	import type { ShiftReduceRow } from '$lib/theory/grammar';
	import Configuration from './Configuration.svelte';
	import type { ParseView } from './model';
	import { configuration, explain, forestBefore, stackStates } from './view';

	interface Props {
		result: ParseView;
		/** The rows listed: one per action, or with consecutive shifts collapsed. */
		rows: readonly ShiftReduceRow[];
		stepper: Stepper;
		collapse: boolean;
		stacks: boolean;
		/** Rows of the finished drawing (`minRows`). */
		treeRows: number;
		/** The tree is drawn for at most this many tokens. */
		maxTreeTokens: number;
		oncollapse: (collapse: boolean) => void;
		/** Where the DFA and the table are shown, with its title. */
		tableLink?: { href: string; title: string } | null;
	}

	let {
		result,
		rows,
		stepper,
		collapse,
		stacks = $bindable(),
		treeRows,
		maxTreeTokens,
		oncollapse,
		tableLink = null
	}: Props = $props();

	/** Rows drawn at a time; earlier ones come back with "Show earlier rows". */
	const ROW_LIMIT = 200;
	let limit = $state(ROW_LIMIT);

	const index = $derived(stepper.index);
	const first = $derived(Math.max(0, index + 1 - limit));
	const shown = $derived(rows.slice(first, index + 1));
	const current = $derived(rows[index]);
	const parse = $derived(result.parse);

	const view = (row: ShiftReduceRow) =>
		configuration(row, result.grammar, stacks ? stackStates(parse, row.rows[0]) : undefined);

	const tokens = $derived(parse.input.length - 1);
	const drawn = $derived(tokens <= maxTreeTokens);
	const forest = $derived(current && drawn ? forestBefore(parse, current.rows[0]) : null);

	// The box follows the current row, the last one shown.
	let box: HTMLDivElement | undefined = $state();
	$effect(() => {
		void index;
		void limit;
		const el = box;
		if (!el) return;
		void tick().then(() => {
			const row = el.querySelector<HTMLElement>('tr.current');
			if (!row) return;
			const r = row.getBoundingClientRect();
			const b = el.getBoundingClientRect();
			// The sticky header row covers the top of the box.
			const top = b.top + (el.querySelector('thead')?.getBoundingClientRect().height ?? 0);
			if (r.bottom > b.bottom) el.scrollTop += r.bottom - b.bottom;
			else if (r.top < top) el.scrollTop -= top - r.top;
		});
	});
</script>

<div class="trace-tab">
	<div class="options">
		<Toggle
			checked={collapse}
			label="Shifts on one row"
			description="consecutive shifts as “shift 3 times”, as on the slide"
			onchange={(on) => oncollapse(on)}
		/>
		<Toggle
			bind:checked={stacks}
			label="DFA states"
			description="the state under each stack symbol"
		/>
	</div>

	<StepControls {stepper} noun="Row" ariaLabel="Rows of the trace">
		{#snippet label(i: number)}
			{@const row = rows[i]}
			{#if row}
				<p class="why">{explain(result.grammar, row, result.decisions)}</p>
			{/if}
		{/snippet}
	</StepControls>

	<div class="workspace">
		<!-- A long trace scrolls in its box, which follows the current row. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="trace-box"
			bind:this={box}
			role="region"
			aria-label="Shift-reduce trace, scrolls"
			tabindex="0"
		>
			{#if first > 0}
				<div class="earlier">
					<span>{first} earlier {first === 1 ? 'row' : 'rows'} not shown.</span>
					<Button size="sm" variant="ghost" onclick={() => (limit += ROW_LIMIT)}
						>Show {Math.min(first, ROW_LIMIT)} more</Button
					>
				</div>
			{/if}
			<table class="trace">
				<caption class="visually-hidden"
					>Configurations of the parse, rows 1 to {index + 1} of {rows.length}</caption
				>
				<thead>
					<tr>
						<th scope="col">Configuration</th>
						<th scope="col">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as row, k (first + k)}
						{@const at = first + k}
						<tr
							class={{ current: at === index, stacks }}
							aria-current={at === index ? 'step' : undefined}
						>
							<td class="config"><Configuration view={view(row)} {stacks} /></td>
							<td class={['action', row.action]}>{row.text}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="tree-box">
			{#if forest}
				<ParseTreeView
					forest={forest.forest}
					marker={forest.marker}
					minRows={treeRows}
					labelSize={17}
					ariaLabel="Parse forest before row {index + 1}"
				/>
			{:else if !drawn}
				<p class="note">
					The forest is drawn for token strings of up to {maxTreeTokens} tokens; this one has
					{tokens}.
				</p>
			{/if}
		</div>
	</div>

	{#if stacks}
		<p class="note">
			The number under a symbol is the state the DFA is in after it, read from the stack of pairs
			&lt; sym, state &gt;; the stack starts as &lt; dummy, 0 &gt;.
			{#if tableLink}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
				The DFA and its table are in <a href={tableLink.href}>{tableLink.title}</a>.
			{/if}
		</p>
	{/if}
</div>

<style>
	.trace-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
	}
	.why {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.workspace {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		}
	}
	.trace-box {
		max-height: min(34rem, 70vh);
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		scrollbar-width: thin;
	}
	.trace-box:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.earlier {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.trace {
		width: 100%;
		border-collapse: collapse;
		font-size: 1rem;
	}
	th {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	td {
		padding: 5px var(--space-3);
		vertical-align: baseline;
		white-space: nowrap;
	}
	tr.stacks td {
		padding-top: 6px;
		padding-bottom: 6px;
	}
	tr + tr td {
		border-top: 1px solid var(--surface-3);
	}
	tr.current td {
		background: var(--active-soft);
	}
	tr.current td.config {
		box-shadow: inset 3px 0 0 var(--active);
	}
	.action {
		color: var(--tok-3);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.action.error,
	.action.limit {
		color: var(--reject);
	}
	.tree-box {
		min-width: 0;
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
