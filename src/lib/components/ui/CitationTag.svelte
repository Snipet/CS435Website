<script lang="ts">
	import { citationParts, decks, formatCitation, type Citation } from '$lib/lectures';
	import Icon from './Icon.svelte';

	interface Props {
		cite: Citation;
		size?: 'sm' | 'md';
	}

	let { cite, size = 'sm' }: Props = $props();

	const parts = $derived(citationParts(cite));
	const text = $derived(formatCitation(cite));
	/** The whole citation, plus the deck's topic when the text does not name it. */
	const title = $derived.by(() => {
		const topic = decks[cite.deck].topic;
		return text.includes(topic) ? text : `${text} (${topic})`;
	});
</script>

<!-- When space runs out, the deck name shortens with an ellipsis; the slides stay visible. -->
<span class={['cite', size]} {title}>
	<Icon name="book" size={size === 'sm' ? 13 : 15} />
	<span class="visually-hidden">Lecture reference:</span>
	<span class="text"
		><span class="deck">{parts.deck}</span>{#if parts.slides}<span class="slides"
				>&nbsp;· {parts.slides}</span
			>{/if}</span
	>
</span>

<style>
	.cite {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
		padding: 1px 8px 1px 6px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-3);
		line-height: 1.5;
		white-space: nowrap;
		vertical-align: middle;
	}
	.sm {
		font-size: var(--text-xs);
	}
	.md {
		font-size: var(--text-sm);
		padding: 2px 10px 2px 8px;
	}
	.text {
		display: flex;
		min-width: 0;
	}
	.deck {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.slides {
		flex: none;
	}
</style>
