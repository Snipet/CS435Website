<script lang="ts">
	import CitationTag from '$lib/components/ui/CitationTag.svelte';

	interface Row {
		input: string[];
		bold: boolean;
		box: string;
		boxBold?: boolean;
		output: string;
		outBold: boolean;
	}

	// Lexical Analysis III (cont'd), slide 3.
	const rows: Row[] = [
		{
			input: ['Flex spec', 'scanner.l'],
			bold: true,
			box: 'Flex',
			output: 'lex.yy.c',
			outBold: true
		},
		{ input: ['lex.yy.c'], bold: true, box: 'C/C++ compiler', output: 'a.out', outBold: true },
		{
			input: ['input stream'],
			bold: false,
			box: 'a.out',
			boxBold: true,
			output: 'sequence of tokens',
			outBold: false
		}
	];

	// Slide 8.
	const commands = ['flex spec.l', 'gcc lex.yy.c -lfl', './a.out < data.txt'];
</script>

{#snippet arrow()}
	<svg class="arrow" viewBox="0 0 40 12" aria-hidden="true">
		<path d="M1 6h36M32 1.5 37 6l-5 4.5" />
	</svg>
{/snippet}

<figure class="build" aria-labelledby="build-caption">
	<div class="stages">
		<ol class="rows">
			{#each rows as row, i (i)}
				<li class="row">
					<span class="visually-hidden"
						>{row.input.join(' ')}, through {row.box}, gives {row.output}</span
					>
					<span class="io in" aria-hidden="true">
						{#each row.input as part, k (k)}
							<span class={{ file: row.bold && k === row.input.length - 1 }}>{part}</span>
						{/each}
					</span>
					{@render arrow()}
					<span class={['box', { file: row.boxBold }]} aria-hidden="true">{row.box}</span>
					{@render arrow()}
					<span class={['io', 'out', { file: row.outBold }]} aria-hidden="true">{row.output}</span>
				</li>
			{/each}
		</ol>
	</div>
	<div class="commands">
		<p class="label" id="build-commands">Build and run</p>
		<pre class="term" aria-labelledby="build-commands"><code
				>{#each commands as cmd, i (i)}<span class="line"
						><span class="prompt" aria-hidden="true">$ </span>{cmd}</span
					>{/each}</code
			></pre>
		<p class="note">On macOS, link with <code>-ll</code> instead of <code>-lfl</code>.</p>
	</div>
	<figcaption id="build-caption">
		<span
			>How a flex scanner is built. This page runs the spec and data.txt below in the browser, the
			way <code>./a.out &lt; data.txt</code> would.</span
		>
		<span class="cites">
			<CitationTag cite={{ deck: '07', slide: 3 }} />
			<CitationTag cite={{ deck: '07', slide: 8 }} />
		</span>
	</figcaption>
</figure>

<style>
	.build {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
		margin: 0;
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	@media (min-width: 900px) {
		.build {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}
	}
	.rows {
		--cols: 7.5rem 40px 10rem 40px 9rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: grid;
		grid-template-columns: var(--cols);
		align-items: center;
		gap: var(--space-2);
	}
	.io {
		display: flex;
		flex-direction: column;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.3;
	}
	.in {
		align-items: flex-end;
		text-align: right;
	}
	.file {
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.box {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 9.5rem;
		min-height: 2.25rem;
		padding: 4px 12px;
		border: 1px solid color-mix(in srgb, var(--info) 45%, var(--border));
		border-radius: var(--radius);
		background: var(--info-soft);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
		text-align: center;
	}
	.box.file {
		font-size: 0.8125rem;
	}
	.arrow {
		width: 40px;
		height: 12px;
		fill: none;
		stroke: var(--text-3);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.commands {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.label {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.term {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		color: var(--text);
		font-size: 0.8125rem;
		line-height: 1.7;
	}
	.line {
		display: block;
	}
	.prompt {
		color: var(--text-3);
		user-select: none;
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		grid-column: 1 / -1;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.cites {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	@media (max-width: 720px) {
		.rows {
			--cols: minmax(0, 1fr) 28px minmax(0, 1.3fr) 28px minmax(0, 1fr);
		}
		.arrow {
			width: 28px;
		}
		.box {
			min-width: 0;
		}
	}
	@media (max-width: 560px) {
		.build {
			padding: var(--space-3);
		}
		.rows {
			--cols: minmax(0, 1fr) 20px minmax(0, 1.3fr) 20px minmax(0, 1fr);
		}
		.row {
			gap: 4px;
		}
		.arrow {
			width: 20px;
		}
		.box {
			padding: 4px 6px;
			font-size: var(--text-xs);
		}
		.io,
		.file,
		.box.file {
			font-size: var(--text-xs);
			overflow-wrap: anywhere;
		}
	}
</style>
