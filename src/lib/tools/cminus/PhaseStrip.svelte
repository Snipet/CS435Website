<!--
	The phases of the compiler in the order of the "7 Phases of a Compiler"
	slide, then the TINY Machine. Each stage shows what it produced, its error
	count, or that it was not reached; choosing one opens its tab.
-->
<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import type { StageId, StageView } from './views';

	interface Props {
		stages: readonly StageView[];
		/** The stage whose tab is open; null when no stage's tab is. */
		current: StageId | null;
		/** The results shown are for an earlier text or input. */
		busy?: boolean;
		onselect: (stage: StageView) => void;
	}

	let { stages, current, busy = false, onselect }: Props = $props();

	const STATUS_WORD: Record<StageView['status'], string> = {
		done: '',
		failed: 'failed: ',
		paused: 'stopped: ',
		off: '',
		'not-reached': '',
		idle: ''
	};
</script>

<nav class="strip" aria-label="Phases of the compiler">
	<ol class={{ 'stale-data': busy }} aria-busy={busy}>
		{#each stages as stage, i (stage.id)}
			{@const on = stage.id === current}
			<li class={['stage', stage.status, { on }]}>
				<button
					type="button"
					aria-current={on ? 'step' : undefined}
					aria-label="{stage.name}: {STATUS_WORD[stage.status]}{stage.text}"
					onclick={() => onselect(stage)}
				>
					<span class="head">
						<span class="n" aria-hidden="true">
							{#if stage.id === 'machine'}<Icon name="play" size={11} />{:else}{i + 1}{/if}
						</span>
						<span class="name">{stage.name}</span>
					</span>
					<span class="out">
						{#if stage.status === 'failed'}<Icon
								name="error"
								size={14}
							/>{:else if stage.status === 'paused'}<Icon name="warning" size={14} />{/if}
						{stage.text}
					</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>

<style>
	.strip {
		position: relative;
		min-width: 0;
	}
	ol {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media (min-width: 640px) {
		ol {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (min-width: 1180px) {
		ol {
			grid-template-columns: repeat(8, minmax(0, 1fr));
			gap: var(--space-3);
		}
	}
	.stage {
		position: relative;
		display: flex;
		min-width: 0;
	}
	/* An arrow from each stage to the next one of its row. */
	.stage + .stage::before {
		content: '';
		position: absolute;
		top: 50%;
		left: calc(var(--space-3) / -2 - 3px);
		width: 6px;
		height: 6px;
		border-top: 1.5px solid var(--border-strong);
		border-right: 1.5px solid var(--border-strong);
		transform: translateY(-50%) rotate(45deg);
		display: none;
	}
	@media (min-width: 1180px) {
		.stage + .stage::before {
			display: block;
		}
	}
	button {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		color: var(--text);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--duration) var(--ease),
			background var(--duration) var(--ease);
	}
	button:hover {
		border-color: var(--border-strong);
	}
	.on button {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}
	.n {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
		width: 18px;
		height: 18px;
		margin-top: 1px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: 0.6875rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.on .n {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.name {
		min-width: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.out {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: auto;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		line-height: 1.35;
	}
	.failed .out {
		color: var(--reject);
		font-weight: 600;
	}
	.paused .out {
		color: var(--text);
		font-weight: 600;
	}
	.paused .out :global(.icon) {
		color: var(--active);
	}
	.not-reached button,
	.off button,
	.idle button {
		background: var(--surface-2);
		box-shadow: none;
	}
	.not-reached .name,
	.off .name,
	.idle .name {
		color: var(--text-2);
		font-weight: 500;
	}
	.not-reached .out,
	.off .out,
	.idle .out {
		color: var(--text-3);
		font-style: italic;
	}
	.not-reached.on button,
	.off.on button,
	.idle.on button {
		background: var(--accent-soft);
	}
</style>
