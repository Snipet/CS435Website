<!--
@component
"Sizes" tab: rows × columns = cells of T for the DFA built from the current
rules and for the DFAs on the slides, as built and minimized.
-->
<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import SlideQuestions from './SlideQuestions.svelte';
	import { relopDfa, stuDfa } from './machines';
	import type { NamedSet } from '$lib/theory/chars';
	import type { RuleDfas } from './rules';
	import { ASCII_COLUMNS, sizesOf, tableSize, type TableSize } from './sizes';
	import type { ScannerDfaState } from './state';
	import type { SlideQuestion } from './presets';

	interface Props {
		model: ScannerDfaState;
		/** The DFA of the rules (null while the rules have errors). */
		built: RuleDfas | null;
		/** Definitions that name character sets (column headers). */
		names: readonly NamedSet[];
	}

	let { model, built, names }: Props = $props();

	interface Row {
		label: string;
		note?: string;
		size: TableSize;
		sub?: boolean;
	}
	interface Group {
		title: string;
		rows: Row[];
	}

	const RELOP = sizesOf(relopDfa());
	const STU = sizesOf(stuDfa());

	const ruleNames = $derived(
		model.rules
			.map((r) => r.name.trim())
			.filter(Boolean)
			.join(' | ')
	);

	const groups = $derived.by((): Group[] => {
		const out: Group[] = [];
		if (built?.ok) {
			const rows: Row[] = [
				{ label: 'As built (subset construction)', size: tableSize(built.full, names) }
			];
			if (built.minimal)
				rows.push({ label: 'Minimized', size: tableSize(built.minimal, names), sub: true });
			out.push({ title: `DFA from the rules: R = ${ruleNames}`, rows });
		}
		out.push(
			{
				title: 'relop (slide 16)',
				rows: [
					{ label: 'As drawn', size: RELOP.built },
					{ label: 'Minimized', size: RELOP.minimal, sub: true }
				]
			},
			{
				title: 'S, T, U (slide 14)',
				rows: [
					{ label: 'As drawn', size: STU.built },
					{ label: 'Minimized', size: STU.minimal, sub: true }
				]
			}
		);
		return out;
	});

	const fmt = (n: number) => n.toLocaleString('en-US');

	const QUESTIONS: SlideQuestion[] = [
		{
			question: 'A DFA can be implemented by a transition table T. What should be the dimensions?',
			answer:
				'One row per state and one column per input symbol (states × symbols): for every transition si →a sk, T[i, a] = k.',
			cite: { deck: '08', slide: 13 }
		},
		{
			question: 'Hand code [dis]advantages?',
			answer:
				'Very efficient but tedious. Table driven: NFA → DFA conversion is at the heart of tools such as flex or JFlex, but DFAs can be huge.',
			cite: { deck: '08', slide: 20 }
		}
	];
</script>

<div class="tab">
	<Panel title="Table sizes" subtitle="rows × columns = cells of T">
		<div class="body">
			{#if !built?.ok}
				<Callout tone="info">
					{#if built && !built.ok}
						The DFA for the current rules is too large to build here.
					{:else}
						Fix the rules on the Table-driven tab to include their DFA.
					{/if}
				</Callout>
			{/if}
			<div class="wrap">
				<table class="sizes">
					<caption class="visually-hidden">Transition table sizes</caption>
					<thead>
						<tr>
							<th scope="col">DFA</th>
							<th scope="col" class="num">States</th>
							<th scope="col" class="num">Symbol classes</th>
							<th scope="col" class="num">Cells of T</th>
							<th scope="col" class="num">One column per ASCII character</th>
						</tr>
					</thead>
					{#each groups as g (g.title)}
						<tbody>
							<tr class="group">
								<th scope="colgroup" colspan="5">{g.title}</th>
							</tr>
							{#each g.rows as r (r.label)}
								<tr class={{ sub: r.sub }}>
									<th scope="row">{r.label}</th>
									<td class="num">{fmt(r.size.states)}</td>
									<td class="num">
										{fmt(r.size.classes)}
										{#if r.size.labelClasses > r.size.classes}
											<span class="merged">merged from {fmt(r.size.labelClasses)}</span>
										{/if}
									</td>
									<td class="num strong"
										>{fmt(r.size.states)} × {fmt(r.size.classes)} = {fmt(r.size.cells)}</td
									>
									<td class="num">{fmt(r.size.asciiCells)}</td>
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
			</div>
			<p class="legend">
				Symbol classes are the columns of T on the Table-driven tab: sets of characters that every
				state treats alike (relop's <em>other</em> is every character without an edge of its own).
				Label classes on which every state has the same next state share one column;
				<em>merged from</em> gives the number of label classes before that. The last column counts a
				table indexed by the character itself (T: 2D int array [state, char], slide 15) over the {ASCII_COLUMNS}
				ASCII characters. Minimizing keeps accepting states with different tokens apart.
			</p>
			<SlideQuestions questions={QUESTIONS} />
		</div>
	</Panel>
</div>

<style>
	.tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.sizes {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.sizes th,
	.sizes td {
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	.sizes thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: normal;
		vertical-align: bottom;
	}
	.sizes .num {
		text-align: right;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.sizes thead .num {
		font-family: var(--font-sans);
	}
	.sizes .strong {
		font-weight: 600;
	}
	.sizes .merged {
		display: block;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
	.sizes tr.group th {
		padding-top: 14px;
		padding-bottom: 6px;
		border-bottom: 0;
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-weight: 600;
		white-space: normal;
	}
	.sizes tbody th[scope='row'] {
		font-weight: 500;
	}
	.sizes tr.sub th[scope='row'] {
		color: var(--text-2);
	}
	.sizes tbody:last-child tr:last-child > * {
		border-bottom: 0;
	}
	.legend {
		margin: 0;
		max-width: var(--content-width);
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.6;
	}
</style>
