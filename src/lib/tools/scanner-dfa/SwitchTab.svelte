<!--
@component
"Hand-coded switch" tab: getToken () of Lexical Analysis IV slides 17–19,
stepped statement by statement with C semantics, beside the relop DFA of
slide 16.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import AutomatonView from '$lib/components/graph/AutomatonView.svelte';
	import type { StateTone } from '$lib/components/graph/types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import StepControls from '$lib/components/ui/StepControls.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { Stepper } from '$lib/components/ui/stepper.svelte';
	import { showChar } from '$lib/theory/chars';
	import CodeListing from './CodeListing.svelte';
	import { RELOP_POSITIONS, RELOP_TOKENS, relopDfa } from './machines';
	import type { ScannerDfaState } from './state';
	import {
		PUSHBACK_WARNING,
		SWITCH_INPUTS,
		programLines,
		pushbackText,
		runGetToken,
		type CChar
	} from './switch';

	interface Props {
		model: ScannerDfaState;
	}

	let { model = $bindable() }: Props = $props();

	const RELOP = relopDfa();
	const lines = $derived(programLines(model.breaks));
	const trace = $derived(runGetToken(model.switchInput, model.breaks));
	const stepper = new Stepper(() => trace.steps.length, { speed: 2 });
	const step = $derived(trace.steps[stepper.index]);
	const current = $derived(step ? lines.findIndex((l) => l.id === step.line) : null);

	$effect.pre(() => {
		void trace;
		untrack(() => {
			stepper.pause();
			stepper.first();
		});
	});

	const RESULTS = SWITCH_INPUTS.map((input) => ({
		input,
		printed: runGetToken(input, false),
		breaks: runGetToken(input, true)
	}));

	const chValue = (ch: CChar | undefined) =>
		ch === undefined ? '—' : ch === null ? 'EOF' : `'${showChar(ch, 'quoted')}'`;

	const stateValue = $derived(
		step?.state === null || step?.state === undefined
			? '—'
			: step.state === 9
				? '9 (ERROR_STATE)'
				: String(step.state)
	);

	/** The relop state a token comes from. */
	const TOKEN_STATE: Record<string, number> = { LE: 2, NE: 3, LT: 4, EQ: 5, GE: 7, GT: 8 };

	const graphHighlight = $derived.by(() => {
		const s = step?.state;
		const tone: Record<number, StateTone> = {};
		if (step?.returned && TOKEN_STATE[step.returned] !== undefined)
			tone[TOKEN_STATE[step.returned]] = 'accept';
		return { active: s !== null && s !== undefined && s >= 0 && s <= 8 ? [s] : [], tone };
	});

	const inputOptions = SWITCH_INPUTS.map((i) => ({ value: i, label: i }));
	const tokenRule = (t: string) => RELOP_TOKENS.indexOf(t as (typeof RELOP_TOKENS)[number]);
</script>

