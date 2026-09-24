<script lang="ts">
	import { untrack } from 'svelte';
	import { AutomatonView, TransitionTable } from '$lib/components/graph';
	import {
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
		Toggle,
		ToolPage
	} from '$lib/components/ui';
	import { formatAutomatonText, minimize, stateNamed, type StateId } from '$lib/theory/automata';
	import type { CharSet } from '$lib/theory/charset';
	import { formatLabel } from '$lib/theory/chars';
	import { tool } from '$lib/tools/catalog/minimize';
	import { toolLink } from '$lib/tools/links';
	import BlockChip from '$lib/tools/minimize/BlockChip.svelte';
	import { buildInput, MAX_DRAWN_STATES } from '$lib/tools/minimize/build';
	import PairCheck from '$lib/tools/minimize/PairCheck.svelte';
	import PartitionLine from '$lib/tools/minimize/PartitionLine.svelte';
	import { DEFAULT_PRESET, presets, type MinimizePreset } from '$lib/tools/minimize/presets';
	import { refinementView, roundSummary, setText } from '$lib/tools/minimize/refinement';
	import SignatureTable from '$lib/tools/minimize/SignatureTable.svelte';
	import SplitList from '$lib/tools/minimize/SplitList.svelte';
	import {
		fromSaved,
		inputKey,
		isSavedState,
		type MinimizeState,
		type Source
	} from '$lib/tools/minimize/state';
	import { syncToHash } from '$lib/url-state';

	let model = $state<MinimizeState>(fromSaved(DEFAULT_PRESET.value));
	let defsOpen = $state(model.defs.trim() !== '');

	// ------------------------------------------------------------------
	// The machine and its refinement
	// ------------------------------------------------------------------

	const built = $derived(buildInput(model));
	const result = $derived(built.dfa ? minimize(built.dfa, { splitByToken: model.byToken }) : null);
	const view = $derived(result ? refinementView(result) : null);

	const stepper = new Stepper(() => view?.rounds.length ?? 0, { index: model.round });
	const round = $derived(view ? view.rounds[stepper.index] : null);

	// The current step is part of the shared link.
	$effect(() => {
		const i = stepper.index;
		untrack(() => {
			if (model.round !== i) model.round = i;
		});
	});

	const empty = $derived(
		model.from === 're'
			? model.re.trim() === ''
			: model.from === 'rules'
				? model.rules.trim() === ''
				: model.text.trim() === ''
	);

	const nameOf = (s: StateId): string => {
		const st = view?.input.states[s];
		return st ? st.name || `#${s}` : '?';
	};
	const classText = (c: CharSet) => formatLabel(c);

	const drawn = $derived(view !== null && view.input.states.length <= MAX_DRAWN_STATES);
	const groups = $derived(
		round
			? round.partition.blocks.map((b) => ({
					id: `block-${b.id}`,
					label: String(b.id),
					states: b.states,
					tone: b.tone
				}))
			: []
	);

	// ------------------------------------------------------------------
	// Pair check
	// ------------------------------------------------------------------

	const pair = $derived.by(() => {
		if (!view) return null;
		const last = view.input.states.length - 1;
		const find = (name: string, fallback: number) =>
			(name ? stateNamed(view.input, name) : undefined) ?? Math.min(fallback, last);
		return { p: find(model.p, 0), q: find(model.q, 1) };
	});

	function choosePair(p: StateId, q: StateId) {
		if (!view) return;
		model.p = view.input.states[p]?.name ?? '';
		model.q = view.input.states[q]?.name ?? '';
	}

	function mergedInto(block: number): string | null {
		if (!view || !result) return null;
		const i = view.resultBlocks.findIndex((b) => b.id === block);
		return i >= 0 ? result.dfa.states[i].name : null;
	}

	// ------------------------------------------------------------------
	// Result
	// ------------------------------------------------------------------

	const mapping = $derived(
		result && view && built.dfa
			? result.dfa.states.map((s, i) => ({
					state: s,
					block: view.resultBlocks[i],
					members: (s.merged ?? []).map((id) => built.dfa!.states[id].name || `#${id}`)
				}))
			: []
	);
	// Every state of the given DFA is reachable and none merges with another.
	const alreadyMinimal = $derived(
		result !== null &&
			built.dfa !== null &&
			result.removed.length === 0 &&
			result.dfa.states.every((s) => (s.merged ?? []).length === 1)
	);
	const trapKept = $derived(result !== null && result.dfa.states.some((s) => s.trap));
	const removedNames = $derived(
		result && built.dfa ? result.removed.map((id) => built.dfa!.states[id].name || `#${id}`) : []
	);
	const automataLink = $derived(
		result ? toolLink('automata', { text: formatAutomatonText(result.dfa) }) : null
	);
	const subsetLink = $derived(
		built.problem?.kind === 'nfa' ? toolLink('subset', { from: 'nfa', text: model.text }) : null
	);

	// ------------------------------------------------------------------
	// Presets, sources, and the URL
	// ------------------------------------------------------------------

	const presetKeys = presets.map((p) => ({ preset: p, key: inputKey(fromSaved(p.value)) }));
	const activePreset = $derived(presetKeys.find((p) => p.key === inputKey(model))?.preset ?? null);

	function load(value: MinimizeState) {
		stepper.pause();
		Object.assign(model, value);
		defsOpen = value.defs.trim() !== '';
		stepper.set(value.round);
	}

	function choosePreset(preset: MinimizePreset) {
		load(fromSaved(preset.value));
	}

	syncToHash(() => model, {
		validate: isSavedState,
		onLoad: (value) => load(fromSaved(value))
	});

	const sources: { value: Source; label: string; title: string }[] = [
		{ value: 're', label: 'RE', title: 'A regular expression in lecture notation' },
		{ value: 'rules', label: 'Token rules', title: 'Token rules for a scanner' },
		{ value: 'dfa', label: 'DFA', title: 'A DFA in the automaton text format' }
	];

	function setSource(from: Source) {
		// Switching to text keeps the current machine, written out.
		if (from === 'dfa' && model.text.trim() === '' && built.dfa)
			model.text = formatAutomatonText(built.dfa);
		if (from !== 'dfa') defsOpen = defsOpen || model.defs.trim() !== '';
		model.from = from;
	}

	const DEFS_PLACEHOLDER = "digit = '0' | … | '9'";
	const DFA_PLACEHOLDER = 'start: A\naccept: B\nA 0 B';

	/** Splits answer text on `backticks` into plain and formal parts. */
	const answerParts = (text: string) =>
		text.split('`').map((t, i) => ({ text: t, formal: i % 2 === 1 }));
