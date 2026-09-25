<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import type { MatchStep } from './runtime';
	import { scName, type FlexSpec } from './spec';

	interface Props {
		step: MatchStep;
		spec: FlexSpec;
	}

	let { step, spec }: Props = $props();

	const showSc = $derived(spec.startConditions.length > 0);
	const best = $derived(
		step.rule === null ? 0 : (step.candidates.find((c) => c.rule === step.rule)?.length ?? 0)
	);
	const condition = $derived(scName(spec, step.sc));

	function outcome(c: MatchStep['candidates'][number]): string {
		if (c.rule === step.rule) return '';
		if (c.status !== 'match') return '';
		return c.length < best ? 'shorter' : 'same length, listed later';
	}

	function reason(c: MatchStep['candidates'][number]): string {
		switch (c.status) {
			case 'inactive':
				return `not active in ${condition}`;
			case 'bol':
				return 'not at line start';
			default:
				return 'no match';
		}
	}
</script>

<div class="table-wrap">
	<table class="candidates">
		<caption class="visually-hidden">
			Rules tried at line {step.line}, column {step.col}: match length of each rule and the rule
			chosen
		</caption>
		<thead>
			<tr>
				<th scope="col">Rule</th>
				<th scope="col">Pattern</th>
				<th scope="col" class="num">Length</th>
				<th scope="col">Result</th>
			</tr>
		</thead>
		<tbody>
			{#each step.candidates as c (c.rule)}
				{@const rule = spec.rules[c.rule]}
				<tr class={{ winner: c.rule === step.rule, off: c.status !== 'match' }}>
					<th scope="row">
						<span class="num-chip" style={toneStyle(c.rule)}>{c.rule + 1}</span>
					</th>
					<td class="pattern mono">
						{#if showSc && rule.sc}<span class="sc">&lt;{rule.sc.join(',')}&gt;</span
							>{/if}{rule.patternText}
					</td>
					<td class="num">
						{#if c.status === 'match'}
							<span class="len">{c.length}</span>
							{#if c.textLength !== c.length}
								<span class="sub">yytext {c.textLength}</span>
							{/if}
						{:else}
							<span class="none">{reason(c)}</span>
						{/if}
					</td>
					<td>
						{#if c.rule === step.rule}
							<Badge tone="accept" variant="solid">chosen</Badge>
						{:else if outcome(c)}
							<span class="lost">{outcome(c)}</span>
						{/if}
					</td>
				</tr>
			{/each}
			{#if step.kind === 'default'}
				<tr class="winner default">
					<th scope="row"><span class="num-chip dflt">–</span></th>
					<td class="pattern">default rule (one character)</td>
					<td class="num"><span class="len">1</span></td>
					<td><Badge tone="accept" variant="solid">ECHO</Badge></td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.candidates {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	th,
	td {
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: middle;
	}
	thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	tbody th {
		width: 3rem;
		font-weight: 400;
	}
	.num {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.pattern {
		overflow-wrap: break-word;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.sc {
		color: var(--epsilon);
	}
	.num-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6rem;
		height: 1.35rem;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone-fg);
		font-size: var(--text-xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.num-chip.dflt {
		background: var(--surface-3);
		color: var(--text-2);
	}
	.len {
		font-weight: 600;
	}
	.sub {
		display: block;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.none,
	.lost {
		display: inline-block;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.3;
		white-space: normal;
	}
	.off .pattern {
		color: var(--text-2);
	}
	.winner {
		background: var(--accept-soft);
	}
	.default .pattern {
		font-style: italic;
		color: var(--text-2);
	}
</style>
