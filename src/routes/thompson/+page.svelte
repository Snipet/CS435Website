<script lang="ts">
	import { untrack } from 'svelte';
	import AutomatonView from '$lib/components/graph/AutomatonView.svelte';
	import {
		Badge,
		Callout,
		CitationTag,
		CodeEditor,
		Disclosure,
		Icon,
		Panel,
		PresetMenu,
		RegexField,
		StepControls,
		Stepper,
		ToolPage
	} from '$lib/components/ui';
	import { formatAutomatonText } from '$lib/theory/automata';
	import { tool } from '$lib/tools/catalog/thompson';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import {
		MAX_NODES,
		MAX_STATES,
		andList,
		buildConstruction,
		constructionExtent,
		describeStep,
		formulaText,
		sizeStats,
		sourceMarks,
		stepView,
		type Construction
	} from '$lib/tools/thompson/construction';
	import { presetFor, presets, type ThompsonPreset } from '$lib/tools/thompson/presets';
	import RuleCard from '$lib/tools/thompson/RuleCard.svelte';
	import { ruleCard } from '$lib/tools/thompson/rules';
	import {
		DEFAULT_STATE,
		isThompsonHash,
		stateFromHash,
		type ThompsonState
	} from '$lib/tools/thompson/state';
	import SyntaxTree from '$lib/tools/thompson/SyntaxTree.svelte';
	import { layoutTree } from '$lib/tools/thompson/tree';
	import { syncToHash } from '$lib/url-state';

	let form = $state<ThompsonState>({ ...DEFAULT_STATE });
	let defsOpen = $state(false);

	syncToHash(() => form, {
		validate: isThompsonHash,
		onLoad: (value) => {
			const next = stateFromHash(value);
			form.re = next.re;
			form.defs = next.defs;
			form.step = next.step;
			if (next.defs.trim()) defsOpen = true;
		}
	});

	const outcome = $derived(buildConstruction(form.re, form.defs));

	// While the expression has errors (often mid-typing), keep showing the last
	// construction that built, faded, instead of emptying the page.
	let lastBuilt: Construction | null = null;
	const shown = $derived.by(() => {
		if (outcome.status === 'ok') return (lastBuilt = outcome.construction);
		return outcome.status === 'invalid' ? lastBuilt : null;
	});
	const stale = $derived(shown !== null && outcome.status !== 'ok');
	const total = $derived(shown?.result.steps.length ?? 0);

	const stepper = new Stepper(() => total, { index: untrack(() => Math.max(0, total - 1)) });
	const index = $derived(stepper.index);

	// form.step (null = the last step) drives the stepper…
	$effect(() => {
		const n = total;
		const step = form.step;
		untrack(() => stepper.set(step === null ? n - 1 : step));
	});
	// …and the stepper writes back where it is, for the share link.
	$effect(() => {
		const i = stepper.index;
		const n = total;
		untrack(() => {
			if (n === 0) return;
			const next = i >= n - 1 ? null : i;
			if (form.step !== next) form.step = next;
		});
	});

	const view = $derived(shown && total ? stepView(shown, index) : null);
	const description = $derived(shown && total ? describeStep(shown, index) : null);
	const rule = $derived(shown && total ? ruleCard(shown, index) : null);
	const marks = $derived(shown && total ? sourceMarks(shown, index) : null);
	const tree = $derived(shown ? layoutTree(shown.regex, shown.stepByPath) : null);
	const extent = $derived(shown ? constructionExtent(shown) : undefined);
	const stats = $derived(shown ? sizeStats(shown) : null);
	const clauses = $derived(shown ? shown.result.steps.map((s) => s.clause) : []);
	const viewKey = $derived(shown ? `${shown.re}\n${shown.defs}` : '');
	/** Narrowest the drawing gets on small screens (about 0.6 px per layout unit). */
	const nfaMinWidth = $derived(extent ? Math.round(Math.min(1000, extent.width * 0.6)) : 0);

	const activePreset = $derived(presetFor(form.re, form.defs));
	const defCount = $derived(
		form.defs.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length
	);

	const links = $derived.by(() => {
		if (!shown || stale) return { subset: null, automata: null };
		return {
			subset: toolLink('subset', {
				from: 're',
				re: shown.re,
				...(shown.defs.trim() ? { defs: shown.defs } : {})
			}),
			automata: toolLink('automata', { text: formatAutomatonText(shown.result.nfa) })
		};
	});
	const automataTitle = toolBySlug('automata')?.title ?? 'Finite Automata';

	const count = new Intl.NumberFormat('en-US');

	function loadPreset(p: ThompsonPreset) {
		stepper.pause();
		form.re = p.value.re;
		form.defs = p.value.defs ?? '';
		form.step = p.value.step ?? null;
		defsOpen = form.defs.trim() !== '';
	}

	/** Typing shows the finished NFA of the new expression. */
	function edited() {
		stepper.pause();
		form.step = null;
	}

	/** The step description for the caption (the current step's is already derived). */
	function caption(i: number) {
		if (description && i === description.index) return description;
		return shown && i < total ? describeStep(shown, i) : null;
	}

	function goTo(step: number) {
		stepper.pause();
		stepper.set(step);
	}
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu
			{presets}
			selected={activePreset?.id ?? null}
			onselect={loadPreset}
			monoLabels
			align="end"
		/>
	{/snippet}

	<Panel class="input-panel">
		<div class={['input-grid', { 'has-note': !!activePreset }]}>
			<div class="input-main">
				<RegexField
					label="Regular expression"
					bind:value={form.re}
					oninput={edited}
					diagnostics={outcome.diagnostics}
					placeholder="(1 | 0)*1"
				/>
				<Disclosure variant="boxed" bind:open={defsOpen}>
					{#snippet summaryContent()}
						<span class="defs-summary">
							Regular definitions
							{#if defCount}<Badge>{defCount}</Badge>{/if}
						</span>
					{/snippet}
					<div class="defs">
						<p class="hint">
							One per line, as <code>name = RE</code>; lines starting with <code>//</code> are comments.
							A name in the expression stands for a fresh copy of its definition.
						</p>
						<CodeEditor
							ariaLabel="Regular definitions"
							bind:value={form.defs}
							oninput={edited}
							diagnostics={outcome.defDiagnostics}
							minRows={3}
							maxRows={10}
							placeholder="digit = '0' | '1' | '2' | … | '9'"
						/>
					</div>
				</Disclosure>
			</div>

			{#if activePreset}
				<aside class="preset-note" aria-label="About this example">
					{#if activePreset.cite}<CitationTag cite={activePreset.cite} />{/if}
					<p class="preset-desc">{activePreset.description}</p>
					{#if activePreset.question}
						{@const q = activePreset.question}
						<div class="question">
							<p class="q-prompt">{q.prompt}</p>
							<Disclosure summary="Show answer" openSummary="Hide answer">
								<p class="answer">{q.answer}</p>
								{#if q.edges}
									<ul class="answer-edges">
										{#each q.edges as [from, sym, to], i (i)}
											<li>{from} →<sup>{sym}</sup> {to}</li>
										{/each}
									</ul>
								{/if}
							</Disclosure>
						</div>
					{/if}
				</aside>
			{/if}
		</div>
	</Panel>

	{#if outcome.status === 'too-big'}
		<Callout tone="warn" title="Too large to draw">
			<p>
				This expression needs {count.format(outcome.size.states)} states and {count.format(
					outcome.size.nodes
				)} syntax-tree nodes. The tool draws machines of up to {MAX_STATES} states and {MAX_NODES}
				nodes.
			</p>
		</Callout>
	{/if}

	{#if shown && view && description && rule && tree && stats}
		<div class={['construction', { stale }]}>
			{#if stale}
				<p class="stale-note" role="status">
					<Icon name="info" size={16} />
					<span>Showing <code>{shown.re}</code>, the last expression without errors.</span>
				</p>
			{/if}

			<Panel title="Construction" subtitle="one step per syntax-tree node">
				<StepControls {stepper} ariaLabel="Construction steps">
					{#snippet label(i: number)}
						{@const d = caption(i)}
						{#if d}
							<span class="step-expr">{d.expr}</span>
							<span class="step-dash" aria-hidden="true">—</span>
							<strong class="step-clause">{d.clause}:</strong>
							{d.detail}
						{/if}
					{/snippet}
				</StepControls>
			</Panel>

			<div class="workspace">
				<Panel title="Syntax tree" subtitle="numbered in step order" class="tree-panel">
					<SyntaxTree
						layout={tree}
						current={index}
						{total}
						texts={shown.texts}
						{clauses}
						source={shown.re}
						{marks}
						onselect={goTo}
					/>
				</Panel>

				<Panel
					title="NFA"
					subtitle={index === total - 1
						? `${stats.states} states`
						: `${view.automaton.states.length} of ${stats.states} states`}
					class="nfa-panel"
				>
					<!-- On phones the drawing keeps a readable scale and scrolls sideways. -->
					<div class="nfa-scroll" style="--nfa-min: {nfaMinWidth}px">
						<AutomatonView
							automaton={view.automaton}
							positions={view.positions}
							highlight={{ active: view.newStates, taken: view.newTransitions }}
							groups={view.groups}
							height="auto"
							{viewKey}
							{extent}
						/>
					</div>
					<ul class="legend" aria-label="Legend">
						<li>
							<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
								><circle class="lg-new" cx="9" cy="9" r="7" /></svg
							>
							New in this step
						</li>
						<li>
							<svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true"
								><rect class="lg-current" x="1" y="1" width="20" height="14" rx="5" /></svg
							>
							Current fragment
						</li>
						<li>
							<svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true"
								><rect class="lg-part" x="1" y="1" width="20" height="14" rx="5" /></svg
							>
							Operand fragments
						</li>
					</ul>

					{#snippet footer()}
						<div class="nfa-foot">
							<dl class="stats">
								<div>
									<dt>States</dt>
									<dd>
										{stats.states}
										{#if stats.formula}<span class="formula">= {formulaText(stats.formula)}</span
											>{/if}
									</dd>
								</div>
								<div>
									<dt>Transitions</dt>
									<dd>{stats.transitions}</dd>
								</div>
								<div>
									<dt>ε-moves</dt>
									<dd>{stats.epsilonMoves}</dd>
								</div>
							</dl>
							{#if !stats.formula}
								<p class="stats-note">
									The count 2 × (symbols + | + *) applies to expressions made only of symbols, ε,
									concatenation, | and *; this one also uses {andList(stats.derived)}.
								</p>
							{/if}
							{#if links.subset || links.automata}
								<div class="next">
									{#if links.subset}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
										<a class="next-link primary" href={links.subset}>
											Continue to subset construction
											<Icon name="arrow-right" size={16} />
										</a>
									{/if}
									{#if links.automata}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
										<a class="next-link" href={links.automata}>Open NFA in {automataTitle}</a>
									{/if}
								</div>
							{/if}
						</div>
					{/snippet}
				</Panel>

				<Panel title="Rule" class="rule-panel">
					<RuleCard model={rule} />
				</Panel>
			</div>
		</div>
	{/if}
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
		gap: var(--space-3);
		min-width: 0;
	}
	.defs-summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.defs {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.preset-note {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	@media (min-width: 960px) {
		.preset-note {
			padding: var(--space-1) 0 0 var(--space-5);
			border-top: 0;
			border-left: 1px solid var(--border);
		}
	}
	.preset-desc {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.question {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 100%;
		margin-top: var(--space-1);
	}
	.q-prompt {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-style: italic;
	}
	.answer {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
	}
	.answer-edges {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
		gap: 2px var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	sup {
		font-size: 0.75em;
		line-height: 0;
	}

	.construction {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.stale-note :global(.icon) {
		flex: none;
		color: var(--info);
	}
	.construction.stale :global(.panel) {
		opacity: 0.55;
		transition: opacity var(--duration) var(--ease);
	}

	.step-expr {
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.step-dash {
		margin: 0 0.15em;
		color: var(--text-3);
	}
	.step-clause {
		font-weight: 600;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1080px) {
		.workspace {
			grid-template-columns: minmax(300px, 5fr) minmax(0, 9fr);
			grid-template-rows: auto 1fr;
			grid-template-areas:
				'tree nfa'
				'rule nfa';
			align-items: start;
		}
		.workspace :global(.tree-panel) {
			grid-area: tree;
		}
		.workspace :global(.nfa-panel) {
			grid-area: nfa;
		}
		.workspace :global(.rule-panel) {
			grid-area: rule;
		}
	}

	.nfa-scroll {
		overflow-x: auto;
		overscroll-behavior-x: contain;
		border-radius: var(--radius-lg);
	}
	@media (max-width: 720px) {
		.nfa-scroll > :global(.automaton-view) {
			min-width: var(--nfa-min);
		}
		/* Let a sideways swipe scroll the box instead of panning the view. */
		.nfa-scroll :global(.drawing) {
			touch-action: pan-x pan-y;
		}
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-5);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.lg-new {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 2;
	}
	.lg-current {
		fill: color-mix(in srgb, var(--accent) 8%, transparent);
		stroke: color-mix(in srgb, var(--accent) 45%, transparent);
		stroke-width: 1.2;
	}
	.lg-part {
		fill: color-mix(in srgb, var(--accent) 3%, transparent);
		stroke: color-mix(in srgb, var(--accent) 30%, transparent);
		stroke-width: 1.2;
		stroke-dasharray: 4 3;
	}

	.nfa-foot {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-6);
		margin: 0;
	}
	.stats div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.stats dt {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.stats dd {
		margin: 0;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.formula {
		margin-left: 0.25em;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-weight: 400;
		font-variant-ligatures: none;
	}
	.stats-note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.next {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.next-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		box-shadow: var(--shadow-sm);
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.next-link:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.next-link.primary {
		border-color: transparent;
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.next-link.primary:hover {
		background: var(--accent-hover);
		color: var(--accent-contrast);
	}
</style>
