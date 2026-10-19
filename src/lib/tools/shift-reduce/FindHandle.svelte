<!--
	"Find the handle" on one sentential form: select a run of symbols (or, for
	an ε-production, the place of an empty handle) and check it against the
	definition of a handle (Bottom-Up Parsing, slides 4 and 11).
-->
<script lang="ts">
	import { Button, Callout, Toggle } from '$lib/components/ui';
	import { symbolText } from '$lib/components/grammar/lr-item';
	import type { Grammar, HandleStep } from '$lib/theory/grammar';
	import { checkPick, describeVerdict, type Span, type VerdictText } from './handle-check';
	import { formView } from './view';

	interface Props {
		grammar: Grammar;
		/** The form to search; it has a handle (it is not the start symbol). */
		step: HandleStep;
		/** Goes on to the next form, once the handle is found. */
		onreduce?: () => void;
	}

	let { grammar, step, onreduce }: Props = $props();

	const uid = $props.id();
	let pick = $state<Span | null>(null);
	let empty = $state(false);
	let answer = $state<VerdictText | null>(null);
	/** The one button of the group in the tab order. */
	let focusAt = $state(0);
	let group: HTMLDivElement | undefined = $state();

	const symbols = $derived(step.form.map(symbolText));
	const hasEpsilon = $derived(grammar.productions.some((p) => p.rhs.length === 0));
	const buttons = $derived(empty ? symbols.length + 1 : symbols.length);

	// A new form, or the other kind of pick, starts afresh.
	$effect.pre(() => {
		void step;
		void empty;
		pick = null;
		answer = null;
		focusAt = 0;
	});

	function toggle(i: number) {
		answer = null;
		if (empty) {
			pick = pick?.start === i ? null : { start: i, end: i };
			return;
		}
		if (!pick) pick = { start: i, end: i + 1 };
		else if (i < pick.start) pick = { start: i, end: pick.end };
		else if (i >= pick.end) pick = { start: pick.start, end: i + 1 };
		else if (pick.end - pick.start === 1) pick = null;
		else if (i === pick.start) pick = { start: i + 1, end: pick.end };
		else if (i === pick.end - 1) pick = { start: pick.start, end: i };
		else pick = { start: i, end: i + 1 };
	}

	const selected = (i: number) => !!pick && !empty && i >= pick.start && i < pick.end;

	function onkeydown(event: KeyboardEvent) {
		let next: number | null = null;
		if (event.key === 'ArrowRight') next = Math.min(buttons - 1, focusAt + 1);
		else if (event.key === 'ArrowLeft') next = Math.max(0, focusAt - 1);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = buttons - 1;
		if (next === null) return;
		event.preventDefault();
		focusAt = next;
		group?.querySelector<HTMLButtonElement>(`[data-at="${next}"]`)?.focus();
	}

	function check() {
		if (!pick) return;
		answer = describeVerdict(grammar, step, pick, checkPick(grammar, step, pick));
	}

	const gapName = (i: number) =>
		i === 0
			? `Empty handle before ${symbols[0] ?? 'the end'}`
			: i === symbols.length
				? `Empty handle after ${symbols[i - 1]}`
				: `Empty handle between ${symbols[i - 1]} and ${symbols[i]}`;

	const split = $derived.by(() => {
		if (!pick || !answer?.correct) return null;
		return {
			alpha: formView(step.form.slice(0, pick.start)).text,
			beta: formView(step.form.slice(pick.start, pick.end)).text,
			gamma: formView(step.form.slice(pick.end)).text
		};
	});
</script>

<div class="find">
	<p class="prompt" id="{uid}-prompt">
		{empty
			? 'Choose the place of the empty handle, then check it.'
			: 'Select the symbols of the handle, then check them.'}
	</p>
	<div class="symbols" role="group" aria-labelledby="{uid}-prompt" bind:this={group}>
		{#if empty}
			{#each symbols as text, i (i)}
				<button
					type="button"
					class={['gap', { on: pick?.start === i }]}
					data-at={i}
					tabindex={focusAt === i ? 0 : -1}
					aria-pressed={pick?.start === i}
					aria-label={gapName(i)}
					onclick={() => toggle(i)}
					{onkeydown}
					onfocus={() => (focusAt = i)}><span aria-hidden="true">↑</span></button
				><span class="plain">{text}</span>
			{/each}
			<button
				type="button"
				class={['gap', { on: pick?.start === symbols.length }]}
				data-at={symbols.length}
				tabindex={focusAt === symbols.length ? 0 : -1}
				aria-pressed={pick?.start === symbols.length}
				aria-label={gapName(symbols.length)}
				onclick={() => toggle(symbols.length)}
				{onkeydown}
				onfocus={() => (focusAt = symbols.length)}><span aria-hidden="true">↑</span></button
			>
		{:else}
			{#each symbols as text, i (i)}
				<button
					type="button"
					class={['symbol', { on: selected(i) }]}
					data-at={i}
					tabindex={focusAt === i ? 0 : -1}
					aria-pressed={selected(i)}
					onclick={() => toggle(i)}
					{onkeydown}
					onfocus={() => (focusAt = i)}>{text}</button
				>
			{/each}
		{/if}
	</div>
	<p class="keys">
		{empty
			? 'Arrow keys move between the places; Enter or Space chooses one.'
			: 'Arrow keys move between the symbols; Enter or Space adds a symbol to the selection or takes an end symbol off it.'}
	</p>
	{#if hasEpsilon}
		<Toggle bind:checked={empty} label="The handle is empty (ε)" />
	{/if}
	<div class="actions">
		<Button size="sm" variant="primary" disabled={!pick} onclick={check}>Check</Button>
		<Button
			size="sm"
			variant="ghost"
			disabled={!pick}
			onclick={() => {
				pick = null;
				answer = null;
			}}>Clear</Button
		>
	</div>
	<div aria-live="polite">
		{#if answer}
			<Callout tone={answer.correct ? 'success' : 'warn'} title={answer.title}>
				<p>{answer.text}</p>
				{#if split}
					<p class="split">
						<span><i>α</i> = {split.alpha}</span>
						<span class="beta"><i>β</i> = {split.beta}</span>
						<span><i>γ</i> = {split.gamma}</span>
					</p>
				{/if}
				{#if answer.correct && onreduce}
					<div class="reduce">
						<Button size="sm" onclick={onreduce}>Reduce it</Button>
					</div>
				{/if}
			</Callout>
		{/if}
	</div>
</div>

<style>
	.find {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		min-width: 0;
	}
	.prompt,
	.keys {
		margin: 0;
		font-size: var(--text-sm);
	}
	.keys {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.symbols {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		max-width: 100%;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.symbol,
	.gap {
		min-width: 28px;
		min-height: 32px;
		padding: 2px 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 1rem;
		cursor: pointer;
	}
	.gap {
		min-width: 24px;
		padding: 2px 4px;
		border-style: dashed;
		color: var(--text-3);
	}
	.symbol:hover,
	.gap:hover {
		background: var(--surface-2);
	}
	.symbol.on,
	.gap.on {
		border-color: var(--reject);
		background: var(--reject-soft);
		color: var(--reject);
		font-weight: 600;
	}
	.symbol:focus-visible,
	.gap:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.plain {
		padding: 0 2px;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
	}
	.split {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-5);
		margin-top: var(--space-2);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.split i {
		font-family: var(--font-serif);
	}
	.beta {
		color: var(--reject);
		font-weight: 600;
	}
	.reduce {
		margin-top: var(--space-2);
	}
</style>
