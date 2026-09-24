<!--
	Slide 8 drawn step by step: "Given machine M and language L" → "Want this",
	then rows 1) and 2), each a compiler run through a translator "=" a result.
	Rows still to come are drawn faintly in place, so the figure does not jump.
-->
<script lang="ts">
	import { bootstrapFigure, FIGURE_TEXT_SIZE, WANT, type WalkStep } from './walkthrough';
	import { describeT, formatT } from './model';
	import TShape from './TShape.svelte';

	interface Props {
		step: WalkStep;
	}

	let { step }: Props = $props();

	const uid = $props.id();
	const fig = bootstrapFigure();
	const PAD = { left: 6, top: 16, right: 16, bottom: 8 };
	const vw = fig.width + PAD.left + PAD.right;
	const vh = fig.height + PAD.top + PAD.bottom;

	const label = $derived.by(() => {
		const parts = [`Given machine M and language L, want ${formatT(WANT)}.`];
		fig.rows.forEach((r, i) => {
			const phase = step.rows[i];
			if (phase === 'hidden') return;
			const head = `${r.label} Compiler ${describeT(r.row.program)} run through ${describeT(r.row.translator)}`;
			parts.push(phase === 'result' ? `${head} = ${formatT(r.row.result)}.` : `${head}.`);
		});
		if (step.goalMet) parts.push('The goal is reached.');
		return parts.join(' ');
	});
</script>

<svg
	class="figure"
	viewBox="{-PAD.left} {-PAD.top} {vw} {vh}"
	style="max-width: {Math.round(vw * 1.25)}px"
	role="img"
	aria-label={label}
>
	<defs>
		<marker
			id="{uid}-tip"
			viewBox="0 0 10 10"
			refX="9"
			refY="5"
			markerWidth="7"
			markerHeight="7"
			orient="auto-start-reverse"
		>
			<path class="tip" d="M0 0L10 5L0 10z" />
		</marker>
	</defs>

	<text class="given" x={fig.given.x} y={fig.given.y} font-size={FIGURE_TEXT_SIZE}
		>{fig.given.lines[0]}</text
	>
	<text
		class="given"
		x={fig.given.x}
		y={fig.given.y + fig.given.lineHeight}
		font-size={FIGURE_TEXT_SIZE}>{fig.given.lines[1]}</text
	>
	<line
		class="want"
		x1={fig.arrow.x1}
		y1={fig.arrow.y}
		x2={fig.arrow.x2}
		y2={fig.arrow.y}
		marker-end="url(#{uid}-tip)"
	/>
	<text class="want-label" x={fig.arrow.label.x} y={fig.arrow.label.y}>Want this</text>
	<TShape
		t={WANT}
		geom={fig.goal.geom}
		x={fig.goal.pos.x}
		y={fig.goal.pos.y}
		tone={step.goalMet ? 'accept' : 'plain'}
	/>
	<g class={['check', { shown: step.goalMet }]} aria-hidden="true">
		<circle cx={fig.goal.pos.x + fig.goal.geom.width} cy={fig.goal.pos.y} r="10" />
		<path
			d="M{fig.goal.pos.x + fig.goal.geom.width - 4.5} {fig.goal.pos.y}l3 3 6-6.5"
			transform="translate(0 0.5)"
		/>
	</g>

	{#each fig.rows as r, i (r.label)}
		{@const phase = step.rows[i]}
		{@const focus = step.focus?.row === i ? step.focus.part : null}
		{@const lay = r.layout}
		<g class={['row', { hidden: phase === 'hidden' }]}>
			<text class="row-label" x={r.labelAt.x} y={r.labelAt.y}>{r.label}</text>
			<TShape
				t={r.row.translator}
				geom={r.geoms.translator}
				x={lay.translator.x}
				y={lay.translator.y}
				marks={focus === 'meet' ? { leftArm: 'active' } : {}}
			/>
			<TShape
				t={r.row.program}
				geom={r.geoms.program}
				x={lay.program.x}
				y={lay.program.y}
				marks={focus === 'meet' ? { stem: 'active' } : {}}
			/>
			{#if lay.equals && lay.result}
				<g class={['row-result', { hidden: phase !== 'result' }]}>
					<text class="equals" x={lay.equals.x} y={lay.equals.y} dy="0.34em">=</text>
					<TShape
						t={r.row.result}
						geom={r.geoms.result}
						x={lay.result.x}
						y={lay.result.y}
						tone={step.goalMet && i === fig.rows.length - 1 ? 'accept' : 'plain'}
						marks={focus === 'result' ? { stem: 'active' } : {}}
					/>
				</g>
			{/if}
		</g>
	{/each}
</svg>

<style>
	.figure {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
		overflow: visible;
	}
	.given {
		fill: var(--text);
		font-family: var(--font-sans);
	}
	.want {
		stroke: var(--text);
		stroke-width: 1.8;
	}
	.tip {
		fill: var(--text);
	}
	.want-label {
		fill: var(--text-2);
		font-family: var(--font-sans);
		font-size: 14px;
		text-anchor: middle;
	}
	.row-label {
		fill: var(--text);
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 500;
	}
	.equals {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 22px;
		text-anchor: middle;
	}
	.row,
	.row-result {
		transition: opacity 220ms var(--ease);
	}
	/* Steps still to come stay faintly in place. */
	.hidden {
		opacity: 0.1;
	}
	.row.hidden .row-result.hidden {
		opacity: 1;
	}
	.check {
		opacity: 0;
		transition: opacity 220ms var(--ease);
	}
	.check.shown {
		opacity: 1;
	}
	.check circle {
		fill: var(--accept);
	}
	.check path {
		fill: none;
		stroke: var(--surface);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
