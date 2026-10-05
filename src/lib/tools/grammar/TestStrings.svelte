<!--
	Test strings: one token string per row with its membership in L(G). A row
	shows a verdict only for the string it was computed for.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Updating from '$lib/components/ui/Updating.svelte';
	import { MAX_TESTS } from './state';
	import { MAX_CHECK_TOKENS, type TestRow } from './views';

	interface Props {
		tests: string[];
		/** One per test: its verdict, when there is one for this string. */
		rows: readonly TestRow[];
		/** One per test: the first problem of the string as typed, or null. */
		errors: readonly (string | null)[];
		/** No verdicts are shown (the check could not be computed). */
		blocked?: boolean;
		placeholder?: string;
		/** Shows a member in the Membership panel. */
		onparse: (text: string) => void;
	}

	let {
		tests = $bindable(),
		rows,
		errors,
		blocked = false,
		placeholder,
		onparse
	}: Props = $props();

	const uid = $props.id();
	const inputId = (i: number) => `${uid}-test-${i}`;

	/** The row typed in since it took focus; its verdict is read out as it changes. */
	let typing = $state<number | null>(null);

	async function add() {
		if (tests.length >= MAX_TESTS) return;
		tests.push('');
		await tick();
		document.getElementById(inputId(tests.length - 1))?.focus();
	}

	async function remove(i: number) {
		typing = null;
		tests.splice(i, 1);
		await tick();
		const next = document.getElementById(inputId(Math.min(i, tests.length - 1)));
		if (next) next.focus();
		else document.getElementById(`${uid}-add`)?.focus();
	}

	const WORDS = {
		member: 'in L(G)',
		'not-member': 'not in L(G)',
		invalid: 'not a string of terminals',
		'too-long': 'not checked'
	} as const;

	function status(i: number): string {
		if (errors[i]) return WORDS.invalid;
		const row = rows[i];
		if (blocked || !row?.verdict) return '';
		return row.stale ? 'updating' : WORDS[row.verdict];
	}

	const live = $derived.by(() => {
		if (typing === null) return '';
		const text = status(typing);
		return text && text !== 'updating' ? `Test string ${typing + 1}: ${text}` : '';
	});
</script>

<div class="tests">
	{#if tests.length === 0}
		<p class="empty">No test strings.</p>
	{:else}
		<ol class="rows">
			{#each tests as text, i (i)}
				{@const row = rows[i]}
				{@const error = errors[i] ?? null}
				{@const verdict = error || blocked ? null : (row?.verdict ?? null)}
				<li class="row" aria-busy={!error && !blocked && (!row?.verdict || row.stale)}>
					<div class="line">
						<input
							id={inputId(i)}
							type="text"
							class="input"
							bind:value={tests[i]}
							placeholder={placeholder ?? 'empty string ε'}
							aria-label="Test string {i + 1}"
							aria-invalid={error ? 'true' : undefined}
							aria-describedby="{inputId(i)}-status"
							spellcheck="false"
							autocomplete="off"
							autocapitalize="off"
							oninput={() => (typing = i)}
							onblur={() => (typing = null)}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.isComposing) {
									e.preventDefault();
									void add();
								}
							}}
						/>
						<span class="verdict">
							{#if error}
								<Badge tone="reject" aria-hidden="true">not terminals</Badge>
							{:else if verdict === 'member' || verdict === 'not-member'}
								<span class={{ 'stale-data': row?.stale }}>
									<Badge tone={verdict === 'member' ? 'accept' : 'reject'} mono aria-hidden="true">
										{verdict === 'member' ? '∈ L(G)' : '∉ L(G)'}
									</Badge>
								</span>
							{:else if verdict === 'too-long'}
								<Badge aria-hidden="true">not checked</Badge>
							{:else if !blocked}
								<Updating />
							{/if}
						</span>
						<span class="visually-hidden" id="{inputId(i)}-status">{status(i)}</span>
						<Button
							variant="ghost"
							size="sm"
							disabled={verdict !== 'member' || row?.stale}
							aria-label="Parse test string {i + 1} in the Membership panel"
							onclick={() => onparse(text)}>Parse</Button
						>
						<IconButton
							icon="x"
							size="sm"
							label="Remove test string {i + 1}"
							onclick={() => remove(i)}
						/>
					</div>
					{#if error}
						<p class="why">{error}</p>
					{:else if verdict === 'too-long'}
						<p class="why quiet">Strings of more than {MAX_CHECK_TOKENS} tokens are not checked.</p>
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
		<span class="hint">One token string per row; an empty row is ε.</span>
	</div>
</div>

<style>
	.tests {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		container-type: inline-size;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-width: 0;
	}
	/* A narrow panel: the string on its own line, its verdict and buttons under it. */
	@container (max-width: 24rem) {
		.line {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}
		.input {
			grid-column: 1 / -1;
		}
	}
	.input {
		width: 100%;
		min-width: 0;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		transition: border-color var(--duration) var(--ease);
	}
	.input:hover {
		border-color: var(--text-3);
	}
	.input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	.input[aria-invalid='true'] {
		border-color: var(--reject);
	}
	.input::placeholder {
		color: var(--text-3);
		font-family: var(--font-sans);
	}
	.verdict {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		min-width: 4.6rem;
	}
	.why {
		margin: 0;
		color: var(--reject);
		font-size: var(--text-xs);
	}
	.why.quiet {
		color: var(--text-3);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-1);
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
