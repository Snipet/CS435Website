<!--
	The prediction table: for every place where the parser chooses (the
	alternatives of a rule, an option, a repetition), the lookahead tokens that
	select it. Tokens that take part in a conflict are marked.
-->
<script lang="ts">
	import { printSet } from '$lib/theory/grammar';
	import type { ChoiceKind, PredictionRow } from './predict';

	interface Props {
		rows: readonly PredictionRow[];
	}

	let { rows }: Props = $props();

	const KIND: Record<ChoiceKind, string> = {
		alternative: 'alternative',
		option: 'optional',
		repetition: 'repeated'
	};

	/** The rows of one rule, so that the rule is written once. `base`: the least depth among them. */
	const groups = $derived.by(() => {
		const out: { rule: string; text: string; base: number; rows: PredictionRow[] }[] = [];
		for (const row of rows) {
			const last = out[out.length - 1];
			if (last && last.rule === row.rule) {
				last.rows.push(row);
				last.base = Math.min(last.base, row.depth);
			} else {
				out.push({ rule: row.rule, text: row.ruleText ?? row.rule, base: row.depth, rows: [row] });
			}
		}
		return out;
	});

	/** One token as it is written inside a set. */
	const member = (token: string) => printSet([token]).slice(2, -2);

	// A table that scrolls sideways takes keyboard focus, so it can be scrolled without a mouse.
	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);
	$effect(() => {
		const el = box;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const check = () => (scrolls = el.scrollWidth > el.clientWidth + 1);
		const observer = new ResizeObserver(check);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		check();
		return () => observer.disconnect();
	});
</script>

{#if rows.length === 0}
	<p class="none">
		No rule has alternatives, an option or a repetition: the parser never has to choose.
	</p>
{:else}
	<!--
		In a narrow panel the rule is a heading row above its choices instead of a
		column; a table that is still too wide scrolls inside its own box.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="scroll"
		bind:this={box}
		role="group"
		aria-label={scrolls ? 'Prediction table, scrolls sideways' : 'Prediction table'}
		tabindex={scrolls ? 0 : undefined}
	>
		<table>
			<thead>
				<tr>
					<th scope="col" class="wide">Rule</th>
					<th scope="col">Choice</th>
					<th scope="col">Lookahead tokens</th>
				</tr>
			</thead>
			{#each groups as group (group.rule)}
				<tbody>
					<tr class="heading narrow">
						<th scope="rowgroup" colspan="2" class="rule">{group.text}</th>
					</tr>
					{#each group.rows as row, i (i)}
						<tr class={{ first: i === 0, conflict: row.conflict }}>
							{#if i === 0}
								<th scope="rowgroup" rowspan={group.rows.length} class="rule wide">{group.text}</th>
							{/if}
							<td class="choice">
								<span class="text" style:padding-left="{(row.depth - group.base) * 0.9}rem"
									>{row.choice}</span
								>
								<span class="kind">{KIND[row.kind]}</span>
							</td>
							<td class="tokens">
								<span class="set"
									>{'{ '}{#each row.tokens as token, k (token)}{k > 0
											? ', '
											: ''}{#if row.clashing.includes(token)}<mark>{member(token)}</mark
											>{:else}{member(token)}{/if}{/each}{row.tokens.length > 0 ? ' }' : '}'}</span
								>
								{#if row.otherwise}<span class="otherwise">{row.otherwise}</span>{/if}
								{#if row.conflict}<span class="visually-hidden">(conflict)</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
{/if}

<style>
	.none {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.scroll {
		container-type: inline-size;
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		scrollbar-width: thin;
	}
	.scroll:focus-visible {
		outline-offset: 1px;
	}
	table {
		width: 100%;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 6px 12px;
		text-align: left;
		vertical-align: top;
	}
	thead th {
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	tbody tr.first > *,
	tbody tr.heading > * {
		border-top: 1px solid var(--border);
	}
	tbody:first-of-type tr.first > *,
	tbody:first-of-type tr.heading > * {
		border-top: 0;
	}
	.rule,
	.choice .text,
	.set {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.rule {
		font-weight: 500;
		border-right: 1px solid var(--border);
	}
	.choice .text {
		display: inline-block;
		font-weight: 600;
	}
	.kind {
		margin-left: 6px;
		color: var(--text-3);
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.set {
		white-space: nowrap;
	}
	.otherwise {
		display: block;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	mark {
		padding: 0 3px;
		border-radius: 3px;
		background: var(--reject-soft);
		box-shadow: inset 0 -2px 0 var(--reject);
		color: inherit;
		font-weight: 650;
	}
	tr.conflict td {
		background: color-mix(in srgb, var(--reject-soft) 45%, transparent);
	}
	.narrow {
		display: none;
	}
	@container (max-width: 30rem) {
		.wide {
			display: none;
		}
		.narrow {
			display: table-row;
		}
		.heading .rule {
			border-right: 0;
			background: color-mix(in srgb, var(--surface-2) 60%, transparent);
		}
		tbody tr.first > * {
			border-top: 0;
		}
		thead th {
			white-space: normal;
		}
	}
</style>
