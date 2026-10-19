<!--
	One conflict of the LR(1) table (Bottom-up Parsing III, slides 16–25): its
	state, terminal and kind, the two items in the deck's template, the ⇒ view
	of the state before and the conflict's state, the stack when it arises and
	where each action leads, how it is settled, and the action the other parse
	puts in its entry.
-->
<script lang="ts">
	import { LrItem } from '$lib/components/grammar';
	import { Badge, Button, SegmentedControl } from '$lib/components/ui';
	import { printSymbols } from '$lib/theory/grammar/parse';
	import type { ConflictView } from './analysis';
	import Configuration from './Configuration.svelte';
	import type { PrecedenceLine } from './precedence';
	import ResolutionView from './ResolutionView.svelte';
	import type { ItemsView } from './state';
	import TransitionView from './TransitionView.svelte';
	import { choiceOptions, entryText, resolutionLabel } from './view';

	interface Props {
		conflict: ConflictView;
		mode: ItemsView;
		lines: readonly PrecedenceLine[];
		/** The action the other parse uses for this entry: 0, 1, or 2 for an error entry. */
		choice: 0 | 1 | 2;
		onchoose: (value: 0 | 1 | 2) => void;
		/** Shows this conflict's state in Parser.output. */
		onshowstate?: (state: number) => void;
	}

	let { conflict, mode, lines, choice, onchoose, onshowstate }: Props = $props();

	const uid = $props.id();
	const label = $derived(resolutionLabel(conflict));
	const winner = $derived(conflict.explanation.winner);
	const terminal = $derived(printSymbols([conflict.terminal]));
	const entry = $derived(entryText(conflict.state, conflict.terminal));
	const options = $derived(choiceOptions(conflict));
	/** Between the two items; the spaces keep them apart when read aloud. */
	const AND = ' and ';
</script>

<article class="conflict" aria-labelledby="{uid}-title">
	<header>
		<h3 id="{uid}-title">State {conflict.state} on <span class="f">{terminal}</span></h3>
		<Badge tone={conflict.kind === 'shift/reduce' ? 'info' : 'reject'}>{conflict.kind}</Badge>
		<Badge tone={label.tone} variant="outline">{label.text}</Badge>
	</header>

	<p class="template">
		<LrItem item={conflict.items[0]} /><span>{AND}</span><LrItem item={conflict.items[1]} />
	</p>

	<TransitionView context={conflict.context} state={conflict.state} {mode} />

	<section class="moves" aria-label="Stack and moves">
		<p class="stack">
			<span class="label">Stack</span>
			<Configuration stack={conflict.context.stack} next={conflict.terminal} />
		</p>
		<ul>
			{#each conflict.moves as move, i (i)}
				<li class={{ taken: winner === i }}>
					<span class="action">{move.text}</span>
					<span class="becomes" aria-hidden="true">⇒</span>
					<span class="visually-hidden">leads to</span>
					<Configuration stack={move.stack} next={move.next} />
					{#if winner === i}<Badge tone="accept">taken</Badge>{/if}
				</li>
			{/each}
			{#if winner === 'error'}
				<li class="taken">
					<span class="action">error</span>
					<span class="note">neither: the entry is an error</span>
					<Badge tone="accept">taken</Badge>
				</li>
			{/if}
		</ul>
	</section>

	<ResolutionView explanation={conflict.explanation} {lines} />

	<footer>
		<div class="choice">
			<SegmentedControl
				label="{entry} in the other parse"
				showLabel
				size="sm"
				mono
				{options}
				value={choice}
				onchange={(v) => onchoose(v)}
			/>
		</div>
		<p class="used">
			{#if conflict.used === null}
				Type a token string below to see whether its parse looks up {entry}.
			{:else if conflict.used}
				The parse of the token string looks up {entry}.
			{:else}
				The parse of the token string does not look up {entry}.
			{/if}
		</p>
		{#if onshowstate}
			<Button size="sm" variant="ghost" onclick={() => onshowstate(conflict.bisonState)}>
				Parser.output state {conflict.bisonState}
			</Button>
		{/if}
	</footer>
</article>

<style>
	.conflict {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	h3 {
		margin: 0 var(--space-1) 0 0;
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: 0;
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	/* Each item stays on one line; the line breaks between them, and a long item scrolls. */
	.template {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px var(--space-2);
		margin: 0;
		position: relative;
		overflow-x: auto;
		font-size: var(--text-sm);
		scrollbar-width: thin;
	}
	.moves {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}
	.stack {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
	}
	.label {
		color: var(--text-2);
	}
	.moves ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.moves li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px var(--space-2);
		padding: 2px 8px;
		border-left: 3px solid var(--border);
		color: var(--text-2);
	}
	.moves li.taken {
		border-left-color: var(--accept);
		color: var(--text);
	}
	.action {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.becomes {
		font-family: var(--font-sans);
		font-size: 1.2em;
		line-height: 1;
	}
	.note {
		color: var(--text-2);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	/* A long reduction (C-'s) scrolls rather than widening the card. */
	.choice {
		position: relative;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.used {
		flex: 1 1 14rem;
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
</style>
