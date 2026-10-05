<!--
	The generated C code in the layout of slide 34, with the line being executed
	marked and the expression on it that the step executes. Long programs scroll
	inside their own box, which follows the line being executed.
-->
<script lang="ts">
	import type { CodePiece, Program } from './limited';
	import Pieces from './Pieces.svelte';

	interface Props {
		program: Program;
		/** Line being executed, or null. */
		line?: number | null;
		/** Expression being executed on that line, or null. */
		site?: number | null;
		/** What that expression returned, when the step has a value. */
		result?: boolean | null;
		/** Expressions of the calls in progress around it. */
		chain?: readonly number[];
		/** Other lines to mark lightly (the body of match while a match runs). */
		also?: readonly number[];
		maxHeight?: string;
	}

	let {
		program,
		line = null,
		site = null,
		result = null,
		chain = [],
		also = [],
		maxHeight = '34rem'
	}: Props = $props();

	/** Each line as runs of pieces that belong to one expression (or to none). */
	const rows = $derived(
		program.lines.map((l) => {
			const runs: { site: number | null; pieces: CodePiece[] }[] = [];
			for (const piece of l.pieces) {
				const id = piece.site ?? null;
				const last = runs[runs.length - 1];
				if (last && last.site === id) last.pieces.push(piece);
				else runs.push({ site: id, pieces: [piece] });
			}
			return runs;
		})
	);
	const inChain = $derived(new Set(chain));
	const marked = $derived(new Set(also));

	let box: HTMLDivElement | undefined = $state();

	// Keep the executing line, and the expression on it, inside the box.
	$effect(() => {
		const el = box;
		const at = line;
		void site;
		if (!el || at === null) return;
		const row = el.querySelector<HTMLElement>(`[data-line="${at}"]`);
		if (!row) return;
		const pad = row.offsetHeight;
		if (row.offsetTop - pad < el.scrollTop) el.scrollTop = Math.max(0, row.offsetTop - pad);
		else if (row.offsetTop + 2 * pad > el.scrollTop + el.clientHeight)
			el.scrollTop = row.offsetTop + 2 * pad - el.clientHeight;
		const target = row.querySelector<HTMLElement>('.site.now');
		if (!target) return;
		const left = target.offsetLeft;
		const right = left + target.offsetWidth;
		if (left - 16 < el.scrollLeft) el.scrollLeft = Math.max(0, left - 16);
		else if (right + 16 > el.scrollLeft + el.clientWidth)
			el.scrollLeft = right + 16 - el.clientWidth;
	});
</script>

<!-- A box that scrolls must be reachable from the keyboard. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="code"
	bind:this={box}
	style:max-height={maxHeight}
	role="group"
	aria-label="Generated C code"
	tabindex="0"
>
	<ol>
		{#each rows as runs, i (i)}
			<li
				data-line={i}
				class={{ current: i === line, also: marked.has(i) && i !== line }}
				aria-current={i === line ? 'step' : undefined}
			>
				<code
					>{#each runs as run, k (k)}{#if run.site === null}<Pieces
								pieces={run.pieces}
								code
							/>{:else}<span
								class={[
									'site',
									{
										now: run.site === site && i === line,
										yes: run.site === site && i === line && result === true,
										no: run.site === site && i === line && result === false,
										open: inChain.has(run.site)
									}
								]}><Pieces pieces={run.pieces} code /></span
							>{/if}{/each}{#if runs.length === 0}&nbsp;{/if}</code
				>
			</li>
		{/each}
	</ol>
</div>

<style>
	.code {
		position: relative;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		scrollbar-width: thin;
	}
	.code:focus-visible {
		outline-offset: 1px;
	}
	ol {
		min-width: max-content;
		margin: 0;
		padding: 8px 0;
		list-style: none;
	}
	li {
		position: relative;
		padding: 0 16px 0 14px;
		border-left: 3px solid transparent;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.85;
		white-space: pre;
		transition: background var(--duration) var(--ease);
	}
	li.current {
		border-left-color: var(--active);
		background: color-mix(in srgb, var(--active-soft) 70%, transparent);
	}
	li.also {
		border-left-color: var(--border-strong);
		background: var(--surface-3);
	}
	/* Not the inline-code chip of app.css: the row's own background shows the current line. */
	code {
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
		color: var(--text);
		font-size: inherit;
	}
	.site {
		padding: 2px 1px;
		border-radius: 3px;
		box-shadow: inset 0 -2px 0 transparent;
	}
	.site.open {
		box-shadow: inset 0 -2px 0 var(--border-strong);
	}
	.site.now {
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
		font-weight: 650;
	}
	.site.now.yes {
		background: var(--accept-soft);
		box-shadow: inset 0 -2px 0 var(--accept);
	}
	.site.now.no {
		background: var(--reject-soft);
		box-shadow: inset 0 -2px 0 var(--reject);
	}
</style>
