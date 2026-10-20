<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { toneStyle } from './tones';
	import type { Tone } from './types';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		/** Semantic tone, a token palette index, or 'neutral' (default). */
		tone?: Tone | 'neutral';
		variant?: 'soft' | 'outline' | 'solid';
		mono?: boolean;
		children?: Snippet;
	}

	let {
		tone = 'neutral',
		variant = 'soft',
		mono = false,
		children,
		class: className,
		style,
		...rest
	}: Props = $props();

	const toneCss = $derived(tone === 'neutral' ? '' : toneStyle(tone));
</script>

<span
	class={['badge', variant, { neutral: tone === 'neutral', mono }, className]}
	style="{toneCss}{style ?? ''}"
	{...rest}
>
	{@render children?.()}
</span>

<style>
	.badge {
		--tone-fg: var(--text-2);
		--tone-bg: var(--surface-2);
		--tone-text: var(--text-2);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 22px;
		padding: 0 8px;
		border-radius: 999px;
		border: 1px solid transparent;
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		vertical-align: middle;
	}
	/* Text takes --tone-text (4.5:1 on the soft fill and the surfaces); borders take --tone-fg. */
	.soft {
		background: var(--tone-bg);
		color: var(--tone-text);
		border-color: color-mix(in srgb, var(--tone-fg) 22%, transparent);
	}
	.soft.neutral {
		border-color: var(--border);
	}
	.outline {
		background: transparent;
		color: var(--tone-text);
		border-color: color-mix(in srgb, var(--tone-fg) 55%, transparent);
	}
	.solid {
		background: var(--tone-text);
		color: var(--surface);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
</style>
