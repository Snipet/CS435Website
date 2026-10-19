<!--
	The grammar classes of Bottom-up Parsing III, slide 26: unambiguous and
	ambiguous grammars side by side; among the unambiguous ones the nested
	LR(k) ⊃ LR(1) ⊃ LALR(1) ⊃ SLR ⊃ LR(0), crossed by the tall LL(k) ⊃ LL(1) ⊃
	LL(0), each inside the LR class of the same k. `highlight` marks where a
	grammar falls (grammar-classes.ts).
-->
<script lang="ts">
	import {
		AMBIGUOUS_X,
		LL0_REGION,
		LL_REGIONS,
		LR_REGIONS,
		MARKER_RADIUS,
		classPoint,
		cornerRadius,
		placeText,
		type GrammarPlace
	} from './grammar-classes';

	interface Props {
		/** Where a grammar falls: a marker is drawn there and named in the description. */
		highlight?: GrammarPlace | null;
	}

	let { highlight = null }: Props = $props();

	const point = $derived(highlight ? classPoint(highlight) : null);

	const description =
		'Grammar classes. Grammars are unambiguous or ambiguous. Among the unambiguous grammars, ' +
		'LR(k) contains LR(1), which contains LALR(1), which contains SLR, which contains LR(0). ' +
		'LL(k) lies inside LR(k), LL(1) inside LR(1) and LL(0) inside LR(0); LL(k) and LL(1) cross ' +
		'the borders of the LR classes in between. The ambiguous grammars are in none of these classes.';
	const label = $derived(
		point && highlight ? `${description} ${placeText(highlight)}` : description
	);
</script>

<div class="classes">
	<svg viewBox="0 0 640 460" role="img" aria-label={label}>
		<rect class="outer" x="6" y="6" width="628" height="448" rx="44" />
		<line class="outer" x1={AMBIGUOUS_X} y1="6" x2={AMBIGUOUS_X} y2="454" />
		<text class="title" x="240" y="36">Unambiguous Grammars</text>
		<text class="title" x="554" y="36">Ambiguous</text>
		<text class="title" x="554" y="58">Grammars</text>
		{#each LR_REGIONS as r (r.label)}
			<rect
				class="lr"
				x={r.x}
				y={r.y}
				width={r.width}
				height={r.height}
				rx={cornerRadius(r, false)}
			/>
		{/each}
		{#each LL_REGIONS as r (r.label)}
			<rect
				class="ll"
				x={r.x}
				y={r.y}
				width={r.width}
				height={r.height}
				rx={cornerRadius(r, true)}
			/>
		{/each}
		<ellipse
			class="ll"
			cx={LL0_REGION.cx}
			cy={LL0_REGION.cy}
			rx={LL0_REGION.rx}
			ry={LL0_REGION.ry}
		/>
		{#each LR_REGIONS as r (r.label)}
			<text class="name lr-name" x={r.lx} y={r.ly}>{r.label}</text>
		{/each}
		{#each LL_REGIONS as r (r.label)}
			<text class="name ll-name" x={r.lx} y={r.ly}>{r.label}</text>
		{/each}
		<text class="name ll-name" x={LL0_REGION.cx} y={LL0_REGION.cy + 5}>{LL0_REGION.label}</text>
		{#if point?.x2 !== undefined}
			<!-- Not decided: a bar across the LL(k) border, a dot at either end. -->
			<g class="marker">
				<rect
					class="halo undecided"
					x={point.x - MARKER_RADIUS}
					y={point.y - MARKER_RADIUS}
					width={point.x2 - point.x + 2 * MARKER_RADIUS}
					height={2 * MARKER_RADIUS}
					rx={MARKER_RADIUS}
				/>
				<line class="bar" x1={point.x} y1={point.y} x2={point.x2} y2={point.y} />
				<circle class="dot" cx={point.x} cy={point.y} r="4.5" />
				<circle class="dot" cx={point.x2} cy={point.y} r="4.5" />
			</g>
		{:else if point}
			<g class="marker">
				<circle class="halo" cx={point.x} cy={point.y} r={MARKER_RADIUS} />
				<circle class="dot" cx={point.x} cy={point.y} r="4.5" />
			</g>
		{/if}
	</svg>
</div>

<style>
	/* The drawing scales with its box; in a narrow box the labels are drawn larger. */
	.classes {
		max-width: 100%;
		container-type: inline-size;
	}
	svg {
		display: block;
		width: 100%;
		max-width: 640px;
		height: auto;
		margin-inline: auto;
	}
	rect,
	ellipse,
	line {
		fill: none;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.outer {
		stroke: var(--text-2);
	}
	.lr {
		stroke: var(--state-stroke);
	}
	.ll {
		stroke: var(--accent);
		stroke-width: 2;
	}
	text {
		font-size: 15px;
		text-anchor: middle;
	}
	.title {
		fill: var(--text-2);
		font-family: var(--font-sans);
		font-size: 16px;
	}
	.name {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.lr-name {
		fill: var(--text);
	}
	.ll-name {
		fill: var(--accent);
		font-weight: 600;
	}
	@container (max-width: 480px) {
		text {
			font-size: 18px;
		}
		.title {
			font-size: 20px;
		}
	}
	.halo {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 1.5;
	}
	.halo.undecided {
		stroke-dasharray: 4 3;
	}
	.bar {
		stroke: var(--active);
		stroke-width: 2;
	}
	.dot {
		fill: var(--active);
	}
</style>
