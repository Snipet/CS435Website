<script lang="ts">
	import { dMemRows, rangeText } from './listing';
	import { revealInBox } from './reveal';

	interface Props {
		dMem: Int32Array;
		/** The cell the current instruction uses (LD, ST), from decode on. */
		address: number | null;
		/** The cell ST wrote in the step that led here. */
		write: { addr: number; before: number; after: number } | null;
		flashKey: number;
	}

	let { dMem, address, write, flashKey }: Props = $props();

	const rows = $derived(dMemRows(dMem, [address, write?.addr ?? null]));

	let box: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!box || address === null) return;
		revealInBox(box, box.querySelector(`[data-addr="${address}"]`));
	});
</script>

<div class="dmem" bind:this={box}>
	<table>
		<caption class="visually-hidden">
			Data memory: cell 0, the top cell, every non-zero cell, and the cell the current instruction
			uses
		</caption>
		<thead>
			<tr>
				<th scope="col" class="c-addr">Addr</th>
				<th scope="col" class="c-val">Value</th>
				<th scope="col" class="c-note"><span class="visually-hidden">Note</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.kind === 'gap' ? `g${row.from}` : row.addr)}
				{#if row.kind === 'gap'}
					<tr class="gap">
						<td class="c-addr">{rangeText(row.from, row.to)}</td>
						<td class="c-val">0</td>
						<td class="c-note"></td>
					</tr>
				{:else}
					{@const isWrite = write?.addr === row.addr}
					<tr
						data-addr={row.addr}
						class={{ used: row.addr === address, written: isWrite }}
						aria-current={row.addr === address ? 'true' : undefined}
					>
						<td class="c-addr">{row.addr}</td>
						<td class="c-val">
							{#key isWrite ? flashKey : -1}
								<span class={{ flash: isWrite }}>{row.cell}</span>
							{/key}
						</td>
						<td class="c-note">
							{#if isWrite && write && write.before !== write.after}was {write.before}{:else if row.addr === 0 && row.cell === dMem.length - 1}the
								top address{:else if row.addr === dMem.length - 1}top cell{/if}
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.dmem {
		max-height: 15rem;
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
		padding: 6px 10px;
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
		padding: 4px 10px;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	.c-addr {
		width: 5.5rem;
		color: var(--text-3);
		text-align: right;
	}
	thead .c-addr,
	thead .c-val {
		text-align: right;
	}
	.c-val {
		width: 6rem;
		text-align: right;
	}
	.c-note {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
	.gap td {
		background: var(--surface-2);
		color: var(--text-3);
	}
	tr.used td {
		background: var(--info-soft);
	}
	tr.used td:first-child {
		box-shadow: inset 3px 0 0 var(--info);
	}
	tr.written td {
		background: var(--active-soft);
	}
	tr.written td:first-child {
		box-shadow: inset 3px 0 0 var(--active);
	}
	.flash {
		border-radius: var(--radius-sm);
		animation: flash 900ms var(--ease);
	}
	@keyframes flash {
		from {
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--active) 45%, transparent);
			background: color-mix(in srgb, var(--active) 45%, transparent);
		}
		to {
			box-shadow: 0 0 0 3px transparent;
			background: transparent;
		}
	}
</style>
