<!--
@component
Pick two states of the partitioned machine and get either "equivalent" or the
shortest string that tells them apart, with the run from each state.
-->
<script lang="ts">
	import { Badge, IconButton, Select } from '$lib/components/ui';
	import type { StateId } from '$lib/theory/automata';
	import { formatString, showChar } from '$lib/theory/chars';
	import BlockChip from './BlockChip.svelte';
	import PathText from './PathText.svelte';
	import { blockTone, pairCheck, type RefinementView } from './refinement';

	interface Props {
		view: RefinementView;
		p: StateId;
		q: StateId;
		byToken: boolean;
		name: (s: StateId) => string;
		/** Name of the minimal DFA state that a final block becomes (null for a dropped trap). */
		mergedInto: (block: number) => string | null;
		onchange: (p: StateId, q: StateId) => void;
	}

	let { view, p, q, byToken, name, mergedInto, onchange }: Props = $props();

	const options = $derived(view.input.states.map((s) => ({ value: s.id, label: name(s.id) })));
	const result = $derived(pairCheck(view, p, q, byToken));
	const symbols = $derived(
		result.kind === 'distinct' ? [...result.witness].map((ch) => showChar(ch, 'label')) : []
	);
	const tokens = $derived(view.hasTokens && byToken);

	function outcome(s: StateId) {
		const st = view.input.states[s];
		return { accept: st.accepting, token: st.accepting ? st.accept?.token : undefined };
	}
</script>

<div class="pair">
	<div class="selects">
		<Select label="State p" {options} value={p} onchange={(v) => onchange(v, q)} />
		<IconButton
			label="Swap p and q"
			size="sm"
			variant="ghost"
			class="swap"
			onclick={() => onchange(q, p)}
		>
			<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="swap-icon">
				<path d="M4.5 8.5h14M15 5l3.5 3.5L15 12M19.5 15.5h-14M9 12l-3.5 3.5L9 19" />
			</svg>
		</IconButton>
		<Select label="State q" {options} value={q} onchange={(v) => onchange(p, v)} />
	</div>

	<div class="verdict" aria-live="polite">
		{#if result.kind === 'same'}
			<p class="muted">Pick two different states.</p>
		{:else if result.kind === 'equivalent'}
			<p class="headline"><Badge tone="accept">Equivalent</Badge></p>
			<p class="text">
				No string tells <span class="f">{name(p)}</span> and <span class="f">{name(q)}</span> apart.
				{#if result.block !== null}
					{@const into = mergedInto(result.block)}
					Both end up in block
					<BlockChip id={result.block} tone={blockTone(result.block)} prefix={false} />{into
						? ' and merge into '
						: '.'}{#if into}<span class="f">{into}</span>.{/if}
				{/if}
			</p>
		{:else}
			<p class="headline">
				<Badge tone="info">Distinguishable</Badge>
				<span class="text"
					>Shortest distinguishing string <span class="f w">{formatString(result.witness)}</span
					></span
				>
			</p>
			<dl class="runs">
				{#each [{ label: 'p', run: result.pRun }, { label: 'q', run: result.qRun }] as r (r.label)}
					{@const end = outcome(r.run[r.run.length - 1])}
					<div class="run">
						<dt>From <span class="f">{name(r.run[0])}</span></dt>
						<dd>
							<PathText states={r.run.map(name)} {symbols} />
							<Badge tone={end.accept ? 'accept' : 'reject'} variant="outline"
								>{end.accept ? 'accept' : 'reject'}{#if tokens && end.token}
									· {end.token}{/if}</Badge
							>
						</dd>
					</div>
				{/each}
			</dl>
		{/if}
	</div>

	<p class="hint">
		The shortest string, first in shortlex order, that one state accepts and the other rejects{tokens
			? ', or that both accept with different tokens'
			: ''}. Missing transitions go to the trap state.
	</p>
</div>

<style>
	.pair {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.selects {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: end;
		gap: var(--space-2);
	}
	.selects :global(.swap) {
		margin-bottom: 3px;
	}
	.swap-icon {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.verdict {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-height: 4.5rem;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.verdict p {
		margin: 0;
	}
	.headline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.text {
		font-size: var(--text-sm);
		line-height: 1.7;
	}
	.muted {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.w {
		padding: 1px 0.35em;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		/* Spaces stay visible; a long string wraps instead of widening the page. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.runs {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}
	.run {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr);
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	.run dt {
		color: var(--text-2);
	}
	.run dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	@media (max-width: 420px) {
		.run {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
		}
	}
</style>
