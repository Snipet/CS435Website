<!--
	The prefix-match matrix for one step of the scanning loop: rows R1 … Rn,
	columns the prefixes x1…xi of the remaining input, ✓ where x1…xi ∈ L(Rj).
	The chosen column is the longest match (max(i, k)); the chosen row is the
	earliest rule among those matching it (min(j, k)).
-->
<script lang="ts">
	import { ERROR_RULE } from '$lib/theory/automata';
	import { formatString } from '$lib/theory/chars';
	import { glyphFor } from '$lib/components/ui/char-stream';
	import { toneStyle } from '$lib/components/ui/tones';
	import { matrixColumns, matrixLength, prefixesAt, type LexRun } from './scan';
	import type { LexSpec } from './spec';

	interface Props {
		spec: LexSpec;
		run: LexRun;
		step: number;
		errorRule: boolean;
	}

	let { spec, run, step, errorRule }: Props = $props();

	const current = $derived(run.steps[step]);
	const token = $derived.by(() => {
		const t = run.tokenAt[step];
		return t === null || t === undefined ? null : run.tokens[t];
	});
	const errorFired = $derived(token?.rule === ERROR_RULE);
	const chosenLen = $derived(current?.length ?? (errorFired ? 1 : null));
	const chosenRow = $derived(current?.rule ?? (errorFired ? spec.rules.length : null));
	const shown = $derived(current ? matrixLength(current, errorFired) : 0);
	const prefixes = $derived(current ? prefixesAt(run.text, current, shown) : []);
	const columns = $derived(current ? matrixColumns(shown, chosenLen) : []);

	interface Row {
		index: number;
		name: string;
		re: string;
		drop: boolean;
		problem: boolean;
		tone: number | 'reject' | 'muted';
		cells: boolean[];
	}

	const rows = $derived.by((): Row[] => {
		if (!current) return [];
		const out: Row[] = spec.rules.map((r, j) => ({
			index: j,
			name: r.name,
			re: r.re,
			drop: r.drop,
			problem: r.problem !== null,
			tone: r.drop ? 'muted' : j,
			cells: current.matches[j] ?? []
		}));
		if (errorRule) {
			out.push({
				index: spec.rules.length,
				name: 'Error',
				re: 'any one character',
				drop: false,
				problem: false,
				tone: 'reject',
				cells: Array.from({ length: Math.max(1, shown) }, (_, k) => k === 0)
			});
		}
		return out;
	});

	/** Column header text: the prefix with visible whitespace, shortened when long. */
	function headText(prefix: string): string {
		const chars = [...prefix].map((c) => glyphFor(c).glyph || '·');
		return chars.length > 10 ? `…${chars.slice(-8).join('')}` : chars.join('');
	}
</script>

