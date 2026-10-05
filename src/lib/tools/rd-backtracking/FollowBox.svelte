<!--
	A box that scrolls its content once it is taller than `maxHeight`, and keeps
	one element of it in view as the steps go by: the token under the pointer,
	the current node of the tree. The page itself is never scrolled. Content
	within the height is left as it is: no scroll box, no tab stop.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onReflow, reveal } from './scroll';

	interface Props {
		children: Snippet;
		/** CSS max-height of the box. */
		maxHeight: string;
		/** The element to keep in view, looked up in the box after every change of `watch`. */
		find: (box: HTMLElement) => Element | null;
		/** A value that changes when that element may be another one, or elsewhere (the step shown). */
		watch: unknown;
		/** Accessible name of the box while it scrolls. */
		label: string;
		/** Look once more after this many ms, when the content moves into place with an animation. */
		settle?: number;
		/** Room kept around the element, in px. */
		margin?: number;
	}

	let { children, maxHeight, find, watch, label, settle = 0, margin = 12 }: Props = $props();

	let box: HTMLDivElement | undefined = $state();
	let scrolls = $state(false);

	$effect(() => {
		void watch;
		const el = box;
		if (!el) return;
		const adjust = () => {
			// Glyphs may reach a few px out of their lines: only content past the limit scrolls.
			const limit = parseFloat(getComputedStyle(el).maxHeight);
			scrolls = Number.isFinite(limit) && el.scrollHeight > limit + 1;
			const target = find(el);
			if (target) reveal(el, target, margin);
		};
		adjust();
		const timer = settle > 0 ? setTimeout(adjust, settle) : null;
		const stop = onReflow(el, adjust);
		return () => {
			if (timer !== null) clearTimeout(timer);
			stop();
		};
	});
</script>

<!-- A box that scrolls must be reachable from the keyboard. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class={['follow-box', { scrolls }]}
	bind:this={box}
	style:max-height={maxHeight}
	role={scrolls ? 'group' : undefined}
	aria-label={scrolls ? label : undefined}
	tabindex={scrolls ? 0 : undefined}
>
	{@render children()}
</div>

<style>
	.follow-box {
		position: relative;
		min-width: 0;
	}
	.follow-box.scrolls {
		overflow-y: auto;
		overscroll-behavior: contain;
		border-radius: var(--radius-sm);
		scrollbar-width: thin;
	}
	.follow-box:focus-visible {
		outline-offset: 2px;
	}
</style>
