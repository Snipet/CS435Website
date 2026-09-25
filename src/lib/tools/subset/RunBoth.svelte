<!--
@component
"Run both" tab: one input stepped on the NFA (a set of active states) and on
its subset DFA (one state) at the same time. After every symbol the DFA
state's NFA states equal the NFA's active set.
-->
<script lang="ts">
	import { AutomatonView, type StateTone } from '$lib/components/graph';
	import type { AutomatonLayout } from '$lib/components/graph';
	import { Badge, CharStream, StepControls, Stepper, TextField } from '$lib/components/ui';
	import { formatString, showChar } from '$lib/theory/chars';
	import type { Automaton, Positions, StateId } from '$lib/theory/automata';
	import { MAX_RUN_INPUT, runSideBySide, setText, stateName } from './logic';

	interface Props {
		nfa: Automaton;
		dfa: Automaton;
		nfaPositions?: Positions;
		dfaPositions?: Positions;
		dfaFrame?: AutomatonLayout['bounds'];
		drawNfa: boolean;
		drawDfa: boolean;
		input: string;
		oninputchange: (input: string) => void;
	}

	let {
		nfa,
		dfa,
		nfaPositions,
		dfaPositions,
		dfaFrame,
		drawNfa,
		drawDfa,
		input,
		oninputchange
	}: Props = $props();

	const run = $derived(runSideBySide(nfa, dfa, input));
	const stepper = new Stepper(() => run.steps.length, { speed: 1.5 });
	const index = $derived(stepper.index);
	const step = $derived(run.steps[index]);
	const atEnd = $derived(index === run.steps.length - 1);
	const read = $derived(input.slice(0, step?.pos ?? 0));

	const members = $derived(
		step && step.dfaState !== null ? (dfa.states[step.dfaState].subset ?? []) : []
	);

	/** At the end of the input: accepting states green when the run accepts, every state red when it rejects. */
	function tones(ids: StateId[], a: Automaton, accepted: boolean): Record<number, StateTone> {
		const out: Record<number, StateTone> = {};
		if (!atEnd) return out;
		for (const id of ids)
			if (!accepted || a.states[id].accepting) out[id] = accepted ? 'accept' : 'reject';
		return out;
	}

	const nfaHighlight = $derived({
		active: step?.nfaActive ?? [],
		taken: step?.nfaTaken ?? [],
		tone: tones(step?.nfaActive ?? [], nfa, run.nfaAccepts)
	});
	const dfaHighlight = $derived({
		active: step && step.dfaState !== null ? [step.dfaState] : [],
		taken: step && step.dfaVia !== null ? [step.dfaVia] : [],
		tone: tones(step && step.dfaState !== null ? [step.dfaState] : [], dfa, run.dfaAccepts)
	});

	function edit(value: string) {
		oninputchange(value.slice(0, MAX_RUN_INPUT));
		stepper.pause();
		stepper.first();
	}

	function seek(pos: number) {
		const i = run.steps.findIndex((s) => s.pos >= pos);
		stepper.set(i < 0 ? run.steps.length - 1 : i);
	}

	let pairWidth = $state(0);
	const diagramHeight = $derived<number | 'auto'>(pairWidth > 0 && pairWidth < 600 ? 'auto' : 250);
	const quoted = (ch: string) => `'${showChar(ch, 'quoted')}'`;
</script>

<div class="run">
	<div class="input-row">
		<div class="field">
			<TextField
				label="Input"
				mono
				value={input}
				maxlength={MAX_RUN_INPUT}
				placeholder="e.g. 0101"
				spellcheck="false"
				autocapitalize="off"
				oninput={(e) => edit(e.currentTarget.value)}
			/>
		</div>
		<div class="stream">
			<CharStream
				text={input}
				cursor={step?.pos ?? 0}
				showEnd
				ariaLabel="Input {formatString(input)}; the bar marks the next symbol"
				onselect={seek}
			/>
		</div>
	</div>

	<StepControls {stepper} ariaLabel="Run steps">
		{#snippet label(i)}
			{@const s = run.steps[i]}
			{#if s}
				{#if s.char === undefined}
					Start. The NFA is in ε-closure({setText(nfa, [nfa.start])}) =
					<span class="f">{setText(nfa, s.nfaActive)}</span>; the DFA is in its start state
					<span class="f">{stateName(dfa, dfa.start)}</span>.
				{:else}
					Read <span class="f">{quoted(s.char)}</span>. The NFA moves to
					<span class="f">{setText(nfa, s.nfaActive)}</span>;
					{#if s.dfaState === null}
						the DFA has no transition on it.
					{:else}
						the DFA moves to <span class="f">{stateName(dfa, s.dfaState)}</span>.
					{/if}
				{/if}
				{#if i === run.steps.length - 1}
					{run.nfaAccepts ? 'Both accept.' : 'Both reject.'}
				{/if}
			{/if}
		{/snippet}
	</StepControls>

	<div class="pair" bind:clientWidth={pairWidth}>
		<section class="machine" aria-labelledby="run-nfa">
			<header>
				<h3 id="run-nfa">NFA</h3>
				<span class="caption">active set</span>
			</header>
			{#if drawNfa}
				<AutomatonView
					automaton={nfa}
					positions={nfaPositions}
					highlight={nfaHighlight}
					height={diagramHeight}
					ariaLabel="NFA with its active states marked"
				/>
			{/if}
			<p class="set f">{setText(nfa, step?.nfaActive ?? [])}</p>
		</section>
		<section class="machine" aria-labelledby="run-dfa">
			<header>
				<h3 id="run-dfa">DFA</h3>
				<span class="caption">one state</span>
			</header>
			{#if drawDfa}
				<AutomatonView
					automaton={dfa}
					positions={dfaPositions}
					extent={dfaFrame}
					highlight={dfaHighlight}
					height={diagramHeight}
					ariaLabel="DFA with its current state marked"
				/>
			{/if}
			<p class="set f">
				{#if step && step.dfaState !== null}
					{stateName(dfa, step.dfaState)} = {setText(nfa, members)}
				{:else}
					no state: the DFA has no transition
				{/if}
			</p>
		</section>
	</div>

	<div class="compare" aria-live="polite">
		{#if step}
			<span>After <span class="f">{formatString(read)}</span>:</span>
			{#if step.same}
				<Badge tone="accept">DFA state = NFA active set</Badge>
			{:else}
				<Badge tone="reject">different sets</Badge>
			{/if}
			{#if atEnd}
				<Badge tone={run.nfaAccepts ? 'accept' : 'reject'} variant="solid"
					>{run.nfaAccepts ? 'Both accept' : 'Both reject'}</Badge
				>
			{/if}
		{/if}
	</div>
</div>

<style>
	.run {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.input-row {
		display: grid;
		grid-template-columns: minmax(10rem, 16rem) minmax(0, 1fr);
		gap: var(--space-3) var(--space-5);
		align-items: end;
	}
	.stream {
		min-width: 0;
		overflow-x: auto;
		padding-bottom: 2px;
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-4);
	}
	.machine {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.machine header {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
	}
	.caption {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.set {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--border);
		color: var(--text);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.compare {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	@media (max-width: 860px) {
		.pair,
		.input-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
