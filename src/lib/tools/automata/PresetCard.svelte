<!--
@component
The loaded slide example: its title, citation and description, plus the
question the slide asks (answer on request) or the task it sets. Once the
machine has been edited, the card says so and offers to load the slide's
machine again instead.
-->
<script lang="ts">
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import type { Preset } from '$lib/components/ui/types';
	import type { AnswerBlock, AutomataPreset } from './presets';

	interface Props {
		preset: Preset<AutomataPreset>;
		/** The machine no longer matches the slide's. */
		edited?: boolean;
		/** Offered next to a question about the machine's language. */
		ontry?: () => void;
		/** Loads the slide's machine again (shown when `edited`). */
		onreload?: () => void;
	}

	let { preset, edited = false, ontry, onreload }: Props = $props();

	const q = $derived(preset.value.question);
	/** Questions about the machine's language can be tried under "What language?". */
	const asksForRe = $derived(!!q && /language/i.test(q.prompt));
</script>

{#snippet block(b: AnswerBlock)}
	{#if b.kind === 'text'}
		<p>{b.text}</p>
	{:else if b.kind === 'formal'}
		<p class="formal">{b.text}</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr
						>{#each b.head as h, i (i)}<th scope="col">{h}</th>{/each}</tr
					>
				</thead>
				<tbody>
					{#each b.rows as row, r (r)}
						<tr>
							{#each row as cell, c (c)}
								{#if c === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}

<section class="card" aria-label="Slide example">
	<div class="head">
		<h2>{preset.label}</h2>
		{#if preset.cite}<CitationTag cite={preset.cite} size="md" />{/if}
	</div>
	{#if edited}
		<div class="edited">
			<p class="desc">
				The machine has been edited since this example was loaded; the description and the slide's
				question are about the original.
			</p>
			{#if onreload}
				<button type="button" class="try" onclick={onreload}>Reload the example</button>
			{/if}
		</div>
	{:else}
		{#if preset.description}<p class="desc">{preset.description}</p>{/if}
		{#if q}
			<div class="question">
				<div class="ask">
					<p class="prompt">{q.prompt}</p>
					{#if asksForRe && ontry}
						<button type="button" class="try" onclick={ontry}>Check an RE under Challenges</button>
					{/if}
				</div>
				<Disclosure summary="Show answer" openSummary="Hide answer">
					<div class="answer">
						{#each q.answer as b, i (i)}{@render block(b)}{/each}
					</div>
				</Disclosure>
			</div>
		{:else if preset.value.prompt}
			<div class="question">
				<p class="prompt">{preset.value.prompt}</p>
			</div>
		{/if}
	{/if}
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.desc {
		margin: 0;
		max-width: var(--content-width);
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.edited {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-4);
	}
	.question {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}
	.ask {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-4);
	}
	.prompt {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-style: italic;
	}
	.answer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: var(--content-width);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.answer p {
		margin: 0;
	}
	.formal {
		align-self: flex-start;
		padding: 2px var(--space-3);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
	}
	table {
		border: 1px solid var(--border);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 4px 14px;
		border: 1px solid var(--border);
		text-align: center;
	}
	thead th {
		background: var(--surface-2);
	}
	.try {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.18em;
	}
	.try:hover {
		color: var(--accent-hover);
	}
</style>
