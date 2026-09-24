<script lang="ts">
	import { showChar } from '$lib/theory/chars';
	import { describeText, layoutStream, type StreamCell } from './char-stream';
	import { toneStyle } from './tones';
	import type { HighlightRange } from './types';

	interface Props {
		text: string;
		/** Colored ranges; a `label` groups the range and captions it (e.g. a token name). */
		highlights?: readonly HighlightRange[];
		/** Cursor position 0 … text.length, drawn as a bar before that character. */
		cursor?: number | null;
		/** Characters read but not consumed, `[start, end)`, drawn with a dashed underline. */
		lookahead?: { start: number; end: number } | null;
		/** Always show the end-of-input cell. */
		showEnd?: boolean;
		/** Show each character's index above it. */
		indices?: boolean;
		size?: 'md' | 'lg';
		/** Accessible name; defaults to the quoted text. */
		ariaLabel?: string;
		/**
		 * Makes positions selectable: click a character, or focus the stream and use
		 * ←/→, Home/End. Receives the string index (text.length for the end).
		 */
		onselect?: (index: number) => void;
	}

	let {
		text,
		highlights = [],
		cursor = null,
		lookahead = null,
		showEnd = false,
		indices = false,
		size = 'md',
		ariaLabel,
		onselect
	}: Props = $props();

	const items = $derived(
		layoutStream(text, { highlights, cursor, lookahead, showEnd: showEnd || !!onselect })
	);
	const label = $derived(ariaLabel ?? `Input ${describeText(text)}`);
	const position = $derived(Math.max(0, Math.min(cursor ?? 0, text.length)));
	const valueText = $derived.by(() => {
		if (position >= text.length) return `Position ${position}, end of input`;
		const cp = text.codePointAt(position)!;
		return `Position ${position}, ${showChar(cp, 'quoted') === ' ' ? 'space' : `'${showChar(cp, 'quoted')}'`}`;
	});

	function pick(event: MouseEvent) {
		const el = (event.target as Element).closest<HTMLElement>('[data-index]');
		if (el && onselect) onselect(Number(el.dataset.index));
	}

	function step(event: KeyboardEvent) {
		if (!onselect || event.ctrlKey || event.metaKey || event.altKey) return;
		const prevIndex = () => {
			if (position <= 0) return 0;
			const before = text.codePointAt(position - 2);
			return before !== undefined && before > 0xffff ? position - 2 : position - 1;
		};
		const nextIndex = () => {
			const cp = text.codePointAt(position);
			return Math.min(text.length, position + (cp !== undefined && cp > 0xffff ? 2 : 1));
		};
		let next: number;
		if (event.key === 'ArrowLeft') next = prevIndex();
		else if (event.key === 'ArrowRight') next = nextIndex();
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = text.length;
		else return;
		event.preventDefault();
		onselect(next);
	}
</script>

{#snippet cellView(c: StreamCell)}
	<span
		class={[
			'cell',
			c.kind,
			{ hl: c.tone !== null, s: c.edgeStart, e: c.edgeEnd, cursor: c.cursor, la: c.lookahead }
		]}
		style={c.tone !== null ? toneStyle(c.tone) : undefined}
		data-index={c.index}
		title={onselect ? `Position ${c.index}` : undefined}
		>{#if indices}<span class="idx">{c.index}</span>{/if}<span class="g">{c.glyph}</span></span
	>
{/snippet}

{#snippet body()}
	{#each items as item, i (i)}
		{#if item.kind === 'break'}
			<span class="break"></span>
		{:else if item.kind === 'cell'}
			{@render cellView(item.cell)}
		{:else}
			<span class="run" style={toneStyle(item.tone)}>
				<span class="run-cells">
					{#each item.cells as c (c.index)}{@render cellView(c)}{/each}
				</span>
				{#if item.label}<span class="run-label">{item.label}</span>{/if}
			</span>
		{/if}
	{/each}
{/snippet}

{#if onselect}
	<div
		class={['stream', size, 'interactive', { indices }]}
		role="slider"
		tabindex="0"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={text.length}
		aria-valuenow={position}
		aria-valuetext={valueText}
		onclick={pick}
		onkeydown={step}
	>
		{@render body()}
	</div>
{:else}
	<div class={['stream', size, { indices }]} role="group" aria-label={label}>
		<div class="inner" aria-hidden="true">{@render body()}</div>
	</div>
{/if}

<style>
	.stream {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		row-gap: 8px;
		min-width: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		line-height: 1;
	}
	.inner {
		display: contents;
	}
	.md {
		font-size: 1rem;
	}
	.lg {
		font-size: 1.25rem;
	}
	.stream.indices {
		padding-top: 0.85em;
		row-gap: 1.35em;
	}
	.interactive {
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.interactive:focus-visible {
		outline-offset: 4px;
	}
	.cell {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 0.95em;
		height: 1.75em;
		padding: 0 0.06em;
		color: var(--text);
	}
	.g {
		white-space: pre;
	}
	.space .g,
	.tab .g,
	.newline .g,
	.cr .g {
		color: var(--text-3);
	}
	.control .g {
		color: var(--tok-4);
		font-size: 0.7em;
	}
	.end {
		min-width: 0.7em;
	}
	.interactive .cell:hover {
		background: var(--surface-2);
	}
	.hl,
	.interactive .hl:hover {
		background: var(--tone-bg);
		box-shadow: inset 0 -2px 0 var(--tone-fg);
	}
	.hl.s {
		margin-left: 1px;
		padding-left: 0.16em;
		border-top-left-radius: 4px;
		border-bottom-left-radius: 4px;
	}
	.hl.e {
		margin-right: 1px;
		padding-right: 0.16em;
		border-top-right-radius: 4px;
		border-bottom-right-radius: 4px;
	}
	.cursor::before {
		content: '';
		position: absolute;
		z-index: 1;
		left: -2px;
		top: -3px;
		bottom: -3px;
		width: 3px;
		border-radius: 2px;
		background: var(--active);
	}
	.la::after {
		content: '';
		position: absolute;
		left: 1px;
		right: 1px;
		bottom: -5px;
		border-bottom: 2px dashed var(--active);
	}
	.idx {
		position: absolute;
		top: -1.15em;
		left: 0;
		right: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: 0.5em;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.break {
		flex-basis: 100%;
		height: 0;
	}
	.run {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		max-width: 100%;
	}
	.run-cells {
		display: flex;
		flex-wrap: wrap;
		max-width: 100%;
	}
	.run-label {
		max-width: 100%;
		padding: 5px 3px 0;
		overflow: hidden;
		color: var(--tone-fg);
		font-family: var(--font-sans);
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lg .run-label {
		font-size: 0.75rem;
	}
</style>
