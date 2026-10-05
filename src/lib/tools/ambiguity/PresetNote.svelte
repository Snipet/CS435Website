<!-- The loaded preset: its slides, what it shows, and the questions those slides pose. -->
<script lang="ts">
	import { CitationTag, Disclosure } from '$lib/components/ui';
	import type { AmbiguityPreset } from './presets';

	interface Props {
		preset: AmbiguityPreset;
	}

	let { preset }: Props = $props();
</script>

<aside class="preset-note" aria-label="About this example">
	<CitationTag cite={preset.cite} />
	<p class="description">{preset.description}</p>
	{#if preset.questions?.length}
		<ul class="questions">
			<!-- Keyed by preset too: another preset's question starts closed. -->
			{#each preset.questions as q (preset.id + q.prompt)}
				<li>
					<p class="prompt">{q.prompt}</p>
					<Disclosure summary="Show answer" openSummary="Hide answer">
						<p class="answer">{q.answer}</p>
					</Disclosure>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.preset-note {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.description {
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
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
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
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
	}
</style>
