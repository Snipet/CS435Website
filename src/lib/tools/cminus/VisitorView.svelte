<!--
	The Visitor tab: a visitor, written against the course's IVisitor, walks
	the parser's tree. Its run is a list of steps (accept calls, visit calls,
	the lines between calls, returns) to play forward and back: the visitor's
	code with the lines that run, the call stack, the two dispatches of the
	innermost call, the tree with the node of the step, and what the visitor
	has produced. The node of the step is marked in the source too. A node
	picked in the tree moves the run to its visit and selects it in the
	source; a frame of the stack or a line number of the output only selects
	it there. A selection made outside the tab moves the run to the visit of
	its first node.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { SegmentedControl, StepControls, Stepper } from '$lib/components/ui';
	import { VISITORS, type Compilation, type VisitorId } from '$lib/theory/cminus';
	import { plural, selectionKey, type SelectionMarks, type SourceRange } from './selection';
	import { ROW_LIMIT } from './views';
	import VisitorCode from './VisitorCode.svelte';
	import VisitorDispatch from './VisitorDispatch.svelte';
	import VisitorOutput from './VisitorOutput.svelte';
	import VisitorStack from './VisitorStack.svelte';
	import VisitorTree from './VisitorTree.svelte';
	import {
		KIND_LABEL,
		VISITOR_OPTIONS,
		callStack,
		codeMarks,
		dispatchAt,
		rangeOfNode,
		rowWindow,
		selectionStep,
		stepCode,
		stepOfNode,
		traceIndex,
		visitRows,
		visitStatus,
		visitorTrace,
		visitorTree
	} from './visitor-view';

	interface Props {
		/** A compilation whose parser accepted the program. */
		c: Compilation;
		marks: SelectionMarks;
		/** Changes with the selection. */
		selKey?: string;
		visitor: VisitorId;
		/** The step shown, kept by the page while another tab is open. */
		step?: number;
		/** Told the range of the node of each step shown, for the source editor. */
		oncurrent?: (range: SourceRange | null) => void;
		onselect: (range: SourceRange) => void;
	}

	let {
		c,
		marks,
		selKey = '',
		visitor = $bindable(),
		step = $bindable(0),
		oncurrent,
		onselect
	}: Props = $props();

	const uid = $props.id();
	const program = $derived(c.parse!.program);
	const tree = $derived(visitorTree(program));
	const trace = $derived(visitorTrace(program, visitor));
	const index = $derived(traceIndex(trace, tree));
	const info = $derived(VISITORS[visitor]);

	const stepper = new Stepper(() => trace.events.length, { index: untrack(() => step), speed: 2 });
	const at = $derived(stepper.index);
	const event = $derived(trace.events[at]);
	const marksOfCode = $derived(codeMarks(trace, at));
	const stack = $derived(callStack(trace, index, at));
	const dispatch = $derived(dispatchAt(trace, at));

	$effect(() => {
		step = at;
	});
	$effect(() => {
		oncurrent?.(event ? rangeOfNode(index, event.node) : null);
	});

	// A new selection made outside the tab moves the run to the visit of its
	// first node, unless the step is at a node inside it already. A step kept
	// from before is kept.
	let handled = untrack(() => (step > 0 ? selKey : ''));
	$effect(() => {
		const key = selKey;
		untrack(() => {
			if (key === handled) return;
			handled = key;
			if (!key) return;
			const to = selectionStep(trace, index, stepper.index, marks.nodes);
			if (to === null) return;
			stepper.pause();
			stepper.set(to);
		});
	});

	/**
	 * Selects a range in the source and leaves the run where it is: the
	 * selection is the tab's own, so the effect above lets it be (a line number
	 * of the output stays, with the keyboard focus on it).
	 */
	function selectInSource(range: SourceRange) {
		handled = selectionKey(range);
		onselect(range);
	}

	function pick(id: number) {
		stepper.pause();
		stepper.set(stepOfNode(trace, index, id, stepper.index));
		const range = rangeOfNode(index, id);
		if (range) selectInSource(range);
	}

	function choose() {
		stepper.pause();
		stepper.first();
	}

	const rows = $derived(visitRows(tree));
	let allRows = $state(false);
	const rowsListed = $derived(rowWindow(rows, event?.node ?? null, allRows ? Infinity : ROW_LIMIT));
	// Numbers, so the tree lists its rows again only when the window moves.
	const firstRow = $derived(rowsListed.start);
	const endRow = $derived(rowsListed.end);
	const status = $derived.by(() => {
		const t = trace;
		const i = index;
		const now = at;
		return (id: number) => visitStatus(t, i, now, id);
	});
