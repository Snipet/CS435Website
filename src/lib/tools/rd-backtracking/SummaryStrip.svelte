<!--
	Both parsers on the current token string, side by side: accepted or
	rejected, productions tried, backtracks.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui';
	import type { Tone } from '$lib/components/ui/types';
	import type { SummaryRow, Verdict } from './session';

	interface Props {
		rows: readonly SummaryRow[];
		/** Whether the token string is a sentence of the grammar, as a sentence. */
		language?: string | null;
		/** The bool functions reject a sentence of the grammar (slide 33). */
		limitation?: boolean;
	}

	let { rows, language = null, limitation = false }: Props = $props();

	const NAME = { backtracking: 'With backtracking', functions: 'bool functions' } as const;
	const VERDICT: Record<Verdict, { text: string; tone: Tone | 'neutral' }> = {
		accept: { text: 'accept', tone: 'accept' },
		reject: { text: 'reject', tone: 'reject' },
		stopped: { text: 'stopped', tone: 'active' },
		'not-run': { text: 'not run', tone: 'neutral' }
	};
	/** What counts as a backtrack for each parser. */
	const BACKTRACKS = {
		backtracking: 'Mismatches, and complete trees with tokens left over',
		functions: 'Times next = save was executed'
	} as const;

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<section class="parser-summary" aria-label="Both parsers on this token stream">
	<ul class="parsers">
		{#each rows as row (row.parser)}
			{@const v = VERDICT[row.verdict]}
			<li>
				<div class="head">
					<span class={['name', { mono: row.parser === 'functions' }]}>{NAME[row.parser]}</span>
					<Badge tone={v.tone}>{v.text}</Badge>
					{#if row.note}<span class="note">{row.note}</span>{/if}
				</div>
				{#if row.tried !== null && row.backtracks !== null}
					<p class="counts">
						<span>{plural(row.tried, 'production tried', 'productions tried')}</span>
						<span class="dot" aria-hidden="true">·</span>
						<span title={BACKTRACKS[row.parser]}
							>{plural(row.backtracks, 'backtrack', 'backtracks')}</span
						>
					</p>
				{:else}
					<p class="counts">The grammar is left-recursive.</p>
				{/if}
			</li>
		{/each}
	</ul>
	{#if language}
		<p class="language">
			{language}
			{#if limitation}
				The bool functions reject it: cannot backtrack once a production is successful.
			{/if}
		</p>
	{/if}
</section>

<style>
	.parser-summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.parsers {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		list-style: none;
	}
	li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: var(--space-3) var(--space-4);
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	@media (min-width: 720px) {
		.parsers {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		li + li {
			border-top: 0;
			border-left: 1px solid var(--border);
		}
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--space-2);
	}
	.name {
		margin-right: var(--space-1);
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.3;
	}
	.name.mono {
		font-family: var(--font-mono);
		font-size: var(--text-base);
		font-variant-ligatures: none;
	}
	.note {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		color: var(--text-3);
	}
	.language {
		margin: 0;
		padding: 0 var(--space-1);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	@media (max-width: 480px) {
		li {
			padding: var(--space-3);
		}
	}
</style>
