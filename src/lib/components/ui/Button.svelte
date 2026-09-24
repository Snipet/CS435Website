<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Size } from './types';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: Size;
		/** Leading icon, e.g. `{#snippet icon()}<Icon name="play" />{/snippet}`. */
		icon?: Snippet;
		children?: Snippet;
		/** The rendered <button>, for focusing. */
		element?: HTMLButtonElement;
	}

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		children,
		type = 'button',
		class: className,
		element = $bindable(),
		...rest
	}: Props = $props();
</script>

<button bind:this={element} {type} class={['btn', variant, size, className]} {...rest}>
	{#if icon}<span class="icon">{@render icon()}</span>{/if}
	{#if children}<span class="label">{@render children()}</span>{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease),
			color var(--duration) var(--ease);
	}
	.md {
		height: 36px;
		padding: 0 14px;
		font-size: var(--text-sm);
	}
	.sm {
		height: 30px;
		padding: 0 10px;
		font-size: var(--text-sm);
		gap: 5px;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.primary:hover {
		background: var(--accent-hover);
	}
	.secondary {
		background: var(--surface);
		border-color: var(--border-strong);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.secondary:hover {
		background: var(--surface-2);
	}
	.ghost {
		background: transparent;
		color: var(--text-2);
	}
	.ghost:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.btn:active:not(:disabled, [aria-disabled='true']) {
		transform: translateY(0.5px);
	}
	.btn:disabled,
	.btn[aria-disabled='true'] {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn[aria-pressed='true'],
	.btn[aria-expanded='true'] {
		background: var(--surface-3);
		color: var(--text);
	}
	.icon {
		display: inline-flex;
		margin-left: -2px;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
