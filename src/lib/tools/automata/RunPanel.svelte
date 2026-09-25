<!--
@component
Runs one input string step by step: the input with a cursor, the step
controls and caption, the path so far in lecture notation, and the outcome.
For NFAs, "All paths" shows every choice as a tree.
-->
<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import StepControls from '$lib/components/ui/StepControls.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { Stepper } from '$lib/components/ui/stepper.svelte';
	import type { HighlightRange } from '$lib/components/ui/types';
	import type { PathNode } from '$lib/theory/automata/simulate';
	import type { Automaton } from '$lib/theory/automata/types';
	import { MAX_RUN_LENGTH } from './model';
	import PathTreeView from './PathTreeView.svelte';
	import { traceIndexAt, type MissingMode, type RunModel } from './run';
	import Segs from './Segs.svelte';
	import TraceView from './TraceView.svelte';

	interface Props {
		run: RunModel | null;
		stepper: Stepper;
		input: string;
		/** Determinism of the machine, which picks the options shown. */
		kind: 'dfa' | 'partial-dfa' | 'nfa';
		hasEpsilon: boolean;
		missing: MissingMode;
		closureStep: boolean;
		/** The input is longer than the step-by-step view shows. */
		tooLong: boolean;
		/** The machine has no states. */
		empty: boolean;
		/** The machine itself, for the tree of paths. */
		automaton: Automaton;
		paths: { root: PathNode; truncated: boolean } | null;
		pathsOpen: boolean;
	}

	let {
		run,
		stepper,
		input = $bindable(),
		kind,
		hasEpsilon,
		missing = $bindable(),
		closureStep = $bindable(),
		tooLong,
		empty,
		automaton,
		paths,
		pathsOpen = $bindable()
	}: Props = $props();

	const placeholder = '"" (the empty string)';
	const step = $derived(run ? run.steps[stepper.index] : null);
	const atEnd = $derived(!!run && stepper.index === run.steps.length - 1);
	const traceIndex = $derived(run ? traceIndexAt(run.trace, stepper.index) : 0);

	const highlights = $derived.by((): HighlightRange[] => {
		if (!step) return [];
		const out: HighlightRange[] = [];
		const readStart = step.read ? step.read.start : step.pos;
		if (readStart > 0) out.push({ start: 0, end: readStart, tone: 'muted' });
		if (step.read)
			out.push({
				start: step.read.start,
				end: step.read.end,
				tone: step.kind === 'stuck' ? 'reject' : 'active'
			});
		return out;
	});

	function jump(index: number) {
		if (!run) return;
		const i = run.steps.findIndex((s) => s.pos >= index && s.kind !== 'closure');
		stepper.set(i < 0 ? run.steps.length - 1 : i);
	}
</script>

<div class="run">
	<TextField
		label="Input"
		mono
		bind:value={input}
		{placeholder}
		spellcheck="false"
		autocapitalize="off"
	/>

	{#if kind === 'partial-dfa' || (kind === 'nfa' && hasEpsilon)}
		<div class="options">
			{#if kind === 'partial-dfa'}
				<SegmentedControl
					label="Missing transition"
					showLabel
					size="sm"
					bind:value={missing}
					options={[
						{ value: 'trap', label: 'trap state', title: 'Go to the trap state and keep reading' },
						{ value: 'crash', label: 'crash', title: 'Stop and reject' }
					]}
				/>
			{:else}
				<Toggle label="Show ε-closure as a separate step" bind:checked={closureStep} />
			{/if}
		</div>
	{/if}

	{#if empty}
		<p class="muted">Add a state to run the machine.</p>
	{:else if tooLong}
		<Callout tone="warn">
			The step-by-step run shows inputs of up to {MAX_RUN_LENGTH} symbols. The batch run below takes longer
			strings.
		</Callout>
	{:else if run && step}
		<div class="stream">
			<CharStream
				text={input}
				cursor={step.pos}
				{highlights}
				showEnd
				size="lg"
				ariaLabel="Input, position {step.pos} of {input.length}"
				onselect={jump}
			/>
		</div>

		<StepControls {stepper} noun="Step" ariaLabel="Run steps">
			{#snippet label(i)}
				<Segs segs={run.steps[i]?.caption ?? []} />
			{/snippet}
		</StepControls>

		<div class="trace-row">
			<span class="row-label">Path</span>
			<TraceView trace={run.trace} current={traceIndex} onselect={(s) => stepper.set(s)} />
		</div>

		<div
			class={['outcome', atEnd ? (run.accepted ? 'accept' : 'reject') : 'pending']}
			aria-live="polite"
		>
			{#if atEnd}
				<Icon name={run.accepted ? 'success' : 'error'} size={18} />
				<span><Segs segs={run.outcome} /></span>
			{:else}
				<span>The outcome is decided at the end of the input.</span>
			{/if}
		</div>

		{#if run.kind === 'nfa'}
			<Disclosure summary="All paths" openSummary="All paths" bind:open={pathsOpen}>
				{#if paths}
					<PathTreeView {automaton} root={paths.root} truncated={paths.truncated} {input} />
				{/if}
			</Disclosure>
		{/if}
	{/if}
</div>

<style>
	.run {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.stream {
		overflow-x: auto;
		padding: var(--space-1) 0;
	}
	.trace-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
	}
	.row-label {
		flex: none;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.outcome {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.outcome :global(svg) {
		flex: none;
		margin-top: 1px;
	}
	.outcome.accept {
		border-color: color-mix(in srgb, var(--accept) 35%, transparent);
		background: var(--accept-soft);
		color: var(--text);
	}
	.outcome.accept :global(svg) {
		color: var(--accept);
	}
	.outcome.reject {
		border-color: color-mix(in srgb, var(--reject) 35%, transparent);
		background: var(--reject-soft);
		color: var(--text);
	}
	.outcome.reject :global(svg) {
		color: var(--reject);
	}
	.outcome.pending {
		border-style: dashed;
		color: var(--text-3);
	}
	.muted {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
