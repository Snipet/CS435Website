<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SiteHeader from '$lib/components/layout/SiteHeader.svelte';
	import SiteFooter from '$lib/components/layout/SiteFooter.svelte';
	import { site } from '$lib/site';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content={site.description} />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>
<SiteHeader />
<main id="main">
	{@render children()}
</main>
<SiteFooter />

<style>
	.skip {
		position: absolute;
		left: var(--space-3);
		top: -48px;
		z-index: 100;
		padding: var(--space-2) var(--space-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.skip:focus {
		top: var(--space-3);
	}
	main {
		max-width: var(--page-width);
		margin: 0 auto;
		padding: var(--space-6) var(--gutter) 0;
	}
</style>
