<!--
	Preprocessor, compiler, assembler, and linker (Intro (cont'd), compiler
	architecture, slide 11), drawn top to bottom as on the slide.
-->
<script lang="ts">
	import { CitationTag, Disclosure } from '$lib/components/ui';

	interface Props {
		/** Caption next to the Compiler box. */
		compilerNote: string;
	}

	let { compilerNote }: Props = $props();

	type Item =
		| { kind: 'end'; text: string }
		| { kind: 'tool'; text: string; current?: boolean; side?: string; note?: string }
		| { kind: 'arrow'; label?: string };

	const items: Item[] = [
		{ kind: 'end', text: 'Source Program w/preprocessor directives' },
		{ kind: 'arrow' },
		{ kind: 'tool', text: 'Preprocessor' },
		{ kind: 'arrow', label: 'Source Program' },
		{ kind: 'tool', text: 'Compiler', current: true },
		{ kind: 'arrow', label: 'Target Assembly Program' },
		{ kind: 'tool', text: 'Assembler' },
		{ kind: 'arrow', label: 'Relocatable Object Code' },
		{ kind: 'tool', text: 'Linker', side: 'Libraries and Relocatable Object Files' },
		{ kind: 'arrow' },
		{ kind: 'end', text: 'Absolute Machine Code' }
	];
</script>

<div class="toolchain">
	<ol class="chain" aria-label="Toolchain, top to bottom">
		{#each items as item, i (i)}
			{@const row = `grid-row: ${i + 1}`}
			{#if item.kind === 'end'}
				<li class="end" style={row}>{item.text}</li>
			{:else if item.kind === 'tool'}
				<li class={['tool', { current: item.current }]} style={row}>
					{item.text}{#if item.side}<span class="visually-hidden"
							>, which also takes {item.side}</span
						>{/if}
				</li>
				{#if item.side}
					<li class="side" style={row} aria-hidden="true">
						<svg class="in-arrow" viewBox="0 0 28 12"><path d="M27 6H3M8 1.5 3 6l5 4.5" /></svg>
						<span>{item.side}</span>
					</li>
				{:else if item.current}
					<li class="side note" style={row} aria-hidden="true">{compilerNote}</li>
				{/if}
			{:else}
				<li class="arrow" style={row} aria-hidden={item.label ? undefined : 'true'}>
					<svg viewBox="0 0 12 28" aria-hidden="true"><path d="M6 1v24M1.5 20 6 25l4.5-5" /></svg>
					{#if item.label}<span class="visually-hidden">produces {item.label}</span>{/if}
				</li>
				{#if item.label}
					<li class="edge-label" style={row} aria-hidden="true">{item.label}</li>
				{/if}
			{/if}
		{/each}
	</ol>

	<aside class="aside">
		<div class="try">
			<p class="try-head">Try, e.g.,</p>
			<code class="cmd">gcc -v Prog.c</code>
			<p class="try-text">With -v, gcc prints the command it runs for each step.</p>
		</div>
		<div class="question">
			<CitationTag cite={{ deck: '03', slide: 17 }} />
			<p class="prompt">
				Code generation produces assembly code (usually), which is then assembled into an object
				module. What next to obtain an executable object?
			</p>
			<Disclosure>
				<p>
					Linking: the linker combines the relocatable object code with libraries and other
					relocatable object files into absolute machine code.
				</p>
			</Disclosure>
		</div>
	</aside>
</div>

<style>
	.toolchain {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 900px) {
		.toolchain {
			grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr);
			align-items: start;
		}
	}
	.chain {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		column-gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.end {
		grid-column: 1 / -1;
		color: var(--text-2);
		font-family: var(--font-serif);
		font-style: italic;
	}
	.tool {
		grid-column: 1;
		min-width: 9rem;
		padding: 6px 14px;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 600;
		text-align: center;
	}
	.tool.current {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.arrow {
		display: flex;
		grid-column: 1;
		justify-content: center;
		min-height: 36px;
		align-items: center;
	}
	.arrow svg {
		width: 12px;
		height: 28px;
	}
	svg path {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* Programs and files (what flows between the tools) are set like the slide's plain labels. */
	.edge-label {
		grid-column: 2;
		color: var(--text-2);
		font-family: var(--font-serif);
		font-style: italic;
		line-height: 1.3;
	}
	.side {
		display: flex;
		grid-column: 2;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	.side.note {
		justify-self: start;
		padding: 1px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.side:not(.note) span {
		font-family: var(--font-serif);
		font-style: italic;
	}
	.in-arrow {
		flex: none;
		width: 28px;
		height: 12px;
	}
	@media (min-width: 640px) {
		.chain {
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		}
		.end {
			grid-column: 2;
			text-align: center;
		}
		.tool,
		.arrow {
			grid-column: 2;
		}
		.edge-label {
			grid-column: 1;
			text-align: right;
		}
		.side {
			grid-column: 3;
		}
	}

	.aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.try {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.try-head {
		margin: 0 0 var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.cmd {
		display: inline-block;
		font-size: 0.9375rem;
		font-weight: 600;
	}
	.try-text {
		margin: var(--space-2) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.question {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.prompt {
		margin: 0;
		font-size: var(--text-sm);
	}
	.question :global(.disclosure) {
		align-self: stretch;
	}
	.question p {
		font-size: var(--text-sm);
	}
</style>
