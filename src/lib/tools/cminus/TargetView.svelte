<!--
	TINY Machine code: the listing (address, instruction, comment) in sections
	for the prelude, input, output and every function, before or after the
	peephole pass; what that pass removed; the global variables and every
	function's activation record.
-->
<script lang="ts">
	import { Icon, SegmentedControl } from '$lib/components/ui';
	import { isLoadable, type Compilation } from '$lib/theory/cminus';
	import { IADDR_SIZE } from '$lib/tools/tiny-vm/machine';
	import DiagnosticList from './DiagnosticList.svelte';
	import MoreRows from './MoreRows.svelte';
	import { revealMarked } from './reveal';
	import { plural, rangeOf, type SelectionMarks, type SourceRange } from './selection';
	import type { Version } from './state';
	import {
		ROW_LIMIT,
		SHORT_LIST,
		capGroups,
		firstOf,
		frameRows,
		globalRows,
		listingSections,
		phaseDiagnostics
	} from './views';

	interface Props {
		c: Compilation;
		marks: SelectionMarks;
		/** The code shown: before or after the peephole pass. */
		version?: Version;
		selKey?: string;
		/**
		 * Builds the link that opens a listing in the TINY Machine tool; null (or a
		 * null result) hides the link.
		 */
		machineHref?: ((listing: string) => string | null) | null;
		onselect: (range: SourceRange) => void;
	}

	let {
		c,
		marks,
		version = $bindable('before'),
		selKey = '',
		machineHref = null,
		onselect
	}: Props = $props();

	let all = $state(false);
	let allFrames = $state(false);

	const codegen = $derived(c.codegen!);
	const code = $derived(version === 'before' ? codegen.code : codegen.peephole.code);
	const marked = $derived(version === 'before' ? marks.code : marks.final);
	const diagnostics = $derived(phaseDiagnostics(c, 'codegen'));
	const sections = $derived(listingSections(codegen, version));
	const capped = $derived(capGroups(sections, all ? Infinity : ROW_LIMIT));
	const changes = $derived(codegen.peephole.changes);
	const globals = $derived(globalRows(codegen.globals));
	const globalList = $derived(firstOf(globals, SHORT_LIST));
	/** A large program has many functions: the first records are shown. */
	const frameList = $derived(firstOf(codegen.frames, allFrames ? Infinity : SHORT_LIST));
	const frames = $derived(
		frameList.shown.map((frame) => ({ frame, rows: firstOf(frameRows(frame), SHORT_LIST) }))
	);
	const href = $derived(isLoadable(code) ? (machineHref?.(code.listing) ?? null) : null);

	/** The click handler of a row: it selects the source text the row came from, if it has one. */
	const pick = (span: SourceRange | null) => (span ? () => onselect(rangeOf(span)) : undefined);

	const options = [
		{ value: 'before' as const, label: 'Before peephole' },
		{ value: 'after' as const, label: 'After peephole' }
	];
</script>

