<script lang="ts">
	import { site } from '$lib/site';
</script>

<svelte:head>
	<title>{site.name}</title>
</svelte:head>

<section class="intro">
	<h1>{site.name}</h1>
	<p>{site.description}</p>
</section>

<style>
	.intro {
		max-width: var(--content-width);
	}
	.intro p {
		color: var(--text-2);
		font-size: var(--text-lg);
	}
</style>
