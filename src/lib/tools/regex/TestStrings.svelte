<!--
	Test strings: one row per string with its membership in L(R). Members show a
	derivation; other strings show how far they get and what goes wrong.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import type { HighlightRange } from '$lib/components/ui/types';
	import { formatString, showChar, type NamedSet } from '$lib/theory/chars';
	import type { CharSet } from '$lib/theory/charset';
	import type { TestResult } from './analysis';
	import DerivationView from './DerivationView.svelte';
	import { brackets, type Bracket } from './derive';
	import { describeSymbols, type Rejection } from './explain';
	import { escapeTest, MAX_TESTS, unescapeTest } from './state';

	interface Props {
		tests: string[];
		/** One per test; null when L(R) could not be built. */
		results: (TestResult | null)[];
		/** Sub-expression text for derivation brackets. */
		label: (b: Bracket) => string;
		/** Definitions that name a set of symbols (digit, letter), for "Allowed next: digit". */
		names: readonly NamedSet[];
		onselect: (path: number[]) => void;
	}

	let { tests = $bindable(), results, label, names, onselect }: Props = $props();

	const uid = $props.id();
	const inputId = (i: number) => `${uid}-test-${i}`;

	/** The row being typed in keeps its text as typed (escapes and all). */
	let editing = $state<{ index: number; text: string } | null>(null);
	const shown = (i: number) => (editing?.index === i ? editing.text : escapeTest(tests[i]));

	/** The row typed in since it took focus; its membership is announced as it changes. */
	let typing = $state<number | null>(null);

	function input(i: number, text: string) {
		editing = { index: i, text };
		typing = i;
		tests[i] = unescapeTest(text);
	}

	async function add() {
		if (tests.length >= MAX_TESTS) return;
		tests.push('');
		await tick();
		document.getElementById(inputId(tests.length - 1))?.focus();
	}

	async function remove(i: number) {
		editing = null;
		typing = null;
		tests.splice(i, 1);
		await tick();
		const next = document.getElementById(inputId(Math.min(i, tests.length - 1)));
		if (next) next.focus();
		else document.getElementById(`${uid}-add`)?.focus();
	}

	const sym = (c: string) => `'${showChar(c, 'quoted')}'`;
	const symbols = (set: CharSet) => describeSymbols(set, names);

	const status = (r: TestResult) => (r.member ? 'in L(R)' : 'not in L(R)');
	/**
	 * One live region for all rows: it follows the row being typed in, so a
	 * change to R does not announce every row at once.
	 */
	const live = $derived.by(() => {
		const r = typing === null ? null : results[typing];
		return typing !== null && r ? `Test string ${typing + 1}: ${status(r)}` : '';
	});

	function highlights(s: string, r: Rejection): HighlightRange[] {
		if (r.kind === 'fails')
			return [
				{ start: 0, end: r.prefixEnd, tone: 'accept' },
				{ start: r.at.start, end: r.at.end, tone: 'reject' }
			];
		if (r.kind === 'incomplete') return [{ start: 0, end: s.length, tone: 'accept' }];
		return [];
	}
</script>

