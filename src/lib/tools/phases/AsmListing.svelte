<!--
	Assembly code: labels flush left, instructions as opcode and operands in
	two aligned columns (`MOVF  #2.3,r1`). Instructions a rewrite produced are
	highlighted; `marks` adds a footnote sign after a line.
-->
<script lang="ts">
	import type { Instr } from './vax';

	interface Props {
		code: readonly Instr[];
		/** Per instruction: produced by a rewrite. */
		rewritten?: readonly boolean[];
		/** Footnote signs by instruction index. */
		marks?: ReadonlyMap<number, string>;
		label: string;
	}

	let { code, rewritten = [], marks, label }: Props = $props();
</script>

{#if code.length === 0}
	<p class="empty">No instructions.</p>
{:else}
	<div class="scroll">
		<ol class="asm" aria-label={label}>
			{#each code as instr, i (i)}
				{@const mark = marks?.get(i)}
				{#if instr.kind === 'label'}
					<li class="label">{instr.label}:</li>
				{:else}
					<li class={{ rewritten: rewritten[i] }}>
						<span class="opc">{`${instr.op} `}</span><span class="args">{instr.args.join(',')}</span
						>{#if mark}<sup class="mark">{mark}</sup>{/if}
					</li>
				{/if}
			{/each}
		</ol>
	</div>
{/if}

<style>
	.scroll {
		max-width: 100%;
		overflow-x: auto;
	}
	.asm {
		display: grid;
		grid-template-columns: max-content;
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	li {
		display: flex;
		align-items: baseline;
		padding: 0 6px 0 1.25rem;
		border-radius: var(--radius-sm);
		white-space: pre;
	}
	.label {
		padding-left: 0;
		color: var(--text-2);
		font-weight: 600;
	}
	.opc {
		display: inline-block;
		min-width: 6.5ch;
		font-weight: 600;
	}
	.rewritten {
		background: var(--accent-soft);
	}
	.rewritten .opc,
	.rewritten .args {
		color: var(--accent);
	}
	.mark {
		margin-left: 2px;
		color: var(--accent);
		font-family: var(--font-sans);
		font-weight: 600;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
