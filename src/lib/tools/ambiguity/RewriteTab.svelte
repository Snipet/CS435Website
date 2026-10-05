<!--
	"Rewrite the grammar": a second grammar for the same string. Its trees are
	drawn next to the original grammar's trees, and an original tree whose
	operator structure no tree of the rewritten grammar has is crossed out.
-->
<script lang="ts">
	import { GrammarEditor, type TreeLabeler } from '$lib/components/grammar';
	import { Badge, Disclosure, Icon, type TaskStatus } from '$lib/components/ui';
	import CascadeBuilder from './CascadeBuilder.svelte';
	import CompareCheck from './CompareCheck.svelte';
	import type { CompareResult } from './compare';
	import Fact from './Fact.svelte';
	import { treeTone, type Listing, type RewriteAnalysis, type TreeEntry } from './model';
	import type { AmbiguityState } from './state';
	import TreeCard from './TreeCard.svelte';
	import Verdict from './Verdict.svelte';
	import { evaluationText } from './values';

	interface Props {
		model: AmbiguityState;
		/** The trees are for the last grammar and string without errors, not the ones typed now. */
		stale?: boolean;
		/** The original grammar's trees; null when there is nothing without errors to draw. */
		original: Listing | null;
		/** The rewritten grammar as typed: its diagnostics, and its symbols for the coloring. */
		typed: RewriteAnalysis;
		/** The rewritten grammar the trees are drawn for: `typed`, or the last one without errors. */
		rewrite: RewriteAnalysis;
		labels: TreeLabeler;
		/** The cascade builder is open. */
		builderOpen: boolean;
		compare: {
			result: CompareResult | null;
			stale: boolean;
			status: TaskStatus;
			error: string | null;
		};
		/** Links for the rewritten grammar: [text, href]. */
		links?: readonly (readonly [string, string])[];
	}

	let {
		model = $bindable(),
		stale = false,
		original,
		typed,
		rewrite,
		labels,
		builderOpen = $bindable(),
		compare,
		links = []
	}: Props = $props();

	const uid = $props.id();

	const drawn = (entry: TreeEntry) =>
		model.abbreviated && entry.abbreviated ? entry.abbreviated : entry.tree;

	/** The trees are for an earlier rewritten grammar: the one typed has errors. */
	const outdated = $derived(rewrite !== typed);
	const listing = $derived(rewrite.listing);
	const crossed = $derived(rewrite.matches.filter((m) => m === null).length);
	/** Width share of a group of cards: its number of trees, up to four. */
	const span = (n: number) => Math.max(1, Math.min(4, n));

	/** Slide 10: "int * int + int has only one parse tree now". */
	const onlyOneNow = $derived(
		listing?.trees.length === 1 &&
			!listing.truncated &&
			original !== null &&
			(original.trees.length > 1 || original.truncated)
			? 'The string has only one parse tree now.'
			: ''
	);

	const originalSummary = $derived.by(() => {
		if (!original || !listing) return '';
		const n = original.trees.length;
		if (n === 0) return 'The original grammar has no parse tree for the string.';
		if (crossed === 0)
			return n === 1
				? 'Its tree has the structure of a tree of the rewritten grammar.'
				: `All ${n} trees have the structure of a tree of the rewritten grammar.`;
		const which =
			n === 1 ? 'The tree is' : `${crossed} of the ${n} trees ${crossed === 1 ? 'is' : 'are'}`;
		return `${which} crossed out: no tree of the rewritten grammar has ${crossed === 1 ? 'its' : 'their'} structure.`;
	});
</script>

