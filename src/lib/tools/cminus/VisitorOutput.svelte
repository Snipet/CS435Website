<!--
	What the visitor holds after the current step: its member variables, and
	what it has produced so far: PrintVisitor's out, SymbolTableVisitor's
	open scopes and errors, ConstantFolder's folded values. What the step
	itself added is marked; a line number selects its node in the source
	(the run stays at its step). A box that scrolls takes keyboard focus.
-->
<script lang="ts">
	import type { VisitTrace } from '$lib/theory/cminus';
	import { revealBlock, watchOverflow } from './reveal';
	import { plural, type SelectionMarks, type SourceRange } from './selection';
	import { ROW_LIMIT } from './views';
	import {
		addedNodes,
		errorsAt,
		foldsAt,
		membersAt,
		printedLines,
		rangeOfNode,
		scopeTables,
		type TraceIndex
	} from './visitor-view';

	interface Props {
		trace: VisitTrace;
		index: TraceIndex;
		/** The step shown. */
		at: number;
		/** The program text, for the expressions that were folded. */
		source: string;
		marks: SelectionMarks;
		onselect: (range: SourceRange) => void;
	}

	let { trace, index, at, source, marks, onselect }: Props = $props();

	const members = $derived(membersAt(trace, at));
	/** Nodes whose records the step added. */
	const added = $derived(addedNodes(trace, at));

	let all = $state(false);
	const lines = $derived(trace.visitor === 'print' ? printedLines(trace, at) : []);
	const hiddenLines = $derived(all ? 0 : Math.max(0, lines.length - ROW_LIMIT));
	const scopes = $derived(trace.visitor === 'symbols' ? scopeTables(trace, index, at) : []);
	const errors = $derived(trace.visitor === 'symbols' ? errorsAt(trace, index, at) : []);
	const folds = $derived(trace.visitor === 'fold' ? foldsAt(trace, index, source, at) : []);
	const hiddenFolds = $derived(all ? 0 : Math.max(0, folds.length - ROW_LIMIT));
	/** The run folds something at some step. */
	const foldsSome = $derived(trace.output.some((r) => r.kind === 'fold'));

	const pick = (node: number | null) => {
		const range = rangeOfNode(index, node);
		if (range) onselect(range);
	};

	let box: HTMLElement | undefined = $state();
	let scrolls = $state(false);
	const watch = watchOverflow((value) => (scrolls = value));
	const named = (label: string) => (scrolls ? `${label}, scrolls` : label);

	// What the step added stays in view inside its box.
	$effect(() => {
		void at;
		const el = box;
		if (!el) return;
		const frame = requestAnimationFrame(() => {
			const fresh = el.querySelectorAll('.added');
			if (fresh.length) revealBlock(el, fresh[0], fresh[fresh.length - 1]);
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="output">
	<dl
		class="members"
		aria-label="Member variables of {trace.visitor === 'print'
			? 'the printer'
			: trace.visitor === 'symbols'
				? 'the builder'
				: 'the folder'}"
	>
		{#each members as m (m.name)}
			<div>
				<dt>{m.name}</dt>
				<dd>{m.value}</dd>
			</div>
		{/each}
	</dl>

	{#if trace.visitor === 'print'}
		{#if hiddenLines}
			<p class="cm-note cm-muted">
				The last {ROW_LIMIT.toLocaleString('en-US')} of {plural(lines.length, 'line')} are listed.
				<button type="button" class="link" onclick={() => (all = true)}>List all</button>
			</p>
		{/if}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="cm-box text"
			bind:this={box}
			{@attach watch}
			role="group"
			aria-label={named('printer.out')}
			tabindex={scrolls ? 0 : undefined}
		>
			{#if lines.length}
				<ol>
					{#each lines.slice(hiddenLines) as line, i (i + hiddenLines)}
						<li class={{ added: added.has(line.node), 'cm-marked': marks.nodes.has(line.node) }}>
							<code>{line.text}</code>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="empty">out is empty.</p>
			{/if}
		</div>
	{:else if trace.visitor === 'symbols'}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="cm-box scopes"
			bind:this={box}
			{@attach watch}
			role="group"
			aria-label={named('Open scopes, the innermost last')}
			tabindex={scrolls ? 0 : undefined}
		>
			{#each scopes as scope (scope.id)}
				<section class="scope" style="--level: {scope.level}">
					<h4>
						<span class="level">scopes[{scope.level}]</span>
						{#if scope.node !== null}
							<button type="button" class="link" onclick={() => pick(scope.node)}
								>{scope.title}</button
							>
						{:else}
							{scope.title}
						{/if}
					</h4>
					{#if scope.entries.length}
						<ul class="entries" aria-label="Names in scopes[{scope.level}], {scope.title}">
							{#each scope.entries as entry (entry.name)}
								<li
									class={{
										added: entry.node !== null && added.has(entry.node),
										'cm-marked': entry.node !== null && marks.nodes.has(entry.node)
									}}
								>
									<code class="name">{entry.name}</code>
									<span class="decl">{entry.nodeClass ?? 'predefined'}</span>
									{#if entry.line !== null}
										<button
											type="button"
											class="cm-chip"
											aria-label="Declaration of {entry.name}, line {entry.line}"
											onclick={() => pick(entry.node)}>{entry.line}</button
										>
									{:else}
										<span></span>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">No names yet.</p>
					{/if}
				</section>
			{/each}
		</div>
		<section class="errors" aria-label="errors">
			<h4>errors</h4>
			{#if errors.length}
				<ul>
					{#each errors as error, i (i)}
						<li class={{ added: added.has(error.node) }}>
							{#if error.line !== null}
								<button
									type="button"
									class="cm-chip"
									aria-label="Line {error.line}"
									onclick={() => pick(error.node)}>{error.line}</button
								>
							{/if}
							<code>"{error.message}"</code>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">None so far.</p>
			{/if}
		</section>
	{:else}
		{#if hiddenFolds}
			<p class="cm-note cm-muted">
				The last {ROW_LIMIT.toLocaleString('en-US')} of {plural(folds.length, 'value')} are listed.
				<button type="button" class="link" onclick={() => (all = true)}>List all</button>
			</p>
		{/if}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="cm-box"
			bind:this={box}
			{@attach watch}
			role="group"
			aria-label={named('folded')}
			tabindex={scrolls ? 0 : undefined}
		>
			{#if folds.length}
				<table class="cm-table">
					<caption class="visually-hidden">Folded values</caption>
					<thead>
						<tr>
							<th scope="col" class="cm-num">Line</th>
							<th scope="col">Expression</th>
							<th scope="col" class="cm-wide">Folded</th>
						</tr>
					</thead>
					<tbody>
						{#each folds.slice(hiddenFolds) as fold (fold.node)}
							<tr class={{ added: added.has(fold.node), 'cm-marked': marks.nodes.has(fold.node) }}>
								<td class="cm-num">
									{#if fold.line !== null}
										<button
											type="button"
											class="cm-chip"
											aria-label="Line {fold.line}: {fold.source}"
											onclick={() => pick(fold.node)}>{fold.line}</button
										>
									{/if}
								</td>
								<td>{fold.source}</td>
								<td>{fold.text}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if foldsSome}
				<p class="empty">Nothing folded so far.</p>
			{:else}
				<p class="empty">
					Nothing is folded in this program: none of its operators has two constant operands it can
					fold. The preset “Constant expressions” has some.
				</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.output {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.members {
		display: flex;
		flex-wrap: wrap;
		gap: 2px var(--space-4);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.members div {
		display: flex;
		align-items: baseline;
		gap: 0.4em;
	}
	.members dt,
	.members dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
	}
	.members dt::after {
		content: ' =';
		color: var(--text-3);
	}
	.members dd {
		font-weight: 600;
	}
	.cm-box {
		max-height: min(24rem, 60vh);
	}
	.text ol {
		min-width: max-content;
		margin: 0;
		padding: 6px 0;
		list-style: none;
	}
	.text li {
		padding: 0 12px;
		border-left: 3px solid transparent;
		font-family: var(--font-mono);
		font-size: 0.78125rem;
		line-height: 1.6;
		white-space: pre;
	}
	.text code {
		padding: 0;
		border: 0;
		background: none;
		font-size: inherit;
	}
	.added,
	.text li.added {
		border-left-color: var(--info);
		background: var(--info-soft);
	}
	tr.added > :first-child {
		box-shadow: inset 3px 0 0 var(--info);
	}
	.empty {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.scopes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
	}
	.scope {
		margin-left: calc(min(var(--level), 6) * 0.75rem);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	h4 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		margin: 0;
		padding: 4px 10px;
		background: var(--surface-2);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.level {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.entries {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		margin: 0;
		padding: 2px 0;
		list-style: none;
	}
	.entries li {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: baseline;
		column-gap: var(--space-3);
		padding: 1px 10px;
		border-left: 3px solid transparent;
		font-size: var(--text-sm);
	}
	.entries code {
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.8125rem;
	}
	.name {
		font-weight: 600;
	}
	.decl {
		min-width: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}
	.errors {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.errors h4 {
		padding: 0;
		background: none;
		font-family: var(--font-mono);
	}
	.errors ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.errors li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 2px 6px;
		border-left: 3px solid transparent;
		font-size: var(--text-sm);
	}
	.errors code {
		color: var(--reject);
	}
	.errors .empty {
		padding: 0;
	}
	.link {
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.link:hover {
		color: var(--accent-hover);
	}
	.link:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
</style>