<div class="tab">
	<Panel title="getToken () with switch">
		<div class="controls">
			<SegmentedControl
				label="Input"
				showLabel
				mono
				options={inputOptions}
				bind:value={model.switchInput}
			/>
			<Toggle bind:checked={model.breaks} label="Add break; after each case" />
		</div>
		<p class="note">
			The code runs with C semantics: <span class="mono">switch</span> jumps to the matching
			<span class="mono">case</span> and execution continues through the cases after it until a
			<span class="mono">break;</span> or the end of the switch.
			<span class="mono">getchar ()</span> returns pushed-back characters first.
			<CitationTag cite={{ deck: '08', slide: [17, 19] }} />
		</p>
	</Panel>

	<div class="run-grid">
		<div class="left">
			<Panel
				title="getToken ()"
				subtitle={model.breaks ? 'with break; after each case' : 'as printed'}
			>
				<div class="code">
					<CodeListing
						{lines}
						{current}
						label="getToken () from slides 17–19"
						maxHeight="min(58vh, 34rem)"
					/>
					<StepControls {stepper} noun="Step" ariaLabel="Step through getToken ()">
						{#snippet label(i)}{trace.steps[i]?.text}{/snippet}
					</StepControls>
				</div>
			</Panel>
		</div>

		<div class="right">
			<Panel title="Variables">
				<div class="vars">
					<dl>
						<div>
							<dt>state</dt>
							<dd>{stateValue}</dd>
						</div>
						<div>
							<dt>ch</dt>
							<dd>{chValue(step?.ch)}</dd>
						</div>
						<div>
							<dt>returns</dt>
							<dd>
								{#if step?.returned}
									<Badge
										tone={step.returned === 'error ()' ? 'reject' : tokenRule(step.returned)}
										mono>{step.returned}</Badge
									>
								{:else}—{/if}
							</dd>
						</div>
					</dl>
					<div class="stream">
						<span class="small-label">Input (read position)</span>
						<CharStream
							text={model.switchInput}
							cursor={step?.pos ?? 0}
							highlights={step && step.pos > 0 ? [{ start: 0, end: step.pos, tone: 'active' }] : []}
							indices
							showEnd
							size="lg"
						/>
					</div>
					<div class="pushback">
						<span class="small-label">ungetc pushback</span>
						{#if step && step.pushback.length}
							<ol class="stack" aria-label="Pushback, oldest first">
								{#each step.pushback as c, i (i)}
									<li class={{ top: i === step.pushback.length - 1 }}>
										<span class="mono">'{showChar(c, 'quoted')}'</span>
										{#if i === step.pushback.length - 1}<span class="top-label"
												>next getchar ()</span
											>{/if}
									</li>
								{/each}
							</ol>
						{:else}
							<span class="none">empty</span>
						{/if}
					</div>
					<div aria-live="polite">
						{#if step && (step.warning || step.pushback.length >= 2)}
							<Callout tone="warn">{PUSHBACK_WARNING}</Callout>
						{/if}
					</div>
				</div>
			</Panel>

			<Panel title="relop DFA" padding="none">
				<AutomatonView
					automaton={RELOP}
					positions={RELOP_POSITIONS}
					startLabel="start"
					highlight={graphHighlight}
					height={380}
					ariaLabel="relop DFA, slide 16"
				/>
			</Panel>

			<Panel title="Every input">
				<div class="results-wrap">
					<table class="results">
						<caption class="visually-hidden"
							>Token returned and pushback left for each input</caption
						>
						<thead>
							<tr>
								<th scope="col">Input</th>
								<th scope="col" class={{ on: !model.breaks }}>As printed</th>
								<th scope="col" class={{ on: model.breaks }}>With break;</th>
							</tr>
						</thead>
						<tbody>
							{#each RESULTS as r (r.input)}
								<tr class={{ current: r.input === model.switchInput }}>
									<th scope="row">
										<button
											type="button"
											class="pick"
											aria-pressed={r.input === model.switchInput}
											onclick={() => (model.switchInput = r.input)}>"{r.input}"</button
										>
									</th>
									{#each [r.printed, r.breaks] as t, k (k)}
										<td class={{ on: model.breaks === (k === 1) }}>
											<span class="tok">{t.result}</span>
											{#if t.pushback.length}
												<span class="pb">pushback {pushbackText(t.pushback)}</span>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Panel>
		</div>
	</div>
</div>

<style>
	.tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-6);
	}
	.note {
		margin: var(--space-3) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.note :global(.cite) {
		margin-left: var(--space-1);
		vertical-align: middle;
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
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	@media (min-width: 1024px) and (min-height: 760px) {
		.left {
			position: sticky;
			top: calc(56px + var(--space-4));
		}
	}
	.code {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.vars {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-6);
		margin: 0;
	}
	dl div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	dt {
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-base);
		font-weight: 600;
		font-variant-ligatures: none;
	}
	.small-label {
		display: block;
		margin-bottom: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.stack {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.stack li {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 3px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: var(--text-base);
	}
	.stack li.top {
		border-color: var(--active);
		background: var(--active-soft);
	}
	.top-label {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.none {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.results-wrap {
		max-width: 100%;
		overflow-x: auto;
	}
	.results {
		width: 100%;
		font-size: var(--text-sm);
	}
	.results th,
	.results td {
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: baseline;
	}
	.results thead th {
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.results thead th.on {
		color: var(--text);
	}
	.results tbody tr:last-child > * {
		border-bottom: 0;
	}
	.results tr.current > * {
		background: var(--active-soft);
	}
	.results td:not(.on) {
		color: var(--text-3);
	}
	.pick {
		all: unset;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		cursor: pointer;
		border-radius: 2px;
	}
	.pick:hover {
		color: var(--accent);
	}
	.pick:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.tok {
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.pb {
		margin-left: var(--space-2);
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
</style>
