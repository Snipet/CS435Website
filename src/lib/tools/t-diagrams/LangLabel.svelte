<!--
	A language name inside an SVG: primes as ′ and `_SUB` as a real subscript.
	A blank name is drawn as a faint "?".
-->
<script lang="ts">
	import { parseLang, SUB_SCALE } from './labels';

	interface Props {
		text: string;
		x: number;
		y: number;
		size: number;
		anchor?: 'start' | 'middle' | 'end';
		class?: string;
	}

	let { text, x, y, size, anchor = 'start', class: className }: Props = $props();

	const parts = $derived(parseLang(text));
	const blank = $derived(!parts.main && !parts.sub);
</script>

<text
	class={['lang', { blank }, className]}
	{x}
	{y}
	text-anchor={anchor}
	font-size={size}
	aria-hidden="true"
	>{#if blank}?{:else}{parts.main}{#if parts.sub}<tspan
				dy={Math.round(size * 0.28)}
				font-size={Math.round(size * SUB_SCALE * 10) / 10}>{parts.sub}</tspan
			>{/if}{/if}</text
>

<style>
	.lang {
		fill: var(--text);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.blank {
		fill: var(--text-3);
	}
</style>
