<script lang="ts">
	import type { OutputChunk } from './runtime';
	import { outputRuns } from './view';

	interface Props {
		output: readonly OutputChunk[];
		/** Show only output written up to this step (inclusive); null shows everything. */
		upTo?: number | null;
		/** Mark the output of this step. */
		current?: number | null;
		/** Accessible name of the output area. */
		label: string;
		/** Text when there is no output. */
		empty?: string;
		/** Show the ECHO / stderr key under the output when they occur. */
		legend?: boolean;
		maxRows?: number;
	}

	let {
		output,
		upTo = null,
		current = null,
		label,
		empty = 'No output',
		legend = true,
		maxRows = 16
	}: Props = $props();

	const shown = $derived(upTo === null ? output : output.filter((c) => c.at <= upTo));
	const runs = $derived(outputRuns(shown));
	const hasEcho = $derived(shown.some((c) => c.echo));
	const hasErr = $derived(shown.some((c) => c.stream === 'stderr'));

	const NEWLINE = '\n';

	/** Echoed text split at newlines, so each echoed newline can show a ↵ mark. */
	function parts(text: string): string[] {
		return text.split(/(?<=\n)/);
	}
</script>

<div class="console-wrap">
	<!-- The output scrolls, so keyboard users need to be able to focus it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="console" role="region" aria-label={label} tabindex="0" style="--max-rows: {maxRows};">
		{#if shown.length === 0}
			<p class="empty">{empty}</p>
		{:else}
			<!-- Each run of stderr or ECHO output starts with its name for screen readers. -->
			<pre><code
					>{#each runs as run, r (r)}<span class={['run', run.stream]}
							>{#if run.label}<span class="visually-hidden run-label"
									>[{run.label}] </span>{/if}{#each run.chunks as chunk, i (i)}{#if chunk.echo}{#each parts(chunk.text) as part, k (k)}<span
											class={[
												'chunk',
												'echo',
												chunk.stream,
												{ now: current !== null && chunk.at === current }
											]}
											>{part.endsWith('\n')
												? part.slice(0, -1)
												: part}{#if part.endsWith('\n')}<span class="nl" aria-hidden="true">↵</span
												>{/if}</span
										>{#if part.endsWith('\n')}{NEWLINE}{/if}{/each}{:else}<span
										class={[
											'chunk',
											chunk.stream,
											{ now: current !== null && chunk.at === current }
										]}>{chunk.text}</span
									>{/if}{/each}</span
						>{/each}</code
				></pre>
		{/if}
	</div>
	{#if legend && (hasEcho || hasErr)}
		<ul class="legend" aria-label="Output key">
			{#if hasEcho}
				<li><span class="swatch echo" aria-hidden="true">ab</span> copied by ECHO</li>
			{/if}
			{#if hasErr}
				<li><span class="swatch stderr" aria-hidden="true">ab</span> written to stderr</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.console-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.console {
		position: relative;
		max-height: calc(var(--max-rows) * 1.6em + 2 * var(--space-3));
		overflow: auto;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.6;
		overscroll-behavior: contain;
	}
	pre {
		margin: 0;
		overflow: visible;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	code {
		font-size: inherit;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-style: italic;
	}
	.stderr {
		color: var(--reject);
	}
	/* stderr is marked by a bar at the start of each of its lines, not only by color. */
	.run.stderr,
	.swatch.stderr {
		padding-left: 0.5ch;
		border-left: 2px solid var(--reject);
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
	}
	.run-label {
		user-select: none;
	}
	.echo {
		border-radius: 2px;
		background: var(--epsilon-soft);
		box-shadow: inset 0 -1px 0 var(--epsilon);
	}
	.nl {
		color: var(--epsilon);
		font-size: 0.85em;
	}
	.now {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
	.echo.now {
		background: color-mix(in srgb, var(--active-soft) 60%, var(--epsilon-soft));
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		padding: 0 3px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.4;
	}
</style>
