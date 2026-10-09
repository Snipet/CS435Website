<!--
	The grammar of C-: the 29 rules of the language definition in BNF, and the
	EBNF the parser follows, with a link that opens the BNF in Context-Free
	Grammars.
-->
<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { CMINUS_BNF, CMINUS_EBNF } from '$lib/theory/cminus';
	import { scrollRegion } from '$lib/tools/phases/scroll-region';

	interface Props {
		/** Link that opens the BNF in the Context-Free Grammars tool; null hides it. */
		href: string | null;
		/** Heading level of the two titles. */
		level?: 3 | 4;
	}

	let { href, level = 4 }: Props = $props();

	const rules = CMINUS_BNF.split('\n');
</script>

<div class="grammar">
	<section class="cm-section">
		<svelte:element this={`h${level}`} class="cm-heading">
			BNF <span class="cm-sub">{rules.length} rules</span>
		</svelte:element>
		<div class="cm-code rules" {@attach scrollRegion('C- grammar in BNF')}>
			<ol>
				{#each rules as rule, i (i)}
					<li><code>{rule}</code></li>
				{/each}
			</ol>
		</div>
		{#if href}
			<p class="cm-note">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
				<a {href}>Open the BNF in Context-Free Grammars <Icon name="arrow-right" size={14} /></a>
			</p>
		{/if}
	</section>
	<section class="cm-section">
		<svelte:element this={`h${level}`} class="cm-heading">
			EBNF <span class="cm-sub">the grammar the parser follows</span>
		</svelte:element>
		<pre class="cm-code" {@attach scrollRegion('C- grammar in EBNF')}>{CMINUS_EBNF}</pre>
		<p class="cm-note">
			<code>&#123; α &#125;</code> is zero or more α and <code>[ α ]</code> is an optional α; the brackets
			and braces of C- itself are quoted. The left recursion of the BNF is written as repetition; the
			parser has one function per rule.
		</p>
	</section>
</div>

<style>
	.grammar {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		min-width: 0;
	}
	.rules ol {
		margin: 0;
		padding-left: 2.4em;
	}
	.rules li {
		padding-left: 0.4em;
		white-space: pre;
	}
	.rules li::marker {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
	.rules code {
		padding: 0;
		border: 0;
		background: none;
		font-size: inherit;
	}
	a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 500;
	}
</style>
