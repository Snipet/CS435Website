<!-- The diagnostics of one phase; each one selects the place in the source it is about. -->
<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import type { PhaseDiagnostic } from '$lib/theory/cminus';
	import { rangeOf, type SourceRange } from './selection';

	interface Props {
		diagnostics: readonly PhaseDiagnostic[];
		/** Accessible name of the list. */
		label: string;
		onselect: (range: SourceRange) => void;
		/** Messages listed at most. */
		max?: number;
	}

	let { diagnostics, label, onselect, max = 50 }: Props = $props();

	const shown = $derived(diagnostics.slice(0, max));
	const ICON = { error: 'error', warning: 'warning', info: 'info' } as const;
	const WORD = { error: 'Error', warning: 'Warning', info: 'Note' } as const;
</script>

<ul class="diags" aria-label={label}>
	{#each shown as d, i (i)}
		<li class={d.severity}>
			<Icon name={ICON[d.severity]} size={15} label={WORD[d.severity]} />
			<button type="button" onclick={() => onselect(rangeOf(d.span))}>
				<span class="msg">{d.message}</span>
				<span class="loc">line {d.span.line}, col {d.span.column}</span>
			</button>
		</li>
	{/each}
	{#if diagnostics.length > shown.length}
		<li class="more">
			{(diagnostics.length - shown.length).toLocaleString('en-US')} more not listed.
		</li>
	{/if}
</ul>

<style>
	.diags {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		list-style: none;
		font-size: var(--text-sm);
	}
	li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 2px 0;
		min-width: 0;
	}
	li :global(.icon) {
		margin-top: 3px;
	}
	.error :global(.icon) {
		color: var(--reject);
	}
	.warning :global(.icon) {
		color: var(--active);
	}
	.info :global(.icon) {
		color: var(--info);
	}
	button {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	button:hover .msg {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.msg {
		overflow-wrap: anywhere;
	}
	.loc {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.more {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
