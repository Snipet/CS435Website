<!--
	The grammar as the four-tuple of Introduction to Parsing, slide 14: the sets N
	and T, the start symbol S, and the productions P as a numbered list.
-->
<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
	import { REGULAR_FORM, type TupleView } from './tuple';

	interface Props {
		tuple: TupleView;
		/** Mark the productions that do not have the type 3 form. */
		mark?: boolean;
	}

	let { tuple, mark = false }: Props = $props();

	const count = $derived(tuple.productions.length);
	/**
	 * The list reads down its columns. A short list is one column; a longer one
	 * gets as many as its longest production leaves room for.
	 */
	const columns = $derived.by(() => {
		if (count <= 6) return 1;
		const longest = Math.max(...tuple.productions.map((p) => [...p.lhs, ...p.rhs].length + 3));
		return longest <= 14 ? 3 : longest <= 26 ? 2 : 1;
	});
	const rows = $derived(Math.ceil(count / columns));

	// A long list scrolls inside its own box; the box then takes keyboard focus
	// so it can be scrolled without a mouse.
	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);
	$effect(() => {
		const el = box;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const check = () => (scrolls = el.scrollHeight > el.clientHeight + 1);
		const observer = new ResizeObserver(check);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		check();
		return () => observer.disconnect();
	});
</script>

<div class="four-tuple">
	<dl class="parts">
		<div class="part">
			<dt><span class="letter">N</span><span class="what">non-terminals</span></dt>
			<dd><span class="eq">=</span> {tuple.nonterminals}</dd>
		</div>
		<div class="part">
			<dt><span class="letter">T</span><span class="what">terminals</span></dt>
			<dd><span class="eq">=</span> {tuple.terminals}</dd>
		</div>
		<div class="part">
			<dt><span class="letter">S</span><span class="what">start symbol</span></dt>
			<dd><span class="eq">=</span> {tuple.start}</dd>
		</div>
		<div class="part">
			<dt>
				<span class="letter">P</span><span class="what"
					>{count} {count === 1 ? 'production' : 'productions'}</span
				>
			</dt>
			<dd>
				<!-- A box that scrolls must be reachable from the keyboard. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					bind:this={box}
					class="list"
					role={scrolls ? 'group' : undefined}
					aria-label={scrolls ? 'Productions, scrolls' : undefined}
					tabindex={scrolls ? 0 : undefined}
				>
					<ol class="productions" style="--rows: {rows}; --digits: {String(count).length}">
						{#each tuple.productions as p (p.number)}
							<li class={{ breaks: mark && !p.regular }}>
								<span class="number">{p.number}.</span>
								<span class="rule"
									><span class="nt">{p.lhs}</span> <span class="arrow">→</span> {p.rhs}</span
								>
								{#if mark && !p.regular}
									<span class="dot" aria-hidden="true"></span>
									<span class="visually-hidden">not of the form {REGULAR_FORM}</span>
								{/if}
							</li>
						{/each}
					</ol>
				</div>
				{#if mark && tuple.productions.some((p) => !p.regular)}
					<p class="legend" aria-hidden="true">
						<span class="dot"></span> not of the form <span class="formal">{REGULAR_FORM}</span>
					</p>
				{/if}
			</dd>
		</div>
	</dl>

	{#each tuple.warnings as warning (warning)}
		<Callout tone="warn">{warning}</Callout>
	{/each}
</div>

<style>
	.four-tuple {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		container-type: inline-size;
	}
	.parts {
		display: flex;
		flex-direction: column;
		margin: 0;
	}
	.part {
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		align-items: baseline;
		padding: var(--space-2) 0;
		border-top: 1px solid var(--border);
	}
	.part:first-child {
		padding-top: 0;
		border-top: 0;
	}
	.part:last-child {
		padding-bottom: 0;
	}
	dt {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}
	.letter {
		font-family: var(--font-mono);
		font-size: 1.0625rem;
		font-weight: 600;
		font-variant-ligatures: none;
	}
	.what {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	dd {
		min-width: 0;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.eq {
		color: var(--text-3);
	}
	.list {
		max-height: 24rem;
		overflow-y: auto;
		border-radius: var(--radius-sm);
	}
	.productions {
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: repeat(var(--rows), auto);
		grid-auto-columns: minmax(0, 1fr);
		gap: 2px var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* A narrow panel: one column. */
	@container (max-width: 30rem) {
		.productions {
			grid-auto-flow: row;
			grid-template-rows: none;
		}
	}
	.productions li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}
	.number {
		flex: none;
		min-width: calc(var(--digits, 1) * 1ch + 1.2ch);
		color: var(--text-3);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.rule {
		min-width: 0;
	}
	.nt {
		color: var(--syn-name);
	}
	.arrow {
		color: var(--text-3);
	}
	.dot {
		display: inline-block;
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--active);
		transform: translateY(-1px);
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
	.formal {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	@container (max-width: 26rem) {
		.part {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
