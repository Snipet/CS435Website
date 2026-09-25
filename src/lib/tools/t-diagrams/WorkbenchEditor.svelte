<!--
	Editing for the workbench: the toolbox's diagrams, the subset declarations,
	the languages that run directly, and the goal.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Icon, IconButton, TextField } from '$lib/components/ui';
	import LangInput from './LangInput.svelte';
	import LangText from './LangText.svelte';
	import type { SubsetDecl, TDiagram, TField, WorkbenchIssue } from './model';
	import { MAX_RUNNABLE_TEXT, MAX_SUBSETS, MAX_TOOLBOX, type ToolboxItem } from './state';

	interface Props {
		toolbox: ToolboxItem[];
		subsets: SubsetDecl[];
		runnable: string;
		goal: TDiagram | null;
		issues: readonly WorkbenchIssue[];
		onadd: () => void;
		onremove: (id: string) => void;
	}

	let {
		toolbox = $bindable(),
		subsets = $bindable(),
		runnable = $bindable(),
		goal = $bindable(),
		issues,
		onadd,
		onremove
	}: Props = $props();

	const uid = $props.id();
	let rowsEl: HTMLOListElement | undefined = $state();

	/** Adds a diagram and puts the cursor in its first field. */
	async function add() {
		onadd();
		await tick();
		rowsEl?.querySelector<HTMLInputElement>('li:last-child input')?.focus();
	}

	const diagramIssues = (index: number) =>
		issues.filter((d) => d.target.kind === 'diagram' && d.target.index === index);
	const subsetIssues = (index: number) =>
		issues.filter((d) => d.target.kind === 'subset' && d.target.index === index);
	/** The side of a half-filled subset declaration that is still blank. */
	const blankSide = (list: readonly WorkbenchIssue[], side: 'sub' | 'sup') =>
		list.some((d) => d.target.kind === 'subset' && d.target.side === side);
	const goalIssues = $derived(issues.filter((d) => d.target.kind === 'goal'));
	const badField = (list: readonly WorkbenchIssue[], field: TField) =>
		list.some(
			(d) =>
				d.severity === 'error' &&
				(d.target.kind === 'diagram' || d.target.kind === 'goal') &&
				d.target.field === field
		);

	const PLACEHOLDER: Record<TField, string> = { source: 'S', target: 'T', host: 'H' };
	const FIELD_LABEL: Record<TField, string> = {
		source: 'source language',
		target: 'target language',
		host: 'host language'
	};
	const FIELDS: TField[] = ['source', 'target', 'host'];

	/** A goal to start from: the first diagram's languages, on the first machine that runs directly. */
	function setGoal() {
		const first = toolbox[0];
		const machine = runnable
			.split(/[,;]/)
			.map((s) => s.trim())
			.find(Boolean);
		goal = {
			source: first?.source ?? 'L',
			target: first?.target ?? 'M',
			host: machine ?? first?.target ?? 'M'
		};
	}
</script>

