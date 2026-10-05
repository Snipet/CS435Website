<!--
	What a step does, in words, with the line of the code it executes. Shown
	under the step controls, where it is announced as the step changes.
-->
<script lang="ts">
	import type { StepText } from './view';

	interface Props {
		text: StepText;
		/** The line of the code (from 0) and what it says. */
		line: number;
		code: string;
	}

	let { text, line, code }: Props = $props();
</script>

<span class="step">
	<span class="where">
		<span class="number">Line {line + 1}</span>
		<code>{code.trim()}</code>
	</span>
	<span class={['title', text.tone]}>{text.title}</span>
	{#if text.detail}<span class="detail">{text.detail}</span>{/if}
</span>

<style>
	.step {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
	}
	.number {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	code {
		font-size: 0.8125rem;
	}
	.title {
		font-weight: 600;
	}
	.title.accept {
		color: var(--accept);
	}
	.title.reject {
		color: var(--reject);
	}
	.detail {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
</style>
