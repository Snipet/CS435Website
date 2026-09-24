<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
	import { navLinks, type NavLink } from '$lib/site';
	import { toolBySlug } from '$lib/tools/registry';

	/** 'page' for the link's own page, 'true' for pages in its section (tools under Tools). */
	function current(href: NavLink['href']): 'page' | 'true' | undefined {
		const path = page.url.pathname.replace(/\/+$/, '') || '/';
		if (path === resolve(href)) return 'page';
		if (href === '/') return toolBySlug(path.split('/')[1] ?? '') ? 'true' : undefined;
		return path.startsWith(resolve(href) + '/') ? 'true' : undefined;
	}
</script>

<header class="site-header">
	<div class="inner">
		<a class="brand" href={resolve('/')}>
			<svg class="mark" viewBox="0 0 40 24" aria-hidden="true">
				<circle cx="9" cy="12" r="6.5" />
				<circle cx="31" cy="12" r="6.5" />
				<circle cx="31" cy="12" r="4.2" />
				<path d="M15.5 12h8.5m-2.6-2.4 2.6 2.4-2.6 2.4" />
			</svg>
			<span class="name">CS435</span>
			<span class="sub">Compiler Tools</span>
		</a>

		<nav aria-label="Primary">
			{#each navLinks as link (link.href)}
				<a href={resolve(link.href)} aria-current={current(link.href)}>{link.label}</a>
			{/each}
		</nav>

		<ThemeToggle />
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.4) blur(10px);
		-webkit-backdrop-filter: saturate(1.4) blur(10px);
		border-bottom: 1px solid var(--border);
	}
	.inner {
		max-width: var(--page-width);
		margin: 0 auto;
		padding: 0 var(--gutter);
		height: 56px;
		display: flex;
		align-items: center;
		gap: var(--space-5);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
		text-decoration: none;
		white-space: nowrap;
	}
	.mark {
		width: 34px;
		height: 20px;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.name {
		font-family: var(--font-serif);
		font-weight: 700;
		font-size: var(--text-lg);
		letter-spacing: 0.01em;
	}
	.sub {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	nav {
		display: flex;
		gap: var(--space-1);
		margin-left: auto;
		overflow-x: auto;
		scrollbar-width: none;
	}
	nav a {
		color: var(--text-2);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 500;
		padding: 6px 10px;
		border-radius: var(--radius);
		white-space: nowrap;
		transition:
			background var(--duration) var(--ease),
			color var(--duration) var(--ease);
	}
	nav a:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	nav a[aria-current] {
		color: var(--text);
		background: var(--surface-2);
	}
	@media (max-width: 560px) {
		.sub {
			display: none;
		}
		.inner {
			gap: var(--space-3);
		}
	}
</style>
