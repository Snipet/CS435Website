<!--
	Text with subscripts: instances of non-terminals (E0, T1) and the functions
	of the productions (E1, T2), drawn with real subscripts as on the slides.
	Grammar symbols are set in the mono font.
-->
<script lang="ts">
	import type { Piece, PieceKind } from './notation';

	interface Props {
		pieces: readonly Piece[];
		/** Color keywords, types and constants, for code. */
		code?: boolean;
	}

	let { pieces, code = false }: Props = $props();

	const CODE_CLASS: Partial<Record<PieceKind, string>> = {
		keyword: 'hl-keyword',
		type: 'hl-name',
		constant: 'hl-number'
	};
	const SYMBOL: Partial<Record<PieceKind, boolean>> = { nonterminal: true, terminal: true };
</script>

{#each pieces as p, i (i)}<span
		class={[code && p.kind ? CODE_CLASS[p.kind] : undefined, { sym: p.kind && SYMBOL[p.kind] }]}
		>{p.text}{#if p.sub}<sub>{p.sub}</sub>{/if}</span
	>{/each}

<style>
	.sym {
		font-family: var(--font-mono);
		font-style: normal;
		font-variant-ligatures: none;
	}
	sub {
		position: relative;
		top: 0.3em;
		font-size: 0.72em;
		line-height: 0;
		vertical-align: baseline;
	}
</style>
