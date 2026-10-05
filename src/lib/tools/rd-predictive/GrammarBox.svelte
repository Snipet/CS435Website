<!--
	A grammar in a box, as the slides show the grammar a slide is about, with
	the colors of the grammar editor.
-->
<script lang="ts">
	import { grammarLines } from './view';

	interface Props {
		/** Grammar text, one rule per line. */
		text: string;
		/** `{ } [ ]` are metasymbols. */
		ebnf?: boolean;
		/** Caption above the box, e.g. "Before". */
		label?: string;
		ariaLabel?: string;
	}

	let { text, ebnf = false, label, ariaLabel }: Props = $props();

	const uid = $props.id();
	const lines = $derived(grammarLines(text, { ebnf }));
</script>

<figure
	class="grammar-box"
	aria-label={label ? undefined : ariaLabel}
	aria-labelledby={label ? uid : undefined}
>
	{#if label}<figcaption id={uid}>{label}</figcaption>{/if}
	<div class="box">
		{#each lines as segments, i (i)}
			<div class="line">
				{#each segments as s, k (k)}<span class={s.className}>{s.text}</span
					>{/each}{#if segments.length === 0}&nbsp;{/if}
			</div>
		{/each}
	</div>
</figure>

<style>
	.grammar-box {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		margin: 0;
	}
	figcaption {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.box {
		min-width: 0;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		line-height: 1.7;
	}
	.line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
