<!--
	"Declarations": bison's %left, %right and %nonassoc lines, lowest precedence
	first, and the original grammar's trees with the ones they rule out crossed
	out (declarations.ts).
-->
<script lang="ts">
	import type { TreeHighlight, TreeLabeler } from '$lib/components/grammar';
	import { Badge, Button, Icon, IconButton, Select, TextField } from '$lib/components/ui';
	import { printDeclaration, type Assoc } from './declarations';
	import {
		declarationSummary,
		selectedTree,
		shownText,
		treeTitle,
		treeTone,
		type DeclarationAnalysis,
		type Listing,
		type TreeEntry
	} from './model';
	import { MAX_DECLARATIONS, type AmbiguityState } from './state';
	import TreeCard from './TreeCard.svelte';

	interface Props {
		model: AmbiguityState;
		/** The trees are for the last grammar and string without errors, not the ones typed now. */
		stale?: boolean;
		/** The grammar's trees; null when there is nothing without errors to draw. */
		original: Listing | null;
		analysis: DeclarationAnalysis | null;
		labels: TreeLabeler;
	}

	let { model = $bindable(), stale = false, original, analysis, labels }: Props = $props();

	const uid = $props.id();

	const ASSOC: readonly { value: Assoc; label: string }[] = [
		{ value: 'left', label: '%left' },
		{ value: 'right', label: '%right' },
		{ value: 'nonassoc', label: '%nonassoc' }
	];

	function move(i: number, by: -1 | 1) {
		const j = i + by;
		if (j < 0 || j >= model.decls.length) return;
		const next = [...model.decls];
		[next[i], next[j]] = [next[j], next[i]];
		model.decls = next;
	}

	function remove(i: number) {
		model.decls = model.decls.filter((_, k) => k !== i);
	}

	function add() {
		if (model.decls.length >= MAX_DECLARATIONS) return;
		// Suggest the first operator of the grammar that has no declaration yet.
		const next = analysis?.undeclared[0] ?? '';
		model.decls = [...model.decls, { assoc: 'left', ops: next }];
	}

	const drawn = (entry: TreeEntry) =>
		model.abbreviated && entry.abbreviated ? entry.abbreviated : entry.tree;

	/** The two operators of each violation, marked in the full tree. */
	function marks(index: number): TreeHighlight | undefined {
		if (model.abbreviated || !analysis) return undefined;
		const current = (analysis.violations[index] ?? []).flatMap((v) => v.marks);
		return current.length ? { current } : undefined;
	}

	const summary = $derived(
		original && analysis ? declarationSummary(original, analysis, model.decls.length) : ''
	);
	const selected = $derived(original && analysis ? selectedTree(original, analysis) : -1);
	/** Declarations say something about a tree only under a grammar they apply to. */
	const applied = $derived(
		model.decls.length > 0 && analysis !== null && analysis.operators.length > 0
	);
</script>

