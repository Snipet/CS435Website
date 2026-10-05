<!--
	A token string with the input pointer of the recursive-descent slides: an ↑
	under the next token, or after the last token at the end of the input.
-->
<script lang="ts">
	import { toneStyle } from '$lib/components/ui/tones';
	import type { HighlightRange } from '$lib/components/ui/types';
	import { describeTokens, layoutTokens, pointerText } from './token-stream';

	interface Props {
		tokens: readonly string[];
		/**
		 * Index of the next token, 0 … tokens.length (the end of the input). Tokens
		 * before it are muted. Leave out to draw no pointer.
		 */
		pointer?: number | null;
		/** Colored ranges `[start, end)` of token indices. */
		highlights?: readonly HighlightRange[];
		/** End the stream with `$`. */
		endMarker?: boolean;
		size?: 'md' | 'lg';
		/** Accessible name; the tokens are appended. */
		ariaLabel?: string;
	}

	let {
		tokens,
		pointer = null,
		highlights = [],
		endMarker = false,
		size = 'md',
		ariaLabel = 'Token stream'
	}: Props = $props();

	const cells = $derived(layoutTokens(tokens, { pointer, highlights, endMarker }));
	const where = $derived(pointerText(tokens, pointer, endMarker));
</script>

<div
	class={['token-stream', size]}
	role="group"
	aria-label="{ariaLabel}: {describeTokens(tokens, endMarker)}"
>
	{#if where}<span class="visually-hidden">{where}</span>{/if}
	<div class="cells" aria-hidden="true">
		{#each cells as c (c.index)}
			<span
				class={[
					'cell',
					c.kind,
					{
						consumed: c.consumed,
						hl: c.tone !== null,
						muted: c.muted,
						s: c.edgeStart,
						e: c.edgeEnd
					}
				]}
				style={c.tone !== null ? toneStyle(c.tone) : undefined}
			>
				<span class="tok">{c.text}</span>
				{#if pointer !== null}<span class="ptr">{c.pointer ? '↑' : ''}</span>{/if}
			</span>
		{/each}
	</div>
</div>

<style>
	.token-stream {
		min-width: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		line-height: 1;
	}
	.md {
		font-size: 1rem;
	}
	.lg {
		font-size: 1.25rem;
	}
	.cells {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		row-gap: 6px;
	}
	/* Each token carries its own pointer slot, so the ↑ stays under it when the row wraps. */
	.cell {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		max-width: 100%;
	}
	.tok {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: content-box;
		min-width: 0.7em;
		max-width: 100%;
		min-height: 1.75em;
		padding: 0 0.34em;
		color: var(--text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.consumed .tok {
		color: var(--text-3);
	}
	.marker .tok {
		color: var(--text-2);
	}
	.hl .tok {
		background: var(--tone-bg);
		box-shadow: inset 0 -2px 0 var(--tone-fg);
	}
	.hl.muted .tok {
		background: transparent;
	}
	.hl.s .tok {
		margin-left: 1px;
		border-top-left-radius: 4px;
		border-bottom-left-radius: 4px;
	}
	.hl.e .tok {
		margin-right: 1px;
		border-top-right-radius: 4px;
		border-bottom-right-radius: 4px;
	}
	.ptr {
		display: block;
		height: 1.15em;
		padding-top: 0.15em;
		color: var(--active);
		font-weight: 700;
	}
</style>
