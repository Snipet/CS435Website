<!--
	Pseudocode as a slide writes it, one line per row, with the line that runs
	marked (and lines that are running around it, such as Transition's
	`return Closure(Items)` while Closure runs, marked more quietly). The dot of
	an item is red, as in the decks. A listing wider than its box scrolls, and
	takes focus so the keyboard can scroll it.
-->
<script lang="ts">
	interface Props {
		lines: readonly string[];
		/** Lines that run now. */
		active?: readonly number[];
		/** Lines that are running around the active ones (a call in progress). */
		outer?: readonly number[];
		/** Accessible name of the listing. */
		label: string;
	}

	let { lines, active = [], outer = [], label }: Props = $props();

	const on = $derived(new Set(active));
	const around = $derived(new Set(outer));
	const parts = (line: string) => line.split(/(•)/u);
</script>

<!-- A scrolling region takes focus so the keyboard can scroll it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<ol class="code" aria-label={label} tabindex="0">
	{#each lines as line, i (i)}
		<li
			class={{ active: on.has(i), outer: around.has(i) && !on.has(i) }}
			aria-current={on.has(i) ? 'step' : undefined}
		>
			<span class="mark" aria-hidden="true">{on.has(i) ? '▶' : ''}</span><span class="text"
				>{#each parts(line) as part, k (k)}{#if part === '•'}<span class="dot">•</span
						>{:else}{part}{/if}{/each}</span
			>
		</li>
	{/each}
</ol>

<style>
	.code {
		margin: 0;
		padding: var(--space-2) 0;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		line-height: 1.7;
		list-style: none;
	}
	.code:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	li {
		display: flex;
		min-width: max-content;
		padding-right: var(--space-3);
		border-left: 3px solid transparent;
	}
	.mark {
		flex: none;
		width: 1.6em;
		color: var(--active);
		font-size: 0.75em;
		text-align: center;
	}
	.text {
		white-space: pre;
	}
	li.active {
		border-left-color: var(--active);
		background: var(--active-soft);
		font-weight: 600;
	}
	li.outer {
		border-left-color: var(--border-strong);
		background: var(--surface-3);
	}
	.dot {
		color: var(--reject);
		font-weight: 700;
	}
</style>
