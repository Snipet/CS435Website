<!--
	The Closure / Transition stepper (Bottom-up Parsing III, slides 10 and 13):
	the pseudocode with the line that runs marked, Items as it grows (one item
	per line, and abbreviated with merged lookaheads, as on slide 11), and the
	values of the loop variables: [X → α•Yβ, a], Y → γ, First(βa), and the item
	[Y → •γ, b] added.
-->
<script lang="ts">
	import {
		Button,
		CodeEditor,
		SegmentedControl,
		Select,
		StepControls,
		Updating,
		type Stepper
	} from '$lib/components/ui';
	import { printProduction } from '$lib/theory/grammar/lr';
	import { printSet } from '$lib/theory/grammar/parse';
	import {
		CLOSURE_CODE,
		TRANSITION_CODE,
		describeFrame,
		startItem,
		type ClosureFrame,
		type ClosureSetup
	} from './closure-steps';
	import ClosureItem from './ClosureItem.svelte';
	import ItemList, { type ItemMark } from './ItemList.svelte';
	import { closureItemText, itemLines, itemView } from './items';
	import Pseudocode from './Pseudocode.svelte';
	import type { ClosureMode } from './state';

	interface Props {
		setup: ClosureSetup | null;
		stepper: Stepper;
		mode: ClosureMode;
		seed: string;
		/** Transition(state, y): a state and a symbol were picked ('' for the state's first symbol). */
		onpick?: (from: number, symbol: string) => void;
		/** The LR(1) automaton the transitions come from is for an earlier input. */
		stale?: boolean;
		/** Called after any change of the inputs. */
		onedit?: () => void;
	}

	let {
		setup,
		stepper,
		mode = $bindable(),
		seed = $bindable(),
		onpick,
		stale = false,
		onedit
	}: Props = $props();

	let editor = $state<HTMLTextAreaElement>();

	const run = $derived(setup?.run ?? null);
	const frame = $derived<ClosureFrame | null>(run ? (run.frames[stepper.index] ?? null) : null);
	const aug = $derived(setup?.aug ?? null);

	/** Closure's lines and Transition's (when it runs Closure) marked for the frame. */
	const closureActive = $derived(frame?.at.code === 'closure' ? [frame.at.line] : []);
	const transitionActive = $derived(frame?.at.code === 'transition' ? [frame.at.line] : []);
	const transitionOuter = $derived(frame?.outer ? [frame.outer.line] : []);

	/** Items of the frame, with their marks. */
	const itemsNow = $derived(run && frame ? run.items.slice(0, frame.size) : []);
	const marksOf = (i: number): ItemMark[] => {
		if (!frame) return [];
		const marks: ItemMark[] = [];
		if (frame.add && frame.add.index === i) marks.push(frame.add.added ? 'added' : 'repeat');
		if (frame.current === i && frame.at.code === 'closure') marks.push('current');
		return marks;
	};
	const fullLines = $derived(
		aug ? itemsNow.map((item, i) => ({ view: itemView(aug, item), marks: marksOf(i) })) : []
	);
	const shortLines = $derived.by(() => {
		if (!aug) return [];
		const lines = itemLines(aug, itemsNow, 'abbreviated');
		return lines.map((line) => {
			const marks = [...new Set(line.items.flatMap((i) => marksOf(i)))];
			return { view: line.view, marks };
		});
	});
	/** Transition: the state's items, the one being moved marked. */
	const stateLines = $derived(
		setup?.kind === 'transition' && run && aug
			? run.seed.map((item, i) => ({
					view: itemView(aug, item),
					marks: frame?.moved === i ? (['moved'] as ItemMark[]) : []
				}))
			: []
	);
	const caption = $derived(aug && run && frame ? describeFrame(aug, run, frame) : '');

	const modeOptions = [
		{ value: 'closure' as const, label: 'Closure(Items)' },
		{ value: 'transition' as const, label: 'Transition(state, y)' }
	];
	const stateOptions = $derived(
		setup?.kind === 'transition'
			? Array.from({ length: setup.states }, (_, s) => ({ value: s, label: `State ${s}` }))
			: []
	);
	const symbolOptions = $derived(
		setup?.kind === 'transition'
			? setup.symbols.map((t) => ({ value: t.symbol, label: t.symbol }))
			: []
	);

	const startText = $derived(aug ? itemView(aug, startItem(aug)) : null);

	function insertDot() {
		const el = editor;
		if (!el) {
			seed = `${seed}•`;
			onedit?.();
			return;
		}
		const start = el.selectionStart ?? seed.length;
		const end = el.selectionEnd ?? start;
		seed = seed.slice(0, start) + '•' + seed.slice(end);
		onedit?.();
		queueMicrotask(() => {
			el.focus();
			el.setSelectionRange(start + 1, start + 1);
		});
	}
</script>