<div class="declarations-tab">
	<section class="lines" aria-labelledby="{uid}-title">
		<h3 id="{uid}-title">Declarations</h3>
		<p class="hint">
			One per line, lowest precedence first: operators on a later line bind tighter, as in bison.
			The operators of a line are separated by spaces and share a precedence. Declarations apply to
			productions of the form
			<span class="formal">A → A op A</span>.
		</p>
		{#if model.decls.length}
			<ol aria-label="Declaration lines, lowest precedence first">
				{#each model.decls as decl, i (i)}
					<li>
						<span class="number" aria-hidden="true">{i + 1}</span>
						<Select
							label="Line {i + 1}: associativity"
							hideLabel
							size="sm"
							options={ASSOC}
							bind:value={decl.assoc}
						/>
						<TextField
							label="Line {i + 1}: operators"
							hideLabel
							mono
							size="sm"
							bind:value={decl.ops}
							placeholder="+ -"
							spellcheck="false"
						/>
						<span class="row-actions">
							<IconButton
								label="Move line {i + 1} up (lower precedence)"
								icon="chevron-up"
								size="sm"
								disabled={i === 0}
								onclick={() => move(i, -1)}
							/>
							<IconButton
								label="Move line {i + 1} down (higher precedence)"
								icon="chevron-down"
								size="sm"
								disabled={i === model.decls.length - 1}
								onclick={() => move(i, 1)}
							/>
							<IconButton
								label="Remove line {i + 1}"
								icon="x"
								size="sm"
								onclick={() => remove(i)}
							/>
						</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="none">No declarations.</p>
		{/if}
		<div class="add">
			<Button size="sm" onclick={add} disabled={model.decls.length >= MAX_DECLARATIONS}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				Add declaration
			</Button>
		</div>
		{#if model.decls.length}
			<div class="bison">
				<span class="bison-label" id="{uid}-bison">As bison reads them</span>
				<pre aria-labelledby="{uid}-bison">{model.decls.map(printDeclaration).join('\n')}</pre>
			</div>
		{/if}
		{#if analysis?.problems.length}
			<ul class="problems">
				{#each analysis.problems as problem (problem)}
					<li>{problem}</li>
				{/each}
			</ul>
		{/if}
		{#if analysis && model.decls.length > 0 && analysis.undeclared.length}
			<p class="hint">
				No declaration for
				{#each analysis.undeclared as op, i (op)}{i > 0 ? ', ' : ''}<code>{op}</code>{/each}: trees
				that differ only in how {analysis.undeclared.length === 1 ? 'it groups' : 'they group'} are all
				kept.
			</p>
		{/if}
		<p class="hint">
			The slides use <code>%left</code>; <code>%right</code> and <code>%nonassoc</code> are bison’s other
			two declarations.
		</p>
	</section>

	<section
		class={['outcome', { 'stale-data': stale }]}
		aria-labelledby="{uid}-trees"
		aria-busy={stale}
	>
		<h3 id="{uid}-trees">Trees of the grammar</h3>
		{#if !original || !analysis}
			<p class="empty">The trees appear once the grammar and the token string have no errors.</p>
		{:else}
			<p class="summary" role="status">{summary}</p>
			<div class="cards">
				{#each analysis.trees as entry, i (entry.bracket)}
					{@const why = analysis.reasons[i] ?? []}
					<TreeCard
						title={treeTitle(entry)}
						grouping={entry.grouping}
						tree={drawn(entry)}
						tone={treeTone(entry.number)}
						{labels}
						rejected={why.length > 0}
						highlight={marks(i)}
						level={4}
					>
						{#snippet status()}
							{#if why.length > 0}
								<Badge tone="reject">Crossed out</Badge>
							{:else if i === selected}
								<Badge tone="accept">Selected</Badge>
							{:else if applied}
								<Badge tone="accept">Kept</Badge>
							{/if}
						{/snippet}
						{#if why.length > 0}
							<ul class="reasons">
								{#each why as reason (reason)}
									<li>{reason}.</li>
								{/each}
							</ul>
						{:else if i === selected}
							<p class="why">The declarations allow only this tree.</p>
						{:else if applied}
							<p class="why">The declarations allow this tree.</p>
						{/if}
					</TreeCard>
				{/each}
			</div>
			{#if original.truncated}
				<p class="more">{shownText(original, analysis.trees.length)}</p>
			{/if}
		{/if}
	</section>
</div>

<style>
	.declarations-tab {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 960px) {
		.declarations-tab {
			grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
		}
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: 1.0625rem;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	.formal {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	ol {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	ol > li {
		display: grid;
		grid-template-columns: 1.1em auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.number {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	ol :global(select) {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.row-actions {
		display: inline-flex;
		gap: 2px;
	}
	.bison {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.bison-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.bison pre {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		color: var(--syn-keyword);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.none,
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.problems li::marker {
		color: var(--active);
	}
	.summary {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
		gap: var(--space-3);
		min-width: 0;
	}
	.reasons {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.reasons li + li {
		margin-top: var(--space-1);
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
	/* Phones: the operators get the full width under the declaration. */
	@media (max-width: 420px) {
		ol > li {
			grid-template-columns: 1.1em auto minmax(0, 1fr);
			grid-template-areas:
				'n assoc actions'
				'n ops ops';
		}
		ol > li > :global(:nth-child(1)) {
			grid-area: n;
			align-self: start;
			padding-top: 6px;
		}
		ol > li > :global(:nth-child(2)) {
			grid-area: assoc;
		}
		ol > li > :global(:nth-child(3)) {
			grid-area: ops;
		}
		ol > li > :global(:nth-child(4)) {
			grid-area: actions;
			justify-self: end;
		}
	}
</style>