</script>

{#snippet presetMenu()}
	<PresetMenu
		{presets}
		selected={activePreset?.id ?? null}
		onselect={(p) => choosePreset(p as MinimizePreset)}
		align="end"
	/>
{/snippet}

{#snippet caption(i: number)}
	{#if view}{roundSummary(view, i)}{/if}
{/snippet}

<ToolPage {tool} actions={presetMenu}>
	<div class="layout">
		<!-- Input -->
		<Panel title="Input" class="area-source">
			<div class="stack">
				<SegmentedControl
					label="Build the DFA from"
					showLabel
					options={sources}
					value={model.from}
					onchange={setSource}
				/>

				{#if model.from === 're'}
					<RegexField
						label="R ="
						bind:value={model.re}
						diagnostics={empty ? [] : built.diagnostics.re}
						placeholder="(1 | 0)*1"
					/>
					<p class="hint">
						Thompson’s construction, then the subset construction. The DFA is not minimized first.
					</p>
					<Disclosure
						bind:open={defsOpen}
						summary={model.defs.trim() ? 'Regular definitions' : 'Add regular definitions'}
						openSummary="Regular definitions"
					>
						<CodeEditor
							ariaLabel="Regular definitions"
							bind:value={model.defs}
							diagnostics={built.diagnostics.defs}
							minRows={2}
							maxRows={8}
							placeholder={DEFS_PLACEHOLDER}
						/>
					</Disclosure>
				{:else if model.from === 'rules'}
					<CodeEditor
						label="Regular definitions"
						bind:value={model.defs}
						diagnostics={built.diagnostics.defs}
						minRows={2}
						maxRows={8}
						placeholder={DEFS_PLACEHOLDER}
					/>
					<CodeEditor
						label="Token rules"
						bind:value={model.rules}
						diagnostics={empty ? [] : built.diagnostics.rules}
						minRows={3}
						maxRows={10}
						placeholder="Integer = digit+"
					/>
					<p class="hint">
						One rule per line, <span class="f">Name = RE</span>, earliest first. An accepting state
						of the scanner DFA reports the token of the earliest rule it matches.
					</p>
				{:else}
					<CodeEditor
						label="DFA"
						bind:value={model.text}
						diagnostics={empty ? [] : built.diagnostics.text}
						minRows={6}
						maxRows={16}
						placeholder={DFA_PLACEHOLDER}
					/>
					<p class="hint">
						<span class="f">start: A</span>, <span class="f">accept: B C</span>, then one transition
						per line, such as <span class="f">A 0,1 B</span>. Missing transitions go to a trap
						state.
					</p>
				{/if}

				{#if built.problem?.kind === 'nfa'}
					<Callout tone="warn" title="This automaton is an NFA">
						<p>
							It has {built.problem.reasons.join(' and ')}. Minimization works on DFAs; the subset
							construction turns an NFA into one.
						</p>
						{#if subsetLink}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
							<a class="action" href={subsetLink}
								>Open in Subset Construction <Icon name="arrow-right" size={15} /></a
							>
						{/if}
					</Callout>
				{:else if built.problem?.kind === 'too-big'}
					<Callout tone="warn" title="Too large for this page">
						<p>
							{built.problem.what === 'nfa'
								? `Thompson’s NFA for this input would have more than ${built.problem.limit.toLocaleString('en-US')} states; this page builds NFAs of up to that size.`
								: `The DFA has more than ${built.problem.limit} states; this page works with DFAs of up to that size.`}
						</p>
					</Callout>
				{/if}

				{#if view?.hasTokens}
					<Toggle
						bind:checked={model.byToken}
						label="Keep tokens apart"
						description="Round 0 puts accepting states that report different tokens in different blocks."
					/>
				{/if}

				{#if activePreset}
					<section class="about" aria-label="About this example">
						<p class="about-text">{activePreset.description}</p>
						{#if activePreset.cite}<CitationTag cite={activePreset.cite} />{/if}
						{#if activePreset.question}
							{@const q = activePreset.question}
							<div class="question">
								<p class="prompt">
									<span class="prompt-label">From the slides</span>
									<span class="prompt-text">“{q.prompt}”</span>
								</p>
								{#if q.cite}<CitationTag cite={q.cite} />{/if}
								<Disclosure summary="Show answer" openSummary="Hide answer">
									<p class="answer">
										{#each answerParts(q.answer) as part, i (i)}{#if part.formal}<span class="f"
													>{part.text}</span
												>{:else}{part.text}{/if}{/each}
									</p>
								</Disclosure>
							</div>
						{/if}
					</section>
				{/if}
			</div>
		</Panel>

		<!-- Refinement -->
		<Panel
			title="Partition refinement"
			subtitle={view
				? `${view.input.states.length} states${result?.trap !== null ? ', including the trap' : ''}`
				: undefined}
			class="area-refine"
		>
			{#if view && round}
				<div class="stack">
					<StepControls {stepper} noun="Step" ariaLabel="Refinement rounds" label={caption} />

					{#if drawn}
						<figure class="figure">
							<AutomatonView
								automaton={view.input}
								{groups}
								height="auto"
								ariaLabel="The DFA being partitioned, with the blocks of round {round.index} outlined"
							/>
							<figcaption>
								<PartitionLine partition={round.partition} round={round.index} name={nameOf} />
								{#if result?.trap !== null}
									<span class="legend"
										><span class="dash" aria-hidden="true"></span> Dashed: the trap state added for missing
										transitions.</span
									>
								{/if}
							</figcaption>
						</figure>
					{:else}
						<Callout tone="info">
							<p>
								The diagram is drawn for machines of up to {MAX_DRAWN_STATES} states; this one has
								{view.input.states.length}. The table lists every state.
							</p>
						</Callout>
						<PartitionLine partition={round.partition} round={round.index} name={nameOf} />
					{/if}

					<section class="round" aria-labelledby="round-title">
						<h3 id="round-title">
							Round {round.index}
							<span class="round-sub"
								>{round.index === 0
									? 'initial partition'
									: round.splits.length === 0
										? 'no splits'
										: `${round.splits.length} ${round.splits.length === 1 ? 'block splits' : 'blocks split'}`}</span
							>
						</h3>
						<p class="table-note">
							{#if round.index === 0}
								Accepting and non-accepting states start in different blocks{view.hasTokens &&
								model.byToken
									? ', and accepting states are grouped by token'
									: ''}.
							{:else}
								Each cell is the block of P<sub>{round.index - 1}</sub> that T(s, a) lies in, followed
								by T(s, a). States of one block whose rows differ go to different blocks.
							{/if}
						</p>
						<SignatureTable {view} {round} name={nameOf} {classText} />
						<SplitList {view} {round} name={nameOf} {classText} byToken={model.byToken} />
					</section>
				</div>
			{:else}
				<p class="placeholder">
					{#if empty}
						Enter {model.from === 're'
							? 'a regular expression'
							: model.from === 'rules'
								? 'token rules'
								: 'a DFA'}, or pick a preset.
					{:else if built.problem?.kind === 'nfa'}
						The refinement needs a DFA.
					{:else if built.problem?.kind === 'too-big'}
						The machine is too large for this page.
					{:else}
						The refinement appears once the input has no errors.
					{/if}
				</p>
			{/if}
		</Panel>

		<!-- Pair check -->
		<Panel title="Tell two states apart" class="area-pair">
			{#if view && pair}
				<PairCheck
					{view}
					p={pair.p}
					q={pair.q}
					byToken={model.byToken}
					name={nameOf}
					{mergedInto}
					onchange={choosePair}
				/>
			{:else}
				<p class="placeholder">Pick two states once the input describes a DFA.</p>
			{/if}
		</Panel>

		<!-- Result -->
		{#if result && view && built.dfa}
			<Panel title="Minimal DFA" class="area-result">
				<div class="result">
					<div class="result-figure">
						{#if result.dfa.states.length <= MAX_DRAWN_STATES}
							<AutomatonView
								automaton={result.dfa}
								height="auto"
								ariaLabel="The minimal DFA, one state per block of the final partition"
							/>
						{:else}
							<Callout tone="info">
								<p>The diagram is drawn for machines of up to {MAX_DRAWN_STATES} states.</p>
							</Callout>
						{/if}
					</div>

					<div class="result-side">
						<div class="counts" role="group" aria-label="State counts">
							<div class="count">
								<span class="num">{built.dfa.states.length}</span>
								<span class="count-label"
									>{built.dfa.states.length === 1 ? 'state' : 'states'} in the DFA</span
								>
							</div>
							<span class="count-arrow" aria-hidden="true">→</span>
							<div class="count">
								<span class="num">{result.dfa.states.length}</span>
								<span class="count-label">in the minimal DFA</span>
							</div>
						</div>
						{#if alreadyMinimal}
							<p class="verdict">
								<Icon name="check" size={16} /> Already minimal: no two states are equivalent.
							</p>
						{/if}

						<div class="table-scroll">
							<table class="mapping">
								<caption class="visually-hidden"
									>Each state of the minimal DFA and the states it merges</caption
								>
								<thead>
									<tr>
										<th scope="col">Block</th>
										<th scope="col">State</th>
										<th scope="col">Merges</th>
										{#if view.hasTokens}<th scope="col">Token</th>{/if}
									</tr>
								</thead>
								<tbody>
									{#each mapping as row (row.state.id)}
										<tr class:merged={row.members.length > 1}>
											<td><BlockChip id={row.block.id} tone={row.block.tone} /></td>
											<th scope="row">
												<span class="marks" aria-hidden="true"
													><span class="mark">{row.state.id === result.dfa.start ? '→' : ''}</span
													><span class="mark"
														>{#if row.state.accepting}<svg viewBox="0 0 12 12"
																><circle cx="6" cy="6" r="5.1" /><circle
																	cx="6"
																	cy="6"
																	r="2.9"
																/></svg
															>{/if}</span
													></span
												>
												<span class="f">{row.state.name}</span>
												{#if row.state.id === result.dfa.start}<span class="visually-hidden"
														>, start</span
													>{/if}
												{#if row.state.accepting}<span class="visually-hidden">, accepting</span
													>{/if}
											</th>
											<td class="members">
												<span class="larr" aria-hidden="true">←</span><span class="f set"
													>{setText(row.members)}</span
												>
											</td>
											{#if view.hasTokens}<td class="f token">{row.state.accept?.token ?? '—'}</td
												>{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						{#if result.trap !== null || removedNames.length > 0}
							<ul class="notes">
								{#if result.trap !== null}
									<li>
										{#if trapKept}
											The trap state added for missing transitions merges with a state that already
											rejects everything, and that state is kept.
										{:else}
											The trap state added for missing transitions is dropped again: missing
											transitions of the minimal DFA mean the trap.
										{/if}
									</li>
								{/if}
								{#if removedNames.length > 0}
									<li>
										Unreachable, dropped before partitioning: <span class="f"
											>{removedNames.join(', ')}</span
										>.
									</li>
								{/if}
							</ul>
						{/if}

						<Disclosure summary="Transition table" variant="boxed">
							<TransitionTable
								automaton={result.dfa}
								compact
								caption="Transition table of the minimal DFA"
							/>
						</Disclosure>

						{#if automataLink}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
							<a class="action" href={automataLink}
								>Open in Finite Automata <Icon name="arrow-right" size={15} /></a
							>
						{/if}
					</div>
				</div>
			</Panel>
		{/if}
	</div>
</ToolPage>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 1080px) {
		.layout {
			grid-template-columns: minmax(320px, 400px) minmax(0, 1fr);
			grid-template-rows: auto 1fr auto;
			grid-template-areas:
				'source refine'
				'pair refine'
				'result result';
			align-items: start;
		}
		.layout > :global(.area-source) {
			grid-area: source;
		}
		.layout > :global(.area-refine) {
			grid-area: refine;
		}
		.layout > :global(.area-pair) {
			grid-area: pair;
		}
		.layout > :global(.area-result) {
			grid-area: result;
		}
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.hint {
		margin: calc(-1 * var(--space-2)) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		overflow-wrap: break-word;
	}
	.placeholder {
		margin: 0;
		padding: var(--space-5) var(--space-3);
		color: var(--text-3);
		font-size: var(--text-sm);
		text-align: center;
	}
	.action {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}
	.action:hover {
		text-decoration: underline;
	}

	/* About the loaded preset. */
	.about {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.about-text {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.question {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		width: 100%;
		margin-top: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius) var(--radius) 0;
		background: var(--surface-2);
	}
	.prompt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
	}
	.prompt-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.prompt-text {
		font-family: var(--font-serif);
		font-size: var(--text-lg);
		line-height: 1.35;
	}
	.answer {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
	}

	/* Refinement. */
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		min-width: 0;
	}
	figcaption {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.dash {
		display: inline-block;
		width: 22px;
		border-top: 1.5px dashed var(--dead);
	}
	.round {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.round h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-lg);
	}
	.round-sub {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 400;
	}
	.table-note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	/* Result. */
	.result {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 900px) {
		.result {
			grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.result-figure {
		min-width: 0;
	}
	.result-side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
	}
	.count {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.num {
		font-family: var(--font-serif);
		font-size: var(--text-3xl);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.count-label {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.count-arrow {
		color: var(--text-3);
		font-size: var(--text-xl);
	}
	.table-scroll {
		/* Contains the visually hidden text in cells, so it scrolls with the table. */
		position: relative;
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.mapping {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.mapping th,
	.mapping td {
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: middle;
	}
	.mapping thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.mapping tbody tr:last-child > * {
		border-bottom: 0;
	}
	.mapping tbody th {
		font-weight: 500;
		white-space: nowrap;
	}
	.marks {
		display: inline-flex;
		margin-right: 4px;
		color: var(--accent);
	}
	.mark {
		display: inline-grid;
		place-items: center;
		width: 1.1em;
		height: 1.1em;
	}
	.mark svg {
		width: 0.85em;
		height: 0.85em;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
	}
	.mapping .token {
		white-space: nowrap;
	}
	.members {
		min-width: 9rem;
		color: var(--text-2);
	}
	.larr {
		margin-right: 6px;
		color: var(--text-3);
	}
	tr.merged .members {
		color: var(--text);
	}
	.verdict {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--accept);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.notes {
		margin: 0;
		padding-left: 1.2em;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
</style>
