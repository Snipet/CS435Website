<!--
@component
One round of partition refinement as a table. Round 0 lists the block each
state starts in. Later rounds list, for every state, the block of the previous
partition that T(s, a) lies in for each symbol class, grouped by the previous
blocks; a block whose rows differ splits.
-->
<script lang="ts">
	import type { CharSet } from '$lib/theory/charset';
	import type { StateId } from '$lib/theory/automata';
	import BlockChip from './BlockChip.svelte';
	import {
		blockColor,
		blockTone,
		setText,
		type RefinementView,
		type RoundView
	} from './refinement';

	interface Props {
		view: RefinementView;
		round: RoundView;
		name: (s: StateId) => string;
		classText: (c: CharSet) => string;
	}

	let { view, round, name, classText }: Props = $props();

	const width = $derived(view.classes.length + 2);
	const prevLabel = $derived(`P${round.index - 1}`);
</script>

<div class="table-scroll">
	{#if round.index === 0}
		<table class="sig">
			<caption class="visually-hidden">Round 0: the block each state starts in</caption>
			<thead>
				<tr>
					<th scope="col">State</th>
					<th scope="col">Accepting</th>
					{#if view.hasTokens}<th scope="col">Token</th>{/if}
					<th scope="col" class="next">Block</th>
				</tr>
			</thead>
			<tbody>
				{#each round.initial as row (row.state)}
					<tr class:trap={view.input.states[row.state].trap}>
						<th scope="row" class="state">{name(row.state)}</th>
						<td class="plain">{row.accepting ? 'yes' : 'no'}</td>
						{#if view.hasTokens}<td class="plain token">{row.token ?? '—'}</td>{/if}
						<td class="next"><BlockChip id={row.block} tone={blockTone(row.block)} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<table class="sig">
			<caption class="visually-hidden">
				Round {round.index}: for each state and symbol, the block of {prevLabel} that the next state lies
				in, grouped by the blocks of {prevLabel}
			</caption>
			<thead>
				<tr>
					<th scope="col">State</th>
					{#each view.classes as c, k (k)}
						<th scope="col" class="sym">{classText(c)}</th>
					{/each}
					<th scope="col" class="next">New block</th>
				</tr>
			</thead>
			{#each round.groups as g (g.block.id)}
				{@const splits = g.into.length > 1}
				<tbody class:splits>
					<tr class="group">
						<th colspan={width} scope="rowgroup">
							<span class="group-head">
								<BlockChip id={g.block.id} tone={g.block.tone} />
								<span class="group-set">{setText(g.block.states.map(name))}</span>
								{#if splits}
									<span class="verdict split">
										splits into
										{#each g.into as id, i (id)}{#if i > 0}<span class="sep"
													>{i === g.into.length - 1 ? ' and ' : ', '}</span
												>{/if}<BlockChip {id} tone={blockTone(id)} />{/each}
									</span>
								{:else}
									<span class="verdict">stays together</span>
								{/if}
							</span>
						</th>
					</tr>
					{#each g.rows as row, i (row.state)}
						<tr
							class:moved={row.next !== g.block.id}
							class:part-start={i > 0 && row.next !== g.rows[i - 1].next}
							class:trap={view.input.states[row.state].trap}
							style="--g: {blockColor(blockTone(row.next))}"
						>
							<th scope="row" class="state">{name(row.state)}</th>
							{#each row.cells as cell, k (k)}
								<td class:differ={g.differing[k]}>
									<span class="cell">
										<BlockChip
											id={cell.block}
											tone={blockTone(cell.block)}
											strong={g.differing[k]}
										/>
										<span class="to"><span class="visually-hidden">via </span>{name(cell.to)}</span>
									</span>
								</td>
							{/each}
							<td class="next"><BlockChip id={row.next} tone={blockTone(row.next)} /></td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	{/if}
</div>

<style>
	.table-scroll {
		/* Contains the visually hidden text in cells, so it scrolls with the table. */
		position: relative;
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.sig {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	th,
	td {
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}
	thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	thead th.sym {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text);
	}
	th.next,
	td.next {
		width: 1%;
		text-align: center;
	}
	tbody:last-child tr:last-child > * {
		border-bottom: 0;
	}
	.state {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-weight: 500;
	}
	.plain {
		color: var(--text-2);
	}
	.token {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.trap .state {
		color: var(--dead);
	}

	/* Group header rows. */
	tr.group th {
		padding-top: 10px;
		padding-bottom: 6px;
		background: var(--surface-2);
		font-weight: 400;
	}
	.group-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}
	.group-set {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		white-space: normal;
		overflow-wrap: break-word;
	}
	.verdict {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.verdict.split {
		color: var(--text);
		font-weight: 500;
	}
	.sep {
		color: var(--text-3);
		font-weight: 400;
		white-space: pre;
	}

	/* Rows that leave their block, and the start of each part. */
	tr.moved > th.state {
		box-shadow: inset 3px 0 0 var(--g);
	}
	tr.part-start > * {
		border-top: 1px dashed var(--border-strong);
	}

	.cell {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.to {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
	}
	tbody.splits td.differ {
		background: color-mix(in srgb, var(--active) 7%, transparent);
	}
	@media (max-width: 480px) {
		th,
		td {
			padding: 6px 8px;
		}
	}
</style>
