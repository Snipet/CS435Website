<!--
	The derivation builder: the current sentential form with its non-terminals
	as buttons, the productions of the chosen one, the chain of forms so far and
	the parse tree the derivation defines.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { DerivationChain, ParseTreeView } from '$lib/components/grammar';
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { treeFromDerivation, type Grammar, type Production } from '$lib/theory/grammar';
	import {
		abridgeChain,
		allowedPositions,
		bothDerivations,
		chainOf,
		currentForm,
		describeLastStep,
		frontier,
		freshPaths,
		kindLabel,
		lastStepText,
		productionsOf,
		replay,
		selectedPosition,
		stepCount,
		type AbridgedChain,
		type ChainView,
		type PickedPosition
	} from './builder';
	import { PLAIN, type Spelling } from './spelling';
	import { MAX_STEPS, type ReplaceOrder, type StepPair } from './state';

	interface Props {
		grammar: Grammar;
		/** How the symbols are written: as the grammar text writes them. */
		write?: Spelling;
		/** The derivation, as saved steps. */
		steps: StepPair[];
		order: ReplaceOrder;
		/** Show the leftmost / rightmost derivation of the finished tree. */
		lm: boolean;
		rm: boolean;
	}

	let {
		grammar,
		write = PLAIN,
		steps = $bindable(),
		order = $bindable(),
		lm = $bindable(),
		rm = $bindable()
	}: Props = $props();

	const ORDERS: { value: ReplaceOrder; label: string; title: string }[] = [
		{ value: 'any', label: 'any non-terminal', title: 'A step may replace any non-terminal' },
		{
			value: 'leftmost',
			label: 'leftmost',
			title: 'Every step replaces the leftmost non-terminal'
		},
		{
			value: 'rightmost',
			label: 'rightmost',
			title: 'Every step replaces the rightmost non-terminal'
		}
	];

	const built = $derived(replay(grammar, steps));
	const derivation = $derived(built.derivation);
	const count = $derived(derivation.steps.length);
	const form = $derived(currentForm(derivation));
	const isNonterminal = $derived(new Set(grammar.nonterminals));
	const allowed = $derived(allowedPositions(grammar, form, order));
	const complete = $derived(!form.some((symbol) => isNonterminal.has(symbol)));
	const full = $derived(count >= MAX_STEPS);

	/**
	 * The position the user chose, with the form it was chosen in: the choice
	 * holds for that form only, so a step, an undo and a derivation or grammar
	 * that comes from outside (a preset, a link, the Membership panel, an edit)
	 * all end it. Raw, because the form is compared by identity.
	 */
	let picked = $state.raw<PickedPosition | null>(null);
	/** The position whose productions are listed: the chosen one, or the only one allowed. */
	const selected = $derived(selectedPosition(picked, form, allowed));
	const options = $derived(selected === null ? [] : productionsOf(grammar, form[selected]));

	/** A long chain is written without its first steps unless all steps are asked for. */
	let allSteps = $state(false);
	const shownChain = (short: AbridgedChain, whole: ChainView): ChainView =>
		allSteps && short.omitted > 0 ? whole : short;

	const fullChain = $derived(chainOf(grammar, derivation, write));
	const shortChain = $derived(abridgeChain(fullChain));
	const chain = $derived(shownChain(shortChain, fullChain));
	const kind = $derived(kindLabel(grammar, derivation));
	const tree = $derived(treeFromDerivation(grammar, derivation));
	// Kept apart from `highlight`: choosing a non-terminal does not walk the tree again.
	const fresh = $derived(freshPaths(grammar, derivation));
	const leaves = $derived(frontier(tree));
	const highlight = $derived({ fresh, current: selected === null ? [] : [leaves[selected]] });
	const lastStep = $derived(lastStepText(grammar, derivation, write));
	/** Read out after each step. */
	const spoken = $derived(describeLastStep(grammar, derivation, write));

	const both = $derived(complete && count > 0 ? bothDerivations(grammar, derivation) : null);
	const fullLeftmost = $derived(both && lm ? chainOf(grammar, both.leftmost, write) : null);
	const fullRightmost = $derived(both && rm ? chainOf(grammar, both.rightmost, write) : null);
	const shortLeftmost = $derived(fullLeftmost && abridgeChain(fullLeftmost));
	const shortRightmost = $derived(fullRightmost && abridgeChain(fullRightmost));
	const leftmost = $derived(
		fullLeftmost && shortLeftmost ? shownChain(shortLeftmost, fullLeftmost) : null
	);
	const rightmost = $derived(
		fullRightmost && shortRightmost ? shownChain(shortRightmost, fullRightmost) : null
	);
	/** One of the two derivations of the finished tree is too long to write out. */
	const bothLong = $derived(
		(shortLeftmost?.omitted ?? 0) > 0 || (shortRightmost?.omitted ?? 0) > 0
	);

	let root: HTMLDivElement | undefined = $state();

	/** After a step: the productions of the next non-terminal, or the non-terminals to choose from. */
	async function refocus() {
		await tick();
		const next =
			root?.querySelector<HTMLElement>('.production') ??
			root?.querySelector<HTMLElement>('.symbol.nt:not(:disabled)') ??
			root?.querySelector<HTMLElement>('.undo');
		next?.focus();
	}

	function choose(position: number) {
		picked = { at: position, form };
		void refocus();
	}

	function apply(p: Production) {
		if (selected === null || full) return;
		steps = [...built.pairs, [selected, p.id]];
		picked = null;
		void refocus();
	}

	function undo() {
		// Read before `steps` changes: `count` follows it at once.
		const left = count - 1;
		if (left < 0) return;
		steps = built.pairs.slice(0, -1);
		picked = null;
		// The button is disabled once no step is left, and would drop the focus.
		if (left === 0) void refocus();
	}

	function reset() {
		steps = [];
		picked = null;
		void refocus();
	}
