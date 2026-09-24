<!--
@component
"Table-driven" tab: a scanner DFA (built from rules, or taken from the
slides), its table T with accept[] and retract[], and the driver code of
Lexical Analysis IV slide 15 stepped line by line, one getToken () call at a
time.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import AutomatonView from '$lib/components/graph/AutomatonView.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import StepControls from '$lib/components/ui/StepControls.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import TokenPairs from '$lib/components/ui/TokenPairs.svelte';
	import { Stepper } from '$lib/components/ui/stepper.svelte';
	import type { HighlightRange, Tone } from '$lib/components/ui/types';
	import type { StateTone } from '$lib/components/graph/types';
	import { formatAutomatonText } from '$lib/theory/automata';
	import type { Automaton, Positions } from '$lib/theory/automata/types';
	import type { NamedSet } from '$lib/theory/chars';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import CodeListing from './CodeListing.svelte';
	import DriverTable, { type DriverTableHighlight } from './DriverTable.svelte';
	import RulesEditor from './RulesEditor.svelte';
	import SlideQuestions from './SlideQuestions.svelte';
	import { DRIVER_CODE, chText, traceRun, type DriverToken, type Mode } from './driver';
	import { MACHINES, relopDfa, stuDfa, type MachineId } from './machines';
	import type { ScannerPreset } from './presets';
	import { MAX_DFA_STATES, type CompiledRules, type RuleDfaResult } from './rules';
	import { SOURCE_INPUTS, type ScannerDfaState, type SourceId } from './state';
	import { ERROR_STATE, driverTable, stateName } from './table';
	import { SWITCH_INPUTS } from './switch';

	interface Props {
		model: ScannerDfaState;
		compiled: CompiledRules;
		built: RuleDfaResult | null;
		preset: ScannerPreset | null;
	}

	let { model = $bindable(), compiled, built, preset }: Props = $props();

	/** Largest machine drawn as a diagram (the table shows any size). */
	const DIAGRAM_LIMIT = 60;
	const SLIDE_MACHINES: Record<MachineId, Automaton> = { relop: relopDfa(), stu: stuDfa() };

	interface Machine {
		dfa: Automaton;
		names: readonly NamedSet[];
		positions?: Positions;
		startLabel?: string;
	}

	const machine = $derived.by((): Machine | null => {
		if (model.source !== 'rules') {
			const info = MACHINES[model.source];
			return {
				dfa: SLIDE_MACHINES[model.source],
				names: [],
				positions: info.positions,
				startLabel: info.startLabel
			};
		}
		if (!built?.ok) return null;
		return { dfa: model.minimal ? built.minimal : built.full, names: compiled.names };
	});

	const table = $derived(machine ? driverTable(machine.dfa, { names: machine.names }) : null);
	const skip = $derived(
		new Set(
			model.source === 'rules' ? model.rules.filter((r) => r.drop).map((r) => r.name.trim()) : []
		)
	);
	const run = $derived(table ? traceRun(table, model.input, model.mode, { skip }) : null);

	let callIndex = $state(0);
	const stepper = new Stepper(() => call?.steps.length ?? 0, { speed: 2 });
	const call = $derived(
		run && run.calls.length ? run.calls[Math.min(callIndex, run.calls.length - 1)] : null
	);
	const step = $derived(call ? call.steps[stepper.index] : null);
	const code = $derived(DRIVER_CODE[model.mode]);

	// A new run (other machine, input or mode) starts again at the first call.
	$effect.pre(() => {
		void run;
		untrack(() => {
			callIndex = 0;
			stepper.pause();
			stepper.first();
		});
	});

	const finished = $derived(!!step?.result);
	const hasNext = $derived(!!run && callIndex < run.calls.length - 1);

	function nextToken() {
		if (!hasNext) return;
		callIndex++;
		stepper.pause();
		stepper.first();
	}

	function restart() {
		callIndex = 0;
		stepper.pause();
		stepper.first();
	}

	/** Tokens returned so far: earlier calls, plus this one once it has returned. */
	const tokens = $derived.by((): DriverToken[] => {
		if (!run || !call) return [];
		const done = run.calls.slice(0, callIndex).map((c) => c.token);
		return finished ? [...done, call.token] : done;
	});

	const toneOf = (t: DriverToken): Tone => (t.error ? 'reject' : t.skipped ? 'muted' : t.rule);

	/** Furthest input position read so far in this call. */
	const reach = $derived.by(() => {
		if (!call) return 0;
		let max = call.start;
		for (let i = 0; i <= stepper.index && i < call.steps.length; i++)
			max = Math.max(max, call.steps[i].pos);
		return max;
	});

	const streamHighlights = $derived.by((): HighlightRange[] => {
		const out: HighlightRange[] = tokens.map((t) => ({
			start: t.start,
			end: t.end,
			tone: toneOf(t),
			label: t.name
		}));
		if (call && step && !finished) {
			if (step.pos > call.start) out.push({ start: call.start, end: step.pos, tone: 'active' });
			const last = step.lastAccept;
			if (last && last.pos > call.start)
				out.push({ start: call.start, end: last.pos, tone: 'accept' });
		}
		return out;
	});

	const lookahead = $derived(step && reach > step.pos ? { start: step.pos, end: reach } : null);

	const graphHighlight = $derived.by(() => {
		if (!step) return undefined;
		const tone: Record<number, StateTone> = {};
		const last = step.lastAccept;
		if (last && last.state !== step.state) tone[last.state] = 'info';
		if (step.result && step.result.state !== null) tone[step.result.state] = 'accept';
		return {
			active: step.state === ERROR_STATE ? [] : [step.state],
			taken: step.lookup?.transition != null ? [step.lookup.transition] : [],
			tone
		};
	});

	const tableHighlight = $derived.by((): DriverTableHighlight => {
		if (!step) return {};
		const s = step.state;
		const h: DriverTableHighlight = {};
		if (step.lookup) {
			h.row = step.lookup.from;
			h.cell = { state: step.lookup.from, column: step.lookup.column };
		} else if (s !== ERROR_STATE) h.row = s;
		if (step.reads === 'accept' && s !== ERROR_STATE) h.accept = s;
		if (step.reads === 'retract' && s !== ERROR_STATE) h.retract = s;
		if (step.result && step.result.state !== null) h.result = step.result.state;
		return h;
	});

	const MODE_TEXT: Record<Mode, string> = {
		first: 'Stop at the first accepting state (slide 15, as printed).',
		longest: 'Remember the last accepting state, then back up to it.'
	};

	const SOURCE_OPTIONS: { value: SourceId; label: string; title: string }[] = [
		{ value: 'rules', label: 'Rules', title: 'Build the DFA from token rules' },
		{ value: 'relop', label: 'relop', title: 'The relop DFA of slide 16' },
		{ value: 'stu', label: 'S, T, U', title: 'The DFA of slide 14' }
	];

	function setSource(next: SourceId) {
		if (next === model.source) return;
		model.inputs = { ...model.inputs, [model.source]: model.input };
		model.input = model.inputs[next] ?? SOURCE_INPUTS[next];
		model.source = next;
	}

	const links = $derived.by(() => {
		const out: { label: string; href: string }[] = [];
		const add = (label: string, href: string | null) => {
			if (href) out.push({ label, href });
		};
		if (model.source === 'rules' && compiled.rules) {
			add(
				'Scan with the lexer',
				toolLink('lexer', { defs: model.defs, rules: model.rules, input: model.input })
			);
			if (model.rules.length === 1)
				add(
					"Thompson's construction",
					toolLink('thompson', { re: model.rules[0].re, defs: model.defs })
				);
		}
		const dfa = machine?.dfa;
		if (dfa && (toolBySlug('minimize') || toolBySlug('automata'))) {
			const text = formatAutomatonText(dfa);
			add('Minimize this DFA', toolLink('minimize', { from: 'dfa', text }));
			add('Run in the automaton simulator', toolLink('automata', { text, input: model.input }));
		}
		return out;
	});

	const variables = $derived.by(() => {
		if (!step || !table) return [];
		const out: { name: string; value: string }[] = [
			{ name: 'state', value: stateName(table, step.state) },
			{ name: 'ch', value: chText(step.ch) },
			{ name: 'position', value: String(step.pos) }
		];
		if (model.mode === 'longest') {
			const last = step.lastAccept;
			out.push({
				name: 'lastAccept',
				value: last ? `(${stateName(table, last.state)}, ${last.pos})` : 'none'
			});
		}
		return out;
	});
