<!--
	The scanner's result: a table of line:column, token, lexeme and (for NUM)
	value, in the course's upper-case token names. A row selects its token.
-->
<script lang="ts">
	import { Badge, Toggle } from '$lib/components/ui';
	import type { Compilation } from '$lib/theory/cminus';
	import DiagnosticList from './DiagnosticList.svelte';
	import MoreRows from './MoreRows.svelte';
	import { revealMarked } from './reveal';
	import { plural, rangeOf, type SelectionMarks, type SourceRange } from './selection';
	import { ROW_LIMIT, phaseDiagnostics, tokenCount, tokenRows } from './views';

	interface Props {
		c: Compilation;
		marks: SelectionMarks;
		/** List the comments too. */
		comments?: boolean;
		/** Changes with the selection: the marked rows are brought into view. */
		selKey?: string;
		onselect: (range: SourceRange) => void;
	}

	let { c, marks, comments = $bindable(false), selKey = '', onselect }: Props = $props();

	let all = $state(false);

	const rows = $derived(tokenRows(c.scan, { comments }));
	const shown = $derived(all ? rows : rows.slice(0, ROW_LIMIT));
	const diagnostics = $derived(phaseDiagnostics(c, 'scanner'));
	const commentCount = $derived(c.scan.trivia.filter((t) => t.kind === 'comment').length);
	const errors = $derived(c.scan.tokens.filter((t) => t.type === 'ERROR').length);
</script>

<div class="cm-stack">
	<div class="cm-toolbar">
		<p class="cm-note">
			{plural(tokenCount(c.scan), 'token')}, then ENDFILE.
			{#if errors}{plural(errors, 'ERROR token')}.{/if}
			White space and {plural(commentCount, 'comment')} produce no token.
		</p>
		<Toggle label="List comments" bind:checked={comments} />
	</div>

	{#if diagnostics.length}
		<DiagnosticList {c} {diagnostics} label="Scanner diagnostics" {onselect} />
	{/if}

	<div class="cm-box" {@attach revealMarked(selKey)}>
		<table class="cm-table">
			<caption class="visually-hidden">Tokens in source order</caption>
			<thead>
				<tr>
					<th scope="col" class="cm-num">Line:col</th>
					<th scope="col">Token</th>
					<th scope="col">Lexeme</th>
					<th scope="col" class="cm-wide">Value</th>
				</tr>
			</thead>
			<tbody>
				{#each shown as row (row.kind + row.index)}
					{@const marked =
						row.kind === 'token' ? marks.tokens.has(row.index) : marks.comments.has(row.index)}
					<!-- A click anywhere in the row selects; the button in it does the same from the keyboard. -->
					<tr
						class={[
							row.end ? 'fixed' : 'cm-row',
							row.kind,
							{ 'cm-marked': marked, error: row.error, end: row.end }
						]}
						onclick={row.end ? undefined : () => onselect(rangeOf(row.span))}
					>
						<td class="cm-num">{row.line}:{row.column}</td>
						<td class="type">
							{#if row.end}
								{row.type}
							{:else}
								<button
									type="button"
									class="cm-pick"
									aria-label="{row.type} {row.lexeme}, line {row.line}, column {row.column}"
									aria-current={marked ? 'true' : undefined}>{row.type}</button
								>
							{/if}
							{#if row.error}<Badge tone="reject">not a token</Badge>{/if}
						</td>
						<td class="lexeme">{row.lexeme}</td>
						<td class="value">{row.value}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<MoreRows shown={shown.length} total={rows.length} noun="rows" onshowall={() => (all = true)} />
</div>

<style>
	.type {
		font-weight: 600;
	}
	.type :global(.badge) {
		margin-left: var(--space-2);
		font-family: var(--font-sans);
	}
	.error .type,
	.error .lexeme {
		color: var(--reject);
	}
	.comment td,
	.end td {
		color: var(--text-3);
	}
	.comment .type {
		font-family: var(--font-sans);
		font-style: italic;
		font-weight: 400;
	}
	.value {
		color: var(--syn-number);
	}
</style>
