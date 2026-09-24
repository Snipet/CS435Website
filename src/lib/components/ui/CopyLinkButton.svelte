<script lang="ts">
	import { tick } from 'svelte';
	import { flushHash } from '$lib/url-state';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import type { Size } from './types';

	interface Props {
		label?: string;
		size?: Size;
		variant?: 'secondary' | 'ghost';
	}

	let { label = 'Copy link', size = 'md', variant = 'secondary' }: Props = $props();

	const uid = $props.id();
	const manualId = `${uid}-manual`;
	let status = $state<'idle' | 'copied' | 'manual'>('idle');
	let url = $state('');
	let manualInput: HTMLInputElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function legacyCopy(text: string): boolean {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		try {
			return document.execCommand('copy');
		} catch {
			return false;
		} finally {
			ta.remove();
		}
	}

	async function writeClipboard(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return legacyCopy(text);
		}
	}

	async function copy() {
		flushHash();
		url = location.href;
		clearTimeout(timer);
		if (await writeClipboard(url)) {
			status = 'copied';
			timer = setTimeout(() => (status = 'idle'), 2000);
		} else {
			// Show the link so it can be copied by hand.
			status = 'manual';
			await tick();
			manualInput?.focus();
			manualInput?.select();
		}
	}
</script>

<div class="copy-link">
	<Button
		{variant}
		{size}
		onclick={copy}
		aria-describedby={status === 'manual' ? manualId : undefined}
	>
		{#snippet icon()}<Icon name={status === 'copied' ? 'check' : 'link'} size={16} />{/snippet}
		{status === 'copied' ? 'Copied' : label}
	</Button>
	<span class="visually-hidden" role="status">{status === 'copied' ? 'Link copied' : ''}</span>
	{#if status === 'manual'}
		<div class="manual">
			<label class="manual-label" for={manualId}>Copy this link</label>
			<input
				id={manualId}
				bind:this={manualInput}
				readonly
				value={url}
				onblur={() => (status = 'idle')}
				onkeydown={(e) => {
					if (e.key === 'Escape') status = 'idle';
				}}
			/>
		</div>
	{/if}
</div>

<style>
	.copy-link {
		position: relative;
		display: inline-flex;
	}
	.manual {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: min(360px, calc(100vw - 32px));
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
	}
	.manual-label {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.manual input {
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
</style>
