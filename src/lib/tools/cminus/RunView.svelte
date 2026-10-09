<!--
	The compiled program run on the TINY Machine with the given input: what it
	printed, how the run stopped, and how many instructions it executed.
-->
<script lang="ts">
	import { Badge, Button, Callout, Icon, Updating } from '$lib/components/ui';
	import type { Compilation } from '$lib/theory/cminus';
	import { scrollRegion } from '$lib/tools/phases/scroll-region';
	import { plural, rangeOf, type SourceRange } from './selection';
	import type { RunOutput } from './tasks';
	import { stopSpan, stopView } from './views';

	interface Props {
		c: Compilation;
		/** The newest finished run; null before the first one. */
		run: RunOutput | null;
		/** A newer run is on its way: `run` is for an earlier program or input. */
		busy?: boolean;
		/** The run was abandoned because it took too long. */
		timedOut?: boolean;
		/** What went wrong with the worker, if anything. */
		error?: string | null;
		/** The input values the run is given. */
		inputs: readonly number[];
		/** Link that opens the code in the TINY Machine tool; null hides it. */
		machineHref?: string | null;
		onrun: () => void;
		onselect: (range: SourceRange) => void;
	}

	let {
		c,
		run,
		busy = false,
		timedOut = false,
		error = null,
		inputs,
		machineHref = null,
		onrun,
		onselect
	}: Props = $props();

	/** Output lines drawn; a program can print many more. */
	const SHOWN = 400;

	const stop = $derived(run ? stopView(run, inputs.length) : null);
	const where = $derived(run ? stopSpan(c, run) : null);
	const lines = $derived(run ? run.outputs.slice(0, SHOWN) : []);
	const number = (n: number) => n.toLocaleString('en-US');
</script>

<div class="cm-stack">
	<div class="cm-toolbar">
		<div class="controls">
			<Button variant="primary" onclick={onrun}>
				{#snippet icon()}<Icon name="play" size={14} />{/snippet}
				Run
			</Button>
			{#if busy && run && !timedOut && !error}<Updating label="Running…" />{/if}
		</div>
		{#if machineHref}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
			<a class="open" href={machineHref}>
				Step through it in TINY Machine <Icon name="arrow-right" size={14} />
			</a>
		{/if}
	</div>
	<p class="cm-note">
		{#if inputs.length}
			Input: <code>{inputs.slice(0, 12).join(' ')}{inputs.length > 12 ? ' …' : ''}</code>
			({plural(inputs.length, 'number')}).
		{:else}
			No input numbers.
		{/if}
		The program runs again when it or the input changes.
	</p>

	{#if timedOut}
		<Callout tone="warn">The run took too long and was stopped.</Callout>
	{:else if error}
		<Callout tone="error">The run failed: {error}</Callout>
	{/if}

	{#if run && stop}
		<div class={['result', { 'stale-data': busy }]} aria-busy={busy}>
			<section class="cm-section">
				<h3 class="cm-heading">
					Output <span class="cm-sub">{plural(run.printed, 'number')} printed</span>
				</h3>
				<div class="output" {@attach scrollRegion('Program output')}>
					{#if lines.length}
						<ol aria-label="Numbers printed, in order">
							{#each lines as value, i (i)}
								<li>{value}</li>
							{/each}
						</ol>
						{#if run.printed > lines.length}
							<p class="rest">{number(run.printed - lines.length)} more numbers are not listed.</p>
						{/if}
					{:else}
						<p class="rest">The program printed nothing.</p>
					{/if}
				</div>
			</section>

			<section class="cm-section">
				<h3 class="cm-heading">How the run stopped</h3>
				<div class="stop" role="status">
					<p class="verdict">
						<Badge tone={stop.tone}>{stop.label}</Badge>
						<span>{stop.text}</span>
					</p>
					<dl class="facts">
						<div>
							<dt>Instructions executed</dt>
							<dd>{number(run.steps)}</dd>
						</div>
						<div>
							<dt>Input numbers read</dt>
							<dd>{number(run.read)} of {number(inputs.length)}</dd>
						</div>
						{#if run.pc !== null}
							<div>
								<dt>Stopped at address</dt>
								<dd>
									{run.pc}
									{#if where}
										<button type="button" class="cm-chip" onclick={() => onselect(rangeOf(where))}
											>line {where.line}</button
										>
									{/if}
								</dd>
							</div>
						{/if}
					</dl>
				</div>
			</section>
		</div>
	{:else if !timedOut && !error}
		<p class="cm-note"><Updating standalone label="Running…" /></p>
	{/if}
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.open {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.result {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		min-width: 0;
	}
	@container cm-view (min-width: 44rem) {
		.result {
			grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr);
			align-items: start;
		}
	}
	.output {
		min-height: 4.5rem;
		max-height: min(22rem, 55vh);
		overflow: auto;
		overscroll-behavior: contain;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	.output ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rest {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-style: italic;
	}
	.stop {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-3);
		margin: 0;
		font-size: var(--text-sm);
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0;
	}
	.facts dt {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.02em;
	}
	.facts dd {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	.facts :global(.cm-chip) {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
</style>
