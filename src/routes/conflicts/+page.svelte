<script lang="ts">
	import { untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import {
		Button,
		Callout,
		Icon,
		Panel,
		PresetMenu,
		SegmentedControl,
		TextField,
		ToolPage,
		Updating,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import { parseGrammar, tokenizeInput } from '$lib/theory/grammar/parse';
	import { END_MARKER } from '$lib/theory/grammar/types';
	import { tool } from '$lib/tools/catalog/conflicts';
	import {
		analyze,
		sameRequest,
		type AnalysisRequest,
		type AnalysisResult
	} from '$lib/tools/conflicts/analysis';
	import BisonImport from '$lib/tools/conflicts/BisonImport.svelte';
	import BisonReportView from '$lib/tools/conflicts/BisonReportView.svelte';
	import ClassesPanel from '$lib/tools/conflicts/ClassesPanel.svelte';
	import ConflictCard from '$lib/tools/conflicts/ConflictCard.svelte';
	import ParseCard from '$lib/tools/conflicts/ParseCard.svelte';
	import { readPrecedenceText } from '$lib/tools/conflicts/precedence';
	import PrecedenceEditor from '$lib/tools/conflicts/PrecedenceEditor.svelte';
	import PresetNote from '$lib/tools/conflicts/PresetNote.svelte';
	import {
		DEFAULT_PRESET_ID,
		presetFor,
		presetState,
		presets,
		type ConflictsPresetValue
	} from '$lib/tools/conflicts/presets';
	import {
		DEFAULT_STATE,
		isConflictsHash,
		stateFromHash,
		withChoice,
		type ConflictsState,
		type ItemsView
	} from '$lib/tools/conflicts/state';
	import { choiceValue, entryText } from '$lib/tools/conflicts/view';
	import { createAnalysisWorker } from '$lib/tools/conflicts/worker';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';

	let form = $state<ConflictsState>({ ...DEFAULT_STATE, choices: [] });
	/** The preset loaded last, shown for as long as it fits the state. */
	let loaded = $state<string | null>(DEFAULT_PRESET_ID);
	/** Every conflict is listed, not only the first CONFLICT_PAGE. */
	let showAll = $state(false);

	function load(state: ConflictsState, preset: string | null) {
		Object.assign(form, state);
		showAll = false;
		loaded = preset ?? presetFor(form)?.id ?? null;
	}

	syncToHash(() => form, {
		validate: isConflictsHash,
		onLoad: (value) => load(stateFromHash(value), null)
	});

	const preset = $derived(presetFor(form, loaded));

	function loadPreset(p: Preset<ConflictsPresetValue>) {
		load(presetState(p), p.id);
	}

	// Reading the grammar, the declarations and the token string is cheap: it follows every keystroke.
	const parsed = $derived(parseGrammar(form.grammar));
	const grammar = $derived(parsed.grammar);
	const precedence = $derived(readPrecedenceText(form.precedence, grammar));
	const inputRead = $derived(
		grammar && form.input.trim() !== ''
			? tokenizeInput(form.input, [...grammar.terminals, END_MARKER], {
					nonterminals: grammar.nonterminals
				})
			: null
	);
	const inputError = $derived(
		inputRead?.diagnostics.find((d) => d.severity === 'error')?.message ?? ''
	);

	/** A new grammar or new declarations have new conflicts: the choices made are dropped. */
	function edited() {
		if (form.choices.length) form.choices = [];
		showAll = false;
	}

	function useImport(text: string, declarations: string) {
		form.grammar = text;
		form.precedence = declarations;
		edited();
		loaded = null;
	}

	// The tables, conflicts, parses and report: in a worker, as the C- grammar has hundreds of states.
	const request = $derived<AnalysisRequest | null>(
		grammar
			? {
					grammar: form.grammar,
					precedence: form.precedence,
					input: form.input,
					choices: $state.snapshot(form.choices)
				}
			: null
	);
	const task = new WorkerTask<AnalysisRequest, AnalysisResult>({
		compute: analyze,
		worker: createAnalysisWorker,
		// The default preset, computed at once so the prerendered page shows its results.
		initial: untrack(() => request) ?? undefined
	});
	$effect(() => {
		if (request) task.run(request);
	});
	const result = $derived(task.output);
	const done = $derived(result?.status === 'done' ? result : null);
	/** The result shown is for other inputs: the grammar has errors, or a newer one is computed. */
	const stale = $derived(result !== null && !sameRequest(task.input, request));
	const failure = $derived(
		task.status === 'timed-out'
			? 'This grammar takes too long to analyze.'
			: task.status === 'error'
				? `The analysis failed${task.error ? ` (${task.error})` : ''}.`
				: null
	);

	/** Conflicts listed before "Show all". */
	const CONFLICT_PAGE = 12;
	const shownConflicts = $derived(
		done ? (showAll ? done.conflicts : done.conflicts.slice(0, CONFLICT_PAGE)) : []
	);

	function choose(index: number, winner: 0 | 1 | 'error', value: 0 | 1 | 2) {
		const keep = value === 2 || value === winner;
		form.choices = withChoice(form.choices, index, keep ? null : (value as 0 | 1));
	}

	/** The entries the other parse changes, in words: action[6, +] = red. E → E * E. */
	const changes = $derived(
		done
			? done.choices.flatMap(([index, action]) => {
					const c = done.conflicts[index];
					return c ? [`${entryText(c.state, c.terminal)} = ${c.moves[action].text}`] : [];
				})
			: []
	);

	let report: BisonReportView | undefined = $state();

	const ITEMS: { value: ItemsView; label: string }[] = [
		{ value: 'partial', label: 'Items involved' },
		{ value: 'full', label: 'Whole states' }
	];

	// The other parsing tools open on the grammar; the token string goes without its $.
	const openIn = $derived.by(() => {
		if (!grammar) return [];
		const plain = form.input.trim().replace(/\s*\$$/, '');
		const state = plain ? { grammar: form.grammar, input: plain } : { grammar: form.grammar };
		return (['ll1', 'shift-reduce', 'lr1'] as const).flatMap((slug) => {
			const title = toolBySlug(slug)?.title;
			const href = toolLink(slug, state);
			return title && href ? [{ title, href }] : [];
		});
	});
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Grammar" subtitle="and bison’s precedence declarations">
		<div class={['input-grid', { 'has-note': !!preset }]}>
			<div class="inputs">
				<div class="editors">
					<GrammarEditor
						label="Grammar"
						bind:value={form.grammar}
						oninput={edited}
						diagnostics={parsed.diagnostics}
						nonterminals={grammar?.nonterminals}
						terminals={grammar?.terminals}
						minRows={3}
						maxRows={14}
						placeholder="E → E + E | E * E | int"
					/>
					<PrecedenceEditor
						bind:value={form.precedence}
						lines={precedence.lines}
						diagnostics={precedence.diagnostics}
						oninput={edited}
					/>
				</div>
				<BisonImport onuse={useImport} />
				{#if openIn.length > 0}
					<p class="open-in">
						Open in
						{#each openIn as link, i (link.href)}
							{i > 0 ? (i === openIn.length - 1 ? ' or ' : ', ') : ''}
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

	{#if failure}
		<Callout tone="error"><p>{failure}</p></Callout>
	{/if}
	{#if stale && !grammar}
		<p class="stale-note" role="status">
			<Icon name="info" size={16} />
			<span>Showing the results for the last grammar without errors.</span>
		</p>
	{/if}

	{#if result === null}
		<Panel title="Conflicts">
			<p class="empty">The conflicts appear once the grammar has no errors.</p>
		</Panel>
	{:else if result.status === 'too-large'}
		<Callout tone="warn"><p>{result.message}</p></Callout>
	{:else if done}
		<div class={['results', { 'stale-data': stale }]} aria-busy={stale}>
			<Panel title="Conflicts" subtitle="of the LR(1) table, {done.states} states">
				{#snippet actions()}
					{#if stale && grammar}<Updating />{/if}
					<SegmentedControl label="Items shown" size="sm" options={ITEMS} bind:value={form.items} />
				{/snippet}
				<div class="conflicts">
					{#if done.conflictCount === 0}
						<p class="summary">The LR(1) table has no conflicts.</p>
					{:else}
						<div class="summary">
							{#if done.summary.length}
								<pre class="bison">{done.summary.join('\n')}</pre>
							{/if}
							<p>
								{done.conflictCount}
								{done.conflictCount === 1 ? 'conflict' : 'conflicts'}:
								{#if done.resolved}{done.resolved} settled by precedence{done.unresolved.sr +
									done.unresolved.rr
										? ', '
										: '.'}{/if}
								{#if done.unresolved.sr + done.unresolved.rr}
									{done.unresolved.sr + done.unresolved.rr} left to bison’s default (shift; the earlier
									rule of a reduce/reduce conflict), which bison reports.
								{/if}
							</p>
						</div>
						<div class="cards">
							{#each shownConflicts as conflict (conflict.index)}
								<ConflictCard
									{conflict}
									mode={form.items}
									lines={precedence.lines}
									choice={choiceValue(conflict, form.choices)}
									onchoose={(v) => choose(conflict.index, conflict.explanation.winner, v)}
									onshowstate={(n) => report?.show(n)}
								/>
							{/each}
						</div>
						{#if done.conflicts.length > shownConflicts.length}
							<div>
								<Button size="sm" onclick={() => (showAll = true)}>
									Show all {done.conflicts.length} conflicts
								</Button>
							</div>
						{/if}
						{#if done.conflictCount > done.conflicts.length}
							<p class="empty">
								… and {done.conflictCount - done.conflicts.length} more, not described here.
							</p>
						{/if}
					{/if}
				</div>
			</Panel>

			<Panel title="Parse" subtitle="the token string with the table as resolved">
				<div class="parse">
					<TextField
						label="Token string"
						mono
						bind:value={form.input}
						error={inputError}
						placeholder="int + int * int"
						spellcheck="false"
						autocomplete="off"
					/>
					{#if done.parse && done.tokens}
						<div class={['trees', { pair: !!done.alternative }]}>
							<ParseCard title="As resolved" parse={done.parse} tokens={done.tokens} tone={0} />
							{#if done.alternative}
								<ParseCard
									title="With the other action"
									parse={done.alternative}
									tokens={done.tokens}
									tone={1}
								>
									<ul class="changes">
										{#each changes as change (change)}<li>{change}</li>{/each}
									</ul>
								</ParseCard>
							{/if}
						</div>
						{#if !done.alternative && done.conflictCount > 0}
							<p class="empty">
								Choose the other action of a conflict above to parse the token string with it here,
								beside the parse as resolved.
							</p>
						{/if}
					{:else if !inputError}
						<p class="empty">Type a token string to parse it.</p>
					{/if}
				</div>
			</Panel>

			<Panel title="Parser.output" subtitle="bison –v Parser.yy -o Parser.cc">
				<BisonReportView
					bind:this={report}
					report={done.report}
					lr1States={done.states}
					useless={done.useless}
				/>
			</Panel>

			<Panel title="Grammar classes" subtitle="LL(1), LR(0), SLR(1), LALR(1), LR(1)">
				<ClassesPanel classes={done.classes} />
			</Panel>
		</div>
	{/if}
</ToolPage>

<style>
	.input-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
	}
	@media (min-width: 1100px) {
		.input-grid.has-note {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		}
	}
	.inputs {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.editors {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 760px) {
		.editors {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
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
	@media (min-width: 1100px) {
		.preset-note {
			padding: var(--space-1) 0 0 var(--space-5);
			border-top: 0;
			border-left: 1px solid var(--border);
		}
	}
	.results,
	.conflicts,
	.parse {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.results {
		gap: var(--space-5);
	}
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}
	.summary p {
		margin: 0;
		color: var(--text-2);
	}
	.bison {
		align-self: flex-start;
		max-width: 100%;
		margin: 0;
		padding: 6px 12px;
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 34rem), 1fr));
		gap: var(--space-4);
		align-items: start;
	}
	.trees {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 900px) {
		.trees.pair {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.changes {
		margin: 0;
		padding: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		list-style: none;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
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