<div class="cm-stack">
	{#if diagnostics.length}
		<DiagnosticList {c} {diagnostics} label="Code generator diagnostics" {onselect} />
	{/if}

	<div class="cm-toolbar">
		<SegmentedControl label="Target code shown" {options} bind:value={version} />
		{#if href}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
			<a class="open" {href}>Open in TINY Machine <Icon name="arrow-right" size={14} /></a>
		{/if}
	</div>
	<p class="cm-note">
		{#if version === 'before'}
			{plural(codegen.code.instructions.length, 'instruction')}, one quad at a time; the peephole
			pass removes {changes.length}.
		{:else}
			{plural(codegen.peephole.code.instructions.length, 'instruction')} after the peephole pass: the
			code that runs.
		{/if}
		{#if !isLoadable(code)}
			The TINY Machine has {IADDR_SIZE} instruction cells: this code does not fit.
		{/if}
	</p>

	<div class="cm-box" {@attach revealMarked(`${selKey}/${version}`)}>
		<table class="cm-table listing">
			<caption class="visually-hidden">
				TINY Machine code {version === 'before' ? 'before' : 'after'} the peephole pass
			</caption>
			<thead>
				<tr>
					<th scope="col" class="cm-num">Address</th>
					<th scope="col" colspan="2">Instruction</th>
					<th scope="col" class="cm-wide">Comment</th>
				</tr>
			</thead>
			<!-- Keyed by place, not by name: a function can be called "prelude" like the first section. -->
			{#each capped.groups as section (section.key)}
				<tbody>
					<tr class="group">
						<th scope="rowgroup" colspan="4">
							{section.title}
							<span class="where">{section.addresses}</span>
						</th>
					</tr>
					{#each section.rows as row, i (i)}
						{#if row.kind === 'comment'}
							<tr class="comment">
								<td></td>
								<td colspan="3">* {row.text}</td>
							</tr>
						{:else}
							{@const on = marked.has(row.addr)}
							<!-- A click anywhere in the row selects; the button in it does the same from the keyboard. -->
							<tr
								class={[row.span ? 'cm-row' : 'fixed', { 'cm-marked': on, dropped: !!row.dropped }]}
								title={row.dropped ?? undefined}
								onclick={pick(row.span)}
							>
								<td class="cm-num">
									{#if row.span}
										<button
											type="button"
											class="cm-pick"
											aria-label="Address {row.addr}: {row.op} {row.operands}, {row.comment}"
											aria-current={on ? 'true' : undefined}>{row.addr}</button
										>
									{:else}{row.addr}{/if}
								</td>
								<td class="op">{row.op}</td>
								<td>{row.operands}</td>
								<td class="note"
									>{row.comment}{#if row.dropped}<span class="cm-tag"
											>removed by the peephole pass</span
										>{/if}</td
								>
							</tr>
						{/if}
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
	<MoreRows shown={capped.shown} total={capped.total} noun="lines" onshowall={() => (all = true)} />

	<section class="cm-section">
		<h3 class="cm-heading">
			Peephole pass <span class="cm-sub">{plural(changes.length, 'instruction')} removed</span>
		</h3>
		{#if changes.length === 0}
			<p class="cm-note">The peephole pass removed nothing.</p>
		{:else}
			<div class="cm-box changes">
				<table class="cm-table">
					<caption class="visually-hidden">Instructions the peephole pass removed</caption>
					<thead>
						<tr>
							<th scope="col" class="cm-num">Address</th>
							<th scope="col">Instruction</th>
							<th scope="col" class="cm-wide">Why it is not needed</th>
						</tr>
					</thead>
					<tbody>
						{#each changes.slice(0, ROW_LIMIT) as change (change.addr)}
							{@const span = codegen.code.instructions[change.addr]?.span ?? null}
							{@const on = marks.code.has(change.addr)}
							<!-- A click anywhere in the row selects; the button in it does the same from the keyboard. -->
							<tr class={[span ? 'cm-row' : 'fixed', { 'cm-marked': on }]} onclick={pick(span)}>
								<td class="cm-num">
									{#if span}
										<button
											type="button"
											class="cm-pick"
											aria-label="Removed at address {change.addr}: {change.instruction}"
											aria-current={on ? 'true' : undefined}>{change.addr}</button
										>
									{:else}{change.addr}{/if}
								</td>
								<td>{change.instruction}</td>
								<td class="words">{change.text}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="cm-note cm-muted">
				Addresses are those of the code before the pass.
				{#if changes.length > ROW_LIMIT}
					The first {ROW_LIMIT} are listed.
				{/if}
			</p>
		{/if}
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">
			Data layout
			<span class="cm-sub"
				>{plural(codegen.globals.size, 'cell')} of globals, then the activation records</span
			>
		</h3>
		<div class="frames">
			<div class="frame">
				<table class="cm-table">
					<caption>Global variables</caption>
					<thead>
						<tr>
							<th scope="col">Offset</th>
							<th scope="col" class="cm-wide">What lives there</th>
						</tr>
					</thead>
					<tbody>
						{#each globalList.shown as row (row.offset)}
							<tr>
								<td>{row.offset}</td>
								<td class="words">{row.what}</td>
							</tr>
						{:else}
							<tr><td colspan="2" class="words cm-muted">No global variables.</td></tr>
						{/each}
						{#if globalList.more}
							<tr>
								<td colspan="2" class="words cm-muted"
									>{plural(globalList.more, 'more variable')}</td
								>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
			{#each frames as { frame, rows } (frame.function)}
				<div class="frame">
					<table class="cm-table">
						<caption
							>{frame.function} <span class="size">{plural(frame.size, 'cell')}</span></caption
						>
						<thead>
							<tr>
								<th scope="col">Offset</th>
								<th scope="col" class="cm-wide">What lives there</th>
							</tr>
						</thead>
						<tbody>
							{#each rows.shown as row (row.offset)}
								<tr>
									<td>{row.offset}</td>
									<td class="words">{row.what}</td>
								</tr>
							{/each}
							{#if rows.more}
								<tr>
									<td colspan="2" class="words cm-muted"
										>{plural(rows.more, 'more entry', 'more entries')}</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
		<MoreRows
			shown={frameList.shown.length}
			total={codegen.frames.length}
			noun="activation records"
			onshowall={() => (allFrames = true)}
		/>
	</section>
</div>

<style>
	.open {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-sm);
		font-weight: 500;
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
	.where {
		margin-left: var(--space-2);
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 400;
	}
	.comment td {
		color: var(--text-3);
	}
	.op {
		font-weight: 600;
	}
	.listing td.op {
		padding-right: 0;
	}
	.note {
		color: var(--text-2);
		font-family: var(--font-sans);
	}
	.dropped td:not(.cm-num):not(.note) {
		color: var(--text-3);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-3) 60%, transparent);
	}
	.dropped .note {
		color: var(--text-3);
	}
	.changes {
		max-height: min(14rem, 45vh);
	}
	.words {
		font-family: var(--font-sans);
		white-space: normal;
	}
	.frames {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-3);
		align-items: start;
	}
	.frame {
		min-width: 0;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.frame caption {
		padding: 6px 12px 4px;
		color: var(--text);
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-weight: 600;
		text-align: left;
	}
	.frame :global(th) {
		position: static;
	}
	.size {
		margin-left: var(--space-2);
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 400;
	}
</style>
