<!--
	The warnings and errors of a run, listed under the console. Messages that
	point into the spec show their line; choosing it selects the span in the
	spec editor (when `onreveal` is given).
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { RunMessage } from './view';

	interface Props {
		messages: readonly RunMessage[];
		/** Selects a message's span in the spec editor. */
		onreveal?: (span: { start: number; end: number }) => void;
	}

	let { messages, onreveal }: Props = $props();

	const uid = $props.id();

	const LABEL = { error: 'Error', warning: 'Warning', info: 'Note' } as const;
</script>

{#if messages.length}
	<section class="run-messages" aria-labelledby="{uid}-title">
		<h3 id="{uid}-title" class="title">Messages</h3>
		<ul>
			{#each messages as m, i (i)}
				<li class="sev-{m.severity}">
					<Icon name={m.severity} size={15} label={LABEL[m.severity]} />
					<span class="msg">{m.message}</span>
					{#if m.span && m.line !== null}
						{#if onreveal}
							{@const span = m.span}
							<button
								type="button"
								class="loc"
								title="Select it in spec.l"
								onclick={() => onreveal(span)}>spec.l line {m.line}</button
							>
						{:else}
							<span class="loc">spec.l line {m.line}</span>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.run-messages {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.title {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 8px;
		min-width: 0;
		padding: 2px 0;
		color: var(--text);
	}
	li :global(.icon) {
		align-self: flex-start;
		margin-top: 3px;
	}
	.sev-error :global(.icon) {
		color: var(--reject);
	}
	.sev-warning :global(.icon) {
		color: var(--active);
	}
	.sev-info :global(.icon) {
		color: var(--info);
	}
	.msg {
		flex: 1 1 16rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.loc {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	button.loc {
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	button.loc:hover {
		color: var(--accent);
	}
</style>
