<!--
@component
A short program with line numbers and the line being executed highlighted.
Long listings scroll inside their own box and keep the current line in view.
-->
<script lang="ts">
	import { highlightC } from './code-highlight';

	interface Line {
		text: string;
		/** Drawn as an addition (e.g. a `break;` the page inserted). */
		inserted?: boolean;
	}

	interface Props {
		lines: readonly Line[];
		/** Index (0-based) of the line being executed, or null. */
		current?: number | null;
		/** Accessible name of the listing. */
		label: string;
		/** CSS max-height of the scroll box, e.g. '32rem'. */
		maxHeight?: string;
	}

	let { lines, current = null, label, maxHeight }: Props = $props();

	let box: HTMLDivElement | undefined = $state();
	const width = $derived(String(lines.length).length);
	const tokens = $derived(lines.map((l) => highlightC(l.text)));

	// Keep the current line visible inside the box without scrolling the page.
	$effect(() => {
		const i = current;
		const el = box;
		if (i === null || !el) return;
		const row = el.querySelector<HTMLElement>(`[data-line="${i}"]`);
		if (!row) return;
		const top = row.offsetTop;
		const bottom = top + row.offsetHeight;
		const pad = row.offsetHeight * 2;
		if (top - pad < el.scrollTop) el.scrollTop = Math.max(0, top - pad);
		else if (bottom + pad > el.scrollTop + el.clientHeight)
			el.scrollTop = bottom + pad - el.clientHeight;
	});
</script>

<div
	bind:this={box}
	class="listing"
	style:max-height={maxHeight}
	style:--digits="{width}ch"
	role="group"
	aria-label={label}
>
	<ol>
		{#each lines as line, i (i)}
			<li
				data-line={i}
				class={{ current: i === current, inserted: line.inserted }}
				aria-current={i === current ? 'step' : undefined}
			>
				<span class="ln" aria-hidden="true">{line.inserted ? '+' : i + 1}</span>
				<code
					>{#each tokens[i] as t, k (k)}{#if t.className}<span class={t.className}>{t.text}</span
							>{:else}{t.text}{/if}{/each}{#if line.inserted}<span class="visually-hidden">
							(inserted)</span
						>{/if}</code
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
	ol {
		margin: 0;
		padding: 6px 0;
		list-style: none;
		min-width: max-content;
	}
	li {
		position: relative;
		display: flex;
		align-items: baseline;
		padding: 0 14px 0 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.7;
		white-space: pre;
		transition: background var(--duration) var(--ease);
	}
	.ln {
		flex: none;
		width: calc(var(--digits) + 22px);
		padding-right: 12px;
		color: var(--text-3);
		font-size: 0.75rem;
		text-align: right;
		user-select: none;
	}
	code {
		font-size: inherit;
		color: var(--text);
	}
	li.inserted {
		background: color-mix(in srgb, var(--accept-soft) 80%, transparent);
	}
	li.inserted .ln {
		color: var(--accept);
		font-weight: 700;
	}
	li.current {
		background: var(--active-soft);
	}
	li.current::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--active);
	}
	li.current .ln {
		color: var(--text);
		font-weight: 600;
	}
</style>
