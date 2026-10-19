<script lang="ts">
	import { untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import {
		Callout,
		Icon,
		Panel,
		PresetMenu,
		Stepper,
		Tabs,
		TextField,
		ToolPage,
		Updating,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import { tool } from '$lib/tools/catalog/shift-reduce';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import ConflictNote from '$lib/tools/shift-reduce/ConflictNote.svelte';
	import HandlesPanel from '$lib/tools/shift-reduce/HandlesPanel.svelte';
	import {
		MAX_HANDLE_TOKENS,
		computeParse,
		readGrammar,
		readInput,
		sameRequest,
		type ParseOutcome,
		type ParseRequest,
		type ParseView
	} from '$lib/tools/shift-reduce/model';
	import PresetNote from '$lib/tools/shift-reduce/PresetNote.svelte';
	import {
		DEFAULT_PRESET_ID,
		presetFor,
		presetState,
		presets,
		type ShiftReducePresetValue
	} from '$lib/tools/shift-reduce/presets';
	import {
		DEFAULT_STATE,
		isShiftReduceHash,
		stateFromHash,
		type ShiftReduceState,
		type ViewId
	} from '$lib/tools/shift-reduce/state';
	import { linkStep, stepperIndex } from '$lib/tools/shift-reduce/steps';
	import TracePanel from '$lib/tools/shift-reduce/TracePanel.svelte';
	import { convertStep, finalRows, stopReason, traceRows } from '$lib/tools/shift-reduce/view';
	import { createParseWorker } from '$lib/tools/shift-reduce/worker';
	import { syncToHash } from '$lib/url-state';

	/** The forest is drawn for token strings of up to this many tokens. */
	const MAX_TREE_TOKENS = 150;

	let form = $state<ShiftReduceState>({ ...DEFAULT_STATE });
	/** The preset loaded last, shown for as long as it fits the state. */
	let loaded = $state<string | null>(DEFAULT_PRESET_ID);

	function load(state: ShiftReduceState, preset: string | null) {
		pause();
		Object.assign(form, state);
		loaded = preset ?? presetFor(form)?.id ?? null;
	}

	syncToHash(() => form, {
		validate: isShiftReduceHash,
		onLoad: (value) => load(stateFromHash(value), null)
	});

	// Reading the grammar and the token string follows every keystroke; the parse runs in a worker.
	const grammar = $derived(readGrammar(form.grammar));
	const input = $derived(grammar.grammar ? readInput(form.input, grammar.grammar) : null);
	const request = $derived<ParseRequest | null>(
		grammar.grammar && input && !input.error ? { grammar: form.grammar, input: form.input } : null
	);

	const first = untrack(() => request);
	const task = new WorkerTask<ParseRequest, ParseOutcome>({
		compute: computeParse,
		worker: createParseWorker,
		initial: first ?? undefined
	});
	$effect(() => {
		if (request) task.run(request);
	});

	const outcome = $derived(task.output);
	const result = $derived<ParseView | null>(outcome?.kind === 'parse' ? outcome : null);
	/** The result shown is for other inputs: these have errors, or the newer result is coming. */
	const stale = $derived(outcome !== null && !sameRequest(task.input, request));
	/** The parse shown is the parse of the grammar and token string on the page. */
	const current = $derived(result !== null && sameRequest(task.input, request));

	const rows = $derived(result ? traceRows(result.parse, form.collapse) : []);
	const treeRows = $derived(result ? finalRows(result.parse) : 1);
	const handleCount = $derived(result?.handles?.length ?? 0);

	const traceStepper = new Stepper(() => rows.length, {
		index: untrack(() => form.step ?? Math.max(0, rows.length - 1))
	});
	const handleStepper = new Stepper(() => handleCount, {
		index: untrack(() => form.handleStep ?? Math.max(0, handleCount - 1))
	});

	// form.step and form.handleStep (null = the last) drive the steppers… Both ways wait for
	// the parse of the page's own grammar and token string: a link's step can be past the end
	// of the parse shown until then (steps.ts).
	$effect(() => {
		const at = stepperIndex(form.step, rows.length, current);
		if (at !== null) untrack(() => traceStepper.set(at));
	});
	$effect(() => {
		const at = stepperIndex(form.handleStep, handleCount, current);
		if (at !== null) untrack(() => handleStepper.set(at));
	});
	// …and the steppers write back where they are, for the share link.
	$effect(() => {
		const next = linkStep(traceStepper.index, rows.length, current);
		untrack(() => {
			if (next !== undefined && form.step !== next) form.step = next;
		});
	});
	$effect(() => {
		const next = linkStep(handleStepper.index, handleCount, current);
		untrack(() => {
			if (next !== undefined && form.handleStep !== next) form.handleStep = next;
		});
	});

	function pause() {
		traceStepper.pause();
		handleStepper.pause();
	}

	/** An edit shows the end of the new parse. */
	function edited() {
		pause();
		form.step = null;
		form.handleStep = null;
	}

	/** Collapsing or expanding the shifts keeps the configuration shown. */
	function setCollapse(collapse: boolean) {
		if (collapse === form.collapse) return;
		if (result && form.step !== null) {
			const next = traceRows(result.parse, collapse);
			form.step = convertStep(rows, next, form.step);
		}
		form.collapse = collapse;
	}

	const preset = $derived(presetFor(form, loaded));

	function loadPreset(p: Preset<ShiftReducePresetValue>) {
		load(presetState(p), p.id);
	}

	// Other parsing tools open on the grammar, and on the token string while it has no errors.
	const linkState = $derived(
		input && !input.error && form.input.trim()
			? { grammar: form.grammar, input: form.input }
			: { grammar: form.grammar }
	);
	function linkTo(slug: 'll1' | 'lr1' | 'conflicts') {
		const title = toolBySlug(slug)?.title;
		const href = toolLink(slug, linkState);
		return title && href ? { title, href } : null;
	}
	const openIn = $derived(
		grammar.grammar
			? (['lr1', 'll1', 'conflicts'] as const).flatMap((slug) => {
					const link = linkTo(slug);
					return link ? [link] : [];
				})
			: []
	);
	const tableLink = $derived(grammar.grammar ? linkTo('lr1') : null);
	const conflictsLink = $derived(grammar.grammar ? linkTo('conflicts') : null);

	const TABS: { id: ViewId; label: string }[] = [
		{ id: 'trace', label: 'Shift-reduce trace' },
		{ id: 'handles', label: 'Handles' }
	];

	const outcomeLine = $derived.by(() => {
		if (!result) return '';
		const p = result.parse;
		const tokens = p.input.length - 1;
		const what = `${tokens} ${tokens === 1 ? 'token' : 'tokens'}, ${result.states} LR(1) states`;
		if (p.outcome === 'accept') return `Accepted: ${what}.`;
		if (p.outcome === 'error') return `Rejected: ${what}.`;
		const reason = stopReason(p);
		return reason ? `Stopped: ${what}; ${reason}.` : `Stopped: ${what}.`;
	});
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel>
		<div class={['input-grid', { 'has-note': !!preset }]}>
			<div class="input-main">
				<GrammarEditor
					label="Grammar"
					bind:value={form.grammar}
					oninput={edited}
					diagnostics={grammar.diagnostics}
					nonterminals={grammar.grammar?.nonterminals}
					terminals={grammar.grammar?.terminals}
					minRows={2}
					maxRows={12}
					placeholder="E → E + ( E ) | int"
				/>
				<TextField
					label="Token string"
					description="Terminals of the grammar, separated by spaces. The $ at the end may be left out."
					mono
					bind:value={form.input}
					oninput={edited}
					error={input?.error ?? undefined}
					placeholder="int + ( int )"
					spellcheck="false"
					autocapitalize="off"
				/>
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

	{#if outcome?.kind === 'problem'}
		<Callout tone="error" class={{ 'stale-data': stale }}>
			<p>{outcome.message}</p>
		</Callout>
	{:else if result}
		<div class={['results', { 'stale-data': stale }]} aria-busy={stale}>
			<div class="status-line">
				<p class={['outcome', result.parse.outcome]}>{outcomeLine}</p>
				{#if stale && !request}
					<p class="stale-note" role="status">
						<Icon name="info" size={16} />
						<span>Showing the last grammar and token string without errors.</span>
					</p>
				{:else if stale && task.status === 'working'}
					<Updating />
				{/if}
			</div>
			{#if stale && task.status === 'timed-out'}
				<Callout tone="warn">
					<p>
						This grammar and token string take too long to parse; the result shown is for the last
						ones parsed.
					</p>
				</Callout>
			{:else if stale && task.status === 'error'}
				<Callout tone="error"><p>The parse failed: {task.error}</p></Callout>
			{/if}

			{#if result.conflicts.length > 0}
				<ConflictNote conflicts={result.conflicts} link={conflictsLink} />
			{/if}

			<Panel>
				<Tabs tabs={TABS} bind:value={form.view} label="Views of the parse" onchange={pause}>
					{#snippet children(id)}
						{#if id === 'handles'}
							{#if result.handles}
								<HandlesPanel
									{result}
									handles={result.handles}
									stepper={handleStepper}
									{treeRows}
									maxTreeTokens={MAX_TREE_TOKENS}
								/>
							{:else if result.handlesSkipped}
								<p class="empty">
									The handles are listed for token strings of up to {MAX_HANDLE_TOKENS} tokens.
								</p>
							{:else}
								<p class="empty">
									The parse stops before it reaches the start symbol, so there is no reverse
									rightmost derivation to list. The trace shows where it stops.
								</p>
							{/if}
						{:else}
							<TracePanel
								{result}
								{rows}
								stepper={traceStepper}
								collapse={form.collapse}
								bind:stacks={form.stacks}
								{treeRows}
								maxTreeTokens={MAX_TREE_TOKENS}
								oncollapse={setCollapse}
								{tableLink}
							/>
						{/if}
					{/snippet}
				</Tabs>
			</Panel>
		</div>
	{:else if !request}
		<Callout tone="info">
			<p>The parse runs when the grammar and the token string have no errors.</p>
		</Callout>
	{:else if task.status === 'timed-out'}
		<Callout tone="warn"><p>This grammar and token string take too long to parse.</p></Callout>
	{:else if task.status === 'error'}
		<Callout tone="error"><p>The parse failed: {task.error}</p></Callout>
	{:else}
		<Updating standalone label="Parsing…" />
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
	.results {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.status-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-height: 1.5rem;
	}
	.outcome {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.outcome.accept {
		color: var(--accept);
	}
	.outcome.error,
	.outcome.limit {
		color: var(--reject);
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
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
