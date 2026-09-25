<!--
@component
NFA states as toggle buttons, for picking a set when the NFA is too large to
draw.
-->
<script lang="ts">
	import type { Automaton, StateId } from '$lib/theory/automata';
	import { stateName } from './logic';

	interface Props {
		nfa: Automaton;
		/** Picked states. */
		picked: readonly StateId[];
		onpick: (id: StateId) => void;
		/** Accessible name of the group. */
		label?: string;
	}

	let { nfa, picked, onpick, label = 'NFA states' }: Props = $props();

	const chosen = $derived(new Set(picked));
</script>

<div class="chips" role="group" aria-label={label}>
	{#each nfa.states as s (s.id)}
		<button type="button" class="chip" aria-pressed={chosen.has(s.id)} onclick={() => onpick(s.id)}
			>{stateName(nfa, s.id)}</button
		>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		max-height: 16rem;
		overflow-y: auto;
	}
	.chip {
		min-width: 2.4em;
		padding: 2px 8px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	.chip:hover {
		background: var(--surface-2);
	}
	.chip[aria-pressed='true'] {
		border-color: var(--active);
		background: var(--active-soft);
	}
</style>
