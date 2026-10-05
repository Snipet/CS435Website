<script lang="ts">
	import { untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import {
		Badge,
		Callout,
		Icon,
		Panel,
		PresetMenu,
		Stepper,
		ToolPage,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import { tool } from '$lib/tools/catalog/rd-predictive';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import AstPanel from '$lib/tools/rd-predictive/AstPanel.svelte';
	import CodeListing from '$lib/tools/rd-predictive/CodeListing.svelte';
	import {
		COMPARE_LENGTH,
		compareTexts,
		sameRequest,
		type CompareRequest,
		type CompareResult
	} from '$lib/tools/rd-predictive/compare';
	import Findings from '$lib/tools/rd-predictive/Findings.svelte';
	import {
		readAst,
		readInput,
		readParser,
		readSource,
		runParser,
		sameText,
		withoutMarker,
		type Parser
	} from '$lib/tools/rd-predictive/model';
	import PredictionTable from '$lib/tools/rd-predictive/PredictionTable.svelte';
	import PresetNote from '$lib/tools/rd-predictive/PresetNote.svelte';
	import {
		DEFAULT_PRESET_ID,
		presetFor,
		presetState,
		presets,
		type PredictivePresetValue
	} from '$lib/tools/rd-predictive/presets';
	import RewritePanel from '$lib/tools/rd-predictive/RewritePanel.svelte';
	import type { RunResult } from '$lib/tools/rd-predictive/run';
	import RunPanel from '$lib/tools/rd-predictive/RunPanel.svelte';
	import SameStrings, { type Comparison } from '$lib/tools/rd-predictive/SameStrings.svelte';
	import {
		DEFAULT_STATE,
		isPredictiveHash,
		stateFromHash,
		type PredictiveState
	} from '$lib/tools/rd-predictive/state';
	import { callSites, describeStep } from '$lib/tools/rd-predictive/view';
	import { createCompareWorker } from '$lib/tools/rd-predictive/worker';
	import { syncToHash } from '$lib/url-state';

	let form = $state<PredictiveState>({ ...DEFAULT_STATE });
	/** The preset loaded last, shown for as long as it fits the state. */
	let loaded = $state<string | null>(DEFAULT_PRESET_ID);
	/** Counts loaded links and presets: each starts afresh. */
	let loads = $state(0);

	// The last results without errors, shown faded while the text has errors (often mid-typing).
	let lastRewrite: string | null = null;
	let lastParser: Parser | null = null;
	let lastRun: RunResult | null = null;

	function load(state: PredictiveState, preset: string | null) {
		pause();
		lastRewrite = null;
		lastParser = null;
		lastRun = null;
		loads++;
		Object.assign(form, state);
		loaded = preset ?? presetFor(form)?.id ?? null;
	}

	syncToHash(() => form, {
		validate: isPredictiveHash,
		onLoad: (value) => load(stateFromHash(value), null)
	});

	// Parsing, the rewrite, the analysis and both runs are bounded, so they follow every keystroke.
	const source = $derived(readSource(form.grammar, { form: form.form, order: form.order }));
	const rewriteText = $derived.by(() => {
		void loads;
		if (source.rewrite) lastRewrite = source.rewrite.text;
		return lastRewrite;
	});

	/** The parser's grammar: the rewritten one until it is edited in the Parser panel. */
	const follows = $derived(form.ebnf === null);
	const parserText = $derived(form.ebnf ?? rewriteText ?? '');
	const typedParser = $derived(readParser(parserText));
	const parser = $derived.by(() => {
		void loads;
		if (typedParser.program) lastParser = typedParser;
		return lastParser;
	});
	/** The parser shown is for an earlier text: this one, or the grammar it follows, has errors. */
	const parserStale = $derived(
		parser !== null && (typedParser.program === null || (follows && source.rewrite === null))
	);
	const inUse = $derived(
		follows || (source.rewrite !== null && sameText(form.ebnf ?? '', source.rewrite.text))
	);

	const input = $derived(parser?.ebnf ? readInput(form.input, parser.ebnf) : null);
	const typedRun = $derived(parser ? runParser(parser, input) : null);
	const run = $derived.by(() => {
		void loads;
		if (typedRun) lastRun = typedRun;
		return lastRun;
	});
	const runStale = $derived(run !== null && (typedRun === null || parserStale));
	const ast = $derived(parser ? readAst(parser, input, form.ast) : null);

	const runSteps = $derived(run?.steps.length ?? 0);
	const astSteps = $derived(ast?.run?.steps.length ?? 0);
	const runStepper = new Stepper(() => runSteps, {
		index: untrack(() => form.step ?? Math.max(0, runSteps - 1))
	});
	const astStepper = new Stepper(() => astSteps, {
		index: untrack(() => form.astStep ?? Math.max(0, astSteps - 1))
	});

	// form.step and form.astStep (null = the last step) drive the steppers…
	$effect(() => {
		const n = runSteps;
		const step = form.step;
		untrack(() => runStepper.set(step === null ? n - 1 : step));
	});
	$effect(() => {
		const n = astSteps;
		const step = form.astStep;
		untrack(() => astStepper.set(step === null ? n - 1 : step));
	});
	// …and the steppers write back where they are, for the share link.
	$effect(() => {
		const i = runStepper.index;
		const n = runSteps;
		untrack(() => {
			if (n === 0) return;
			const next = i >= n - 1 ? null : i;
			if (form.step !== next) form.step = next;
		});
	});
	$effect(() => {
		const i = astStepper.index;
		const n = astSteps;
		untrack(() => {
			if (n === 0) return;
			const next = i >= n - 1 ? null : i;
			if (form.astStep !== next) form.astStep = next;
		});
	});

	function pause() {
		runStepper.pause();
		astStepper.pause();
	}

	/** An edit shows the end of the new runs. */
	function edited() {
		pause();
		form.step = null;
		form.astStep = null;
	}

	function useRewrite() {
		form.ebnf = null;
		edited();
	}

	const preset = $derived(presetFor(form, loaded));

	function loadPreset(p: Preset<PredictivePresetValue>) {
		load(presetState(p), p.id);
	}

	// Listing two languages is the one unbounded computation: it runs in a worker. One task
	// compares the grammar as written with its rewrite, the other with a grammar edited in the
	// Parser panel. An empty second grammar means there is nothing to compare.
	const rewriteRequest = $derived<CompareRequest>({
		original: form.grammar,
		rewritten: source.rewrite && source.rewrite.changes.length > 0 ? source.rewrite.text : '',
		maxLength: COMPARE_LENGTH
	});
	const parserRequest = $derived<CompareRequest>({
		original: form.grammar,
		rewritten: !inUse && source.grammar && typedParser.ebnf ? parserText : '',
		maxLength: COMPARE_LENGTH
	});
	const compareTask = (first: CompareRequest) =>
		new WorkerTask<CompareRequest, CompareResult>({
			compute: compareTexts,
			worker: createCompareWorker,
			// Computed at once for the default grammar (a few milliseconds), so the prerendered page shows it.
			initial: first
		});
	const rewriteTask = compareTask(untrack(() => rewriteRequest));
	const parserTask = compareTask(untrack(() => parserRequest));
	$effect(() => {
		const next = rewriteRequest;
		if (next.rewritten !== '') rewriteTask.run(next);
	});
	$effect(() => {
		const next = parserRequest;
		if (next.rewritten !== '') parserTask.run(next);
	});
	const comparisonOf = (
		task: WorkerTask<CompareRequest, CompareResult>,
		request: CompareRequest
	): Comparison => ({
		result: task.output,
		stale: !sameRequest(task.input, request),
		status: task.status,
		error: task.error
	});
	const rewriteComparison = $derived(comparisonOf(rewriteTask, rewriteRequest));
	const parserComparison = $derived(comparisonOf(parserTask, parserRequest));

	const runStep = $derived(run ? run.steps[runStepper.index] : undefined);
	const conflicts = $derived(parser?.prediction?.conflicts ?? []);
	/** Conflicts listed before the rest is summed up. */
	const CONFLICT_LIMIT = 6;

	// Other tools open on the grammar as written; the token string goes without its $.
	const openIn = $derived.by(() => {
		if (!source.grammar) return [];
		const plain = withoutMarker(form.input);
		const state = plain ? { grammar: form.grammar, input: plain } : { grammar: form.grammar };
		return (['rd-backtracking', 'grammar'] as const).flatMap((slug) => {
			const title = toolBySlug(slug)?.title;
			const href = toolLink(slug, state);
			return title && href ? [{ title, href }] : [];
		});
	});
	// A result without brackets is a plain grammar, which the backtracking parser can take.
	const rewriteLinks = $derived.by(() => {
		const rewrite = source.rewrite;
		if (!rewrite || rewrite.brackets || rewrite.changes.length === 0) return [];
		const title = toolBySlug('rd-backtracking')?.title;
		const plain = withoutMarker(form.input);
		const href = toolLink(
			'rd-backtracking',
			plain ? { grammar: rewrite.text, input: plain } : { grammar: rewrite.text }
		);
		return title && href ? [{ title: `Open the result in ${title}`, href }] : [];
	});
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Grammar" subtitle="as written, in BNF">
		<div class={['input-grid', { 'has-note': !!preset }]}>
			<div class="input-main">
				<GrammarEditor
					label="Grammar"
					bind:value={form.grammar}
					oninput={edited}
					diagnostics={source.diagnostics}
					nonterminals={source.grammar?.nonterminals}
					terminals={source.grammar?.terminals}
					minRows={3}
					maxRows={12}
					placeholder="E → E + T | T"
				/>
				{#if source.grammar}
					<Findings
						recursion={source.recursion}
						prefixes={source.prefixes}
						nonterminals={source.grammar.nonterminals}
					/>
				{/if}
				{#if openIn.length > 0}
					<p class="open-in">
						Open in
						{#each openIn as link, i (link.href)}
							{i > 0 ? ' or ' : ''}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
							<a href={link.href}>{link.title}</a>
						{/each}
					</p>
				{/if}
			</div>
			{#if preset}
				<div class="preset-note"><PresetNote {preset} /></div>
			{/if}
		</div>
	</Panel>

	<Panel title="Rewrite" subtitle="left recursion eliminated, common prefixes factored">
		{#if source.rewrite}
			<RewritePanel
				rewrite={source.rewrite}
				comparison={rewriteComparison}
				bind:form={form.form}
				bind:order={form.order}
				nonterminals={source.grammar?.nonterminals}
				kinds={source.kinds}
				{inUse}
				onuse={useRewrite}
				onchange={edited}
				links={rewriteLinks}
			/>
		{:else}
			<p class="empty">The rewrite appears once the grammar has no errors.</p>
		{/if}
	</Panel>

	<div class="workspace">
		<Panel title="Parser" subtitle="one function per rule" class="parser-panel">
			<div class="parser">
				<GrammarEditor
					label="Grammar of the parser, in EBNF"
					ebnf
					bind:value={() => parserText, (text) => (form.ebnf = text)}
					oninput={edited}
					diagnostics={typedParser.diagnostics}
					nonterminals={typedParser.ebnf?.nonterminals}
					terminals={typedParser.ebnf?.terminals}
					minRows={3}
					maxRows={12}
					placeholder="E → T [ + E ]"
				/>
				<p class="origin">
					{#if follows}
						The rewritten grammar. It follows the Rewrite panel until it is edited here.
					{:else if inUse}
						Kept as it is here; it is the same as the rewritten grammar.
					{:else}
						Not the rewritten grammar. “Use this grammar below” in the Rewrite panel puts the
						rewritten grammar here.
					{/if}
				</p>
				{#if parserRequest.rewritten !== ''}
					<SameStrings comparison={parserComparison} name="the grammar of the parser" />
				{/if}

				{#if parser?.program && parser.prediction}
					{#if parserStale}
						<p class="stale-note" role="status">
							<Icon name="info" size={16} />
							<span>Showing the parser of the last grammar without errors.</span>
						</p>
					{/if}
					<div class={['generated', { 'stale-data': parserStale }]} aria-busy={parserStale}>
						<section aria-labelledby="prediction-title">
							<h3 id="prediction-title">
								Prediction
								{#if parser.prediction.suitable}
									<Badge tone="accept">Suitable for prediction</Badge>
								{:else}
									<Badge tone="reject">Not suitable for prediction</Badge>
								{/if}
							</h3>
							<p class="verdict">
								{#if parser.prediction.suitable}
									One token of lookahead picks every rule: no token selects two ways at any choice.
								{:else if conflicts.length > 0}
									One token of lookahead cannot choose in {conflicts.length}
									{conflicts.length === 1 ? 'place' : 'places'}.
								{:else}
									The lookahead sets of this grammar cannot be trusted.
								{/if}
							</p>
							<PredictionTable rows={parser.rows} />
							{#if parser.prediction.reserved.length > 0}
								<Callout tone="error">
									<p>{parser.prediction.diagnostics[0]?.message}</p>
								</Callout>
							{/if}
							{#each conflicts.slice(0, CONFLICT_LIMIT) as conflict, i (i)}
								<Callout tone="warn"><p>{conflict.message}</p></Callout>
							{/each}
							{#if conflicts.length > CONFLICT_LIMIT}
								<p class="more">… and {conflicts.length - CONFLICT_LIMIT} more.</p>
							{/if}
							{#if conflicts.length > 0}
								<p class="more">
									The code is generated all the same: where a token selects two alternatives, the
									one written first is taken.
								</p>
							{/if}
						</section>

						<section aria-labelledby="code-title">
							<h3 id="code-title">Code <span>the line being executed is marked</span></h3>
							<CodeListing
								program={parser.program}
								line={runStep?.line ?? null}
								sites={callSites(runStep)}
								tone={run && runStep ? describeStep(run, runStepper.index).tone : 'neutral'}
								maxHeight="min(46rem, 75vh)"
								ariaLabel="Generated parser"
							/>
						</section>
					</div>
				{:else}
					<p class="empty">The parser is generated once this grammar has no errors.</p>
				{/if}
			</div>
		</Panel>

		<Panel title="Run" subtitle="the parser on a token string" class="run-panel">
			<RunPanel
				bind:input={form.input}
				inputError={input?.error ?? ''}
				oninput={edited}
				{run}
				stepper={runStepper}
				stale={runStale}
			/>
		</Panel>
	</div>

	<Panel title="AST" subtitle="built while parsing">
		{#if ast}
			<!-- Like the parser, the functions are those of the last grammar without errors. -->
			<div class={{ 'stale-data': parserStale }} aria-busy={parserStale}>
				<AstPanel
					model={ast}
					stepper={astStepper}
					onform={(value) => {
						astStepper.pause();
						// The form the grammar is written in needs no choice: it is what a link opens on.
						form.ast = value === ast.written ? null : value;
						form.astStep = null;
					}}
					inputError={!!input?.error}
				/>
			</div>
		{:else}
			<p class="empty">The functions are generated once the grammar of the parser has no errors.</p>
		{/if}
	</Panel>
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
	.open-in {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.preset-note {
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
	.empty,
	.more,
	.origin {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.origin {
		margin-top: calc(-1 * var(--space-2));
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.workspace {
			grid-template-columns: minmax(0, 7fr) minmax(340px, 5fr);
		}
	}
	/*
	 * The run stays next to the code while the page scrolls, on screens tall
	 * enough for it. A run with a deep call stack scrolls inside the panel.
	 */
	@media (min-width: 1000px) and (min-height: 760px) {
		.workspace :global(.run-panel) {
			position: sticky;
			top: calc(56px + var(--space-4));
			max-height: calc(100vh - 56px - 2 * var(--space-4));
			overflow-y: auto;
			scrollbar-width: thin;
		}
	}
	.parser,
	.generated {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.generated section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	h3 span {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 400;
	}
	.verdict {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
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
</style>
