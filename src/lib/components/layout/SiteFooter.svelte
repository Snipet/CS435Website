<script lang="ts">
	import { site } from '$lib/site';
</script>

<footer class="site-footer">
	<div class="inner">
		<span>{site.name}</span>
		<span class="sep" aria-hidden="true">·</span>
		<span>Everything runs in your browser.</span>
	</div>
</footer>

<style>
	.site-footer {
		border-top: 1px solid var(--border);
		margin-top: var(--space-8);
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.inner {
		max-width: var(--page-width);
		margin: 0 auto;
		padding: var(--space-5) var(--gutter);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
