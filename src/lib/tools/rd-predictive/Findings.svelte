<!--
	What stands between the grammar as written and prediction: its
	left-recursive non-terminals, each with the derivation V →+ V α and the
	productions it uses, and the alternatives that share a prefix.
-->
<script lang="ts">
	import { DerivationChain } from '$lib/components/grammar';
	import { Badge } from '$lib/components/ui';
	import type { PrefixFinding, RecursionFinding } from './transform';

	interface Props {
		recursion: readonly RecursionFinding[];
		prefixes: readonly PrefixFinding[];
		nonterminals: readonly string[];
	}

	let { recursion, prefixes, nonterminals }: Props = $props();

	const list = (parts: readonly string[]) =>
		new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);
</script>

{#if recursion.length === 0 && prefixes.length === 0}
	<p class="none">No left recursion, and no alternatives with a common prefix.</p>
{:else}
	<ul class="findings" aria-label="Findings">
		{#each recursion as found (found.nonterminal)}
			{@const [from, to] = found.summary.split(' →+ ')}
			<li>
				<div class="head">
					<Badge tone="reject">Left recursion</Badge>
					<span class="claim">{from} →<sup>+</sup> {to}</span>
				</div>
				<div class="body">
					<DerivationChain
						forms={found.forms}
						steps={found.steps}
						{nonterminals}
						ariaLabel="Derivation {found.summary}"
					/>
					<p class="how">
						{found.immediate ? 'By the production' : 'By the productions'}
						{#each found.productions as p, i (i)}{i > 0 ? ', ' : ''}<code>{p}</code
							>{/each}{found.immediate
							? ''
							: ': no single production starts with its own left-hand side'}.
					</p>
				</div>
			</li>
		{/each}
		{#each prefixes as found, i (i)}
			<li>
				<div class="head">
					<Badge tone="active">Common prefix</Badge>
					<span class="claim">{found.prefix.join(' ')}</span>
				</div>
				<div class="body">
					<p class="how">
						{#each found.productions as p, k (k)}{#if k > 0}{k === found.productions.length - 1
									? ' and '
									: ', '}{/if}<code>{p}</code>{/each}
						start with <code>{list(found.prefix)}</code>{found.optional
							? ', and one of them is the prefix alone'
							: ''}.
					</p>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.none {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.findings {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}
	.claim {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-weight: 600;
	}
	.claim sup {
		font-size: 0.7em;
		line-height: 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		margin-top: var(--space-2);
		padding-left: var(--space-3);
		border-left: 2px solid var(--border);
	}
	.how {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
</style>
