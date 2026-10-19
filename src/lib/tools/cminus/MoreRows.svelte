<!--
	Under a long list that shows only some of its rows: which rows are listed
	(the first ones, or a stretch from row `from` on), and a button for the rest.
-->
<script lang="ts">
	interface Props {
		shown: number;
		total: number;
		/** What the rows are: "tokens", "nodes". */
		noun: string;
		/** The index of the first row listed; 0: the list starts at the first row. */
		from?: number;
		onshowall: () => void;
	}

	let { shown, total, noun, from = 0, onshowall }: Props = $props();

	const n = (k: number) => k.toLocaleString('en-US');
</script>

{#if total > shown}
	<p class="more">
		{#if from > 0}
			{n(shown)} of {n(total)}
			{noun} are listed, {n(from + 1)} to {n(from + shown)}.
		{:else}
			The first {n(shown)} of {n(total)}
			{noun} are listed.
		{/if}
		<button type="button" onclick={onshowall}>List all</button>
	</p>
{/if}

<style>
	.more {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	button {
		margin-left: var(--space-2);
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	button:hover {
		color: var(--accent-hover);
	}
</style>
