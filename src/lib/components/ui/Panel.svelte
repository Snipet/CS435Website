<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
		title?: string;
		/** Heading level for the title (default 2). */
		level?: 2 | 3 | 4;
		/** Muted text after the title, e.g. a count. */
		subtitle?: string;
		/** Controls at the right of the header. */
		actions?: Snippet;
		/** Content under the body, separated by a rule. */
		footer?: Snippet;
		children?: Snippet;
		variant?: 'default' | 'subtle';
		/** 'none' lets content (graphs, tables) run to the edges. */
		padding?: 'md' | 'none';
	}

	let {
		title,
		level = 2,
		subtitle,
		actions,
		footer,
		children,
		variant = 'default',
		padding = 'md',
		class: className,
		...rest
	}: Props = $props();

	const uid = $props.id();
</script>

<section
	class={['panel', variant, className]}
	aria-labelledby={title ? `${uid}-title` : undefined}
	{...rest}
>
	{#if title || actions}
		<header class="head">
			{#if title}
				<svelte:element this={`h${level}`} class="title" id="{uid}-title">
					{title}
					{#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
				</svelte:element>
			{/if}
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class={['body', { flush: padding === 'none' }]}>
		{@render children?.()}
	</div>
	{#if footer}<footer class="foot">{@render footer()}</footer>{/if}
</section>

<style>
	.panel {
		min-width: 0;
		border-radius: var(--radius-lg);
	}
	.default {
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-sm);
	}
	.subtle {
		background: var(--surface-2);
		border: 1px solid transparent;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3) var(--space-4) 0;
		min-height: 44px;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.005em;
	}
	.subtitle {
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--text-3);
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-left: auto;
	}
	.body {
		padding: var(--space-4);
		min-width: 0;
	}
	.head + .body {
		padding-top: var(--space-3);
	}
	.body.flush {
		padding: 0;
	}
	.head + .body.flush {
		padding-top: var(--space-3);
	}
	.foot {
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	@media (max-width: 480px) {
		.head {
			padding: var(--space-3) var(--space-3) 0;
		}
		.body {
			padding: var(--space-3);
		}
		.foot {
			padding: var(--space-3);
		}
	}
</style>
