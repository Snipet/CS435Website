<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<kbd>{@render children?.()}</kbd>

<style>
	kbd {
		display: inline-block;
		min-width: 1.6em;
		padding: 0.1em 0.4em;
		border: 1px solid var(--border-strong);
		border-bottom-width: 2px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-2);
		font-size: 0.8em;
		line-height: 1.4;
		text-align: center;
		white-space: nowrap;
	}
</style>
