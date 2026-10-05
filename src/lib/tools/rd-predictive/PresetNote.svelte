<!--
	What the loaded preset is: its slides, a description, the notation the slide
	shows with it, and the questions the slides pose, each with its answer
	behind "Show answer".
-->
<script lang="ts">
	import { CitationTag, Disclosure } from '$lib/components/ui';
	import type { PredictivePreset } from './presets';
	import { formulaParts } from './view';

	interface Props {
		preset: PredictivePreset;
	}

	let { preset }: Props = $props();
</script>

{#snippet notation(text: string)}
	{#each formulaParts(text) as part, i (i)}{#if part.script === 'sub'}<sub>{part.text}</sub
			>{:else if part.script === 'sup'}<sup>{part.text}</sup>{:else}{part.text}{/if}{/each}
{/snippet}

<aside class="note" aria-label="About this example">
	{#if preset.cite}<CitationTag cite={preset.cite} />{/if}
	<p class="desc">{@render notation(preset.description ?? '')}</p>
	{#if preset.formula?.length}
		<p class="formula">
			{#each preset.formula as line, i (i)}<span class="row">{@render notation(line)}</span>{/each}
		</p>
	{/if}
	{#if preset.questions?.length}
		<ul class="questions">
			{#each preset.questions as q, i (i)}
				<li>
					<p class="prompt">{@render notation(q.prompt)}</p>
					<Disclosure summary="Show answer" openSummary="Hide answer">
						{#if q.code}
							<p class="code">
								{#each q.code.split('\n') as line, k (k)}<span class="row"
										>{@render notation(line)}</span
									>{/each}
							</p>
						{/if}
						{#if q.answer}<p class="answer">{q.answer}</p>{/if}
						<p class="where"><CitationTag cite={q.cite} /></p>
					</Disclosure>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.note {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.desc {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.formula,
	.code {
		max-width: 100%;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	.formula {
		padding: 4px 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
	}
	.row {
		display: block;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	sub,
	sup {
		font-size: 0.75em;
		line-height: 0;
	}
	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		margin: var(--space-1) 0 0;
		padding: 0;
		list-style: none;
	}
	.questions li {
		min-width: 0;
	}
	.prompt {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-style: italic;
		line-height: 1.4;
	}
	.code {
		margin: 0 0 var(--space-2);
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.answer {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.where {
		margin: 0;
	}
</style>
