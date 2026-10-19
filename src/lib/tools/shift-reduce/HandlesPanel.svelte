<!--
	The handles of a bottom-up parse as Bottom-Up Parsing, slides 5–10 show
	them: the sentential forms from the input down to the start symbol, the
	handle of the last reduction in red, and the tree growing over the tokens.
	Once complete, the upward arrow: read upward, the list is a rightmost
	derivation, which stands beside it read top-down.
-->
<script lang="ts">
	import { ParseTreeView } from '$lib/components/grammar';
	import { productionText } from '$lib/components/grammar/lr-item';
	import { StepControls, Toggle, type Stepper } from '$lib/components/ui';
	import type { HandleStep } from '$lib/theory/grammar';
	import FindHandle from './FindHandle.svelte';
	import { MAX_PICK_FORM } from './handle-check';
	import type { ParseView } from './model';
	import { derivationRows, forestAfter, handleRows, type FormView } from './view';

	interface Props {
		result: ParseView;
		handles: readonly HandleStep[];
		stepper: Stepper;
		/** Rows of the finished drawing (`minRows`). */
		treeRows: number;
		maxTreeTokens: number;
	}

	let { result, handles, stepper, treeRows, maxTreeTokens }: Props = $props();

	let finding = $state(false);

	const g = $derived(result.grammar);
	const rows = $derived(handleRows(handles));
	const derivation = $derived(result.derivation ? derivationRows(g, result.derivation) : []);
	/** Reductions: the last form is the start symbol. */
	const n = $derived(handles.length - 1);
	const s = $derived(stepper.index);
	const complete = $derived(s >= n);

	const tokens = $derived(result.parse.input.length - 1);
	const drawn = $derived(tokens <= maxTreeTokens);
	const forest = $derived(drawn ? forestAfter(result.parse, s) : null);

	const production = (id: number | null) => {
		if (id === null) return '';
		const p = g.productions[id];
		return productionText(p.lhs, p.rhs, 'hug');
	};

	const caption = (i: number): string => {
		if (i === 0) return 'The input: no reduction yet.';
		const last = rows[i - 1];
		const text = `${i} of ${n}: the handle ${handleText(last.marked)} of the form above is reduced by ${production(last.production)}.`;
		return i >= n ? `${text} The start symbol is reached.` : text;
	};

	function handleText(form: FormView): string {
		const marked = form.pieces.filter((p) => p.mark);
		return form.empty ? 'ε' : marked.map((p) => p.text).join('');
	}

	const current = $derived(handles[s]);
	const canFind = $derived(
		!complete && current !== undefined && current.form.length <= MAX_PICK_FORM
	);
</script>

