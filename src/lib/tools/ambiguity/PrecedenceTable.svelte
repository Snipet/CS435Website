<!-- The C operator precedence table of slide 9: 15 levels, level 1 binding tightest. -->
<script lang="ts">
	import { CitationTag } from '$lib/components/ui';
	import { C_PRECEDENCE, C_PRECEDENCE_CITE } from './c-precedence';
</script>

<div class="reference">
	<p class="intro">
		C has 15 precedence levels; level 1 binds tightest. The C expression grammar is a precedence
		cascade with a non-terminal for each level.
		<CitationTag cite={C_PRECEDENCE_CITE} />
	</p>
	<div class="scroll">
		<table>
			<caption class="visually-hidden">C operator precedence</caption>
			<thead>
				<tr>
					<th scope="col" class="level">Precedence</th>
					<th scope="col">Operator</th>
					<th scope="col">Description</th>
					<th scope="col">Associativity</th>
				</tr>
			</thead>
			{#each C_PRECEDENCE as level (level.level)}
				<tbody>
					{#each level.rows as row, i (i)}
						<tr>
							{#if i === 0}
								<th scope="rowgroup" rowspan={level.rows.length} class="level">{level.level}</th>
							{/if}
							<td class="ops">{row.operators}</td>
							<td>{row.description}</td>
							{#if i === 0}
								<td rowspan={level.rows.length} class="assoc">{level.associativity}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
</div>

<style>
	.reference {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.intro {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.scroll {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	table {
		width: 100%;
		min-width: 30rem;
		font-size: var(--text-sm);
	}
	th,
	td {
		padding: 3px 12px;
		text-align: left;
		vertical-align: top;
	}
	thead th {
		padding-top: 7px;
		padding-bottom: 7px;
		border-bottom: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	tbody + tbody tr:first-child > * {
		border-top: 1px solid var(--border);
	}
	tbody tr:first-child > * {
		padding-top: 6px;
	}
	tbody tr:last-child > *,
	tbody th[rowspan],
	tbody td[rowspan] {
		padding-bottom: 6px;
	}
	.level {
		width: 1%;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	tbody .level {
		font-weight: 600;
	}
	.ops {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.assoc {
		color: var(--text-2);
		white-space: nowrap;
	}
</style>
