<!--
	Recursive descent with backtracking, one slide per step (Top-Down Parsing,
	slides 5–16): the grammar with the alternative being tried, the partial
	parse tree with the current node, the token stream with the input pointer,
	the message, the fringe, and the log of tries.
-->
<script lang="ts">
	import { ParseTreeView, TokenStream } from '$lib/components/grammar';
	import { Callout, Panel, StepControls, Toggle, type Stepper } from '$lib/components/ui';
	import {
		describeStep,
		instanceLabel,
		type BacktrackResult,
		type BacktrackStep
	} from './backtrack';
	import FollowBox from './FollowBox.svelte';
	import FringeLine from './FringeLine.svelte';
	import GrammarView from './GrammarView.svelte';
	import { STREAM_HEIGHT, currentTreeNode, tokenCell } from './scroll';
	import type { Run } from './session';
	import StepMessage from './StepMessage.svelte';
	import TryLog from './TryLog.svelte';
	import {
		backtrackProgress,
		compareHighlight,
		logLines,
		messageTone,
		treeHighlight
	} from './view';

	interface Props {
		run: Run;
		result: BacktrackResult;
		stepper: Stepper;
		/** Number the instances of non-terminals (E0, T1 …). */
		numbers: boolean;
	}

	let { run, result, stepper, numbers = $bindable() }: Props = $props();

	const index = $derived(stepper.index);
	const step = $derived(result.steps[index]);
	const lines = $derived(logLines(result, index, numbers));
	const stats = $derived(backtrackProgress(step, result));

	/** Room for the deepest tree of the run, so the panels below do not move while stepping. */
	const treeHeight = $derived(Math.min(480, Math.round((38 + result.depth * 44) * 1.125)));

	const describe = (s: BacktrackStep) => describeStep(s, { instances: numbers });

	function show(at: number) {
		stepper.pause();
		stepper.set(at);
	}
</script>

<div class="tab">
	<Panel title="Steps" subtitle="every try, match and mismatch">
		<StepControls {stepper} ariaLabel="Backtracking steps">
			{#snippet label(i: number)}
				{@const s = result.steps[i]}
				{#if s}<StepMessage lines={describe(s)} tone={messageTone(s.event)} />{/if}
			{/snippet}
		</StepControls>
	</Panel>

	{#if result.stop && index === result.steps.length - 1}
		<Callout tone="warn" title="The run was stopped">
			{#if result.stop.reason === 'depth'}
				<p>
					{result.stop.limit} instances
					{#if result.stop.symbol !== undefined}of <code>{result.stop.symbol}</code>{/if}
					are nested with no token matched between them, and the next one would be expanded the same way.
					With left recursion the nesting can go on without end: the tree grows down its left edge while
					the input pointer stays where it is.
				</p>
			{:else}
				<p>
					The parse did not finish within {result.stop.limit} steps. Backtracking can take a number of
					steps that grows exponentially with the length of the input.
				</p>
			{/if}
		</Callout>
	{/if}

	<div class="workspace">
		<Panel title="Parse tree" class="tree-panel">
			{#snippet actions()}
				<Toggle bind:checked={numbers} label="Instance numbers" />
			{/snippet}
			<div class="tree" style:min-height="{treeHeight}px">
				<!-- A deep tree scrolls in its box, which follows the current node (after the tree's move). -->
				<FollowBox
					maxHeight="36rem"
					watch={step}
					settle={260}
					margin={44}
					label="Partial parse tree, scrolls"
					find={currentTreeNode}
				>
					<ParseTreeView
						tree={step.tree}
						highlight={treeHighlight(step)}
						labels={numbers ? instanceLabel : undefined}
						labelSize={18}
						ariaLabel="Partial parse tree"
					/>
				</FollowBox>
			</div>
			{#snippet footer()}
				<ul class="legend" aria-label="Legend">
					<li><span class="swatch current" aria-hidden="true"></span>Current node</li>
					<li><span class="swatch matched" aria-hidden="true"></span>Matched terminal</li>
					{#if numbers}
						<li class="note">
							Instances are numbered from 0 at the root in the order they are added; a number freed
							by backtracking is used again.
						</li>
					{/if}
				</ul>
			{/snippet}
		</Panel>

		<div class="side">
			<Panel title="Grammar" subtitle="rules are tried in this order">
				<GrammarView grammar={run.grammar} active={step.production} context={step.within} />
			</Panel>
			<Panel title="Token stream">
				<FollowBox
					maxHeight={STREAM_HEIGHT}
					margin={4}
					watch={step}
					label="Token stream, scrolls"
					find={tokenCell(step.pos)}
				>
					<TokenStream
						tokens={run.tokens}
						pointer={step.pos}
						highlights={compareHighlight(step, run.tokens.length)}
						size="lg"
					/>
				</FollowBox>
				{#if run.tokens.length === 0}
					<p class="empty-note">
						The token stream is empty: the pointer is at the end of the input.
					</p>
				{/if}
				<div class="fringe">
					<FringeLine {step} instances={numbers} />
					<p class="fringe-note">
						The leaves of the tree: matched tokens, the leftmost non-terminal (marked), the rest.
					</p>
				</div>
			</Panel>
		</div>

		<Panel title="Tries" subtitle={stats} class="log-panel">
			<TryLog {lines} onselect={show} />
		</Panel>
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
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 820px) {
		.workspace {
			grid-template-columns: minmax(270px, 4fr) minmax(0, 7fr);
			grid-template-areas:
				'side tree'
				'log tree';
			grid-template-rows: auto 1fr;
		}
		.side {
			grid-area: side;
		}
		.workspace :global(.tree-panel) {
			grid-area: tree;
		}
		.workspace :global(.log-panel) {
			grid-area: log;
		}
	}
	@media (min-width: 1240px) {
		.workspace {
			grid-template-columns: minmax(280px, 3fr) minmax(0, 6fr) minmax(280px, 3fr);
			grid-template-areas: 'side tree log';
			grid-template-rows: auto;
		}
	}
	.tree {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		min-width: 0;
	}
	.empty-note {
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.fringe {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.fringe-note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
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
	.legend .note {
		flex-basis: 100%;
		color: var(--text-3);
	}
	.swatch {
		width: 18px;
		height: 14px;
		border-radius: 3px;
	}
	.swatch.current {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	.swatch.matched {
		background: var(--accept-soft);
		box-shadow: inset 0 -2px 0 var(--accept);
	}
</style>
