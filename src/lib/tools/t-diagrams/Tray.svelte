<!--
	The toolbox drawn as T-diagrams. Drag one onto another's left arm to
	compose them: a legal pair snaps (stem against arm) while dragging. A click,
	Enter or Space chooses a diagram for the Compose row instead (first the one
	to compile, then the translator).
	The dragged diagram is drawn in a fixed-position overlay, so the canvas's
	scroll box (long names on a phone) never clips it. The pointer is mapped
	onto the canvas again whenever the page or the box scrolls, and dragging
	near the box's left or right edge scrolls it.
-->
<script lang="ts">
	import {
		canvasFrame,
		clientToCanvas,
		dragAt,
		edgeScroll,
		flowLayout,
		overlayBox,
		TRAY_METRICS,
		tGeometry,
		type CanvasFrame,
		type Point
	} from './geometry';
	import {
		compose,
		describeT,
		sameT,
		type Composition,
		type Facts,
		type Piece,
		type TDiagram
	} from './model';
	import Pieces from './Pieces.svelte';
	import TShape, { type MarkTone, type Region, type ShapeTone } from './TShape.svelte';

	interface Item {
		id: string;
		t: TDiagram;
	}

	interface Props {
		items: readonly Item[];
		facts: Facts;
		/** Ids chosen in the Compose row. */
		program: string | null;
		translator: string | null;
		goal: TDiagram | null;
		onpick: (id: string) => void;
		oncompose: (program: string, translator: string) => void;
	}

	let { items, facts, program, translator, goal, onpick, oncompose }: Props = $props();

	const uid = $props.id();
	const TAG = 16;

	let width = $state(0);
	let svg: SVGSVGElement | undefined = $state();

	const trayWidth = $derived(Math.max(240, Math.round(width) || 640));
	const geoms = $derived(items.map((it) => tGeometry(it.t, TRAY_METRICS)));
	const layout = $derived(
		flowLayout(
			geoms.map((g) => ({ width: g.width, height: g.height + TAG })),
			trayWidth,
			{ gapX: 36, gapY: 26, padX: 14, padY: 14 }
		)
	);
	/** Top-left corner of each diagram (below its tag line). */
	const homes = $derived(layout.positions.map((p) => ({ x: p.x, y: p.y + TAG })));
	/** A diagram wider than the tray (long names on a phone) widens the canvas, which then scrolls. */
	const canvasWidth = $derived(Math.max(trayWidth, Math.ceil(layout.width)));
	const wide = $derived(canvasWidth > trayWidth);

	interface Drag {
		id: string;
		index: number;
		pointerId: number;
		/** The pointer at pointerdown, in canvas units. */
		start: Point;
		/** The pointer's last position, in client px. */
		client: Point;
		/** Where the canvas was on screen at the last update. */
		frame: CanvasFrame;
		pos: Point;
		moved: boolean;
		target: { id: string; snap: Point } | null;
		composition: Composition | null;
	}

	let drag = $state<Drag | null>(null);
	let suppressClick = false;
	let wrap: HTMLDivElement | undefined = $state();

	const frameNow = (): CanvasFrame => canvasFrame(svg!.getBoundingClientRect(), canvasWidth);

	function down(e: PointerEvent, index: number) {
		if (e.button !== 0 || !svg) return;
		suppressClick = false;
		const frame = frameNow();
		const client = { x: e.clientX, y: e.clientY };
		drag = {
			id: items[index].id,
			index,
			pointerId: e.pointerId,
			start: clientToCanvas(frame, client),
			client,
			frame,
			pos: homes[index],
			moved: false,
			target: null,
			composition: null
		};
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
	}

	/**
	 * Maps the pointer at `client` onto the canvas as it is now (it may have
	 * scrolled) and updates the drag. False while the press has not moved far
	 * enough to be a drag.
	 */
	function track(client: Point): boolean {
		if (!drag || !svg) return false;
		const frame = frameNow();
		const index = drag.index;
		const geom = geoms[index];
		const candidates = items
			.map((it, i) => ({ id: it.id, pos: homes[i], geom: geoms[i] }))
			.filter((c) => c.id !== drag!.id);
		const at = dragAt(
			{ home: homes[index], geom, start: drag.start },
			frame,
			client,
			candidates,
			geom.unit * 1.8
		);
		if (!drag.moved && !at.far) return false;
		const other = at.target ? items.find((it) => it.id === at.target!.id) : undefined;
		drag = {
			...drag,
			client,
			frame,
			moved: true,
			pos: at.pos,
			target: at.target,
			composition: other ? compose(items[index].t, other.t, facts) : null
		};
		return true;
	}

	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		if (!track({ x: e.clientX, y: e.clientY })) return;
		e.preventDefault();
		autoScroll();
	}

	function up(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const done = drag;
		drag = null;
		if (!done.moved) return;
		suppressClick = true;
		if (done.target) oncompose(done.id, done.target.id);
	}

	function cancel(e: PointerEvent) {
		if (drag && e.pointerId === drag.pointerId) drag = null;
	}

	/** Scrolls a canvas that is wider than the tray while the pointer is held near its left or right edge. */
	let scrollFrame = 0;
	function autoScroll() {
		if (scrollFrame || !wide) return;
		const step = () => {
			scrollFrame = 0;
			if (!drag?.moved || !wrap) return;
			const before = wrap.scrollLeft;
			wrap.scrollLeft += edgeScroll(drag.client.x, wrap.getBoundingClientRect());
			// The scroll listener below re-tracks the pointer.
			if (wrap.scrollLeft !== before) scrollFrame = requestAnimationFrame(step);
		};
		scrollFrame = requestAnimationFrame(step);
	}

	// While a diagram is held, any scroll (the canvas's box or the page) moves the
	// canvas under the pointer: map the pointer again so the drop target stays right.
	const holding = $derived(drag !== null);
	$effect(() => {
		if (!holding) return;
		const onScroll = () => {
			if (drag?.moved) track(drag.client);
		};
		window.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll, { capture: true });
			cancelAnimationFrame(scrollFrame);
			scrollFrame = 0;
		};
	});

	function click(id: string) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		onpick(id);
	}

	function keydown(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onpick(id);
		}
	}

	/** Where the dragged diagram is drawn: snapped on a legal target, else under the pointer. */
	const dragPos = $derived(
		drag && drag.target && drag.composition?.legal ? drag.target.snap : (drag?.pos ?? null)
	);
	const dragTone = $derived<MarkTone | null>(
		drag?.target ? (drag.composition?.legal ? 'accept' : 'reject') : null
	);

	/** Room around the overlaid diagram for its outline and shadow, in canvas units. */
	const GHOST_MARGIN = 6;
	/** The dragged diagram's overlay: what to draw and where it is on screen. */
	const ghost = $derived.by(() => {
		if (!drag?.moved || !dragPos || !items[drag.index]) return null;
		const geom = geoms[drag.index];
		return {
			item: items[drag.index],
			geom,
			box: overlayBox(drag.frame, dragPos, geom, GHOST_MARGIN)
		};
	});

	function toneOf(item: Item): ShapeTone {
		if (item.id === program) return 'program';
		if (item.id === translator) return 'translator';
		if (goal && sameT(item.t, goal)) return 'accept';
		return 'plain';
	}

	function marksOf(item: Item): Partial<Record<Region, MarkTone>> {
		if (dragTone && drag?.target?.id === item.id) return { leftArm: dragTone };
		return {};
	}

	function tagOf(item: Item): string {
		if (item.id === program) return 'compile';
		if (item.id === translator) return 'with';
		return '';
	}

	function nameOf(item: Item, index: number): string {
		const role =
			item.id === program
				? ', chosen to compile'
				: item.id === translator
					? ', chosen as the translator'
					: '';
		return `Diagram ${index + 1}: compiler ${describeT(item.t)}${role}`;
	}

	const statusPieces = $derived.by((): Piece[] | null => {
		if (!drag?.moved) return null;
		const n = drag.index + 1;
		if (!drag.target || !drag.composition) {
			return [`Drop diagram ${n} on another diagram’s left arm.`];
		}
		const m = items.findIndex((it) => it.id === drag!.target!.id) + 1;
		if (drag.composition.legal) return [`Release to compile diagram ${n} with diagram ${m}.`];
		const failed = drag.composition.checks.find((c) => !c.ok);
		return failed ? failed.pieces : null;
	});
	const statusTone = $derived(
		drag?.target && drag.composition && !drag.composition.legal ? 'bad' : 'neutral'
	);
