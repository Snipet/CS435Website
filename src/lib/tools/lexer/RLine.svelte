<!--
	R = R1 | R2 | … | Rn (Lexical Analysis II, slide 5): each rule as it
	appears in R, with its index underneath. The Error rule comes last.
-->
<script lang="ts">
	import { toneStyle } from '$lib/components/ui/tones';
	import type { RuleInfo } from './spec';

	interface Props {
		rules: readonly RuleInfo[];
		errorRule: boolean;
	}

	let { rules, errorRule }: Props = $props();

	const items = $derived([
		...rules.map((r) => ({
			label: r.label,
			tone: r.drop ? ('muted' as const) : r.index,
			drop: r.drop,
			problem: r.problem !== null
		})),
		...(errorRule ? [{ label: 'Error', tone: 'reject' as const, drop: false, problem: false }] : [])
	]);
	const spoken = $derived(
		`R = ${items.map((it, j) => `${it.label} (R${j + 1}${it.drop ? ', dropped' : ''})`).join(' | ')}`
	);
</script>

<p class="rline">
	<span class="visually-hidden">{spoken}</span>
	<span class="lhs" aria-hidden="true">R</span>
	<span class="eq" aria-hidden="true">=</span>
	{#if items.length === 0}
		<span class="alt" aria-hidden="true"><span class="lab">ɸ</span></span>
	{/if}
	{#each items as item, j (j)}
		{#if j > 0}<span class="bar" aria-hidden="true">|</span>{/if}
		<span
			class={['alt', { drop: item.drop, problem: item.problem }]}
			style={toneStyle(item.tone)}
			aria-hidden="true"
		>
			<span class="lab">{item.label}</span>
			<span class="idx">R<sub>{j + 1}</sub></span>
		</span>
	{/each}
</p>

<style>
	.rline {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-1) 0.55em;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		line-height: 1.4;
	}
	.lhs,
	.eq,
	.bar {
		color: var(--text-2);
	}
	.lhs {
		font-family: var(--font-serif);
		font-size: 1.05em;
		font-style: italic;
		font-weight: 600;
		color: var(--text);
	}
	.alt {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
	}
	.lab {
		padding: 0 3px;
		border-bottom: 2px solid var(--tone-fg);
		color: var(--text);
		white-space: pre;
	}
	.drop .lab {
		color: var(--text-2);
		border-bottom-style: dashed;
	}
	.problem .lab {
		text-decoration: line-through;
		text-decoration-color: var(--reject);
	}
	.idx {
		margin-top: 2px;
		color: var(--text-3);
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-style: italic;
	}
	.idx sub {
		font-size: 0.8em;
		font-style: normal;
	}
</style>
