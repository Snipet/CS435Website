<!--
	The precedence cascade builder: operator levels from lowest to highest
	precedence plus the atoms, and the stratified grammar they give (cascade.ts).
-->
<script lang="ts">
	import { GrammarEditor } from '$lib/components/grammar';
	import { Button, Icon, IconButton, SegmentedControl, TextField } from '$lib/components/ui';
	import { MAX_LEVELS, buildCascade, type CascadeLevel } from './cascade';

	interface Props {
		levels: CascadeLevel[];
		atoms: string;
		/** The rewritten grammar's text now, to say when the cascade is already in use. */
		current: string;
		/** "Use as the rewritten grammar". */
		onuse: (text: string) => void;
	}

	let { levels = $bindable(), atoms = $bindable(), current, onuse }: Props = $props();

	const uid = $props.id();
	const cascade = $derived(buildCascade(levels, atoms));
	const inUse = $derived(cascade.text !== '' && current.trim() === cascade.text);
	const atomsName = $derived(cascade.names[cascade.names.length - 1] ?? null);

	const ASSOC = [
		{ value: 'left', label: 'left' },
		{ value: 'right', label: 'right' }
	] as const;

	function move(i: number, by: -1 | 1) {
		const j = i + by;
		if (j < 0 || j >= levels.length) return;
		const next = [...levels];
		[next[i], next[j]] = [next[j], next[i]];
		levels = next;
	}

	function remove(i: number) {
		levels = levels.filter((_, k) => k !== i);
	}

	function add() {
		if (levels.length >= MAX_LEVELS) return;
		levels = [...levels, { ops: '', assoc: 'left' }];
	}
</script>

<div class="builder">
	<p class="hint">
		Operator levels from lowest to highest precedence; the operators of a level are separated by
		spaces (<code>== !=</code> is two operators). Each level gets a non-terminal (E, T, F, …) that refers
		to the next one; the last non-terminal derives the atoms.
	</p>

	<div class="levels">
		<div class="row header" aria-hidden="true">
			<span>Level</span>
			<span>Operators</span>
			<span>Associativity</span>
			<span></span>
		</div>
		<ol aria-label="Operator levels, lowest precedence first">
			{#each levels as level, i (i)}
				<li class="row">
					<span class="which">
						<span class="number">{i + 1}</span>
						{#if cascade.names[i]}<span class="nt" title="Non-terminal of this level"
								>{cascade.names[i]}</span
							>{/if}
					</span>
					<TextField
						label="Operators of level {i + 1}"
						hideLabel
						mono
						size="sm"
						bind:value={level.ops}
						placeholder="+ -"
						spellcheck="false"
					/>
					<SegmentedControl
						label="Associativity of level {i + 1}"
						options={ASSOC}
						bind:value={level.assoc}
						size="sm"
					/>
					<span class="row-actions">
						<IconButton
							label="Move level {i + 1} up (lower precedence)"
							icon="chevron-up"
							size="sm"
							disabled={i === 0}
							onclick={() => move(i, -1)}
						/>
						<IconButton
							label="Move level {i + 1} down (higher precedence)"
							icon="chevron-down"
							size="sm"
							disabled={i === levels.length - 1}
							onclick={() => move(i, 1)}
						/>
						<IconButton label="Remove level {i + 1}" icon="x" size="sm" onclick={() => remove(i)} />
					</span>
				</li>
			{/each}
		</ol>
		<div class="row atoms">
			<span class="which">
				<label class="atoms-label" for="{uid}-atoms">Atoms</label>
				{#if atomsName}<span class="nt" title="Non-terminal of the atoms">{atomsName}</span>{/if}
			</span>
			<TextField
				id="{uid}-atoms"
				label="Atoms"
				hideLabel
				mono
				size="sm"
				bind:value={atoms}
				placeholder="int | ( E )"
				spellcheck="false"
			/>
		</div>
	</div>

	<div class="add">
		<Button size="sm" onclick={add} disabled={levels.length >= MAX_LEVELS}>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			Add level
		</Button>
		<span class="hint">Alternatives of the atoms are separated by |; E is the start symbol.</span>
	</div>

	{#if cascade.problems.length}
		<ul class="problems">
			{#each cascade.problems as problem (problem)}
				<li>{problem}</li>
			{/each}
		</ul>
	{/if}

	{#if cascade.text}
		<div class="generated" aria-live="polite">
			<GrammarEditor
				value={cascade.text}
				label="Generated grammar"
				readonly
				nonterminals={cascade.grammar?.nonterminals}
				terminals={cascade.grammar?.terminals}
				minRows={Math.min(cascade.text.split('\n').length, 9)}
				maxRows={9}
			/>
		</div>
		<div class="use">
			<Button variant="primary" size="sm" disabled={inUse} onclick={() => onuse(cascade.text)}>
				Use as the rewritten grammar
			</Button>
			{#if inUse}
				<span class="in-use"><Icon name="check" size={14} /> This is the rewritten grammar.</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.builder {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.levels {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	ol {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: grid;
		grid-template-columns: 4.25rem minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.row.atoms {
		grid-template-columns: 4.25rem minmax(0, 1fr);
		padding-top: var(--space-2);
		border-top: 1px dashed var(--border);
	}
	.header {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.header span:nth-child(3) {
		min-width: 6.4rem;
	}
	.header span:nth-child(4) {
		width: calc(90px + 2 * 2px);
	}
	.which {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--text-sm);
	}
	.number {
		min-width: 1.1em;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.atoms-label {
		color: var(--text-2);
		font-weight: 500;
	}
	.nt {
		padding: 0 6px;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		color: var(--syn-name);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.6;
	}
	.row-actions {
		display: inline-flex;
		gap: 2px;
	}
	.add,
	.use {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.problems li::marker {
		color: var(--active);
	}
	.in-use {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accept);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	/* Phones: the level's controls move under its number. */
	@media (max-width: 520px) {
		.header {
			display: none;
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'which actions'
				'ops assoc';
			padding: var(--space-2);
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}
		.row > :global(:nth-child(1)) {
			grid-area: which;
		}
		.row > :global(:nth-child(2)) {
			grid-area: ops;
		}
		.row > :global(:nth-child(3)) {
			grid-area: assoc;
		}
		.row > :global(:nth-child(4)) {
			grid-area: actions;
		}
		.row.atoms {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas:
				'which'
				'ops';
			border-style: dashed;
		}
	}
</style>
