<!--
@component
Every computation path of an NFA on the input as an indented tree
(`pathTree`): each branch is one choice; paths that accept and paths that
end without accepting are marked.
-->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatString, showChar } from '$lib/theory/chars';
	import type { PathNode } from '$lib/theory/automata/simulate';
	import type { Automaton } from '$lib/theory/automata/types';
	import { stateName } from './model';

	interface Props {
		automaton: Automaton;
		root: PathNode;
		input: string;
		truncated: boolean;
	}

	let { automaton, root, input, truncated }: Props = $props();

	/** Label of the step into `n`: ε, or the symbol it read (the last one read so far). */
	function via(n: PathNode): string {
		if (n.via === undefined) return '';
		if (automaton.transitions[n.via]?.label === null) return 'ε';
		const last = [...input.slice(0, n.pos)].pop();
		return last === undefined ? '' : showChar(last, 'label');
	}

	const counts = $derived.by(() => {
		let accepting = 0;
		let dead = 0;
		const walk = (n: PathNode) => {
			if (n.accepting) accepting++;
			if (n.dead) dead++;
			n.children.forEach(walk);
		};
		walk(root);
		return { accepting, dead };
	});
</script>

{#snippet node(n: PathNode)}
	<div class="row">
		{#if n.via !== undefined}
			<span class="arrow">→<sup class:eps={via(n) === 'ε'}>{via(n)}</sup></span>
		{/if}
		<span class="state">{stateName(automaton, n.state)}</span>
		<span class="read" title="Input read so far">{formatString(input.slice(0, n.pos))}</span>
		{#if n.accepting}
			<Badge tone="accept" variant="soft">accepts</Badge>
		{:else if n.dead}
			<Badge variant="soft">dead end</Badge>
		{/if}
	</div>
	{#if n.children.length}
		<ul>
			{#each n.children as child, i (i)}
				<li>{@render node(child)}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="paths">
	<p class="summary">
		{counts.accepting === 0
			? 'No path accepts.'
			: counts.accepting === 1
				? 'One path accepts.'
				: `${counts.accepting} paths accept.`}
		{counts.dead === 1 ? ' One path ends without accepting.' : ''}{counts.dead > 1
			? ` ${counts.dead} paths end without accepting.`
			: ''}
	</p>
	<div class="tree-scroll">
		<ul class="tree root">
			<li>{@render node(root)}</li>
		</ul>
	</div>
	{#if truncated}
		<p class="note">The tree is cut off after 300 nodes.</p>
	{/if}
</div>

<style>
	.paths {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.summary,
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.note {
		color: var(--text-3);
	}
	.tree-scroll {
		max-height: 22rem;
		overflow: auto;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	ul {
		margin: 0;
		padding: 0 0 0 1.1rem;
		list-style: none;
	}
	.tree.root {
		padding-left: 0;
	}
	li {
		position: relative;
	}
	ul ul > li::before {
		content: '';
		position: absolute;
		left: -0.75rem;
		top: 0;
		bottom: 0;
		border-left: 1px solid var(--border-strong);
	}
	ul ul > li:last-child::before {
		bottom: auto;
		height: 0.9rem;
	}
	ul ul > li::after {
		content: '';
		position: absolute;
		left: -0.75rem;
		top: 0.9rem;
		width: 0.55rem;
		border-top: 1px solid var(--border-strong);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 1.8rem;
		white-space: nowrap;
		font-size: var(--text-sm);
	}
	.arrow {
		color: var(--text-3);
		font-family: var(--font-mono);
	}
	sup {
		font-size: 0.75em;
	}
	sup.eps {
		color: var(--epsilon);
	}
	.state {
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.read {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
</style>