{#snippet rejection(s: string, r: Rejection, outside: CharSet)}
	{#if s !== ''}
		<CharStream
			text={s}
			highlights={highlights(s, r)}
			cursor={r.kind === 'incomplete' ? s.length : r.kind === 'fails' ? r.at.start : null}
		/>
	{/if}
	<p class="why">
		{#if r.kind === 'empty-language'}
			L(R) = &#123; &#125;, so no string is in it.
		{:else if r.kind === 'incomplete'}
			{#if s === ''}
				The shortest string in L(R) is <span class="f"
					>"<mark class="add">{escapeTest(r.completion)}</mark>"</span
				>.
			{:else}
				<span class="f">{formatString(s)}</span> stops early. It is the start of strings in L(R)
				such as
				<span class="f">"{escapeTest(s)}<mark class="add">{escapeTest(r.completion)}</mark>"</span>.
			{/if}
		{:else if r.prefixEnd === 0}
			{#if r.allowed.isEmpty}
				Only <span class="f">""</span> is in L(R), so no symbol can come first.
			{:else}
				No string in L(R) starts with <span class="f">{sym(r.at.char)}</span>. Allowed first:
				<span class="f">{symbols(r.allowed)}</span>.
			{/if}
		{:else if r.allowed.isEmpty}
			<span class="f">{formatString(s.slice(0, r.prefixEnd))}</span> is in L(R), and no string in
			L(R) goes on after it, so <span class="f">{sym(r.at.char)}</span> cannot follow.
		{:else}
			<span class="f">{formatString(s.slice(0, r.prefixEnd))}</span> is the start of strings in
			L(R), but <span class="f">{sym(r.at.char)}</span> cannot follow it. Allowed next:
			<span class="f">{symbols(r.allowed)}</span>.
		{/if}
	</p>
	{#if !outside.isEmpty}
		<p class="why sigma">
			<Icon name="info" size={14} />
			<span
				><span class="f">{[...outside.chars(6)].map(sym).join(', ')}</span>
				{outside.size === 1 ? 'is' : 'are'} not in Σ.</span
			>
		</p>
	{/if}
{/snippet}

<div class="tests">
	{#if tests.length === 0}
		<p class="empty">No test strings.</p>
	{:else}
		<ol class="rows">
			{#each tests as s, i (i)}
				{@const r = results[i]}
				<li class="row">
					<div class="line">
						<span class="field">
							<input
								id={inputId(i)}
								type="text"
								class="input"
								value={shown(i)}
								placeholder="empty string &quot;&quot;"
								aria-label="Test string {i + 1}"
								aria-describedby={r ? `${inputId(i)}-status` : undefined}
								spellcheck="false"
								autocomplete="off"
								autocapitalize="off"
								oninput={(e) => input(i, e.currentTarget.value)}
								onfocus={() => (editing = { index: i, text: escapeTest(s) })}
								onblur={() => {
									editing = null;
									typing = null;
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.isComposing) {
										e.preventDefault();
										add();
									}
								}}
							/>
						</span>
						{#if r}
							<Badge tone={r.member ? 'accept' : 'reject'} mono aria-hidden="true">
								{r.member ? '∈ L(R)' : '∉ L(R)'}
							</Badge>
							<span class="visually-hidden" id="{inputId(i)}-status">{status(r)}</span>
						{/if}
						<IconButton
							icon="x"
							size="sm"
							label="Remove test string {i + 1}"
							onclick={() => remove(i)}
						/>
					</div>
					{#if r}
						<div class="detail">
							{#if r.member && r.derivation}
								{#if r.derivation.status === 'match'}
									{#if s !== ''}
										<DerivationView
											text={s}
											root={brackets(r.derivation.tree)}
											{label}
											{onselect}
										/>
									{/if}
								{:else if r.derivation.status === 'too-long'}
									<p class="why">
										No derivation is drawn for strings longer than {r.derivation.maxLength} symbols.
									</p>
								{:else if r.derivation.status === 'too-complex'}
									<p class="why">This string has too many ways to split; no derivation is drawn.</p>
								{/if}
							{:else if r.rejection}
								{@render rejection(s, r.rejection, r.outside)}
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
	<p class="visually-hidden" aria-live="polite">{live}</p>
	<div class="foot">
		<Button id="{uid}-add" size="sm" onclick={add} disabled={tests.length >= MAX_TESTS}>
			{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
			Add string
		</Button>
		<span class="hint"
			>Type <code>\t</code>, <code>\n</code>, <code>\r</code> for a tab, newline, or return, and
			<code>\\</code> for a backslash.</span
		>
	</div>
</div>

<style>
	.tests {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.rows {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}
	.row:first-child {
		padding-top: 0;
	}
	.line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.field {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		height: 36px;
		padding: 0 11px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		transition: border-color var(--duration) var(--ease);
	}
	.field:hover {
		border-color: var(--text-3);
	}
	.field:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	.input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0 1px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-family: inherit;
		font-size: 0.9375rem;
	}
	.input:focus {
		outline: none;
	}
	.input::placeholder {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.why {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.sigma {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}
	.sigma :global(.icon) {
		margin-top: 3px;
		color: var(--info);
	}
	.f {
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	mark.add {
		padding: 0 1px;
		border-radius: 2px;
		background: var(--accept-soft);
		box-shadow: inset 0 -2px 0 var(--accept);
		color: var(--text);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.hint code {
		font-size: 0.95em;
	}
</style>
