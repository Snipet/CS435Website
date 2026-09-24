<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { pageTitle } from '$lib/site';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Page not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{pageTitle(title)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="error">
	<svg class="figure" viewBox="0 0 220 72" aria-hidden="true">
		<circle class="state" cx="36" cy="36" r="20" />
		<path class="edge" d="M4 36h9" />
		<path class="edge" d="M10 32.5 13.5 36 10 39.5" />
		<path class="edge" d="M56 36h54" />
		<path class="edge" d="M104.5 31 110 36l-5.5 5" />
		<text class="sym" x="83" y="27">?</text>
		<circle class="trap" cx="134" cy="36" r="20" />
		<text class="name" x="134" y="41">∅</text>
		<path class="loop" d="M126 18c-4-14 20-14 16 0" />
		<path class="loop" d="M138.2 14.3 142 18l1.5-5" />
	</svg>
	<p class="status">{page.status}</p>
	<h1>{title}</h1>
	{#if notFound}
		<p class="detail">
			There is no page at <code>{page.url.pathname}</code>. The link may be mistyped, or the page
			may have moved.
		</p>
	{:else}
		<p class="detail">{page.error?.message ?? 'An unexpected error occurred.'}</p>
	{/if}
	<nav class="links" aria-label="Go to">
		<a href={resolve('/')}><Icon name="chevron-left" size={16} />All tools</a>
		<a href={resolve('/notation')}>Notation</a>
	</nav>
</section>

<style>
	.error {
		max-width: 36rem;
		margin: var(--space-6) auto var(--space-7);
		text-align: center;
	}
	.figure {
		width: 200px;
		max-width: 100%;
		margin-bottom: var(--space-3);
		overflow: visible;
	}
	.state {
		fill: var(--state-fill);
		stroke: var(--state-stroke);
		stroke-width: 1.5;
	}
	.trap {
		fill: var(--state-fill);
		stroke: var(--dead);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.edge,
	.loop {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.loop {
		stroke: var(--dead);
	}
	.sym {
		fill: var(--text-2);
		font-family: var(--font-mono);
		font-size: 15px;
	}
	.name {
		fill: var(--dead);
		font-family: var(--font-mono);
		font-size: 16px;
		text-anchor: middle;
	}
	.status {
		margin: 0 0 var(--space-1);
		color: var(--text-3);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		letter-spacing: 0.08em;
	}
	.detail {
		color: var(--text-2);
	}
	.detail code {
		overflow-wrap: anywhere;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2) var(--space-5);
		margin-top: var(--space-5);
	}
	.links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 500;
	}
</style>
