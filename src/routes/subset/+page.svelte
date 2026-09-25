<script lang="ts">
	import { AutomatonView, layoutAutomaton, nodePositions } from '$lib/components/graph';
	import type { StateTone } from '$lib/components/graph';
	import {
		Badge,
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
		StepControls,
		Stepper,
		Tabs,
		Toggle,
		ToolPage
	} from '$lib/components/ui';
	import {
		formatAutomatonText,
		type StateId,
		type SubsetNaming,
		type SubsetTraceStep
	} from '$lib/theory/automata';
	import { tool } from '$lib/tools/catalog/subset';
	import { toolLink } from '$lib/tools/links';
	import { syncToHash } from '$lib/url-state';
	import BlowUp from '$lib/tools/subset/BlowUp.svelte';
	import ClosureExplorer from '$lib/tools/subset/ClosureExplorer.svelte';
	import RunBoth from '$lib/tools/subset/RunBoth.svelte';
	import StatePicker from '$lib/tools/subset/StatePicker.svelte';
	import WorklistTable from '$lib/tools/subset/WorklistTable.svelte';
	import {
		MAX_DFA_STATES,
		MAX_DRAWN_DFA,
		MAX_DRAWN_NFA_AUTO,
		MAX_DRAWN_NFA_GRID,
		MAX_NFA_STATES,
		blowupNfaText,
		buildNfa,
		checkPicks,
		classText,
		construct,
		continuePrediction,
		dfaHighlight,
		drawnDfa,
		newPrediction,
		nfaHighlight,
		partialDfa,
		powerOfTwoText,
		predictionView,
		setText,
		stateName,
		superscript,
		targetSet,
		togglePick,
		type NfaBuild,
		type Prediction
	} from '$lib/tools/subset/logic';
	import { PRESETS, presetFor, type SubsetPreset } from '$lib/tools/subset/presets';
	import {
		defaultState,
		isSubsetHash,
		presetFields,
		stateFromHash,
		stepFromHash,
		switchSource,
		type TabId
	} from '$lib/tools/subset/state';

	let model = $state(defaultState());

	// ------------------------------------------------------------------
	// NFA → DFA
	// ------------------------------------------------------------------

	const build = $derived(buildNfa(model));
	/**
	 * The last NFA built. While the input has problems (mid-edit), the page keeps
	 * showing its construction, dimmed, instead of tearing the panels down.
	 */
	let lastGood = $state.raw<NfaBuild | null>(null);
	$effect(() => {
		if (build.nfa) lastGood = build;
	});
	const shown = $derived(build.nfa ? build : lastGood);
	/** The construction shown is for an earlier input. */
	const stale = $derived(build.nfa === null && shown !== null);
	const nfa = $derived(shown?.nfa ?? null);
	const nfaGrid = $derived(shown?.positions ?? null);
	const maxDrawnNfa = $derived(nfaGrid ? MAX_DRAWN_NFA_GRID : MAX_DRAWN_NFA_AUTO);
	const nfaDrawable = $derived(nfa !== null && nfa.states.length <= maxDrawnNfa);
	const nfaPositions = $derived(
		nfaGrid ?? (nfa !== null && nfaDrawable ? nodePositions(layoutAutomaton(nfa)) : undefined)
	);

	const construction = $derived(
		nfa ? construct(nfa, { naming: model.naming, includeEmpty: model.showEmpty }) : null
	);
	const result = $derived(construction?.result ?? null);
	// As drawn: the ∅ state (when shown) is a trap state.
	const dfa = $derived(result ? drawnDfa(result) : null);
	const dfaDrawable = $derived(dfa !== null && dfa.states.length <= MAX_DRAWN_DFA);
	// The finished DFA is laid out once; every step draws its states in the same places.
	const dfaLayout = $derived(dfa !== null && dfaDrawable ? layoutAutomaton(dfa) : null);
	const dfaPositions = $derived(dfaLayout ? nodePositions(dfaLayout) : undefined);
	const dfaFrame = $derived(dfaLayout?.bounds);

	const total = $derived(result?.steps.length ?? 0);
	const stepper = new Stepper(() => total, { index: Number.MAX_SAFE_INTEGER, speed: 1.2 });
	const index = $derived(stepper.index);
	const step = $derived(result?.steps[index]);
	const shownDfa = $derived(dfa ? partialDfa(dfa, step) : null);

	const preset = $derived(presetFor(model));

	// ------------------------------------------------------------------
	// Links to other tools
	// ------------------------------------------------------------------

	const dfaText = $derived(result && !stale ? formatAutomatonText(result.dfa) : null);
	const minimizeHref = $derived(
		dfaText ? toolLink('minimize', { from: 'dfa', text: dfaText }) : null
	);
	const automataHref = $derived(dfaText ? toolLink('automata', { text: dfaText }) : null);
	const thompsonHref = $derived(
		model.from === 're' && build.nfa
			? toolLink('thompson', model.defs ? { re: model.re, defs: model.defs } : { re: model.re })
			: null
	);

	// ------------------------------------------------------------------
	// Predictions
	// ------------------------------------------------------------------

	let prediction = $state.raw<Prediction>(newPrediction());

	const pv = $derived(model.predict && result ? predictionView(result, index, prediction) : null);
	const pending = $derived(pv?.pending ?? null);
	const picked = $derived(pv?.picked ?? []);
	const verdict = $derived(pv?.showVerdict ? prediction.verdict : null);
	const predicting = $derived(pv?.phase === 'pick');
	const pendingStep = $derived(pending !== null ? result?.steps[pending] : undefined);

	/** Drops the picks and the verdict; the score stays. */
	function resetPrediction() {
		prediction = { ...newPrediction(), score: prediction.score };
	}

	function pick(id: StateId) {
		if (result) prediction = togglePick(result, index, prediction, id);
	}

	function check() {
		const c = result ? checkPicks(result, index, prediction) : null;
		if (!c) return;
		prediction = c.prediction;
		stepper.pause();
		stepper.set(c.reveal);
	}

	function startOver() {
		prediction = newPrediction();
		stepper.pause();
		stepper.first();
	}

	const primaryLabel = $derived(
		pv?.phase === 'pick' ? 'Check' : pv?.phase === 'verdict' ? 'Continue' : 'Start over'
	);

	/** Check the picks, move on to the next target after a verdict, or start again at the end. */
	function primaryAction() {
		if (pv?.phase === 'pick') check();
		else if (pv?.phase === 'verdict') prediction = continuePrediction(prediction);
		else startOver();
	}

	function setPredict(on: boolean) {
		model.predict = on;
		prediction = newPrediction();
		stepper.pause();
		if (on) stepper.first();
	}

	// ------------------------------------------------------------------
	// Highlights
	// ------------------------------------------------------------------

	const toneMap = (ids: readonly StateId[], tone: StateTone) =>
		new Map<StateId, StateTone>(ids.map((id) => [id, tone]));

	const nfaView = $derived.by(() => {
		if (!result) return {};
		if (predicting && pendingStep?.kind === 'target') {
			const chosen = new Set(picked);
			const from = result.dfa.states[pendingStep.from].subset ?? [];
			return {
				active: picked,
				tone: toneMap(
					from.filter((s) => !chosen.has(s)),
					'info'
				)
			};
		}
		const h = nfaHighlight(result, index);
		const tone = toneMap(h.info, 'info');
		if (verdict) {
			for (const s of verdict.check.hits) tone.set(s, 'accept');
			for (const s of verdict.check.extra) tone.set(s, 'reject');
		}
		return { active: h.active, taken: h.taken, tone };
	});

	const dfaView = $derived.by(() => {
		if (!result) return {};
		if (predicting && pendingStep?.kind === 'target')
			return { tone: toneMap([pendingStep.from], 'info') };
		const h = dfaHighlight(result, index);
		return { active: h.active, taken: h.taken, tone: toneMap(h.info, 'info') };
	});

	// ------------------------------------------------------------------
	// Editing
	// ------------------------------------------------------------------

	/** After the source changes: show the finished construction (or the start, when predicting). */
	function restart() {
		stepper.pause();
		resetPrediction();
		if (model.predict) stepper.first();
		else stepper.last();
	}

	/** Showing or hiding ∅ changes the steps; a view of the finished DFA stays on it. */
	function setShowEmpty(on: boolean) {
		const atEnd = stepper.atEnd;
		model.showEmpty = on;
		resetPrediction();
		if (atEnd) stepper.last();
	}

	/** Narrow screens size diagrams to their drawing; wide ones line the two up. */
	let machinesWidth = $state(0);
	const diagramHeight = $derived<number | 'auto'>(
		machinesWidth > 0 && machinesWidth < 640 ? 'auto' : 320
	);

	/** The Regular definitions editor is opened or closed only when a source arrives from outside. */
	let defsOpen = $state(false);

	function loadPreset(p: SubsetPreset) {
		Object.assign(model, presetFields(p.value, model));
		model.input = p.value.input ?? '';
		model.seeds = [];
		defsOpen = model.defs !== '';
		restart();
	}

	function setFrom(from: 're' | 'nfa') {
		if (from === model.from) return;
		const { re, defs, text } = model;
		// The NFA text starts from the machine shown; an empty regular expression from the default.
		const nfaText = from === 'nfa' && text.trim() === '' && nfa ? formatAutomatonText(nfa) : null;
		Object.assign(model, switchSource({ from: model.from, re, defs, text }, from, nfaText));
		model.seeds = [];
		restart();
	}

	function openBlowup(k: number) {
		model.from = 'nfa';
		model.text = blowupNfaText(k);
		model.input = '';
		model.seeds = [];
		restart();
		const el = document.getElementById('construction');
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		el?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
	}

	syncToHash(() => ({ ...model, step: stepper.index }), {
		validate: isSubsetHash,
		onLoad: (v) => {
			Object.assign(model, stateFromHash($state.snapshot(model), v));
			// A new source: the only NFA to fall back on is its own.
			lastGood = build.nfa ? build : null;
			defsOpen = model.defs !== '';
			stepper.pause();
			resetPrediction();
			const s = stepFromHash(v);
			if (s === null) stepper.last();
			else stepper.set(s);
		}
	});

	// ------------------------------------------------------------------
	// Display helpers
	// ------------------------------------------------------------------

	const namingOptions: { value: SubsetNaming; label: string; title: string }[] = [
		{
			value: 'discovery',
			label: 'ABCDHI',
			title: 'NFA state names joined in the order found (set notation when a name is longer)'
		},
		{ value: 'sorted-set', label: '{A, B, C}', title: 'The set of NFA states, sorted' },
		{ value: 'numbered', label: 'D0, D1', title: 'Numbered in the order created' }
	];

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'closure', label: 'ε-closure' },
		{ id: 'predict', label: 'Predict' },
		{ id: 'run', label: 'Run both' },
		{ id: 'blowup', label: 'Blow-up' }
	];

	const nfaName = (id: StateId) => (nfa ? stateName(nfa, id) : '');
	const dfaName = (id: StateId) => (dfa ? stateName(dfa, id) : '');
	const set = (ids: readonly StateId[]) => (nfa ? setText(nfa, ids) : '');
	const MAX_LISTED = 6;

	/** Accepting DFA states with the accepting NFA states they contain. */
	const accepting = $derived(
		dfa && nfa
			? dfa.states
					.filter((s) => s.accepting)
					.map((s) => ({
						name: s.name,
						finals: (s.subset ?? []).filter((id) => nfa.states[id].accepting).map(nfaName)
					}))
			: []
	);
