<!--
	C++ code with line numbers: the lines a step runs marked, the lines of a
	helper it runs marked lightly, and the lines where calls in progress wait
	marked as waiting. A long listing scrolls inside its own box, which
	follows the marked lines.
-->
<script lang="ts">
	import type { CodeLine } from '$lib/theory/cminus';
	import { revealBlock } from './reveal';

	interface Props {
		lines: readonly CodeLine[];
		current?: ReadonlySet<string>;
		helper?: ReadonlySet<string>;
		waiting?: ReadonlySet<string>;
		/** Keep the current lines in view inside the box. */
		follow?: boolean;
		/** Any CSS length; `none` lets the listing grow. */
		maxHeight?: string;
		ariaLabel: string;
	}

	const NONE: ReadonlySet<string> = new Set();

	let {
		lines,
		current = NONE,
		helper = NONE,
		waiting = NONE,
		follow = true,
		maxHeight = 'none',
		ariaLabel
	}: Props = $props();

	const digits = $derived(String(lines.length).length);
	const key = $derived(`${[...current].join(' ')}/${[...waiting].join(' ')}`);

	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);

	// Keep the lines the step runs inside the box (the box scrolls, not the page).
	$effect(() => {
		void key;
		const el = box;
		if (!el || !follow) return;
		const frame = requestAnimationFrame(() => {
			let marked = el.querySelectorAll('.current');
			if (!marked.length) marked = el.querySelectorAll('.waiting');
			if (marked.length) revealBlock(el, marked[0], marked[marked.length - 1]);
		});
		return () => cancelAnimationFrame(frame);
	});

	// A box that scrolls takes keyboard focus, so it can be scrolled without a mouse.
	$effect(() => {
		const el = box;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const check = () =>
			(scrolls = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
		const observer = new ResizeObserver(check);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		check();
		return () => observer.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="listing"
	bind:this={box}
	style:max-height={maxHeight}
	style:--digits={digits}
	role="group"
	aria-label={scrolls ? `${ariaLabel}, scrolls` : ariaLabel}
	tabindex={scrolls ? 0 : undefined}
>
	<ol>
		{#each lines as row, i (i)}
			{@const on = row.id !== null && current.has(row.id)}
			{@const help = !on && row.id !== null && helper.has(row.id)}
			{@const wait = !on && !help && row.id !== null && waiting.has(row.id)}
			<li
				class={{
					current: on,
					helper: help,
					waiting: wait,
					comment: row.text.trimStart().startsWith('//')
				}}
				aria-current={on ? 'step' : undefined}
			>
				<span class="number" aria-hidden="true">{i + 1}</span><code
					>{row.text === '' ? ' ' : row.text}</code
				>{#if wait}<span class="visually-hidden">(a call waits here)</span>{/if}
			</li>
		{/each}
	</ol>
</div>

<style>
	.listing {
		position: relative;
		max-width: 100%;
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		scrollbar-width: thin;
	}
	.listing:focus-visible {
		outline-offset: 1px;
	}
	ol {
		min-width: max-content;
		margin: 0;
		padding: 6px 0;
		list-style: none;
	}
	li {
		display: flex;
		padding: 0 16px 0 0;
		border-left: 3px solid transparent;
		font-family: var(--font-mono);
		font-size: 0.78125rem;
		font-variant-ligatures: none;
		line-height: 1.65;
		white-space: pre;
	}
	.number {
		flex: none;
		box-sizing: content-box;
		width: calc(var(--digits) * 1ch);
		padding: 0 10px 0 8px;
		color: var(--text-3);
		text-align: right;
		user-select: none;
	}
	/* Not the inline-code chip of app.css: the row's own background marks the line. */
	code {
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
		color: var(--text);
		font-size: inherit;
	}
	.comment code {
		color: var(--syn-comment);
		font-style: italic;
	}
	li.waiting {
		border-left-color: var(--border-strong);
		background: var(--surface-3);
	}
	li.helper {
		border-left-color: color-mix(in srgb, var(--info) 45%, transparent);
		background: color-mix(in srgb, var(--info-soft) 55%, transparent);
	}
	li.current {
		border-left-color: var(--info);
		background: var(--info-soft);
	}
	li.current code {
		font-weight: 650;
	}
	li.current .number {
		color: var(--text);
	}
</style>
