<!--
	The productions tried so far, one line each, as slides 18–20 list them:
	"Try E0 → T1 + E2". A line whose children were removed again is gray, with
	the failure that sent the search back to it. Choosing a line shows its step.
-->
<script lang="ts">
	import Pieces from './Pieces.svelte';
	import { moveFocus, tabStop } from './roving';
	import { onReflow, showRow, tailWindow } from './scroll';
	import type { LogLine } from './view';

	interface Props {
		lines: readonly LogLine[];
		onselect?: (step: number) => void;
		/** CSS max-height of the list; longer logs scroll inside it. */
		maxHeight?: string;
		/** Lines drawn at most: the newest ones. The number left out is stated above them. */
		limit?: number;
	}

	let { lines, onselect, maxHeight = '21rem', limit = 400 }: Props = $props();

	const cut = $derived(tailWindow(lines.length, limit));
	const shown = $derived(cut.start > 0 ? lines.slice(cut.start) : lines);

	let box: HTMLOListElement | undefined = $state();

	// One tab stop for the list; the arrow keys, Home and End move between its lines.
	let focused = $state<number | null>(null);
	const stop = $derived(
		tabStop(
			shown.map((l) => ({ id: l.step, current: l.current })),
			focused
		)
	);

	// Keep the line of the step shown (or the newest line) in view without scrolling the page.
	$effect(() => {
		const el = box;
		void shown;
		if (!el) return;
		const adjust = () => {
			const row = el.querySelector<HTMLElement>('.row.current') ?? el.lastElementChild;
			const item = row?.closest('li');
			if (item) showRow(el, item);
		};
		adjust();
		return onReflow(el, adjust);
	});
</script>

<ol
	class="log"
	bind:this={box}
	style:max-height={maxHeight}
	aria-label="Productions tried. The arrow keys move between the lines."
>
	{#if cut.hidden > 0}
		<li class="earlier">
			… {cut.hidden} earlier {cut.hidden === 1 ? 'line is' : 'lines are'} not listed
		</li>
	{/if}
	{#each shown as line (line.step)}
		<li>
			<button
				type="button"
				class={['row', line.kind, { undone: line.undone, current: line.current }]}
				aria-current={line.current ? 'step' : undefined}
				title="Show this step"
				tabindex={line.step === stop ? 0 : -1}
				onclick={() => onselect?.(line.step)}
				onfocus={() => (focused = line.step)}
				onkeydown={(event) => moveFocus(event, box)}
			>
				<span class="what"><Pieces pieces={line.pieces} /></span>
				{#if line.undone}
					<span class="why"
						>{#if line.cause}{line.cause}{:else}<span class="visually-hidden">removed</span
							>{/if}</span
					>
				{/if}
			</button>
		</li>
	{/each}
</ol>

<style>
	.log {
		position: relative;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		scrollbar-width: thin;
	}
	.earlier {
		padding: 5px 10px 5px 15px;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: 5px 10px 5px 12px;
		border: 0;
		border-left: 3px solid transparent;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: transparent;
		color: var(--text);
		font-size: var(--text-sm);
		line-height: 1.5;
		text-align: left;
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row:focus-visible {
		outline-offset: -2px;
	}
	.row.current {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
	.what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.try .what {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.undone .what {
		color: var(--text-3);
	}
	.why {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-style: italic;
	}
	.exhausted .what {
		color: var(--text-2);
		font-style: italic;
	}
	.accept .what {
		color: var(--accept);
		font-weight: 600;
	}
	.reject .what {
		color: var(--reject);
		font-weight: 600;
	}
	.stop .what {
		font-weight: 600;
	}
</style>
