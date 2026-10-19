<!--
	A list of LR(1) items, one per line, written as slide 11 writes them
	(S → •E, $), with marks: the item being extended, the item just added, an
	item that was already there, an item being moved. Marks are spoken as well
	as colored. A list taller or wider than its box scrolls, and takes focus so
	the keyboard can scroll it.
-->
<script lang="ts" module>
	export type ItemMark = 'current' | 'added' | 'repeat' | 'moved';

	export const MARK_WORDS: Record<ItemMark, string> = {
		current: 'being extended',
		added: 'just added',
		repeat: 'already there',
		moved: 'dot moved'
	};
</script>

<script lang="ts">
	import type { ItemView } from '$lib/components/grammar';
	import ClosureItem from './ClosureItem.svelte';

	interface Props {
		lines: readonly { view: ItemView; marks: readonly ItemMark[] }[];
		label: string;
		/** Text when there are no items. */
		empty?: string;
	}

	let { lines, label, empty = '∅' }: Props = $props();
</script>

<!-- A scrolling region takes focus so the keyboard can scroll it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<ol class="items" aria-label={label} tabindex="0">
	{#each lines as line, i (i)}
		{@const first = line.marks[0]}
		<li class={first ? `mark-${first}` : ''}>
			<ClosureItem item={line.view} />
			{#if line.marks.length}
				<span class="visually-hidden">({line.marks.map((m) => MARK_WORDS[m]).join(', ')})</span>
			{/if}
		</li>
	{:else}
		<li class="empty">{empty}</li>
	{/each}
</ol>

<style>
	.items {
		display: flex;
		flex-direction: column;
		max-height: 22rem;
		margin: 0;
		padding: 4px 0;
		overflow: auto;
		border: 1.5px solid var(--state-stroke);
		background: var(--state-fill);
		font-size: var(--text-sm);
		list-style: none;
	}
	.items:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	li {
		min-width: max-content;
		padding: 1px 10px;
		border-left: 3px solid transparent;
		line-height: 1.6;
	}
	.empty {
		color: var(--text-3);
		font-family: var(--font-mono);
	}
	.mark-current,
	.mark-moved {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
	.mark-added {
		border-left-color: var(--accept);
		background: var(--accept-soft);
	}
	.mark-repeat {
		border-left-color: var(--border-strong);
		background: var(--surface-3);
	}
</style>
