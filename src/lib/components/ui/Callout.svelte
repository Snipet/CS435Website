<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	type CalloutTone = 'info' | 'warn' | 'error' | 'success';

	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
		tone?: CalloutTone;
		title?: string;
		/** Hide the leading icon. */
		plain?: boolean;
		children?: Snippet;
	}

	let {
		tone = 'info',
		title,
		plain = false,
		children,
		class: className,
		...rest
	}: Props = $props();

	const ICON: Record<CalloutTone, IconName> = {
		info: 'info',
		warn: 'warning',
		error: 'error',
		success: 'success'
	};
</script>

<div class={['callout', tone, className]} {...rest}>
	{#if !plain}<span class="icon"><Icon name={ICON[tone]} size={18} /></span>{/if}
	<div class="content">
		{#if title}<p class="title">{title}</p>{/if}
		{@render children?.()}
	</div>
</div>

<style>
	.callout {
		--c: var(--info);
		--c-soft: var(--info-soft);
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
		border-left: 3px solid var(--c);
		border-radius: var(--radius);
		background: var(--c-soft);
		color: var(--text);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.warn {
		--c: var(--active);
		--c-soft: var(--active-soft);
	}
	.error {
		--c: var(--reject);
		--c-soft: var(--reject-soft);
	}
	.success {
		--c: var(--accept);
		--c-soft: var(--accept-soft);
	}
	.icon {
		display: flex;
		padding-top: 1px;
		color: var(--c);
	}
	.content {
		min-width: 0;
		flex: 1;
	}
	.content :global(> :last-child) {
		margin-bottom: 0;
	}
	.title {
		margin: 0 0 var(--space-1);
		font-weight: 600;
	}
</style>
