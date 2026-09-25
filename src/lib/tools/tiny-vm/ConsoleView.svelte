<script lang="ts">
	import { scrollRegion } from './scroll-region';
	import type { ConsoleLine } from './trace';

	interface Props {
		lines: readonly ConsoleLine[];
		/** Some later lines were not kept (a long run). */
		dropped?: boolean;
		/** The call whose output is new in this view, to mark it. */
		latest?: number | null;
		/** Most lines drawn; earlier ones are summarized. */
		max?: number;
	}

	let { lines, dropped = false, latest = null, max = 200 }: Props = $props();

	const shown = $derived(lines.length > max ? lines.slice(lines.length - max) : lines);
	const hidden = $derived(lines.length - shown.length);

	let box: HTMLDivElement | undefined = $state();

	$effect(() => {
		void shown.length;
		if (box) box.scrollTop = box.scrollHeight;
	});
</script>

<div
	class="console"
	bind:this={box}
	role="log"
	aria-live="off"
	aria-label="Console output"
	{@attach scrollRegion}
>
	{#if hidden}
		<p class="note">{hidden} earlier line{hidden === 1 ? '' : 's'} not shown</p>
	{/if}
	{#each shown as line, i (hidden + i)}
		<p class={['line', line.kind, { latest: line.step === latest }]}>
			{#if line.kind === 'in'}<span class="prompt">{line.text}</span><span class="value"
					>{line.value}</span
				>{:else}{line.text}{/if}
		</p>
	{:else}
		<p class="note">No output yet.</p>
	{/each}
	{#if dropped}
		<p class="note">Later lines are not kept.</p>
	{/if}
</div>

<style>
	.console {
		min-height: 5.5rem;
		max-height: 13rem;
		overflow: auto;
		overscroll-behavior: contain;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		line-height: 1.6;
	}
	.line {
		margin: 0;
		padding: 0 4px;
		border-radius: var(--radius-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.line.latest {
		background: var(--active-soft);
	}
	.prompt {
		color: var(--text-3);
	}
	.value {
		color: var(--accent);
		font-weight: 600;
	}
	.halt {
		color: var(--text-2);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-style: italic;
	}
</style>
