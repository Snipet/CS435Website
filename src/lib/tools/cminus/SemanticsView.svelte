<!--
	The semantic analyzer's result: its diagnostics, the tree of scopes with one
	symbol table per scope, and the syntax tree again with the type of every
	expression.
-->
<script lang="ts">
	import type { Compilation } from '$lib/theory/cminus';
	import AstOutline from './AstOutline.svelte';
	import DiagnosticList from './DiagnosticList.svelte';
	import { revealMarked } from './reveal';
	import { plural, within, type SelectionMarks, type SourceRange } from './selection';
	import MoreRows from './MoreRows.svelte';
	import { SHORT_LIST, declaredSymbols, firstOf, phaseDiagnostics, scopeViews } from './views';

	/** Scopes shown before "List all" is used, and symbols listed per scope. */
	const SCOPE_LIMIT = 60;
	const SYMBOL_LIMIT = 200;

	interface Props {
		c: Compilation;
		marks: SelectionMarks;
		selection: SourceRange | null;
		selKey?: string;
		onselect: (range: SourceRange) => void;
	}

	let { c, marks, selection, selKey = '', onselect }: Props = $props();

	const semantic = $derived(c.semantic!);
	const diagnostics = $derived(phaseDiagnostics(c, 'semantic'));
	const scopes = $derived(scopeViews(c));
	let all = $state(false);
	/** A large program has many scopes: the first ones are shown. */
	const scopeList = $derived(firstOf(scopes, all ? Infinity : SCOPE_LIMIT));
	const inSelection = (span: SourceRange) => selection !== null && within(span, selection);
</script>

<div class="cm-stack">
	<section class="cm-section">
		<h3 class="cm-heading">Diagnostics</h3>
		{#if diagnostics.length}
			<DiagnosticList {diagnostics} label="Semantic diagnostics" {onselect} />
		{:else}
			<p class="cm-note">No errors and no warnings.</p>
		{/if}
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">
			Scopes and symbol tables
			<span class="cm-sub"
				>{plural(scopes.length, 'scope')}, {plural(declaredSymbols(c), 'symbol')} declared by the program</span
			>
		</h3>
		<div class="cm-box scopes" {@attach revealMarked(selKey)}>
			{#each scopeList.shown as scope (scope.id)}
				{@const symbols = firstOf(scope.symbols, SYMBOL_LIMIT)}
				<div class="scope" style="--depth: {scope.depth}">
					<p class="scope-head">
						{#if scope.range}
							<button type="button" class="scope-name" onclick={() => onselect(scope.range!)}
								>{scope.title}</button
							>
							<span class="cm-muted">{scope.lines}</span>
						{:else}
							<span class="scope-name">{scope.title}</span>
						{/if}
					</p>
					{#if scope.symbols.length}
						<table class="cm-table symbols">
							<caption class="visually-hidden">Symbols of {scope.title}</caption>
							<thead>
								<tr>
									<th scope="col">Name</th>
									<th scope="col">Kind</th>
									<th scope="col">Type</th>
									<th scope="col">Declared at line</th>
									<th scope="col">Used at lines</th>
									<th scope="col" class="cm-wide">Storage</th>
								</tr>
							</thead>
							<tbody>
								{#each symbols.shown as s (s.id)}
									{@const declared = s.declared !== null && inSelection(s.declared.span)}
									{@const uses = firstOf(s.uses, SHORT_LIST)}
									<tr class={{ 'cm-marked': declared, builtin: s.builtin }}>
										<th scope="row" class="name">{s.name}</th>
										<td class="words">{s.kind}</td>
										<td>{s.type}</td>
										<td>
											{#if s.declared}
												<button
													type="button"
													class={['cm-chip', { 'cm-marked': declared }]}
													aria-label="Declaration of {s.name}, line {s.declared.line}"
													onclick={() => onselect(s.declared!.range)}>{s.declared.line}</button
												>
											{:else}
												<span class="words cm-muted">predefined</span>
											{/if}
										</td>
										<td class="uses">
											{#each uses.shown as use, i (i)}
												<button
													type="button"
													class={['cm-chip', { 'cm-marked': inSelection(use.span) }]}
													aria-label="Use of {s.name}, line {use.line}"
													onclick={() => onselect(use.range)}>{use.line}</button
												>
											{:else}
												<span class="words cm-muted">not used</span>
											{/each}
											{#if uses.more}
												<span class="words cm-muted"
													>and {uses.more.toLocaleString('en-US')} more</span
												>
											{/if}
										</td>
										<td>{s.storage}</td>
									</tr>
								{/each}
								{#if symbols.more}
									<tr>
										<td colspan="6" class="words cm-muted"
											>and {symbols.more.toLocaleString('en-US')} more symbols</td
										>
									</tr>
								{/if}
							</tbody>
						</table>
					{:else}
						<p class="cm-note cm-muted empty">No declarations.</p>
					{/if}
				</div>
			{/each}
		</div>
		<MoreRows
			shown={scopeList.shown.length}
			total={scopes.length}
			noun="scopes"
			onshowall={() => (all = true)}
		/>
		<p class="cm-note cm-muted">
			Storage is where a variable lives when the program runs: an offset from gp for a global, from
			fp for a parameter or a local.
		</p>
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">
			Types <span class="cm-sub">the syntax tree, with the type of every expression</span>
		</h3>
		<AstOutline
			program={c.parse!.program}
			types={semantic.types}
			marked={marks.nodes}
			{selKey}
			label="Syntax tree with types"
			{onselect}
		/>
	</section>
</div>

<style>
	.scopes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.scope {
		min-width: min-content;
		margin-left: calc(var(--depth) * 1.25rem);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.scope-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--surface-2);
		font-size: var(--text-sm);
	}
	.scope-name {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font-weight: 600;
	}
	button.scope-name {
		cursor: pointer;
	}
	button.scope-name:hover {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	/* The scope's own header is above the table: the column heads do not stick. */
	.symbols :global(th) {
		position: static;
		background: none;
	}
	.symbols tbody th.name {
		padding: 1px 12px;
		border: 0;
		background: none;
		color: var(--syn-name);
		font-family: var(--font-mono);
		font-size: inherit;
		font-weight: 600;
		letter-spacing: 0;
		vertical-align: baseline;
	}
	.symbols tbody tr:global(.cm-marked) > :first-child {
		box-shadow: inset 3px 0 0 var(--active);
	}
	.words {
		font-family: var(--font-sans);
	}
	.uses {
		min-width: 9.5rem;
		white-space: normal;
	}
	.uses :global(.cm-chip) {
		margin: 1px 2px 1px 0;
	}
	.builtin .name {
		color: var(--text-2);
	}
	.empty {
		padding: 6px 12px;
	}
</style>
