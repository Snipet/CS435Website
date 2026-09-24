<script lang="ts">
	import { decks, formatCitation, type Citation } from '$lib/lectures';
	import Icon from './Icon.svelte';

	interface Props {
		cite: Citation;
		size?: 'sm' | 'md';
	}

	let { cite, size = 'sm' }: Props = $props();

	const text = $derived(formatCitation(cite));
</script>

<span class={['cite', size]} title="Lecture: {decks[cite.deck].topic}">
	<Icon name="book" size={size === 'sm' ? 13 : 15} />
	<span class="visually-hidden">Lecture reference:</span>
	<span class="text">{text}</span>
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
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
