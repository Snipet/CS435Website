<script lang="ts">
	import { iMemRows, rangeText } from './listing';
	import { IADDR_SIZE, formatInstruction, opClass, type Instruction } from './machine';
	import type { Program } from './parse';
	import { revealInBox } from './reveal';
	import { scrollRegion } from './scroll-region';

	interface Props {
		program: Program;
		/** reg[7]: where the next fetch reads. */
		pc: number;
		/** The instruction of the current step, if any. */
		current: number | null;
		/** Phase of the current step shown (1 fetch, 2 decode, 3 execute). */
		phase: number;
		/** Jump target m to mark. */
		target: number | null;
	}

	let { program, pc, current, phase, target }: Props = $props();

	const pcInRange = $derived(pc >= 0 && pc < IADDR_SIZE);
	const rows = $derived(iMemRows(program, [pcInRange ? pc : null, current, target]));

	let box: HTMLDivElement | undefined = $state();

	$effect(() => {
		const focus = current ?? (pcInRange ? pc : null);
		const other = current !== null && pcInRange ? pc : null;
		if (!box || focus === null) return;
		revealInBox(
			box,
			box.querySelector(`[data-addr="${focus}"]`),
			other === null ? null : box.querySelector(`[data-addr="${other}"]`)
		);
	});

	function operands(i: Instruction): string {
		return formatInstruction(i).slice(i.op.length + 1);
	}

	const phaseWord = $derived(phase === 1 ? 'fetched' : phase === 2 ? 'decoded' : 'executed');
</script>

<div
	class="imem"
	bind:this={box}
	role="group"
	aria-label="Instruction memory"
	{@attach scrollRegion}
>
	<table>
		<caption class="visually-hidden">
			Instruction memory. The arrow marks the PC (reg[7]); the highlighted row is the instruction of
			the current step.
		</caption>
		<thead>
			<tr>
				<th scope="col" class="c-pc"><span class="visually-hidden">PC</span></th>
				<th scope="col" class="c-addr">Addr</th>
				<th scope="col">Instruction</th>
				<th scope="col" class="c-note"><span class="visually-hidden">Comment</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.kind === 'gap' ? `g${row.from}` : row.addr)}
				{#if row.kind === 'gap'}
					<tr class="gap">
						<td class="c-pc"></td>
						<td class="c-addr">{rangeText(row.from, row.to)}</td>
						<td class="c-instr" colspan="2">
							<span class="empty"
								>HALT 0,0,0 · {row.from === row.to ? 'empty cell' : 'empty cells'}</span
							>
						</td>
					</tr>
				{:else}
					{@const isPc = row.addr === pc}
					{@const isCurrent = row.addr === current}
					{@const isTarget = row.addr === target}
					<tr
						data-addr={row.addr}
						class={{ pc: isPc, current: isCurrent, target: isTarget, unloaded: !row.cell.loaded }}
						aria-current={isCurrent ? 'step' : undefined}
					>
						<td class="c-pc">
							{#if isPc}<span class="arrow" title="PC (reg[7]) = {pc}"
									><span aria-hidden="true">→</span><span class="visually-hidden">PC</span></span
								>{/if}
						</td>
						<td class="c-addr">{row.addr}</td>
						<td class="c-instr">
							<span class="op op-{opClass(row.cell.instr.op).toLowerCase()}"
								>{row.cell.instr.op}</span
							>&nbsp;<span class="args">{operands(row.cell.instr)}</span>
							{#if isCurrent}<span class="visually-hidden">({phaseWord})</span>{/if}
							{#if isTarget}<span class="tag" title="Jump target m">m</span>{/if}
						</td>
						<td class="c-note">{row.cell.loaded ? row.cell.comment : 'empty cell'}</td>
					</tr>
				{/if}
			{/each}
			{#if !pcInRange}
				<tr class="pc out">
					<td class="c-pc"
						><span class="arrow"
							><span aria-hidden="true">→</span><span class="visually-hidden">PC</span></span
						></td
					>
					<td class="c-addr">{pc}</td>
					<td class="c-instr" colspan="2"><span class="empty">outside iMem</span></td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.imem {
		max-height: 24rem;
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	table {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		font-variant-numeric: tabular-nums;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 6px 8px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-align: left;
		text-transform: uppercase;
	}
	td {
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
		vertical-align: baseline;
		white-space: nowrap;
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	.c-pc {
		width: 1.75rem;
		padding-right: 0;
		text-align: center;
	}
	.c-addr {
		width: 3.5rem;
		color: var(--text-3);
		text-align: right;
	}
	thead .c-addr {
		text-align: right;
	}
	.c-note {
		width: 100%;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		white-space: normal;
	}
	.op {
		font-weight: 600;
		color: var(--syn-keyword);
	}
	.args {
		color: var(--text);
	}
	.arrow {
		color: var(--accent);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
	}
	tr.pc .c-addr {
		color: var(--accent);
		font-weight: 600;
	}
	tr.current td {
		background: var(--active-soft);
	}
	tr.current td:first-child {
		box-shadow: inset 3px 0 0 var(--active);
	}
	tr.current .c-addr {
		color: var(--text);
		font-weight: 600;
	}
	tr.unloaded .op,
	tr.unloaded .args {
		color: var(--text-3);
	}
	.tag {
		display: inline-block;
		margin-left: 8px;
		padding: 0 6px;
		border: 1px dashed var(--info);
		border-radius: 999px;
		color: var(--info);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	tr.target:not(.current) td {
		background: var(--info-soft);
	}
	.gap td {
		background: var(--surface-2);
		color: var(--text-3);
	}
	.empty {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-style: italic;
	}
	.out td {
		background: var(--reject-soft);
	}
</style>
