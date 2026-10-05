<!--
	The grammar as the slides print it beside the tree, one non-terminal per
	line, with the alternative being tried marked (red on slides 5–13). While a
	terminal is compared, the alternative it belongs to is underlined (slide 9
	keeps it red).
-->
<script lang="ts">
	import { printSymbols } from '$lib/theory/grammar/parse';
	import { EPSILON, type Grammar, type Production } from '$lib/theory/grammar/types';

	interface Props {
		grammar: Grammar;
		/** Id of the production to mark, or null. */
		active?: number | null;
		/** What the mark means, for screen readers and as a tooltip: "being tried". */
		activeLabel?: string;
		/** Id of a production to underline, or null. */
		context?: number | null;
		/** What the underline means. */
		contextLabel?: string;
		ariaLabel?: string;
	}

	let {
		grammar,
		active = null,
		activeLabel = 'being tried',
		context = null,
		contextLabel = 'the terminal being compared is in this alternative',
		ariaLabel = 'Grammar'
	}: Props = $props();

	const isNonterminal = $derived(new Set(grammar.nonterminals));

	/** Neighbouring productions of one non-terminal share a line, as printGrammar writes them. */
	const rules = $derived.by(() => {
		const out: { lhs: string; alternatives: Production[] }[] = [];
		for (const p of grammar.productions) {
			const last = out[out.length - 1];
			if (last && last.lhs === p.lhs) last.alternatives.push(p);
			else out.push({ lhs: p.lhs, alternatives: [p] });
		}
		return out;
	});

	const noteOf = (id: number): string | undefined =>
		id === active ? activeLabel : id === context ? contextLabel : undefined;
</script>

<div class="grammar-view" role="group" aria-label={ariaLabel}>
	{#each rules as rule, r (r)}
		<div class="rule">
			<span class="lhs hl-name">{printSymbols([rule.lhs])}</span>
			<span class="meta hl-operator">→</span>
			{#each rule.alternatives as p, k (p.id)}
				{@const note = noteOf(p.id)}
				{#if k > 0}<span class="meta hl-operator">|</span>{/if}
				<span
					class={['alt', { active: p.id === active, context: p.id === context && p.id !== active }]}
					title={note}
				>
					{#if p.rhs.length === 0}
						<span class="hl-special">{EPSILON}</span>
					{:else}
						{#each p.rhs as symbol, i (i)}
							<span class={isNonterminal.has(symbol) ? 'hl-name' : undefined}
								>{printSymbols([symbol])}</span
							>
						{/each}
					{/if}
					{#if note}<span class="visually-hidden">({note})</span>{/if}
				</span>
			{/each}
		</div>
	{/each}
</div>

<style>
	.grammar-view {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 1.0625rem;
		font-variant-ligatures: none;
		line-height: 1.5;
	}
	.rule {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 0.55em;
		min-width: 0;
	}
	.alt {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0 0.5em;
		margin: 0 -0.3em;
		padding: 1px 0.3em;
		border-radius: var(--radius-sm);
		box-shadow: inset 0 -2px 0 transparent;
		transition:
			background var(--duration) var(--ease),
			box-shadow var(--duration) var(--ease);
	}
	.alt.active {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
		font-weight: 650;
	}
	.alt.context {
		box-shadow: inset 0 -2px 0 var(--active);
	}
</style>
