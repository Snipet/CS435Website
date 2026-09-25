<!--
@component
Batch run: one input string per line (`""` is the empty string), each
accepted or rejected, with where the run ended.
-->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import CodeEditor from '$lib/components/ui/CodeEditor.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { formatString } from '$lib/theory/chars';
	import { MAX_BATCH_LENGTH, MAX_BATCH_LINES, type BatchResult } from './batch';

	interface Props {
		text: string;
		results: readonly BatchResult[];
		truncated: boolean;
		/** Loads a string into the step-by-step run. */
		onrun: (input: string) => void;
	}

	let { text = $bindable(), results, truncated, onrun }: Props = $props();

	const accepted = $derived(results.filter((r) => r.accepted).length);
	const placeholder = '1100\n""';
</script>

<div class="batch">
	<CodeEditor
		bind:value={text}
		label="Strings, one per line"
		language="plain"
		minRows={4}
		maxRows={10}
		tabInserts={false}
		{placeholder}
	/>
	{#if results.length}
		<p class="summary" aria-live="polite">
			{accepted} of {results.length} accepted.
		</p>
		<ul class="results">
			{#each results as r (r.line)}
				<li>
					<span class="line" aria-hidden="true">{r.line}</span>
					<Badge tone={r.accepted ? 'accept' : 'reject'}>{r.accepted ? 'Accept' : 'Reject'}</Badge>
					<span class="string">{formatString(r.input)}</span>
					<span class="detail">{r.detail}</span>
					<IconButton
						icon="play"
						size="sm"
						label="Run {formatString(r.input)} step by step"
						onclick={() => onrun(r.input)}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="summary">Write a string on each line; <code>""</code> is the empty string.</p>
	{/if}
	{#if truncated}
		<p class="summary">
			Lines after the first {MAX_BATCH_LINES}, and lines longer than {MAX_BATCH_LENGTH} characters, are
			skipped.
		</p>
	{/if}
</div>

<style>
	.batch {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.summary {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.results {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		max-height: 20rem;
		overflow-y: auto;
	}
	li {
		display: grid;
		grid-template-columns: 2ch auto minmax(0, auto) minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: 4px var(--space-2) 4px var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}
	li:last-child {
		border-bottom: 0;
	}
	.line {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-align: right;
	}
	.string {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.detail {
		overflow: hidden;
		color: var(--text-3);
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 480px) {
		li {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.line {
			display: none;
		}
		.detail {
			grid-column: 1 / -1;
			grid-row: 2;
			white-space: normal;
		}
	}
</style>