<div class="rewrite-tab">
	<div class="inputs">
		<div class="editor">
			<GrammarEditor
				label="Rewritten grammar"
				bind:value={model.rewrite}
				nonterminals={typed.grammar?.nonterminals}
				terminals={typed.grammar?.terminals}
				diagnostics={typed.diagnostics}
				minRows={4}
				maxRows={14}
				placeholder="E → …"
			/>
			{#if !typed.empty}
				<CompareCheck bind:maxLength={model.maxLength} {...compare} />
			{/if}
		</div>
		<div class="builder">
			<Disclosure variant="boxed" bind:open={builderOpen} summary="Precedence cascade">
				<CascadeBuilder
					bind:levels={model.levels}
					bind:atoms={model.atoms}
					current={model.rewrite}
					onuse={(text) => (model.rewrite = text)}
				/>
			</Disclosure>
		</div>
	</div>

	{#if outdated && !stale && rewrite.listing}
		<p class="stale-note" role="status">
			<Icon name="info" size={16} />
			<span>Showing the trees of the last rewritten grammar without errors.</span>
		</p>
	{/if}
	<div class={['results', { 'stale-data': stale || outdated }]} aria-busy={stale || outdated}>
		{#if rewrite.empty}
			<p class="empty">
				Enter a rewritten grammar, or build one with the precedence cascade and choose “Use as the
				rewritten grammar”. The trees of the string under it appear here, next to the trees of the
				original grammar.
			</p>
		{:else if !rewrite.grammar}
			<p class="empty">The trees appear once the rewritten grammar has no errors.</p>
		{:else if !original || !listing}
			<p class="empty">The trees appear once the grammar and the token string have no errors.</p>
		{:else}
			{#if rewrite.unknown.length}
				<p class="unknown">
					Not {rewrite.unknown.length === 1 ? 'a terminal' : 'terminals'} of the rewritten grammar:
					{#each rewrite.unknown as symbol, i (symbol)}{i > 0 ? ', ' : ''}<code>{symbol}</code
						>{/each}
				</p>
			{/if}
			<div class="groups">
				<section
					class="group"
					style="--n: {span(listing.trees.length)}"
					aria-labelledby="{uid}-new"
				>
					<header class="group-head">
						<h3 id="{uid}-new">Rewritten grammar</h3>
						<Verdict {listing} what="the rewritten grammar" more={onlyOneNow} />
					</header>
					{#if listing.trees.length}
						<div class="cards">
							{#each listing.trees as entry (entry.number)}
								{@const origin = rewrite.origins[entry.number - 1]}
								{@const value = entry.value ? evaluationText(entry.value) : null}
								<TreeCard
									title="Tree {entry.number}"
									grouping={entry.grouping}
									tree={drawn(entry)}
									tone={treeTone(origin ?? entry.number)}
									{labels}
									level={4}
								>
									<Fact label="Bracket form" mono>{entry.bracket}</Fact>
									{#if value}<Fact label="Value" mono>{value}</Fact>{/if}
									{#if origin === null}
										<p class="why">No tree of the original grammar has this structure.</p>
									{/if}
								</TreeCard>
							{/each}
						</div>
						{#if listing.truncated}<p class="more">… and more trees.</p>{/if}
					{/if}
				</section>

				<section
					class="group"
					style="--n: {span(original.trees.length)}"
					aria-labelledby="{uid}-old"
				>
					<header class="group-head">
						<h3 id="{uid}-old">Original grammar</h3>
						<p class="summary" role="status">{originalSummary}</p>
					</header>
					<div class="cards">
						{#each original.trees as entry (entry.number)}
							{@const match = rewrite.matches[entry.number - 1]}
							<TreeCard
								title="Tree {entry.number}"
								grouping={entry.grouping}
								tree={drawn(entry)}
								tone={treeTone(entry.number)}
								{labels}
								rejected={match === null}
								level={4}
							>
								{#snippet status()}
									{#if match === null}
										<Badge tone="reject">Crossed out</Badge>
									{:else}
										<Badge tone="accept">Kept</Badge>
									{/if}
								{/snippet}
								<p class="why">
									{#if match === null}
										No tree of the rewritten grammar has this structure.
									{:else}
										Same structure as tree {match} of the rewritten grammar.
									{/if}
								</p>
							</TreeCard>
						{/each}
					</div>
					{#if original.truncated}<p class="more">… and more trees.</p>{/if}
				</section>
			</div>
			{#if links.length}
				<p class="links">
					{#each links as [text, href] (href)}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
						<a {href}>{text}</a>
					{/each}
				</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.rewrite-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.inputs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-5);
		align-items: start;
	}
	@media (min-width: 960px) {
		.inputs {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.builder {
		min-width: 0;
	}
	.results {
		min-width: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 calc(-1 * var(--space-2));
		color: var(--text-2);
		font-size: var(--text-sm);
		/* After a pause, so typing through a moment with errors does not flash it. */
		animation: appear var(--duration) var(--ease) 250ms both;
	}
	.stale-note :global(.icon) {
		flex: none;
		color: var(--info);
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
	}
	.empty {
		max-width: var(--content-width);
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.unknown {
		margin: 0 0 var(--space-3);
		color: var(--reject);
		font-size: var(--text-sm);
	}
	.groups {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-5);
		min-width: 0;
	}
	.group {
		display: flex;
		flex: var(--n) 1 calc(var(--n) * 15rem);
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.group-head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--text-sm);
	}
	h3 {
		margin: 0;
		font-size: 1.0625rem;
	}
	.summary {
		margin: 0;
		color: var(--text-2);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3);
		min-width: 0;
	}
	.why {
		margin: 0;
		color: var(--text-2);
	}
	.more {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: var(--space-4) 0 0;
		font-size: var(--text-sm);
	}
</style>