</script>

<div class="cm-stack visitor">
	<div class="cm-toolbar">
		<SegmentedControl
			label="Visitor"
			size="sm"
			mono
			options={VISITOR_OPTIONS}
			bind:value={visitor}
			onchange={choose}
		/>
		<span class="cm-note cm-muted">{plural(trace.events.length, 'step')}</span>
	</div>
	<p class="cm-note">{info.summary}</p>
	{#if trace.truncated}
		<p class="cm-note">The run is cut off after {plural(trace.events.length, 'step')}.</p>
	{/if}

	<StepControls {stepper} ariaLabel="Steps of {info.name}" noun="Step">
		{#snippet label(i: number)}
			{@const e = trace.events[i]}
			{#if e}
				<span class="caption">
					<span class="what"
						><span class="kind">{KIND_LABEL[e.kind]}</span><span class="visually-hidden">:</span>
						{e.text}</span
					>
					<!-- The listing marks these lines (aria-current); the caption shows them, unannounced. -->
					<span class="code" aria-hidden="true">
						{#each stepCode(trace, i).slice(0, 3) as line, k (k)}<code>{line}</code>{/each}
					</span>
				</span>
			{/if}
		{/snippet}
	</StepControls>

	<section class="cm-section" aria-labelledby="{uid}-code">
		<h3 class="cm-heading" id="{uid}-code">
			{info.name}
			<span class="cm-sub">its lines that run are marked; a waiting call is shaded</span>
		</h3>
		<VisitorCode
			lines={info.code}
			current={marksOfCode.current}
			helper={marksOfCode.helper}
			waiting={marksOfCode.waiting}
			maxHeight="min(22rem, 55vh)"
			ariaLabel="The code of {info.name}"
		/>
	</section>

	<div class="pair">
		<section class="cm-section" aria-labelledby="{uid}-stack">
			<h3 class="cm-heading" id="{uid}-stack">
				Call stack <span class="cm-sub">innermost call first</span>
			</h3>
			<VisitorStack rows={stack} onselect={selectInSource} />
		</section>
		<section class="cm-section" aria-labelledby="{uid}-dispatch">
			<h3 class="cm-heading" id="{uid}-dispatch">
				Double dispatch <span class="cm-sub">of the innermost call</span>
			</h3>
			<VisitorDispatch view={dispatch} />
		</section>
	</div>

	<div class="pair wide">
		<section class="cm-section" aria-labelledby="{uid}-tree">
			<h3 class="cm-heading" id="{uid}-tree">
				Tree <span class="cm-sub">{plural(rows.length, 'node')}, in the order of the visits</span>
			</h3>
			<VisitorTree
				{rows}
				start={firstRow}
				end={endRow}
				{status}
				current={event?.node ?? null}
				marked={marks.nodes}
				onpick={pick}
				onshowall={() => (allRows = true)}
			/>
			<p class="cm-note cm-muted">
				A node selects its visit and its text in the source. Nodes not visited yet are dimmed; those
				whose visit is in progress have a bar.
			</p>
		</section>
		<section class="cm-section" aria-labelledby="{uid}-output">
			<h3 class="cm-heading" id="{uid}-output">
				{info.instance} <span class="cm-sub">its members and what it holds after the step</span>
			</h3>
			<VisitorOutput {trace} {index} {at} source={c.source} {marks} onselect={selectInSource} />
		</section>
	</div>
</div>

<style>
	.visitor :global(.segmented-wrap) {
		min-width: 0;
		max-width: 100%;
	}
	.caption {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.what {
		line-height: 1.5;
	}
	.kind {
		display: inline-block;
		margin-right: var(--space-1);
		padding: 0 6px;
		border-radius: 999px;
		background: var(--info-soft);
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.code {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.code code {
		align-self: flex-start;
		max-width: 100%;
		font-size: 0.78125rem;
		white-space: pre-wrap;
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5) var(--space-4);
		align-items: start;
		min-width: 0;
	}
	@container cm-view (min-width: 38rem) {
		.pair:not(.wide) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	/* The rows of the tree and of the output are long: side by side only when both fit. */
	@container cm-view (min-width: 64rem) {
		.pair.wide {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
</style>
