<!--
	Every call made so far, indented by how deep it is, with the value it
	returned once it has. Choosing a line shows the step that makes the call.
-->
<script lang="ts">
	import Pieces from './Pieces.svelte';
	import { moveFocus, tabStop } from './roving';
	import { onReflow, showRow, tailWindow } from './scroll';
	import type { TraceLine } from './view';

	interface Props {
		lines: readonly TraceLine[];
		onselect?: (step: number) => void;
		maxHeight?: string;
		/** Calls drawn at most: the newest ones. The number left out is stated above them. */
		limit?: number;
	}

	let { lines, onselect, maxHeight = '19rem', limit = 400 }: Props = $props();

	/** Deeper calls keep this indentation, so a long recursion stays inside the box. */
	const MAX_INDENT = 14;

	const cut = $derived(tailWindow(lines.length, limit));
	const shown = $derived(cut.start > 0 ? lines.slice(cut.start) : lines);

	let box: HTMLOListElement | undefined = $state();

	// One tab stop for the list; the arrow keys, Home and End move between its lines.
	let focused = $state<number | null>(null);
	const stop = $derived(
		tabStop(
			shown.map((l) => ({ id: l.call, current: l.current })),
			focused
		)
	);

	// Keep the call of the step shown (or the newest call) in view without scrolling the page.
	$effect(() => {
		const el = box;
		void shown;
		if (!el) return;
		const adjust = () => {
			const current = el.querySelectorAll<HTMLElement>('.row.current');
			const row = current.length > 0 ? current[current.length - 1] : el.lastElementChild;
			const item = row?.closest('li');
			if (item) showRow(el, item);
		};
		adjust();
		return onReflow(el, adjust);
	});
</script>

{#if lines.length === 0}
	<p class="none">No call yet.</p>
{:else}
	<ol
		class="trace"
		bind:this={box}
		style:max-height={maxHeight}
		aria-label="Calls and results. The arrow keys move between the lines."
	>
		{#if cut.hidden > 0}
			<li class="earlier">
				… {cut.hidden} earlier {cut.hidden === 1 ? 'call is' : 'calls are'} not listed
			</li>
		{/if}
		{#each shown as line (line.call)}
			<li>
				<button
					type="button"
					class={['row', { current: line.current, running: line.result === null }]}
					style:--depth={Math.min(line.depth, MAX_INDENT)}
					title="Show the step that makes this call"
					tabindex={line.call === stop ? 0 : -1}
					onclick={() => onselect?.(line.step)}
					onfocus={() => (focused = line.call)}
					onkeydown={(event) => moveFocus(event, box)}
				>
					<span class="name"><Pieces pieces={line.name} code /></span>
					{#if line.result === null}
						<span class="result running">in progress</span>
					{:else}
						<span class={['result', line.result ? 'yes' : 'no']}>{line.result}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.none {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.trace {
		position: relative;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		scrollbar-width: thin;
	}
	.earlier {
		padding: 3px 10px 3px 13px;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		padding: 3px 10px 3px calc(10px + var(--depth) * 12px);
		border: 0;
		border-left: 3px solid transparent;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: transparent;
		color: var(--text);
		font-size: 0.8125rem;
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
	.name {
		min-width: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.row.running .name {
		font-weight: 650;
	}
	.result {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
	}
	.result.yes {
		color: var(--accept);
		font-weight: 600;
	}
	.result.no {
		color: var(--reject);
		font-weight: 600;
	}
	.result.running {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-style: italic;
	}
</style>
