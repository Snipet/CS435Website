<!--
	The fringe of the partial tree (Top-Down Parsing, slide 22): the matched
	terminals t1 t2 … tk, the leftmost non-terminal A, and the rest. At a try,
	the new fringe with the production's right-hand side in place of A.
-->
<script lang="ts">
	import { EPSILON } from '$lib/theory/grammar/types';
	import type { BacktrackStep } from './backtrack';
	import FollowBox from './FollowBox.svelte';
	import Pieces from './Pieces.svelte';
	import { fringeSymbols, fringeText, type FringeSymbol } from './view';

	interface Props {
		step: BacktrackStep;
		/** Write the instance numbers (E0, T1 …). */
		instances: boolean;
	}

	let { step, instances }: Props = $props();

	const now = $derived(fringeSymbols(step.fringe, instances));
	const after = $derived(step.newFringe ? fringeSymbols(step.newFringe, instances) : null);
	const nowText = $derived(fringeText(step.fringe, instances));
	const afterText = $derived(step.newFringe ? fringeText(step.newFringe, instances) : '');

	/** Four lines of symbols (24 px each, 3 px apart), so a box that scrolls shows whole lines. */
	const MAX_HEIGHT = '6.5625rem';

	/** The symbol to keep in view: the leftmost non-terminal, the new symbols, or what follows the matched ones. */
	const leftmost = (box: HTMLElement): Element | null =>
		box.querySelector('.next, .added') ?? box.querySelector('.sym:not(.matched)');

	const MARK_NAME = {
		matched: 'matched',
		next: 'leftmost non-terminal',
		added: 'new',
		rest: ''
	} as const;
</script>

{#snippet symbols(list: readonly FringeSymbol[])}
	{#if list.length === 0}
		<span class="sym empty">{EPSILON}</span>
	{:else}
		{#each list as s, i (i)}
			<span class={['sym', s.mark]} title={MARK_NAME[s.mark] || undefined}
				><Pieces pieces={[s.piece]} /></span
			>
		{/each}
	{/if}
{/snippet}

<!-- A long fringe scrolls in its box, which follows the leftmost non-terminal. -->
<dl class="fringe">
	<div class="row">
		<dt>Fringe</dt>
		<dd>
			<FollowBox
				maxHeight={MAX_HEIGHT}
				margin={0}
				watch={step}
				label="Fringe, scrolls"
				find={leftmost}
			>
				<span class="visually-hidden">{nowText}</span>
				<span class="line" aria-hidden="true">{@render symbols(now)}</span>
			</FollowBox>
		</dd>
	</div>
	<!-- The second row keeps its place between tries, so the panel does not change height. -->
	<div class={['row', { idle: !after }]} aria-hidden={after ? undefined : 'true'}>
		<dt>New fringe</dt>
		<dd>
			<FollowBox
				maxHeight={MAX_HEIGHT}
				margin={0}
				watch={step}
				label="New fringe, scrolls"
				find={leftmost}
			>
				{#if after}<span class="visually-hidden">{afterText}</span>{/if}
				<span class="line" aria-hidden="true"
					>{#if after}{@render symbols(after)}{:else}&nbsp;{/if}</span
				>
			</FollowBox>
		</dd>
	</div>
</dl>

<style>
	.fringe {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-2) var(--space-3);
		margin: 0;
	}
	.row {
		display: contents;
	}
	dt {
		padding-top: 3px;
		color: var(--text-2);
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	dd {
		min-width: 0;
		margin: 0;
	}
	.idle dt,
	.idle dd {
		visibility: hidden;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 2px;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-variant-ligatures: none;
		line-height: 1.5;
	}
	.sym {
		padding: 0 0.3em;
		border-radius: var(--radius-sm);
		box-shadow: inset 0 -2px 0 transparent;
	}
	.matched {
		color: var(--text-3);
	}
	.next {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
		font-weight: 650;
	}
	.added {
		background: var(--info-soft);
		box-shadow: inset 0 -2px 0 var(--info);
	}
	.empty {
		color: var(--epsilon);
	}
</style>
