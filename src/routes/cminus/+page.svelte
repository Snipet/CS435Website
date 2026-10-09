<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		Callout,
		CitationTag,
		CodeEditor,
		Disclosure,
		Panel,
		PresetMenu,
		SegmentedControl,
		Tabs,
		Toggle,
		ToolPage,
		Updating,
		WorkerTask
	} from '$lib/components/ui';
	import { CMINUS_BNF, type Compilation, type IdentifierMode } from '$lib/theory/cminus';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { tool } from '$lib/tools/catalog/cminus';
	import '$lib/tools/cminus/cminus.css';
	import IrView from '$lib/tools/cminus/IrView.svelte';
	import LanguageView from '$lib/tools/cminus/LanguageView.svelte';
	import PhaseStrip from '$lib/tools/cminus/PhaseStrip.svelte';
	import { PRESETS, presetFor, type CminusPreset } from '$lib/tools/cminus/presets';
	import { revealRange } from '$lib/tools/cminus/reveal';
	import RunView from '$lib/tools/cminus/RunView.svelte';
	import {
		NO_MARKS,
		describeSelection,
		marksFor,
		rangeOfCaret,
		type SourceRange
	} from '$lib/tools/cminus/selection';
	import SelectionBar from '$lib/tools/cminus/SelectionBar.svelte';
	import SemanticsView from '$lib/tools/cminus/SemanticsView.svelte';
	import {
		MAX_SOURCE,
		TABS,
		defaultState,
		isCminusHash,
		stateFromHash,
		type CminusHash,
		type CminusState,
		type TabId
	} from '$lib/tools/cminus/state';
	import StoppedNote from '$lib/tools/cminus/StoppedNote.svelte';
	import SyntaxView from '$lib/tools/cminus/SyntaxView.svelte';
	import TargetView from '$lib/tools/cminus/TargetView.svelte';
	import {
		compileKey,
		compileProgram,
		runProgram,
		type CompileRequest,
		type RunOutput,
		type RunRequest
	} from '$lib/tools/cminus/tasks';
	import TokensView from '$lib/tools/cminus/TokensView.svelte';
	import {
		SELECTED_CLASS,
		TAB_LABEL,
		blockedBy,
		editorDiagnostics,
		highlightSource,
		selectionLineClasses,
		stageOfTab,
		stageViews,
		statusText,
		type StageView
	} from '$lib/tools/cminus/views';
	import { createCompileWorker, createRunWorker } from '$lib/tools/cminus/worker';
	import { toolLink } from '$lib/tools/links';
	import { parseInputs } from '$lib/tools/tiny-vm/input';
	import { syncToHash } from '$lib/url-state';

	let model = $state<CminusState>(defaultState());
	/** Where the caret was put in the editor, until the compilation of that text resolves it. */
	let caret = $state.raw<SourceRange | null>(null);

	syncToHash<CminusHash>(() => model, {
		validate: isCminusHash,
		onLoad: (value) => {
			caret = null;
			Object.assign(model, stateFromHash(value));
		}
	});

	// ---- Compiling ---------------------------------------------------------------
	// The whole compilation runs in a worker; the editor's colors come from a scan
	// on the page, so they follow every keystroke.

	const tooLarge = $derived(model.source.length > MAX_SOURCE);
	const request = $derived<CompileRequest | null>(
		tooLarge
			? null
			: { source: model.source, identifiers: model.identifiers, optimize: model.optimize }
	);
	const compileTask = new WorkerTask<CompileRequest, Compilation>({
		compute: compileProgram,
		worker: createCompileWorker,
		// The default program, compiled at once so the prerendered page shows every phase.
		initial: untrack(() => request) ?? undefined
	});
	$effect(() => {
		if (request) compileTask.run(request);
	});

	/** The compilation on display; null when the program is too long to compile. */
	const c = $derived(tooLarge ? null : compileTask.output);
	/** It is the compilation of the program and options as they are now. */
	const fresh = $derived(
		!!request && !!compileTask.input && compileKey(compileTask.input) === compileKey(request)
	);
	/** The views show an earlier compilation: a newer one is on its way (or took too long). */
	const stale = $derived(!tooLarge && !fresh);
	const waiting = $derived(stale && compileTask.status === 'working');
	/** Offsets of `c` are offsets of the text in the editor. */
	const sameText = $derived(c !== null && c.source === model.source);
	const compiled = $derived(fresh && c !== null && c.stoppedAt === null);

	// ---- Running -----------------------------------------------------------------

	const inputs = $derived(parseInputs(model.input));
	const inputDiagnostics = $derived<Diagnostic[]>(
		inputs.invalid.map((t) => ({
			severity: 'warning',
			message: `"${t.text}" is not a 32-bit integer; it is skipped.`,
			span: { start: t.start, end: t.end, source: null }
		}))
	);
	/** Counts presses of Run. */
	let attempt = $state(0);
	const runRequest = $derived<RunRequest | null>(
		compiled && request ? { ...request, inputs: inputs.values, attempt } : null
	);
	const runTask = new WorkerTask<RunRequest, RunOutput | null>({
		compute: runProgram,
		worker: createRunWorker,
		initial: untrack(() => runRequest) ?? undefined
	});
	$effect(() => {
		if (runRequest) runTask.run(runRequest);
	});
	const runKey = (r: RunRequest) => JSON.stringify(r);
	const runFresh = $derived(
		!!runRequest && !!runTask.input && runKey(runTask.input) === runKey(runRequest)
	);
	/** The newest run of a program that compiles (it may be for an earlier text or input). */
	const run = $derived(c !== null && c.stoppedAt === null ? runTask.output : null);
	const runStale = $derived(stale || !runFresh);

	// ---- The selection -----------------------------------------------------------

	const selection = $derived<SourceRange | null>(
		model.sel ? { start: model.sel[0], end: model.sel[1] } : null
	);
	const selKey = $derived(model.sel ? `${model.sel[0]}:${model.sel[1]}` : '');
	const marks = $derived(c && sameText ? marksFor(c, selection) : NO_MARKS);
	const summary = $derived(
		c && sameText && selection ? describeSelection(c, selection, marks) : null
	);

	function select(range: SourceRange | null) {
		model.sel = range && range.end > range.start ? [range.start, range.end] : null;
	}

	// The caret in the source selects the piece of the program around it. An edit
	// clears the selection: its offsets belonged to the text before the edit.
	let editor: HTMLTextAreaElement | undefined = $state();
	let editorBox: HTMLDivElement | undefined = $state();

	const NAVIGATION = new Set([
		'ArrowLeft',
		'ArrowRight',
		'ArrowUp',
		'ArrowDown',
		'Home',
		'End',
		'PageUp',
		'PageDown'
	]);

	function readCaret() {
		const el = editor;
		if (!el || el.value !== model.source) return;
		caret = { start: el.selectionStart, end: el.selectionEnd };
	}

	$effect(() => {
		const el = editor;
		if (!el) return;
		const onkeyup = (event: KeyboardEvent) => {
			if (NAVIGATION.has(event.key)) readCaret();
		};
		el.addEventListener('keyup', onkeyup);
		el.addEventListener('pointerup', readCaret);
		el.addEventListener('select', readCaret);
		return () => {
			el.removeEventListener('keyup', onkeyup);
			el.removeEventListener('pointerup', readCaret);
			el.removeEventListener('select', readCaret);
		};
	});

	// The caret is resolved against the compilation of the text it is in.
	$effect(() => {
		const at = caret;
		if (!at || !c || !fresh || !sameText) return;
		untrack(() => {
			select(rangeOfCaret(c, at.start, at.end));
			caret = null;
		});
	});

	function onSourceInput() {
		caret = null;
		model.sel = null;
	}

	// A selection made in a view is brought into view in the editor (the editor scrolls, not the page).
	$effect(() => {
		if (!selKey || !editorBox) return;
		const box = editorBox;
		const frame = requestAnimationFrame(() => revealRange(box, `.${SELECTED_CLASS}`));
		return () => cancelAnimationFrame(frame);
	});

	// ---- The editor --------------------------------------------------------------

	const highlight = $derived.by(() => {
		const identifiers = model.identifiers;
		const selected = selection;
		return (text: string) =>
			text.length > MAX_SOURCE ? [] : highlightSource(text, identifiers, selected);
	});
	const lineClasses = $derived(selectionLineClasses(model.source, selection));
	const diagnostics = $derived(editorDiagnostics(c, { stale: !sameText }));

	const preset = $derived(presetFor(model));

	function load(p: CminusPreset) {
		caret = null;
		model.source = p.value.source;
		model.input = p.value.input;
		model.sel = null;
		if (p.value.tab) model.tab = p.value.tab;
	}

	const identifierOptions: { value: IdentifierMode; label: string; title: string }[] = [
		{ value: 'letters', label: 'Letters only', title: 'ID = letter letter*' },
		{
			value: 'extended',
			label: 'Letters, digits and _',
			title: "ID = letter (letter | digit | '_')*"
		}
	];

	// ---- Phases and tabs ---------------------------------------------------------

	const stages = $derived(stageViews(c, run));
	const currentStage = $derived(stageOfTab(model.tab, model.ir, model.code));
	const status = $derived(tooLarge ? 'The program is too long to compile.' : statusText(c));
	const tabs = TABS.map((id) => ({ id, label: TAB_LABEL[id] }));

	let views: HTMLDivElement | undefined = $state();

	async function openTab(tab: TabId) {
		model.tab = tab;
		await tick();
		views?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	function openStage(stage: StageView) {
		if (stage.tab === 'ir' && stage.version) model.ir = stage.version;
		if (stage.tab === 'code' && stage.version) model.code = stage.version;
		void openTab(stage.tab);
	}

	const WHAT: Record<TabId, string> = {
		tokens: 'token list',
		syntax: 'syntax tree',
		semantics: 'symbol table',
		ir: 'three-address code',
		code: 'TINY Machine code',
		run: 'program to run',
		language: ''
	};

	// ---- Links -------------------------------------------------------------------

	const grammarHref = toolLink('grammar', { grammar: CMINUS_BNF });
	const machineHref = $derived.by(() => {
		const input = model.input;
		return (listing: string) => toolLink('tiny-vm', { program: listing, input });
	});
	const runHref = $derived(
		c?.codegen && c.stoppedAt === null ? machineHref(c.codegen.peephole.code.listing) : null
	);
</script>

<ToolPage {tool}>
	<div class="phases">
		<div class="phases-head">
			<p class="status">{status}</p>
			<CitationTag cite={{ deck: '01', slide: 4 }} />
		</div>
		<PhaseStrip {stages} current={currentStage} busy={stale} onselect={openStage} />
	</div>

	<div class="bench">
		<Panel title="Source">
			{#snippet actions()}
				<PresetMenu
					presets={PRESETS}
					selected={preset?.id ?? null}
					onselect={load}
					align="end"
					size="sm"
					label="Programs"
				/>
			{/snippet}
			<div class="stack">
				<div bind:this={editorBox}>
					<CodeEditor
						ariaLabel="C- program"
						language="cminus"
						bind:value={model.source}
						bind:element={editor}
						{highlight}
						{lineClasses}
						{diagnostics}
						source={null}
						minRows={12}
						maxRows={24}
						wrap={false}
						placeholder="void main(void)&#10;&#123;&#10;  output(input());&#10;&#125;"
						oninput={onSourceInput}
					/>
				</div>
				{#if tooLarge}
					<Callout tone="warn" title="Not compiled">
						The program has {model.source.length.toLocaleString('en-US')} characters. Programs of more
						than {MAX_SOURCE.toLocaleString('en-US')} characters are not compiled.
					</Callout>
				{/if}

				<div class="input">
					<CodeEditor
						label="Input"
						language="numbers"
						bind:value={model.input}
						diagnostics={inputDiagnostics}
						lineNumbers={false}
						tabInserts={false}
						minRows={1}
						maxRows={4}
						placeholder="e.g. 48 18"
					/>
					<p class="hint">
						The numbers <code>input()</code> reads, in order, separated by spaces or line breaks.
					</p>
				</div>

				<div class="options">
					<Toggle
						label="Optimize"
						description="Run the optimizer on the three-address code"
						bind:checked={model.optimize}
					/>
					<Disclosure summary="Language options" openSummary="Language options">
						<div class="option">
							<SegmentedControl
								label="Identifiers"
								showLabel
								size="sm"
								options={identifierOptions}
								bind:value={model.identifiers}
							/>
							<p class="hint">
								{#if model.identifiers === 'letters'}
									<code>ID = letter letter*</code>, as the language defines it: <code>x1</code> is
									ID <code>x</code>, NUM <code>1</code>.
								{:else}
									<code>ID = letter (letter | digit | '_')*</code>: <code>x1</code> and
									<code>low_bound</code> are identifiers.
								{/if}
							</p>
						</div>
					</Disclosure>
				</div>
			</div>
		</Panel>

		<Panel title="Compilation">
			{#snippet actions()}
				{#if waiting}<Updating />{/if}
			{/snippet}
			<div class="stack" bind:this={views}>
				<SelectionBar {summary} onclear={() => select(null)} />

				{#if compileTask.status === 'timed-out'}
					<Callout tone="warn">
						Compiling this program takes too long. The views show the last program that compiled in
						time.
					</Callout>
				{:else if compileTask.status === 'error'}
					<Callout tone="error">The compiler stopped: {compileTask.error}</Callout>
				{/if}

				<Tabs {tabs} bind:value={model.tab} label="Results of the phases">
					{#snippet children(id)}
						{@const tab = id as TabId}
						<div class={['cm-view', { 'stale-data': stale }]} aria-busy={stale}>
							{#if tab === 'language'}
								<LanguageView identifiers={model.identifiers} {grammarHref} />
							{:else if !c}
								<p class="cm-note">
									{#if tooLarge}
										Nothing is compiled: the program is longer than
										{MAX_SOURCE.toLocaleString('en-US')} characters.
									{:else}
										<Updating standalone label="Compiling…" />
									{/if}
								</p>
							{:else}
								{@const blocked = blockedBy(c, tab)}
								{#if blocked}
									<StoppedNote {c} phase={blocked} what={WHAT[tab]} onopen={openTab} />
								{:else if tab === 'tokens'}
									<TokensView
										{c}
										{marks}
										{selKey}
										bind:comments={model.comments}
										onselect={select}
									/>
								{:else if tab === 'syntax'}
									<SyntaxView {c} {marks} {selection} {selKey} {grammarHref} onselect={select} />
								{:else if tab === 'semantics'}
									<SemanticsView {c} {marks} {selection} {selKey} onselect={select} />
								{:else if tab === 'ir'}
									<IrView {c} {marks} {selKey} bind:version={model.ir} onselect={select} />
								{:else if tab === 'code'}
									<TargetView
										{c}
										{marks}
										{selKey}
										bind:version={model.code}
										{machineHref}
										onselect={select}
									/>
								{:else if tab === 'run'}
									<RunView
										{c}
										{run}
										busy={runStale}
										timedOut={runTask.status === 'timed-out'}
										error={runTask.status === 'error' ? runTask.error : null}
										inputs={inputs.values}
										machineHref={runHref}
										onrun={() => attempt++}
										onselect={select}
									/>
								{/if}
							{/if}
						</div>
					{/snippet}
				</Tabs>
			</div>
		</Panel>
	</div>
</ToolPage>

<style>
	.phases {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.phases-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-4);
		min-width: 0;
	}
	.status {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.bench {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1040px) {
		.bench {
			grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		}
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		scroll-margin-top: calc(56px + var(--space-4));
	}
	.input {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.option {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
</style>