</script>

{#snippet allStepsButton()}
	<Button size="sm" aria-pressed={allSteps} onclick={() => (allSteps = !allSteps)}>
		Write out all steps
	</Button>
{/snippet}

<div class="builder" bind:this={root}>
	<Panel title="Derivation" subtitle={stepCount(derivation)}>
		{#snippet actions()}
			<Button size="sm" class="undo" onclick={undo} disabled={count === 0}>
				{#snippet icon()}<Icon name="undo" size={15} />{/snippet}
				Undo
			</Button>
			<Button size="sm" onclick={reset} disabled={count === 0}>
				{#snippet icon()}<Icon name="reset" size={15} />{/snippet}
				Reset
			</Button>
		{/snippet}

		<div class="work">
			<SegmentedControl
				label="Replace"
				showLabel
				size="sm"
				options={ORDERS}
				bind:value={order}
				onchange={() => (picked = null)}
			/>

			<section class="block" aria-label="Sentential form">
				<h3 class="cap">Sentential form</h3>
				<div class="form" role="group" aria-label="Sentential form: {write.symbols(form)}">
					{#each form as symbol, i (i)}
						{#if isNonterminal.has(symbol)}
							<button
								type="button"
								class={['symbol', 'nt', { chosen: selected === i }]}
								aria-pressed={selected === i}
								aria-label="{write.symbol(symbol)}, symbol {i + 1} of {form.length}: replace"
								disabled={!allowed.includes(i)}
								onclick={() => choose(i)}>{write.symbol(symbol)}</button
							>
						{:else}
							<span class="symbol t">{write.symbol(symbol)}</span>
						{/if}
					{:else}
						<span class="symbol eps">ε</span>
					{/each}
				</div>
				<p class="last" aria-hidden="true">{lastStep}</p>
				<p class="visually-hidden" aria-live="polite">{spoken}</p>
			</section>

			<section class="block" aria-label="Productions">
				{#if complete}
					<Callout tone="success">
						<span class="formal">{write.symbols(form)}</span> is a sentence: the form has only terminals,
						so it is in L(G).
					</Callout>
				{:else if full}
					<Callout tone="warn">The builder keeps up to {MAX_STEPS} steps.</Callout>
				{:else if selected === null}
					<h3 class="cap">Productions</h3>
					<p class="hint">Choose a non-terminal of the sentential form to list its productions.</p>
				{:else}
					<h3 class="cap">
						Replace <span class="formal nt-name">{write.symbol(form[selected])}</span>
						{#if form.length > 1}<span class="where">(symbol {selected + 1})</span>{/if} by
					</h3>
					<ul class="productions">
						{#each options as p (p.id)}
							<li>
								<button type="button" class="production" onclick={() => apply(p)}>
									<span class="number">{p.id + 1}</span>
									<span class="rule"
										><span class="nt-name">{write.symbol(p.lhs)}</span>
										<span class="arrow">→</span>
										{write.symbols(p.rhs)}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if built.dropped > 0}
				<Callout tone="info">
					{built.dropped === 1 ? 'One saved step does' : `${built.dropped} saved steps do`} not apply
					to this grammar and {built.dropped === 1 ? 'is' : 'are'} left out.
				</Callout>
			{/if}

			<section class="block" aria-label="Derivation so far">
				<h3 class="cap">
					Derivation
					{#if kind}<span class="kind">{kind}</span>{/if}
				</h3>
				<DerivationChain
					forms={chain.forms}
					steps={chain.steps}
					nonterminals={chain.nonterminals}
					current={chain.forms.length - 1}
					ariaLabel="Derivation so far"
				/>
				{#if shortChain.omitted > 0}
					<p class="abridged">
						{#if !allSteps}
							<span>The last {count - shortChain.omitted} of {count} steps are written out.</span>
						{/if}
						{@render allStepsButton()}
					</p>
				{/if}
			</section>
		</div>

		{#snippet footer()}
			<div class="both">
				<div class="both-head">
					<span class="both-label">Derivations of the finished tree</span>
					<div class="both-buttons">
						<Button size="sm" aria-pressed={lm} disabled={!both} onclick={() => (lm = !lm)}
							>Leftmost derivation</Button
						>
						<Button size="sm" aria-pressed={rm} disabled={!both} onclick={() => (rm = !rm)}
							>Rightmost derivation</Button
						>
					</div>
				</div>
				{#if !both}
					<p class="hint">Available once the sentential form has only terminals.</p>
				{:else if leftmost || rightmost}
					<div class={['both-grid', { two: leftmost && rightmost }]}>
						{#if leftmost}
							<section aria-label="Leftmost derivation">
								<h4 class="cap">Leftmost derivation</h4>
								<DerivationChain
									forms={leftmost.forms}
									steps={leftmost.steps}
									nonterminals={leftmost.nonterminals}
									ariaLabel="Leftmost derivation"
								/>
							</section>
						{/if}
						{#if rightmost}
							<section aria-label="Rightmost derivation">
								<h4 class="cap">Rightmost derivation</h4>
								<DerivationChain
									forms={rightmost.forms}
									steps={rightmost.steps}
									nonterminals={rightmost.nonterminals}
									ariaLabel="Rightmost derivation"
								/>
							</section>
						{/if}
					</div>
					{#if leftmost && rightmost}
						<p class="same">Both derivations define the same parse tree.</p>
					{/if}
					{#if bothLong}
						<p class="abridged">
							{#if !allSteps}
								<span>A derivation this long is written without its first steps.</span>
							{/if}
							{@render allStepsButton()}
						</p>
					{/if}
				{/if}
			</div>
		{/snippet}
	</Panel>

	<Panel title="Parse tree">
		<div class="tree">
			<ParseTreeView {tree} {highlight} ariaLabel="Parse tree of the derivation" />
		</div>
		<ul class="legend" aria-label="Legend">
			<li><span class="swatch fresh" aria-hidden="true"></span>Added by the last step</li>
			<li><span class="swatch current" aria-hidden="true"></span>Non-terminal to replace</li>
		</ul>
	</Panel>
</div>

<style>
	.builder {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.builder {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
			align-items: start;
		}
	}
	.work {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.cap {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.5;
		text-transform: uppercase;
	}
	.cap .formal,
	.cap .where,
	.kind {
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}
	.cap .formal {
		font-size: 0.875rem;
	}
	.kind,
	.cap .where {
		color: var(--text-3);
	}
	.formal {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.nt-name {
		color: var(--syn-name);
	}

	.form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 0.5ch;
		min-height: 2.75rem;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 1.1875rem;
		font-variant-ligatures: none;
		line-height: 1.3;
	}
	.symbol {
		min-width: 0;
		padding: 2px 3px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.symbol.eps {
		color: var(--syn-special);
	}
	button.symbol {
		margin: 0;
		padding: 2px 8px;
		border: 1px solid color-mix(in srgb, var(--syn-name) 45%, transparent);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--syn-name);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	button.symbol:hover:not(:disabled) {
		border-color: var(--syn-name);
		background: color-mix(in srgb, var(--syn-name) 10%, var(--surface));
	}
	button.symbol.chosen {
		border-color: var(--active);
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	button.symbol:disabled {
		padding: 2px 3px;
		border-color: transparent;
		background: none;
		font-weight: 400;
		cursor: default;
	}
	.last {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.abridged {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin: var(--space-1) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}

	.productions {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.production {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		width: 100%;
		min-height: 36px;
		padding: 6px 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		text-align: left;
		cursor: pointer;
		box-shadow: var(--shadow-sm);
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.production:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.production .number {
		flex: none;
		color: var(--text-3);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}
	.production .rule {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.arrow {
		color: var(--text-3);
	}

	.both {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.both-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
	}
	.both-label {
		color: var(--text-2);
		font-weight: 500;
	}
	.both-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.both-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-5);
	}
	.both-grid section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	@media (min-width: 640px) {
		.both-grid.two {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.same {
		margin: 0;
		color: var(--text);
		font-weight: 500;
	}

	.tree {
		min-width: 0;
		min-height: 9rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-5);
		margin: var(--space-3) 0 0;
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
		width: 18px;
		height: 14px;
		border-radius: 3px;
	}
	.swatch.fresh {
		background: var(--info-soft);
		box-shadow: inset 0 -2px 0 var(--info);
	}
	.swatch.current {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
</style>
