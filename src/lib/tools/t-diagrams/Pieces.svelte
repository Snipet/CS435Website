<!-- Rich text from the model: plain strings, language names, and T-diagrams. -->
<script lang="ts">
	import LangText from './LangText.svelte';
	import type { Piece } from './model';
	import TText from './TText.svelte';

	interface Props {
		pieces: readonly Piece[];
	}

	let { pieces }: Props = $props();
</script>

{#each pieces as piece, i (i)}{#if typeof piece === 'string'}{piece}{:else if 'lang' in piece}<LangText
			text={piece.lang}
		/>{:else}<TText t={piece.t} />{/if}{/each}
