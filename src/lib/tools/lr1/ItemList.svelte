<!--
	A list of LR(1) items, one per line, with marks: the item being extended,
	the item just added, an item that was already there, an item being moved.
	Marks are spoken as well as colored.
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
	import { LrItem, type ItemStyle, type ItemView } from '$lib/components/grammar';

	interface Props {
		lines: readonly { view: ItemView; marks: readonly ItemMark[] }[];
		label: string;
		style?: ItemStyle;
		/** Text when there are no items. */
		empty?: string;
	}

	let { lines, label, style = 'spaced', empty = '∅' }: Props = $props();
</script>

<ol class="items" aria-label={label}>
	{#each lines as line, i (i)}
		{@const first = line.marks[0]}
		<li class={first ? `mark-${first}` : ''}>
			<LrItem item={line.view} {style} />
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
