<!--
	The grammar classes of Bottom-up Parsing III, slide 26: unambiguous and
	ambiguous grammars side by side; among the unambiguous ones the nested
	LR(k) ⊃ LR(1) ⊃ LALR(1) ⊃ SLR ⊃ LR(0), crossed by the tall LL(k) ⊃ LL(1) ⊃
	LL(0), each inside the LR class of the same k.
-->
<script lang="ts">
	interface Region {
		label: string;
		x: number;
		y: number;
		width: number;
		height: number;
		/** Where the label stands. */
		lx: number;
		ly: number;
	}

	/** Outermost first; corners are rounded by half the smaller side for ovals. */
	const lr: Region[] = [
		{ label: 'LR(k)', x: 22, y: 54, width: 436, height: 390, lx: 352, ly: 84 },
		{ label: 'LR(1)', x: 36, y: 102, width: 408, height: 328, lx: 352, ly: 132 },
		{ label: 'LALR(1)', x: 50, y: 168, width: 380, height: 248, lx: 352, ly: 198 },
		{ label: 'SLR', x: 64, y: 222, width: 352, height: 180, lx: 352, ly: 252 },
		{ label: 'LR(0)', x: 78, y: 270, width: 300, height: 118, lx: 316, ly: 336 }
	];
	const ll: Region[] = [
		{ label: 'LL(k)', x: 104, y: 64, width: 132, height: 346, lx: 170, ly: 90 },
		{ label: 'LL(1)', x: 118, y: 112, width: 104, height: 284, lx: 170, ly: 144 }
	];
	const corner = (r: Region, ll: boolean) =>
		ll ? Math.min(r.width, r.height) / 2 : Math.min(56, r.height / 2);

	const description =
		'Grammar classes. Grammars are unambiguous or ambiguous. Among the unambiguous grammars, ' +
		'LR(k) contains LR(1), which contains LALR(1), which contains SLR, which contains LR(0). ' +
		'LL(k) lies inside LR(k), LL(1) inside LR(1) and LL(0) inside LR(0); LL(k) and LL(1) cross ' +
		'the borders of the LR classes in between. The ambiguous grammars are in none of these classes.';
</script>

<div class="classes">
	<svg viewBox="0 0 640 460" role="img" aria-label={description}>
		<rect class="outer" x="6" y="6" width="628" height="448" rx="44" />
		<line class="outer" x1="474" y1="6" x2="474" y2="454" />
		<text class="title" x="240" y="36">Unambiguous Grammars</text>
		<text class="title" x="554" y="36">Ambiguous</text>
		<text class="title" x="554" y="58">Grammars</text>
		{#each lr as r (r.label)}
			<rect class="lr" x={r.x} y={r.y} width={r.width} height={r.height} rx={corner(r, false)} />
		{/each}
		{#each ll as r (r.label)}
			<rect class="ll" x={r.x} y={r.y} width={r.width} height={r.height} rx={corner(r, true)} />
		{/each}
		<ellipse class="ll" cx="170" cy="330" rx="40" ry="27" />
		{#each lr as r (r.label)}
			<text class="name lr-name" x={r.lx} y={r.ly}>{r.label}</text>
		{/each}
		{#each ll as r (r.label)}
			<text class="name ll-name" x={r.lx} y={r.ly}>{r.label}</text>
		{/each}
		<text class="name ll-name" x="170" y="335">LL(0)</text>
	</svg>
</div>

<style>
	.classes {
		max-width: 100%;
		overflow-x: auto;
	}
	svg {
		display: block;
		width: 100%;
		min-width: 440px;
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
</style>
