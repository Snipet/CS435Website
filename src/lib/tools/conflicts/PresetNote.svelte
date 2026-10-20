<!--
	What the loaded preset is: its slides, a description, and the questions the
	slides pose, each with its answer behind "Show answer".
-->
<script lang="ts">
	import { CitationTag, Disclosure } from '$lib/components/ui';
	import type { ConflictsPreset } from './presets';

	interface Props {
		preset: ConflictsPreset;
	}

	let { preset }: Props = $props();
</script>

<div class="note" role="group" aria-label="About this example">
	{#if preset.cite}<CitationTag cite={preset.cite} />{/if}
	<p class="desc">{preset.description ?? ''}</p>
	{#if preset.questions?.length}
		<ul class="questions">
			{#each preset.questions as q, i (i)}
				<li>
					<p class="prompt">{q.prompt}</p>
					<Disclosure summary="Show answer" openSummary="Hide answer">
						<p class="answer">{q.answer}</p>
						<p class="where"><CitationTag cite={q.cite} /></p>
					</Disclosure>
				</li>
			{/each}
		</ul>
	{/if}
</div>

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
	.answer {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.where {
		margin: 0;
	}
</style>
