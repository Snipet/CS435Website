<script lang="ts">
	const groups: { cls: string; form: string; rows: [string, string][] }[] = [
		{
			cls: 'RR',
			form: 'N: OP r,s,t',
			rows: [
				['HALT', 'stop; prints "HALT: r,s,t"'],
				['IN', 'reg[r] = the next input value'],
				['OUT', 'print reg[r]'],
				['ADD', 'reg[r] = reg[s] + reg[t]'],
				['SUB', 'reg[r] = reg[s] - reg[t]'],
				['MUL', 'reg[r] = reg[s] * reg[t]'],
				['DIV', 'reg[r] = reg[s] / reg[t] (srZERODIVIDE when reg[t] = 0)']
			]
		},
		{
			cls: 'RM',
			form: 'N: OP r,d(s)  with m = d + reg[s]',
			rows: [
				['LD', 'reg[r] = dMem[m]'],
				['ST', 'dMem[m] = reg[r]']
			]
		},
		{
			cls: 'RA',
			form: 'N: OP r,d(s)  with m = d + reg[s]',
			rows: [
				['LDA', 'reg[r] = m'],
				['LDC', 'reg[r] = d'],
				['JLT', 'if reg[r] < 0, reg[7] = m'],
				['JLE', 'if reg[r] ≤ 0, reg[7] = m'],
				['JGT', 'if reg[r] > 0, reg[7] = m'],
				['JGE', 'if reg[r] ≥ 0, reg[7] = m'],
				['JEQ', 'if reg[r] = 0, reg[7] = m'],
				['JNE', 'if reg[r] ≠ 0, reg[7] = m']
			]
		}
	];
</script>

<div class="isa">
	<p class="lead">
		One instruction per line: an iMem address, a colon, the opcode and its operands. A line starting
		with <code>*</code> is a comment, and so is text after the operands. <code>r,d,s</code> is read
		as
		<code>r,d(s)</code>, and a bare <code>HALT</code> as <code>HALT 0,0,0</code>. reg[7] is the PC;
		it already holds the next address when an instruction runs, so <code>d(7)</code> is relative to the
		next instruction.
	</p>
	<div class="table-wrap">
		<table>
			<caption class="visually-hidden">TM instruction set</caption>
			<thead>
				<tr>
					<th scope="col">Opcode</th>
					<th scope="col">Effect</th>
				</tr>
			</thead>
			{#each groups as g (g.cls)}
				<tbody>
					<tr class="group">
						<th scope="rowgroup" colspan="2">
							<span class="cls">{g.cls}</span>
							<code class="form">{g.form}</code>
						</th>
					</tr>
					{#each g.rows as [op, effect] (op)}
						<tr>
							<td class="op">{op}</td>
							<td class="effect">{effect}</td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>
</div>

<style>
	.isa {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-1);
	}
	.lead {
		margin: 0;
		max-width: var(--content-width);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		font-size: var(--text-sm);
	}
	thead th {
		padding: 4px 10px;
		border-bottom: 1px solid var(--border-strong);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-align: left;
		text-transform: uppercase;
	}
	td {
		padding: 3px 10px;
		border-bottom: 1px solid var(--border);
		vertical-align: baseline;
	}
	.group th {
		padding: var(--space-3) 10px 4px;
		border-bottom: 1px solid var(--border);
		font-weight: 400;
		text-align: left;
	}
	.cls {
		margin-right: var(--space-2);
		font-weight: 600;
	}
	.form {
		color: var(--text-2);
		white-space: pre;
	}
	.op {
		width: 4.5rem;
		color: var(--syn-keyword);
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.effect {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
	}
</style>
