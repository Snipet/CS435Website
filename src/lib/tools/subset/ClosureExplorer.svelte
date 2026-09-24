<!--
@component
ε-closure tab: pick NFA states, then play the closure event by event (seed,
follow, skip) and read off the ordered result.
-->
<script lang="ts">
	import { AutomatonView, type StateTone } from '$lib/components/graph';
	import { Button, StepControls, Stepper } from '$lib/components/ui';
	import {
		epsilonClosureTrace,
		type Automaton,
		type ClosureEvent,
		type Positions,
		type StateId
	} from '$lib/theory/automata';
	import { setText, stateName } from './logic';

	interface Props {
		nfa: Automaton;
		/** Pinned NFA positions (shared with the main view). */
		positions?: Positions;
		/** Draw the NFA; otherwise states are picked from a list. */
		drawable: boolean;
		/** Picked states, in the order picked. */
		seeds: number[];
		onseedschange: (seeds: number[]) => void;
	}

	let { nfa, positions, drawable, seeds, onseedschange }: Props = $props();

	const picked = $derived(seeds.filter((id) => id < nfa.states.length));

	interface Run {
		nfa: Automaton;
		key: string;
		order: StateId[];
		events: ClosureEvent[];
	}
	let run = $state.raw<Run | null>(null);
	const trace = $derived(run && run.nfa === nfa && run.key === picked.join(',') ? run : null);

	const stepper = new Stepper(() => trace?.events.length ?? 0, { speed: 2.5 });

	function toggle(id: StateId) {
		stepper.pause();
		onseedschange(picked.includes(id) ? picked.filter((s) => s !== id) : [...picked, id]);
	}

	function start() {
		if (picked.length === 0) return;
		const t = epsilonClosureTrace(nfa, picked);
		run = { nfa, key: picked.join(','), order: t.order, events: t.events };
		stepper.first();
		stepper.play();
	}

	function clear() {
		stepper.pause();
		run = null;
		onseedschange([]);
	}

	const index = $derived(stepper.index);
	const done = $derived(trace !== null && index >= trace.events.length - 1);
	const shownEvents = $derived(trace ? trace.events.slice(0, index + 1) : []);
	const found = $derived(shownEvents.filter((e) => e.kind !== 'skip').map((e) => e.state));

	const highlight = $derived.by(() => {
		if (!trace) return { active: picked };
		const taken = shownEvents.flatMap((e) =>
			e.kind === 'follow' && e.via !== undefined ? [e.via] : []
		);
		const cur = trace.events[index];
		const tone: Record<number, StateTone> = {};
		if (cur?.kind === 'skip') {
			if (cur.via !== undefined) taken.push(cur.via);
			tone[cur.state] = 'info';
		}
		return { active: found, taken, tone };
	});

	const name = (id: StateId) => stateName(nfa, id);
	const edgeFrom = (via: number | undefined) =>
		via === undefined ? '' : name(nfa.transitions[via].from);
	const singleLetters = $derived(nfa.states.every((s) => [...s.name].length === 1));

	let figureWidth = $state(0);
	let list: HTMLOListElement | undefined = $state();
	$effect(() => {
		void index;
		const el = list?.querySelector<HTMLElement>('[aria-current="step"]');
		if (!el || !list) return;
		const b = list.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		if (r.bottom > b.bottom) list.scrollTop += r.bottom - b.bottom + 2;
		else if (r.top < b.top) list.scrollTop -= b.top - r.top + 2;
	});
</script>

