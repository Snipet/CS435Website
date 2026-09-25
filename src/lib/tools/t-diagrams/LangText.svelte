<!-- A language name in running text: primes as ′ and `_SUB` as a subscript. -->
<script lang="ts">
	import { parseLang } from './labels';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();

	const parts = $derived(parseLang(text));
</script>

<span class="lang"
	>{#if !parts.main && !parts.sub}?{:else}{parts.main}{#if parts.sub}<sub>{parts.sub}</sub
			>{/if}{/if}</span
>

<style>
	.lang {
		font-family: var(--font-mono);
		font-size: 0.94em;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	sub {
		font-size: 0.72em;
		line-height: 0;
	}
</style>