{#snippet tFields(t: TDiagram, name: string, list: readonly WorkbenchIssue[], errId: string)}
	<div class="t-fields" role="group" aria-label={name}>
		<span class="sym" aria-hidden="true">T(</span>
		{#each FIELDS as field, k (field)}
			<LangInput
				bind:value={t[field]}
				label="{name}: {FIELD_LABEL[field]}"
				placeholder={PLACEHOLDER[field]}
				invalid={badField(list, field)}
				describedby={list.length ? errId : undefined}
			/>
			<span class="sym" aria-hidden="true">{k === 0 ? '→' : k === 1 ? '/' : ')'}</span>
		{/each}
	</div>
{/snippet}

<div class="editor">
	<p class="hint">
		<span class="mono">T(S → T / H)</span> translates S to T and is written in H. Type
		<kbd>'</kbd> for a prime (<LangText text="L′" />) and <kbd>_</kbd> for a subscript (<span
			class="mono">M_OTHER</span
		>
		→ <LangText text="M_OTHER" />).
	</p>

	<section class="block" aria-labelledby="{uid}-diagrams">
		<h3 id="{uid}-diagrams">Diagrams</h3>
		<ol class="rows" bind:this={rowsEl}>
			{#each toolbox as item, i (item.id)}
				{@const list = diagramIssues(i)}
				<li class="row">
					<span class="num" aria-hidden="true">{i + 1}</span>
					{@render tFields(item, `Diagram ${i + 1}`, list, `${uid}-d${i}-err`)}
					<IconButton
						icon="x"
						size="sm"
						label="Remove diagram {i + 1}"
						onclick={() => onremove(item.id)}
					/>
					{#if list.length}
						<p class="row-msg {list[0].severity}" id="{uid}-d{i}-err">{list[0].message}</p>
					{/if}
				</li>
			{/each}
		</ol>
		<div class="add">
			<Button size="sm" onclick={add} disabled={toolbox.length >= MAX_TOOLBOX}>
				{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
				Add T-diagram
			</Button>
			{#if toolbox.length >= MAX_TOOLBOX}
				<span class="limit">The toolbox holds up to {MAX_TOOLBOX} diagrams.</span>
			{/if}
		</div>
	</section>

	<section class="block" aria-labelledby="{uid}-subsets">
		<h3 id="{uid}-subsets">Subsets</h3>
		<p class="sub-hint">
			A compiler written in a subset can be translated by one that reads the larger language.
		</p>
		{#if subsets.length}
			<ol class="rows">
				{#each subsets as d, i (i)}
					{@const list = subsetIssues(i)}
					{@const errId = `${uid}-s${i}-err`}
					<li class="row">
						<div class="subset-fields" role="group" aria-label="Subset {i + 1}">
							<LangInput
								bind:value={d.sub}
								label="Subset {i + 1}: smaller language"
								placeholder="L′"
								invalid={blankSide(list, 'sub')}
								describedby={list.length ? errId : undefined}
							/>
							<span class="sym" aria-hidden="true">⊆</span>
							<LangInput
								bind:value={d.sup}
								label="Subset {i + 1}: larger language"
								placeholder="L"
								invalid={blankSide(list, 'sup')}
								describedby={list.length ? errId : undefined}
							/>
						</div>
						<IconButton
							icon="x"
							size="sm"
							label="Remove subset {i + 1}"
							onclick={() => subsets.splice(i, 1)}
						/>
						{#if list.length}
							<p class="row-msg {list[0].severity}" id={errId}>{list[0].message}</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
		<div class="add">
			<Button
				size="sm"
				variant="ghost"
				onclick={() => subsets.push({ sub: '', sup: '' })}
				disabled={subsets.length >= MAX_SUBSETS}
			>
				{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
				Add subset
			</Button>
		</div>
	</section>

	<section class="block" aria-labelledby="{uid}-run">
		<h3 id="{uid}-run">Run directly</h3>
		<TextField
			bind:value={runnable}
			label="Languages that run directly"
			hideLabel
			description="Machine languages, separated by commas. A translator must be written in one of them (or in a subset of one)."
			mono
			size="sm"
			maxlength={MAX_RUNNABLE_TEXT}
			placeholder="M, M′"
			onchange={() => (runnable = runnable.replace(/['’]/g, '′'))}
		/>
	</section>

	<section class="block" aria-labelledby="{uid}-goal">
		<h3 id="{uid}-goal">Goal</h3>
		{#if goal}
			<div class="row">
				<span class="num want" aria-hidden="true">
					<Icon name="arrow-right" size={14} />
				</span>
				{@render tFields(goal, 'Goal', goalIssues, `${uid}-goal-err`)}
				<IconButton icon="x" size="sm" label="Remove the goal" onclick={() => (goal = null)} />
				{#if goalIssues.length}
					<p class="row-msg {goalIssues[0].severity}" id="{uid}-goal-err">
						{goalIssues[0].message}
					</p>
				{/if}
			</div>
		{:else}
			<div class="add">
				<Button size="sm" variant="ghost" onclick={setGoal}>
					{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
					Set a goal
				</Button>
			</div>
		{/if}
	</section>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.hint kbd {
		padding: 0 5px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: 0.85em;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.sub-hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
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
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-width: 0;
	}
	.num {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.num.want {
		display: flex;
		justify-content: flex-end;
		color: var(--accept);
	}
	.t-fields,
	.subset-fields {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.subset-fields {
		grid-column: 1 / 3;
		max-width: 16rem;
	}
	.sym {
		flex: none;
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	.row-msg {
		grid-column: 2 / -1;
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.row-msg.error {
		color: var(--reject);
	}
	.row-msg.warning,
	.row-msg.info {
		color: var(--text-2);
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.limit {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