<div class="closure">
	<div class="controls">
		<SegmentedControl
			options={modeOptions}
			bind:value={mode}
			label="What to step through"
			onchange={() => onedit?.()}
		/>
		{#if mode === 'closure'}
			<div class="seed">
				<CodeEditor
					label="Items to close, one per line"
					bind:value={seed}
					bind:element={editor}
					diagnostics={setup?.kind === 'closure' ? setup.read.diagnostics : []}
					minRows={1}
					maxRows={4}
					lineNumbers={false}
					tabInserts={false}
					placeholder={startText ? `blank: ${closureItemText(startText, true)}` : ''}
					oninput={() => onedit?.()}
				/>
				<div class="seed-buttons">
					<Button size="sm" variant="secondary" onclick={insertDot}>Insert •</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={seed.trim() === ''}
						onclick={() => {
							seed = '';
							onedit?.();
						}}>Start item</Button
					>
				</div>
				{#if setup?.kind === 'closure' && setup.start && startText}
					<p class="note">
						Closure(&#123; <ClosureItem item={startText} /> &#125;): the start state of the parsing DFA.
					</p>
				{/if}
			</div>
		{:else if setup?.kind === 'transition'}
			<div class="transition-pick">
				<Select
					label="State"
					inline
					options={stateOptions}
					value={setup.from}
					onchange={(v) => {
						onpick?.(v, '');
						onedit?.();
					}}
				/>
				{#if symbolOptions.length > 0 && setup.symbol !== null}
					<Select
						label="y"
						inline
						options={symbolOptions}
						value={setup.symbol}
						onchange={(v) => {
							onpick?.(setup.from, v);
							onedit?.();
						}}
					/>
					<p class="result mono">
						Transition({setup.from}, {setup.symbol}) = state {setup.to}
					</p>
				{:else}
					<p class="note">State {setup.from} has no transitions: no item has • before a symbol.</p>
				{/if}
				{#if stale}<Updating />{/if}
			</div>
		{/if}
	</div>

	{#if !setup}
		<p class="note">
			{mode === 'closure'
				? 'The stepper runs once the grammar has no errors.'
				: 'The transitions appear once the automaton is built.'}
		</p>
	{:else if !run}
		<p class="note">
			{setup.kind === 'closure'
				? 'Write the items to close as the slides write them, e.g. E → E + ( •E ), +'
				: 'Pick a state with a transition.'}
		</p>
	{:else}
		<div class={['body', { 'stale-data': stale && setup.kind === 'transition' }]}>
			<div class="code-col">
				{#if setup.kind === 'transition'}
					<Pseudocode
						lines={TRANSITION_CODE}
						active={transitionActive}
						outer={transitionOuter}
						label="Transition, Bottom-up Parsing III, slide 13"
					/>
				{/if}
				<Pseudocode
					lines={CLOSURE_CODE}
					active={closureActive}
					label="Closure, Bottom-up Parsing III, slide 10"
				/>
				{#if frame && aug && frame.at.code === 'closure' && frame.current !== null}
					{@const item = run.items[frame.current]}
					<dl class="values">
						<dt>[X → α<span class="dot">•</span>Yβ, a]</dt>
						<dd><ClosureItem item={itemView(aug, item)} brackets /></dd>
						{#if frame.production !== null}
							<dt>Y → γ</dt>
							<dd class="mono">{printProduction(aug.productions[frame.production])}</dd>
						{/if}
						{#if frame.first}
							<dt>First(βa)</dt>
							<dd class="mono">{printSet(frame.first)}</dd>
						{/if}
						{#if frame.add}
							<dt>add [Y → <span class="dot">•</span>γ, b]</dt>
							<dd>
								<ClosureItem item={itemView(aug, frame.add.item)} brackets />
								<span class="added">{frame.add.added ? 'new' : 'already in Items'}</span>
							</dd>
						{/if}
					</dl>
				{/if}
			</div>
			<div class="lists">
				{#if setup.kind === 'transition'}
					<section>
						<h3>State {setup.from}</h3>
						<ItemList lines={stateLines} label="Items of state {setup.from}" />
					</section>
				{/if}
				<section>
					<h3>Items <span>{itemsNow.length}</span></h3>
					<ItemList lines={fullLines} label="Items, one per line" />
				</section>
				<section>
					<h3>Abbreviated <span>{shortLines.length}</span></h3>
					<ItemList lines={shortLines} label="Items with merged lookaheads" />
				</section>
			</div>
		</div>
		<StepControls {stepper} ariaLabel="Closure steps">
			{#snippet label()}
				<p class="caption">{caption}</p>
			{/snippet}
		</StepControls>
	{/if}
</div>

<style>
	.closure {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.seed {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 44rem;
	}
	.seed-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.transition-pick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.result {
		margin: 0;
		font-size: var(--text-sm);
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		min-width: 0;
	}
	@media (min-width: 900px) {
		.body {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
		}
	}
	.code-col,
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	@media (min-width: 640px) {
		.lists {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			align-items: start;
		}
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	h3 {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	h3 span {
		color: var(--text-3);
		font-weight: 400;
	}
	.values {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 2px var(--space-3);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}
	.values dt {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.values dd {
		margin: 0;
		white-space: nowrap;
	}
	.dot {
		color: var(--reject);
		font-weight: 700;
	}
	.added {
		margin-left: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.caption {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
