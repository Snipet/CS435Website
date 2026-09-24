<!--
	The ordered rules R1 … Rn: name, RE, drop toggle, reordering (buttons,
	drag handle, or arrow keys on the handle), and delete.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import RegexField from '$lib/components/ui/RegexField.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import type { RuleState } from '$lib/tools/links';
	import { MAX_DFA_STATES, type RuleInfo } from './spec';

	interface Props {
		rules: RuleState[];
		/** Stable keys, one per rule (not part of the saved state). */
		keys: number[];
		infos: readonly RuleInfo[];
		/** Called after a rule is removed, with the index it had. */
		onremove?: (index: number) => void;
	}

	let { rules = $bindable(), keys = $bindable(), infos, onremove }: Props = $props();

	const uid = $props.id();
	let list: HTMLOListElement | undefined = $state();

	/** The row elements in order (queried, so they match the list after any change). */
	const rowElements = (): HTMLElement[] =>
		list ? [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement) : [];

	let drag = $state<{ from: number; to: number; dy: number; startY: number } | null>(null);

	let announcement = $state('');

	function move(from: number, to: number) {
		if (from === to || to < 0 || to >= rules.length) return;
		const name = infos[from]?.name ?? rules[from].name;
		const [rule] = rules.splice(from, 1);
		rules.splice(to, 0, rule);
		const [key] = keys.splice(from, 1);
		keys.splice(to, 0, key);
		announcement = `${name} is now R${to + 1} of ${rules.length}`;
	}

	async function remove(i: number) {
		rules.splice(i, 1);
		keys.splice(i, 1);
		onremove?.(i);
		await tick();
		const next = rowElements()[Math.min(i, rules.length - 1)];
		next?.querySelector<HTMLInputElement>('input')?.focus();
	}

	/** Index the dragged row would take, from the pointer's y and the other rows' midpoints. */
	function targetIndex(y: number, from: number): number {
		let to = 0;
		rowElements().forEach((el, k) => {
			if (k === from) return;
			const r = el.getBoundingClientRect();
			if (y > r.top + r.height / 2) to++;
		});
		return to;
	}

	function onpointerdown(event: PointerEvent, i: number) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { from: i, to: i, dy: 0, startY: event.clientY };
	}

	function onpointermove(event: PointerEvent) {
		if (!drag) return;
		drag.dy = event.clientY - drag.startY;
		drag.to = targetIndex(event.clientY, drag.from);
	}

	function onpointerup() {
		if (!drag) return;
		const { from, to } = drag;
		drag = null;
		move(from, to);
	}

	function onhandlekey(event: KeyboardEvent, i: number) {
		if (event.key === 'ArrowUp' && i > 0) move(i, i - 1);
		else if (event.key === 'ArrowDown' && i < rules.length - 1) move(i, i + 1);
		else if (event.key === 'Home' && i > 0) move(i, 0);
		else if (event.key === 'End' && i < rules.length - 1) move(i, rules.length - 1);
		else return;
		event.preventDefault();
	}

	/** Row before which the drop marker is drawn (rules.length = after the last row). */
	const markerBefore = $derived(
		drag && drag.to !== drag.from ? (drag.to < drag.from ? drag.to : drag.to + 1) : null
	);
</script>

