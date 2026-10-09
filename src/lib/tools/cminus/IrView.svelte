<!--
	Three-address code: the quads of every function in four aligned columns
	(op, arg1, arg2, result) with the one-line form beside them, before or
	after the optimizer, and the optimizer's log.
-->
<script lang="ts">
	import { SegmentedControl } from '$lib/components/ui';
	import type { Compilation } from '$lib/theory/cminus';
	import MoreRows from './MoreRows.svelte';
	import { revealMarked } from './reveal';
	import { plural, rangeOf, type SelectionMarks, type SourceRange } from './selection';
	import type { Version } from './state';
	import { ROW_LIMIT, capGroups, logRows, quadGroups } from './views';

	interface Props {
		c: Compilation;
		marks: SelectionMarks;
		/** The code shown: as generated, or after the optimizer. */
		version?: Version;
		selKey?: string;
		onselect: (range: SourceRange) => void;
	}

	let { c, marks, version = $bindable('before'), selKey = '', onselect }: Props = $props();

	let all = $state(false);
	let allLog = $state(false);

	const ir = $derived(c.ir!);
	const optimized = $derived(c.optimized);
	/** Without the optimizer there is one version only. */
	const shownVersion = $derived<Version>(optimized ? version : 'before');
	const program = $derived(shownVersion === 'after' && optimized ? optimized.program : ir);
	const marked = $derived(shownVersion === 'after' ? marks.optimized : marks.quads);
	const groups = $derived(quadGroups(program, shownVersion === 'before' ? optimized : null));
	const capped = $derived(capGroups(groups, all ? Infinity : ROW_LIMIT));
	const log = $derived(logRows(c));
	const shownLog = $derived(allLog ? log : log.slice(0, ROW_LIMIT));

	const options = $derived([
		{ value: 'before' as const, label: 'Before optimization' },
		{
			value: 'after' as const,
			label: 'After optimization',
			disabled: !optimized,
			title: optimized ? undefined : 'The optimizer is off'
		}
	]);
	const FIELDS = ['op', 'arg1', 'arg2', 'result'] as const;

	/** The click handler of a row: it selects the source text the row came from, if it has one. */
	const pick = (span: SourceRange | null) => (span ? () => onselect(rangeOf(span)) : undefined);
</script>

