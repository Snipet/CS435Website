<!-- Under a long list that shows only its first rows: how many there are, and a button for the rest. -->
<script lang="ts">
	interface Props {
		shown: number;
		total: number;
		/** What the rows are: "tokens", "nodes". */
		noun: string;
		onshowall: () => void;
	}

	let { shown, total, noun, onshowall }: Props = $props();
</script>

{#if total > shown}
	<p class="more">
		The first {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
		{noun} are listed.
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
