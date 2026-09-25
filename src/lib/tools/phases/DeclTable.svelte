<!--
	The declarations table: name, type (int or float), and an optional constant
	value per row. Rows with an empty name are ignored.
-->
<script lang="ts">
	import { Button, Icon, IconButton, Select, TextField } from '$lib/components/ui';
	import type { Decl, DeclProblems, Type } from './semantic';

	interface Props {
		decls: Decl[];
		problems: readonly DeclProblems[];
		/** Identifiers the program uses that no row declares. */
		undeclared?: readonly string[];
		max: number;
	}

	let { decls = $bindable(), problems, undeclared = [], max }: Props = $props();

	const TYPES: { value: Type; label: string }[] = [
		{ value: 'int', label: 'int' },
		{ value: 'float', label: 'float' }
	];

	const rowName = (d: Decl, i: number) => d.name.trim() || `row ${i + 1}`;

	function add() {
		if (decls.length < max) decls.push({ name: '', type: 'int', value: '' });
	}

	function declare() {
		for (const name of undeclared)
			if (decls.length < max) decls.push({ name, type: 'int', value: '' });
	}
</script>

<div class="decls">
	<div class="grid" role="group" aria-label="Declarations">
		<span class="head" aria-hidden="true">Name</span>
		<span class="head" aria-hidden="true">Type</span>
		<span class="head" aria-hidden="true">Constant</span>
		<span class="head" aria-hidden="true"></span>
		{#each decls as d, i (d)}
			<TextField
				label="Name, row {i + 1}"
				hideLabel
				mono
				size="sm"
				bind:value={d.name}
				error={problems[i]?.name}
				placeholder="name"
				spellcheck="false"
				autocapitalize="off"
			/>
			<Select
				label="Type of {rowName(d, i)}"
				hideLabel
				size="sm"
				options={TYPES}
				bind:value={d.type}
			/>
			<TextField
				label="Constant value of {rowName(d, i)} (empty for a variable)"
				hideLabel
				mono
				size="sm"
				bind:value={d.value}
				error={problems[i]?.value}
				placeholder="—"
				inputmode="decimal"
			/>
			<IconButton
				icon="x"
				size="sm"
				label="Remove {rowName(d, i)}"
				onclick={() => decls.splice(i, 1)}
			/>
		{/each}
	</div>
	{#if decls.length === 0}
		<p class="empty">No declarations.</p>
	{/if}
	<div class="foot">
		<Button size="sm" variant="ghost" onclick={add} disabled={decls.length >= max}>
			{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
			Add a declaration
		</Button>
		{#if undeclared.length}
			<span class="missing">
				Not declared: <span class="mono">{undeclared.join(', ')}</span>
				<Button size="sm" onclick={declare} disabled={decls.length >= max}>Declare as int</Button>
			</span>
		{/if}
	</div>
</div>

<style>
	.decls {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(4.75rem, 0.8fr) minmax(0, 1fr) 30px;
		align-items: start;
		gap: var(--space-2);
	}
	.head {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		margin-left: -10px;
	}
	.missing {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--reject);
		font-size: var(--text-sm);
	}
</style>
