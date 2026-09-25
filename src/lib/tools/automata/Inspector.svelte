<!--
@component
Details of the state or transition selected in the diagram, with fields to
rename a state, make it accepting or the start state, relabel a transition,
or delete either.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { edgeSymbols, edgeTransitions } from '$lib/components/graph/edit';
	import { labelText } from '$lib/components/graph/label-text';
	import type { GraphSelection } from '$lib/components/graph/types';
	import { formatLabel } from '$lib/theory/chars';
	import type { Automaton, StateId } from '$lib/theory/automata/types';
	import { stateName } from './model';

	interface Props {
		/** The drawn machine (it may include the trap state). */
		automaton: Automaton;
		selected: GraphSelection;
		/** Each returns an error message, or null when the change was made. */
		onrename: (id: StateId, name: string) => string | null;
		onlabel: (key: string, text: string) => string | null;
		onaccepting: (id: StateId, accepting: boolean) => void;
		onstart: (id: StateId) => void;
		ondeletestate: (id: StateId) => void;
		ondeleteedge: (key: string) => void;
	}

	let {
		automaton,
		selected,
		onrename,
		onlabel,
		onaccepting,
		onstart,
		ondeletestate,
		ondeleteedge
	}: Props = $props();

	const sel = $derived(selected?.kind === 'state' ? (automaton.states[selected.id] ?? null) : null);
	const edge = $derived.by(() => {
		if (selected?.kind !== 'edge') return null;
		const ts = edgeTransitions(automaton, selected.key);
		if (ts.length === 0) return null;
		const t = ts[0];
		const display = ts.find((x) => x.display)?.display;
		const symbols = edgeSymbols(ts);
		return {
			key: selected.key,
			from: t.from,
			to: t.to,
			trap: !!(automaton.states[t.from]?.trap || automaton.states[t.to]?.trap),
			display,
			text: labelText(symbols),
			shown: symbols === null ? 'ε' : formatLabel(symbols)
		};
	});

	let nameDraft = $derived(sel?.name ?? '');
	let labelDraft = $derived(edge?.text ?? '');
	let error = $state<{ key: string; message: string } | null>(null);
	const selKey = $derived(
		selected ? (selected.kind === 'state' ? `s${selected.id}` : `e${selected.key}`) : ''
	);
	const shownError = $derived(error && error.key === selKey ? error.message : undefined);

	function commitName() {
		if (!sel || nameDraft === sel.name) return;
		const message = onrename(sel.id, nameDraft.trim());
		error = message ? { key: selKey, message } : null;
	}

	function commitLabel() {
		if (!edge || labelDraft === edge.text) return;
		const message = onlabel(edge.key, labelDraft);
		error = message ? { key: selKey, message } : null;
	}

	function keys(commit: () => void, reset: () => void) {
		return (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				reset();
				error = null;
			}
		};
	}
</script>

<div class="inspector">
	{#if sel?.trap}
		<p class="title">Trap state</p>
		<p class="hint">
			Missing transitions lead here, and it never accepts. It is drawn for reference and is not part
			of the machine.
		</p>
	{:else if sel}
		<p class="title">State <span class="f">{stateName(automaton, sel.id)}</span></p>
		<div class="fields">
			<div class="name">
				<TextField
					label="Name"
					size="sm"
					mono
					inline
					bind:value={nameDraft}
					error={shownError}
					onblur={commitName}
					onkeydown={keys(commitName, () => (nameDraft = sel.name))}
				/>
			</div>
			<Toggle
				label="Accepting"
				checked={sel.accepting}
				onchange={(on) => onaccepting(sel.id, on)}
			/>
			<Button
				size="sm"
				variant="secondary"
				disabled={automaton.start === sel.id}
				onclick={() => onstart(sel.id)}
				>{automaton.start === sel.id ? 'Start state' : 'Make start state'}</Button
			>
			<Button size="sm" variant="ghost" class="danger" onclick={() => ondeletestate(sel.id)}
				>Delete state</Button
			>
		</div>
		{#if sel.note || sel.retract}
			<p class="hint">
				{#if sel.note}Note: <span class="f">{sel.note}</span>.{/if}
				{#if sel.retract}Marked * (pushes back one character).{/if}
			</p>
		{/if}
	{:else if edge?.trap}
		<p class="title">
			Transition <span class="f">{stateName(automaton, edge.from)}</span> →
			<span class="f">{stateName(automaton, edge.to)}</span>
		</p>
		<p class="hint">
			A missing transition, drawn into the trap state on <span class="f">{edge.shown}</span>.
		</p>
	{:else if edge}
		<p class="title">
			Transition <span class="f">{stateName(automaton, edge.from)}</span> →
			<span class="f">{stateName(automaton, edge.to)}</span>
		</p>
		<div class="fields">
			{#if edge.display}
				<p class="hint">
					Shown as <span class="f">{edge.display}</span>: <span class="f">{edge.shown}</span>.
				</p>
			{:else}
				<div class="label">
					<TextField
						label="Symbols"
						size="sm"
						mono
						inline
						bind:value={labelDraft}
						error={shownError}
						placeholder="0,1 or ε"
						title="Symbols separated by commas; ε for an ε-move; empty removes the transition"
						onblur={commitLabel}
						onkeydown={keys(commitLabel, () => (labelDraft = edge.text))}
					/>
				</div>
			{/if}
			<Button size="sm" variant="ghost" class="danger" onclick={() => ondeleteedge(edge.key)}
				>Delete transition</Button
			>
		</div>
	{:else}
		<p class="hint">
			{automaton.states.length}
			{automaton.states.length === 1 ? 'state' : 'states'} ·
			{automaton.transitions.length}
			{automaton.transitions.length === 1 ? 'transition' : 'transitions'}. Select a state or a
			transition to edit it.
		</p>
	{/if}
</div>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 2.5rem;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.name {
		width: 12rem;
		max-width: 100%;
	}
	.label {
		flex: 1 1 16rem;
		min-width: 0;
		max-width: 24rem;
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.fields :global(.danger) {
		color: var(--reject);
	}
</style>
