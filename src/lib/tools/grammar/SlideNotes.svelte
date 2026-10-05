<!--
	The loaded preset: where it comes from, what the slide shows, and the
	questions the slide asks, each with its answer behind a disclosure.
-->
<script lang="ts">
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { richText, type GrammarPreset, type SlideQuestion } from './presets';

	interface Props {
		preset: GrammarPreset;
		/** Link to the Regular Expressions tool for a question's RE; null hides it. */
		regexHref: (question: SlideQuestion) => string | null;
	}

	let { preset, regexHref }: Props = $props();
</script>

<Panel title="From the slides" variant="subtle">
	{#snippet actions()}
		{#if preset.cite}<CitationTag cite={preset.cite} />{/if}
	{/snippet}
	<div class="notes">
		{#if preset.description}<p class="description">{preset.description}</p>{/if}
		{#if preset.questions?.length}
			<ul class="questions">
				{#each preset.questions as q (q.question + q.answer)}
					{@const href = regexHref(q)}
					<li>
						<p class="question">{q.question}</p>
						{#if q.note}<p class="slide-note">{q.note}</p>{/if}
						<Disclosure summary="Show answer" openSummary="Hide answer">
							<p class={['answer', { formal: q.formal }]}>
								{#each richText(q.answer) as part, i (i)}{#if part.sup}<sup>{part.text}</sup
										>{:else}{part.text}{/if}{/each}
							</p>
							{#if href}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
								<a class="tool-link" {href}>
									Open <span class="formal">{q.re}</span> in Regular Expressions
									<Icon name="arrow-right" size={14} />
								</a>
							{/if}
						</Disclosure>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Panel>

<style>
	.notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.description {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.questions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-3) var(--space-6);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.questions li {
		min-width: 0;
	}
	.question {
		margin: 0 0 var(--space-1);
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-style: italic;
	}
	.slide-note {
		margin: 0 0 var(--space-1);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.answer {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.formal {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	sup {
		font-size: 0.72em;
		line-height: 0;
	}
	.tool-link {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}
	.tool-link:hover {
		text-decoration: underline;
	}
</style>
