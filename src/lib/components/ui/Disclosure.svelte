<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Summary text, e.g. "Show answer". */
		summary?: string;
		/** Rich summary instead of `summary`. */
		summaryContent?: Snippet;
		/** Summary text while open (defaults to `summary`), e.g. "Hide answer". */
		openSummary?: string;
		open?: boolean;
		variant?: 'inline' | 'boxed';
		children?: Snippet;
	}

	let {
		summary = 'Show answer',
		summaryContent,
		openSummary,
		open = $bindable(false),
		variant = 'inline',
		children
	}: Props = $props();
</script>

<details class={['disclosure', variant]} bind:open>
	<summary>
		<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size={14} /></span>
		{#if summaryContent}{@render summaryContent()}{:else}{open && openSummary
				? openSummary
				: summary}{/if}
	</summary>
	<div class="content">{@render children?.()}</div>
</details>

<style>
	.disclosure {
		min-width: 0;
	}
	summary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px 4px 4px;
		border-radius: var(--radius);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		list-style: none;
		user-select: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--accent-soft);
	}
	.chevron {
		display: flex;
		transition: transform var(--duration) var(--ease);
	}
	details[open] > summary .chevron {
		transform: rotate(90deg);
	}
	.content {
		padding: var(--space-2) 0 0 var(--space-5);
	}
	.content :global(> :last-child) {
		margin-bottom: 0;
	}
	.boxed {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.boxed summary {
		display: flex;
		padding: var(--space-2) var(--space-3);
		border-radius: calc(var(--radius) - 1px);
	}
	.boxed .content {
		padding: 0 var(--space-4) var(--space-3) calc(var(--space-3) + 20px);
	}
</style>
