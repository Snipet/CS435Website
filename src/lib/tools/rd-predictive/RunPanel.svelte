<!--
	The parser run on a token string: the string with the input pointer, the
	step controls with what each step does, the outcome at the last step, and
	the call stack.
-->
<script lang="ts">
	import { TokenStream } from '$lib/components/grammar';
	import { Callout, Icon, StepControls, TextField, type Stepper } from '$lib/components/ui';
	import CallStack from './CallStack.svelte';
	import type { RunResult } from './run';
	import StepLine from './StepLine.svelte';
	import { describeStep, outcomeText, stackRows, tokenHighlights } from './view';

	interface Props {
		/** The token string as typed. */
		input: string;
		inputError?: string;
		oninput?: () => void;
		/** Null while the grammar or the token string has errors and nothing was run before. */
		run: RunResult | null;
		stepper: Stepper;
		/** `run` is for an earlier grammar or token string. */
		stale?: boolean;
	}

	let {
		input = $bindable(),
		inputError = '',
		oninput,
		run,
		stepper,
		stale = false
	}: Props = $props();

	const uid = $props.id();
	const index = $derived(stepper.index);
	const step = $derived(run ? run.steps[index] : undefined);
	const atEnd = $derived(!!run && index === run.steps.length - 1);
	const outcome = $derived(run ? outcomeText(run) : null);
</script>

<div class="run">
	<TextField
		label="Token string"
		description="Terminals of the grammar, separated by spaces. $ is added at the end."
		mono
		bind:value={input}
		{oninput}
		error={inputError}
		placeholder="int * int"
		spellcheck="false"
		autocapitalize="off"
	/>

	{#if run && step}
		{#if stale}
			<p class="stale-note" role="status">
				<Icon name="info" size={16} />
				<span>Showing the run of the last grammar and token string without errors.</span>
			</p>
		{/if}
		<div class={['result', { 'stale-data': stale }]} aria-busy={stale}>
			<TokenStream
				tokens={run.tokens}
				pointer={step.pointer}
				highlights={tokenHighlights(run, index)}
				size="lg"
				ariaLabel="Token string with the input pointer"
			/>

			<StepControls {stepper} ariaLabel="Steps of the parser">
				{#snippet label(i: number)}
					{@const s = run.steps[i]}
					{#if s}
						<StepLine
							text={describeStep(run, i)}
							line={s.line}
							code={run.program.lines[s.line]?.text ?? ''}
						/>
					{/if}
				{/snippet}
			</StepControls>

			{#if atEnd && outcome}
				<Callout tone={outcome.tone} title={outcome.title} role="status">
					{#each outcome.lines as line, i (i)}<p>{line}</p>{/each}
				</Callout>
			{/if}

			<section class="stack" aria-labelledby="{uid}-stack">
				<h3 id="{uid}-stack">Call stack <span>innermost call first</span></h3>
				<CallStack rows={stackRows(run, index)} />
			</section>
		</div>
	{:else}
		<p class="empty">The parser runs when the grammar and the token string have no errors.</p>
	{/if}
</div>

<style>
	.run,
	.result {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.stale-note :global(.icon) {
		flex: none;
		color: var(--info);
	}
	.stack {
		min-width: 0;
	}
	h3 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	h3 span {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 400;
	}
</style>
