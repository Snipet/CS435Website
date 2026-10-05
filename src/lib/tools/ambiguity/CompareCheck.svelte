<!--
	"Same strings?": the bounded comparison of the original and the rewritten
	grammar (compare.ts), computed off the main thread by the page's WorkerTask.
-->
<script lang="ts">
	import { Badge, Callout, Updating, type TaskStatus } from '$lib/components/ui';
	import { MAX_LENGTH, MIN_LENGTH, type CompareResult } from './compare';

	interface Props {
		/** Longest sentence compared, in tokens. */
		maxLength: number;
		/** The newest finished comparison; null before the first. */
		result: CompareResult | null;
		/** `result` is for other grammars or another length than the ones shown now. */
		stale: boolean;
		status: TaskStatus;
		error?: string | null;
	}

	let { maxLength = $bindable(), result, stale, status, error = null }: Props = $props();

	const uid = $props.id();
	const tokens = (n: number) => `${n} ${n === 1 ? 'token' : 'tokens'}`;
	const strings = (n: number) => `${n} ${n === 1 ? 'string' : 'strings'}`;

	const done = $derived(result?.status === 'done' ? result : null);
	const same = $derived(
		done !== null && done.onlyOriginal.count === 0 && done.onlyRewritten.count === 0
	);
	const partial = $derived(done !== null && done.checkedUpTo < done.maxLength);
	const failed = $derived(status === 'timed-out' || status === 'error');
</script>

{#snippet side(title: string, only: { count: number; examples: string[] })}
	{#if only.count > 0}
		<div class="side">
			<p class="side-title">{title} <span class="count">({strings(only.count)})</span></p>
			<ul class="sentences">
				{#each only.examples as sentence, i (i)}
					<li>{sentence}</li>
				{/each}
				{#if only.count > only.examples.length}
					<li class="more">… and {only.count - only.examples.length} more</li>
				{/if}
			</ul>
		</div>
	{/if}
{/snippet}

<section class="compare" aria-labelledby="{uid}-title">
	<div class="head">
		<h3 id="{uid}-title">Same strings?</h3>
		{#if stale && !failed}<Updating />{/if}
	</div>
	<div class="length">
		<label for="{uid}-len">Strings of up to</label>
		<span class="slider">
			<input
				id="{uid}-len"
				type="range"
				min={MIN_LENGTH}
				max={MAX_LENGTH}
				step="1"
				bind:value={maxLength}
				aria-valuetext={tokens(maxLength)}
			/>
			<output for="{uid}-len" class="value">{tokens(maxLength)}</output>
		</span>
	</div>

	<div class="result" aria-live="polite" aria-busy={stale && !failed}>
		{#if status === 'timed-out'}
			<Callout tone="warn">
				<p>Listing the strings of this length takes too long. Choose a shorter length.</p>
			</Callout>
		{:else if status === 'error'}
			<Callout tone="error"><p>The comparison stopped: {error ?? 'unknown error'}</p></Callout>
		{:else if !result}
			<p class="note"><Updating label="Comparing…" standalone /></p>
		{:else if !done}
			<p class={['note', { 'stale-data': stale }]}>
				The two grammars are compared once both are free of errors.
			</p>
		{:else}
			<div class={['outcome', { 'stale-data': stale }]}>
				{#if done.checkedUpTo < 0}
					<p class="note">The grammars have too many strings to compare.</p>
				{:else if same}
					<p class="verdict">
						<Badge tone="accept">Same</Badge>
						Both grammars generate the same strings up to length {done.checkedUpTo}.
					</p>
				{:else}
					<p class="verdict">
						<Badge tone="reject">Different</Badge>
						The grammars do not generate the same strings.
					</p>
					{@render side('Only the original grammar generates', done.onlyOriginal)}
					{@render side('Only the rewritten grammar generates', done.onlyRewritten)}
				{/if}
				{#if partial && done.checkedUpTo >= 0}
					<p class="note">
						Compared up to length {done.checkedUpTo}: there are too many longer strings to list.
					</p>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 1.5rem;
	}
	h3 {
		margin: 0;
		font-size: 1.0625rem;
	}
	.length {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}
	.length label {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.slider {
		display: flex;
		flex: 1 1 11rem;
		align-items: center;
		gap: var(--space-3);
		max-width: 20rem;
	}
	input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.value {
		min-width: 5.2em;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.result {
		min-width: 0;
	}
	.outcome {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.side {
		min-width: 0;
	}
	.side-title {
		margin: 0 0 4px;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.count {
		color: var(--text-3);
		font-weight: 400;
	}
	.sentences {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sentences li {
		padding: 1px 7px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.sentences li.more {
		border-color: transparent;
		background: none;
		color: var(--text-3);
		font-family: var(--font-sans);
	}
</style>
