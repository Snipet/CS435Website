<!--
@component
The formal definition of the machine: M = (Σ, S, s0, F, T) for a DFA
(Lexical Analysis III, slide 3), or Q and Δ for an NFA (slide 12).
-->
<script lang="ts">
	import type { Definition } from './definition';

	interface Props {
		def: Definition;
		/** The trap state is drawn (and part of the definition shown). */
		trapShown: boolean;
	}

	let { def, trapShown }: Props = $props();

	const LIMIT = 300;
	const set = (xs: readonly string[]) => (xs.length ? `{ ${xs.join(', ')} }` : '{ }');
	const moves = $derived(def.moves.slice(0, LIMIT));
	const deltas = $derived(def.deltas.slice(0, LIMIT));
	const hidden = $derived(
		Math.max(0, (def.kind === 'dfa' ? def.moves : def.deltas).length - LIMIT)
	);
</script>

<div class="definition">
	{#if def.kind === 'dfa'}
		<p class="tuple" aria-label="M equals the tuple Sigma, S, s zero, F, T">
			<var>M</var> = (<var>Σ</var>, <var>S</var>, <var>s</var><sub>0</sub>, <var>F</var>,
			<var>T</var>)
		</p>
	{/if}
	<dl class="parts">
		<div class="part">
			<dt><var>Σ</var></dt>
			<dd><span class="eq">=</span> <span class="f">{def.sigma}</span></dd>
			<dd class="gloss">input alphabet</dd>
		</div>
		<div class="part">
			<dt><var>{def.kind === 'dfa' ? 'S' : 'Q'}</var></dt>
			<dd><span class="eq">=</span> <span class="f">{set(def.states)}</span></dd>
			<dd class="gloss">states</dd>
		</div>
		<div class="part">
			<dt><var>{def.kind === 'dfa' ? 's' : 'q'}</var><sub>0</sub></dt>
			<dd><span class="eq">=</span> <span class="f">{def.start || '—'}</span></dd>
			<dd class="gloss">start state</dd>
		</div>
		<div class="part">
			<dt><var>F</var></dt>
			<dd><span class="eq">=</span> <span class="f">{set(def.finals)}</span></dd>
			<dd class="gloss">accepting states</dd>
		</div>
	</dl>

	{#if def.kind === 'dfa'}
		<p class="fn">
			<span class="formula"><var>T</var> : <var>S</var> × <var>Σ</var> → <var>S</var></span>
			<span class="gloss">transition function</span>
		</p>
		{#if moves.length}
			<ul class="lines moves" aria-label="Transitions">
				{#each moves as m, i (i)}
					<li class="f">
						<span class="name">{m.from}</span><span class="arrow">→<sup>{m.symbol}</sup></span><span
							class="name">{m.to}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="note">No transitions yet.</p>
		{/if}
		{#if def.missing.length && !trapShown}
			<p class="note">
				<var>T</var> is partial. No transition for
				{#each def.missing as m, i (i)}{i > 0 ? '; ' : ''}<span class="f">{m.state}</span> on
					<span class={{ f: !m.symbols.startsWith('every') }}>{m.symbols}</span>{/each}. These go to
				the trap state.
			</p>
		{/if}
	{:else}
		<p class="fn">
			<span class="formula"
				><var>Δ</var> : <var>Q</var> × (<var>Σ</var> ∪ &#123; ε &#125;) → <var>P</var>(<var>Q</var
				>)</span
			>
			<span class="gloss">transition function</span>
		</p>
		<ul class="lines deltas" aria-label="Transition function values">
			{#each deltas as d, i (i)}
				<li>
					<var>Δ</var>(<span class="f name">{d.state}</span>,
					<span class={['f', { eps: d.symbol === 'ε' }]}>{d.symbol}</span>) =
					<span class="f">{set(d.targets)}</span>
				</li>
			{/each}
		</ul>
		<p class="note">
			<var>Δ</var>(<var>q</var>, <var>a</var>) = &#123; &#125; for every pair not listed.
		</p>
	{/if}
	{#if hidden > 0}
		<p class="note">{hidden} more not shown.</p>
	{/if}
</div>

<style>
	.definition {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		font-size: var(--text-base);
	}
	var {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.08em;
	}
	sub {
		font-family: var(--font-serif);
		font-size: 0.7em;
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.9em;
		font-variant-ligatures: none;
	}
	.tuple {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-serif);
		font-size: 1.15rem;
		text-align: center;
	}
	.parts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}
	.part {
		display: contents;
	}
	dt {
		font-family: var(--font-serif);
		text-align: right;
	}
	dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.eq {
		margin-right: 0.2em;
		font-family: var(--font-serif);
	}
	.gloss {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-style: normal;
		align-self: center;
	}
	.fn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		margin: var(--space-1) 0 0;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		font-family: var(--font-serif);
	}
	.fn .gloss {
		margin-left: auto;
	}
	.lines {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.lines.deltas {
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
	}
	.lines li {
		white-space: nowrap;
	}
	.moves li {
		font-size: 0.95rem;
	}
	.name {
		font-weight: 600;
	}
	.arrow {
		margin: 0 0.3em;
		color: var(--text-2);
	}
	.arrow sup {
		margin-left: 1px;
		font-family: var(--font-mono);
		font-size: 0.75em;
	}
	.eps {
		color: var(--epsilon);
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	@media (max-width: 480px) {
		.parts {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.parts .gloss {
			display: none;
		}
	}
</style>
