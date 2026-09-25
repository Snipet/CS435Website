<script lang="ts">
	interface Props {
		values: readonly number[];
		/** How many values IN has read at the current step. */
		read: number;
	}

	let { values, read }: Props = $props();

	const left = $derived(Math.max(0, values.length - read));
</script>

<div class="queue">
	{#if values.length}
		<ol aria-label="Input values in order">
			{#each values as v, i (i)}
				<li class={{ read: i < read, next: i === read }}>
					<span class="v">{v}</span>
					<span class="visually-hidden"
						>{i < read ? '(read)' : i === read ? '(next)' : '(waiting)'}</span
					>
				</li>
			{/each}
		</ol>
	{/if}
	<p class="status">
		{#if !values.length}
			No values queued: the first IN asks for one.
		{:else if left === 0}
			{values.length === 1 ? 'The value has' : `All ${values.length} values have`} been read; the next
			IN asks for a value.
		{:else}
			{read} of {values.length} read; the next IN reads {values[read]}.
		{/if}
	</p>
</div>

<style>
	.queue {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	ol {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: inline-flex;
		align-items: center;
		min-width: 2rem;
		height: 26px;
		padding: 0 9px;
		justify-content: center;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		font-variant-numeric: tabular-nums;
	}
	li.read {
		border-color: var(--border);
		background: var(--surface-2);
		color: var(--text-3);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-3) 60%, transparent);
	}
	li.next {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.status {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
