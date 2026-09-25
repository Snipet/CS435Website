<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import {
		Button,
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
		analyzeCompare,
		analyzeExpression,
		automataState,
		convertDialect,
		evaluateTest,
		listLanguage,
		namedSymbolSets,
		parseCompare,
		thompsonState
	} from '$lib/tools/regex/analysis';
	import type { Bracket } from '$lib/tools/regex/derive';
	import { withoutTrap } from '$lib/tools/regex/machines';
	import { languageBlocked, structureBlocked } from '$lib/tools/regex/messages';
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
	import { nodeText } from '$lib/tools/regex/tree';
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
		settleNow();
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
		settleNow();
	}

	// ---- Analysis --------------------------------------------------------------
	// Parsing is cheap and follows every keystroke (the fields' diagnostics). The
	// views build automata, which takes longer for large expressions, so they
	// follow a settled copy of the inputs: at once while builds are quick, and
	// SETTLE_MS after typing stops once a build was slow.

	interface Inputs {
		re: string;
		defs: string;
		dialect: Dialect;
		alphabet: string;
		compare: string;
	}
	const inputsOf = (m: Inputs): Inputs => ({
		re: m.re,
		defs: m.defs,
		dialect: m.dialect,
		alphabet: m.alphabet,
		compare: m.compare
	});
	const sameInputs = (a: Inputs, b: Inputs) =>
		a.re === b.re &&
		a.defs === b.defs &&
		a.dialect === b.dialect &&
		a.alphabet === b.alphabet &&
		a.compare === b.compare;

	/** A build that took longer than this (ms) makes the views wait for a pause in typing. */
	const SLOW_MS = 25;
	const SETTLE_MS = 150;
	/** Time the views' last builds took (ms): L(R) and the comparison. */
	const cost = { expression: 0, compare: 0 };
	const now = () => (typeof performance === 'undefined' ? 0 : performance.now());

	let settled = $state.raw<Inputs>(inputsOf(initial));

	function settleNow() {
		settled = inputsOf(model);
	}

	$effect(() => {
		const next = inputsOf(model);
		const last = untrack(() => settled);
		if (sameInputs(next, last)) return;
		if (cost.expression + cost.compare < SLOW_MS) {
			settled = next;
			return;
		}
		const timer = setTimeout(() => (settled = next), SETTLE_MS);
		return () => clearTimeout(timer);
	});
	const pending = $derived(!sameInputs(inputsOf(model), settled));

	/** The inputs as typed, parsed only (diagnostics). */
	const typed = $derived(
		analyzeExpression(
			{ re: model.re, defs: model.defs, dialect: model.dialect, alphabet: model.alphabet },
			{ build: false }
		)
	);
	const typedCompare = $derived(parseCompare(typed, model.compare));

	/** The settled inputs with L(R) built: everything the views show. */
	const analysis = $derived.by(() => {
		const start = now();
		const a = analyzeExpression(settled);
		cost.expression = now() - start;
		return a;
	});
	const compareResult = $derived.by(() => {
		const start = now();
		const c = analyzeCompare(analysis, settled.compare);
		cost.compare = now() - start;
		return c;
	});

	const root = $derived(analysis.re.regex);
	const typedUsesAny = $derived(typed.re.regex ? containsAny(typed.re.regex) : false);
	const defNames = $derived(new Set(typed.defs.defs.keys()));
	const sigmaPlaceholder = $derived(
		typed.inferred && !typedUsesAny
			? `inferred: ${formatAlphabet(typed.inferred, { names: defNames })}`
			: 'e.g. { 0, 1 }'
	);

	const printOpts = $derived<PrintOptions>({
		...analysis.print,
		parens: model.full ? 'full' : 'minimal'
	});
	const definitionText = (name: string) => analysis.defs.entries.find((e) => e.name === name)?.text;

	// The selected tree node, marked where it was written (R or a definition). A
	// definition use also marks the definition's line. The root (all of R) is not
	// marked, and nothing is marked while the tree is behind the text being typed.
	const selectedPath = $derived(root && nodeAtPath(root, model.node) ? model.node : []);
	const selectedNode = $derived(root ? (nodeAtPath(root, selectedPath) ?? null) : null);
	const span = $derived(selectedPath.length > 0 && !pending ? (selectedNode?.span ?? null) : null);
	const reHighlight = $derived(
		span && span.source === null ? { start: span.start, end: span.end } : null
	);
	const defsMarks = $derived.by(() => {
		const marks: HighlightToken[] = [];
		if (span && span.source !== null)
			marks.push({ from: span.start, to: span.end, className: 'rx-node' });
		const node = pending ? null : selectedNode;
		if (node?.kind === 'ref') {
			const entry = analysis.defs.entries.find(
				(e) => e.name === node.name && e.regex === node.body
			);
			if (entry)
				marks.push({ from: entry.nameSpan.start, to: entry.exprSpan.end, className: 'rx-def' });
		}
		return marks.sort((a, b) => a.from - b.from);
	});

	const structureNote = $derived(structureBlocked(settled.re, analysis));
	const languageNote = $derived(languageBlocked(settled.re, analysis));
	const min = $derived(analysis.language?.ok ? analysis.language.min : null);
	const listing = $derived(min ? listLanguage(min, model.maxLength) : null);
	const minStates = $derived(min ? withoutTrap(min).states.length : 0);
	const results = $derived(model.tests.map((t) => evaluateTest(analysis, t)));
	const namedSets = $derived(namedSymbolSets(analysis.defs));
	const bracketLabel = (b: Bracket) => nodeText(b.derivation.node, printOpts);

	const current = $derived(matchPreset(model));

	// ---- Links -----------------------------------------------------------------

	const hasThompson = toolBySlug('thompson') !== undefined;
	const hasAutomata = toolBySlug('automata') !== undefined;
	const thompsonHref = $derived.by(() => {
		const s = hasThompson ? thompsonState(settled, analysis) : null;
		return s ? toolLink('thompson', s) : null;
	});
	const automataHref = $derived.by(() => {
		const s = hasAutomata ? automataState(analysis, model.tests[0]) : null;
		return s ? toolLink('automata', s) : null;
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
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
			<a class="tool-link" href={automataHref}>
				Open DFA in Finite Automata <Icon name="arrow-right" size={15} />
			</a>
		{/if}
	</div>
{/snippet}

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={current?.id ?? null} onselect={load} align="end" />
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

	{#if current?.questions?.length}
		<Panel title="From the slides" level={2} variant="subtle">
			{#snippet actions()}
				{#if current.cite}<CitationTag cite={current.cite} />{/if}
			{/snippet}
			<ul class="questions">
				{#each current.questions as q (q.question)}
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
								dialect={analysis.dialect}
								definition={definitionText}
								sigma={analysis.sigma}
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
					{#if languageNote || !listing}
						<p class="view-note">{languageNote}</p>
					{:else}
						<LanguageView {listing} bind:maxLength={model.maxLength} states={minStates} />
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
					{#if languageNote}
						<p class="view-note spaced">{languageNote}</p>
					{/if}
					<TestStrings
						bind:tests={model.tests}
						{results}
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
					<CompareView
						bind:value={model.compare}
						result={compareResult}
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
	.view-note.spaced {
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
