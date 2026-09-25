<!--
	Compares L(R) with L(R₂): equal or not, the shortest string in each
	difference, and example strings only in one language or in both.
-->
<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
	import StringSetView from '$lib/components/ui/StringSetView.svelte';
	import RegexField, { type PaletteSymbol } from '$lib/components/ui/RegexField.svelte';
	import { formatString } from '$lib/theory/chars';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { COUNT_LENGTH, EXAMPLE_LIMIT, groupDigits, type CompareAnalysis } from './analysis';
	import { MAX_PRODUCT } from './machines';
	import { sizeMessage } from './messages';

	interface Props {
		value: string;
		/** The comparison for the settled R₂ (it may lag behind typing). */
		result: CompareAnalysis | null;
		/** Problems in R₂ as typed. */
		diagnostics: readonly Diagnostic[];
		/** Why R itself cannot be compared, if so. */
		blocked: string | null;
		symbols: readonly PaletteSymbol[];
		aliases: Readonly<Record<string, string>> | false | undefined;
		placeholder: string;
	}

	let {
		value = $bindable(),
		result,
		diagnostics,
		blocked,
		symbols,
		aliases,
		placeholder
	}: Props = $props();

	const cmp = $derived(result?.comparison ?? null);
	const columns = $derived(
		cmp
			? [
					{ title: 'Only in L(R)', strings: cmp.examples.onlyA },
					{ title: 'In both', strings: cmp.examples.both },
					{ title: 'Only in L(R₂)', strings: cmp.examples.onlyB }
				]
			: []
	);
</script>

<div class="compare">
	<RegexField label="R₂ =" size="md" bind:value {symbols} {aliases} {placeholder} {diagnostics} />

	{#if blocked}
		<p class="note">{blocked}</p>
	{:else if !result}
		<p class="note">Enter R₂ to compare L(R) with L(R₂).</p>
	{:else if result.language && !result.language.ok}
		<Callout tone="warn">{sizeMessage(result.language, 'R₂')}</Callout>
	{:else if result.tooLarge}
		<Callout tone="warn">
			Comparing L(R) with L(R₂) needs more than {groupDigits(MAX_PRODUCT)} pairs of states of their minimal
			DFAs, so they are not compared.
		</Callout>
	{:else if cmp}
		<div class={['verdict', cmp.equivalent ? 'same' : 'differ']} aria-live="polite">
			<span class="formal">{cmp.equivalent ? 'L(R) = L(R₂)' : 'L(R) ≠ L(R₂)'}</span>
			<span class="sub"
				>{cmp.equivalent
					? 'R and R₂ denote the same language.'
					: 'R and R₂ denote different languages.'}</span
			>
		</div>
		{#if !cmp.equivalent}
			<dl class="witness">
				<div>
					<dt>Shortest string in L(R) but not in L(R₂)</dt>
					<dd>{cmp.onlyA === null ? 'none' : formatString(cmp.onlyA)}</dd>
				</div>
				<div>
					<dt>Shortest string in L(R₂) but not in L(R)</dt>
					<dd>{cmp.onlyB === null ? 'none' : formatString(cmp.onlyB)}</dd>
				</div>
			</dl>
		{/if}
		<div class="columns">
			{#each columns as col (col.title)}
				<section class="column" aria-label={col.title}>
					<h3>{col.title}</h3>
					<StringSetView strings={col.strings} more={col.strings.length >= EXAMPLE_LIMIT} />
				</section>
			{/each}
		</div>
		<p class="caption">
			Examples of up to {COUNT_LENGTH} symbols in shortlex order, at most {EXAMPLE_LIMIT} per column.
		</p>
	{/if}
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-left: 3px solid var(--c);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.same {
		--c: var(--accept);
	}
	.differ {
		--c: var(--reject);
	}
	.formal {
		font-family: var(--font-mono);
		font-size: 1.125rem;
		font-variant-ligatures: none;
	}
	.sub {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.witness {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}
	.witness div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
	}
	.witness dt {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.witness dd {
		margin: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		gap: var(--space-3);
	}
	.column {
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	h3 {
		margin: 0 0 var(--space-2);
		color: var(--text-2);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.caption {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
