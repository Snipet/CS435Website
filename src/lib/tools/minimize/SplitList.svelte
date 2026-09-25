<!--
@component
Why the blocks of one round split: for each new part, the symbol its first
state disagrees on with the first state of the block, the two transitions, and
a string that tells the two states apart.
-->
<script lang="ts">
	import type { CharSet } from '$lib/theory/charset';
	import type { StateId } from '$lib/theory/automata';
	import { formatString } from '$lib/theory/chars';
	import BlockChip from './BlockChip.svelte';
	import PathText from './PathText.svelte';
	import {
		blockTone,
		setText,
		type RefinementView,
		type RoundView,
		type SplitReason
	} from './refinement';

	interface Props {
		view: RefinementView;
		round: RoundView;
		name: (s: StateId) => string;
		classText: (c: CharSet) => string;
		/** Accepting states with different tokens start apart. */
		byToken: boolean;
	}

	let { view, round, name, classText, byToken }: Props = $props();

	const setOf = (id: number) => {
		const b = round.partition.blocks.find((x) => x.id === id);
		return setText((b?.states ?? []).map(name));
	};
	const accepting = (s: StateId) => view.input.states[s].accepting;
	const tokenOf = (s: StateId) => view.input.states[s].accept?.token;
	const final = $derived(round.splits.length === 0);
</script>

{#snippet outcome(r: SplitReason)}
	{@const pa = accepting(r.pEnd)}
	{@const qa = accepting(r.qEnd)}
	{#if pa && qa}
		accepted from both, reporting <span class="f">{tokenOf(r.pEnd) ?? '—'}</span> from
		<span class="f">{name(r.p)}</span>
		and <span class="f">{tokenOf(r.qEnd) ?? '—'}</span> from <span class="f">{name(r.q)}</span>
	{:else}
		accepted from <span class="f">{name(pa ? r.p : r.q)}</span>, not from
		<span class="f">{name(pa ? r.q : r.p)}</span>
	{/if}
{/snippet}

{#if round.index === 0}
	<p class="note">
		The empty string <span class="f">""</span> tells an accepting state from a non-accepting one, so
		they start in different blocks.{#if view.hasTokens && byToken}
			Accepting states that report different tokens start apart too.{/if}
	</p>
{:else if final}
	<p class="note">
		No block splits: within each block, every state goes to the same blocks on every symbol. P<sub
			>{round.index}</sub
		>
		is final, and each block
		{#if view.droppedTrap}
			except block <BlockChip
				id={view.droppedTrap.id}
				tone={view.droppedTrap.tone}
				prefix={false}
			/>, which holds only the trap,
		{/if}
		becomes one state of the minimal DFA.
	</p>
{:else}
	<ul class="splits">
		{#each round.splits as split, i (i)}
			<li class="split">
				<p class="split-head">
					Block <BlockChip id={split.block?.id ?? 0} tone={split.block?.tone ?? 0} prefix={false} />
					splits into
					{#each split.parts as id, j (id)}{#if j > 0}<span class="sep"
								>{j === split.parts.length - 1 ? ' and ' : ', '}</span
							>{/if}<span class="part"
							><BlockChip {id} tone={blockTone(id)} /> <span class="f">{setOf(id)}</span></span
						>{/each}
				</p>
				<ul class="reasons">
					{#each split.reasons as r (r.part)}
						{@const a = r.symbol ? classText(r.symbol) : ''}
						<li>
							<span class="f">{name(r.p)}</span> and <span class="f">{name(r.q)}</span> split on
							<span class="f">{a}</span>:
							{#if r.pTo !== null && r.qTo !== null && r.pToBlock !== null && r.qToBlock !== null}
								<PathText states={[name(r.p), name(r.pTo)]} symbols={[a]} />
								(<BlockChip id={r.pToBlock} tone={blockTone(r.pToBlock)} />) but
								<PathText states={[name(r.q), name(r.qTo)]} symbols={[a]} />
								(<BlockChip id={r.qToBlock} tone={blockTone(r.qToBlock)} />);
							{/if}
							distinguishing string <span class="f w">{formatString(r.witness)}</span>,
							{@render outcome(r)}.
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		overflow-wrap: break-word;
	}
	.w {
		padding: 0 0.3em;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		/* Spaces stay visible; a long string wraps instead of widening the page. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.splits {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.split-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.part {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 400;
	}
	.sep {
		white-space: pre;
	}
	.reasons {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0 0 0 var(--space-4);
		border-left: 2px solid var(--border);
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.9;
	}
	.reasons li {
		padding-left: var(--space-2);
	}
</style>
