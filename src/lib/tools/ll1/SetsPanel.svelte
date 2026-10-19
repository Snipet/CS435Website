<!--
	First and Follow of every symbol (Table-based Predictive Parsing, slides
	20–23): a table of the non-terminals (the terminals in a part that opens),
	stepped rule by rule and pass by pass until a pass changes nothing, or left
	for the user to fill in ("First( E ) = ?") and checked member by member.
-->
<script lang="ts">
	import { Button, StepControls, type Stepper } from '$lib/components/ui';
	import { printSet, printSymbols, type FirstFollow, type Grammar } from '$lib/theory/grammar';
	import type { SetRef } from './model';
	import {
		checkAnswer,
		memberText,
		passSummaries,
		readAnswer,
		setName,
		setsAt,
		stepContext,
		stepText,
		type SetKind,
		type SetStep
	} from './sets';

	interface Props {
		grammar: Grammar;
		ff: FirstFollow;
		steps: readonly SetStep[];
		stepper: Stepper;
		/** The cells are left for the user to fill in. */
		fill: boolean;
		/** Sets to mark: the ones the selected table entry uses. */
		used?: readonly SetRef[];
	}

	let { grammar, ff, steps, stepper, fill, used = [] }: Props = $props();

	const KINDS: readonly SetKind[] = ['first', 'follow'];
	const isNonterminal = $derived(new Set(grammar.nonterminals));
	const nonterminals = $derived([...ff.first.keys()].filter((s) => isNonterminal.has(s)));
	const terminals = $derived([...ff.first.keys()].filter((s) => !isNonterminal.has(s)));

	const index = $derived(stepper.index);
	const step = $derived(steps[index]);
	const at = $derived(setsAt(grammar, ff, steps, index));
	const passes = $derived(passSummaries(steps));
	const pass = $derived(passes.find((p) => index >= p.start && index <= p.end) ?? passes[0]);
	const log = $derived(
		pass ? steps.slice(pass.start, pass.end + 1).map((s, i) => ({ s, i: pass.start + i })) : []
	);

	/** The set the current step adds to, and what it adds. */
	const growing = $derived(
		step?.kind === 'rule' && !fill
			? { kind: step.phase, symbol: step.rule.target, added: new Set(step.rule.added) }
			: null
	);
	const isUsed = (kind: SetKind, symbol: string) =>
		used.some((u) => u.kind === kind && u.symbol === symbol);

	const valueOf = (kind: SetKind, symbol: string): string[] | null =>
		(kind === 'first' ? at.first : at.follow)?.get(symbol) ?? null;
	const finalOf = (kind: SetKind, symbol: string): string[] =>
		(kind === 'first' ? ff.first : ff.follow).get(symbol) ?? [];

	// ── fill-in ──
	let answers = $state<Record<string, string>>({});
	let checked = $state<Record<string, boolean>>({});
	const key = (kind: SetKind, symbol: string) => `${kind}\u0000${symbol}`;
	const everyCell = $derived(
		[...nonterminals, ...terminals].flatMap((s) => KINDS.map((kind) => ({ kind, symbol: s })))
	);
	const results = $derived(
		Object.fromEntries(
			everyCell.map(({ kind, symbol }) => {
				const k = key(kind, symbol);
				const text = answers[k] ?? '';
				if (!checked[k] || text.trim() === '') return [k, null];
				const answer = readAnswer(text);
				return [k, { answer, check: checkAnswer(answer, finalOf(kind, symbol)) }];
			})
		)
	);
	const score = $derived.by(() => {
		const done = Object.values(results).filter((r) => r !== null);
		return { checked: done.length, correct: done.filter((r) => r!.check.correct).length };
	});

	function checkAll() {
		const next: Record<string, boolean> = {};
		for (const { kind, symbol } of everyCell) {
			const k = key(kind, symbol);
			if ((answers[k] ?? '').trim() !== '') next[k] = true;
		}
		checked = next;
	}
	function showAnswers() {
		const next: Record<string, string> = {};
		const marks: Record<string, boolean> = {};
		for (const { kind, symbol } of everyCell) {
			next[key(kind, symbol)] = printSet(finalOf(kind, symbol));
			marks[key(kind, symbol)] = true;
		}
		answers = next;
		checked = marks;
	}
	function clear() {
		answers = {};
		checked = {};
	}
	function edit(k: string, value: string) {
		answers[k] = value;
		if (checked[k]) checked[k] = false;
	}

	let terminalsOpen = $state(false);
	const ownsCurrent = $derived(growing !== null && terminals.includes(growing.symbol));

	// Keep the current step of the log in view, inside the log only.
	let logBox: HTMLOListElement | undefined = $state();
	$effect(() => {
		const box = logBox;
		void index;
		const item = box?.querySelector<HTMLElement>('[aria-current="step"]');
		if (!box || !item) return;
		const top = item.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
		if (top < box.scrollTop) box.scrollTop = top - 4;
		else if (top + item.offsetHeight > box.scrollTop + box.clientHeight)
			box.scrollTop = top + item.offsetHeight - box.clientHeight + 4;
	});
