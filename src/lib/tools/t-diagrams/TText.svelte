<!-- A T-diagram in text: T(S → T / H). -->
<script lang="ts">
	import LangText from './LangText.svelte';
	import type { TDiagram } from './model';

	interface Props {
		t: TDiagram;
	}

	let { t }: Props = $props();
</script>

<span class="tt"
	>T(<LangText text={t.source} /> → <LangText text={t.target} /> / <LangText text={t.host} />)</span
>

<style>
	.tt {
		font-family: var(--font-mono);
		font-size: 0.94em;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.tt :global(.lang) {
		font-size: 1em;
	}
</style>
