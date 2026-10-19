<!--
	The LR parsing algorithm (Bottom-up Parsing II, slide 21) step by step: the
	pseudocode with the line that runs, the input array I with the index j, the
	stack of pairs < sym, state > from < dummy, 0 >, the same configuration
	with the divider I of slides 4–14, the parse forest growing over the
	tokens, and the count of DFA transitions of slide 20.
-->
<script lang="ts">
	import { ParseTreeView, layoutTree, symbolText } from '$lib/components/grammar';
	import { Badge, StepControls, TextField, Updating, type Stepper } from '$lib/components/ui';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import type { LrParse } from '$lib/theory/grammar/lr-parse';
	import { frameConfiguration, frameForest, LR_CODE, type ParseFrame } from './parse-steps';
	import Pseudocode from './Pseudocode.svelte';

	interface Props {
		input: string;
		diagnostics: readonly Diagnostic[];
		parse: LrParse | null;
		frames: readonly ParseFrame[];
		stepper: Stepper;
		/** The parse shown is for an earlier input. */
		stale?: boolean;
		/** The table has conflicts: the parse follows the entries it keeps. */
		conflicts?: number;
		oninput?: () => void;
	}

	let {
		input = $bindable(),
		diagnostics,
		parse,
		frames,
		stepper,
		stale = false,
		conflicts = 0,
		oninput
	}: Props = $props();

	const frame = $derived(frames[stepper.index] ?? null);
	const error = $derived(diagnostics.find((d) => d.severity === 'error')?.message ?? '');
	const forest = $derived(parse && frame ? frameForest(parse, frame) : null);
	const config = $derived(parse && frame ? frameConfiguration(parse, frame) : null);
	const rows = $derived(
		parse?.tree ? layoutTree(parse.tree, { layout: 'baseline' }).rows : undefined
	);
	const markedTrees = $derived(frame ? frame.marked.filter((k) => k >= 0).map((k) => [k]) : []);
</script>

<div class="parse">
	<TextField
		label="Token string"
		description="Tokens separated by spaces; $ is added at the end (I = w $)."
		bind:value={input}
		mono
		{error}
		oninput={() => oninput?.()}
	/>

	{#if parse && frame}
		<div class={['body', { 'stale-data': stale }]} aria-busy={stale}>
			<div class="left">
				<Pseudocode
					lines={LR_CODE}
					active={frame.lines}
					label="The LR parsing algorithm, Bottom-up Parsing II, slide 21"
				/>
				<p class="count">
					<span class="what">DFA transitions so far</span>
					<span
						>rerunning the DFA over the stack after each action: <b>{frame.transitions.rerun}</b
						></span
					>
					<span>reading the state stored in the top pair: <b>{frame.transitions.stored}</b></span>
				</p>
			</div>
			<div class="right">
				<section aria-label="Input">
					<h3>I <span>j = {frame.j}</span></h3>
					<ol class="input">
						{#each parse.input as tok, i (i)}
							<li class={{ next: i === frame.j, read: i < frame.j }}>
								<span class="index">{i}</span>
								<span class="tok">{symbolText(tok)}</span>
								<span class="j" aria-hidden="true">{i === frame.j ? '↑ j' : ''}</span>
								{#if i === frame.j}<span class="visually-hidden">(I[j])</span>{/if}
							</li>
						{/each}
					</ol>
				</section>
				<section aria-label="Stack">
					<h3>stack <span>top on the right</span></h3>
					<ol class="stack">
						{#each frame.stack as pair, k (k)}
							{@const popping = k >= frame.stack.length - frame.popping}
							{@const pushed = frame.pushed && k === frame.stack.length - 1}
							<li class={{ popping, pushed }}>
								&lt; {pair.symbol === null ? 'dummy' : symbolText(pair.symbol)}, {pair.state} &gt;
								{#if popping}<span class="visually-hidden">(popped)</span>{/if}
								{#if pushed}<span class="visually-hidden">(pushed)</span>{/if}
							</li>
						{/each}
					</ol>
				</section>
				{#if config}
					<p class="config">
						{config.left}{config.left ? ' ' : ''}<span class="divider" aria-hidden="true">I</span
						><span class="visually-hidden">divider</span>{config.right ? ' ' : ''}{config.right}
					</p>
				{/if}
				{#if forest}
					<div class="forest">
						<ParseTreeView
							forest={forest.roots}
							marker={forest.marker}
							minRows={rows}
							highlight={frame.pushed ? { fresh: markedTrees } : { current: markedTrees }}
							ariaLabel="Parse forest"
						/>
					</div>
				{/if}
			</div>
		</div>
		<StepControls {stepper} ariaLabel="Parse steps">
			{#snippet label()}
				<p class="caption">
					{frame.text}
					{#if frame.phase === 'accept'}<Badge tone="accept">accept</Badge>{/if}
					{#if frame.phase === 'error'}<Badge tone="reject">error</Badge>{/if}
					{#if frame.phase === 'limit'}<Badge tone="reject">stopped</Badge>{/if}
				</p>
			{/snippet}
		</StepControls>
		{#if conflicts > 0}
			<p class="note">
				The table has {conflicts}
				{conflicts === 1 ? 'conflict' : 'conflicts'}; the parser follows the entries the table
				keeps.
			</p>
		{/if}
		{#if stale}<Updating />{/if}
	{:else if !error}
		<p class="note">The parse runs once the grammar and the token string have no errors.</p>
	{/if}
</div>

<style>
	.parse {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		min-width: 0;
	}
	@container (min-width: 820px) {
		.body {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		}
	}
	.left,
	.right {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	h3 {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	h3 span {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-weight: 400;
	}
	.count {
		display: flex;
		flex-direction: column;
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.count .what {
		color: var(--text-3);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.count b {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.input,
	.stack {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	.input li {
		display: grid;
		justify-items: center;
		min-width: 2.2rem;
		padding: 2px 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.input .index {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.input .j {
		min-height: 1.2em;
		color: var(--active);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.input li.read .tok {
		color: var(--text-3);
	}
	.input li.next {
		border-color: var(--active);
		background: var(--active-soft);
	}
	.stack li {
		padding: 2px 6px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		white-space: nowrap;
	}
	.stack li.popping {
		border-color: var(--reject);
		background: var(--reject-soft);
		text-decoration: line-through;
	}
	.stack li.pushed {
		border-color: var(--accept);
		background: var(--accept-soft);
	}
	.config {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-base);
		font-variant-ligatures: none;
		white-space: pre;
	}
	.divider {
		color: var(--reject);
		font-family: var(--font-sans);
		font-weight: 700;
	}
	.forest {
		min-width: 0;
	}
	.caption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
