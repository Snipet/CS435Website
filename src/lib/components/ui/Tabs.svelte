<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Tab {
		id: string;
		label: string;
		disabled?: boolean;
		/** Small count or note shown after the label. */
		badge?: string | number;
		/** Panel content for this tab; otherwise `children(id)` is rendered. */
		content?: Snippet;
	}

	interface Props {
		tabs: readonly Tab[];
		/** Id of the selected tab. */
		value?: string;
		/** Accessible name of the tab list. */
		label: string;
		/** Panel renderer used for tabs without `content`. */
		children?: Snippet<[string]>;
		onchange?: (id: string) => void;
	}

	let { tabs, value = $bindable(), label, children, onchange }: Props = $props();

	const uid = $props.id();
	const buttons: HTMLButtonElement[] = $state([]);

	const enabled = $derived(tabs.filter((t) => !t.disabled));
	const current = $derived(
		tabs.find((t) => t.id === value && !t.disabled) ?? enabled[0] ?? tabs[0]
	);

	function select(tab: Tab, focus = false) {
		if (tab.disabled) return;
		if (value !== tab.id) {
			value = tab.id;
			onchange?.(tab.id);
		}
		if (focus) buttons[tabs.indexOf(tab)]?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		const at = enabled.indexOf(current);
		let next: Tab | undefined;
		switch (event.key) {
			case 'ArrowRight':
				next = enabled[(at + 1) % enabled.length];
				break;
			case 'ArrowLeft':
				next = enabled[(at - 1 + enabled.length) % enabled.length];
				break;
			case 'Home':
				next = enabled[0];
				break;
			case 'End':
				next = enabled[enabled.length - 1];
				break;
			default:
				return;
		}
		event.preventDefault();
		if (next) select(next, true);
	}
</script>

<div class="tabs">
	<div class="tablist" role="tablist" aria-label={label}>
		{#each tabs as tab, i (tab.id)}
			{@const selected = tab === current}
			<button
				bind:this={buttons[i]}
				type="button"
				role="tab"
				id="{uid}-tab-{tab.id}"
				aria-selected={selected}
				aria-controls="{uid}-panel"
				tabindex={selected ? 0 : -1}
				disabled={tab.disabled}
				class="tab"
				onclick={() => select(tab)}
				{onkeydown}
			>
				{tab.label}
				{#if tab.badge !== undefined}<span class="badge">{tab.badge}</span>{/if}
			</button>
		{/each}
	</div>
	{#if current}
		<div
			class="panel"
			role="tabpanel"
			id="{uid}-panel"
			aria-labelledby="{uid}-tab-{current.id}"
			tabindex="0"
		>
			{#if current.content}
				{@render current.content()}
			{:else}
				{@render children?.(current.id)}
			{/if}
		</div>
	{/if}
</div>

<style>
	.tabs {
		min-width: 0;
	}
	.tablist {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
		scrollbar-width: thin;
	}
	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		padding: 8px 12px 10px;
		border: 0;
		background: transparent;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		border-radius: var(--radius) var(--radius) 0 0;
		transition: color var(--duration) var(--ease);
	}
	.tab::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px 2px 0 0;
		background: transparent;
		transition: background var(--duration) var(--ease);
	}
	.tab:hover {
		color: var(--text);
	}
	.tab[aria-selected='true'] {
		color: var(--text);
	}
	.tab[aria-selected='true']::after {
		background: var(--accent);
	}
	.tab:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.tab:focus-visible {
		outline-offset: -2px;
	}
	.badge {
		min-width: 20px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.panel {
		padding-top: var(--space-4);
	}
	.panel:focus-visible {
		outline-offset: 4px;
		border-radius: var(--radius-sm);
	}
</style>
