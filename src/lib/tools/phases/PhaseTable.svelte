<!--
	The phase table: one row per phase with its output (Phase | Output | Sample,
	as on Intro (cont'd), compiler architecture, slide 4), or the five phases of
	the structure slides. A first column brackets the rows by the chosen
	grouping.
-->
<script lang="ts">
	import { Icon, TokenPairs } from '$lib/components/ui';
	import type { TokenPair } from '$lib/components/ui';
	import AsmListing from './AsmListing.svelte';
	import {
		FIVE_GROUPS,
		FIVE_ROWS,
		GROUPING_INFO,
		SEVEN_ROWS,
		type Grouping,
		type PhaseRow,
		type RowGroup,
		type RowId,
		type View
	} from './groupings';
	import { phaseNotes } from './notes';
	import type { Compilation, PhaseId } from './pipeline';
	import QuadTable from './QuadTable.svelte';
	import { tokenName, type TokenKind } from './scanner';
	import TreeView from './TreeView.svelte';
	import { annotatedForest, astForest, countNodes, parseDiagram, type DisplayNode } from './trees';
	import { formatInstr } from './vax';

	interface Props {
		compilation: Compilation;
		view: View;
		grouping: Grouping;
		/** Link to the Lexer tool with this token set, or null when that tool is not on the site. */
		lexer: { href: string; title: string } | null;
	}

	let { compilation: c, view, grouping, lexer }: Props = $props();

	/** Larger trees are not drawn. */
	const MAX_TREE_NODES = 160;

	const PHASE_OF: Partial<Record<RowId, PhaseId>> = {
		scanner: 'scanner',
		parser: 'parser',
		semantic: 'semantic',
		icg: 'icg',
		optimizer: 'optimizer',
		codegen: 'codegen',
		peephole: 'peephole',
		lexical: 'scanner',
		syntax: 'parser',
		semantics: 'semantic',
		optimization: 'optimizer',
		generation: 'codegen'
	};
	const ORDER: PhaseId[] = [
		'scanner',
		'parser',
		'semantic',
		'icg',
		'optimizer',
		'codegen',
		'peephole'
	];
	const PHASE_NAME: Record<PhaseId, string> = {
		scanner: 'the scanner',
		parser: 'the parser',
		semantic: 'the semantic analyzer',
		icg: 'the intermediate code generator',
		optimizer: 'the optimizer',
		codegen: 'the code generator',
		peephole: 'the peephole optimizer'
	};

	/** Token colors by kind of token (the token palette index). */
	const TONE: Record<TokenKind, number> = {
		ID: 0,
		NUM: 1,
		FNUM: 1,
		IF: 3,
		THEN: 3,
		ELSE: 3,
		ASSIGN: 2,
		PLUS: 2,
		MINUS: 2,
		TIMES: 2,
		OVER: 2,
		EQ: 4,
		NE: 4,
		LT: 4,
		LE: 4,
		GT: 4,
		GE: 4,
		LPAREN: 5,
		RPAREN: 5,
		SEMI: 5
	};

	const rows = $derived<readonly PhaseRow[]>(view === 'seven' ? SEVEN_ROWS : FIVE_ROWS);
	const groups = $derived<readonly RowGroup[]>(
		view === 'seven' ? GROUPING_INFO[grouping].groups : FIVE_GROUPS
	);
	const numbered = $derived(groups.every((g) => g.rows.length === 1));
	const rowById = $derived(new Map(rows.map((r) => [r.id, r])));
	const notes = $derived(phaseNotes(c));

	const program = $derived(c.parse?.program ?? null);
	const empty = $derived(c.scan.tokens.length === 0 && c.scan.diagnostics.length === 0);

	function status(id: RowId): 'done' | 'error' | 'skipped' {
		const phase = PHASE_OF[id];
		if (!phase || c.stoppedAt === null) return 'done';
		const at = ORDER.indexOf(phase);
		const stop = ORDER.indexOf(c.stoppedAt);
		return at < stop ? 'done' : at === stop ? 'error' : 'skipped';
	}

	// Tokens and the source they came from; `hovered` links the two.
	let hovered = $state<number | null>(null);
	const naming = $derived(view);
	const pairs = $derived<TokenPair[]>(
		c.scan.tokens.map((t) => ({
			name: tokenName(t.kind, naming),
			lexeme: t.lexeme,
			rule: TONE[t.kind]
		}))
	);
	const segments = $derived.by(() => {
		const out: { text: string; token: number | null }[] = [];
		let at = 0;
		c.scan.tokens.forEach((t, i) => {
			if (t.start > at) out.push({ text: c.source.slice(at, t.start), token: null });
			out.push({ text: t.lexeme, token: i });
			at = t.end;
		});
		if (at < c.source.length) out.push({ text: c.source.slice(at), token: null });
		return out;
	});

	const ast = $derived(program ? astForest(program) : []);
	const annotated = $derived(c.semantic ? annotatedForest(c.semantic.stmts) : []);
	const diagram = $derived(program ? parseDiagram(program) : []);

	/** The note under the code generator's output, as the slide's example needs it. */
	const cvtIndex = $derived(
		c.code?.findIndex((i) => formatInstr(i) === 'CVTLF B1,r2' && i.kind === 'op') ?? -1
	);
	const codeMarks = $derived(new Map(cvtIndex >= 0 ? [[cvtIndex, '*']] : []));
	const showFootnote = $derived(cvtIndex >= 0);

	const summary = $derived.by(() => {
		if (c.stoppedAt) {
			const first = c.diagnostics.find((d) => d.severity === 'error');
			const why = first
				? first.message
				: c.declarations.hasErrors
					? 'the declarations table has a problem.'
					: '';
			return `Stopped at ${PHASE_NAME[c.stoppedAt]}: ${why}`;
		}
		if (empty) return 'No statements yet.';
		const phases = view === 'seven' ? 'All seven phases' : 'All five phases';
		return `${phases} ran: ${pairs.length} tokens, ${c.optimized?.quads.length ?? 0} quads after optimization, ${c.peephole?.code.filter((i) => i.kind === 'op').length ?? 0} instructions after the peephole optimizer.`;
	});

	// Speak the summary after the page settles (not on the first render).
	let spoken = $state('');
	let settled: string | undefined;
	$effect(() => {
		const text = summary;
		if (settled === undefined) {
			settled = text;
			return;
		}
		const timer = setTimeout(() => {
			if (text !== settled) spoken = text;
			settled = text;
		}, 900);
		return () => clearTimeout(timer);
	});

	function hoverItem(event: PointerEvent) {
		const el = (event.target as Element).closest<HTMLElement>('[data-token]');
		hovered = el ? Number(el.dataset.token) : null;
	}

	const skippedText = $derived(
		c.stoppedAt ? `Not produced: compilation stopped at ${PHASE_NAME[c.stoppedAt]}.` : ''
	);
</script>

{#snippet tree(roots: DisplayNode[], label: string, up = false)}
	{#if roots.length === 0}
		<p class="muted">No statements.</p>
	{:else if countNodes(roots) > MAX_TREE_NODES}
		<p class="muted">
			The tree has {countNodes(roots)} nodes; trees of up to {MAX_TREE_NODES} nodes are drawn.
		</p>
	{:else}
		<TreeView {roots} {label} orientation={up ? 'up' : 'down'} alignLeaves={up} />
	{/if}
{/snippet}

{#snippet errors(phase: PhaseId)}
	{@const list = c.diagnostics.filter(
		(d) =>
			d.severity === 'error' &&
			((phase === 'scanner' && c.scan.diagnostics.includes(d)) ||
				(phase === 'parser' && (c.parse?.diagnostics.includes(d) ?? false)) ||
				(phase === 'semantic' && (c.semantic?.diagnostics.includes(d) ?? false)))
	)}
	<ul class="errors">
		{#each list as d, i (i)}
			<li><Icon name="error" size={15} label="Error" /> {d.message}</li>
		{/each}
		{#if phase === 'semantic' && c.declarations.hasErrors}
			<li>
				<Icon name="error" size={15} label="Error" /> The declarations table has a problem; see the marked
				row.
			</li>
		{/if}
	</ul>
{/snippet}

{#snippet noteList(phase: PhaseId)}
	{#if notes[phase]?.length}
		<ul class="notes">
			{#each notes[phase] ?? [] as n, i (i)}<li>{n}</li>{/each}
		</ul>
	{/if}
{/snippet}

{#snippet lexerLink()}
	{#if lexer}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
		<a class="tool-link" href={lexer.href}
			>Open this token set in {lexer.title} <Icon name="arrow-right" size={14} /></a
		>
	{/if}
{/snippet}

{#snippet sample(id: RowId)}
	{@const st = status(id)}
	{#if id === 'source'}
		{#if c.source.trim() === ''}
			<p class="muted">No source.</p>
		{:else}
			<code class="src"
				>{#each segments as s, i (i)}{#if s.token !== null}<span
							class={{ lex: true, hl: s.token === hovered }}>{s.text}</span
						>{:else}{s.text}{/if}{/each}</code
			>
		{/if}
	{:else if st === 'skipped'}
		<p class="muted">{skippedText}</p>
	{:else if id === 'scanner'}
		{#if pairs.length}
			<TokenPairs
				tokens={pairs}
				format="angle"
				active={hovered}
				onhover={(i) => (hovered = i)}
				ariaLabel="Tokens and their lexemes"
			/>
		{:else if st !== 'error'}
			<p class="muted">No tokens.</p>
		{/if}
		{#if st === 'error'}{@render errors('scanner')}{/if}
		{@render noteList('scanner')}
		{@render lexerLink()}
	{:else if id === 'lexical'}
		{#if pairs.length}
			<!-- Pointer-only highlight; the same lexemes are listed as text. -->
			<dl class="lists" onpointerover={hoverItem} onpointerleave={() => (hovered = null)}>
				<dt>Lexemes</dt>
				<dd class="mono">
					{#each c.scan.tokens as t, i (i)}{i > 0 ? ', ' : ''}<span
							class={{ item: true, hl: i === hovered }}
							data-token={i}>{t.lexeme}</span
						>{/each}
				</dd>
				<dt>Tokens</dt>
				<dd class="mono">
					{#each pairs as p, i (i)}{i > 0 ? ', ' : ''}<span
							class={{ item: true, hl: i === hovered }}
							data-token={i}>{p.name}</span
						>{/each}
				</dd>
			</dl>
		{:else if st !== 'error'}
			<p class="muted">No lexemes.</p>
		{/if}
		{#if st === 'error'}{@render errors('scanner')}{/if}
		{@render lexerLink()}
	{:else if id === 'parser' || id === 'syntax'}
		{#if st === 'error'}
			{@render errors('parser')}
		{:else if id === 'parser'}
			{@render tree(ast, 'Abstract syntax tree')}
			{@render noteList('parser')}
		{:else}
			{@render tree(diagram, 'Parse diagram, root at the bottom', true)}
		{/if}
	{:else if id === 'semantic'}
		{@render tree(annotated, 'Annotated abstract syntax tree')}
		{#if st === 'error'}{@render errors('semantic')}{/if}
		{@render noteList('semantic')}
	{:else if id === 'semantics'}
		{#if c.semantic}
			<ul class="checks">
				{#each c.semantic.checks as check, i (i)}
					<li class={{ bad: !check.ok }}>
						<Icon
							name={check.ok ? 'check' : 'error'}
							size={15}
							label={check.ok ? 'Passed' : 'Error'}
						/>
						<span>{check.text}</span>
					</li>
				{/each}
			</ul>
			{#if c.semantic.checks.length === 0}<p class="muted">Nothing to check.</p>{/if}
		{/if}
		{#if c.declarations.hasErrors}{@render errors('semantic')}{/if}
	{:else if id === 'icg'}
		<QuadTable quads={c.tac ?? []} caption="Three-address code" />
		{@render noteList('icg')}
	{:else if id === 'optimizer' || id === 'optimization'}
		<QuadTable quads={c.optimized?.quads ?? []} caption="Optimized three-address code" />
		{@render noteList('optimizer')}
	{:else if id === 'codegen' || id === 'generation'}
		<AsmListing code={c.code ?? []} marks={codeMarks} label="Assembly code" />
		{@render noteList('codegen')}
	{:else if id === 'peephole'}
		<AsmListing
			code={c.peephole?.code ?? []}
			rewritten={c.peephole?.rewritten}
			label="Assembly code after the peephole optimizer"
		/>
		{@render noteList('peephole')}
	{/if}
{/snippet}

{#snippet groupCell(g: RowGroup)}
	{#if g.label === ''}
		<td class="group blank" rowspan={g.rows.length}></td>
	{:else}
		<th
			scope="rowgroup"
			rowspan={g.rows.length}
			class={['group', { numbered, optional: g.optional }]}
		>
			<span class="group-label"
				>{#if numbered}<span class="num">{g.label}</span>{:else}{g.label}{/if}</span
			>
			{#if g.detail}<span class="group-detail">{g.detail}</span>{/if}
		</th>
	{/if}
{/snippet}

<p class="visually-hidden" role="status">{spoken}</p>
<div class="table-wrap">
	<table class={['phases', { numbered }]}>
		<caption class="visually-hidden">
			{view === 'seven' ? 'Seven phases of a compiler' : 'Five phases of a compiler'}, with the
			output of each for the source above
		</caption>
		<thead>
			<tr>
				<th scope="col" class="group-col"><span class="visually-hidden">Group</span></th>
				<th scope="col" class="phase-col">Phase</th>
				<th scope="col" class="output-col">Output</th>
				<th scope="col">Sample</th>
			</tr>
		</thead>
		{#each groups as g, gi (gi)}
			<tbody class={['rowgroup', { source: g.label === '' }]}>
				{#each g.rows as id, ri (id)}
					{@const row = rowById.get(id)}
					{#if row}
						{@const st = status(id)}
						<tr class={['phase', `st-${st}`]}>
							{#if ri === 0}{@render groupCell(g)}{/if}
							<th scope="row" class="phase-name">
								{#if numbered && g.label}<span class="num inline" aria-hidden="true">{g.label}</span
									>{/if}
								<span class="name">{row.name}</span>
								{#if row.role}<span class="role">({row.role})</span>{/if}
							</th>
							<td class="output">{row.output}</td>
							<td class="sample">{@render sample(id)}</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		{/each}
	</table>
</div>
{#if showFootnote}
	<p class="footnote">
		<span class="mark">*</span> The slide assumes r2 already holds B1 as a float; CVTLF performs that
		conversion.
	</p>
{/if}

<style>
	.table-wrap {
		container: phases / inline-size;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.phases {
		width: 100%;
		table-layout: fixed;
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.phases th,
	.phases td {
		padding: 12px 14px;
		text-align: left;
		vertical-align: top;
	}
	thead th {
		padding-top: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	tbody + tbody {
		border-top: 1px solid var(--border-strong);
	}
	tbody tr + tr > * {
		border-top: 1px solid var(--border);
	}
	.phases:not(.numbered) tbody tr + tr > .group {
		border-top: 0;
	}

	/* Column widths (fixed layout: the sample column takes the rest) */
	.group-col {
		width: 9.5rem;
	}
	.numbered .group-col {
		width: 3.5rem;
	}
	.phase-col {
		width: 14rem;
	}
	.output-col {
		width: 11rem;
	}
	@container phases (max-width: 1080px) {
		.group-col {
			width: 8rem;
		}
		.phase-col {
			width: 11.5rem;
		}
		.output-col {
			width: 8.5rem;
		}
	}
	.group {
		position: relative;
		padding-right: 26px;
	}
	.group:not(.numbered):not(.blank)::after {
		content: '';
		position: absolute;
		top: 12px;
		bottom: 12px;
		right: 10px;
		width: 7px;
		border: 2px solid var(--accent);
		border-left: 0;
		border-radius: 0 5px 5px 0;
	}
	.group.optional::after {
		border-style: dashed;
	}
	.group-label {
		display: block;
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: 1.3;
	}
	.group-detail {
		display: block;
		margin-top: 2px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.4;
	}
	.optional .group-detail {
		color: var(--tok-3);
		font-style: italic;
	}
	.num {
		display: inline-grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.num.inline {
		display: none;
	}

	/* Phase and output columns */
	.phase-name {
		font-weight: 400;
	}
	.name {
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-style: italic;
		font-weight: 600;
	}
	.role {
		color: var(--text-2);
		margin-left: 0.25em;
	}
	.output {
		color: var(--text-2);
	}
	.sample {
		min-width: 0;
	}
	.sample > :global(* + *) {
		margin-top: var(--space-2);
	}
	.st-skipped .name,
	.st-skipped .output {
		color: var(--text-3);
	}
	.st-error .name {
		color: var(--reject);
	}

	/* Samples */
	.src {
		display: block;
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.lex,
	.item {
		border-radius: 3px;
		transition: background var(--duration) var(--ease);
	}
	.hl {
		background: var(--active-soft);
		box-shadow: 0 0 0 1px var(--active);
	}
	.lists {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 4px var(--space-3);
		margin: 0;
	}
	.lists dt {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.9;
		text-transform: uppercase;
	}
	.lists dd {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.7;
	}
	.item {
		padding: 1px 1px;
	}
	.muted {
		margin: 0;
		color: var(--text-3);
	}
	.notes,
	.errors,
	.checks {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.notes li {
		position: relative;
		padding-left: 14px;
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.notes li::before {
		content: '';
		position: absolute;
		left: 2px;
		top: 0.62em;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--border-strong);
	}
	.errors li,
	.checks li {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}
	.errors li {
		color: var(--reject);
	}
	.errors :global(.icon),
	.checks :global(.icon) {
		flex: none;
		margin-top: 3px;
	}
	.checks :global(.icon) {
		color: var(--accept);
	}
	.checks .bad {
		color: var(--reject);
	}
	.checks .bad :global(.icon) {
		color: var(--reject);
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}
	.tool-link:hover {
		text-decoration: underline;
	}

	.footnote {
		margin: var(--space-3) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.footnote .mark {
		color: var(--accent);
		font-weight: 600;
	}

	/* Narrow containers: each row becomes a card; brackets become bands. */
	@container phases (max-width: 780px) {
		.phases,
		.phases tbody,
		.phases tr,
		.phases th,
		.phases td {
			display: block;
			width: auto;
		}
		.phases thead {
			display: none;
		}
		.phases th,
		.phases td {
			padding: 0;
		}
		.phases tr {
			display: flex;
			flex-direction: column;
			gap: var(--space-1);
			padding: 12px 14px;
		}
		tbody tr + tr > * {
			border-top: 0;
		}
		tbody tr + tr {
			border-top: 1px solid var(--border);
		}
		.group {
			margin: -12px -14px 6px;
			padding: 8px 14px !important;
			border-bottom: 1px solid var(--border);
			background: var(--surface-2);
		}
		.group.numbered,
		.group.blank {
			display: none;
		}
		.group::after {
			display: none;
		}
		.group-label,
		.group-detail {
			display: inline;
		}
		.group-detail {
			margin-left: var(--space-2);
		}
		.optional {
			border-left: 3px dashed var(--accent);
		}
		.group:not(.numbered):not(.blank):not(.optional) {
			border-left: 3px solid var(--accent);
		}
		.num.inline {
			display: inline-grid;
			width: 1.4rem;
			height: 1.4rem;
			margin-right: 6px;
			font-size: var(--text-xs);
			font-style: normal;
			vertical-align: 1px;
		}
		.output {
			font-size: var(--text-xs);
		}
		.sample {
			margin-top: var(--space-1);
		}
	}
</style>
