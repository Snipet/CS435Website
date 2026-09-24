<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'system' | 'light' | 'dark';
	const KEY = 'cs435-theme';
	const order: Theme[] = ['system', 'light', 'dark'];
	const labels: Record<Theme, string> = {
		system: 'Theme: follow system',
		light: 'Theme: light',
		dark: 'Theme: dark'
	};

	let theme = $state<Theme>('system');

	onMount(() => {
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'light' || saved === 'dark') theme = saved;
		} catch {
			/* storage unavailable */
		}
	});

	function cycle() {
		theme = order[(order.indexOf(theme) + 1) % order.length];
		const root = document.documentElement;
		if (theme === 'system') delete root.dataset.theme;
		else root.dataset.theme = theme;
		try {
			if (theme === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, theme);
		} catch {
			/* storage unavailable */
		}
	}
</script>

<button
	class="toggle"
	type="button"
	onclick={cycle}
	title={labels[theme]}
	aria-label={labels[theme]}
>
	{#if theme === 'light'}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="4.2" />
			<path
				d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
			/>
		</svg>
	{:else if theme === 'dark'}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
		</svg>
	{:else}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" class="fill" />
		</svg>
	{/if}
</button>

<style>
	.toggle {
		display: inline-grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius);
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			color var(--duration) var(--ease);
	}
	.toggle:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	svg {
		width: 19px;
		height: 19px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.fill {
		fill: currentColor;
		stroke: none;
	}
</style>
