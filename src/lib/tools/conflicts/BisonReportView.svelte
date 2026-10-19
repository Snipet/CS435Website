<!--
	Parser.output, the report `bison –v Parser.yy -o Parser.cc` writes
	(Bottom-up Parsing III, slide 28), for the grammar and declarations of the
	page (bison-report.ts). bison builds the LALR(1) automaton; each state says
	which LR(1) states of the decks' automaton it merges.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Icon } from '$lib/components/ui';
	import type { BisonReport } from './bison-report';
	import { listText } from './view';

	interface Props {
		report: BisonReport;
		/** States of the LR(1) automaton. */
		lr1States: number;
		/** Non-terminals bison would remove first. */
		useless: readonly string[];
	}

	let { report, lr1States, useless }: Props = $props();

	const uid = $props.id();
	let box: HTMLDivElement | undefined = $state();
	let copied = $state(false);

	const mergedCount = $derived(report.states.filter((s) => s.merged.length > 1).length);
	/** The command of slide 28 and what bison prints. */
	const run = $derived(['bison –v Parser.yy -o Parser.cc', ...report.messages].join('\n'));

	/** Scrolls the box to bison's state `n` and focuses it. */
	export async function show(n: number) {
		await tick();
		const el = box?.querySelector<HTMLElement>(`[data-state="${n}"]`);
		if (!el || !box) return;
		// The box is positioned, so a state's offsetTop is measured from it.
		box.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
		box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		el.focus({ preventScroll: true });
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(report.text);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}
</script>

<!-- A line of the report, ending in its newline, with each item dot drawn as the red bullet. -->
{#snippet line(text: string)}{#each `${text}\n`.split('•') as part, i (i)}{#if i}<span class="dot"
				>•</span
			>{/if}{part}{/each}{/snippet}

<div class="report">
	<p class="note">
		bison builds the LALR(1) automaton, not the canonical LR(1) automaton of the slides: it merges
		the LR(1) states whose items differ only in their lookaheads. The LR(1) automaton here has {lr1States}
		states, the LALR(1) automaton {report.states.length - 1}, and bison adds one more, which accepts
		after shifting <code>$end</code>.
		{#if mergedCount}
			{mergedCount} of bison’s states {mergedCount === 1 ? 'merges' : 'merge'} LR(1) states; each says
			which.
		{/if}
		State numbers are bison’s for a Parser.yy that declares the terminals other than single characters
		with <code>%token</code>, then the precedence lines, then the rules in the order of the grammar.
	</p>
	{#if useless.length}
		<p class="note">
			bison first removes the rules of {listText(useless)}, which {useless.length === 1
				? 'derives'
				: 'derive'} nothing or cannot be reached; this report keeps them.
		</p>
	{/if}

	<div class="run">
		<pre class="terminal"><span class="prompt" aria-hidden="true">$ </span>{run}</pre>
		<Button size="sm" onclick={copy}>
			{#snippet icon()}<Icon name={copied ? 'check' : 'copy'} size={14} />{/snippet}
			{copied ? 'Copied' : 'Copy Parser.output'}
		</Button>
	</div>

	<!-- Focusable so that the keyboard can scroll the report. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="file" bind:this={box} role="region" aria-label="Parser.output" tabindex="0">
		{#each report.head as section (section.title)}
			<pre class="section">{#each section.lines as l, i (i)}{@render line(l)}{/each}</pre>
		{/each}
		{#each report.states as state (state.number)}
			<section
				class={['state', { conflicted: state.sr || state.rr }]}
				data-state={state.number}
				tabindex="-1"
				aria-labelledby="{uid}-s{state.number}"
			>
				<div class="state-head">
					<h4 id="{uid}-s{state.number}">State {state.number}</h4>
					<span class="origin">
						{#if state.lalr === null}
							added by bison: accepts after <code>$end</code>
						{:else if state.merged.length > 1}
							merges LR(1) states {listText(state.merged)}
						{:else}
							LR(1) state {state.merged[0]}
						{/if}
					</span>
				</div>
				<pre>{#each state.lines.slice(2) as l, i (i)}{@render line(l)}{/each}</pre>
			</section>
		{/each}
	</div>
</div>

<style>
	.report {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	code {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.run {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-3);
	}
	.terminal {
		flex: 1 1 22rem;
		min-width: 0;
		margin: 0;
		padding: 8px 12px;
		position: relative;
		overflow-x: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	.prompt {
		color: var(--text-3);
	}
	.file {
		max-height: min(40rem, 70vh);
		position: relative;
		overflow: auto;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		scrollbar-width: thin;
	}
	.file:focus-visible,
	.state:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-ligatures: none;
		line-height: 1.55;
		white-space: pre;
	}
	/* The head sections and the states line up, as in the file; a state with conflicts is marked. */
	.section,
	.state {
		padding-left: var(--space-2);
		border-left: 3px solid transparent;
	}
	.section {
		margin-bottom: 1.55em;
	}
	.state {
		margin-bottom: 1.55em;
	}
	.state pre {
		margin-top: 0.4em;
	}
	.state.conflicted {
		border-left-color: var(--active);
	}
	.state-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	h4 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0;
	}
	.origin {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.dot {
		color: var(--reject);
		font-weight: 700;
	}
</style>