<div class="rule-list">
	<div class="heads" aria-hidden="true">
		<span class="h-name">Name</span>
		<span class="h-re">Regular expression</span>
		<span class="h-drop">Drop</span>
		<span class="h-actions"></span>
	</div>
	<ol class="rows" aria-label="Rules, earliest first" bind:this={list}>
		{#each rules as rule, i (keys[i])}
			{@const info = infos[i]}
			{@const dragging = drag?.from === i}
			<li
				class={[
					'row',
					{
						dragging,
						'marker-before': markerBefore === i,
						'marker-after': markerBefore === rules.length && i === rules.length - 1,
						dropped: rule.drop
					}
				]}
				style="{toneStyle(i)}{dragging ? ` transform: translateY(${drag?.dy ?? 0}px);` : ''}"
			>
				<button
					type="button"
					class="grip"
					aria-label="Move R{i + 1} ({info?.name ?? rule.name}): drag, or use the arrow keys"
					title="Drag to reorder (or focus and press ↑ / ↓)"
					onpointerdown={(e) => onpointerdown(e, i)}
					{onpointermove}
					{onpointerup}
					onpointercancel={() => (drag = null)}
					onkeydown={(e) => onhandlekey(e, i)}
				>
					<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
						{#each [3, 8, 13] as y (y)}
							<circle cx="2.5" cy={y} r="1.3" />
							<circle cx="7.5" cy={y} r="1.3" />
						{/each}
					</svg>
				</button>
				<span class="idx" aria-hidden="true"><span>R<sub>{i + 1}</sub></span></span>
				<div class="name">
					<TextField
						bind:value={rule.name}
						label="Name of R{i + 1}"
						hideLabel
						mono
						size="md"
						placeholder="Name"
						error={info?.nameError ?? undefined}
						id="{uid}-name-{keys[i]}"
					/>
					{#if info?.nameWarning}<p class="warn">{info.nameWarning}</p>{/if}
				</div>
				<div class="re">
					<RegexField
						bind:value={rule.re}
						ariaLabel="Regular expression of R{i + 1}"
						placeholder="RE, e.g. digit+"
						symbols={[]}
						size="md"
						diagnostics={info?.diagnostics ?? []}
					/>
					{#if info?.problem === 'too-large'}
						<p class="warn">
							Its DFA has more than {MAX_DFA_STATES} states, so it is left out of the scan.
						</p>
					{/if}
				</div>
				<div class="drop">
					<Toggle bind:checked={rule.drop}
						><span class="drop-text">Drop</span><span class="visually-hidden">
							R{i + 1}</span
						></Toggle
					>
				</div>
				<div class="actions">
					<IconButton
						icon="chevron-up"
						size="sm"
						label="Move R{i + 1} up"
						aria-disabled={i === 0}
						onclick={() => i > 0 && move(i, i - 1)}
					/>
					<IconButton
						icon="chevron-down"
						size="sm"
						label="Move R{i + 1} down"
						aria-disabled={i === rules.length - 1}
						onclick={() => i < rules.length - 1 && move(i, i + 1)}
					/>
					<IconButton icon="x" size="sm" label="Delete R{i + 1}" onclick={() => remove(i)} />
				</div>
			</li>
		{/each}
	</ol>
	<span class="visually-hidden" aria-live="polite">{announcement}</span>
</div>

<style>
	.rule-list {
		container-type: inline-size;
		min-width: 0;
	}
	.heads,
	.row {
		display: grid;
		grid-template-columns: 18px 2.1rem minmax(6rem, 9.5rem) minmax(0, 1fr) auto auto;
		grid-template-areas: 'grip idx name re drop actions';
		align-items: start;
		gap: var(--space-2);
	}
	.heads {
		padding: 0 var(--space-2) var(--space-1);
		border: 1px solid transparent;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.h-name {
		grid-column: name;
	}
	.h-re {
		grid-column: re;
	}
	.h-drop {
		grid-column: drop;
		min-width: 2.75rem;
	}
	.h-actions {
		grid-column: actions;
		width: 90px;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		position: relative;
		padding: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: var(--surface);
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.row:hover,
	.row:focus-within {
		border-color: var(--border);
		background: var(--surface-2);
	}
	.row.dragging {
		z-index: 2;
		border-color: var(--border-strong);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
		transition: none;
	}
	.row.marker-before::before,
	.row.marker-after::after {
		content: '';
		position: absolute;
		left: var(--space-2);
		right: var(--space-2);
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
	}
	.row.marker-before::before {
		top: -4px;
	}
	.row.marker-after::after {
		bottom: -4px;
	}
	.grip {
		grid-area: grip;
		display: grid;
		place-items: center;
		width: 18px;
		height: 36px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-3);
		cursor: grab;
		touch-action: none;
	}
	.grip:hover {
		color: var(--text);
		background: var(--surface-3);
	}
	.dragging .grip {
		cursor: grabbing;
	}
	.grip svg {
		fill: currentColor;
	}
	.idx {
		grid-area: idx;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		color: var(--tone-fg);
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-style: italic;
		font-weight: 600;
		white-space: nowrap;
	}
	.idx sub {
		font-size: 0.7em;
		font-style: normal;
	}
	.dropped .idx {
		color: var(--text-3);
	}
	.name {
		grid-area: name;
		min-width: 0;
	}
	.re {
		grid-area: re;
		min-width: 0;
	}
	.drop {
		grid-area: drop;
		display: flex;
		align-items: center;
		min-width: 2.75rem;
		height: 36px;
	}
	/* The column head says "Drop"; the switch repeats it only when the heads are hidden. */
	.drop-text {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		height: 36px;
	}
	.warn {
		margin: 4px 0 0;
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	@container (max-width: 560px) {
		.heads {
			display: none;
		}
		.row {
			grid-template-columns: 18px 2.1rem minmax(0, 1fr) auto;
			grid-template-areas:
				'grip idx name name'
				'. . re re'
				'. . drop actions';
			row-gap: var(--space-2);
		}
		.drop,
		.actions {
			height: 30px;
		}
		.drop-text {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
		}
	}
</style>
