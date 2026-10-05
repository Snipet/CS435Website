<!--
	The generated C code with line numbers, the line being executed marked, and
	the lines of the calls in progress marked lightly. A long listing scrolls
	inside its own box, which follows the line being executed.
-->
<script lang="ts">
	import type { Program } from './program';
	import { scrollFor, type StepTone } from './view';

	interface Props {
		program: Program;
		/** Line being executed (from 0), or null. */
		line?: number | null;
		/** Lines of the calls in progress. */
		sites?: readonly number[];
		/** Color of the executing line: a match, a stop, or neither. */
		tone?: StepTone;
		maxHeight?: string;
		ariaLabel?: string;
	}

	let {
		program,
		line = null,
		sites = [],
		tone = 'neutral',
		maxHeight = 'none',
		ariaLabel = 'Generated C code'
	}: Props = $props();

	const waiting = $derived(new Set(sites));
	const digits = $derived(String(program.lines.length).length);

	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);

	// Keep the executing line inside the box, with the start of its function when that fits.
	$effect(() => {
		const el = box;
		const at = line;
		if (!el || at === null) return;
		const rowOf = (i: number) => el.querySelector<HTMLElement>(`[data-line="${i}"]`);
		const row = rowOf(at);
		if (!row) return;
		const fn = program.lines[at]?.fn ?? null;
		const first = fn === null ? null : rowOf(program.functions[fn]?.first ?? at);
		const top = scrollFor(
			{ top: el.scrollTop, height: el.clientHeight },
			{ top: row.offsetTop, height: row.offsetHeight },
			first?.offsetTop ?? row.offsetTop
		);
		if (top !== null) el.scrollTop = top;
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
		{#each program.lines as row, i (i)}
			<li
				data-line={i}
				class={[
					i === line && ['current', tone],
					{ waiting: waiting.has(i) && i !== line, comment: row.text.trimStart().startsWith('//') }
				]}
				aria-current={i === line ? 'step' : undefined}
			>
				<span class="number" aria-hidden="true">{i + 1}</span><code
					>{row.text === '' ? ' ' : row.text}</code
				>
			</li>
		{/each}
	</ol>
</div>

<style>
	.listing {
		position: relative;
		overflow: auto;
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
		padding: 8px 0;
		list-style: none;
	}
	li {
		display: flex;
		padding: 0 16px 0 0;
		border-left: 3px solid transparent;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.75;
		white-space: pre;
		transition: background var(--duration) var(--ease);
	}
	.number {
		flex: none;
		box-sizing: content-box;
		width: calc(var(--digits) * 1ch);
		padding: 0 12px 0 9px;
		color: var(--text-3);
		text-align: right;
		user-select: none;
	}
	/* Not the inline-code chip of app.css: the row's own background shows the current line. */
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
	li.current {
		border-left-color: var(--active);
		background: var(--active-soft);
	}
	li.current code {
		font-weight: 650;
	}
	li.current .number {
		color: var(--text);
	}
	li.current.accept {
		border-left-color: var(--accept);
		background: var(--accept-soft);
	}
	li.current.reject {
		border-left-color: var(--reject);
		background: var(--reject-soft);
	}
</style>
