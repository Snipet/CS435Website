<!--
	The parsing DFA: the method it is built for (LR(1), as in the decks, or one
	of the methods they only name), the construction step by step, and the DFA
	drawn as item sets (Bottom-up Parsing III, slide 14) or as circles
	(Bottom-up Parsing II, slide 17). Large automata are drawn a window of
	states at a time.
-->
<script lang="ts">
	import { LrState, symbolText, type StateAnnotation } from '$lib/components/grammar';
	import {
		Button,
		CitationTag,
		NumberField,
		SegmentedControl,
		StepControls,
		type Stepper
	} from '$lib/components/ui';
	import { METHOD_NAMES, METHODS, type BuildResult, type Method } from './build';
	import CircleDiagram from './CircleDiagram.svelte';
	import { describeBuildStep, type BuildStep } from './construction';
	import { DRAW_ALL, WINDOW, type StateRange } from './diagram';
	import { itemLines, linesOf, type ItemForm } from './items';
	import ItemSetDiagram from './ItemSetDiagram.svelte';
	import type { DfaSelection } from './selection';
	import type { DfaView } from './state';
	import { actionEntry, edgeCell, gotoEntry } from './table-view';

	interface Props {
		build: BuildResult;
		notes: readonly StateAnnotation[][];
		method: Method;
		view: DfaView;
		items: ItemForm;
		/** The states drawn. */
		range: StateRange;
		/** The range was chosen (not the default). */
		ranged: boolean;
		onrange: (range: [number, number] | null) => void;
		steps: readonly BuildStep[];
		stepper: Stepper;
		selected: DfaSelection;
		onselect: (selection: DfaSelection) => void;
		current?: number | null;
		followed?: number | null;
		marks?: ReadonlyMap<number, readonly number[]>;
		onmethod?: () => void;
	}

	let {
		build,
		notes,
		method = $bindable(),
		view = $bindable(),
		items = $bindable(),
		range,
		ranged,
		onrange,
		steps,
		stepper,
		selected,
		onselect,
		current = null,
		followed = null,
		marks,
		onmethod
	}: Props = $props();

	const a = $derived(build.automaton);
	const total = $derived(a.states.length);
	const windowed = $derived(total > DRAW_ALL || ranged);

	const methodOptions = METHODS.map((m) => ({ value: m, label: METHOD_NAMES[m] }));
	const viewOptions = [
		{ value: 'boxes' as const, label: 'Item sets' },
		{ value: 'circles' as const, label: 'Circles' }
	];
	const formOptions = [
		{ value: 'abbreviated' as const, label: 'Abbreviated' },
		{ value: 'full' as const, label: 'Full' }
	];

	const step = $derived(steps[stepper.index] ?? null);
	const made = $derived(
		step ? { states: step.states, edges: step.edges } : { states: total, edges: a.edges.length }
	);
	const stepMarks = $derived(
		step && !stepper.atEnd
			? { from: step.from, edge: step.edge, made: step.isNew ? step.to : null }
			: null
	);
	const caption = $derived(step ? describeBuildStep(a, step) : '');

	const size = $derived(range[1] - range[0] + 1);
	function move(by: number) {
		const first = Math.max(0, Math.min(total - 1, range[0] + by));
		onrange([first, Math.min(total - 1, first + size - 1)]);
	}

	/**
	 * The circles show no items: the selected state's box is drawn under them, with the
	 * items that move over a selected edge's symbol marked.
	 */
	const selectedBox = $derived.by(() => {
		if (view !== 'circles' || !selected) return null;
		const edge = selected.kind === 'edge' ? a.edges[selected.edge] : null;
		const s = selected.kind === 'state' ? selected.state : edge?.from;
		if (s === undefined || !a.states[s]) return null;
		const lines = itemLines(a.augmented, a.states[s].items, items);
		const moved = edge
			? a.states[s].items.flatMap((item, k) =>
					a.augmented.productions[item.production].rhs[item.dot] === edge.symbol ? [k] : []
				)
			: [];
		return { state: s, lines, highlight: linesOf(lines, moved), notes: notes[s] ?? [] };
	});

	const selectionText = $derived.by(() => {
		if (!selected) return '';
		if (selected.kind === 'state') {
			const s = selected.state;
			return `State ${s}: its row in the table is marked.`;
		}
		const e = a.edges[selected.edge];
		if (!e) return '';
		const cell = edgeCell(build.table, e);
		const entry =
			cell?.kind === 'goto'
				? gotoEntry(e.to).code
				: cell
					? (() => {
							const action = build.table.action[e.from]?.[cell.column];
							return action ? actionEntry(build.table.augmented, action).code : 'blank';
						})()
					: '';
		const where =
			cell?.kind === 'goto'
				? `Goto[${e.from}, ${symbolText(e.symbol)}] = ${entry}`
				: `action[${e.from}, ${symbolText(e.symbol)}] = ${entry}`;
		return `Edge from ${e.from} to ${e.to} on ${symbolText(e.symbol)}: ${where}.`;
	});

	const merges = $derived(
		a.kind === 'lalr1'
			? a.states
					.filter((s) => (s.merged?.length ?? 0) > 1)
					.map((s) => ({ id: s.id, merged: s.merged! }))
			: []
	);
</script>

