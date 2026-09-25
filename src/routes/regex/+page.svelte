<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import {
		Button,
		Callout,
		CitationTag,
		CodeEditor,
		Disclosure,
		Icon,
		Panel,
		PresetMenu,
		RegexField,
		SegmentedControl,
		Toggle,
		ToolPage,
		Updating,
		WorkerTask,
		DEFAULT_SYMBOLS,
		type HighlightToken,
		type PaletteSymbol
	} from '$lib/components/ui';
	import { containsAny, nodeAtPath, type PrintOptions } from '$lib/theory/regex';
	import { tool } from '$lib/tools/catalog/regex';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';
	import { ALPHABET_SOURCE, formatAlphabet } from '$lib/tools/regex/alphabet';
	import {
		analyzeExpression,
		convertDialect,
		namedSymbolSets,
		parseCompare,
		thompsonState
	} from '$lib/tools/regex/analysis';
	import type { Bracket } from '$lib/tools/regex/derive';
	import {
		analysisFailed,
		languageBlocked,
		sizeMessage,
		structureBlocked
	} from '$lib/tools/regex/messages';
	import {
		applyPreset,
		DEFAULT_PRESET_ID,
		matchPreset,
		presetById,
		presets,
		type RegexPreset
	} from '$lib/tools/regex/presets';
	import {
		blankState,
		isRegexState,
		normalizeState,
		type Dialect,
		type RegexLinkState,
		type RegexToolState,
		type ViewId
	} from '$lib/tools/regex/state';
	import { nodeText, pathKey } from '$lib/tools/regex/tree';
	import {
		sameExpression,
		testRows,
		viewsComputer,
		type CompareSummary,
		type ViewsData,
		type ViewsRequest
	} from '$lib/tools/regex/views';
	import { createViewsWorker } from '$lib/tools/regex/worker';
	import CompareView from '$lib/tools/regex/CompareView.svelte';
	import LanguageView from '$lib/tools/regex/LanguageView.svelte';
	import SyntaxTree from '$lib/tools/regex/SyntaxTree.svelte';
	import TestStrings from '$lib/tools/regex/TestStrings.svelte';

	const initial = applyPreset(presetById(DEFAULT_PRESET_ID)!, blankState());
	let model = $state<RegexToolState>(initial);

	syncToHash<RegexLinkState>(() => model, {
		onLoad: (v) => {
			Object.assign(model, normalizeState(v));
			replaced();
		},
		validate: isRegexState
	});

	// ---- Inputs ----------------------------------------------------------------

	const FLEX_SYMBOLS: PaletteSymbol[] = [
		{ insert: '|', title: 'Choice' },
		{ insert: '*', title: 'Kleene closure' },
		{ insert: '+', title: 'Positive closure' },
		{ insert: '?', title: 'Optional' },
		{ insert: '(', title: 'Open group' },
		{ insert: ')', title: 'Close group' },
		{ insert: '[', title: 'Start a class such as [a-z]' },
		{ insert: ']', title: 'End a class' },
		{ insert: '"', title: 'Quote a string' },
		{ insert: '.', title: 'Any character except newline' },
		{ insert: '{', title: 'Definition {NAME} or repetition {n,m}' },
		{ insert: '}', title: 'Close { }' }
	];

	const DIALECTS: { value: Dialect; label: string }[] = [
		{ value: 'lecture', label: 'Lecture notation' },
		{ value: 'flex', label: 'flex' }
	];

	const flex = $derived(model.dialect === 'flex');
	const palette = $derived(flex ? FLEX_SYMBOLS : DEFAULT_SYMBOLS);
	const aliases = $derived(flex ? (false as const) : undefined);

	/** The definitions editor is shown once it has text (or was opened) until a preset replaces it. */
	let defsOpen = $state(false);
	$effect(() => {
		if (model.defs.trim() !== '') defsOpen = true;
	});
	const showDefs = $derived(defsOpen || model.defs.trim() !== '');

	/** Bumped when a preset or a link replaces the inputs; the tree starts over (open nodes reset). */
	let loads = $state(0);

	/** A preset or a link replaced the inputs. */
	function replaced() {
		defsOpen = false;
		loads++;
	}

	function load(preset: RegexPreset) {
		Object.assign(model, applyPreset(preset, model));
		replaced();
	}

	function setDialect(to: Dialect) {
		const from = model.dialect;
		if (from === to) return;
		Object.assign(model, convertDialect(model, from, to, model.alphabet), {
			dialect: to,
			node: []
		});
	}

	// ---- Analysis --------------------------------------------------------------
	// Parsing is cheap and follows every keystroke: the fields' diagnostics and
	// the syntax tree. The views built on automata (L(R), the test strings, the
	// comparison, a node's strings) are computed in a worker (views.ts); each
	// shows the last finished result, dimmed while a newer one is computed.

	/** The inputs as typed, parsed only. */
	const typed = $derived(
		analyzeExpression(
			{ re: model.re, defs: model.defs, dialect: model.dialect, alphabet: model.alphabet },
			{ build: false }
		)
	);
	const typedCompare = $derived(parseCompare(typed, model.compare));

	const root = $derived(typed.re.regex);
	const typedUsesAny = $derived(root ? containsAny(root) : false);
	const defNames = $derived(new Set(typed.defs.defs.keys()));
	const sigmaPlaceholder = $derived(
		typed.inferred && !typedUsesAny
			? `inferred: ${formatAlphabet(typed.inferred, { names: defNames })}`
			: 'e.g. { 0, 1 }'
	);

	const printOpts = $derived<PrintOptions>({
		...typed.print,
		parens: model.full ? 'full' : 'minimal'
	});
	const definitionText = (name: string) => typed.defs.entries.find((e) => e.name === name)?.text;

	// The selected tree node, marked where it was written (R or a definition). A
	// definition use also marks the definition's line. The root (all of R) is not marked.
	const selectedPath = $derived(root && nodeAtPath(root, model.node) ? model.node : []);
	const selectedNode = $derived(root ? (nodeAtPath(root, selectedPath) ?? null) : null);
	const span = $derived(selectedPath.length > 0 ? (selectedNode?.span ?? null) : null);
	const reHighlight = $derived(
		span && span.source === null ? { start: span.start, end: span.end } : null
	);
	const defsMarks = $derived.by(() => {
		const marks: HighlightToken[] = [];
		if (span && span.source !== null)
			marks.push({ from: span.start, to: span.end, className: 'rx-node' });
		const node = selectedNode;
		if (node?.kind === 'ref') {
			const entry = typed.defs.entries.find((e) => e.name === node.name && e.regex === node.body);
			if (entry)
				marks.push({ from: entry.nameSpan.start, to: entry.exprSpan.end, className: 'rx-def' });
		}
		return marks.sort((a, b) => a.from - b.from);
	});

	const structureNote = $derived(structureBlocked(model.re, typed));
	/** Why the language views are empty, from R and Σ as typed. */
	const parseNote = $derived(
		languageBlocked(model.re, { re: typed.re, sigma: typed.sigma, language: null })
	);

	/** Everything the worker needs (plain data: it is copied to the worker). */
	const request = $derived<ViewsRequest>({
		re: model.re,
		defs: model.defs,
		dialect: model.dialect,
		alphabet: model.alphabet,
		compare: model.compare,
		tests: [...model.tests],
		maxLength: model.maxLength,
		node: [...selectedPath]
	});
	const task = new WorkerTask<ViewsRequest, ViewsData>({
		compute: viewsComputer(),
		worker: createViewsWorker,
		// The default preset, computed at once so the prerendered page shows its views.
		initial: untrack(() => request)
	});
	$effect(() => task.run(request));

	/** The last views computed, and the inputs they are for. */
	const done = $derived(
		task.output && task.input ? { data: task.output, input: task.input } : null
	);
	/** Those views are for the R, definitions and Σ typed now. */
	const current = $derived(done !== null && sameExpression(done.input, request));
	/** The parse of the inputs `done` is for: derivations and names refer to it. */
	const doneParse = $derived(
		!done || current ? typed : analyzeExpression(done.input, { build: false })
	);
	/** The computation ran out of time or failed: shown instead of the views. */
	const failure = $derived(parseNote ? null : analysisFailed(task.status, task.error));

	const language = $derived(done?.data.language ?? null);
	const languageStale = $derived(!current || done?.input.maxLength !== model.maxLength);
	const sizeNote = $derived(language && !language.ok ? sizeMessage(language) : null);
	/** Why the language views are empty: R or Σ as typed, or the size of L(R) (maybe for an earlier R). */
	const languageNote = $derived(parseNote ?? sizeNote);

	const rows = $derived(
		parseNote || failure
			? model.tests.map(() => null)
			: testRows(model.tests, done, doneParse.resolved, current)
	);
	const testsStale = $derived(
		!parseNote && !failure && (!current || model.tests.some((t, i) => done?.input.tests[i] !== t))
	);
	const namedSets = $derived(namedSymbolSets(doneParse.defs));
	const bracketPrint = $derived<PrintOptions>({
		...doneParse.print,
		parens: model.full ? 'full' : 'minimal'
	});
	const bracketLabel = (b: Bracket) => nodeText(b.derivation.node, bracketPrint);

	const compareResult = $derived.by((): CompareSummary | null => {
		// R₂ as typed has errors: nothing to compare, whatever was computed before.
		if (typedCompare && !typedCompare.regex)
			return { language: null, comparison: null, tooLarge: false };
		return done?.data.compare ?? null;
	});
	const compareStale = $derived(
		!current || (done !== null && done.input.compare !== model.compare && !!typedCompare?.regex)
	);

	/** Strings of the selected node: only a result for that same node is shown. */
	const sameNode = $derived(done !== null && pathKey(done.input.node) === pathKey(selectedPath));
	const sample = $derived(!failure && sameNode ? (done?.data.sample ?? null) : null);

	const presetMatch = $derived(matchPreset(model));

	// ---- Links -----------------------------------------------------------------

	const hasThompson = toolBySlug('thompson') !== undefined;
	const hasAutomata = toolBySlug('automata') !== undefined;
	const thompsonHref = $derived.by(() => {
		const s = hasThompson ? thompsonState(model, typed) : null;
		return s ? toolLink('thompson', s) : null;
	});
	/** The minimal DFA last built; its link is disabled while a newer one is computed. */
	const automataText = $derived(!parseNote && language?.ok ? language.automataText : null);
	const automataHref = $derived.by(() => {
		if (!hasAutomata || !automataText) return null;
		const input = model.tests[0];
		return toolLink(
			'automata',
			input === undefined ? { text: automataText } : { text: automataText, input }
		);
	});

	// ---- Views -----------------------------------------------------------------

	const views: { id: ViewId; tab: string }[] = [
		{ id: 'structure', tab: 'Structure' },
		{ id: 'language', tab: 'Language' },
		{ id: 'tests', tab: 'Tests' },
		{ id: 'compare', tab: 'Compare' }
	];
	const uid = $props.id();
	const tabId = (id: ViewId) => `${uid}-tab-${id}`;
	const panelId = (id: ViewId) => `${uid}-view-${id}`;

	/** Below the two-column width the views are tabs. */
	let narrow = $state(false);
	onMount(() => {
		const mq = matchMedia('(max-width: 899.98px)');
		const update = () => (narrow = mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	function onTabKeydown(event: KeyboardEvent, index: number) {
		const n = views.length;
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % n;
		else if (event.key === 'ArrowLeft') next = (index - 1 + n) % n;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = n - 1;
		else return;
		event.preventDefault();
		model.view = views[next].id;
		document.getElementById(tabId(views[next].id))?.focus();
	}

	let structurePanel: HTMLElement | undefined = $state();

	/** A derivation bracket selects its node in the tree and brings the tree into view. */
	async function selectFromDerivation(path: number[]) {
		model.node = path;
		if (narrow) model.view = 'structure';
		await tick();
		const row = structurePanel?.querySelector<HTMLElement>(
			'[role="treeitem"][aria-selected="true"]'
		);
		row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
</script>

{#snippet links()}
	<div class="links">
		{#if thompsonHref}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
			<a class="tool-link" href={thompsonHref}>
				Open in Thompson's construction <Icon name="arrow-right" size={15} />
			</a>
		{/if}
		{#if automataHref}
			<!-- Without an href (and dimmed) while the DFA for the R typed is being built. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
			<a
				class={['tool-link', { 'stale-data': !current }]}
				href={current ? automataHref : undefined}
				aria-disabled={!current}
			>
				Open DFA in Finite Automata <Icon name="arrow-right" size={15} />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
{/snippet}

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={presetMatch?.id ?? null} onselect={load} align="end" />
	{/snippet}

	<Panel title="Expression" footer={thompsonHref || automataHref ? links : undefined}>
		{#snippet actions()}
			<SegmentedControl
				label="Notation"
				size="sm"
				value={model.dialect}
				options={DIALECTS}
				onchange={setDialect}
			/>
		{/snippet}
		<div class={['inputs', { 'with-defs': showDefs }]}>
			{#if showDefs}
				<div class="defs">
					<CodeEditor
						label="Regular definitions"
						bind:value={model.defs}
						language={flex ? 'flex-definitions' : 'lecture-definitions'}
						diagnostics={typed.defs.diagnostics}
						highlight={defsMarks.length ? () => defsMarks : undefined}
						placeholder={flex ? 'DIGIT     [0-9]' : "digit = '0' | '1' | … | '9'"}
						minRows={3}
						maxRows={10}
						tabInserts={false}
					/>
					{#if model.defs.trim() === ''}
						<Button variant="ghost" size="sm" onclick={() => (defsOpen = false)}>
							Hide definitions
						</Button>
					{/if}
				</div>
			{/if}
			<div class="fields">
				<RegexField
					label="R ="
					bind:value={model.re}
					symbols={palette}
					{aliases}
					diagnostics={typed.re.diagnostics}
					highlight={reHighlight}
					placeholder={flex ? 'e.g. {LETTER}({LETTER}|{DIGIT})*' : 'e.g. letter (letter | digit)*'}
				/>
				<RegexField
					label="Σ ="
					size="md"
					bind:value={model.alphabet}
					symbols={[]}
					aliases={false}
					source={ALPHABET_SOURCE}
					diagnostics={typed.alphabetDiagnostics}
					placeholder={sigmaPlaceholder}
				/>
				{#if !showDefs}
					<div>
						<Button variant="ghost" size="sm" onclick={() => (defsOpen = true)}>
							{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
							Regular definitions
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</Panel>

	{#if presetMatch?.questions?.length}
		<Panel title="From the slides" level={2} variant="subtle">
			{#snippet actions()}
				{#if presetMatch.cite}<CitationTag cite={presetMatch.cite} />{/if}
			{/snippet}
			<ul class="questions">
				{#each presetMatch.questions as q (q.question)}
					<li>
						<p class={['question', { formal: q.formal }]}>{q.question}</p>
						<Disclosure summary="Show answer" openSummary="Hide answer">
							<p class={['answer', { formal: q.formal }]}>{q.answer}</p>
						</Disclosure>
					</li>
				{/each}
			</ul>
		</Panel>
	{/if}

	<div class="views">
		<div class="view-tabs" role="tablist" aria-label="Views">
			{#each views as v, i (v.id)}
				<button
					type="button"
					role="tab"
					id={tabId(v.id)}
					class="view-tab"
					aria-selected={model.view === v.id}
					aria-controls={panelId(v.id)}
					tabindex={model.view === v.id ? 0 : -1}
					onclick={() => (model.view = v.id)}
					onkeydown={(e) => onTabKeydown(e, i)}>{v.tab}</button
				>
			{/each}
		</div>

		<div class="view-grid">
			<div
				bind:this={structurePanel}
				id={panelId('structure')}
				class={['view', { current: model.view === 'structure' }]}
				role={narrow ? 'tabpanel' : undefined}
				aria-labelledby={narrow ? tabId('structure') : undefined}
			>
				<Panel title="Structure">
					{#snippet actions()}
						<Toggle label="Fully parenthesized" bind:checked={model.full} />
					{/snippet}
					{#if structureNote || !root}
						<p class="view-note">{structureNote}</p>
					{:else}
						{#key loads}
							<SyntaxTree
								{root}
								selected={selectedPath}
								onselect={(p) => (model.node = p)}
								print={printOpts}
								dialect={typed.dialect}
								definition={definitionText}
								{sample}
								sampleStale={!current}
								sampleNote={failure}
							/>
						{/key}
					{/if}
				</Panel>
			</div>

			<div
				id={panelId('language')}
				class={['view', { current: model.view === 'language' }]}
				role={narrow ? 'tabpanel' : undefined}
				aria-labelledby={narrow ? tabId('language') : undefined}
			>
				<Panel title="Language">
					{#snippet actions()}
						{#if !parseNote && !failure && languageStale}<Updating />{/if}
					{/snippet}
					{#if parseNote}
						<p class="view-note">{parseNote}</p>
					{:else if failure}
						<Callout tone="warn">{failure}</Callout>
					{:else if sizeNote}
						<p class={['view-note', { 'stale-data': !current }]} aria-busy={!current}>
							{sizeNote}
						</p>
					{:else if language?.ok}
						<LanguageView
							listing={language.listing}
							bind:maxLength={model.maxLength}
							states={language.states}
							stale={languageStale}
						/>
					{:else}
						<p class="view-note"><Updating label="Listing L(R)…" /></p>
					{/if}
				</Panel>
			</div>

			<div
				id={panelId('tests')}
				class={['view', { current: model.view === 'tests' }]}
				role={narrow ? 'tabpanel' : undefined}
				aria-labelledby={narrow ? tabId('tests') : undefined}
			>
				<Panel title="Test strings">
					{#snippet actions()}
						{#if testsStale}<Updating />{/if}
					{/snippet}
					{#if parseNote}
						<p class="view-note spaced">{parseNote}</p>
					{:else if failure}
						<div class="spaced"><Callout tone="warn">{failure}</Callout></div>
					{:else if sizeNote}
						<p class={['view-note spaced', { 'stale-data': !current }]}>{sizeNote}</p>
					{/if}
					<TestStrings
						bind:tests={model.tests}
						results={rows}
						label={bracketLabel}
						names={namedSets}
						onselect={selectFromDerivation}
					/>
				</Panel>
			</div>

			<div
				id={panelId('compare')}
				class={['view', { current: model.view === 'compare' }]}
				role={narrow ? 'tabpanel' : undefined}
				aria-labelledby={narrow ? tabId('compare') : undefined}
			>
				<Panel title="Compare">
					{#snippet actions()}
						{#if !languageNote && !failure && compareStale && model.compare.trim() !== ''}
							<Updating />
						{/if}
					{/snippet}
					<CompareView
						bind:value={model.compare}
						result={compareResult}
						stale={compareStale}
						{failure}
						diagnostics={typedCompare?.diagnostics ?? []}
						blocked={languageNote}
						symbols={palette}
						{aliases}
						placeholder={flex ? 'e.g. [A-Za-z][A-Za-z0-9]*' : 'e.g. (letter* | digit*)'}
					/>
				</Panel>
			</div>
		</div>
	</div>
</ToolPage>

<style>
	.inputs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 900px) {
		.inputs.with-defs {
			grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		}
	}
	.defs {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.defs > :global(.code-editor) {
		align-self: stretch;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
		text-decoration: none;
	}
	.tool-link:hover {
		text-decoration: underline;
	}
	.tool-link:not([href]) {
		color: var(--text-2);
		text-decoration: none;
	}

	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.question {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}
	.answer {
		margin: 0;
		color: var(--text-2);
	}
	.formal {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-weight: 400;
	}

	.views {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.view-tabs {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
		scrollbar-width: thin;
	}
	.view-tab {
		position: relative;
		flex: none;
		padding: 8px 12px 10px;
		border: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: transparent;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.view-tab::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px 2px 0 0;
	}
	.view-tab:hover,
	.view-tab[aria-selected='true'] {
		color: var(--text);
	}
	.view-tab[aria-selected='true']::after {
		background: var(--accent);
	}
	.view-tab:focus-visible {
		outline-offset: -2px;
	}
	.view-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	.view {
		display: flex;
		min-width: 0;
	}
	.view > :global(.panel) {
		flex: 1;
	}
	@media (max-width: 899.98px) {
		.view:not(.current) {
			display: none;
		}
	}
	@media (min-width: 900px) {
		.view-tabs {
			display: none;
		}
		.view-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.view-note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.spaced {
		margin-bottom: var(--space-4);
	}
	/* In the definitions editor: the selected tree node, and the definition a selected use refers to. */
	:global(.rx-node) {
		border-radius: 2px;
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	:global(.rx-def) {
		border-radius: 2px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
</style>