<div class="cm-stack">
	<div class="cm-toolbar">
		<SegmentedControl
			label="Three-address code shown"
			{options}
			value={shownVersion}
			onchange={(v) => (version = v)}
		/>
		<p class="cm-note">
			{#if !optimized}
				{plural(ir.quads.length, 'quad')}. The optimizer is off: the code generator takes these
				quads.
			{:else if shownVersion === 'before'}
				{plural(ir.quads.length, 'quad')} as generated; the optimizer leaves
				{plural(optimized.program.quads.length, 'quad')}.
			{:else}
				{plural(optimized.program.quads.length, 'quad')} of the {ir.quads.length} generated; the code
				generator takes these.
			{/if}
		</p>
	</div>

	<div class="cm-box" {@attach revealMarked(`${selKey}/${shownVersion}`)}>
		<table class="cm-table quads">
			<caption class="visually-hidden">
				Quads {shownVersion === 'after' ? 'after' : 'before'} optimization, by function
			</caption>
			<thead>
				<tr>
					<th scope="col" class="cm-num">#</th>
					{#each FIELDS as f (f)}<th scope="col">{f}</th>{/each}
					<th scope="col" class="cm-wide">In one line</th>
				</tr>
			</thead>
			{#each capped.groups as group (group.name)}
				<tbody>
					<tr class="group">
						<th scope="rowgroup" colspan="6">{group.name}</th>
					</tr>
					{#each group.rows as row (row.index)}
						{@const on = marked.has(row.index)}
						<!-- A click anywhere in the row selects; the button in it does the same from the keyboard. -->
						<tr
							class={[row.span ? 'cm-row' : 'fixed', row.fate, { 'cm-marked': on }]}
							onclick={pick(row.span)}
						>
							<td class="cm-num">
								{#if row.span}
									<button
										type="button"
										class="cm-pick"
										aria-label="Quad {row.id}: {row.text}"
										aria-current={on ? 'true' : undefined}>{row.id}</button
									>
								{:else}{row.id}{/if}
							</td>
							{#each FIELDS as f, k (f)}
								<td class={{ op: k === 0 }}
									>{#if row.changed.includes(f)}<span class="changed">{row.columns[k]}</span
										>{:else}{row.columns[k]}{/if}</td
								>
							{/each}
							<td class="text"
								>{row.text}{#if row.fate === 'removed'}<span class="cm-tag"
										>removed by the optimizer</span
									>{:else if row.fate === 'rewritten'}<span class="cm-tag">rewritten</span>{/if}</td
							>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
	<MoreRows shown={capped.shown} total={capped.total} noun="quads" onshowall={() => (all = true)} />
	{#if shownVersion === 'after'}
		<p class="cm-note cm-muted">
			A quad keeps the number it was generated with. <span class="changed">Marked</span> fields were rewritten
			by the optimizer.
		</p>
	{/if}

	<section class="cm-section">
		<h3 class="cm-heading">
			Optimizer log
			{#if optimized}
				<span class="cm-sub"
					>{plural(log.length, 'entry', 'entries')} in {plural(optimized.rounds, 'round')}</span
				>
			{/if}
		</h3>
		{#if !optimized}
			<p class="cm-note">The optimizer is off.</p>
		{:else if log.length === 0}
			<p class="cm-note">The optimizer changed nothing.</p>
		{:else}
			<div class="cm-box log" {@attach revealMarked(selKey)}>
				<table class="cm-table">
					<caption class="visually-hidden">What each pass of the optimizer did</caption>
					<thead>
						<tr>
							<th scope="col" class="cm-num">Quad</th>
							<th scope="col">Pass</th>
							<th scope="col">Change</th>
							<th scope="col" class="cm-wide">What was done</th>
						</tr>
					</thead>
					<tbody>
						{#each shownLog as entry, i (i)}
							{@const on = marks.quads.has(entry.quad)}
							<!-- A click anywhere in the row selects; the button in it does the same from the keyboard. -->
							<tr
								class={[entry.span ? 'cm-row' : 'fixed', { 'cm-marked': on }]}
								onclick={pick(entry.span)}
							>
								<td class="cm-num">
									{#if entry.span}
										<button
											type="button"
											class="cm-pick"
											aria-label="Quad {entry.quad} in {entry.function}: {entry.pass}"
											aria-current={on ? 'true' : undefined}>{entry.quad}</button
										>
									{:else}{entry.quad}{/if}
								</td>
								<td class="words pass">{entry.pass}</td>
								<td class="change">
									<span class="piece">{entry.before}</span>
									<span class="arrow" aria-hidden="true">→</span><span class="visually-hidden"
										>becomes</span
									>
									{#if entry.after === null}
										<span class="words cm-muted">removed</span>
									{:else}
										<span class="piece">{entry.after}</span>
									{/if}
								</td>
								<td class="words why">{entry.text}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<MoreRows
				shown={shownLog.length}
				total={log.length}
				noun="entries"
				onshowall={() => (allLog = true)}
			/>
		{/if}
	</section>
</div>

<style>
	.quads td {
		min-width: 3.25rem;
	}
	.op {
		font-weight: 600;
	}
	.text {
		color: var(--text-2);
	}
	.group th {
		position: static;
		padding: 8px 12px 2px;
		border: 0;
		background: none;
		color: var(--text);
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	tbody + tbody .group th {
		border-top: 1px solid var(--border);
	}
	.removed td {
		color: var(--text-3);
	}
	.removed td:not(.cm-num):not(.text) {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-3) 60%, transparent);
	}
	.changed {
		margin: 0 -3px;
		padding: 0 3px;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.log {
		max-height: min(18rem, 50vh);
	}
	.words {
		font-family: var(--font-sans);
	}
	.log td {
		padding-top: 2px;
		padding-bottom: 2px;
		white-space: normal;
	}
	.log td.cm-num,
	.log td.pass {
		white-space: nowrap;
	}
	.piece {
		white-space: nowrap;
	}
	.arrow {
		color: var(--text-3);
	}
	.why {
		min-width: 11rem;
		color: var(--text-2);
	}
</style>
