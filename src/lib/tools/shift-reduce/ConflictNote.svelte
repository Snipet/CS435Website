<!--
	The conflicts of the LR(1) table (Bottom-up Parsing III, slides 16 and 23),
	each with its two items, and the action the table holds for it: bison's
	default, which the parse follows.
-->
<script lang="ts">
	import { LrItem, symbolText } from '$lib/components/grammar';
	import { Callout } from '$lib/components/ui';
	import type { ConflictView } from './model';

	interface Props {
		conflicts: readonly ConflictView[];
		/** The conflicts tool on this grammar, with its title. */
		link?: { href: string; title: string } | null;
	}

	let { conflicts, link = null }: Props = $props();

	/** Conflicts listed before the rest are counted. */
	const LIMIT = 4;

	const count = (kind: ConflictView['kind']) => conflicts.filter((c) => c.kind === kind).length;
	const title = $derived.by(() => {
		const parts = [
			[count('shift/reduce'), 'shift/reduce'],
			[count('reduce/reduce'), 'reduce/reduce']
		]
			.filter(([n]) => n)
			.map(([n, kind]) => `${n} ${kind}`);
		const total = conflicts.length;
		return `The LR(1) table has ${total} ${total === 1 ? 'conflict' : 'conflicts'} (${parts.join(', ')})`;
	});
</script>

<Callout tone="warn" {title}>
	<ul class="conflicts">
		{#each conflicts.slice(0, LIMIT) as c, i (i)}
			<li>
				State {c.state} on <span class="mono">{symbolText(c.terminal)}</span>, {c.kind}:
				<LrItem item={c.items[0]} /> and <LrItem item={c.items[1]} />. The table holds
				<span class="mono">{c.chosen}</span>.
			</li>
		{/each}
	</ul>
	{#if conflicts.length > LIMIT}
		<p class="more">… and {conflicts.length - LIMIT} more.</p>
	{/if}
	<p>
		The parse follows bison's defaults: a shift/reduce conflict is settled with the shift, a
		reduce/reduce conflict with the rule written first.
		{#if link}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
			<a href={link.href}>Open the grammar in {link.title}</a> to settle them with precedence declarations.
		{/if}
	</p>
</Callout>

<style>
	.conflicts {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0 0 var(--space-2);
		padding-left: 1.2em;
		line-height: 1.6;
	}
	/* An item breaks onto the next line whole; only one wider than the line wraps inside. */
	.conflicts :global(.lr-item) {
		display: inline-block;
		max-width: 100%;
		white-space: normal;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.more {
		margin: 0 0 var(--space-2);
		color: var(--text-3);
	}
</style>