<div class="dfa">
	<div class="method">
		<SegmentedControl
			options={methodOptions}
			bind:value={method}
			label="Method"
			showLabel
			onchange={() => onmethod?.()}
		/>
		<table class="compare">
			<caption class="visually-hidden">States and conflicts of each method</caption>
			<thead>
				<tr>
					<th scope="col"><span class="visually-hidden">Method</span></th>
					{#each METHODS as m (m)}
						<th scope="col" class={{ on: m === method }}>{METHOD_NAMES[m]}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">States</th>
					{#each METHODS as m (m)}
						<td class={{ on: m === method }}
							>{build.summary[m].states}{build.summary[m].truncated ? '+' : ''}</td
						>
					{/each}
				</tr>
				<tr>
					<th scope="row">Conflicts</th>
					{#each METHODS as m (m)}
						<td class={{ on: m === method, bad: build.summary[m].conflicts > 0 }}
							>{build.summary[m].conflicts}</td
						>
					{/each}
				</tr>
			</tbody>
		</table>
	</div>
	{#if method !== 'lr1'}
		<p class="beyond">
			<span
				>{METHOD_NAMES[method]} is not built in the decks, which only name LALR(1), SLR and LR(0).
				{#if method === 'lalr1'}
					It merges the LR(1) states whose items differ only in their lookaheads, as bison does.
				{:else if method === 'slr1'}
					It uses the LR(0) automaton (items without lookaheads) and reduces with X → α on the
					tokens of Follow(X).
				{:else}
					It uses the LR(0) automaton (items without lookaheads) and reduces on every token.
				{/if}</span
			>
			<CitationTag cite={{ deck: '15', slide: 26 }} />
		</p>
	{/if}

	<div class="options">
		<SegmentedControl options={viewOptions} bind:value={view} label="Drawing" showLabel size="sm" />
		<SegmentedControl options={formOptions} bind:value={items} label="Items" showLabel size="sm" />
	</div>

	{#if windowed}
		<div class="range" role="group" aria-label="States shown">
			<NumberField
				label="States"
				inline
				size="sm"
				min={0}
				max={total - 1}
				value={range[0]}
				onchange={(v) => onrange([v, Math.max(v, range[1])])}
			/>
			<NumberField
				label="to"
				inline
				size="sm"
				min={0}
				max={total - 1}
				value={range[1]}
				onchange={(v) => onrange([Math.min(range[0], v), v])}
			/>
			<span class="of">of 0–{total - 1}</span>
			<Button size="sm" disabled={range[0] === 0} onclick={() => move(-size)}>Previous</Button>
			<Button size="sm" disabled={range[1] >= total - 1} onclick={() => move(size)}>Next</Button>
			{#if total <= DRAW_ALL}
				<Button size="sm" variant="ghost" onclick={() => onrange(null)}>All states</Button>
			{:else if size !== WINDOW}
				<Button
					size="sm"
					variant="ghost"
					onclick={() => onrange([range[0], Math.min(total - 1, range[0] + WINDOW - 1)])}
					>{WINDOW} at a time</Button
				>
			{/if}
		</div>
	{/if}

	{#if steps.length > 0}
		<StepControls {stepper} ariaLabel="Construction steps" noun="Step">
			{#snippet label()}
				<p class="caption">{caption}</p>
			{/snippet}
		</StepControls>
	{:else if merges.length > 0}
		<p class="caption">
			{#each merges as m, i (m.id)}{i > 0 ? '; ' : ''}state {m.id} merges LR(1) states {m.merged.join(
					', '
				)}{/each}.
		</p>
	{/if}

	{#if view === 'boxes'}
		<ItemSetDiagram
			automaton={a}
			{notes}
			form={items}
			{range}
			{made}
			{selected}
			{onselect}
			{current}
			{followed}
			step={stepMarks}
			{marks}
			ariaLabel="Parsing DFA, {METHOD_NAMES[method]}, as item sets"
		/>
	{:else}
		<CircleDiagram
			automaton={a}
			{notes}
			{range}
			{made}
			{selected}
			{onselect}
			{current}
			{followed}
			step={stepMarks}
			ariaLabel="Parsing DFA, {METHOD_NAMES[method]}"
		/>
	{/if}
	{#if selectedBox}
		<div class="selected-box">
			<LrState
				number={selectedBox.state}
				items={selectedBox.lines.map((l) => l.view)}
				merge={false}
				annotations={selectedBox.notes}
				highlight={selectedBox.highlight}
				highlightName="moved over the edge"
			/>
		</div>
	{/if}
	<p class="selection" aria-live="polite">
		{selectionText || 'Select a state or an edge label to mark its row or its entry in the table.'}
	</p>
</div>

<style>
	.dfa {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.method,
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
	}
	.compare {
		font-size: var(--text-sm);
	}
	.compare th,
	.compare td {
		padding: 2px 10px;
		text-align: right;
		white-space: nowrap;
	}
	.compare thead th {
		color: var(--text-2);
		font-weight: 600;
	}
	.compare tbody th {
		color: var(--text-3);
		font-weight: 400;
		text-align: left;
	}
	.compare td {
		font-variant-numeric: tabular-nums;
	}
	.compare .on {
		background: var(--accent-soft);
	}
	.compare td.bad {
		color: var(--reject);
		font-weight: 600;
	}
	.beyond {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--info);
		background: var(--info-soft);
		font-size: var(--text-sm);
	}
	.range {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.of {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.selected-box {
		max-width: 100%;
		overflow-x: auto;
	}
	.caption,
	.selection {
		margin: 0;
		font-size: var(--text-sm);
	}
	.selection {
		color: var(--text-2);
	}
</style>
