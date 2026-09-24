<script lang="ts">
	import { formatString, formatStringSet } from '$lib/theory/chars';
	import { toneStyle } from './tones';
	import type { Tone } from './types';

	interface Props {
		strings: readonly string[];
		/** More members exist than are listed (adds `…`). */
		more?: boolean;
		/**
		 * Strings to emphasize: a collection, or a function returning a tone, true
		 * (the `tone` prop), or nothing.
		 */
		highlight?:
			Iterable<string> | ((s: string, index: number) => Tone | boolean | null | undefined);
		/** Tone used for highlighted strings (default 'active'). */
		tone?: Tone;
		/** Text before the set, e.g. "L(R) =". */
		prefix?: string;
		/** Accessible name; defaults to the set in lecture notation. */
		ariaLabel?: string;
	}

	let { strings, more = false, highlight, tone = 'active', prefix, ariaLabel }: Props = $props();

	const lookup = $derived(highlight && typeof highlight !== 'function' ? new Set(highlight) : null);

	function toneOf(s: string, i: number): Tone | null {
		if (!highlight) return null;
		if (typeof highlight === 'function') {
			const t = highlight(s, i);
			return t === true ? tone : t || t === 0 ? (t as Tone) : null;
		}
		return lookup?.has(s) ? tone : null;
	}

	const text = $derived(formatStringSet(strings, { more }));
</script>

<div
	class="string-set"
	role="group"
	aria-label={ariaLabel ?? `${prefix ? `${prefix} ` : ''}${text}`}
>
	<span class="inner" aria-hidden="true">
		{#if prefix}<span class="prefix">{prefix}</span>{/if}
		<span class="brace">&#123;</span>
		{#if strings.length === 0 && !more}
			<span class="gap"></span>
		{:else}
			{#each strings as s, i (i)}
				{@const t = toneOf(s, i)}
				<span class="item"
					><span
						class={['chip', { hl: t !== null, empty: s === '' }]}
						style={t !== null ? toneStyle(t) : undefined}>{formatString(s)}</span
					>{#if i < strings.length - 1 || more}<span class="comma">,</span>{/if}</span
				>
			{/each}
			{#if more}<span class="more">…</span>{/if}
		{/if}
		<span class="brace">&#125;</span>
	</span>
</div>

<style>
	.string-set {
		min-width: 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: 0.9375rem;
		line-height: 1.9;
	}
	.inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 0.45em;
	}
	.prefix {
		margin-right: 0.15em;
		color: var(--text-2);
	}
	.brace {
		color: var(--text-3);
		font-size: 1.15em;
	}
	.gap {
		width: 0.2em;
	}
	.item {
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
	}
	.chip {
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		white-space: pre;
	}
	.chip.empty {
		color: var(--text-2);
	}
	.chip.hl {
		background: var(--tone-bg);
		border-color: color-mix(in srgb, var(--tone-fg) 45%, transparent);
		box-shadow: inset 0 -2px 0 var(--tone-fg);
	}
	.comma {
		color: var(--text-3);
	}
	.more {
		color: var(--text-3);
	}
</style>
