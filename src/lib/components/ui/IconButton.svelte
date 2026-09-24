<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';
	import type { Size } from './types';

	interface Props extends Omit<HTMLButtonAttributes, 'aria-label'> {
		/** Accessible name; also shown as the tooltip. Required. */
		label: string;
		/** Keyboard shortcut shown in the tooltip, e.g. "→". */
		shortcut?: string;
		icon?: IconName;
		/** Custom content instead of `icon`. */
		children?: Snippet;
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: Size;
		element?: HTMLButtonElement;
	}

	let {
		label,
		shortcut,
		icon,
		children,
		variant = 'ghost',
		size = 'md',
		type = 'button',
		title,
		class: className,
		element = $bindable(),
		...rest
	}: Props = $props();
</script>

<button
	bind:this={element}
	{type}
	class={['icon-btn', variant, size, className]}
	aria-label={label}
	title={title ?? (shortcut ? `${label} (${shortcut})` : label)}
	{...rest}
>
	{#if children}{@render children()}{:else if icon}<Icon
			name={icon}
			size={size === 'sm' ? 16 : 18}
		/>{/if}
</button>

<style>
	.icon-btn {
		display: inline-grid;
		place-items: center;
		flex: none;
		border: 1px solid transparent;
		border-radius: var(--radius);
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			color var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.md {
		width: 36px;
		height: 36px;
	}
	.sm {
		width: 30px;
		height: 30px;
	}
	.ghost {
		background: transparent;
		color: var(--text-2);
	}
	.ghost:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.secondary {
		background: var(--surface);
		border-color: var(--border-strong);
		color: var(--text);
	}
	.secondary:hover {
		background: var(--surface-2);
	}
	.primary {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.primary:hover {
		background: var(--accent-hover);
	}
	.icon-btn:disabled,
	.icon-btn[aria-disabled='true'] {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.ghost:disabled:hover,
	.ghost[aria-disabled='true']:hover {
		background: transparent;
		color: var(--text-2);
	}
	.primary:disabled:hover,
	.primary[aria-disabled='true']:hover {
		background: var(--accent);
	}
	.icon-btn[aria-pressed='true'] {
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>
