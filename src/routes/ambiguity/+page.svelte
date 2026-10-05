<script lang="ts">
	import { untrack } from 'svelte';
	import { DerivationChain, GrammarEditor, TokenStream } from '$lib/components/grammar';
	import {
		CitationTag,
		Disclosure,
		Icon,
		Panel,
		PresetMenu,
		Tabs,
		TextField,
		Toggle,
		ToolPage,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import type { Citation } from '$lib/lectures';
	import { tool } from '$lib/tools/catalog/ambiguity';
	import {
		compareTexts,
		sameRequest,
		type CompareRequest,
		type CompareResult
	} from '$lib/tools/ambiguity/compare';
	import { binaryOperators } from '$lib/tools/ambiguity/declarations';
	import DeclarationsTab from '$lib/tools/ambiguity/DeclarationsTab.svelte';
	import Fact from '$lib/tools/ambiguity/Fact.svelte';
	import {
		analyzeDeclarations,
		analyzeRewrite,
		leafLabeler,
		leftmostChain,
		listTrees,
		listedText,
		readSource,
		stringText,
		treeTitle,
		treeTone,
		type Listing,
		type Source,
		type TreeEntry
	} from '$lib/tools/ambiguity/model';
	import PrecedenceTable from '$lib/tools/ambiguity/PrecedenceTable.svelte';
	import PresetNote from '$lib/tools/ambiguity/PresetNote.svelte';
	import {
		DEFAULT_PRESET_ID,
		DEFAULT_STATE,
		presetFor,
		presets
	} from '$lib/tools/ambiguity/presets';
	import RewriteTab from '$lib/tools/ambiguity/RewriteTab.svelte';
	import { operandTerminals } from '$lib/tools/ambiguity/shape';
	import {
		derivationShown,
		flipDerivation,
		isAmbiguityHash,
		stateFromHash,
		type AmbiguityHash,
		type AmbiguityState,
		type TabId
	} from '$lib/tools/ambiguity/state';
	import TreeCard from '$lib/tools/ambiguity/TreeCard.svelte';
	import Verdict from '$lib/tools/ambiguity/Verdict.svelte';
	import { evaluationText } from '$lib/tools/ambiguity/values';
	import { createCompareWorker } from '$lib/tools/ambiguity/worker';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';

	/** "A grammar is ambiguous if it has more than one parse tree for some string." */
	const DEFINITION: Citation = { deck: '10', slide: 6 };

	let model = $state<AmbiguityState>(stateFromHash(DEFAULT_STATE));
	/** The cascade builder is open: at first for grammars with productions A → A op A. */
	let builderOpen = $state(true);
	/** The preset loaded last (or the one a loaded link is), shown for as long as it fits the state. */
	let loaded = $state<string | null>(DEFAULT_PRESET_ID);

	/** A grammar and a string without errors, with the string's trees. */
	interface Shown {
		source: Source;
		original: Listing;
	}
	/** The last one, drawn faded while the grammar or the string has errors (often mid-typing). */
	let lastGood: Shown | null = null;
	/** The last rewritten grammar without errors, drawn the same way. */
	let lastRewrite = '';
	let loads = $state(0);

	function load(value: AmbiguityHash) {
		// A loaded preset or link starts afresh: no trees of what was shown before.
		lastGood = null;
		lastRewrite = '';
		loads++;
		Object.assign(model, stateFromHash(value));
		loaded = presetFor(model)?.id ?? null;
		builderOpen = !source.grammar || binaryOperators(source.grammar).length > 0;
	}

	syncToHash(() => model, { validate: isAmbiguityHash, onLoad: load });

	// Parsing and the (bounded) list of trees follow every keystroke.
	const source = $derived(readSource(model));
	const current = $derived<Shown | null>(
		source.ready ? { source, original: listTrees(source.grammar!, source) } : null
	);
	const shown = $derived.by(() => {
		void loads;
		if (current) lastGood = current;
		return lastGood;
	});
	const stale = $derived(current === null && shown !== null);
	/** What the trees and both tabs are drawn from. */
	const view = $derived(shown?.source ?? source);
	const original = $derived(shown?.original ?? null);
	const labels = $derived(leafLabeler(view.display));
	// The rewritten grammar as typed, and the one drawn: the last without errors.
	const typedRewrite = $derived(analyzeRewrite(view, original, model.rewrite));
	const drawnRewrite = $derived.by(() => {
		void loads;
		if (typedRewrite.empty || typedRewrite.grammar) lastRewrite = model.rewrite;
		return lastRewrite;
	});
	const rewrite = $derived(
		drawnRewrite === model.rewrite || drawnRewrite.trim() === ''
			? typedRewrite
			: analyzeRewrite(view, original, drawnRewrite)
	);
	const declarations = $derived(
		view.grammar && original ? analyzeDeclarations(view.grammar, view, original, model.decls) : null
	);
	const preset = $derived(presetFor(model, loaded));

	// Each tree has a switch for its leftmost derivation; the switch in the panel's
	// header is for all of them (see state.ts).
	function showDerivation(n: number, show: boolean) {
		model.flipped = flipDerivation(model, n, show);
	}
	function showDerivations(show: boolean) {
		model.derivations = show;
		model.flipped = [];
	}

	// Listing both languages is the one unbounded computation: it runs in a worker.
	const request = $derived<CompareRequest>({
		original: model.grammar,
		rewritten: model.rewrite,
		maxLength: model.maxLength
	});
	const task = new WorkerTask<CompareRequest, CompareResult>({
		compute: compareTexts,
		worker: createCompareWorker,
		// The default preset has no rewritten grammar yet, so this is immediate.
		initial: untrack(() => request)
	});
	$effect(() => {
		const next = request;
		if (model.tab === 'rewrite') task.run(next);
	});
	const compare = $derived({
		result: task.output,
		stale: !sameRequest(task.input, request),
		status: task.status,
		error: task.error
	});

	const inputError = $derived(
		source.inputDiagnostics
			.filter((d) => d.severity === 'error')
			.map((d) => d.message)
			.join(' ')
	);
	const operands = $derived(source.grammar ? [...operandTerminals(source.grammar)] : []);
	const valuesHint = $derived(
		operands.length
			? `One number for each ${new Intl.ListFormat('en', { type: 'disjunction' }).format(operands)} of the string, in order.`
			: 'One number for each operand of the string, in order.'
	);
	const valuesError = $derived(source.valuesError ?? current?.original.valuesNote ?? '');

	const drawn = (entry: TreeEntry) =>
		model.abbreviated && entry.abbreviated ? entry.abbreviated : entry.tree;

	const TABS: { id: TabId; label: string }[] = [
		{ id: 'rewrite', label: 'Rewrite the grammar' },
		{ id: 'declarations', label: 'Declarations' }
	];
	const tabs = $derived(
		TABS.map((tab) =>
			tab.id === 'declarations' && model.decls.length ? { ...tab, badge: model.decls.length } : tab
		)
	);

	// Links to the other parsing tools; each is hidden while its tool is not part of the site.
	const linkTo = (slug: 'grammar' | 'rd-backtracking' | 'rd-predictive', grammar: string) => {
		const title = toolBySlug(slug)?.title;
		const href = toolLink(slug, { grammar, input: model.input });
		return href && title ? ([title, href] as const) : null;
	};
	const grammarLink = $derived(source.grammar ? linkTo('grammar', model.grammar) : null);
	const rewriteLinks = $derived(
		typedRewrite.grammar
			? (['grammar', 'rd-backtracking', 'rd-predictive'] as const).flatMap((slug) => {
					const link = linkTo(slug, model.rewrite);
					return link ? [[`Open the rewritten grammar in ${link[0]}`, link[1]] as const] : [];
				})
			: []
	);

	function loadPreset(p: Preset<AmbiguityHash>) {
		load(p.value);
		loaded = p.id;
	}
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Grammar and string">
		<div class={['input-grid', { 'has-note': !!preset }]}>
			<div class="input-main">
				<GrammarEditor
					label="Grammar"
					bind:value={model.grammar}
					nonterminals={source.grammar?.nonterminals}
					terminals={source.grammar?.terminals}
					diagnostics={source.grammarDiagnostics}
					minRows={3}
					maxRows={14}
					placeholder="E → E + E | E * E | ( E ) | int"
				/>
				<TextField
					label="Token string"
					description="Terminals of the grammar, separated by spaces."
					mono
					bind:value={model.input}
					error={inputError}
					placeholder="int * int + int"
					spellcheck="false"
				/>
				{#if source.labelled}
					<div class="shown">
						<span class="shown-label">Shown as</span>
						<TokenStream
							tokens={source.display}
							ariaLabel="The string with its occurrence labels"
						/>
					</div>
				{/if}
				<div class="options">
					<TextField
						label="Operand values"
						description={valuesHint}
						mono
						size="sm"
						bind:value={model.values}
						error={valuesError}
						placeholder="2 3 4"
						spellcheck="false"
					/>
					<TextField
						label="Occurrence labels"
						description="OTHER = E shows the k-th OTHER as E with the subscript k."
						mono
						size="sm"
						bind:value={model.labels}
						error={source.labelProblems.join(' ')}
						placeholder="OTHER = E"
						spellcheck="false"
					/>
				</div>
			</div>
			{#if preset}
				<div class="note"><PresetNote {preset} /></div>
			{/if}
		</div>
	</Panel>

	<Panel title="Parse trees" subtitle="every tree of the string">
		{#snippet actions()}
			<div class="switches">
				<Toggle bind:checked={model.abbreviated} label="Abbreviated trees" />
				<Toggle
					bind:checked={() => model.derivations, showDerivations}
					label="All leftmost derivations"
				/>
			</div>
		{/snippet}

		{#if !original}
			<p class="empty">
				The trees appear once the {source.grammar ? 'token string' : 'grammar'} has no errors.
			</p>
		{:else}
			{#if stale}
				<p class="stale-note" role="status">
					<Icon name="info" size={16} />
					<span>
						Showing the trees of <code>{view.tokens.length ? stringText(view.tokens) : 'ε'}</code>,
						the last grammar and string without errors.
					</span>
				</p>
			{/if}
			<div class={['listing', { 'stale-data': stale }]} aria-busy={stale}>
				<div class="verdict">
					<Verdict listing={original} />
					{#if original.trees.length > 1}
						<p class="definition">
							A grammar is ambiguous if it has more than one parse tree for some string.
							<CitationTag cite={DEFINITION} />
						</p>
					{:else if view.tokens.length === 0 && original.trees.length === 0}
						<p class="definition">
							Enter a token string, for example <code>int * int + int</code>.
						</p>
					{/if}
				</div>

				{#if original.trees.length}
					<div class="trees">
						{#each original.trees as entry (entry.number)}
							{@const value = entry.value ? evaluationText(entry.value) : null}
							{@const open = derivationShown(model, entry.number)}
							<TreeCard
								title={treeTitle(entry)}
								grouping={entry.grouping}
								tree={drawn(entry)}
								tone={treeTone(entry.number)}
								{labels}
								labelSize={18}
							>
								<Fact label="Bracket form" mono>{entry.bracket}</Fact>
								<div class="derivation">
									<Disclosure
										summary="Leftmost derivation"
										bind:open={() => open, (show) => showDerivation(entry.number, show)}
									>
										{#if open && view.grammar}
											{@const chain = leftmostChain(view.grammar, entry.tree)}
											<DerivationChain
												forms={chain.forms}
												steps={chain.steps}
												nonterminals={view.grammar.nonterminals}
												ariaLabel="Leftmost derivation of tree {entry.number}"
											/>
										{/if}
									</Disclosure>
								</div>
								{#if value}<Fact label="Values" mono>{value}</Fact>{/if}
							</TreeCard>
						{/each}
					</div>
					{#if original.truncated}
						<p class="more">{listedText(original)}</p>
					{/if}
				{/if}
			</div>
		{/if}

		{#if model.abbreviated}
			<p class="legend">
				{#if view.grammar && operandTerminals(view.grammar).size === 0}
					The trees are drawn in full: no terminal of the grammar is a whole right-hand side (as
					<code>int</code> is in <code>E → int</code>), so its nodes have no sub-expressions to be
					abbreviated to.
				{:else}
					Abbreviated: a node is its keyword or operator with only its sub-expressions as children.
					{#if view.grammar?.terminals.includes('if')}
						An <code>if</code> with two children is an if-then; with three, an if-then-else.
					{/if}
				{/if}
			</p>
		{/if}

		{#if grammarLink}
			<p class="links">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
				<a href={grammarLink[1]}>Open the grammar in {grammarLink[0]}</a>
			</p>
		{/if}
	</Panel>

	<Panel title="Dealing with ambiguity">
		<Tabs
			{tabs}
			value={model.tab}
			label="Ways to deal with ambiguity"
			onchange={(id) => (model.tab = id as TabId)}
		>
			{#snippet children(id)}
				{#if id === 'rewrite'}
					<RewriteTab
						bind:model
						{stale}
						{original}
						typed={typedRewrite}
						{rewrite}
						{labels}
						bind:builderOpen
						{compare}
						links={rewriteLinks}
					/>
				{:else}
					<DeclarationsTab bind:model {stale} {original} analysis={declarations} {labels} />
				{/if}
			{/snippet}
		</Tabs>
	</Panel>

	<Disclosure variant="boxed" summary="C operator precedence: 15 levels">
		<PrecedenceTable />
	</Disclosure>
</ToolPage>

<style>
	.input-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
	}
	@media (min-width: 960px) {
		.input-grid.has-note {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}
	.input-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3) var(--space-4);
		align-items: start;
	}
	.shown {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		margin-top: calc(-1 * var(--space-2));
		min-width: 0;
	}
	.shown-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.note {
		min-width: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	@media (min-width: 960px) {
		.note {
			padding: var(--space-1) 0 0 var(--space-5);
			border-top: 0;
			border-left: 1px solid var(--border);
		}
	}

	.switches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
	}
	.empty,
	.more,
	.legend {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.more,
	.legend {
		margin-top: var(--space-3);
	}
	.links {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
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
	.listing {
		min-width: 0;
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		margin-bottom: var(--space-4);
	}
	.definition {
		flex: 1 1 18rem;
		min-width: 0;
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.trees {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-4);
		min-width: 0;
	}
	/* The switch lines up with the rows around it, and the derivation gets the card's width. */
	.derivation {
		min-width: 0;
		margin: -4px 0 -4px -4px;
	}
	.derivation :global(.disclosure > .content) {
		padding: var(--space-1) 0 4px 4px;
	}
</style>