</script>

<div class="tab">
	<Panel title="Scanner">
		{#snippet actions()}
			<SegmentedControl
				label="DFA from"
				showLabel
				size="sm"
				options={SOURCE_OPTIONS}
				value={model.source}
				onchange={setSource}
			/>
		{/snippet}
		<div class="source">
			{#if model.source === 'rules'}
				<RulesEditor bind:defs={model.defs} bind:rules={model.rules} {compiled} />
				<div class="options">
					<Toggle
						bind:checked={model.minimal}
						label="Minimal DFA"
						description="Merge equivalent states; accepting states with different tokens stay apart."
					/>
				</div>
				{#if built && !built.ok}
					<Callout tone="warn" title="This DFA is too large to show">
						{#if built.reason === 'dfa'}
							The subset construction makes more than {MAX_DFA_STATES} states. Simplify the rules.
						{:else}
							The combined NFA has {built.count} states. Simplify the rules.
						{/if}
					</Callout>
				{:else if !compiled.rules}
					<Callout tone="info">Fix the rules marked above to build the DFA.</Callout>
				{/if}
			{:else}
				<p class="machine-note">
					{#if model.source === 'relop'}
						relop: <span class="mono">&lt; | &lt;= | &lt;&gt; | &gt; | &gt;= | =</span>. States 4
						and 8 (marked *) retract: the character that led there is not part of the lexeme.
						<CitationTag cite={{ deck: '08', slide: 16 }} />
					{:else}
						The DFA with states S, T, U; U accepts and names no token, so tokenFor (U) is U.
						<CitationTag cite={{ deck: '08', slide: 14 }} />
					{/if}
				</p>
			{/if}

			<div class="input-row">
				<div class="input-field">
					<TextField
						bind:value={model.input}
						label="Input"
						mono
						maxlength={2000}
						spellcheck="false"
						placeholder="Characters to scan"
					/>
				</div>
				{#if model.source === 'relop'}
					<div class="examples" role="group" aria-label="Example inputs">
						{#each SWITCH_INPUTS as ex (ex)}
							<button
								type="button"
								class={['chip', { on: model.input === ex }]}
								aria-pressed={model.input === ex}
								onclick={() => (model.input = ex)}>{ex}</button
							>
						{/each}
					</div>
				{/if}
			</div>

			{#if preset?.questions?.length}
				<SlideQuestions questions={preset.questions} />
			{/if}

			{#if links.length}
				<nav class="links" aria-label="Open in another tool">
					{#each links as link (link.label)}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink builds the path with toolHref -->
						<a href={link.href}>{link.label}<Icon name="arrow-right" size={14} /></a>
					{/each}
				</nav>
			{/if}
		</div>
	</Panel>

	{#if table && run}
		<div class="run-grid">
			<div class="left">
				<Panel
					title="getToken ()"
					subtitle={call
						? `call ${callIndex + 1} of ${run.calls.length} · from position ${call.start}`
						: ''}
				>
					<div class="driver">
						<div class="mode">
							<SegmentedControl
								label="Driver"
								size="sm"
								options={[
									{ value: 'first', label: 'As on the slide', title: MODE_TEXT.first },
									{ value: 'longest', label: 'Longest match', title: MODE_TEXT.longest }
								]}
								bind:value={model.mode}
							/>
							<p class="mode-text">{MODE_TEXT[model.mode]}</p>
						</div>
						<CodeListing
							lines={code.map((text) => ({ text }))}
							current={step ? step.line - 1 : null}
							label={model.mode === 'first'
								? 'Table-driven driver, slide 15'
								: 'Longest-match driver'}
						/>
						{#if call}
							<StepControls {stepper} noun="Step" ariaLabel="Step through getToken ()">
								{#snippet label(i)}{call.steps[i]?.text}{/snippet}
							</StepControls>
						{:else}
							<p class="empty">Type an input to call getToken ().</p>
						{/if}
						<div class="calls">
							<Button
								variant={finished && hasNext ? 'primary' : 'secondary'}
								size="sm"
								disabled={!hasNext}
								onclick={nextToken}
							>
								{#snippet icon()}<Icon name="step-forward" size={16} />{/snippet}
								Next token
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={callIndex === 0 && stepper.atStart}
								onclick={restart}
							>
								{#snippet icon()}<Icon name="reset" size={16} />{/snippet}
								Start over
							</Button>
							<span class="call-status" aria-live="polite">
								{#if finished && !hasNext}
									{#if run.stalled}
										getToken () returned without reading input; calling it again would repeat this
										call.
									{:else if run.truncated}
										The trace stops here: the input is too long to trace in full.
									{:else}
										End of input.
									{/if}
								{/if}
							</span>
						</div>
					</div>
				</Panel>
			</div>

			<div class="right">
				<Panel title="Input and tokens">
					<div class="io">
						<CharStream
							text={model.input}
							cursor={step?.pos ?? 0}
							highlights={streamHighlights}
							{lookahead}
							indices
							showEnd
							size="lg"
						/>
						{#if variables.length}
							<dl class="vars">
								{#each variables as v (v.name)}
									<div>
										<dt>{v.name}</dt>
										<dd>{v.value}</dd>
									</div>
								{/each}
							</dl>
						{/if}
						<div class="tokens">
							<span class="tokens-label">Tokens</span>
							<TokenPairs {tokens} showSkipped empty="None yet" ariaLabel="Tokens" />
						</div>
					</div>
				</Panel>

				<Panel title="DFA" padding="none">
					{#if table.dfa.states.length <= DIAGRAM_LIMIT && machine}
						<AutomatonView
							automaton={machine.dfa}
							positions={machine.positions}
							names={machine.names}
							startLabel={machine.startLabel}
							highlight={graphHighlight}
							height={model.source === 'relop' ? 380 : 320}
							ariaLabel="Scanner DFA"
						/>
					{:else}
						<p class="empty pad">
							The DFA has {table.dfa.states.length} states; the table below lists them all.
						</p>
					{/if}
				</Panel>

				<Panel title="Table T" subtitle="{table.dfa.states.length} × {table.columns.length}">
					<div class="table-wrap">
						<DriverTable {table} highlight={tableHighlight} />
						<p class="legend">
							Rows are states, columns are symbol classes. — in T: no transition, so T gives the
							error state.
							{#if table.eofColumn !== null}
								<em>other</em>: every other character; getChar () at the end of the input returns
								EOF, which is looked up there too.
							{/if}
							→ start, ◎ accepting.
						</p>
					</div>
				</Panel>
			</div>
		</div>
	{/if}
</div>

<style>
	.tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.source {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.machine-note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.machine-note :global(.cite) {
		margin-left: var(--space-1);
		vertical-align: middle;
	}
	.input-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-4);
	}
	.input-field {
		flex: 1 1 16rem;
		max-width: 28rem;
		min-width: 0;
	}
	.examples {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-bottom: 3px;
	}
	.chip {
		min-width: 2.6rem;
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.chip:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--text);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
	}
	.links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		text-decoration: none;
	}
	.links a:hover {
		text-decoration: underline;
	}

	.run-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	.left,
	.right {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.run-grid {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		}
	}
	@media (min-width: 1024px) and (min-height: 760px) {
		.left {
			position: sticky;
			top: calc(56px + var(--space-4));
		}
	}
	.driver {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.mode {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.mode-text {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.calls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}
	.call-status {
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.pad {
		padding: var(--space-4);
	}
	.io {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.vars {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0;
		font-size: var(--text-sm);
	}
	.vars div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.vars dt {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.vars dd {
		margin: 0;
		font-family: var(--font-mono);
		font-weight: 600;
		font-variant-ligatures: none;
	}
	.tokens {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.tokens-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.table-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.legend {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
</style>
