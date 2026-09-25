<!--
	A T-diagram in text: T(S → T / H). A short one stays on one line; a long
	one (long names) may break after "→" and "/", never inside a name.
-->
<script lang="ts">
	import LangText from './LangText.svelte';
	import { formatT, type TDiagram } from './model';

	interface Props {
		t: TDiagram;
	}

	let { t }: Props = $props();

	/** Longest text (in characters) kept on one line. */
	const ONE_LINE = 24;
	const long = $derived([...formatT(t)].length > ONE_LINE);
</script>

<span class={['tt', { long }]}
	>T(<LangText text={t.source} />&nbsp;→ <LangText text={t.target} />&nbsp;/ <LangText
		text={t.host}
	/>)</span
>

<style>
	.tt {
		font-family: var(--font-mono);
		font-size: 0.94em;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.tt.long {
		white-space: normal;
	}
	.tt :global(.lang) {
		font-size: 1em;
	}
</style>
