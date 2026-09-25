<!--
	The composition on the bench, laid out like slide 8: the compiler being
	translated upper-left, the translator lower-right with its left arm against
	the compiler's stem, then "=" and the result. A pair that does not compose
	is drawn pulled apart, with the mismatched parts marked. Without a pair, one
	diagram is drawn with its three parts named.
-->
<script lang="ts">
	import { BENCH_METRICS, equationLayout, tGeometry } from './geometry';
	import { describeT, formatT, type Composition, type TDiagram } from './model';
	import TShape, { type MarkTone, type Region } from './TShape.svelte';

	interface Props {
		program: TDiagram | null;
		translator: TDiagram | null;
		composition: Composition | null;
		/** Drawn with its parts named when there is no pair. */
		sample: TDiagram | null;
		/** The result is the goal. */
		goalHit?: boolean;
	}

	let { program, translator, composition, sample, goalHit = false }: Props = $props();

	const M = BENCH_METRICS;

	const pair = $derived.by(() => {
		if (!program || !translator || !composition) return null;
		const pg = tGeometry(program, M);
		const tg = tGeometry(translator, M);
		const result = composition.result;
		const rg = result ? tGeometry(result, M) : null;
		const layout = equationLayout(pg, tg, rg, { snapped: composition.legal, apart: 40, gap: 20 });
		const reads = composition.checks.find((c) => c.rule === 'reads');
		const runs = composition.checks.find((c) => c.rule === 'runs');
		const meet: MarkTone | undefined = reads ? (reads.ok ? 'accept' : 'reject') : undefined;
		const programMarks: Partial<Record<Region, MarkTone>> = meet ? { stem: meet } : {};
		const translatorMarks: Partial<Record<Region, MarkTone>> = meet ? { leftArm: meet } : {};
		if (runs && !runs.ok) translatorMarks.stem = 'reject';
		return { pg, tg, rg, result, layout, programMarks, translatorMarks };
	});

	/** Room for a part's name beside the diagram. */
	const NOTE_W = 66;

	const anatomy = $derived.by(() => {
		if (pair || !sample) return null;
		const g = tGeometry(sample, M);
		const left = NOTE_W;
		return { g, left, width: left + g.width + NOTE_W, height: g.height };
	});

	const pairLabel = $derived.by(() => {
		if (!program || !translator || !composition) return '';
		const head = `Compiler ${describeT(program)}, run through translator ${describeT(translator)}`;
		return composition.result
			? `${head}, gives ${formatT(composition.result)}.`
			: `${head}: does not compose.`;
	});

	const PAD = 10;
</script>

{#if pair}
	{@const { layout } = pair}
	<svg
		class="figure"
		viewBox="{-PAD} {-PAD} {layout.width + 2 * PAD} {layout.height + 2 * PAD}"
		style="max-width: {layout.width + 2 * PAD}px"
		role="img"
		aria-label={pairLabel}
	>
		<TShape
			t={translator!}
			geom={pair.tg}
			x={layout.translator.x}
			y={layout.translator.y}
			marks={pair.translatorMarks}
		/>
		<TShape
			t={program!}
			geom={pair.pg}
			x={layout.program.x}
			y={layout.program.y}
			marks={pair.programMarks}
		/>
		{#if pair.result && pair.rg && layout.result && layout.equals}
			<text class="equals" x={layout.equals.x} y={layout.equals.y} dy="0.34em">=</text>
			<TShape
				t={pair.result}
				geom={pair.rg}
				x={layout.result.x}
				y={layout.result.y}
				tone={goalHit ? 'accept' : 'plain'}
				marks={{ stem: 'active' }}
			/>
		{/if}
	</svg>
{:else if anatomy}
	{@const { g, left } = anatomy}
	{@const mid = g.unit / 2}
	{@const stemMid = g.unit * 1.5}
	<svg
		class="figure"
		viewBox="{-PAD} {-PAD} {anatomy.width + 2 * PAD} {anatomy.height + 2 * PAD}"
		style="max-width: {anatomy.width + 2 * PAD}px"
		role="img"
		aria-label="T-diagram of a compiler {describeT(
			sample!
		)}: source at the top-left, target at the top-right, host in the stem."
	>
		<text class="note" x={left - 14} y={mid} dy="0.34em" text-anchor="end">source</text>
		<line class="leader" x1={left - 10} y1={mid} x2={left - 3} y2={mid} />
		<line class="leader" x1={left + g.width + 3} y1={mid} x2={left + g.width + 10} y2={mid} />
		<text class="note" x={left + g.width + 14} y={mid} dy="0.34em">target</text>
		<line
			class="leader"
			x1={left + g.stemX + g.stemW + 3}
			y1={stemMid}
			x2={left + g.stemX + g.stemW + 10}
			y2={stemMid}
		/>
		<text class="note" x={left + g.stemX + g.stemW + 14} y={stemMid} dy="0.34em">host</text>
		<TShape t={sample!} geom={g} x={left} />
	</svg>
{/if}

<style>
	.figure {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
		overflow: visible;
	}
	.equals {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 22px;
		text-anchor: middle;
	}
	.note {
		fill: var(--text-3);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.leader {
		stroke: var(--border-strong);
		stroke-width: 1;
	}
</style>
