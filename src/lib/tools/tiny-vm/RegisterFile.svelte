<script lang="ts">
	import { NO_REGS, PC_REG, type RegWrite } from './machine';

	interface Props {
		reg: Int32Array;
		/** Registers the step that led here wrote. */
		written: readonly RegWrite[];
		/** Changes on every step, so a register written twice in a row flashes again. */
		flashKey: number;
		/** Registers the current instruction reads (r, s, t or s). */
		reads?: readonly number[];
	}

	let { reg, written, flashKey, reads = [] }: Props = $props();

	const byReg = $derived(new Map(written.map((w) => [w.reg, w])));
	const ids = Array.from({ length: NO_REGS }, (_, i) => i);
</script>

<dl class="regs">
	{#each ids as i (i)}
		{@const w = byReg.get(i)}
		<div class={['reg', { pc: i === PC_REG, written: !!w, read: !w && reads.includes(i) }]}>
			<dt>
				<span class="name">r{i}</span>
				{#if i === PC_REG}<span class="role" title="Program counter">PC</span>{/if}
			</dt>
			<dd>
				{#key w ? flashKey : -1}
					<span class={['value', { flash: !!w }]}>{reg[i]}</span>
				{/key}
				{#if w && w.before !== w.after}
					<span class="was">was {w.before}</span>
				{:else if w}
					<span class="was">written</span>
				{/if}
			</dd>
		</div>
	{/each}
</dl>

<style>
	.regs {
		container-type: inline-size;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
		margin: 0;
	}
	@container (max-width: 340px) {
		.regs {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.reg {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.reg.pc {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
	}
	.reg.read {
		border-color: color-mix(in srgb, var(--info) 55%, var(--border));
		background: var(--info-soft);
	}
	.reg.written {
		border-color: var(--active);
		background: var(--active-soft);
	}
	dt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
	}
	.role {
		padding: 0 5px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-family: var(--font-sans);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.5;
	}
	dd {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 6px;
		min-width: 0;
		margin: 0;
	}
	.value {
		overflow: hidden;
		max-width: 100%;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		font-variant-ligatures: none;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		line-height: 1.3;
		text-overflow: ellipsis;
	}
	.was {
		color: var(--text-3);
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.flash {
		animation: flash 900ms var(--ease);
		border-radius: var(--radius-sm);
	}
	@keyframes flash {
		from {
			background: color-mix(in srgb, var(--active) 45%, transparent);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--active) 45%, transparent);
		}
		to {
			background: transparent;
			box-shadow: 0 0 0 3px transparent;
		}
	}
</style>
