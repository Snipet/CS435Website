<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import {
		Button,
		Callout,
		Panel,
		PresetMenu,
		Stepper,
		TextField,
		Toggle,
		ToolPage,
		Updating,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import { printSymbols, type Grammar } from '$lib/theory/grammar';
	import { tool } from '$lib/tools/catalog/ll1';
	import EntryNote from '$lib/tools/ll1/EntryNote.svelte';
	import {
		analysisKey,
		computeAnalysis,
		computeParse,
		entryView,
		orderText,
		readGrammar,
		readTokens,
		sameParse,
		skippedSymbols,
		tableOrder,
		type Analysis,
		type AnalysisRequest,
		type ParseRequest,
		type ParseResult
	} from '$lib/tools/ll1/model';
	import NotLL1 from '$lib/tools/ll1/NotLL1.svelte';
	import ParsePanel from '$lib/tools/ll1/ParsePanel.svelte';
	import PresetNote from '$lib/tools/ll1/PresetNote.svelte';
	import { presetFor, presetState, presets, type LL1PresetValue } from '$lib/tools/ll1/presets';
	import RewritePanel from '$lib/tools/ll1/RewritePanel.svelte';
	import { setSteps } from '$lib/tools/ll1/sets';
	import SetsPanel from '$lib/tools/ll1/SetsPanel.svelte';
	import { DEFAULT_STATE, isLL1Hash, stateFromHash, type LL1State } from '$lib/tools/ll1/state';
	import TableView from '$lib/tools/ll1/TableView.svelte';
	import { createAnalysisWorker, createParseWorker } from '$lib/tools/ll1/worker';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';

	/** The state of the page; `preset` is the preset loaded last, shown for as long as it fits. */
	let form = $state<LL1State>({ ...DEFAULT_STATE, names: {} });

	/** The last grammar without errors: the panels keep showing it, faded, while the text has errors. */
	let lastGood: { text: string; grammar: Grammar } | null = null;

	function load(state: LL1State) {
		pause();
		if (state.grammar !== form.grammar) lastGood = null;
		Object.assign(form, state);
	}

	syncToHash(() => form, {
		validate: isLL1Hash,
		onLoad: (value) => load(stateFromHash(value))
	});

	// ---- The grammar: parsed on every keystroke --------------------------------

	const source = $derived(readGrammar(form.grammar));
	const shown = $derived.by(() => {
		if (source.grammar) lastGood = { text: form.grammar, grammar: source.grammar };
		return lastGood;
	});
	/** The text has errors and the panels show an earlier grammar. */
	const grammarStale = $derived(shown !== null && source.grammar === null);

	// ---- The analysis: First and Follow, the table, the causes, the rewrite ----

	const analysisRequest = $derived<AnalysisRequest | null>(
		shown ? { grammar: shown.text, names: { ...form.names } } : null
	);
	const analysisTask = new WorkerTask<AnalysisRequest, Analysis | null>({
		compute: computeAnalysis,
		worker: createAnalysisWorker,
		// The default grammar is LL(1) and small: computed at once, so the prerendered page shows it.
		initial: untrack(() => analysisRequest) ?? undefined,
		key: analysisKey
	});
	$effect(() => {
		if (analysisRequest) analysisTask.run(analysisRequest);
	});
	const analysis = $derived(analysisTask.output);
	const analysisStale = $derived(
		grammarStale ||
			!analysisTask.input ||
			!analysisRequest ||
			analysisKey(analysisTask.input) !== analysisKey(analysisRequest)
	);
	const table = $derived(analysis?.table ?? null);

	const steps = $derived(table ? setSteps(table.firstFollow) : []);
	const setStepper = new Stepper(() => steps.length, {
		index: untrack(() => form.setStep ?? Math.max(0, steps.length - 1))
	});

	const order = $derived(table ? tableOrder(table, form.rows, form.columns) : null);
	const selected = $derived.by(() => {
		if (!table || !form.cell) return null;
		const row = table.rows.indexOf(form.cell[0]);
		const column = table.columns.indexOf(form.cell[1]);
		return row < 0 || column < 0 ? null : { row, column };
	});
	const entry = $derived(
		table && selected ? entryView(table, selected.row, selected.column) : null
	);

	function select(row: number, column: number) {
		if (!table) return;
		const next: [string, string] = [table.rows[row], table.columns[column]];
		form.cell = form.cell && form.cell[0] === next[0] && form.cell[1] === next[1] ? null : next;
	}

	/** Selects an entry from the banner and moves to it, focus included. */
	async function gotoEntry(row: number, column: number) {
		if (!table) return;
		form.cell = [table.rows[row], table.columns[column]];
		await tick();
		const panel = document.getElementById('ll1-table');
		panel?.scrollIntoView({ block: 'start' });
		panel
			?.querySelector<HTMLButtonElement>('button[data-cell][aria-pressed="true"]')
			?.focus({ preventScroll: true });
	}

	// ---- The parse -------------------------------------------------------------

	const tokens = $derived(shown ? readTokens(shown.grammar, form.input) : null);
	const parseRequest = $derived<ParseRequest | null>(
		shown && tokens && tokens.error === null ? { grammar: shown.text, tokens: tokens.tokens } : null
	);
	const parseTask = new WorkerTask<ParseRequest, ParseResult | null>({
		compute: computeParse,
		worker: createParseWorker,
		initial: untrack(() => parseRequest) ?? undefined,
		key: (r) => JSON.stringify([r.grammar, r.tokens])
	});
	$effect(() => {
		if (parseRequest) parseTask.run(parseRequest);
	});
	/** The parse with its own table, so a parse kept from an earlier grammar is drawn with it. */
	const parse = $derived(parseTask.output);
	const parseStale = $derived(grammarStale || !sameParse(parseTask.input, parseRequest));
	const rows = $derived(parse?.parse.rows.length ?? 0);
	const parseStepper = new Stepper(() => rows, {
		index: untrack(() => form.step ?? Math.max(0, rows - 1))
	});

	// form.setStep and form.step (null = the end) drive the steppers…
	$effect(() => {
		const n = steps.length;
		const step = form.setStep;
		untrack(() => setStepper.set(step === null ? n - 1 : step));
	});
	$effect(() => {
		const n = rows;
		const step = form.step;
		untrack(() => parseStepper.set(step === null ? n - 1 : step));
	});
	// …and the steppers write back where they are, for the share link. A result
	// for other inputs (the workers have not answered yet) has other steps: a
	// step a link asks for is kept until the result for the link comes.
	$effect(() => {
		const i = setStepper.index;
		const n = steps.length;
		untrack(() => {
			if (n === 0 || analysisStale) return;
			const next = i >= n - 1 ? null : i;
			if (form.setStep !== next) form.setStep = next;
		});
	});
	$effect(() => {
		const i = parseStepper.index;
		const n = rows;
		untrack(() => {
			if (n === 0 || parseStale) return;
			const next = i >= n - 1 ? null : i;
			if (form.step !== next) form.step = next;
		});
	});

	function pause() {
		setStepper.pause();
		parseStepper.pause();
	}

	/** An edit of the grammar shows the ends of the new computations. */
	function edited() {
		pause();
		form.setStep = null;
		form.step = null;
	}

	function inputEdited() {
		parseStepper.pause();
		form.step = null;
	}

	// ---- The rewrite -----------------------------------------------------------

	const rewrite = $derived(analysis?.rewrite ?? null);
	const squash = (text: string) =>
		text
			.split('\n')
			.map((line) => line.trim().replace(/[ \t]+/g, ' '))
			.filter((line) => line !== '')
			.join('\n');
	const inUse = $derived(!!rewrite && squash(rewrite.result.text) === squash(form.grammar));

	/** Symbols in the order fields that neither the table nor the rewritten one has. */
	const skipped = $derived(
		table ? skippedSymbols(form.rows, form.columns, rewrite ? [table, rewrite.table] : [table]) : []
	);

	function useRewrite() {
		if (!rewrite) return;
		form.grammar = rewrite.result.text;
		form.cell = null;
		edited();
	}

	// ---- Presets and links -----------------------------------------------------

	const preset = $derived(presetFor(form));

	function loadPreset(p: Preset<LL1PresetValue>) {
		load(presetState(p));
	}

	const linkState = $derived.by(() => {
		if (!shown) return null;
		const input =
			tokens && tokens.error === null && tokens.tokens.length > 0 ? tokens.tokens : null;
		return input
			? { grammar: shown.text, input: input.map((t) => printSymbols([t])).join(' ') }
			: { grammar: shown.text };
	});
	const linksTo = (slugs: readonly ('rd-predictive' | 'grammar' | 'shift-reduce' | 'lr1')[]) =>
		linkState
			? slugs.flatMap((slug) => {
					const title = toolBySlug(slug)?.title;
					const href = toolLink(slug, linkState);
					return title && href ? [{ title, href }] : [];
				})
			: [];
	const openIn = $derived(linksTo(['grammar', 'rd-predictive', 'shift-reduce', 'lr1']));
	const bottomUp = $derived(linksTo(['shift-reduce', 'lr1']));
	const ambiguityHref = $derived(
		shown && analysis?.causes?.ambiguous
			? toolLink('ambiguity', {
					grammar: shown.text,
					input: analysis.causes.ambiguous.tokens.map((t) => printSymbols([t])).join(' ')
				})
			: null
	);

	const failure = (status: string, error: string | null) =>
		status === 'timed-out'
			? 'This takes too long to compute for this grammar.'
			: status === 'error'
				? `This could not be computed${error ? ` (${error})` : ''}.`
				: null;
	const analysisFailure = $derived(failure(analysisTask.status, analysisTask.error));
	const parseFailure = $derived(failure(parseTask.status, parseTask.error));
	const analysisBusy = $derived(analysisStale && analysisTask.status === 'working');
	const parseBusy = $derived(parseStale && parseTask.status === 'working');
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Grammar" subtitle="BNF, without EBNF; the first left-hand side is the start symbol">
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
					placeholder="E → T X"
				/>
				{#if openIn.length > 0}
					<p class="open-in">
						Open in
						{#each openIn as link, i (link.href)}
							{i > 0 ? (i === openIn.length - 1 ? ' or ' : ', ') : ''}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
							<a href={link.href}>{link.title}</a>{/each}
					</p>
				{/if}
			</div>
			{#if preset}
				<div class="preset-note"><PresetNote {preset} /></div>
			{/if}
		</div>
	</Panel>

	{#if analysisFailure}
		<Callout tone="warn"><p>{analysisFailure}</p></Callout>
	{/if}

	{#if analysis && table && order}
		<div class={['results', { 'stale-data': analysisStale }]} aria-busy={analysisStale}>
			{#if grammarStale}
				<p class="stale-note" role="status">Showing the last grammar without errors.</p>
			{/if}
			{#each table.diagnostics as d, i (i)}
				<Callout tone="warn"><p>{d.message}</p></Callout>
			{/each}
			{#if analysis.causes}
				<NotLL1
					causes={analysis.causes}
					{table}
					{ambiguityHref}
					{bottomUp}
					rewrite={(rewrite?.result.changes.length ?? 0) > 0}
					onentry={gotoEntry}
				/>
			{/if}

			<div class="pair">
				<Panel
					title="LL(1) parsing table"
					subtitle={table.ll1 ? 'no entry is multiply defined' : 'G is not LL(1)'}
					id="ll1-table"
				>
					{#snippet actions()}
						{#if analysisBusy}<Updating />{/if}
					{/snippet}
					<div class="table-panel">
						<TableView
							{table}
							rows={order.rows}
							columns={order.columns}
							{selected}
							onselect={select}
							label="LL(1) parsing table: rows are non-terminals, columns are terminals and $"
						/>
						<p class="legend">
							A cell holds the right-hand side to use; a blank cell is an error. $ is the end
							marker.
						</p>
						<EntryNote view={entry} />
						<div class="order">
							<TextField
								label="Rows"
								size="sm"
								mono
								spellcheck="false"
								autocapitalize="off"
								placeholder={orderText(table.rows)}
								bind:value={form.rows}
							/>
							<TextField
								label="Columns"
								size="sm"
								mono
								spellcheck="false"
								autocapitalize="off"
								placeholder={orderText(table.columns)}
								bind:value={form.columns}
							/>
							<Button
								size="sm"
								variant="ghost"
								disabled={form.rows === '' && form.columns === ''}
								onclick={() => {
									form.rows = '';
									form.columns = '';
								}}>Grammar order</Button
							>
							{#if skipped.length > 0}
								<p class="skipped">
									Skipped, not symbols of this table:
									<span class="mono">{skipped.map((s) => printSymbols([s])).join(' ')}</span>
								</p>
							{/if}
						</div>
					</div>
				</Panel>

				<Panel title="First and Follow" subtitle="the rules applied until no set changes">
					{#snippet actions()}
						<Toggle bind:checked={form.fill} label="Fill in" onchange={() => setStepper.pause()} />
					{/snippet}
					{#key shown?.text}
						<SetsPanel
							grammar={table.grammar}
							ff={table.firstFollow}
							{steps}
							stepper={setStepper}
							fill={form.fill}
							used={entry?.sets ?? []}
						/>
					{/key}
				</Panel>
			</div>

			<Panel
				title="Rewrite for LL(1)"
				subtitle="left recursion removed and left-factored, without EBNF"
			>
				{#if rewrite}
					<RewritePanel
						rewrite={rewrite.result}
						before={table}
						after={rewrite.table}
						bind:names={form.names}
						rows={form.rows}
						columns={form.columns}
						{inUse}
						onuse={useRewrite}
					/>
				{/if}
			</Panel>
		</div>
	{:else if !analysisFailure}
		<Callout tone="info">
			<p>The table appears once the grammar has no errors.</p>
		</Callout>
	{/if}

	<Panel title="Parse" subtitle="the LL(1) parsing algorithm on a token string">
		{#snippet actions()}
			{#if parseBusy}<Updating />{/if}
		{/snippet}
		<div class="parse-panel">
			<div class="input">
				<TextField
					label="Token string"
					description="Terminals of the grammar, separated by spaces; $ is added at the end."
					mono
					bind:value={form.input}
					oninput={inputEdited}
					error={tokens?.error ?? undefined}
					placeholder="int * int"
					spellcheck="false"
					autocapitalize="off"
				/>
			</div>
			{#if parseFailure}
				<Callout tone="warn"><p>{parseFailure}</p></Callout>
			{/if}
			{#if parse && parseTask.input}
				<div class={['parse-result', { 'stale-data': parseStale }]} aria-busy={parseStale}>
					{#each parse.parse.diagnostics as d, i (i)}
						<Callout tone="warn"><p>{d.message}</p></Callout>
					{/each}
					<ParsePanel
						parse={parse.parse}
						tokens={parseTask.input.tokens}
						table={parse.table}
						order={tableOrder(parse.table, form.rows, form.columns)}
						stepper={parseStepper}
					/>
				</div>
			{:else if !parseFailure}
				<p class="empty">The parse appears once the grammar and the token string have no errors.</p>
			{/if}
		</div>
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
		gap: var(--space-3);
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
	.results {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.stale-note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1100px) {
		.pair {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		}
	}
	.table-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.legend {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.order {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: end;
		gap: var(--space-2) var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.order :global(button) {
		justify-self: start;
	}
	.skipped {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.parse-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.input {
		max-width: 36rem;
	}
	.parse-result {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
