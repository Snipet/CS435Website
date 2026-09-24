<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Badge,
		Button,
		CitationTag,
		Disclosure,
		Icon,
		Panel,
		PresetMenu,
		Select,
		StepControls,
		Stepper,
		ToolPage
	} from '$lib/components/ui';
	import { tool } from '$lib/tools/catalog/t-diagrams';
	import ArchitecturePanel from '$lib/tools/t-diagrams/ArchitecturePanel.svelte';
	import Bench from '$lib/tools/t-diagrams/Bench.svelte';
	import BootstrapFigure from '$lib/tools/t-diagrams/BootstrapFigure.svelte';
	import { tGeometry, type Metrics } from '$lib/tools/t-diagrams/geometry';
	import LangText from '$lib/tools/t-diagrams/LangText.svelte';
	import {
		checkWorkbench,
		compose,
		formatT,
		goalMet,
		parseRunnable,
		piecesText,
		resultPieces,
		richText,
		sameT,
		type Piece,
		type TDiagram
	} from '$lib/tools/t-diagrams/model';
	import Pieces from '$lib/tools/t-diagrams/Pieces.svelte';
	import { presets, type TDiagramsPreset } from '$lib/tools/t-diagrams/presets';
	import {
		defaultState,
		isTDiagramsHash,
		matchPreset,
		MAX_TOOLBOX,
		nextId,
		stateFromHash,
		stateFromPreset,
		type TDiagramsState
	} from '$lib/tools/t-diagrams/state';
	import TShape from '$lib/tools/t-diagrams/TShape.svelte';
	import Tray from '$lib/tools/t-diagrams/Tray.svelte';
	import TText from '$lib/tools/t-diagrams/TText.svelte';
	import { bootstrapSteps } from '$lib/tools/t-diagrams/walkthrough';
	import WorkbenchEditor from '$lib/tools/t-diagrams/WorkbenchEditor.svelte';
	import { syncToHash } from '$lib/url-state';

	let form = $state<TDiagramsState>(defaultState());

	/** The Compose row's choices (toolbox ids); not part of the link. */
	let picks = $state({ program: '', translator: '' });
	let pickNext: 'program' | 'translator' = 'program';
	/** Announced after Compose or a drop. */
	let announcement = $state('');

	syncToHash(() => form, {
		validate: isTDiagramsHash,
		onLoad: (value) => {
			Object.assign(form, stateFromHash(value));
			resetPicks();
		}
	});

	// ---- Walkthrough (slide 8) ------------------------------------------------

	const walkSteps = bootstrapSteps();
	const stepper = new Stepper(() => (form.guide ? walkSteps.length : 0), {
		index: untrack(() => form.step)
	});
	// form.step (from a link or a preset) drives the stepper…
	$effect(() => {
		const step = form.step;
		untrack(() => stepper.set(step));
	});
	// …and the stepper writes back where it is.
	$effect(() => {
		const i = stepper.index;
		untrack(() => {
			if (form.guide && form.step !== i) form.step = i;
		});
	});
	const walkStep = $derived(walkSteps[stepper.index] ?? walkSteps[0]);

	// ---- Workbench -------------------------------------------------------------

	const facts = $derived({ subsets: form.subsets, runnable: parseRunnable(form.runnable) });
	const issues = $derived(checkWorkbench(form));
	const activePreset = $derived(matchPreset(form));
	const items = $derived(form.toolbox.map((t) => ({ id: t.id, t: t as TDiagram })));
	const ids = $derived(form.toolbox.map((t) => t.id));
	const full = $derived(form.toolbox.length >= MAX_TOOLBOX);

	const pickProgram = $derived(ids.includes(picks.program) ? picks.program : (ids[0] ?? ''));
	const pickTranslator = $derived(
		ids.includes(picks.translator)
			? picks.translator
			: (ids.find((id) => id !== pickProgram) ?? ids[0] ?? '')
	);
	const options = $derived(
		form.toolbox.map((t, i) => ({ value: t.id, label: `${i + 1}. ${formatT(t)}` }))
	);

	const bench = $derived.by(() => {
		const c = form.compose;
		if (!c) return null;
		const program = form.toolbox.find((t) => t.id === c.program);
		const translator = form.toolbox.find((t) => t.id === c.translator);
		if (!program || !translator) return null;
		return { program, translator, composition: compose(program, translator, facts) };
	});
	const result = $derived(bench?.composition.result ?? null);
	const goalReached = $derived(goalMet(form.goal, [...form.toolbox, result]));
	const resultIsGoal = $derived(!!(result && form.goal && sameT(result, form.goal)));
	const resultInToolbox = $derived(!!result && form.toolbox.some((t) => sameT(t, result)));
	const sample = $derived(
		form.toolbox.find((t) => t.id === pickProgram) ?? form.toolbox[0] ?? null
	);

	const GOAL_METRICS: Metrics = { unit: 22, font: 13, pad: 6 };
	const goalGeom = $derived(form.goal ? tGeometry(form.goal, GOAL_METRICS) : null);

	function resetPicks() {
		picks.program = form.compose?.program ?? form.toolbox[0]?.id ?? '';
		picks.translator = form.compose?.translator ?? form.toolbox[1]?.id ?? '';
		pickNext = 'program';
	}

	function loadPreset(p: TDiagramsPreset) {
		stepper.pause();
		Object.assign(
			form,
			stateFromPreset(p.value, { languages: form.languages, targets: form.targets })
		);
		resetPicks();
		announcement = '';
	}

	/** Click, Enter or Space on a drawn diagram: first the one to compile, then the translator. */
	function pick(id: string) {
		if (pickNext === 'program') {
			picks.program = id;
			pickNext = 'translator';
		} else {
			picks.translator = id;
			pickNext = 'program';
		}
	}

	function composeIds(program: string, translator: string) {
		const p = form.toolbox.find((t) => t.id === program);
		const t = form.toolbox.find((x) => x.id === translator);
		if (!p || !t) return;
		form.compose = { program, translator };
		picks.program = program;
		picks.translator = translator;
		pickNext = 'program';
		const c = compose(p, t, facts);
		const failed = c.checks.find((x) => !x.ok);
		announcement = c.result
			? `${formatT(p)} compiled with ${formatT(t)} gives ${formatT(c.result)}.`
			: `${formatT(p)} does not compose with ${formatT(t)}. ${failed ? piecesText(failed.pieces) : ''}`;
	}

	function addDiagram() {
		if (full) return;
		form.toolbox.push({ id: nextId(form.toolbox), source: '', target: '', host: '' });
	}

	function removeDiagram(id: string) {
		const i = form.toolbox.findIndex((t) => t.id === id);
		if (i < 0) return;
		form.toolbox.splice(i, 1);
		if (form.compose && (form.compose.program === id || form.compose.translator === id)) {
			form.compose = null;
		}
	}

	function addResult() {
		if (!result || resultInToolbox || full) return;
		form.toolbox.push({ id: nextId(form.toolbox), ...result });
		announcement = `Added ${formatT(result)} to the toolbox as diagram ${form.toolbox.length}.`;
	}

	const sampleCaption = (t: TDiagram): Piece[] => [
		{ t },
		' translates ',
		{ lang: t.source },
		' to ',
		{ lang: t.target },
		' and is written in ',
		{ lang: t.host },
		'.'
	];
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={activePreset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	{#if activePreset}
		<Panel variant="subtle" class="scenario" aria-label="About this example">
			<div class="scenario-body">
				<div class="scenario-head">
					<h2 class="scenario-title">{activePreset.label}</h2>
					{#if activePreset.cite}<CitationTag cite={activePreset.cite} />{/if}
				</div>
				<p class="scenario-desc"><Pieces pieces={richText(activePreset.description ?? '')} /></p>
				{#if activePreset.question}
					{@const q = activePreset.question}
					<div class="question">
						<p class="q-prompt">
							{q.prompt}
							{#if q.cite}<CitationTag cite={q.cite} />{/if}
						</p>
						<Disclosure summary="Show answer" openSummary="Hide answer">
							<p class="answer">{q.answer}</p>
						</Disclosure>
					</div>
				{/if}
			</div>
		</Panel>
	{/if}

	{#if form.guide === 'bootstrap'}
		<Panel title="Bootstrapping, step by step" class="walk-panel">
			{#snippet actions()}<CitationTag cite={{ deck: '02', slide: 8 }} />{/snippet}
			<div class="walk">
				<div class="walk-text">
					<StepControls {stepper} ariaLabel="Bootstrapping steps">
						{#snippet label(i: number)}
							<Pieces pieces={walkSteps[i].pieces} />
						{/snippet}
					</StepControls>
					<ul class="walk-notes" aria-label="Notes on the slide">
						<li><LangText text="L′" /> is simple subset of <LangText text="L" /></li>
						<li><LangText text="M′" /> is inefficient M-code</li>
					</ul>
				</div>
				<figure class="walk-figure">
					<BootstrapFigure step={walkStep} />
				</figure>
			</div>
		</Panel>
	{/if}

	<div class="workspace">
		<Panel title="Workbench" class="bench-panel">
			{#snippet actions()}
				{#if form.goal && goalGeom}
					<div class={['goal', { met: goalReached }]}>
						<span class="goal-label">Want this</span>
						<svg
							class="goal-t"
							viewBox="-2 -2 {goalGeom.width + 4} {goalGeom.height + 4}"
							width={goalGeom.width + 4}
							height={goalGeom.height + 4}
							aria-hidden="true"
						>
							<TShape t={form.goal} geom={goalGeom} tone={goalReached ? 'accept' : 'muted'} />
						</svg>
						<TText t={form.goal} />
						<Badge tone={goalReached ? 'accept' : 'neutral'}>
							{#if goalReached}<Icon name="check" size={12} />Reached{:else}Not yet{/if}
						</Badge>
					</div>
				{/if}
			{/snippet}

			<div class="bench-body">
				<Tray
					{items}
					{facts}
					program={pickProgram || null}
					translator={pickTranslator || null}
					goal={form.goal}
					onpick={pick}
					oncompose={composeIds}
				/>

				<div class="compose-row">
					<div class="compose-selects">
						<span class="pick">
							<span class="dot program" aria-hidden="true"></span>
							<Select
								label="Compile"
								inline
								size="sm"
								{options}
								value={pickProgram}
								disabled={!options.length}
								onchange={(v) => (picks.program = v)}
							/>
						</span>
						<span class="pick">
							<span class="dot translator" aria-hidden="true"></span>
							<Select
								label="with"
								inline
								size="sm"
								{options}
								value={pickTranslator}
								disabled={!options.length}
								onchange={(v) => (picks.translator = v)}
							/>
						</span>
					</div>
					<Button
						variant="primary"
						size="sm"
						disabled={!pickProgram || !pickTranslator}
						onclick={() => composeIds(pickProgram, pickTranslator)}
					>
						Compose
					</Button>
				</div>

				<section class="bench" aria-label="Composition">
					<div class="bench-figure">
						<Bench
							program={bench?.program ?? null}
							translator={bench?.translator ?? null}
							composition={bench?.composition ?? null}
							{sample}
							goalHit={resultIsGoal}
						/>
					</div>
					{#if bench}
						<ul class="checks">
							{#each bench.composition.checks as c, i (i)}
								<li class={c.ok ? 'ok' : 'bad'}>
									<Icon
										name={c.ok ? 'success' : 'error'}
										size={17}
										label={c.ok ? 'Met' : 'Not met'}
									/>
									<span><Pieces pieces={c.pieces} /></span>
								</li>
							{/each}
						</ul>
						{#if result}
							<div class="result">
								<p class="result-text">
									<span class="eq" aria-hidden="true">=</span>
									<span><Pieces pieces={resultPieces(bench.program, result)} /></span>
								</p>
								<div class="result-actions">
									{#if resultIsGoal}
										<Badge tone="accept"><Icon name="check" size={12} />Goal reached</Badge>
									{/if}
									<Button size="sm" onclick={addResult} disabled={resultInToolbox || full}>
										{#snippet icon()}<Icon
												name={resultInToolbox ? 'check' : 'plus'}
												size={15}
											/>{/snippet}
										{resultInToolbox ? 'In the toolbox' : 'Add to toolbox'}
									</Button>
								</div>
							</div>
						{/if}
					{:else}
						{#if sample}
							<p class="bench-caption"><Pieces pieces={sampleCaption(sample)} /></p>
						{/if}
						<p class="bench-hint">
							Drag a diagram onto another one’s left arm, or choose two above and press Compose. The
							first is compiled; the second, the translator, must read the language the first is
							written in and must run directly.
						</p>
					{/if}
				</section>
				<p class="visually-hidden" aria-live="polite">{announcement}</p>
			</div>
		</Panel>

		<Panel title="Toolbox" subtitle="{form.toolbox.length} of {MAX_TOOLBOX}" class="editor-panel">
			<WorkbenchEditor
				bind:toolbox={form.toolbox}
				bind:subsets={form.subsets}
				bind:runnable={form.runnable}
				bind:goal={form.goal}
				{issues}
				onadd={addDiagram}
				onremove={removeDiagram}
			/>
		</Panel>
	</div>

	<ArchitecturePanel bind:languages={form.languages} bind:targets={form.targets} />
</ToolPage>

<style>
	/* Long Intro-deck citations shrink with an ellipsis instead of widening the page. */
	.scenario-head :global(.cite),
	.q-prompt :global(.cite),
	:global(.walk-panel .head .actions),
	:global(.walk-panel .head .actions .cite) {
		min-width: 0;
		max-width: 100%;
	}

	/* Scenario note */
	.scenario-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 60rem;
	}
	.scenario-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.scenario-title {
		margin: 0;
		font-size: var(--text-lg);
	}
	.scenario-desc {
		margin: 0;
		color: var(--text-2);
		line-height: 1.6;
	}
	.question {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}
	.q-prompt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-style: italic;
	}
	.q-prompt :global(.cite) {
		font-style: normal;
	}
	.answer {
		margin: 0;
		font-size: var(--text-sm);
	}

	/* Walkthrough */
	.walk {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	@media (min-width: 960px) {
		.walk {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
			gap: var(--space-6);
		}
	}
	.walk-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.walk-text :global(.caption) {
		min-height: 6.5em;
		font-size: var(--text-base);
		line-height: 1.6;
	}
	.walk-notes {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-2);
		font-size: var(--text-sm);
		list-style: none;
	}
	.walk-figure {
		margin: 0;
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	@media (max-width: 480px) {
		.walk-figure {
			padding: var(--space-2) var(--space-1);
		}
	}

	/* Workspace */
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	@media (min-width: 1080px) {
		.workspace {
			grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
		}
	}
	.goal {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	.goal-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.goal-t {
		display: block;
		flex: none;
	}
	.bench-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.compose-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}
	.compose-selects {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		min-width: 0;
	}
	.compose-selects :global(.field) {
		max-width: 100%;
	}
	.compose-selects :global(select) {
		max-width: min(20rem, 68vw);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.dot {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 50%;
	}
	.dot.program {
		border: 1.5px solid var(--tok-0);
		background: var(--tok-0-soft);
	}
	.dot.translator {
		border: 1.5px solid var(--tok-2);
		background: var(--tok-2-soft);
	}
	.pick {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		max-width: 100%;
	}
	.bench {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.bench-figure {
		max-width: 100%;
		overflow-x: auto;
		padding: var(--space-4) var(--space-3);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.bench-figure :global(.figure) {
		min-width: min(100%, 300px);
	}
	.checks {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	.checks li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		line-height: 1.5;
	}
	.checks li :global(.icon) {
		flex: none;
		margin-top: 2px;
	}
	.checks .ok :global(.icon) {
		color: var(--accept);
	}
	.checks .bad {
		color: var(--text);
	}
	.checks .bad :global(.icon) {
		color: var(--reject);
	}
	.result {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.result-text {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		min-width: 0;
		font-size: var(--text-sm);
	}
	.result-text .eq {
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		color: var(--text-3);
	}
	.result-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.bench-caption {
		margin: 0;
		font-size: var(--text-sm);
		text-align: center;
	}
	.bench-hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
</style>