{#snippet eventText(e: ClosureEvent)}
	{#if e.kind === 'seed'}
		<span class="kind seed">seed</span> <span class="f">{name(e.state)}</span>
	{:else if e.kind === 'follow'}
		<span class="kind follow">follow</span>
		<span class="f">{edgeFrom(e.via)} →<sup>ε</sup> {name(e.state)}</span>: add
		<span class="f">{name(e.state)}</span>
	{:else}
		<span class="kind skip">skip</span>
		<span class="f">{edgeFrom(e.via)} →<sup>ε</sup> {name(e.state)}</span>:
		<span class="f">{name(e.state)}</span> is already in the set
	{/if}
{/snippet}

<div class="closure">
	<div class="figure" bind:clientWidth={figureWidth}>
		{#if drawable}
			<AutomatonView
				automaton={nfa}
				{positions}
				{highlight}
				onstateclick={toggle}
				height={figureWidth > 0 && figureWidth < 600 ? 'auto' : 300}
				ariaLabel="NFA. Select states to pick the set whose ε-closure is computed."
			/>
		{:else}
			<div class="chips" role="group" aria-label="NFA states">
				{#each nfa.states as s (s.id)}
					<button
						type="button"
						class="chip f"
						aria-pressed={picked.includes(s.id)}
						onclick={() => toggle(s.id)}>{name(s.id)}</button
					>
				{/each}
			</div>
		{/if}
		<p class="hint">
			Click states to pick a set; the order you pick them is the order the seeds are listed.
		</p>
	</div>

	<div class="side">
		<div class="set-row">
			<span class="label">Set</span>
			<span class="f value">{setText(nfa, picked)}</span>
		</div>
		<div class="buttons">
			<Button variant="primary" size="sm" disabled={picked.length === 0} onclick={start}
				>ε-closure</Button
			>
			<Button variant="ghost" size="sm" disabled={picked.length === 0} onclick={clear}>Clear</Button
			>
		</div>

		{#if trace}
			<StepControls {stepper} noun="Event" ariaLabel="ε-closure events" showSpeed={false}>
				{#snippet label(i)}
					{@const e = trace?.events[i]}
					{#if e}{@render eventText(e)}.{/if}
				{/snippet}
			</StepControls>

			<ol class="events" bind:this={list} aria-label="Events so far">
				{#each shownEvents as e, i (i)}
					<li aria-current={i === index ? 'step' : undefined}>{@render eventText(e)}</li>
				{/each}
			</ol>

			<div class={['result', { done }]} aria-live="polite">
				<span class="label">{done ? 'Result' : 'So far'}</span>
				<span class="f value">
					{#if done}ε-closure({setText(nfa, picked)}) ={/if}
					{setText(nfa, found)}
				</span>
				{#if done && singleLetters}
					<span class="named">
						As a DFA state name: <span class="f">{found.map(name).join('')}</span>
					</span>
				{/if}
			</div>
		{:else}
			<p class="note">
				The closure lists the picked states first, then each state reached by ε-edges, depth first,
				following ε-edges in the order they were made.
			</p>
		{/if}
	</div>
</div>

<style>
	.closure {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: var(--space-5);
		align-items: start;
	}
	.figure {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.hint {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.set-row,
	.result {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	.label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.value {
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.buttons {
		display: flex;
		gap: var(--space-2);
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.events {
		max-height: 13rem;
		margin: 0;
		padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 2.2ch);
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: var(--text-sm);
		line-height: 1.7;
	}
	.events li::marker {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.events li[aria-current='step'] {
		background: var(--active-soft);
		border-radius: var(--radius-sm);
	}
	.kind {
		display: inline-block;
		min-width: 4.2em;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}
	.kind.follow {
		color: var(--epsilon);
	}
	.result {
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.result.done {
		border-color: color-mix(in srgb, var(--accept) 35%, transparent);
		background: var(--accept-soft);
	}
	.named {
		flex-basis: 100%;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		max-height: 16rem;
		padding: var(--space-3);
		overflow-y: auto;
	}
	.chip {
		min-width: 2.4em;
		padding: 2px 8px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		cursor: pointer;
		font-size: var(--text-sm);
	}
	.chip[aria-pressed='true'] {
		border-color: var(--active);
		background: var(--active-soft);
	}
	@media (max-width: 860px) {
		.closure {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
