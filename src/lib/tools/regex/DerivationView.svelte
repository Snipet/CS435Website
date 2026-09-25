<!--
	A derivation drawn as nested brackets under the string: each bracket is a
	sub-expression and spans the substring it matched. The innermost brackets
	sit closest to the string; R's own bracket is at the bottom. Pointing at a
	bracket marks its substring; choosing it selects the node in the tree.
-->
<script lang="ts">
	import { glyphFor } from '$lib/components/ui/char-stream';
	import { formatString } from '$lib/theory/chars';
	import { flattenBrackets, type Bracket } from './derive';

	interface Props {
		text: string;
		root: Bracket;
		/** Sub-expression text of a bracket. */
		label: (b: Bracket) => string;
		/** Select the bracket's node (by path) elsewhere. */
		onselect?: (path: number[]) => void;
	}

	let { text, root, label, onselect }: Props = $props();

	const MAX_LABEL = 28;

	const cells = $derived.by(() => {
		const out: { start: number; glyph: string; kind: string }[] = [];
		for (let i = 0; i < text.length;) {
			const ch = String.fromCodePoint(text.codePointAt(i)!);
			out.push({ start: i, ...glyphFor(ch) });
			i += ch.length;
		}
		return out;
	});
	/** Grid column line of each string offset (offsets of whole symbols only). */
	const column = $derived.by(() => {
		const lines: number[] = [];
		cells.forEach((c, k) => (lines[c.start] = k + 1));
		lines[text.length] = cells.length + 1;
		return lines;
	});
	const all = $derived(flattenBrackets(root).filter((b) => b.end > b.start));

	let active = $state<Bracket | null>(null);

	const short = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s);
</script>

<div class="scroll">
	<div
		class="grid"
		role="group"
		aria-label="Derivation of {formatString(text)}"
		style="grid-template-columns: repeat({cells.length}, max-content);"
	>
		{#each cells as c, k (c.start)}
			{@const on = active !== null && c.start >= active.start && c.start < active.end}
			<span
				class={['ch', c.kind, { on }]}
				style="grid-column: {k + 1}; grid-row: 1;"
				aria-hidden="true">{c.glyph}</span
			>
		{/each}
		{#each all as b, i (i)}
			{@const name = label(b)}
			<button
				type="button"
				class={['br', { on: active === b, root: b === root }]}
				style="grid-column: {column[b.start]} / {column[b.end]}; grid-row: {b.height + 2};"
				title={name}
				aria-label="{name} matches {formatString(text.slice(b.start, b.end))}"
				onpointerenter={() => (active = b)}
				onpointerleave={() => (active = null)}
				onfocus={() => (active = b)}
				onblur={() => (active = null)}
				onclick={() => onselect?.(b.derivation.path)}
			>
				<span class="brace" aria-hidden="true"></span>
				<span class="label">{short(name)}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.scroll {
		max-width: 100%;
		overflow-x: auto;
		padding-bottom: 2px;
	}
	.grid {
		display: inline-grid;
		align-items: start;
		column-gap: 0;
		row-gap: 2px;
		min-width: min-content;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.ch {
		display: grid;
		place-items: center;
		min-width: 1.35em;
		height: 1.9em;
		margin: 0 1px;
		border-radius: 4px;
		color: var(--text);
		font-size: 1.0625rem;
		white-space: pre;
		transition: background var(--duration) var(--ease);
	}
	.ch.space,
	.ch.tab,
	.ch.newline,
	.ch.cr {
		color: var(--text-3);
	}
	.ch.control {
		color: var(--tok-4);
		font-size: 0.75rem;
	}
	.ch.on {
		background: var(--accent-soft);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.br {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		/* Columns are max-content: each label widens the columns it spans. */
		margin: 0;
		padding: 0 2px 2px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
	}
	.brace {
		height: 7px;
		margin: 0 1px;
		border: 1.5px solid var(--text-3);
		border-top: 0;
		border-radius: 0 0 5px 5px;
	}
	.label {
		padding: 1px 2px 0;
		font-size: 0.75rem;
		line-height: 1.35;
		text-align: center;
		white-space: pre;
	}
	.br:hover .brace,
	.br.on .brace {
		border-color: var(--accent);
	}
	.br:hover,
	.br.on {
		color: var(--accent);
	}
	.br:focus-visible {
		outline-offset: 0;
	}
	.root .label {
		color: var(--text);
	}
</style>