</script>

{#snippet setValue(kind: SetKind, symbol: string)}
	{@const value = valueOf(kind, symbol)}
	{@const mine = growing?.kind === kind && growing.symbol === symbol}
	{#if value === null}
		<span class="pending" aria-label="not computed yet">–</span>
	{:else}
		<span class="set mono"
			>{'{ '}{#each value as m, i (m)}{i > 0 ? ', ' : ''}<span
					class={{ new: mine && growing?.added.has(m) }}>{memberText(m)}</span
				>{/each}{value.length > 0 ? ' }' : '}'}</span
		>
	{/if}
	{#if mine}<span class="visually-hidden">(this step adds to it)</span>{/if}
{/snippet}

{#snippet answerCell(kind: SetKind, symbol: string)}
	{@const k = key(kind, symbol)}
	{@const result = results[k]}
	<div class="answer">
		<input
			class="mono"
			type="text"
			value={answers[k] ?? ''}
			placeholder="?"
			spellcheck="false"
			autocapitalize="off"
			autocomplete="off"
			aria-label={setName(kind, symbol)}
			aria-invalid={result ? !result.check.correct : undefined}
			oninput={(e) => edit(k, e.currentTarget.value)}
			onkeydown={(e) => {
				if (e.key === 'Enter' && (answers[k] ?? '').trim() !== '') checked[k] = true;
			}}
		/>
		{#if result}
			<p class="marks" aria-live="polite">
				{#if result.answer.error}
					<span class="wrong">{result.answer.error}</span>
				{:else if result.check.correct}
					<span class="right">✓ Right</span>
				{:else}
					{#each result.check.marks as m (m.member)}
						<span class={m.ok ? 'member ok' : 'member bad'}
							>{memberText(m.member)}<span class="visually-hidden"
								>{m.ok ? ' is in the set' : ' is not in the set'}</span
							></span
						>
					{/each}
					{#if result.check.missing > 0}
						<span class="missing">{result.check.missing} missing</span>
					{/if}
				{/if}
			</p>
		{/if}
	</div>
{/snippet}

{#snippet rows(symbols: readonly string[])}
	{#each symbols as symbol (symbol)}
		<tr>
			<th scope="row" class="mono">{printSymbols([symbol])}</th>
			{#each KINDS as kind (kind)}
				<td
					class={{
						growing: growing?.kind === kind && growing.symbol === symbol,
						used: !fill && isUsed(kind, symbol)
					}}
				>
					{#if fill}{@render answerCell(kind, symbol)}{:else}{@render setValue(kind, symbol)}{/if}
				</td>
			{/each}
		</tr>
	{/each}
{/snippet}

{#snippet head(caption: string)}
	<caption class="visually-hidden">{caption}</caption>
	<thead>
		<tr>
			<th scope="col" class="mono">X</th>
			<th scope="col" class="mono">First(X)</th>
			<th scope="col" class="mono">Follow(X)</th>
		</tr>
	</thead>
{/snippet}

<div class="sets">
	{#if fill}
		<div class="fill-bar">
			<p class="hint">
				Type each set, for example <code>{'{ (, int }'}</code> or <code>+ ε</code>, and check it.
				{#if score.checked > 0}
					<span class="score" aria-live="polite"
						>{score.correct} of {score.checked} checked are right.</span
					>
				{/if}
			</p>
			<div class="buttons">
				<Button size="sm" variant="primary" onclick={checkAll}>Check</Button>
				<Button size="sm" onclick={showAnswers}>Show answers</Button>
				<Button size="sm" variant="ghost" onclick={clear}>Clear</Button>
			</div>
		</div>
	{:else}
		<StepControls {stepper} ariaLabel="First and Follow steps" noun="Step">
			{#snippet label(i: number)}
				{@const s = steps[i]}
				{#if s}
					{@const t = stepText(grammar, s, setsAt(grammar, ff, steps, i))}
					<span class="step-label">
						<span class="where"
							>{s.phase === 'first' ? 'First' : 'Follow'}, pass {s.kind === 'rule'
								? s.rule.pass
								: s.pass}{#if stepContext(grammar, s)}
								· <span class="mono">{stepContext(grammar, s)}</span>{/if}</span
						>
						<span class="mono rule">{t.rule}</span>
						{#if t.result}<span class="result">{t.result}</span>{/if}
					</span>
				{/if}
			{/snippet}
		</StepControls>

		<div class="passes" role="group" aria-label="Passes">
			{#each KINDS as kind (kind)}
				<div class="pass-row">
					<span class="phase">{kind === 'first' ? 'First' : 'Follow'}</span>
					{#each passes.filter((p) => p.phase === kind) as p (p.start)}
						<button
							type="button"
							class={['pass', { current: p === pass, still: p.added === 0 && p.pass > 0 }]}
							aria-current={p === pass ? 'step' : undefined}
							onclick={() => {
								stepper.pause();
								stepper.set(p.start);
							}}
						>
							Pass {p.pass}
							<span class="gain"
								>{p.pass === 0 ? 'start' : p.added === 0 ? 'no change' : `+${p.added}`}</span
							>
						</button>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	<div class={['body', { fill }]}>
		<div class="tables">
			<div class="scroll">
				<table>
					{@render head('First and Follow of the non-terminals')}
					<tbody>{@render rows(nonterminals)}</tbody>
				</table>
			</div>
			{#if terminals.length > 0}
				<details bind:open={terminalsOpen}>
					<summary>
						Terminals
						{#if ownsCurrent && !terminalsOpen}<span class="note">(this step changes one)</span
							>{/if}
					</summary>
					<div class="scroll">
						<table>
							{@render head('First and Follow of the terminals')}
							<tbody>{@render rows(terminals)}</tbody>
						</table>
					</div>
				</details>
			{/if}
		</div>

		{#if !fill && log.length > 0}
			<ol class="log" bind:this={logBox} aria-label="Steps of this pass">
				{#each log as { s, i }, k (i)}
					{@const ctx = stepContext(grammar, s)}
					{#if ctx && (k === 0 || stepContext(grammar, log[k - 1].s) !== ctx)}
						<li class="production mono" aria-hidden="true">{ctx}</li>
					{/if}
					<li>
						<button
							type="button"
							class={{ later: i > index, added: s.kind === 'rule' && s.rule.added.length > 0 }}
							aria-current={i === index ? 'step' : undefined}
							onclick={() => {
								stepper.pause();
								stepper.set(i);
							}}
						>
							{#if s.kind === 'rule'}
								<span class="mono">{s.rule.text}</span>
								{#if s.rule.added.length > 0 && s.rule.rule !== 'first-terminal'}
									<span class="plus mono"
										>+ {s.rule.added.map((m) => memberText(m)).join(', ')}</span
									>
								{/if}
							{:else}
								<span>Pass {s.pass} changes nothing: done.</span>
							{/if}
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

<style>
	.sets {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		container: sets / inline-size;
	}
	.step-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.where {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.rule {
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.result {
		color: var(--text-2);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.passes {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.pass-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}
	.phase {
		width: 3.5rem;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.pass {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 2px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-2);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.pass:hover {
		border-color: var(--border-strong);
	}
	.pass.current {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--text);
	}
	.gain {
		color: var(--text-3);
	}
	.pass.still .gain {
		color: var(--accept);
		font-weight: 600;
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		min-width: 0;
	}
	.tables {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.scroll {
		max-width: 100%;
		position: relative;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 4px 10px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}
	thead th {
		border-bottom: 1px solid var(--border-strong);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}
	tbody th {
		width: 3.5rem;
		font-weight: 600;
		white-space: nowrap;
	}
	td.used {
		background: var(--info-soft);
		box-shadow: inset 3px 0 0 var(--info);
	}
	td.growing {
		background: var(--active-soft);
		box-shadow: inset 3px 0 0 var(--active);
	}
	.set {
		white-space: nowrap;
	}
	.new {
		font-weight: 700;
		text-decoration: underline 2px var(--active);
		text-underline-offset: 3px;
	}
	.pending {
		color: var(--text-3);
	}
	details summary {
		width: fit-content;
		color: var(--text-2);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.note {
		color: var(--active);
		font-size: var(--text-xs);
	}
	.log {
		max-height: 14rem;
		margin: 0;
		padding: var(--space-1);
		position: relative;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		list-style: none;
		scrollbar-width: thin;
	}
	.log .production {
		padding: 6px 6px 2px;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.log button {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		width: 100%;
		padding: 2px 6px 2px 14px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		text-align: left;
		cursor: pointer;
	}
	.log button:hover {
		background: var(--surface-2);
	}
	.log button.later {
		color: var(--text-3);
	}
	.log button[aria-current='step'] {
		background: var(--active-soft);
		box-shadow: inset 3px 0 0 var(--active);
	}
	.plus {
		color: var(--accept);
		font-weight: 600;
	}
	.log button.later .plus {
		color: var(--text-3);
	}
	@container sets (min-width: 680px) {
		.body:not(.fill) {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
			align-items: start;
		}
		.log {
			max-height: 22rem;
		}
	}
	.fill-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.score {
		display: block;
		color: var(--text);
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.answer {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 6rem;
	}
	.answer input {
		width: 100%;
		min-width: 0;
		padding: 3px 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: var(--text-sm);
	}
	.answer input[aria-invalid='true'] {
		border-color: var(--reject);
	}
	.marks {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0;
		font-size: var(--text-xs);
	}
	.member {
		padding: 0 5px;
		border-radius: 3px;
		font-family: var(--font-mono);
	}
	.member.ok {
		background: var(--accept-soft);
		color: var(--accept);
	}
	.member.bad {
		background: var(--reject-soft);
		color: var(--reject);
		text-decoration: line-through;
	}
	.missing,
	.wrong {
		color: var(--reject);
	}
	.right {
		color: var(--accept);
		font-weight: 600;
	}
</style>
