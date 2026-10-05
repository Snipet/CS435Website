<!--
	Sentential forms joined by →, the arrow the decks use for derivation steps
	(Introduction to Parsing, slides 12 and 19). The chain wraps between forms,
	so a continuation line starts with →.
-->
<script lang="ts">
	import { chainForms, type ChainForm } from './derivation-chain';
	import type { ChainStep } from './types';

	interface Props {
		/** The sentential forms in order; an empty form is shown as ε. */
		forms: readonly (readonly string[])[];
		/**
		 * `steps[i]` takes `forms[i]` to `forms[i + 1]`: the non-terminal at `index`
		 * is replaced by `length` symbols. The replaced symbol is underlined and
		 * its replacement tinted.
		 */
		steps?: readonly ChainStep[];
		/** Symbols drawn as non-terminals. */
		nonterminals?: readonly string[];
		/** Index of the form to emphasize. */
		current?: number | null;
		/** Makes each form a button. */
		onformclick?: (index: number) => void;
		size?: 'md' | 'lg';
		ariaLabel?: string;
	}

	let {
		forms,
		steps = [],
		nonterminals = [],
		current = null,
		onformclick,
		size = 'md',
		ariaLabel = 'Derivation'
	}: Props = $props();

	const items = $derived(chainForms(forms, steps, nonterminals));
</script>

{#snippet symbols(form: ChainForm)}
	{#if form.empty}
		<span class="eps">ε</span>
	{:else}
		<!-- Symbols are separated by one space, where a long form may wrap. -->
		{#each form.segments as segment, i (i)}{i > 0 ? ' ' : ''}<span class={{ made: segment.made }}
				>{#each segment.symbols as s, k (k)}{k > 0 ? ' ' : ''}<span
						class={['sym', { nt: s.nonterminal, replaced: s.replaced }]}>{s.text}</span
					>{/each}</span
			>{/each}
	{/if}
{/snippet}

<ol class={['chain', size]} aria-label={ariaLabel}>
	{#each items as form (form.index)}
		{@const active = form.index === current}
		<li class={{ current: active }} aria-current={active && !onformclick ? 'step' : undefined}>
			{#if form.index > 0}<span class="arrow" aria-hidden="true">→</span>{/if}
			{#if onformclick}
				<button
					type="button"
					class="form"
					aria-current={active ? 'step' : undefined}
					onclick={() => onformclick(form.index)}>{@render symbols(form)}</button
				>
			{:else}
				<span class="form">{@render symbols(form)}</span>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.chain {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		row-gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	.md {
		font-size: 0.9375rem;
	}
	.lg {
		font-size: 1.125rem;
	}
	/* A form moves to the next line whole, with its arrow; one wider than the line wraps inside. */
	li {
		display: flex;
		align-items: baseline;
		min-width: 0;
		max-width: 100%;
	}
	.arrow {
		flex: none;
		margin: 0 0.45em;
		color: var(--text-3);
	}
	.form {
		min-width: 0;
		margin: 0;
		padding: 1px 5px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		overflow-wrap: anywhere;
	}
	button.form {
		cursor: pointer;
	}
	button.form:hover {
		background: var(--surface-2);
	}
	.current .form,
	.current button.form:hover {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	.sym {
		white-space: pre;
	}
	.nt {
		color: var(--syn-name);
	}
	.replaced {
		text-decoration: underline solid var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
		text-decoration-skip-ink: none;
	}
	.made {
		border-radius: 3px;
		background: var(--accent-soft);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}
	.eps {
		color: var(--syn-special);
	}
</style>
