<!--
	The "(Limited) Recursive Descent Parser" of Top-Down Parsing, slides 28–34:
	the generated bool functions with the line being executed, the token stream
	with next and save, the call stack, every call with its result, and the
	verdict.
-->
<script lang="ts">
	import { TokenStream } from '$lib/components/grammar';
	import { Callout, Panel, StepControls, type Stepper } from '$lib/components/ui';
	import CallStack from './CallStack.svelte';
	import CallTrace from './CallTrace.svelte';
	import CodeView from './CodeView.svelte';
	import FollowBox from './FollowBox.svelte';
	import GrammarView from './GrammarView.svelte';
	import type { LimitedResult } from './limited';
	import Pieces from './Pieces.svelte';
	import { STREAM_HEIGHT, tokenCell } from './scroll';
	import type { Run } from './session';
	import StepMessage from './StepMessage.svelte';
	import {
		callChain,
		pointerPlace,
		innermostSave,
		limitedTone,
		limitedVerdict,
		limitedProgress,
		pointerHighlights,
		runningProduction,
		stackRows,
		traceLines
	} from './view';

	interface Props {
		run: Run;
		/** Null when the grammar is left-recursive and was not run. */
		result: LimitedResult | null;
		stepper: Stepper;
	}

	let { run, result, stepper }: Props = $props();

	const program = $derived(run.program);
	const count = $derived(run.tokens.length);
	const index = $derived(stepper.index);
	const step = $derived(result ? result.steps[index] : null);
	const atEnd = $derived(!!result && index === result.steps.length - 1);
	const verdict = $derived(limitedVerdict(run));
	const saved = $derived(step ? innermostSave(step) : null);

	function show(at: number) {
		stepper.pause();
		stepper.set(at);
	}
</script>

{#snippet place(index: number)}
	{@const at = pointerPlace(index, run.tokens)}
	{#if at.token !== null}<span class="token">{at.token}</span>{/if}
	{at.where}
{/snippet}

<div class="tab">
	{#if result && step}
		<Panel title="Steps" subtitle="every call, match and return">
			<StepControls {stepper} ariaLabel="Steps of the bool functions">
				{#snippet label(i: number)}
					{@const s = result.steps[i]}
					{#if s}<StepMessage lines={s.message} tone={limitedTone(s)} />{/if}
				{/snippet}
			</StepControls>
		</Panel>

		{#if atEnd && verdict}
			<Callout tone={verdict.tone} title={verdict.title}>
				{#each verdict.lines as line, i (i)}<p>{line}</p>{/each}
			</Callout>
		{/if}
	{:else}
		<Callout tone="info" title="Not run">
			<p>
				The functions below are the code for this grammar. They are not run on the token stream.
			</p>
		</Callout>
	{/if}

	<div class="workspace">
		<Panel title="Code" subtitle="generated for this grammar" class="code-panel">
			<!-- Slide 34 prints the grammar in a box above the code. -->
			<div class="grammar-box">
				<GrammarView
					grammar={run.grammar}
					active={step ? runningProduction(program, step) : null}
					activeLabel="its function is the innermost call"
					ariaLabel="Grammar the code is generated for"
				/>
			</div>
			<CodeView
				{program}
				line={step?.line ?? null}
				site={step?.site ?? null}
				result={step?.event === 'match' || step?.event === 'return' ? step.result : null}
				chain={step ? callChain(step) : []}
				also={step?.event === 'match' ? [0] : []}
			/>
			{#snippet footer()}
				<ul class="legend" aria-label="Legend">
					<li><span class="swatch now" aria-hidden="true"></span>Being executed</li>
					<li><span class="swatch yes" aria-hidden="true"></span>Returned true</li>
					<li><span class="swatch no" aria-hidden="true"></span>Returned false</li>
					<li><span class="swatch open" aria-hidden="true"></span>Call in progress</li>
				</ul>
			{/snippet}
		</Panel>

		{#if result && step}
			<div class="side">
				<Panel title="Token stream">
					<FollowBox
						maxHeight={STREAM_HEIGHT}
						margin={4}
						watch={step}
						label="Token stream, scrolls"
						find={tokenCell(Math.min(step.next, count))}
					>
						<TokenStream
							tokens={run.tokens}
							pointer={Math.min(step.next, count)}
							highlights={pointerHighlights(step, count)}
							size="lg"
						/>
					</FollowBox>
					<dl class="pointers">
						<div>
							<dt><span class="arrow" aria-hidden="true">↑</span><code>next</code></dt>
							<dd>{@render place(step.next)}</dd>
						</div>
						<div>
							<dt><span class="swatch save" aria-hidden="true"></span><code>save</code></dt>
							<dd>
								{#if saved}
									{@render place(saved.save!)}
									<span class="of"
										>in <span class="fn"
											><Pieces pieces={[program.functions[saved.fn].name, { text: ' ()' }]} /></span
										></span
									>
								{:else}
									<span class="of">no function of a non-terminal is in progress</span>
								{/if}
							</dd>
						</div>
					</dl>
				</Panel>

				<Panel title="Call stack" subtitle="innermost call first">
					<CallStack rows={stackRows(program, step)} tokens={run.tokens} />
				</Panel>

				<Panel title="Calls" subtitle={limitedProgress(step, result)}>
					<CallTrace lines={traceLines(program, result, index)} onselect={show} />
				</Panel>
			</div>
		{/if}
	</div>
</div>

<style>
	.tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
		align-items: start;
	}
	@media (min-width: 1000px) {
		.workspace {
			grid-template-columns: minmax(0, 7fr) minmax(300px, 5fr);
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.grammar-box {
		width: fit-content;
		max-width: 100%;
		margin-bottom: var(--space-3);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
	}
	.pointers {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: var(--space-3) 0 0;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		font-size: var(--text-sm);
	}
	.pointers div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-3);
	}
	.pointers dt {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 4.5rem;
	}
	.pointers dd {
		margin: 0;
		color: var(--text-2);
	}
	.pointers code {
		padding: 0;
		border: 0;
		background: none;
		font-weight: 600;
	}
	.arrow {
		display: inline-block;
		width: 14px;
		color: var(--active);
		font-family: var(--font-mono);
		font-weight: 700;
		text-align: center;
	}
	.of {
		color: var(--text-3);
	}
	.token,
	.fn {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.token {
		padding: 0 0.35em;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.swatch {
		display: inline-block;
		width: 14px;
		height: 12px;
		border-radius: 3px;
		box-shadow: inset 0 -2px 0 transparent;
	}
	.legend .swatch {
		width: 18px;
		height: 14px;
	}
	.swatch.now {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	.swatch.yes {
		background: var(--accept-soft);
		box-shadow: inset 0 -2px 0 var(--accept);
	}
	.swatch.no {
		background: var(--reject-soft);
		box-shadow: inset 0 -2px 0 var(--reject);
	}
	.swatch.open {
		background: var(--surface-3);
		box-shadow: inset 0 -2px 0 var(--border-strong);
	}
	.swatch.save {
		background: var(--info-soft);
		box-shadow: inset 0 -2px 0 var(--info);
	}
</style>
