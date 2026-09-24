<script lang="ts" module>
	export type GlyphKind =
		| 'state'
		| 'start'
		| 'accepting'
		| 'transition'
		| 'multi'
		| 'loop'
		| 'epsilon'
		| 'trap'
		| 'active'
		| 'long';

	/** Triangle arrowhead with its tip at (x, y), pointing along (dx, dy). */
	function head(x: number, y: number, dx: number, dy: number, length = 7, half = 3.4): string {
		const n = Math.hypot(dx, dy) || 1;
		const ux = dx / n;
		const uy = dy / n;
		const bx = x - ux * length;
		const by = y - uy * length;
		const f = (v: number) => v.toFixed(2);
		return `M${f(x)} ${f(y)}L${f(bx - uy * half)} ${f(by + ux * half)}L${f(bx + uy * half)} ${f(by - ux * half)}Z`;
	}

	// Two states joined by a gentle arc; the tip touches the target circle.
	const ARC = 'M32 30C50 18 70 18 88 30';
	const ARC_HEAD = head(88, 30, 18, 12);
	const LOOP = 'M52.3 36.8C36 6 84 6 67.7 36.8';
	const LOOP_HEAD = head(67.7, 36.8, -16.3, 30.8);
	const START_HEAD = head(45.5, 35.8, 46, -12);
</script>

<script lang="ts">
	let { kind }: { kind: GlyphKind } = $props();
</script>

<svg class="glyph" viewBox="0 0 120 60" aria-hidden="true">
	{#if kind === 'state'}
		<circle class="st" cx="60" cy="32" r="15" />
	{:else if kind === 'start'}
		<path class="edge" d="M14 44L38.7 37.6" />
		<path class="tip" d={START_HEAD} />
		<circle class="st" cx="60" cy="32" r="15" />
	{:else if kind === 'accepting'}
		<circle class="st" cx="60" cy="32" r="15" />
		<circle class="st" cx="60" cy="32" r="11.5" />
	{:else if kind === 'transition' || kind === 'multi' || kind === 'epsilon'}
		<circle class="st" cx="20" cy="36" r="13" />
		<circle class="st" cx="100" cy="36" r="13" />
		<text class="name" x="20" y="40.5">A</text>
		<text class="name" x="100" y="40.5">B</text>
		<g class={{ eps: kind === 'epsilon' }}>
			<path class="edge" d={ARC} />
			<path class="tip" d={ARC_HEAD} />
			<text class="lbl" x="60" y="14"
				>{kind === 'transition' ? 'a' : kind === 'multi' ? '0,1' : 'ε'}</text
			>
		</g>
	{:else if kind === 'loop' || kind === 'trap'}
		<circle class={['st', { trap: kind === 'trap' }]} cx="60" cy="46" r="12" />
		<path class={['edge', { dead: kind === 'trap' }]} d={LOOP} />
		<path class={['tip', { dead: kind === 'trap' }]} d={LOOP_HEAD} />
		<text class="lbl" x="60" y="9">{kind === 'trap' ? '0,1' : '1'}</text>
	{:else if kind === 'active'}
		<circle class="st" cx="20" cy="36" r="13" />
		<path class="edge hot" d={ARC} />
		<path class="tip hot" d={ARC_HEAD} />
		<text class="lbl" x="60" y="14">1</text>
		<circle class="st on" cx="100" cy="36" r="13" />
	{:else if kind === 'long'}
		<ellipse class="st" cx="60" cy="32" rx="52" ry="15" />
		<text class="name" x="60" y="36.5">FGABCDHI</text>
	{/if}
</svg>

<style>
	.glyph {
		display: block;
		width: 120px;
		height: 60px;
		overflow: visible;
	}
	.st {
		fill: var(--state-fill);
		stroke: var(--state-stroke);
		stroke-width: 1.4;
	}
	.st.trap {
		stroke: var(--dead);
		stroke-dasharray: 4 3;
	}
	.st.on {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 2;
	}
	.edge {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.tip {
		fill: var(--edge);
	}
	.dead.edge {
		stroke: var(--dead);
	}
	.dead.tip {
		fill: var(--dead);
	}
	.hot.edge {
		stroke: var(--active);
		stroke-width: 2;
	}
	.hot.tip {
		fill: var(--active);
	}
	.eps .edge {
		stroke: var(--epsilon);
	}
	.eps .tip,
	.eps .lbl {
		fill: var(--epsilon);
	}
	.lbl {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 12px;
		text-anchor: middle;
	}
	.name {
		fill: var(--text);
		font-family: var(--font-mono);
		font-size: 12px;
		text-anchor: middle;
	}
</style>
