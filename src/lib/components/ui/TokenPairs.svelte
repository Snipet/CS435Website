<script lang="ts">
	import { formatLexeme, formatTokenPair, type TokenFormat } from './token-format';
	import { toneStyle } from './tones';
	import type { TokenPair } from './types';

	interface Props {
		tokens: readonly TokenPair[];
		format?: TokenFormat;
		/** Show skipped tokens (e.g. Whitespace), muted and struck through. */
		showSkipped?: boolean;
		/** 'inline' wraps like the slides; 'list' puts one pair per line. */
		layout?: 'inline' | 'list';
		/** Index (into `tokens`) to emphasize, e.g. from a hovered lexeme elsewhere. */
		active?: number | null;
		/** Called with the index (into `tokens`) under the pointer or focus, or null. */
		onhover?: (index: number | null) => void;
		ariaLabel?: string;
		/** Text when there are no tokens to show. */
		empty?: string;
	}

	let {
		tokens,
		format = 'paren',
		showSkipped = false,
		layout = 'inline',
		active = null,
		onhover,
		ariaLabel = 'Tokens',
		empty = 'No tokens'
	}: Props = $props();

	const visible = $derived(
		tokens.map((token, index) => ({ token, index })).filter((t) => showSkipped || !t.token.skipped)
	);
	let focusK = $state(0);
	const items: HTMLLIElement[] = $state([]);

	function tone(t: TokenPair) {
		if (t.error) return toneStyle('reject');
		if (t.skipped) return toneStyle('muted');
		return toneStyle(t.rule ?? 0);
	}

	function onkeydown(event: KeyboardEvent) {
		const n = visible.length;
		let k = focusK;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') k = Math.min(n - 1, k + 1);
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') k = Math.max(0, k - 1);
		else if (event.key === 'Home') k = 0;
		else if (event.key === 'End') k = n - 1;
		else return;
		event.preventDefault();
		focusK = k;
		items[k]?.focus();
	}
</script>

{#if visible.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<ol
		class={['pairs', layout]}
		aria-label={ariaLabel}
		onpointerleave={() => onhover?.(null)}
		onfocusout={(e) => {
			if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null))
				onhover?.(null);
		}}
	>
		{#each visible as { token, index }, k (index)}
			<!-- Pairs are focusable so keyboard users get the same cross-highlighting as hover. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<li
				bind:this={items[k]}
				class={['pair', { active: active === index, skipped: token.skipped, error: token.error }]}
				style={tone(token)}
				tabindex={k === Math.min(focusK, visible.length - 1) ? 0 : -1}
				aria-label={formatTokenPair(token, format) + (token.skipped ? ' (skipped)' : '')}
				onpointerenter={() => onhover?.(index)}
				onfocus={() => {
					focusK = k;
					onhover?.(index);
				}}
				{onkeydown}
			>
				<span class="tok" aria-hidden="true"
					><span class="punct">{format === 'paren' ? '(' : '<'}</span><span class="name"
						>{token.name}</span
					><span class="punct">{format === 'paren' ? ', ' : ','}</span><span class="lex"
						>{formatLexeme(token.lexeme, format)}</span
					><span class="punct">{format === 'paren' ? ')' : '>'}</span></span
				>{#if layout === 'inline' && k < visible.length - 1}<span class="sep" aria-hidden="true"
						>,</span
					>{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.pairs {
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 2px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.pair {
		display: inline-flex;
		align-items: baseline;
		border-radius: var(--radius-sm);
		outline-offset: 1px;
	}
	.tok {
		padding: 1px 3px;
		border-radius: var(--radius-sm);
		white-space: pre;
		transition: background var(--duration) var(--ease);
	}
	.pair:hover .tok,
	.pair.active .tok,
	.pair:focus-visible .tok {
		background: var(--tone-bg);
		box-shadow: inset 0 -2px 0 var(--tone-fg);
	}
	.punct {
		color: var(--text-3);
	}
	.name {
		color: var(--tone-fg);
		font-weight: 600;
	}
	.lex {
		color: var(--text);
	}
	.sep {
		margin-left: -2px;
		padding-right: 6px;
		color: var(--text-3);
	}
	.skipped .tok {
		opacity: 0.7;
		text-decoration: line-through;
		text-decoration-color: var(--text-3);
	}
	.skipped .name {
		font-weight: 400;
	}
	.error .lex {
		text-decoration: underline wavy var(--reject);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
