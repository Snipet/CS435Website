<!--
@component
Helper definitions (one `name = RE` per line) and the ordered token rules
R1 | R2 | … (earlier rules win ties). Each rule has a token name, an RE in
lecture notation, and a "drop" switch (matched, then left out of the tokens).
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import CodeEditor from '$lib/components/ui/CodeEditor.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RegexField from '$lib/components/ui/RegexField.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import type { RuleState } from '$lib/tools/links';
	import type { CompiledRules } from './rules';
	import { MAX_RULES } from './state';

	interface Props {
		defs: string;
		rules: RuleState[];
		compiled: CompiledRules;
	}

	let { defs = $bindable(), rules = $bindable(), compiled }: Props = $props();

	const uid = $props.id();

	function move(i: number, by: number) {
		const j = i + by;
		if (j < 0 || j >= rules.length) return;
		const next = [...rules];
		[next[i], next[j]] = [next[j], next[i]];
		rules = next;
	}

	function remove(i: number) {
		rules = rules.filter((_, k) => k !== i);
	}

	function add() {
		if (rules.length >= MAX_RULES) return;
		rules = [...rules, { name: `Token${rules.length + 1}`, re: '' }];
	}
</script>

<div class="editor">
	<div class="defs">
		<CodeEditor
			bind:value={defs}
			label="Definitions"
			language="lecture-re"
			diagnostics={compiled.defs.diagnostics}
			minRows={2}
			maxRows={8}
			placeholder="digit = '0' | … | '9'"
		/>
		<p class="hint">One <code>name = RE</code> per line; the rules can use the names.</p>
	</div>

	<div class="rules">
		<div class="rules-head">
			<span class="label" id="{uid}-rules">Rules</span>
			<span class="hint">R = R1 | R2 | …; the earlier rule wins a tie.</span>
		</div>
		<ol class="list" aria-labelledby="{uid}-rules">
			{#each rules as rule, i (i)}
				{@const check = compiled.rows[i]}
				<li class="rule">
					<span class="index" style={toneStyle(i)} aria-hidden="true">R{i + 1}</span>
					<div class="name">
						<label class="visually-hidden" for="{uid}-name-{i}">Token name of rule {i + 1}</label>
						<input
							id="{uid}-name-{i}"
							class={['name-input', { invalid: check?.nameError }]}
							bind:value={rule.name}
							spellcheck="false"
							autocomplete="off"
							aria-invalid={check?.nameError ? 'true' : undefined}
							aria-describedby={check?.nameError ? `${uid}-name-err-${i}` : undefined}
						/>
						{#if check?.nameError}
							<span class="name-error" id="{uid}-name-err-{i}">{check.nameError}</span>
						{/if}
					</div>
					<div class="re">
						<RegexField
							bind:value={rule.re}
							ariaLabel="Regular expression of rule {i + 1}"
							size="md"
							symbols={[]}
							diagnostics={check?.diagnostics ?? []}
						/>
					</div>
					<label class="drop" title="Match, then leave the token out (e.g. Whitespace)">
						<input
							type="checkbox"
							bind:checked={() => rule.drop ?? false, (v) => (rule.drop = v)}
						/>
						<span>drop</span>
					</label>
					<div class="actions">
						<IconButton
							icon="chevron-up"
							size="sm"
							label="Move rule {i + 1} up"
							aria-disabled={i === 0}
							onclick={() => move(i, -1)}
						/>
						<IconButton
							icon="chevron-down"
							size="sm"
							label="Move rule {i + 1} down"
							aria-disabled={i === rules.length - 1}
							onclick={() => move(i, 1)}
						/>
						<IconButton icon="x" size="sm" label="Remove rule {i + 1}" onclick={() => remove(i)} />
					</div>
				</li>
			{/each}
		</ol>
		{#if rules.length === 0}<p class="hint">Add a rule to build a DFA.</p>{/if}
		<div>
			<Button size="sm" onclick={add} disabled={rules.length >= MAX_RULES}>
				{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
				Add rule
			</Button>
		</div>
	</div>
</div>

<style>
	.editor {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-5);
	}
	@media (min-width: 900px) {
		.editor {
			grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		}
	}
	.defs {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.rules-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	.label {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rule {
		display: grid;
		grid-template-columns: 2.25rem minmax(6rem, 9rem) minmax(0, 1fr) auto auto;
		grid-template-areas: 'index name re drop actions';
		align-items: start;
		gap: var(--space-2);
	}
	.index {
		grid-area: index;
		display: grid;
		place-items: center;
		height: 38px;
		border-radius: var(--radius-sm);
		color: var(--tone-fg);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.name {
		grid-area: name;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.name-input {
		width: 100%;
		min-width: 0;
		height: 38px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.name-input:hover {
		border-color: var(--text-3);
	}
	.name-input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	.name-input.invalid {
		border-color: var(--reject);
	}
	.name-error {
		color: var(--reject);
		font-size: var(--text-xs);
	}
	.re {
		grid-area: re;
		min-width: 0;
	}
	.drop {
		grid-area: drop;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		color: var(--text-2);
		font-size: var(--text-sm);
		cursor: pointer;
		user-select: none;
	}
	.drop input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--accent);
	}
	.actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		height: 38px;
	}
	@media (max-width: 600px) {
		.rule {
			grid-template-columns: 2.25rem minmax(0, 1fr) auto;
			grid-template-areas:
				'index name actions'
				're re re'
				'drop drop drop';
			padding-bottom: var(--space-2);
			border-bottom: 1px solid var(--border);
		}
		.drop {
			height: auto;
		}
	}
</style>