{#snippet form(
	view: FormView,
	spoken: boolean
)}{#each view.pieces as piece, k (k)}{#if piece.mark}{#if spoken}<span class="visually-hidden"
					>handle:
				</span>{/if}{#if piece.text}<span class="handle">{piece.text}</span>{:else}<span
					class="handle empty"
					aria-hidden="true">ε</span
				>{#if spoken}<span class="visually-hidden">ε</span>{/if}{/if}{#if spoken}<span
					class="visually-hidden">, end of handle</span
				>{/if}{:else}{piece.text}{/if}{/each}{/snippet}

{#snippet made(
	view: FormView
)}{#each view.pieces as piece, k (k)}{#if piece.mark}{#if piece.text}<span class="made"
					>{piece.text}</span
				>{:else}<span class="made empty" aria-hidden="true">ε</span
				>{/if}{:else}{piece.text}{/if}{/each}{/snippet}

<div class="handles-tab">
	<StepControls
		{stepper}
		noun="Reduction"
		ariaLabel="Reductions"
		counter={(i, total) => `${i} of ${total - 1} reductions`}
	>
		{#snippet label(i: number)}
			<p class="caption">{caption(i)}</p>
		{/snippet}
	</StepControls>

	<div class="workspace">
		<div class="lists">
			<!-- A wide list scrolls in its box. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="table-box"
				role="region"
				aria-label="Reductions and derivation, scrolls"
				tabindex="0"
			>
				<table class="forms">
					<caption class="visually-hidden"
						>The reductions, from the input to the start symbol, beside the rightmost derivation
						read top-down</caption
					>
					<thead>
						<tr>
							<td class="arrow-col"></td>
							<th scope="col">Reductions</th>
							<th scope="col">Rightmost derivation</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row, i (i)}
							{@const twin = n - i}
							<tr>
								{#if i === 0}
									<td class="arrow-col" rowspan={rows.length}>
										{#if complete}<span class="up" aria-hidden="true"></span>{/if}
									</td>
								{/if}
								<td class={['form', { last: i === s - 1 }]}>
									{#if i <= s}
										{#if i === s - 1}{@render form(row.marked, true)}{:else}{row.plain.text}{/if}
									{/if}
								</td>
								<td class="form derived">
									{#if twin <= s && derivation[i]}
										{#if i > 0}<span class="arrow" aria-hidden="true">→</span>{/if}{@render made(
											derivation[i]
										)}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if complete}
				<p class="reverse">A <em>reverse rightmost</em> derivation</p>
			{/if}
			<p class="note">
				The derivation is the list of reductions read upward. Tinted: what each of its steps puts
				in, the handle of that form among the reductions.
			</p>
		</div>

		<div class="tree-box">
			{#if forest}
				<ParseTreeView
					{forest}
					minRows={treeRows}
					labelSize={17}
					ariaLabel="Parse forest after {s} {s === 1 ? 'reduction' : 'reductions'}"
				/>
			{:else if !drawn}
				<p class="note">
					The forest is drawn for token strings of up to {maxTreeTokens} tokens; this one has
					{tokens}.
				</p>
			{/if}
		</div>
	</div>

	<section class="finder" aria-label="Find the handle">
		<Toggle
			bind:checked={finding}
			label="Find the handle"
			description="pick the handle of the last form listed and check it against the definition"
		/>
		{#if finding}
			{#if complete}
				<p class="note">The form is the start symbol: there is no handle left.</p>
			{:else if canFind && current}
				<p class="definition">
					β is a handle of <span class="mono">{rows[s].plain.text}</span> when A → β and S →<sup
						>*</sup
					>
					α A γ → α β γ = <span class="mono">{rows[s].plain.text}</span>.
				</p>
				<FindHandle grammar={g} step={current} onreduce={() => stepper.next()} />
			{:else}
				<p class="note">This form is too long to pick from.</p>
			{/if}
		{/if}
	</section>
</div>

<style>
	.handles-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.caption {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.workspace {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		}
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.table-box {
		max-height: min(34rem, 70vh);
		overflow: auto;
		overscroll-behavior: contain;
		border-radius: var(--radius-sm);
		scrollbar-width: thin;
	}
	.table-box:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.forms {
		border-collapse: collapse;
		font-size: 1.05rem;
	}
	th {
		padding: 0 var(--space-4) var(--space-2) 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	/* Rows keep their height while their forms are still blank. */
	td.form {
		height: 2em;
		padding: 3px var(--space-5) 3px 0;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		white-space: pre;
		vertical-align: baseline;
	}
	td.form:not(.derived) {
		color: var(--tok-0);
	}
	.arrow-col {
		position: relative;
		width: 22px;
		padding: 0;
	}
	.up {
		position: absolute;
		top: 12px;
		bottom: 6px;
		left: 9px;
		width: 2px;
		background: var(--text);
	}
	.up::before {
		position: absolute;
		top: -10px;
		left: -5px;
		border: 6px solid transparent;
		border-top: 0;
		border-bottom: 10px solid var(--text);
		content: '';
	}
	.handle {
		color: var(--reject);
		font-weight: 600;
	}
	.handle.empty,
	.made.empty {
		display: inline-block;
		margin: 0 0.15em 0 0.35em;
		font-size: 0.8em;
		transform: translateY(-0.35em);
	}
	.made {
		border-radius: 3px;
		background: var(--accent-soft);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}
	.arrow {
		margin-right: 0.45em;
		color: var(--text-3);
	}
	.reverse {
		margin: var(--space-1) 0 0;
		font-family: var(--font-serif);
		font-size: 1.125rem;
	}
	.reverse em {
		color: var(--reject);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.tree-box {
		min-width: 0;
	}
	.finder {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
		min-width: 0;
	}
	.definition {
		margin: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
</style>
