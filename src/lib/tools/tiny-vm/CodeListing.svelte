<script lang="ts">
	import { revealInBox } from './reveal';
	import { scrollRegion } from './scroll-region';

	interface Props {
		lines: readonly string[];
		/** Lines of the current step. */
		active: ReadonlySet<number>;
		/** Lines of earlier phases of the same instruction. */
		path?: ReadonlySet<number>;
		/** A line to mark lightly when nothing is active (what runs next). */
		upcoming?: number | null;
		ariaLabel: string;
		/** Box height limit (CSS length); unlimited by default. */
		maxHeight?: string;
		/** Font size of the code. */
		size?: 'sm' | 'md';
		/** The line to bring into view (default: the first active line). */
		focus?: number | null;
	}

	let {
		lines,
		active,
		path = new Set(),
		upcoming = null,
		ariaLabel,
		maxHeight,
		size = 'md',
		focus
	}: Props = $props();

	let box: HTMLDivElement | undefined = $state();

	const first = $derived.by(() => {
		if (focus !== undefined) return focus;
		let min: number | null = null;
		for (const i of active) if (min === null || i < min) min = i;
		return min ?? (active.size === 0 ? upcoming : null);
	});
	/** End of the marked block that starts at `first`, kept in view with it when it fits. */
	const last = $derived.by(() => {
		if (first === null) return null;
		let end = first;
		while (active.has(end + 1)) end++;
		return end;
	});

	$effect(() => {
		if (!box || first === null) return;
		const el = box.querySelector(`[data-line="${first}"]`);
		const end = last === null ? null : box.querySelector(`[data-line="${last}"]`);
		revealInBox(box, el, end);
	});
</script>

<div
	class={['listing', size]}
	style:max-height={maxHeight}
	bind:this={box}
	role="group"
	aria-label={ariaLabel}
	{@attach scrollRegion}
>
	<ol>
		{#each lines as line, i (i)}
			{@const on = active.has(i)}
			<li
				data-line={i}
				class={{
					active: on,
					path: !on && path.has(i),
					upcoming: active.size === 0 && i === upcoming
				}}
				aria-current={on ? 'true' : undefined}
			>
				<code>{line || ' '}</code>
			</li>
		{/each}
	</ol>
</div>

<style>
	.listing {
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	ol {
		margin: 0;
		padding: var(--space-2) 0;
		list-style: none;
	}
	li {
		padding: 1px var(--space-3);
		border-left: 3px solid transparent;
	}
	code {
		display: block;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre;
	}
	.md code {
		font-size: 0.875rem;
		line-height: 1.7;
	}
	.sm code {
		font-size: 0.75rem;
		line-height: 1.6;
	}
	li.active {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
	li.active code {
		color: var(--text);
		font-weight: 600;
	}
	li.path {
		border-left-color: color-mix(in srgb, var(--active) 35%, transparent);
	}
	li.path code {
		color: var(--text);
	}
	li.upcoming {
		border-left-color: var(--accent);
		background: var(--accent-soft);
	}
</style>
