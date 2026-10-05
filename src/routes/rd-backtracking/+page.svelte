<script lang="ts">
	import { untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import {
		Button,
		Callout,
		Icon,
		Panel,
		PresetMenu,
		Stepper,
		Tabs,
		TextField,
		Toggle,
		ToolPage
	} from '$lib/components/ui';
	import { tool } from '$lib/tools/catalog/rd-backtracking';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { DEFAULT_DEPTH_CAP } from '$lib/tools/rd-backtracking/backtrack';
	import BacktrackingTab from '$lib/tools/rd-backtracking/BacktrackingTab.svelte';
	import FunctionsTab from '$lib/tools/rd-backtracking/FunctionsTab.svelte';
	import PresetNote from '$lib/tools/rd-backtracking/PresetNote.svelte';
	import { presetFor, presets, type RdPreset } from '$lib/tools/rd-backtracking/presets';
	import { reverseAlternatives } from '$lib/tools/rd-backtracking/reverse';
	import {
		analyze,
		showsLimitation,
		summarize,
		type Run
	} from '$lib/tools/rd-backtracking/session';
	import {
		DEFAULT_STATE,
		isRdHash,
		stateFromHash,
		type RdState,
		type TabId
	} from '$lib/tools/rd-backtracking/state';
	import SummaryStrip from '$lib/tools/rd-backtracking/SummaryStrip.svelte';
	import { languageLine } from '$lib/tools/rd-backtracking/view';
	import { syncToHash } from '$lib/url-state';

	let form = $state<RdState>({ ...DEFAULT_STATE });

	/** The last run of inputs without errors, shown faded while the inputs have errors. */
	let lastRun: Run | null = null;

	syncToHash(() => form, {
		validate: isRdHash,
		onLoad: (value) => {
			// A loaded link starts afresh: no fallback to a run the link does not describe.
			lastRun = null;
			Object.assign(form, stateFromHash(value));
		}
	});

	// Both runs are bounded by a step budget, so they follow every keystroke.
	const analysis = $derived(analyze(form.grammar, form.input, { anyway: form.anyway }));
	const run = $derived.by(() => {
		lastRun = analysis.run ?? lastRun;
		return lastRun;
	});
	const stale = $derived(run !== null && analysis.run === null);

	const backSteps = $derived(run?.backtracking?.steps.length ?? 0);
	const functionSteps = $derived(run?.limited?.steps.length ?? 0);
	const back = new Stepper(() => backSteps, { index: untrack(() => Math.max(0, backSteps - 1)) });
	const functions = new Stepper(() => functionSteps, {
		index: untrack(() => Math.max(0, functionSteps - 1))
	});

	// form.step and form.fstep (null = the last step) drive the steppers…
	$effect(() => {
		const n = backSteps;
		const step = form.step;
		untrack(() => back.set(step === null ? n - 1 : step));
	});
	$effect(() => {
		const n = functionSteps;
		const step = form.fstep;
		untrack(() => functions.set(step === null ? n - 1 : step));
	});
	// …and the steppers write back where they are, for the share link.
	$effect(() => {
		const i = back.index;
		const n = backSteps;
		untrack(() => {
			if (n === 0) return;
			const next = i >= n - 1 ? null : i;
			if (form.step !== next) form.step = next;
		});
	});
	$effect(() => {
		const i = functions.index;
		const n = functionSteps;
		untrack(() => {
			if (n === 0) return;
			const next = i >= n - 1 ? null : i;
			if (form.fstep !== next) form.fstep = next;
		});
	});

	function pause() {
		back.pause();
		functions.pause();
	}

	/** An edit shows the end of the new run. */
	function edited() {
		pause();
		form.step = null;
		form.fstep = null;
	}

	const preset = $derived(presetFor(form.grammar, form.input, form.tab));

	function loadPreset(p: RdPreset) {
		pause();
		Object.assign(form, { ...DEFAULT_STATE, ...p.value, numbers: p.value.numbers ?? false });
	}

	const reversed = $derived(reverseAlternatives(form.grammar));
	const canReverse = $derived(reversed !== null && reversed !== form.grammar);

	function reverse() {
		if (reversed === null) return;
		form.grammar = reversed;
		edited();
	}

	const inputError = $derived(
		analysis.inputDiagnostics.find((d) => d.severity === 'error')?.message
	);

	/** Shown only for the grammar as it is now, not for a faded earlier run. */
	const leftRecursive = $derived(analysis.run?.leftRecursion ?? []);

	// Other tools open on this grammar, and on the token stream while it has no errors.
	const links = $derived.by(() => {
		if (!analysis.grammar) return { predictive: null, grammar: null };
		const state = analysis.run
			? { grammar: form.grammar, input: form.input }
			: { grammar: form.grammar };
		return {
			predictive: toolLink('rd-predictive', state),
			grammar: toolLink('grammar', state)
		};
	});
	const predictiveTitle = toolBySlug('rd-predictive')?.title ?? 'Predictive Recursive Descent';
	const grammarTitle = toolBySlug('grammar')?.title ?? 'Context-Free Grammars';
	/** The links that exist: a tool that is not part of the site has none. */
	const openIn = $derived(
		[
			{ title: grammarTitle, href: links.grammar },
			{ title: predictiveTitle, href: links.predictive }
		].filter((link): link is { title: string; href: string } => link.href !== null)
	);

	const TABS: { id: TabId; label: string }[] = [
		{ id: 'backtracking', label: 'Backtracking' },
		{ id: 'functions', label: 'bool functions' }
	];
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
					diagnostics={analysis.grammarDiagnostics}
					nonterminals={analysis.grammar?.nonterminals}
					terminals={analysis.grammar?.terminals}
					minRows={3}
					maxRows={12}
					placeholder="E → T | T + E"
				/>
				<div class="grammar-actions">
					<Button
						size="sm"
						disabled={!canReverse}
						title="Same grammar, different order: the alternatives of every non-terminal in reverse"
						onclick={reverse}
					>
						{#snippet icon()}<Icon name="reset" size={15} />{/snippet}
						Reverse alternative order
					</Button>
					<span class="hint">Alternatives are tried in the order written.</span>
				</div>
				<TextField
					label="Token stream"
					description="Terminals of the grammar, separated by spaces."
					mono
					bind:value={form.input}
					oninput={edited}
					error={inputError}
					placeholder="( int )"
					spellcheck="false"
					autocapitalize="off"
				/>
				{#if openIn.length > 0}
					<p class="open-in">
						Open this grammar in
						{#each openIn as link, i (link.title)}
							{i > 0 ? ' or ' : ''}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
							<a href={link.href}>{link.title}</a>
						{/each}
					</p>
				{/if}
			</div>
			{#if preset}
				<div class="preset-note"><PresetNote {preset} program={run?.program} /></div>
			{/if}
		</div>
	</Panel>

	{#if leftRecursive.length > 0}
		{@const first = leftRecursive[0]}
		<Callout tone="warn" title="The grammar is left-recursive">
			<p>
				{#if first.immediate}
					While parsing <code>{first.nonterminal}</code>, the production
					<code>{first.productions[0]}</code> is tried. Its first symbol is
					<code>{first.nonterminal}</code> again, with the input pointer where it was, so the same production
					can be tried again and again without a token being matched.
				{:else}
					<code>{first.nonterminal}</code> →⁺ <code>{first.nonterminal}</code> … through
					{#each first.productions as p, i (i)}{#if i > 0},
						{/if}<code>{p}</code>{/each}. Parsing <code>{first.nonterminal}</code> comes back to
					<code>{first.nonterminal}</code> with the input pointer where it was.
				{/if}
				{#if leftRecursive.length > 1}
					Also left-recursive:
					{#each leftRecursive.slice(1) as l, i (l.nonterminal)}{#if i > 0},
						{/if}<code>{l.nonterminal}</code>{/each}.
				{/if}
			</p>
			<p>
				Left recursion must be eliminated before recursive descent{form.anyway
					? '.'
					: ', so the parsers are not run on this grammar.'}
				{#if links.predictive}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
					<a href={links.predictive}>Open it in {predictiveTitle}</a>.
				{/if}
			</p>
			<div class="anyway">
				<Toggle
					bind:checked={form.anyway}
					label="Run anyway"
					description="Stops when {DEFAULT_DEPTH_CAP} instances are nested with no token matched between them."
					onchange={edited}
				/>
			</div>
		</Callout>
	{/if}

	{#if run}
		<div class={['results', { stale }]}>
			{#if stale}
				<p class="stale-note" role="status">
					<Icon name="info" size={16} />
					<span>Showing the last grammar and token stream without errors.</span>
				</p>
			{/if}

			<SummaryStrip
				rows={summarize(run)}
				language={languageLine(run)}
				limitation={showsLimitation(run)}
			/>

			<Tabs tabs={TABS} bind:value={form.tab} label="Parsers" onchange={pause}>
				{#snippet children(id)}
					{#if id === 'functions'}
						<FunctionsTab {run} result={run.limited} stepper={functions} />
					{:else if run.backtracking}
						<BacktrackingTab
							{run}
							result={run.backtracking}
							stepper={back}
							bind:numbers={form.numbers}
						/>
					{:else}
						<Callout tone="info" title="Not run">
							<p>
								The grammar is left-recursive. Turn on “Run anyway” above to run it with a limit on
								the nesting.
							</p>
						</Callout>
					{/if}
				{/snippet}
			</Tabs>
		</div>
	{:else}
		<Callout tone="info">
			<p>The parsers run when the grammar and the token stream have no errors.</p>
		</Callout>
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
	.grammar-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
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
	.anyway {
		margin-top: var(--space-3);
	}
	.results {
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
	.results.stale :global(.parser-summary),
	.results.stale :global(.tabs) {
		opacity: 0.55;
		transition: opacity var(--duration) var(--ease);
	}
</style>
