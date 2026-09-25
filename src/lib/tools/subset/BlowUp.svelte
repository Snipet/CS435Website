<!--
@component
"Blow-up" tab: NFA and DFA sizes for (0 | 1)* 1 (0|1)^k (Lexical Analysis III,
slide 16 is k = 2). The DFA sizes are counted by running the subset
construction on each NFA.
-->
<script lang="ts">
	import { Button, Disclosure } from '$lib/components/ui';
	import { BLOWUP_MAX_K, BLOWUP_MIN_K, MAX_DFA_STATES, blowupRows, superscript } from './logic';

	interface Props {
		k: number;
		onkchange: (k: number) => void;
		/** Load the NFA for this k into the stepper. */
		onopen: (k: number) => void;
	}

	let { k, onkchange, onopen }: Props = $props();

	const uid = $props.id();
	const rows = blowupRows();
	const row = $derived(rows.find((r) => r.k === k) ?? rows[0]);
	const canOpen = $derived(row.dfaStates <= MAX_DFA_STATES);

	// Chart geometry in SVG units, which match CSS pixels up to 560 wide (text stays 11px on phones).
	let chartWidth = $state(560);
	const W = $derived(Math.max(280, Math.min(560, Math.round(chartWidth))));
	const H = 250;
	const M = { top: 22, right: 8, bottom: 30, left: 40 };
	const plotW = $derived(W - M.left - M.right);
	const plotH = H - M.top - M.bottom;
	const yMax = Math.max(...rows.map((r) => r.dfaStates));
	const ticks = [0, 128, 256, 384, 512].filter((t) => t <= yMax);
	const band = $derived(plotW / rows.length);
	const barW = $derived(Math.min(22, (band * 0.62) / 2));
	const y = (v: number) => M.top + plotH - (v / yMax) * plotH;

	/** A bar with 4px rounded top corners, anchored to the baseline. */
	function bar(x: number, value: number): string {
		const top = y(value);
		const h = Math.max(M.top + plotH - top, 1.5);
		const base = M.top + plotH;
		const r = Math.min(4, h / 2, barW / 2);
		const t = base - h;
		return `M${x} ${base}V${t + r}Q${x} ${t} ${x + r} ${t}H${x + barW - r}Q${x + barW} ${t} ${x + barW} ${t + r}V${base}Z`;
	}

	const groups = $derived(
		rows.map((r, i) => {
			const cx = M.left + band * i + band / 2;
			return { ...r, cx, nfaX: cx - barW - 1, dfaX: cx + 1 };
		})
	);

	function setK(v: number) {
		const next = Math.min(BLOWUP_MAX_K, Math.max(BLOWUP_MIN_K, Math.round(v)));
		if (next !== k) onkchange(next);
	}
</script>

