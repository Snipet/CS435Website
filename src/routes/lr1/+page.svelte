<script lang="ts">
	import { untrack } from 'svelte';
	import { GrammarEditor, LrItem, symbolText } from '$lib/components/grammar';
	import {
		Callout,
		Icon,
		Panel,
		PresetMenu,
		SegmentedControl,
		Stepper,
		ToolPage,
		Updating,
		WorkerTask,
		type Preset
	} from '$lib/components/ui';
	import { augment, printProduction } from '$lib/theory/grammar/lr';
	import { printGrammar } from '$lib/theory/grammar/parse';
	import { tool } from '$lib/tools/catalog/lr1';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import {
		closureOrderOf,
		computeBuild,
		readGrammar,
		readInput,
		METHOD_NAMES,
		type BuildRequest,
		type BuildResult
	} from '$lib/tools/lr1/build';
	import ClosurePanel from '$lib/tools/lr1/ClosurePanel.svelte';
	import { bracketedItem, closureSetup } from '$lib/tools/lr1/closure-steps';
	import { buildSteps } from '$lib/tools/lr1/construction';
	import DfaPanel from '$lib/tools/lr1/DfaPanel.svelte';
	import { DRAW_ALL, inRange, shownRange, stateNotes, windowAround } from '$lib/tools/lr1/diagram';
	import { itemView } from '$lib/tools/lr1/items';
	import LrTableView from '$lib/tools/lr1/LrTableView.svelte';
	import ParsePanel from '$lib/tools/lr1/ParsePanel.svelte';
	import { entryItems, parseFrames } from '$lib/tools/lr1/parse-steps';
	import PresetNote from '$lib/tools/lr1/PresetNote.svelte';
	import {
		DEFAULT_PRESET_ID,
		presetFor,
		presetState,
		presets,
		type Lr1PresetValue
	} from '$lib/tools/lr1/presets';
	import {
		edgeIndex,
		selectedCell,
		selectedRow,
		validSelection,
		type DfaSelection
	} from '$lib/tools/lr1/selection';
	import { DEFAULT_STATE, isLr1Hash, stateFromHash, type Lr1State } from '$lib/tools/lr1/state';
	import { actionEntry } from '$lib/tools/lr1/table-view';
	import { createBuildWorker } from '$lib/tools/lr1/worker';
	import { syncToHash } from '$lib/url-state';

	let form = $state<Lr1State>({ ...DEFAULT_STATE });
	/** The preset loaded last, shown for as long as it fits the state. */
	let loaded = $state<string | null>(DEFAULT_PRESET_ID);
	let selection = $state<DfaSelection>(null);

	function load(state: Lr1State, preset: string | null) {
		pause();
		selection = null;
		Object.assign(form, state);
		loaded = preset ?? presetFor(form)?.id ?? null;
	}

	syncToHash(() => form, {
		validate: isLr1Hash,
		onLoad: (value) => load(stateFromHash(value), null)
	});

	const preset = $derived(presetFor(form, loaded));
	function loadPreset(p: Preset<Lr1PresetValue>) {
		load(presetState(p), p.id);
	}

	// The grammar and the token string are read on every keystroke, for their diagnostics.
	const reading = $derived(readGrammar(form.grammar));
	const grammar = $derived(reading.grammar);
	const aug = $derived(grammar ? augment(grammar) : null);
	const inputReading = $derived(grammar ? readInput(form.input, grammar) : null);
	/** The notes on lower-case non-terminals are left out when there are many (the C- grammar has 29). */
	const grammarNotes = $derived.by(() => {
		const notes = reading.diagnostics.filter((d) => d.severity === 'info');
		return notes.length > 3
			? reading.diagnostics.filter((d) => d.severity !== 'info')
			: reading.diagnostics;
	});

	// The automata, tables and parse are built in a worker.
	const request = $derived<BuildRequest>({
		grammar: form.grammar,
		order: form.order,
		method: form.method,
		input: form.input
	});
	const task = new WorkerTask<BuildRequest, BuildResult | null>({
		compute: computeBuild,
		worker: createBuildWorker,
		initial: untrack(() => request)
	});
	$effect(() => task.run(request));
	let lastBuild: BuildResult | null = null;
	const build = $derived.by(() => {
		if (task.output) lastBuild = task.output;
		return lastBuild;
	});
	const sameRequest = (a: BuildRequest | null, b: BuildRequest) =>
		a !== null && JSON.stringify(a) === JSON.stringify(b);
	/** The build shown is for other inputs (being computed, or the grammar has errors). */
	const stale = $derived(build !== null && (!sameRequest(task.input, request) || !task.output));

	const notes = $derived(build ? stateNotes(build.automaton, build.method) : []);
	const states = $derived(build?.automaton.states.length ?? 0);
	const range = $derived(shownRange(states, form.range));

	// ── steppers: form.closureStep, form.buildStep and form.parseStep (null = the last step) ──
	const setup = $derived(
		closureSetup({
			mode: form.closure,
			aug,
			seed: form.seed,
			lr1: build?.lr1 ?? null,
			from: form.from,
			symbol: form.symbol,
			closureOrder:
				form.closure === 'closure'
					? grammar
						? closureOrderOf(grammar, form.order)
						: undefined
					: build
						? closureOrderOf(build.lr1.augmented.grammar, form.order)
						: undefined
		})
	);
	const steps = $derived(build ? buildSteps(build.automaton) : []);
	const frames = $derived(build?.parse ? parseFrames(build.table, build.parse) : []);

	const closureTotal = $derived(setup?.run?.frames.length ?? 0);
	const buildTotal = $derived(steps.length);
	const parseTotal = $derived(frames.length);
	const closureStepper = new Stepper(() => closureTotal, {
		index: untrack(() => form.closureStep ?? Math.max(0, closureTotal - 1))
	});
	const buildStepper = new Stepper(() => buildTotal, {
		index: untrack(() => form.buildStep ?? Math.max(0, buildTotal - 1))
	});
	const parseStepper = new Stepper(() => parseTotal, {
		index: untrack(() => form.parseStep ?? Math.max(0, parseTotal - 1))
	});
	function follow(
		stepper: Stepper,
		total: () => number,
		read: () => number | null,
		write: (v: number | null) => void
	) {
		$effect(() => {
			const n = total();
			const step = read();
			untrack(() => stepper.set(step === null ? n - 1 : step));
		});
		$effect(() => {
			const i = stepper.index;
			const n = total();
			untrack(() => {
				if (n === 0) return;
				const next = i >= n - 1 ? null : i;
				if (read() !== next) write(next);
			});
		});
	}
	follow(
		closureStepper,
		() => closureTotal,
		() => form.closureStep,
		(v) => (form.closureStep = v)
	);
	follow(
		buildStepper,
		() => buildTotal,
		() => form.buildStep,
		(v) => (form.buildStep = v)
	);
	follow(
		parseStepper,
		() => parseTotal,
		() => form.parseStep,
		(v) => (form.parseStep = v)
	);

	function pause() {
		closureStepper.pause();
		buildStepper.pause();
		parseStepper.pause();
	}

	/** A change of the grammar shows every stepper at its end. */
	function grammarEdited() {
		pause();
		form.closureStep = null;
		form.buildStep = null;
		form.parseStep = null;
		form.range = null;
	}

	// ── what the parse marks in the DFA and the table ──
	const frame = $derived(frames[parseStepper.index] ?? null);
	const parserState = $derived(frame && !stale ? frame.state : null);
	const followed = $derived(
		build && frame?.edge && !stale
			? edgeIndex(build.automaton, frame.edge.from, frame.edge.symbol)
			: null
	);
	const itemMarks = $derived(
		build && frame && !stale ? entryItems(build.automaton, build.table, frame) : undefined
	);
	const lookup = $derived(frame && !stale ? frame.cell : null);
	const shown = $derived(build ? validSelection(build.automaton, selection) : null);

	// A large automaton is shown a window at a time: the window follows the parser.
	$effect(() => {
		const s = parserState;
		const n = states;
		untrack(() => {
			if (s === null || n <= DRAW_ALL || inRange(range, s)) return;
			form.range = [...windowAround(s, n)];
		});
	});

	function select(next: DfaSelection) {
		const same = JSON.stringify(next) === JSON.stringify(selection);
		selection = same ? null : next;
	}

	// ── links ──
	const linkState = $derived(
		form.input.trim() ? { grammar: form.grammar, input: form.input } : { grammar: form.grammar }
	);
	const openIn = $derived.by(() => {
		if (!grammar) return [];
		return (['ll1', 'shift-reduce', 'conflicts'] as const).flatMap((slug) => {
			const title = toolBySlug(slug)?.title;
			const href = toolLink(slug, linkState);
			return title && href ? [{ title, href }] : [];
		});
	});
	const conflictsLink = $derived.by(() => {
		const title = toolBySlug('conflicts')?.title;
		const href = toolLink('conflicts', linkState);
		return title && href ? { title, href } : null;
	});
	const CONFLICT_LIMIT = 8;

	const orderOptions = [
		{ value: 'grammar' as const, label: 'Grammar order' },
		{ value: 'reversed' as const, label: 'Last production first' }
	];
	const startProduction = $derived(aug ? printProduction(aug.production) : '');
	const startView = $derived(
		aug ? itemView(aug, { production: aug.production.id, dot: 0, lookahead: '$' }) : null
	);
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={loadPreset} align="end" />
	{/snippet}

	<Panel title="Grammar" subtitle="augmented with a new start symbol">
		<div class={['input-grid', { 'has-note': !!preset }]}>
			<div class="input-main">
				<GrammarEditor
					label="Grammar"
					bind:value={form.grammar}
					oninput={grammarEdited}
					diagnostics={grammarNotes}
					nonterminals={grammar?.nonterminals}
					terminals={grammar?.terminals}
					minRows={2}
					maxRows={12}
					placeholder="E → E + ( E ) | int"
				/>
				{#if aug && grammar}
					<div class="augmented">
						<h3>Augmented grammar</h3>
						<pre class="grammar-text"><span class="added">{startProduction}</span>
{printGrammar(grammar)}</pre>
						<p class="hint">
							The new start symbol {aug.start} has the one production {startProduction}{aug.start !==
							'S'
								? ` (S is a symbol of the grammar, so the new one is ${aug.start})`
								: ''}. State 0 is Closure(&#123;
							{#if startView}<LrItem item={startView} style="spaced" />{/if}
							&#125;).
						</p>
					</div>
					<div class="order">
						<SegmentedControl
							options={orderOptions}
							bind:value={form.order}
							label="Closure order"
							showLabel
							size="sm"
							onchange={grammarEdited}
						/>
						<p class="hint">
							The order in which Closure adds the productions of a non-terminal, and so the order of
							the items in a state.
						</p>
					</div>
				{/if}
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

	<Panel title="Closure and Transition" subtitle="one item at a time">
		<ClosurePanel
			{setup}
			stepper={closureStepper}
			bind:mode={form.closure}
			bind:seed={form.seed}
			onpick={(from, symbol) => {
				form.from = from;
				form.symbol = symbol;
			}}
			stale={stale && form.closure === 'transition'}
			onedit={() => {
				closureStepper.pause();
				form.closureStep = 0;
			}}
		/>
	</Panel>

	<Panel title="Parsing DFA" subtitle="each state a closed set of items">
		{#if build}
			{#if task.status === 'timed-out' || task.status === 'error'}
				<Callout tone="warn">
					<p>
						{task.status === 'timed-out'
							? 'This grammar takes too long to build. Showing the last automaton built.'
							: `The automaton could not be built: ${task.error}`}
					</p>
				</Callout>
			{:else if stale}
				<p class="stale-note" role="status">
					<Icon name="info" size={16} />
					<span
						>{grammar
							? 'Building the automaton…'
							: 'Showing the automaton of the last grammar without errors.'}</span
					>
				</p>
			{/if}
			{#each build.automaton.diagnostics.filter((d) => d.severity === 'error') as d, i (i)}
				<Callout tone="error"><p>{d.message}</p></Callout>
			{/each}
			<div class={{ 'stale-data': stale }} aria-busy={stale}>
				<DfaPanel
					{build}
					{notes}
					bind:method={form.method}
					bind:view={form.view}
					bind:items={form.items}
					{range}
					ranged={form.range !== null}
					onrange={(r) => (form.range = r)}
					{steps}
					stepper={buildStepper}
					selected={shown}
					onselect={select}
					current={buildStepper.atEnd ? parserState : null}
					followed={buildStepper.atEnd ? followed : null}
					marks={buildStepper.atEnd ? itemMarks : undefined}
					onmethod={() => {
						pause();
						form.buildStep = null;
						form.parseStep = null;
						form.range = null;
						selection = null;
					}}
				/>
			</div>
		{:else if task.status === 'timed-out'}
			<Callout tone="warn"><p>This grammar takes too long to build.</p></Callout>
		{:else}
			<p class="empty">The DFA is built once the grammar has no errors.</p>
		{/if}
	</Panel>

	<div class="workspace">
		<Panel title="LR parsing" subtitle="a stack of pairs < sym, state >" class="parse-panel">
			<ParsePanel
				bind:input={form.input}
				diagnostics={inputReading?.diagnostics ?? []}
				parse={build?.parse ?? null}
				{frames}
				stepper={parseStepper}
				{stale}
				conflicts={build?.table.conflicts.length ?? 0}
				oninput={() => {
					parseStepper.pause();
					form.parseStep = null;
				}}
			/>
		</Panel>

		<Panel
			title="Action/goto table"
			subtitle={build ? METHOD_NAMES[build.method] : undefined}
			class="table-panel"
		>
			{#if build}
				<div class={['table-body', { 'stale-data': stale }]} aria-busy={stale}>
					<LrTableView
						table={build.table}
						{range}
						row={build ? selectedRow(build.automaton, shown) : null}
						cell={build ? selectedCell(build.automaton, build.table, shown) : null}
						{lookup}
						current={parserState}
						onrow={(s) => select({ kind: 'state', state: s })}
						caption="Action/goto table, {METHOD_NAMES[build.method]}"
					/>
					{#if range[1] - range[0] + 1 < states}
						<p class="empty">
							Rows {range[0]}–{range[1]} of {states}; the range is set with the DFA.
						</p>
					{/if}
					{#if build.table.conflicts.length > 0}
						<div class="conflicts">
							<h3>
								{build.table.conflicts.length}
								{build.table.conflicts.length === 1 ? 'conflict' : 'conflicts'}
							</h3>
							<ul>
								{#each build.table.conflicts.slice(0, CONFLICT_LIMIT) as c, i (i)}
									{@const aug2 = build.table.augmented}
									<li>
										<span class="where"
											>State {c.state}, on {symbolText(c.terminal)}: {c.kind}.</span
										>
										<span class="mono">{bracketedItem(aug2, c.items[0])}</span>
										and <span class="mono">{bracketedItem(aug2, c.items[1])}</span>; the table keeps
										{actionEntry(aug2, c.resolution.action).words}.
									</li>
								{/each}
							</ul>
							{#if build.table.conflicts.length > CONFLICT_LIMIT}
								<p class="empty">… and {build.table.conflicts.length - CONFLICT_LIMIT} more.</p>
							{/if}
							<p class="empty">
								Without precedence declarations the table keeps the shift of a shift/reduce conflict
								and the earlier rule of a reduce/reduce conflict, as bison does.
								{#if conflictsLink}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
									<a href={conflictsLink.href}>Open in {conflictsLink.title}</a> to resolve them with
									%left and %right.
								{/if}
							</p>
						</div>
					{/if}
				</div>
				{#if stale}<Updating />{/if}
			{:else}
				<p class="empty">The table is built once the grammar has no errors.</p>
			{/if}
		</Panel>
	</div>
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
	h3 {
		margin: 0 0 var(--space-1);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.augmented,
	.order {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.grammar-text {
		max-height: 14rem;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.added {
		color: var(--accept);
		font-weight: 600;
	}
	.hint,
	.open-in,
	.empty {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.empty {
		color: var(--text-3);
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.stale-note :global(.icon) {
		flex: none;
		color: var(--info);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1100px) {
		.workspace {
			grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
		}
	}
	@media (min-width: 1100px) and (min-height: 760px) {
		.workspace :global(.table-panel) {
			position: sticky;
			top: calc(56px + var(--space-4));
		}
	}
	.table-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.conflicts ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		padding-left: var(--space-4);
		font-size: var(--text-sm);
	}
	.conflicts .where {
		color: var(--reject);
		font-weight: 600;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
</style>