{#if current}
	<div class="wrap">
		<table class="matrix">
			<caption class="visually-hidden">
				Which rules match each prefix of the input from position {current.pos}. Rows are rules,
				columns are prefix lengths.
			</caption>
			<thead>
				<tr>
					<th scope="col" class="corner">
						<span class="corner-top">x<sub>1</sub>…x<sub>i</sub></span>
						<span class="corner-bottom">R<sub>j</sub></span>
					</th>
					{#each columns as col (col.kind === 'len' ? col.len : `gap${col.from}`)}
						{#if col.kind === 'gap'}
							<th class="gap" scope="col"
								><span aria-hidden="true">…</span><span class="visually-hidden"
									>lengths {col.from} to {col.to} not shown</span
								></th
							>
						{:else}
							{@const prefix = prefixes[col.len - 1] ?? ''}
							<th
								scope="col"
								class={['col', { chosen: col.len === chosenLen }]}
								title={formatString(prefix)}
							>
								<span class="len">i = {col.len}</span>
								<span class="pre" aria-hidden="true">{headText(prefix)}</span>
								<span class="visually-hidden">{formatString(prefix)}</span>
							</th>
						{/if}
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.index)}
					<tr class={{ chosen: row.index === chosenRow }} style={toneStyle(row.tone)}>
						<th scope="row" class="rule">
							<div class="rule-in">
								<span class="ri">R<sub>{row.index + 1}</sub></span>
								<span class="rn">{row.name}</span>
								<code class={['rre', { prose: row.index === spec.rules.length }]} title={row.re}
									>{row.re}</code
								>
								{#if row.drop}<span class="tag">drop</span>{/if}
								{#if row.problem}<span class="tag bad">off</span>{/if}
							</div>
						</th>
						{#each columns as col (col.kind === 'len' ? col.len : `gap${col.from}`)}
							{#if col.kind === 'gap'}
								<td class="gap"></td>
							{:else}
								{@const hit = row.cells[col.len - 1] ?? false}
								{@const win = hit && col.len === chosenLen && row.index === chosenRow}
								<td class={['cell', { hit, win, chosen: col.len === chosenLen }]}>
									{#if hit}<span class="mark" aria-hidden="true">✓</span>{/if}
									<span class="visually-hidden"
										>{win ? 'chosen match' : hit ? 'match' : 'no match'}</span
									>
								</td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="legend">
		<span
			><span class="k mark">✓</span><span>x<sub>1</sub>…x<sub>i</sub> ∈ L(R<sub>j</sub>)</span
			></span
		>
		<span><span class="k swatch col-swatch"></span><span>longest match, max(i, k)</span></span>
		<span><span class="k swatch row-swatch"></span><span>first rule listed, min(j, k)</span></span>
	</p>
{/if}

<style>
	/* Positioned, so the visually hidden labels in its cells stay inside the scroll box. */
	.wrap {
		position: relative;
		width: fit-content;
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.wrap:focus-visible {
		outline-offset: 2px;
	}
	.matrix {
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	th,
	td {
		border-bottom: 1px solid var(--border);
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	thead th {
		padding: 8px 10px;
		background: var(--surface-2);
		color: var(--text-2);
		font-weight: 500;
		vertical-align: bottom;
	}
	.corner {
		position: sticky;
		left: 0;
		z-index: 2;
		min-width: 10rem;
		text-align: left;
	}
	.corner-top,
	.corner-bottom {
		display: block;
		color: var(--text-3);
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-style: italic;
	}
	.corner-top {
		text-align: right;
	}
	.col {
		min-width: 3.25rem;
		text-align: center;
	}
	.len {
		display: block;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.pre {
		display: block;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-ligatures: none;
		white-space: pre;
	}
	thead .col.chosen {
		background: var(--accent-soft);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	thead .col.chosen .pre {
		color: var(--accent);
		font-weight: 600;
	}
	.gap {
		min-width: 1.5rem;
		color: var(--text-3);
		text-align: center;
	}
	.rule {
		position: sticky;
		left: 0;
		z-index: 1;
		padding: 7px 10px;
		background: var(--surface);
		font-weight: 400;
		text-align: left;
		box-shadow: inset -1px 0 0 var(--border);
	}
	.rule-in {
		display: grid;
		grid-template-columns: 2rem auto minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0 var(--space-2);
		max-width: 22rem;
	}
	.ri {
		color: var(--tone-fg);
		font-family: var(--font-serif);
		font-style: italic;
		font-weight: 600;
	}
	.ri sub {
		font-size: 0.72em;
		font-style: normal;
	}
	.rn {
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
	}
	.rre {
		overflow: hidden;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-3);
		font-size: 0.8125rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rre.prose {
		font-family: var(--font-sans);
		font-style: italic;
	}
	.tag {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--surface-3);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.tag.bad {
		background: var(--reject-soft);
		color: var(--reject);
	}
	.cell {
		padding: 6px 10px;
		text-align: center;
	}
	.cell.chosen {
		background: color-mix(in srgb, var(--accent-soft) 70%, transparent);
	}
	tr.chosen > .rule,
	tr.chosen > .cell {
		background: var(--active-soft);
	}
	tr.chosen > .cell.chosen {
		background: color-mix(in srgb, var(--active-soft) 55%, var(--accent-soft));
	}
	tr.chosen .rn {
		color: var(--text);
	}
	.mark {
		color: var(--accept);
		font-weight: 700;
	}
	.win .mark {
		display: inline-grid;
		place-items: center;
		width: 1.7em;
		height: 1.7em;
		border: 2px solid var(--active);
		border-radius: 50%;
		background: var(--surface);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.k.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}
	.col-swatch {
		background: var(--accent-soft);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.row-swatch {
		background: var(--active-soft);
		box-shadow: inset 2px 0 0 var(--active);
	}
	@media (max-width: 600px) {
		.corner {
			min-width: 8rem;
		}
		.rule-in {
			grid-template-columns: 1.6rem auto;
			max-width: 11rem;
		}
		.rre,
		.tag {
			grid-column: 2;
		}
	}
</style>