</script>

{#snippet arrow(from: string, symbol: string, to: string)}
	<span class="f nowrap">{from} →<sup>{symbol}</sup> {to}</span>
{/snippet}

{#snippet list(items: string[])}
	{#each items.slice(0, MAX_LISTED) as item, j (j)}{j > 0 ? ', ' : ''}<span class="f">{item}</span
		>{/each}{items.length > MAX_LISTED ? ', …' : ''}
{/snippet}

{#snippet stepText(s: SubsetTraceStep, i: number)}
	{#if nfa && result && dfa}
		{#if s.kind === 'start'}
			Start: ε-closure({set([nfa.start])}) = <span class="f">{set(s.closure.order)}</span> is the
			first DFA state, <span class="f">{dfaName(s.dstate)}</span>. It goes on the worklist.
		{:else if s.kind === 'move'}
			{@const sym = classText(s.symbol)}
			<span class="f">{dfaName(s.from)}</span> on <span class="f">{sym}</span>: move =
			<span class="f">{set(s.targets)}</span>{#if s.via.length > 0}, by
				{#each s.via.slice(0, MAX_LISTED) as t, j (t)}{j > 0 ? ', ' : ''}{@render arrow(
						nfaName(nfa.transitions[t].from),
						sym,
						nfaName(nfa.transitions[t].to)
					)}{/each}{s.via.length > MAX_LISTED ? ', …' : ''}.
			{:else}; no state in it has a transition on <span class="f">{sym}</span>.
			{/if}
		{:else if s.kind === 'closure'}
			{@const moved = result.steps[i - 1]}
			ε-closure({set(moved?.kind === 'move' ? moved.targets : [])}) =
			<span class="f">{set(s.order)}</span>.
		{:else if s.kind === 'target'}
			{@const sym = classText(s.symbol)}
			{#if s.to === null}
				The set is empty, so <span class="f">{dfaName(s.from)}</span> has no transition on
				<span class="f">{sym}</span> (the ∅ state is hidden).
			{:else if s.isNew}
				New DFA state <span class="f">{dfaName(s.to)}</span>{s.to === result.empty
					? ' (the empty set)'
					: ''}; it joins the worklist{dfa.states[s.to].accepting
					? ' and accepts, since it contains an accepting NFA state'
					: ''}. Add {@render arrow(dfaName(s.from), sym, dfaName(s.to))}.
			{:else}
				This set is DFA state <span class="f">{dfaName(s.to)}</span>, already found. Add
				{@render arrow(dfaName(s.from), sym, dfaName(s.to))}.
			{/if}
		{:else}
			Done: the worklist is empty. {dfa.states.length} DFA
			{dfa.states.length === 1 ? 'state' : 'states'}, {dfa.transitions.length}
			{dfa.transitions.length === 1 ? 'transition' : 'transitions'}.
			{#if accepting.length === 0}
				No DFA state accepts.
			{:else}
				{#each accepting.slice(0, 4) as a, j (j)}{j > 0 ? '; ' : ''}<span class="f">{a.name}</span>
					accepts (contains {@render list(a.finals)}){/each}{accepting.length > 4
					? `; ${accepting.length - 4} more accept`
					: ''}.
			{/if}
		{/if}
	{/if}
{/snippet}

{#snippet legendItem(kind: 'info' | 'active' | 'edge', text: string)}
	<span class="legend-item"><span class="swatch {kind}" aria-hidden="true"></span>{text}</span>
{/snippet}

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu presets={PRESETS} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Source">
		<div class="source">
			<div class="source-main">
				<SegmentedControl
					label="Source"
					options={[
						{ value: 're', label: 'From a regular expression' },
						{ value: 'nfa', label: 'From an NFA' }
					]}
					value={model.from}
					onchange={setFrom}
				/>
				{#if model.from === 're'}
					<RegexField
						label="Regular expression"
						bind:value={model.re}
						diagnostics={build.reDiagnostics}
						placeholder="(1 | 0)*1"
						oninput={restart}
					/>
					<Disclosure summary="Regular definitions" bind:open={defsOpen}>
						<CodeEditor
							ariaLabel="Regular definitions, one per line"
							bind:value={model.defs}
							diagnostics={build.defsDiagnostics}
							minRows={2}
							maxRows={8}
							placeholder="digit = '0' | … | '9'"
							oninput={restart}
						/>
					</Disclosure>
					<p class="hint">
						The NFA is built with Thompson's construction; its states are named A, B, C, … by
						column.
						{#if thompsonHref}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
							<a href={thompsonHref}>Open in Thompson's construction</a>
						{/if}
					</p>
				{:else}
					<CodeEditor
						label="NFA"
						bind:value={model.text}
						diagnostics={build.textDiagnostics}
						minRows={5}
						maxRows={14}
						placeholder="start: A&#10;accept: B&#10;A 0,1 A&#10;A 1 B"
						oninput={restart}
					/>
					<p class="hint">
						One transition per line: <code>A 0,1 B</code> or <code>A ε B</code>. Mark states with
						<code>start: A</code> and <code>accept: B C</code>; <code>alphabet: 0,1</code> declares Σ.
					</p>
				{/if}
			</div>

			<div class="source-side">
				<SegmentedControl
					label="DFA state names"
					showLabel
					size="sm"
					mono
					options={namingOptions}
					bind:value={model.naming}
				/>
				<Toggle
					label="Show the ∅ state"
					description="The empty set of NFA states, kept as a DFA state"
					checked={model.showEmpty}
					onchange={setShowEmpty}
				/>
				{#if preset?.question}
					{@const q = preset.question}
					<div class="question">
						<CitationTag cite={q.cite} />
						<p class="prompt">{q.prompt}</p>
						<Disclosure>
							<p>{q.answer}</p>
							{#if q.minimizeLink && minimizeHref}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
								<a class="link-button" href={minimizeHref}
									>Minimize this DFA <Icon name="arrow-right" size={14} /></a
								>
							{/if}
						</Disclosure>
					</div>
				{/if}
			</div>
		</div>
	</Panel>

	{#if build.tooLarge !== null}
		<Callout tone="warn" title="NFA too large">
			{model.from === 're'
				? `This regular expression gives an NFA with more than ${MAX_NFA_STATES} states`
				: `This NFA has ${build.tooLarge} states`}; the page builds NFAs of up to {MAX_NFA_STATES}
			states.
			{#if stale}The construction below is for the last NFA built.{/if}
		</Callout>
	{:else if !nfa}
		<Callout tone="info">No NFA yet: fix the problems listed under the input.</Callout>
	{/if}

	{#if nfa}
		<Panel title="Construction" id="construction">
			{#snippet actions()}
				{#if stale}
					<span class="stale-badge"><Badge>Last valid NFA</Badge></span>
				{/if}
				{#if nfa}
					<span class="counter">
						DFA states: <strong>{step?.dfaStates ?? '—'}</strong> of 2{superscript(
							nfa.states.length
						)} = {powerOfTwoText(nfa.states.length)} possible subsets
					</span>
				{/if}
			{/snippet}

			{#if construction?.tooLarge}
				<Callout tone="warn" title="DFA too large">
					The subset construction reaches more than {MAX_DFA_STATES} DFA states for this NFA; the page
					stops at {MAX_DFA_STATES}. The NFA and its ε-closures are still shown.
				</Callout>
			{:else if result}
				<StepControls {stepper} ariaLabel="Subset construction steps">
					{#snippet label(i)}
						{@const s = result?.steps[i]}
						{#if s}{@render stepText(s, i)}{/if}
					{/snippet}
				</StepControls>

				{#if model.predict && pv}
					<div class="predict">
						<div class="predict-status" aria-live="polite">
							{#if verdict}
								{@const c = verdict.check}
								{#if c.correct}
									<p class="verdict ok">
										<Icon name="check" size={16} /> Correct:
										<span class="f">{set(targetSet(result, verdict.target))}</span>.
									</p>
								{:else}
									<p class="verdict bad">
										<Icon name="x" size={16} />
										{#if c.missing.length}Missing: {@render list(c.missing.map(nfaName))}.{/if}
										{#if c.extra.length}Not in the set: {@render list(c.extra.map(nfaName))}.{/if}
										The set is <span class="f">{set(targetSet(result, verdict.target))}</span>.
									</p>
								{/if}
							{/if}
							{#if pendingStep?.kind === 'target'}
								{@const asked = `ε-closure(move(${dfaName(pendingStep.from)}, ${classText(pendingStep.symbol)}))`}
								{#if pv.phase === 'verdict'}
									<p>Next: <span class="f">{asked}</span>.</p>
								{:else}
									<p>
										<strong>Predict</strong> <span class="f">{asked}</span>: {nfaDrawable
											? 'click NFA states in the diagram'
											: 'pick NFA states below'}, then Check.
									</p>
								{/if}
							{:else}
								<p class="done-note">
									Every target has been revealed{prediction.score.total > 0
										? `; ${prediction.score.right} of ${prediction.score.total} predictions correct`
										: ''}.
								</p>
							{/if}
						</div>
						{#if pv.phase === 'pick' && !nfaDrawable}
							<StatePicker {nfa} {picked} onpick={pick} label="NFA states for the prediction" />
						{/if}
						<!-- One primary button whose action follows the phase, so keyboard focus stays on it. -->
						<div class="ask-row">
							{#if pv.phase === 'pick'}
								<output class="f picked">{set(picked)}</output>
							{/if}
							<Button size="sm" variant="primary" onclick={primaryAction}>{primaryLabel}</Button>
							{#if pv.phase === 'pick'}
								<Button
									size="sm"
									variant="ghost"
									disabled={picked.length === 0}
									onclick={resetPrediction}>Clear</Button
								>
							{/if}
						</div>
					</div>
				{/if}
			{/if}

			<div class={['machines', { stale }]} bind:clientWidth={machinesWidth}>
				<figure class="machine">
					<figcaption>
						<span class="machine-title">NFA</span>
						<span class="machine-sub"
							>{nfa.states.length} states{model.from === 're'
								? ", Thompson's construction"
								: ''}</span
						>
					</figcaption>
					{#if nfaDrawable}
						<AutomatonView
							automaton={nfa}
							positions={nfaPositions}
							highlight={nfaView}
							onstateclick={pv?.canPick ? pick : undefined}
							height={diagramHeight}
							ariaLabel={pv?.canPick
								? 'NFA. Select states to add them to the prediction.'
								: 'NFA with the current step marked'}
						/>
					{:else}
						<p class="too-big">
							The NFA has {nfa.states.length} states; diagrams are drawn for up to {maxDrawnNfa}.
						</p>
					{/if}
				</figure>

				<figure class="machine">
					<figcaption>
						<span class="machine-title">DFA</span>
						{#if shownDfa && dfa}
							<span class="machine-sub">{shownDfa.states.length} of {dfa.states.length} states</span
							>
						{/if}
						{#if minimizeHref || automataHref}
							<span class="links">
								{#if minimizeHref}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
									<a class="link-button" href={minimizeHref}>Minimize this DFA</a>
								{/if}
								{#if automataHref}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
									<a class="link-button" href={automataHref}>Open DFA in Finite Automata</a>
								{/if}
							</span>
						{/if}
					</figcaption>
					{#if shownDfa && dfaDrawable}
						<AutomatonView
							automaton={shownDfa}
							positions={dfaPositions}
							frame={dfaFrame}
							viewKey={dfa}
							highlight={dfaView}
							height={diagramHeight}
							ariaLabel="DFA built so far"
						/>
					{:else if dfa}
						<p class="too-big">
							The DFA has {dfa.states.length} states; diagrams are drawn for up to {MAX_DRAWN_DFA}.
							The worklist table lists every state.
						</p>
					{:else}
						<p class="too-big">No DFA.</p>
					{/if}
				</figure>
			</div>

			{#if result}
				<div class="legend">
					{@render legendItem('info', 'Being processed')}
					{@render legendItem('active', 'move, ε-closure, target')}
					{@render legendItem('edge', 'Transitions followed or added')}
					<span class="legend-item"><span class="mark">→</span> start</span>
					<span class="legend-item"><span class="mark">◎</span> accepting</span>
				</div>

				<div class={['worklist', { stale }]}>
					<h3 class="sub-title">Worklist</h3>
					<WorklistTable {result} {nfa} {index} />
				</div>
			{/if}
		</Panel>
	{/if}

	<Panel>
		<Tabs label="More views" {tabs} value={model.tab} onchange={(id) => (model.tab = id as TabId)}>
			{#snippet children(id)}
				{#if id === 'closure'}
					{#if nfa}
						<div class={{ stale }}>
							<ClosureExplorer
								{nfa}
								positions={nfaPositions}
								drawable={nfaDrawable}
								seeds={model.seeds}
								onseedschange={(s) => (model.seeds = s)}
							/>
						</div>
					{:else}
						<p class="tab-note">No NFA: fix the problems listed under the input.</p>
					{/if}
				{:else if id === 'predict'}
					<div class="predict-tab">
						<Toggle
							label="Predict each target"
							description="Before a target is revealed, pick the NFA states you expect in its ε-closure, then Check. Missing and extra states are listed, then the step is shown."
							checked={model.predict}
							onchange={setPredict}
						/>
						{#if model.predict}
							<p>
								The prompt is above the diagrams, in <a href="#construction">Construction</a>.
								{#if prediction.score.total > 0}
									{@const sc = prediction.score}
									<Badge tone={sc.right === sc.total ? 'accept' : 'neutral'}
										>{sc.right} of {sc.total} correct</Badge
									>
								{/if}
							</p>
						{/if}
					</div>
				{:else if id === 'run'}
					{#if nfa && result && dfa}
						<div class={{ stale }}>
							<RunBoth
								{nfa}
								{dfa}
								{nfaPositions}
								{dfaPositions}
								{dfaFrame}
								drawNfa={nfaDrawable}
								drawDfa={dfaDrawable}
								input={model.input}
								oninputchange={(v) => (model.input = v)}
							/>
						</div>
					{:else if nfa}
						<p class="tab-note">The run needs the DFA, which is too large here.</p>
					{:else}
						<p class="tab-note">No NFA: fix the problems listed under the input.</p>
					{/if}
				{:else}
					<BlowUp k={model.k} onkchange={(k) => (model.k = k)} onopen={openBlowup} />
				{/if}
			{/snippet}
		</Tabs>
	</Panel>
</ToolPage>

<style>
	.source {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: var(--space-5) var(--space-6);
	}
	.source-main,
	.source-side {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.source-side {
		gap: var(--space-4);
		padding-left: var(--space-6);
		border-left: 1px solid var(--border);
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	.hint a {
		white-space: nowrap;
	}
	.question {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.question .prompt {
		margin: var(--space-1) 0 0;
		font-family: var(--font-serif);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.35;
	}
	.question p {
		font-size: var(--text-sm);
	}
	.link-button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.link-button:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.counter {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.counter strong {
		color: var(--text);
	}
	.predict {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid color-mix(in srgb, var(--info) 35%, transparent);
		border-radius: var(--radius);
		background: var(--info-soft);
		font-size: var(--text-sm);
	}
	.predict p {
		margin: 0;
	}
	.predict-status {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ask-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.picked {
		min-width: 6ch;
		padding: 3px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow-wrap: anywhere;
	}
	.verdict :global(svg) {
		margin-right: 2px;
		vertical-align: -3px;
	}
	.verdict.ok :global(svg) {
		color: var(--accept);
	}
	.verdict.bad :global(svg) {
		color: var(--reject);
	}
	.verdict .f {
		color: var(--text);
	}
	.done-note {
		color: var(--text-2);
	}
	.machines {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-4);
	}
	.machine {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.machine figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}
	.machine-title {
		font-family: var(--font-serif);
		font-weight: 600;
	}
	.machine-sub {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-left: auto;
	}
	.too-big {
		margin: 0;
		padding: var(--space-5) var(--space-4);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.tab-note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	/* The construction of the last NFA built, while the input has problems. */
	.stale {
		opacity: 0.5;
		/* Dims only once a problem outlasts a pause in typing; restores at once. */
		transition: opacity var(--duration) var(--ease) 400ms;
	}
	.stale-badge {
		display: inline-flex;
		animation: appear var(--duration) var(--ease) 400ms both;
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin-top: var(--space-3);
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid;
	}
	.swatch.info {
		border-color: var(--info);
		background: var(--info-soft);
	}
	.swatch.active {
		border-color: var(--active);
		background: var(--active-soft);
	}
	.swatch.edge {
		width: 18px;
		height: 0;
		border-width: 1.5px 0 0;
		border-radius: 0;
		border-color: var(--active);
	}
	.mark {
		font-family: var(--font-mono);
		color: var(--text-3);
	}
	.worklist {
		margin-top: var(--space-5);
	}
	.sub-title {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}
	.predict-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		max-width: var(--content-width);
	}
	.predict-tab p {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.nowrap {
		white-space: nowrap;
	}
	sup {
		font-size: 0.72em;
	}
	@media (max-width: 420px) {
		/* Both source options stay visible on a phone. */
		.source-main :global(.segmented-wrap .segmented .face) {
			padding: 0 8px;
			font-size: var(--text-xs);
		}
	}
	@media (max-width: 960px) {
		.source {
			grid-template-columns: minmax(0, 1fr);
		}
		.source-side {
			padding-left: 0;
			padding-top: var(--space-4);
			border-left: 0;
			border-top: 1px solid var(--border);
		}
		.machines {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