<div class="blowup">
	<div class="controls">
		<div class="slider">
			<label for="{uid}-k"
				>k <output for="{uid}-k" class="k-value" aria-live="polite">{k}</output></label
			>
			<input
				id="{uid}-k"
				type="range"
				min={BLOWUP_MIN_K}
				max={BLOWUP_MAX_K}
				step="1"
				value={k}
				style="--fill: {((k - BLOWUP_MIN_K) / (BLOWUP_MAX_K - BLOWUP_MIN_K)) * 100}%"
				oninput={(e) => setK(e.currentTarget.valueAsNumber)}
			/>
		</div>
		<p class="formula">
			<span class="f">(0 | 1)* 1 (0|1){superscript(k)}</span>
		</p>
		<dl class="numbers">
			<div>
				<dt><span class="swatch nfa" aria-hidden="true"></span>NFA states</dt>
				<dd><span class="f">k + 2 = {row.nfaStates}</span></dd>
			</div>
			<div>
				<dt><span class="swatch dfa" aria-hidden="true"></span>DFA states</dt>
				<dd>
					<span class="f">2{superscript(k + 1)} = {row.formula}</span>
					<span class="counted"
						>{row.dfaStates === row.formula ? 'the construction finds' : 'counted:'}
						{row.dfaStates}</span
					>
				</dd>
			</div>
		</dl>
		<div class="open">
			<Button size="sm" disabled={!canOpen} onclick={() => onopen(k)}>Step through this NFA</Button>
			{#if !canOpen}
				<span class="note">Up to {MAX_DFA_STATES} DFA states can be stepped through.</span>
			{/if}
		</div>
	</div>

	<figure class="chart" bind:clientWidth={chartWidth}>
		<svg
			viewBox="0 0 {W} {H}"
			role="img"
			aria-label="Bar chart: for k = 1 to {BLOWUP_MAX_K}, NFA states grow as k + 2 (3 to {BLOWUP_MAX_K +
				2}) and DFA states as 2 to the k + 1 (4 to {2 ** (BLOWUP_MAX_K + 1)})."
		>
			{#each ticks as t (t)}
				<line class="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
				<text class="tick" x={M.left - 6} y={y(t)}>{t}</text>
			{/each}
			{#each groups as g (g.k)}
				<!-- Pointer shortcut for the k slider, which is the keyboard control. -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<g class="group" class:selected={g.k === k} onclick={() => setK(g.k)}>
					<title>k = {g.k}: NFA {g.nfaStates} states, DFA {g.dfaStates} states</title>
					<rect class="hit" x={g.cx - band / 2} y={M.top} width={band} height={plotH + M.bottom} />
					<path class="bar nfa" d={bar(g.nfaX, g.nfaStates)} />
					<path class="bar dfa" d={bar(g.dfaX, g.dfaStates)} />
					<text class="xlab" x={g.cx} y={H - 10}>{g.k}</text>
					{#if g.k === k}
						<text class="val" x={g.nfaX + barW / 2} y={y(g.nfaStates) - 6}>{g.nfaStates}</text>
						<text class="val" x={g.dfaX + barW / 2} y={y(g.dfaStates) - 6}>{g.dfaStates}</text>
					{/if}
				</g>
			{/each}
			<line class="axis" x1={M.left} x2={W - M.right} y1={M.top + plotH} y2={M.top + plotH} />
		</svg>
		<figcaption>
			<span class="legend"><span class="swatch nfa" aria-hidden="true"></span>NFA states</span>
			<span class="legend"><span class="swatch dfa" aria-hidden="true"></span>DFA states</span>
			<span class="axis-note">by k; click a pair of bars to pick k</span>
		</figcaption>
	</figure>
</div>

<Disclosure summary="Show the numbers" openSummary="Hide the numbers">
	<div class="table-wrap">
		<table class="nums">
			<thead>
				<tr>
					<th scope="col">k</th>
					<th scope="col">NFA states</th>
					<th scope="col">DFA states</th>
					<th scope="col">2<sup>k+1</sup></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.k)}
					<tr class:selected={r.k === k}>
						<th scope="row">{r.k}</th>
						<td>{r.nfaStates}</td>
						<td>{r.dfaStates}</td>
						<td>{r.formula}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Disclosure>

<style>
	.blowup {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		gap: var(--space-5) var(--space-6);
		align-items: start;
		margin-bottom: var(--space-3);
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.slider label {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.k-value {
		color: var(--accent);
		font-size: var(--text-lg);
	}
	input[type='range'] {
		width: 100%;
		max-width: 22rem;
		height: 20px;
		margin: 0;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--accent) var(--fill), var(--surface-3) var(--fill));
	}
	input[type='range']::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: var(--surface-3);
	}
	input[type='range']::-moz-range-progress {
		height: 4px;
		border-radius: 2px;
		background: var(--accent);
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -6px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--surface);
	}
	input[type='range']:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
		border-radius: 4px;
	}
	.formula {
		margin: 0;
		font-size: var(--text-lg);
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.numbers {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}
	.numbers div {
		display: grid;
		grid-template-columns: 9.5rem minmax(0, 1fr);
		align-items: baseline;
		gap: var(--space-2);
	}
	dt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	.counted,
	.note,
	.axis-note {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.open {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
	.swatch.nfa {
		background: var(--tok-0);
	}
	.swatch.dfa {
		background: var(--tok-2);
	}
	.chart {
		min-width: 0;
		margin: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.tick {
		fill: var(--text-3);
		font-family: var(--font-sans);
		font-size: 11px;
		text-anchor: end;
		dominant-baseline: central;
		font-variant-numeric: tabular-nums;
	}
	.xlab {
		fill: var(--text-2);
		font-family: var(--font-mono);
		font-size: 12px;
		text-anchor: middle;
	}
	.val {
		fill: var(--text);
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 600;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.group {
		cursor: pointer;
	}
	.group .hit {
		fill: transparent;
	}
	.group:hover .hit {
		fill: var(--surface-2);
	}
	.bar {
		opacity: 0.4;
		transition: opacity var(--duration) var(--ease);
	}
	.group:hover .bar,
	.group.selected .bar {
		opacity: 1;
	}
	.group.selected .xlab {
		fill: var(--text);
		font-weight: 700;
	}
	.bar.nfa {
		fill: var(--tok-0);
	}
	.bar.dfa {
		fill: var(--tok-2);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		margin-top: var(--space-2);
		padding-left: 40px;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.table-wrap {
		max-width: 26rem;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.nums {
		width: 100%;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.nums th,
	.nums td {
		padding: 5px 12px;
		border-bottom: 1px solid var(--border);
		text-align: right;
	}
	.nums thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.nums tbody tr:last-child > * {
		border-bottom: 0;
	}
	.nums tr.selected > * {
		background: var(--accent-soft);
	}
	@media (max-width: 860px) {
		.blowup {
			grid-template-columns: minmax(0, 1fr);
		}
		figcaption {
			padding-left: 0;
		}
	}
</style>
