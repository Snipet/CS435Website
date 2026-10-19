<!--
	A state of the LR(1) parsing DFA drawn as an item-set box, as on Bottom-up
	Parsing III, slide 14: the items one per line in a box, the state number in
	a small box of its own beside it, and the state's reduce or accept labels
	(E → int on $, +; accept on $) under it.
-->
<script lang="ts">
	import { toneColors } from '$lib/components/ui/tones';
	import type { Tone } from '$lib/components/ui/types';
	import LrItem from './LrItem.svelte';
	import {
		annotationText,
		formatItem,
		mergeLookaheads,
		stateAnnotations,
		type ItemStyle,
		type ItemView,
		type StateAnnotation
	} from './lr-item';

	interface Props {
		/** The state's number. */
		number: number | string;
		/** The items of the state (its closure), in order. */
		items: readonly ItemView[];
		/** `compact` (default, as in the slide's boxes), `spaced` or `bracketed`. */
		style?: ItemStyle;
		/** Merge items that differ only in their lookahead into one line (`$/+`). Default true. */
		merge?: boolean;
		/**
		 * The augmented start symbol (`S` of `S → E`, never on a right-hand side):
		 * its complete item reads "accept on $" (see `stateAnnotations`).
		 */
		start?: string;
		/** The labels beside the state; by default worked out from the items (`stateAnnotations`). */
		annotations?: readonly StateAnnotation[];
		/** Lines to mark (indices after merging), e.g. the items a closure step just added. */
		highlight?: readonly number[];
		/** What a marked line is called in the accessible name (`marked: E → •int, )/+`). */
		highlightName?: string;
		/** Color of the marked lines. */
		tone?: Tone;
		/** Marks the whole state, e.g. the state the parser is in. */
		current?: boolean;
		/** Which side of the box the number stands on. */
		numberSide?: 'left' | 'right';
	}

	let {
		number,
		items,
		style = 'compact',
		merge = true,
		start,
		annotations,
		highlight = [],
		highlightName = 'marked',
		tone = 'active',
		current = false,
		numberSide = 'right'
	}: Props = $props();

	const lines = $derived(merge ? mergeLookaheads(items) : [...items]);
	const notes = $derived((annotations ?? stateAnnotations(items, { start })).map(annotationText));
	const marked = $derived(new Set(highlight));
	const colors = $derived(toneColors(tone));
	// The marks are spoken too: the state's number with ", current", each marked line with its name.
	const label = $derived(
		[
			`State ${number}${current ? ', current' : ''}`,
			...lines.map((it, i) => (marked.has(i) ? `${highlightName}: ` : '') + formatItem(it, style)),
			...notes
		].join('; ')
	);
</script>

<figure
	class={['lr-state', numberSide, { current }]}
	style="--mark-fg: {colors.fg}; --mark-bg: {colors.bg};"
	aria-label={label}
>
	<div class="frame">
		<ul class="items" aria-hidden="true">
			{#each lines as line, i (i)}
				<li class={{ marked: marked.has(i) }}><LrItem item={line} {style} /></li>
			{/each}
		</ul>
		<span class="number" aria-hidden="true">{number}</span>
	</div>
	{#if notes.length}
		<figcaption aria-hidden="true">
			{#each notes as note, i (i)}<span>{note}</span>{/each}
		</figcaption>
	{/if}
</figure>

<style>
	.lr-state {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		max-width: 100%;
		margin: 0;
		font-size: var(--text-sm);
	}
	.frame {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		max-width: 100%;
	}
	.left .frame {
		flex-direction: row-reverse;
	}
	.items {
		min-width: 0;
		margin: 0;
		padding: 6px 0;
		overflow-x: auto;
		border: 1.5px solid var(--state-stroke);
		background: var(--state-fill);
		list-style: none;
	}
	.items li {
		padding: 1px 10px;
		border-left: 3px solid transparent;
		line-height: 1.6;
	}
	.items li.marked {
		border-left-color: var(--mark-fg);
		background: var(--mark-bg);
	}
	.current .items {
		border-color: var(--active);
		box-shadow: 0 0 0 2px var(--active-soft);
	}
	.number {
		display: grid;
		flex: none;
		place-items: center;
		min-width: 1.9rem;
		height: 1.9rem;
		padding: 0 4px;
		border: 1.5px solid var(--state-stroke);
		background: var(--state-fill);
		color: var(--text);
		font-family: var(--font-mono);
		font-weight: 600;
	}
	figcaption {
		display: flex;
		flex-direction: column;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		line-height: 1.5;
	}
</style>
