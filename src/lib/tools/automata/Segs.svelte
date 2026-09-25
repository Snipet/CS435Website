<!--
@component
Renders a caption built from `Seg`s: state names and sets in the formal
(monospace) face, quoted symbols, and transitions as s →ᵃ t.
-->
<script lang="ts">
	import type { Seg } from './run';

	let { segs }: { segs: readonly Seg[] } = $props();
</script>

{#each segs as s, i (i)}{#if s.kind === 'text'}{s.text}{:else if s.kind === 'arrow'}<span
			class="arrow"
			><span class="visually-hidden">&nbsp;</span>→<sup>{s.text}</sup><span class="visually-hidden"
				>&nbsp;</span
			></span
		>{:else}<span class={['f', s.kind]}>{s.text}</span>{/if}{/each}

<style>
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.state {
		font-weight: 600;
	}
	.arrow {
		display: inline-block;
		margin: 0 0.3em;
		white-space: nowrap;
	}
	sup {
		margin-left: 1px;
		font-family: var(--font-mono);
		font-size: 0.72em;
	}
</style>
