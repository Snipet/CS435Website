<!--
	What the loaded preset is: its slides, a description, and the questions the
	slides pose, each with its answer behind "Show answer".
-->
<script lang="ts">
	import { CitationTag, Disclosure } from '$lib/components/ui';
	import type { Program } from './limited';
	import { asciiText, piecesOf } from './notation';
	import Pieces from './Pieces.svelte';
	import type { RdPreset } from './presets';

	interface Props {
		preset: RdPreset;
		/** The generated code, so an answer that is one of its lines is drawn like the listing. */
		program?: Program | null;
	}

	let { preset, program = null }: Props = $props();

	/** The line of the program with this text, production numbers as subscripts; else the text. */
	function codePieces(code: string) {
		const line = program?.lines.find((l) => asciiText(l.pieces) === code);
		return line ? line.pieces : piecesOf(code);
	}
</script>

<aside class="note" aria-label="About this example">
	{#if preset.cite}<CitationTag cite={preset.cite} />{/if}
	<p class="desc"><Pieces pieces={piecesOf(preset.description ?? '')} /></p>
	{#if preset.questions?.length}
		<ul class="questions">
			{#each preset.questions as q, i (i)}
				<li>
					<p class="prompt"><Pieces pieces={piecesOf(q.prompt)} /></p>
					{#if q.notation}<p class="notation"><Pieces pieces={piecesOf(q.notation)} /></p>{/if}
					<Disclosure summary="Show answer" openSummary="Hide answer">
						{#if q.code}
							<p class="code">
								<Pieces pieces={codePieces(q.code)} code />
							</p>
						{/if}
						{#if q.answer}<p class="answer">{q.answer}</p>{/if}
						<p class="where"><CitationTag cite={q.cite} /></p>
					</Disclosure>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.note {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.desc {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		margin: var(--space-1) 0 0;
		padding: 0;
		list-style: none;
	}
	.questions li {
		min-width: 0;
	}
	.prompt {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-style: italic;
		line-height: 1.4;
	}
	.notation,
	.code {
		margin: 2px 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.code {
		margin: 0 0 var(--space-2);
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.answer {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.where {
		margin: 0;
	}
</style>
