<script lang="ts" module>
	// 24×24 strokes in the same style as the theme toggle. `fill` paths are filled.
	const ICONS = {
		play: {
			fill: 'M8 5.6v12.8a.6.6 0 0 0 .92.5l9.9-6.4a.6.6 0 0 0 0-1l-9.9-6.4a.6.6 0 0 0-.92.5Z'
		},
		pause: { fill: 'M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z' },
		'step-back': { d: 'M14.5 6.5 9 12l5.5 5.5' },
		'step-forward': { d: 'M9.5 6.5 15 12l-5.5 5.5' },
		first: { d: 'M6.5 6v12M17 6.5 11.5 12l5.5 5.5' },
		last: { d: 'M17.5 6v12M7 6.5l5.5 5.5L7 17.5' },
		link: {
			d: 'M10.2 13.8a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.06 1.06M13.8 10.2a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.06-1.06'
		},
		book: {
			d: 'M3.5 5.5c2.9-1 5.7-.8 8.5 1 2.8-1.8 5.6-2 8.5-1v13c-2.9-1-5.7-.8-8.5 1-2.8-1.8-5.6-2-8.5-1zM12 6.5v13'
		},
		'chevron-down': { d: 'M6.5 9.5 12 15l5.5-5.5' },
		'chevron-up': { d: 'M6.5 14.5 12 9l5.5 5.5' },
		'chevron-left': { d: 'M14.5 6.5 9 12l5.5 5.5' },
		'chevron-right': { d: 'M9.5 6.5 15 12l-5.5 5.5' },
		'arrow-right': { d: 'M5 12h14M13.5 6.5 19 12l-5.5 5.5' },
		plus: { d: 'M12 5.5v13M5.5 12h13' },
		minus: { d: 'M5.5 12h13' },
		fit: {
			d: 'M4.5 9V6a1.5 1.5 0 0 1 1.5-1.5h3M15 4.5h3A1.5 1.5 0 0 1 19.5 6v3M19.5 15v3a1.5 1.5 0 0 1-1.5 1.5h-3M9 19.5H6A1.5 1.5 0 0 1 4.5 18v-3'
		},
		reset: { d: 'M4.8 12a7.2 7.2 0 1 0 2.1-5.1L4.8 9M4.8 4.8V9H9' },
		check: { d: 'M5.5 12.5 10 17l8.5-9.5' },
		x: { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' },
		info: { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.2M12 7.8v.1' },
		warning: {
			d: 'M10.6 4.6 3 18a1.6 1.6 0 0 0 1.4 2.4h15.2A1.6 1.6 0 0 0 21 18L13.4 4.6a1.6 1.6 0 0 0-2.8 0ZM12 9.5v4.6M12 17.1v.1'
		},
		error: {
			d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6'
		},
		success: { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM8.2 12.3l2.6 2.6 5-5.4' },
		undo: { d: 'M9 14.5 4.5 10 9 5.5M4.5 10h10a5 5 0 0 1 0 10H11' },
		redo: { d: 'M15 14.5l4.5-4.5L15 5.5M19.5 10h-10a5 5 0 0 0 0 10H13' },
		list: { d: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' },
		copy: {
			d: 'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5zM15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9'
		}
	} satisfies Record<string, { d?: string; fill?: string }>;

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		/** Rendered size in px (default 16). */
		size?: number;
		/** Accessible name. Without it the icon is decorative (aria-hidden). */
		label?: string;
		class?: string;
	}

	let { name, size = 16, label, class: className }: Props = $props();

	const icon = $derived<{ d?: string; fill?: string }>(ICONS[name]);
</script>

<svg
	class={['icon', className]}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	{#if icon.fill}<path class="fill" d={icon.fill} />{/if}
	{#if icon.d}<path d={icon.d} />{/if}
</svg>

<style>
	.icon {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		vertical-align: middle;
	}
	.fill {
		fill: currentColor;
		stroke: none;
	}
</style>
