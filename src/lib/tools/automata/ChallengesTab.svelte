<!--
@component
Two exercises on the machine in the editor: "What language?" compares an RE
with L(M); "Build a DFA" checks a drawing against a task.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import RegexField from '$lib/components/ui/RegexField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { formatString } from '$lib/theory/chars';
	import type { Automaton } from '$lib/theory/automata/types';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import {
		BUILD_CHALLENGES,
		buildTail,
		challengeById,
		checkBuild,
		checkGuess,
		guessTail,
		shortlexCompare
	} from './challenges';

	interface Props {
		machine: Automaton;
		/** The RE typed under "What language?". */
		guess: string;
		/** Id of the selected "Build a DFA" task. */
		challenge: string;
		/** Loads a string into the step-by-step run. */
		onrun: (input: string) => void;
		/** Replaces the machine with a blank one. */
		onblank: () => void;
	}

	let { machine, guess = $bindable(), challenge = $bindable(), onrun, onblank }: Props = $props();

	const guessResult = $derived(checkGuess(machine, guess));
	const diagnostics = $derived(guessResult.kind === 'empty' ? [] : guessResult.diagnostics);
	/** Strings in one language but not the other, shortest first. */
	const differences = $derived.by(() => {
		if (guessResult.kind !== 'differ') return [];
		const out: { witness: string; inMachine: boolean }[] = [];
		if (guessResult.onlyMachine !== null)
			out.push({ witness: guessResult.onlyMachine, inMachine: true });
		if (guessResult.onlyRegex !== null)
			out.push({ witness: guessResult.onlyRegex, inMachine: false });
		return out.sort((x, y) => shortlexCompare(x.witness, y.witness));
	});
	const regexLink = $derived(
		guess.trim() && guessResult.kind !== 'invalid' ? toolLink('regex', { re: guess }) : null
	);
	const regexTitle = toolBySlug('regex')?.title;

	const task = $derived(challengeById(challenge) ?? BUILD_CHALLENGES[0]);
	let checkedTask = $state<string | null>(null);
	const buildResult = $derived(checkedTask === task.id ? checkBuild(machine, task) : null);
	const options = BUILD_CHALLENGES.map((c) => ({ value: c.id, label: c.title }));
</script>

{#snippet runButton(s: string)}
	<button type="button" class="witness" title="Run it step by step" onclick={() => onrun(s)}
		>{formatString(s)}</button
	>
{/snippet}

<div class="challenges">
	<section aria-labelledby="what-language">
		<h3 id="what-language">What language?</h3>
		<p class="lede">
			Give a regular expression <var>R</var> with <var>L</var>(<var>R</var>) = <var>L</var>(<var
				>M</var
			>), the language of the machine above.
		</p>
		<RegexField label="R" size="md" bind:value={guess} {diagnostics} placeholder="e.g. (1 | 0)*1" />
		{#if guessResult.kind === 'same'}
			<Callout tone="success" title="Same language">
				<p><var>L</var>(<var>R</var>) = <var>L</var>(<var>M</var>).</p>
			</Callout>
		{:else if guessResult.kind === 'differ'}
			<Callout tone="error" title="Different languages">
				{#each differences as d (d.inMachine)}
					<p>{@render runButton(d.witness)}{guessTail(d.inMachine)}</p>
				{/each}
			</Callout>
		{:else if guessResult.kind === 'too-large'}
			<Callout tone="warn">This comparison is too large to run here.</Callout>
		{:else if guessResult.kind === 'no-machine'}
			<p class="hint">Add a state to the machine first.</p>
		{/if}
		{#if regexLink && regexTitle}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
			<p class="hint"><a href={regexLink}>Open R in {regexTitle}</a></p>
		{/if}
	</section>

	<section aria-labelledby="build-dfa">
		<h3 id="build-dfa">Build a DFA</h3>
		<Select label="Task" {options} bind:value={challenge} />
		<div class="task">
			<p>
				<var>Σ</var> = <span class="f">{task.alphabet}</span>. Draw a DFA for this language in the
				editor, then check it.
			</p>
			{#if task.cite}<CitationTag cite={task.cite} />{/if}
		</div>
		<div class="actions">
			<Button variant="primary" onclick={() => (checkedTask = task.id)}>Check</Button>
			<Button variant="ghost" onclick={onblank}>Start from a blank machine</Button>
		</div>
		{#if buildResult?.kind === 'no-machine'}
			<p class="hint">Add a state to the machine first.</p>
		{:else if buildResult?.kind === 'too-large'}
			<Callout tone="warn">This machine is too large to check here.</Callout>
		{:else if buildResult?.kind === 'checked'}
			{#if buildResult.correct && buildResult.determinism !== 'nfa'}
				<Callout tone="success" title="Correct">
					<p>The machine accepts exactly these strings.</p>
					{#if buildResult.determinism === 'partial-dfa'}
						<p>Its missing transitions go to the trap state.</p>
					{/if}
					<p>One RE for the language: <span class="f">{task.regex}</span></p>
				</Callout>
			{:else if buildResult.correct}
				<Callout tone="warn" title="Right language, but not a DFA">
					<p>
						The machine has ε-moves or several transitions on one symbol, so it is an NFA. The task
						asks for a DFA.
					</p>
				</Callout>
			{:else}
				<Callout tone="error" title="Not yet">
					<p>
						{@render runButton(buildResult.witness ?? '')}{buildTail(buildResult.shouldAccept)}
					</p>
					{#if buildResult.determinism === 'nfa'}
						<p>Also, the machine is an NFA; the task asks for a DFA.</p>
					{/if}
				</Callout>
			{/if}
			<p class="hint">The result follows your edits.</p>
		{/if}
	</section>
</div>

<style>
	.challenges {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	section + section {
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}
	h3 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.lede,
	.task p {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.task {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}
	var {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.05em;
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.witness {
		padding: 0 4px;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.95em;
		font-variant-ligatures: none;
		cursor: pointer;
	}
	.witness:hover {
		border-color: var(--accent);
	}
</style>
