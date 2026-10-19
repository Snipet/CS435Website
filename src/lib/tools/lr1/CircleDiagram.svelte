<!--
	The parsing DFA as numbered circles (Bottom-up Parsing II, slide 17): an
	unlabeled start arrow into state 0, edges labeled with one grammar symbol,
	each state's reduce and accept labels beside it. The circles are placed in
	rows (placeCircles) as many to a row as the width allows, and drawn by
	AutomatonView; the whole range is placed once, so states keep their places
	while the construction adds them.
-->
<script lang="ts">
	import type { StateAnnotation } from '$lib/components/grammar';
	import { AutomatonView, type GraphSelection } from '$lib/components/graph';
	import type { LrAutomaton } from '$lib/theory/grammar/lr';
	import { circleColumns, circleDrawing, placeCircles, type StateRange } from './diagram';
	import type { DfaSelection } from './selection';

	interface Props {
		automaton: LrAutomaton;
		notes: readonly StateAnnotation[][];
		range: StateRange;
		made: { states: number; edges: number };
		selected: DfaSelection;
		onselect: (selection: DfaSelection) => void;
		current?: number | null;
		followed?: number | null;
		step?: { from: number | null; edge: number | null; made: number | null } | null;
		ariaLabel?: string;
	}

	let {
		automaton,
		notes,
		range,
		made,
		selected,
		onselect,
		current = null,
		followed = null,
		step = null,
		ariaLabel = 'Parsing DFA'
	}: Props = $props();

	/** The width the drawing has, so a row holds as many circles as fit at their natural size. */
	let width = $state(0);
	const full = $derived(circleDrawing(automaton, notes, range));
	const columns = $derived(circleColumns(full.automaton, width - 2 * 40));
	const placement = $derived(placeCircles(full.automaton, columns));
	const positions = $derived(placement.positions);
	const shown = $derived(circleDrawing(automaton, notes, range, made));
	const idOf = $derived(new Map(shown.states.map((s, k) => [s, k])));
	const transitionOf = $derived(new Map(shown.edges.map((e, t) => [e, t])));
	/** The whole range's extent (the start arrow and labels around it included), so it keeps its scale while states are added. */
	const extent = $derived({
		x: -60,
		y: -40,
		width: placement.width + 100,
		height: placement.height + 80
	});
	const viewKey = $derived(
		`${automaton.kind}:${automaton.states.length}:${range[0]}-${range[1]}:${columns}`
	);

	const graphSelected = $derived.by((): GraphSelection => {
		if (selected?.kind === 'state') {
			const id = idOf.get(selected.state);
			return id === undefined ? null : { kind: 'state', id };
		}
		return null;
	});

	const highlight = $derived.by(() => {
		const active: number[] = [];
		const taken: number[] = [];
		const tone: Record<number, 'accept' | 'info'> = {};
		const at = (s: number | null | undefined) =>
			s === null || s === undefined ? undefined : idOf.get(s);
		const c = at(current);
		if (c !== undefined) active.push(c);
		const madeNow = at(step?.made);
		if (madeNow !== undefined) tone[madeNow] = 'accept';
		const working = at(step?.from);
		if (working !== undefined && working !== madeNow && working !== c) tone[working] = 'info';
		for (const e of [followed, step?.edge, selected?.kind === 'edge' ? selected.edge : null]) {
			const t = e === null || e === undefined ? undefined : transitionOf.get(e);
			if (t !== undefined) taken.push(t);
		}
		return { active, taken, tone };
	});
</script>

<div class="circles" bind:clientWidth={width}>
	<AutomatonView
		automaton={shown.automaton}
		{positions}
		{extent}
		{viewKey}
		{highlight}
		selected={graphSelected}
		selectionActions={false}
		height="auto"
		{ariaLabel}
		onstateclick={(id) => onselect({ kind: 'state', state: shown.states[id] })}
		ontransitionclick={(ids) => {
			const k = shown.edges[ids[0]];
			if (k !== undefined) onselect({ kind: 'edge', edge: k });
		}}
	/>
</div>

<style>
	.circles {
		min-width: 0;
	}
</style>
