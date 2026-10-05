<!--
	A step's message, one line per array of pieces, in the color of its outcome
	(the slides write these in red italics next to the tree).
-->
<script lang="ts">
	import type { Piece } from './notation';
	import Pieces from './Pieces.svelte';
	import type { MessageTone } from './view';

	interface Props {
		lines: readonly (readonly Piece[])[];
		tone?: MessageTone;
	}

	let { lines, tone = 'neutral' }: Props = $props();
</script>

<span class={['message', tone]}>
	{#each lines as line, i (i)}
		<span class="line"><Pieces pieces={line} /></span>
	{/each}
</span>

<style>
	.message {
		display: block;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.line {
		display: block;
	}
	.line:first-child {
		font-weight: 600;
	}
	.accept {
		color: var(--accept);
	}
	.reject {
		color: var(--reject);
	}
	.accept .line,
	.reject .line,
	.warn .line {
		font-style: italic;
	}
</style>
