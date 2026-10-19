<!--
	One configuration of a shift-reduce parse as Bottom-up Parsing II, slide 14
	writes it: the stack, the red divider I, the rest of the input ending in $.
	The symbols the row's action works on are purple (`--tok-3`): the handle
	before a reduce, the tokens to shift before a shift. With `stacks`, the DFA
	state of every stack symbol is written under it, the bottom pair's 0 first.
-->
<script lang="ts">
	import type { ConfigRun, ConfigSymbol, ConfigurationView } from './view';

	interface Props {
		view: ConfigurationView;
		/** The DFA state under every stack symbol. */
		stacks?: boolean;
	}

	let { view, stacks = false }: Props = $props();

	const HANDLE = { before: 'handle: ', after: ', end of handle' };
	const SHIFT = { before: 'to shift: ', after: ', end of shift' };

	const states = $derived(
		stacks
			? [view.bottom, ...view.left.flatMap((r) => r.symbols.map((s) => s.state ?? ''))].join(', ')
			: ''
	);
</script>

{#snippet symbol(s: ConfigSymbol)}{#if stacks && s.state !== null}<span class="unit"
			><span class="sym">{s.text}</span><span class="state" aria-hidden="true">{s.state}</span
			></span
		>{:else}<span class="sym">{s.text}</span>{/if}{/snippet}

{#snippet part(
	runs: ConfigRun[],
	spoken: { before: string; after: string }
)}{#each runs as run, r (r)}{#if run.mark}{run.symbols[0].sep}<span class="visually-hidden"
				>{spoken.before}</span
			><span class="next"
				>{#each run.symbols as s, k (k)}{k > 0 ? s.sep : ''}{@render symbol(s)}{/each}</span
			><span class="visually-hidden">{spoken.after}</span
			>{:else}{#each run.symbols as s, k (k)}{s.sep}{@render symbol(s)}{/each}{/if}{/each}{/snippet}

<span class={['configuration', { stacks }]}
	>{#if stacks}<span class="unit bottom" aria-hidden="true"
			><span class="sym"> </span><span class="state">{view.bottom}</span></span
		>{/if}{@render part(view.left, HANDLE)}{#if view.emptyHandle}<span class="visually-hidden"
			>{HANDLE.before}ε{HANDLE.after}</span
		><span class="next empty" aria-hidden="true" title="Empty handle">ε</span>{/if}{view.left
		.length || view.emptyHandle
		? ' '
		: ''}<span class="divider"
		><span aria-hidden="true">I</span><span class="visually-hidden">divider</span></span
	>{view.right.length ? ' ' : ''}{@render part(view.right, SHIFT)}{#if stacks}<span
			class="visually-hidden">; states of the stack: {states}</span
		>{/if}</span
>

<style>
	.configuration {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre;
	}
	.sym {
		white-space: pre;
	}
	.next {
		color: var(--tok-3);
		font-weight: 600;
	}
	.next.empty {
		display: inline-block;
		margin-left: 0.35em;
		font-size: 0.8em;
		transform: translateY(-0.35em);
	}
	.divider {
		color: var(--reject);
		font-family: var(--font-sans);
		font-weight: 600;
	}
	.unit {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		vertical-align: baseline;
	}
	/* Numbers under neighboring symbols (`(int`) keep a gap between them. */
	.state {
		padding: 0 0.25em;
		color: var(--text-3);
		font-size: 0.72em;
		font-weight: 400;
		line-height: 1.2;
	}
	.bottom {
		margin-right: 0.2em;
	}
</style>