</script>

<div class="tray" bind:clientWidth={width}>
	{#if items.length}
		<div class={['canvas-wrap', { wide }]} bind:this={wrap}>
			<svg
				bind:this={svg}
				class={['canvas', { dragging: drag?.moved }]}
				width={canvasWidth}
				height={layout.height}
				viewBox="0 0 {canvasWidth} {layout.height}"
				role="group"
				aria-label="Toolbox diagrams"
				aria-describedby="{uid}-how"
				onpointermove={move}
				onpointerup={up}
				onpointercancel={cancel}
				onlostpointercapture={cancel}
			>
				{#each items as item, i (item.id)}
					{@const g = geoms[i]}
					{@const home = homes[i]}
					{@const tag = tagOf(item)}
					<g
						class={['item', { lifted: drag?.moved && drag.id === item.id }]}
						transform="translate({home.x} {home.y})"
						role="button"
						tabindex="0"
						aria-label={nameOf(item, i)}
						aria-pressed={item.id === program || item.id === translator}
						onpointerdown={(e) => down(e, i)}
						onclick={() => click(item.id)}
						onkeydown={(e) => keydown(e, item.id)}
					>
						<rect
							class="hit"
							x={-6}
							y={-TAG - 2}
							width={g.width + 12}
							height={g.height + TAG + 8}
							rx="8"
						/>
						<text class="num" x="0" y={-5}>{i + 1}</text>
						{#if tag}
							<text
								class={['tag', tag === 'compile' ? 'tag-program' : 'tag-translator']}
								x="14"
								y={-5}>{tag}</text
							>
						{/if}
						<TShape t={item.t} geom={g} tone={toneOf(item)} marks={marksOf(item)} />
					</g>
				{/each}
			</svg>
		</div>
	{/if}
	{#if ghost}
		{@const m = GHOST_MARGIN}
		<svg
			class="ghost"
			style:left="{ghost.box.left}px"
			style:top="{ghost.box.top}px"
			width={ghost.box.width}
			height={ghost.box.height}
			viewBox="{-m} {-m} {ghost.geom.width + 2 * m} {ghost.geom.height + 2 * m}"
			aria-hidden="true"
		>
			<TShape
				t={ghost.item.t}
				geom={ghost.geom}
				tone={toneOf(ghost.item)}
				marks={dragTone ? { stem: dragTone } : {}}
			/>
		</svg>
	{/if}
	{#if !items.length}
		<p class="empty">The toolbox is empty. Add a T-diagram to draw it here.</p>
	{/if}
	<p id="{uid}-how" class="visually-hidden">
		Press Enter to choose a diagram for Compose: first the one to compile, then the translator. With
		a pointer, drag a diagram onto another one’s left arm.
	</p>
	<p class={['status', statusTone]} aria-live="polite">
		{#if statusPieces}<Pieces pieces={statusPieces} />{/if}
	</p>
</div>

<style>
	.tray {
		min-width: 0;
	}
	/* Only a canvas wider than the tray scrolls. */
	.canvas-wrap.wide {
		max-width: 100%;
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.canvas {
		display: block;
		/* Before the tray is measured (prerendered HTML) the canvas scales to fit. */
		max-width: 100%;
		overflow: visible;
		user-select: none;
		-webkit-user-select: none;
	}
	.wide .canvas {
		max-width: none;
	}
	.item {
		cursor: grab;
		touch-action: none;
	}
	.item:focus {
		outline: none;
	}
	.hit {
		fill: transparent;
		stroke: transparent;
		stroke-width: 2;
	}
	.item:hover .hit {
		fill: var(--surface-2);
	}
	.item:focus-visible .hit {
		stroke: var(--focus);
	}
	.item.lifted {
		opacity: 0.35;
	}
	.dragging,
	.dragging .item {
		cursor: grabbing;
	}
	/* Drawn over everything (but menus), so no scroll box or panel edge clips it. */
	.ghost {
		position: fixed;
		z-index: 70;
		display: block;
		overflow: visible;
		pointer-events: none;
		filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--backdrop) 50%, transparent));
	}
	.num {
		fill: var(--text-3);
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.tag {
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.tag-program {
		fill: var(--tok-0);
	}
	.tag-translator {
		fill: var(--tok-2);
	}
	.empty {
		margin: 0;
		padding: var(--space-5) var(--space-4);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-3);
		font-size: var(--text-sm);
		text-align: center;
	}
	.status {
		min-height: 1.5em;
		margin: var(--space-1) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.status.bad {
		color: var(--reject);
	}
</style>
