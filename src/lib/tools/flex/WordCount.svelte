<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import type { HighlightRange } from '$lib/components/ui/types';
	import type { FlexRun } from './runtime';
	import type { FlexSpec } from './spec';
	import { counterBumps, wcCounts } from './wc';

	interface Props {
		run: FlexRun;
		spec: FlexSpec;
		input: string;
	}

	let { run, spec, input }: Props = $props();

	const wc = $derived(wcCounts(input));
	const cols = $derived([
		{ label: 'Lines', word: 'lines', name: 'nl', spec: run.watch?.nl ?? 0, wc: wc.lines },
		{ label: 'Words', word: 'words', name: 'wd', spec: run.watch?.wd ?? 0, wc: wc.words },
		{ label: 'Chars', word: 'characters', name: 'ch', spec: run.watch?.ch ?? 0, wc: wc.chars }
	]);
	const differs = $derived(cols.filter((c) => c.spec !== c.wc));
	const bumps = $derived(counterBumps(run, 'wd'));
	const highlights = $derived<HighlightRange[]>(
		bumps
			.filter((b) => b.step.kind !== 'eof')
			.map((b) => ({
				start: b.step.pos,
				end: Math.max(b.step.end, b.step.pos + 1),
				tone: b.step.rule ?? 'muted',
				label: `wd+${b.by}`
			}))
	);
	const byRule = $derived.by(() => {
		const counts: Record<string, { rule: number | null; n: number }> = {};
		for (const b of bumps) {
			const key = String(b.step.rule);
			counts[key] ??= { rule: b.step.rule, n: 0 };
			counts[key].n += b.by;
		}
		return Object.values(counts);
	});
	/** The character view shows at most this much of the input. */
	const SHOWN = 3000;
	const shown = $derived(input.length > SHOWN ? input.slice(0, SHOWN) : input);
	const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
</script>

<div class="wc">
	<div class="compare">
		<div class="table-wrap">
			<table>
				<caption class="visually-hidden">The spec’s counters and what wc reports</caption>
				<thead>
					<tr>
						<th scope="col"></th>
						{#each cols as c (c.name)}
							<th scope="col" class="num">
								{c.label}<span class="var">{c.name}</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row">This spec</th>
						{#each cols as c (c.name)}
							<td class={['num', { bad: c.spec !== c.wc }]}>
								{c.spec}{#if c.spec !== c.wc}<span class="visually-hidden"> (differs)</span>{/if}
							</td>
						{/each}
					</tr>
					<tr>
						<th scope="row"><span class="mono">wc</span></th>
						{#each cols as c (c.name)}<td class="num">{c.wc}</td>{/each}
					</tr>
				</tbody>
			</table>
		</div>
		<p class="verdict" aria-live="polite">
			{#if !run.ran || run.watch === null}
				<Badge>No run</Badge>
			{:else if differs.length === 0}
				<Badge tone="accept">Same as wc</Badge>
			{:else}
				<Badge tone="reject">Differs from wc</Badge>
				<span>in {differs.map((c) => c.word).join(' and ')}</span>
			{/if}
		</p>
	</div>

	<div class="where">
		<p class="label">Where <span class="mono">wd</span> goes up</p>
		{#if input.length === 0}
			<p class="muted">The input is empty.</p>
		{:else}
			<div class="stream">
				<CharStream
					text={shown}
					{highlights}
					ariaLabel="data.txt with each character that adds to wd marked"
				/>
			</div>
			{#if shown.length < input.length}
				<p class="muted">Showing the first {SHOWN.toLocaleString('en-US')} characters.</p>
			{/if}
			{#if byRule.length}
				<ul class="legend">
					{#each byRule as r (r.rule)}
						<li>
							<span class="chip" style={toneStyle(r.rule ?? 'muted')}
								>{r.rule === null ? '–' : r.rule + 1}</span
							>
							<span class="mono"
								>{r.rule === null ? 'end of input' : short(spec.rules[r.rule].patternText)}</span
							>
							<span class="muted">adds {r.n}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">No rule adds to wd for this input.</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.wc {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 900px) {
		.wc {
			grid-template-columns: minmax(0, 27rem) minmax(0, 1fr);
		}
	}
	.compare {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	table {
		width: 100%;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
		text-align: left;
	}
	thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	tbody th {
		font-weight: 500;
		white-space: nowrap;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	td.num {
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
	.bad {
		background: var(--reject-soft);
		color: var(--reject);
		font-weight: 600;
	}
	.var {
		display: block;
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.where {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.label {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.stream {
		padding: var(--space-3) var(--space-4) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		max-height: 16rem;
		overflow: auto;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.3rem;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone-fg);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.muted {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
