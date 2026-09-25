<script lang="ts">
	import { tick, untrack } from 'svelte';
	import AutomatonView from '$lib/components/graph/AutomatonView.svelte';
	import TransitionTable from '$lib/components/graph/TransitionTable.svelte';
	import {
		edgeTransitions,
		remapPositions,
		removeEdge,
		removeStates,
		setEdgeLabel,
		setStart,
		updateState
	} from '$lib/components/graph/edit';
	import { edgeKey } from '$lib/components/graph/layout';
	import { parseLabelText } from '$lib/components/graph/label-text';
	import { tableColumns } from '$lib/components/graph/table';
	import type { AutomatonHighlight, GraphSelection } from '$lib/components/graph/types';
	import Button from '$lib/components/ui/Button.svelte';
	import CodeEditor from '$lib/components/ui/CodeEditor.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import PresetMenu from '$lib/components/ui/PresetMenu.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import ToolPage from '$lib/components/ui/ToolPage.svelte';
	import { Stepper } from '$lib/components/ui/stepper.svelte';
	import type { Preset } from '$lib/components/ui/types';
	import type { CharSet } from '$lib/theory/charset';
	import { formatAutomatonText } from '$lib/theory/automata/core';
	import { pathTree } from '$lib/theory/automata/simulate';
	import type { Automaton, Point, Positions, StateId } from '$lib/theory/automata/types';
	import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
	import { tool } from '$lib/tools/catalog/automata';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';
	import BatchPanel from '$lib/tools/automata/BatchPanel.svelte';
	import ChallengesTab from '$lib/tools/automata/ChallengesTab.svelte';
	import DefinitionView from '$lib/tools/automata/DefinitionView.svelte';
	import DeterminismStrip from '$lib/tools/automata/DeterminismStrip.svelte';
	import Inspector from '$lib/tools/automata/Inspector.svelte';
	import PresetCard from '$lib/tools/automata/PresetCard.svelte';
	import RunPanel from '$lib/tools/automata/RunPanel.svelte';
	import { parseBatch, runBatch } from '$lib/tools/automata/batch';
	import { decodePositions } from '$lib/tools/automata/codec';
	import { formalDefinition } from '$lib/tools/automata/definition';
	import { summarizeDeterminism, type StripItem } from '$lib/tools/automata/determinism';
	import { History } from '$lib/tools/automata/history';
	import { MAX_RUN_LENGTH, hasStates, newMachine } from '$lib/tools/automata/model';
	import {
		DEFAULT_PRESET_ID,
		presetById,
		presetEdited as isPresetEdited,
		presets,
		type AutomataPreset
	} from '$lib/tools/automata/presets';
	import { buildRun } from '$lib/tools/automata/run';
	import {
		DEFAULT_VIEW,
		isSavedState,
		loadSaved,
		presetView,
		saveState,
		type SavedState,
		type TabId,
		type ViewState
	} from '$lib/tools/automata/state';
	import {
		checkAutomatonText,
		createTextApplier,
		mergeTextEdit
	} from '$lib/tools/automata/text-sync';
	import {
		completeForDrawing,
		positionsWithTrap,
		remapSelection,
		resolveDrawingEdit
	} from '$lib/tools/automata/trap';

	interface Snapshot {
		machine: Automaton;
		positions: Positions | null;
	}

	// ------------------------------------------------------------------
	// State: the machine (with its pinned positions) and the view options.
	// ------------------------------------------------------------------

	const initial = presetById(DEFAULT_PRESET_ID)!;
	const initialPositions = decodePositions(
		initial.value.positions,
		initial.value.machine.states.length
	);

	let machine = $state.raw<Automaton>(initial.value.machine);
	let positions = $state.raw<Positions | null>(initialPositions);
	let view = $state<ViewState>(presetView(initial.id, initial.value, DEFAULT_VIEW));

	let selected = $state<GraphSelection>(null);
	/** Changing it refits the drawing (new machine, auto layout). */
	let viewKey = $state(0);
	/** Where the trap state was dragged to (it is not part of the saved machine). */
	let trapAt = $state.raw<Point | null>(null);
	/** Determinism item highlighted in the diagram. */
	let focus = $state.raw<StripItem | null>(null);
	let pathsOpen = $state(false);
	let innerWidth = $state(1280);

	const history = new History<Snapshot>({
		machine: initial.value.machine,
		positions: initialPositions
	});
	let canUndo = $state(false);
	let canRedo = $state(false);

	function syncHistory() {
		canUndo = history.canUndo;
		canRedo = history.canRedo;
	}

	/** Every change to the machine goes through here, so it can be undone. */
	function commit(next: Automaton, nextPositions: Positions | null) {
		// A Text-tab edit still waiting to apply was typed against the old machine.
		if (next !== machine) textApplier.cancel();
		machine = next;
		positions = nextPositions;
		history.push({ machine: next, positions: nextPositions });
		syncHistory();
		focus = null;
	}

	function restore(s: Snapshot | null) {
		if (!s) return;
		textApplier.cancel();
		machine = s.machine;
		positions = s.positions;
		selected = null;
		focus = null;
		syncHistory();
	}

	const undo = () => restore(history.undo());
	const redo = () => restore(history.redo());

	function onLoad(value: SavedState) {
		textApplier.cancel();
		const loaded = loadSaved(value);
		const fallback = newMachine();
		const m = loaded.machine ?? fallback.machine;
		const p = loaded.machine ? loaded.positions : fallback.positions;
		machine = m;
		positions = p;
		view = loaded.view;
		history.reset({ machine: m, positions: p });
		syncHistory();
		selected = null;
		trapAt = null;
		focus = null;
		pathsOpen = false;
		viewKey++;
		if (loaded.badText) {
			textSource = m;
			textDraft = loaded.badText.text;
			textCheck = { text: loaded.badText.text, diagnostics: loaded.badText.diagnostics };
		}
	}

	syncToHash(() => saveState(machine, positions, view, pendingDraft), {
		onLoad,
		validate: isSavedState
	});

	// ------------------------------------------------------------------
	// Derived: determinism, trap state, the run and its highlight.
	// ------------------------------------------------------------------

	const summary = $derived(summarizeDeterminism(machine));
	const kind = $derived(summary.kind);
	const completed = $derived(kind === 'partial-dfa' ? completeForDrawing(machine) : null);
	const hasEpsilon = $derived(machine.transitions.some((t) => t.label === null));
	const empty = $derived(!hasStates(machine));
	const tooLong = $derived(view.input.length > MAX_RUN_LENGTH);

	const run = $derived(
		tooLong
			? null
			: buildRun(machine, view.input, {
					missing: view.missing,
					separateClosure: view.closureStep && hasEpsilon,
					completed: completed ?? undefined
				})
	);

	/** The trap state is drawn when asked for, or when the run goes into it. */
	const trapShown = $derived(
		completed !== null &&
			completed.trap !== null &&
			(view.showTrap || (view.missing === 'trap' && !!run?.usesTrap))
	);
	/** Bumped when an edit touched only the drawn trap, so the drawing is put back. */
	let redraws = $state(0);
	const display = $derived.by(() => {
		void redraws;
		// A fresh object each time: the editor redraws from a machine it did not report.
		return trapShown && completed ? { ...completed.automaton } : machine;
	});
	const displayPositions = $derived(
		trapShown && completed && completed.trap !== null
			? positionsWithTrap(positions, completed.trap, trapAt)
			: positions
	);

	const stepper = new Stepper(() => run?.steps.length ?? 0);
	// A new run (input, machine, or options) starts at its outcome.
	$effect(() => {
		const r = run;
		untrack(() => {
			if (r) stepper.last();
		});
	});
	const step = $derived(run ? (run.steps[stepper.index] ?? null) : null);
	const atEnd = $derived(!!run && stepper.index === run.steps.length - 1);
	// Stepping, or a new run, hands the diagram back to the run from a highlighted strip item.
	$effect(() => {
		void stepper.index;
		void run;
		untrack(() => (focus = null));
	});

	function focusHighlight(item: StripItem): AutomatonHighlight {
		if (item.kind === 'missing') {
			const trap = trapShown && completed ? completed.trap : null;
			return {
				tone: new Map([[item.state, 'info' as const]]),
				taken: display.transitions
					.filter((t) => t.from === item.state && t.to === trap)
					.map((t) => t.id)
			};
		}
		if (item.kind === 'epsilon')
			return {
				taken: [item.transition.id],
				tone: new Map([
					[item.transition.from, 'info' as const],
					[item.transition.to, 'info' as const]
				])
			};
		return {
			taken: item.transitions.map((t) => t.id),
			tone: new Map([[item.state, 'info' as const]])
		};
	}

	const highlight = $derived.by((): AutomatonHighlight | undefined => {
		if (focus) return focusHighlight(focus);
		if (!run || !step) return undefined;
		return { active: step.active, taken: step.taken, tone: atEnd ? run.tones : undefined };
	});

	const columns = $derived(tableColumns(display));
	const tableHighlight = $derived.by(() => {
		if (!run || !step) return undefined;
		if (run.kind === 'nfa') return { states: step.active };
		const state = step.active[0];
		if (!step.read || step.from === null || step.kind === 'stuck') return { state };
		const cp = step.read.char.codePointAt(0)!;
		const column = columns.findIndex((c) => c.set.has(cp));
		return column < 0 ? { state } : { state, cell: { state: step.from, column } };
	});

	const paths = $derived(
		pathsOpen && run?.kind === 'nfa' ? pathTree(machine, view.input, { maxNodes: 300 }) : null
	);

	const batch = $derived(parseBatch(view.batch));
	const batchResults = $derived(runBatch(machine, batch.lines, { missing: view.missing }));

	const definition = $derived(formalDefinition(display));
	const currentPreset = $derived(presetById(view.preset));
	/** The machine no longer matches the loaded example (positions aside). */
	const presetEdited = $derived(!!currentPreset && isPresetEdited(currentPreset.value, machine));

	const machineText = $derived(hasStates(machine) ? formatAutomatonText(machine) : '');
	const subsetLink = $derived(
		kind === 'nfa' && machineText ? toolLink('subset', { from: 'nfa', text: machineText }) : null
	);
	const minimizeLink = $derived(
		kind !== 'nfa' && machineText ? toolLink('minimize', { from: 'dfa', text: machineText }) : null
	);
	const subsetTitle = toolBySlug('subset')?.title;
	const minimizeTitle = toolBySlug('minimize')?.title;

	const viewHeight = $derived(innerWidth < 640 ? 300 : 420);

	// ------------------------------------------------------------------
	// Editing
	// ------------------------------------------------------------------

	function onGraphChange(next: Automaton, pos: Positions) {
		const edit = resolveDrawingEdit(machine, positions, display, next, pos);
		if (edit.trapAt) trapAt = edit.trapAt;
		const map = edit.map;
		// The drawing sets its selection right after reporting an edit, in its own
		// numbering (with the trap in it); carry it over once it has done so.
		if (map) queueMicrotask(() => (selected = remapSelection(selected, map)));
		// Deleting the drawn trap turns it off (it stays while the run is in it).
		if (edit.trapRemoved) view.showTrap = false;
		if (edit.changed) commit(edit.machine, edit.positions);
		if (edit.redraw) redraws++;
	}

	function renameState(id: StateId, name: string): string | null {
		if (!name) return 'Enter a name.';
		if (machine.states.some((s) => s.id !== id && s.name === name))
			return `Another state is named ${name}.`;
		commit(updateState(machine, id, { name }), positions);
		return null;
	}

	function relabel(key: string, text: string): string | null {
		const ts = edgeTransitions(machine, key);
		if (ts.length === 0) return null;
		const parsed = parseLabelText(text);
		if (!parsed.ok) return parsed.diagnostic.message;
		const { from, to } = ts[0];
		const { symbols, epsilon } = parsed.label;
		if (symbols.isEmpty && !epsilon) {
			commit(removeEdge(machine, key), positions);
			selected = null;
			return null;
		}
		commit(
			setEdgeLabel(machine, from, to, parsed.label, { epsilon: ts[0].label === null }),
			positions
		);
		selected = { kind: 'edge', key: edgeKey(from, to, symbols.isEmpty) };
		return null;
	}

	function deleteState(id: StateId) {
		const { automaton, map } = removeStates(machine, [id]);
		commit(automaton, positions ? remapPositions(positions, map) : null);
		selected = null;
	}

	function deleteEdge(key: string) {
		commit(removeEdge(machine, key), positions);
		selected = null;
	}

	function startNew() {
		const n = newMachine();
		commit(n.machine, n.positions);
		view.preset = null;
		view.input = '';
		view.hideNames = false;
		view.showTrap = false;
		view.startLabel = '';
		selected = null;
		trapAt = null;
		viewKey++;
	}

	function autoLayout() {
		commit(machine, null);
		trapAt = null;
		viewKey++;
	}

	function loadPreset(p: Preset<AutomataPreset>) {
		commit(p.value.machine, decodePositions(p.value.positions, p.value.machine.states.length));
		view = presetView(p.id, p.value, { tab: view.tab, challenge: view.challenge, guess: '' });
		selected = null;
		trapAt = null;
		pathsOpen = false;
		viewKey++;
	}

	function selectCell(state: StateId, _column: number, symbols: CharSet | null) {
		const t = display.transitions.find(
			(t) =>
				t.from === state && (symbols === null ? t.label === null : !!t.label?.overlaps(symbols))
		);
		if (t) selected = { kind: 'edge', key: edgeKey(t.from, t.to, t.label === null) };
	}

	async function runString(s: string) {
		view.input = s;
		await tick();
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		document
			.getElementById('run-panel')
			?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
	}

	async function openChallenges() {
		view.tab = 'challenges';
		await tick();
		document.getElementById('views-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
		const t = e.target;
		if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable="true"]'))
			return;
		const k = e.key.toLowerCase();
		if (k === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if ((k === 'z' && e.shiftKey) || k === 'y') {
			e.preventDefault();
			redo();
		}
	}

	// ------------------------------------------------------------------
	// Text tab: the machine in the text format, applied as it is edited.
	// ------------------------------------------------------------------

	let textDraft = $state(formatAutomatonText(initial.value.machine));
	/** The machine the draft was written from (or applied to). */
	let textSource: Automaton | null = initial.value.machine;
	let textCheck = $state.raw<{ text: string; diagnostics: Diagnostic[] } | null>(null);
	/** Applies typed text after a pause, unless the machine is replaced first. */
	const textApplier = createTextApplier({ current: () => machine, apply: applyText });

	$effect.pre(() => {
		const m = machine;
		untrack(() => {
			if (m === textSource) return;
			textSource = m;
			textDraft = hasStates(m) ? formatAutomatonText(m) : '';
			textCheck = null;
		});
	});

	$effect(() => () => textApplier.cancel());

	function onTextInput(value: string) {
		textApplier.input(value);
	}

	function applyText(value: string) {
		const { automaton: a, diagnostics } = checkAutomatonText(value);
		textCheck = { text: value, diagnostics };
		if (!a) return;
		if (formatAutomatonText(a) === machineText) return;
		const merged = mergeTextEdit(machine, positions, a);
		textSource = merged.machine;
		commit(merged.machine, merged.positions);
		selected = null;
	}

	const textDiagnostics = $derived(
		textCheck && textCheck.text === textDraft ? textCheck.diagnostics : []
	);
	/** A draft that does not apply is kept in the link, so a reload still shows it. */
	const pendingDraft = $derived(hasErrors(textDiagnostics) ? textDraft : null);

	const tabs = [
		{ id: 'definition', label: 'Definition' },
		{ id: 'table', label: 'Table' },
		{ id: 'text', label: 'Text' },
		{ id: 'challenges', label: 'Challenges' }
	];

	const trapHint = $derived(
		kind === 'partial-dfa'
			? 'Draws the state missing transitions go to, dashed.'
			: kind === 'dfa'
				? 'Every transition is defined, so there is no trap state.'
				: 'Only for DFAs.'
	);
</script>

<svelte:window bind:innerWidth onkeydown={onWindowKeydown} />

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu
			{presets}
			selected={presetEdited ? null : view.preset}
			onselect={loadPreset}
			align="end"
		/>
	{/snippet}

	{#if currentPreset}
		<PresetCard
			preset={currentPreset}
			edited={presetEdited}
			ontry={openChallenges}
			onreload={() => loadPreset(currentPreset)}
		/>
	{/if}

	<div class="workbench">
		<div class="main-col">
			<Panel title="Automaton" class="machine-panel">
				{#snippet actions()}
					<div class="toolbar" role="group" aria-label="History and layout">
						<IconButton
							icon="undo"
							label="Undo"
							shortcut="Ctrl+Z"
							size="sm"
							disabled={!canUndo}
							onclick={undo}
						/>
						<IconButton
							icon="redo"
							label="Redo"
							shortcut="Ctrl+Shift+Z"
							size="sm"
							disabled={!canRedo}
							onclick={redo}
						/>
						<span class="sep" aria-hidden="true"></span>
						<Button size="sm" variant="ghost" onclick={startNew}>New</Button>
						<Button size="sm" variant="ghost" onclick={autoLayout}>Auto layout</Button>
					</div>
				{/snippet}

				<div class="machine-body">
					<DeterminismStrip
						{summary}
						focused={focus?.key ?? null}
						onfocus={(item) => (focus = item)}
					>
						{#snippet links()}
							{#if subsetLink && subsetTitle}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
								<a href={subsetLink}>Open in {subsetTitle}</a>
							{/if}
							{#if minimizeLink && minimizeTitle}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
								<a href={minimizeLink}>Open in {minimizeTitle}</a>
							{/if}
						{/snippet}
					</DeterminismStrip>

					<AutomatonView
						automaton={display}
						positions={displayPositions ?? undefined}
						{highlight}
						editable
						bind:selected
						onchange={onGraphChange}
						height={viewHeight}
						hideNames={view.hideNames}
						selectionActions={false}
						startLabel={view.startLabel || undefined}
						{viewKey}
					/>

					<Inspector
						automaton={display}
						{selected}
						onrename={renameState}
						onlabel={relabel}
						onaccepting={(id, on) => commit(updateState(machine, id, { accepting: on }), positions)}
						onstart={(id) => commit(setStart(machine, id), positions)}
						ondeletestate={deleteState}
						ondeleteedge={deleteEdge}
					/>

					<div class="view-options">
						<Toggle
							label="Hide state names"
							description="As in the unlabeled slide drawings."
							bind:checked={view.hideNames}
						/>
						<Toggle
							label="Show trap state"
							description={trapHint}
							disabled={kind !== 'partial-dfa'}
							checked={view.showTrap && kind === 'partial-dfa'}
							onchange={(on) => (view.showTrap = on)}
						/>
					</div>
				</div>
			</Panel>
		</div>

		<div class="side-col">
			<Panel title="Run" id="run-panel">
				<RunPanel
					{run}
					{stepper}
					bind:input={view.input}
					{kind}
					{hasEpsilon}
					bind:missing={view.missing}
					bind:closureStep={view.closureStep}
					{tooLong}
					{empty}
					automaton={machine}
					{paths}
					bind:pathsOpen
				/>
			</Panel>

			<Panel id="views-panel" class="views-panel" aria-label="Definition, table, text, challenges">
				<Tabs
					{tabs}
					label="Views of the machine"
					value={view.tab}
					onchange={(id) => (view.tab = id as TabId)}
				>
					{#snippet children(id)}
						{#if id === 'definition'}
							<DefinitionView def={definition} {trapShown} />
						{:else if id === 'table'}
							<div class="table-tab">
								<TransitionTable
									automaton={display}
									highlight={tableHighlight}
									onCellClick={selectCell}
									caption="Transition table of the machine"
								/>
								<p class="legend">
									<span class="glyph">→</span> start state
									<span class="glyph">◎</span> accepting state. The row of the current state is highlighted;
									select a cell to select its transition in the diagram.
								</p>
							</div>
						{:else if id === 'text'}
							<div class="text-tab">
								<CodeEditor
									label="The machine as text"
									bind:value={textDraft}
									diagnostics={textDiagnostics}
									oninput={onTextInput}
									language="automaton"
									minRows={8}
									maxRows={18}
									tabInserts={false}
								/>
								<Disclosure summary="Text format" openSummary="Text format">
									<dl class="format">
										<dt><code>start: A</code></dt>
										<dd>the start state</dd>
										<dt><code>accept: B C</code></dt>
										<dd>accepting states</dd>
										<dt><code>A 0,1 B</code></dt>
										<dd>a transition from A to B on 0 and on 1</dd>
										<dt><code>A ε B</code></dt>
										<dd>an ε-move (also <code>eps</code>)</dd>
										<dt><code>A ' ' B</code>, <code>A [a-z] B</code></dt>
										<dd>a quoted symbol, a class of symbols</dd>
										<dt><code>alphabet: 0,1</code></dt>
										<dd>declares Σ (optional)</dd>
										<dt><code># note</code></dt>
										<dd>a comment</dd>
									</dl>
								</Disclosure>
							</div>
						{:else if id === 'challenges'}
							<ChallengesTab
								{machine}
								bind:guess={view.guess}
								bind:challenge={view.challenge}
								onrun={runString}
								onblank={startNew}
							/>
						{/if}
					{/snippet}
				</Tabs>
			</Panel>

			<Panel title="Batch run">
				<BatchPanel
					bind:text={view.batch}
					results={batchResults}
					truncated={batch.truncated}
					onrun={runString}
				/>
			</Panel>
		</div>
	</div>
</ToolPage>

<style>
	.workbench {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	.main-col,
	.side-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1100px) {
		.workbench {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		}
	}
	@media (min-width: 1100px) and (min-height: 820px) {
		/* Stays in view beside the run. When the inspector or the strip makes it
		   taller than the window, it scrolls on its own, so its lower controls
		   stay reachable. */
		.main-col {
			position: sticky;
			top: calc(56px + var(--space-4));
			max-height: calc(100vh - 56px - 2 * var(--space-4));
			max-height: calc(100dvh - 56px - 2 * var(--space-4));
			overflow-y: auto;
			/* Room for the panel's shadow, which the scroll box would clip. */
			padding-bottom: 3px;
			scrollbar-gutter: stable;
			scrollbar-width: thin;
		}
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.sep {
		width: 1px;
		height: 18px;
		margin: 0 var(--space-2);
		background: var(--border);
	}
	.machine-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.view-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		padding-top: var(--space-1);
	}
	.table-tab,
	.text-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.legend {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.6;
	}
	.glyph {
		margin: 0 2px 0 var(--space-2);
		color: var(--text-2);
		font-family: var(--font-mono);
	}
	.glyph:first-child {
		margin-left: 0;
	}
	.format {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-1) var(--space-4);
		margin: 0;
		font-size: var(--text-sm);
	}
	.format dt {
		white-space: nowrap;
	}
	.format dd {
		margin: 0;
		color: var(--text-2);
	}
	@media (max-width: 480px) {
		.format {
			grid-template-columns: minmax(0, 1fr);
		}
		.format dd {
			margin-bottom: var(--space-2);
		}
	}
</style>
