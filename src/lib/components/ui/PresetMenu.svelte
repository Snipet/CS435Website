<script lang="ts" generics="T">
	import { tick } from 'svelte';
	import Button from './Button.svelte';
	import CitationTag from './CitationTag.svelte';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import type { Preset, Size } from './types';

	interface Props {
		presets: readonly Preset<T>[];
		onselect: (preset: Preset<T>) => void;
		/** Id of the preset currently loaded, marked with a check. */
		selected?: string | null;
		/** Button text (default "Presets"). */
		label?: string;
		/** Align the popover with the button's start or end edge. */
		align?: 'start' | 'end';
		size?: Size;
		variant?: 'secondary' | 'ghost';
		/** Show preset labels in the monospace font (for labels that are expressions). */
		monoLabels?: boolean;
	}

	let {
		presets,
		onselect,
		selected = null,
		label = 'Presets',
		align = 'start',
		size = 'md',
		variant = 'secondary',
		monoLabels = false
	}: Props = $props();

	const uid = $props.id();
	const listId = `${uid}-list`;
	const optionId = (i: number) => `${uid}-opt-${i}`;

	let open = $state(false);
	let active = $state(0);
	let trigger: HTMLButtonElement | undefined = $state();
	let popover: HTMLDivElement | undefined = $state();
	let listbox: HTMLDivElement | undefined = $state();
	let place = $state<{ sheet: boolean; style: string }>({ sheet: false, style: '' });

	interface Group {
		name: string | null;
		items: { preset: Preset<T>; index: number }[];
	}

	const groups = $derived.by(() => {
		const out: Group[] = [];
		for (const preset of presets) {
			const name = preset.group ?? null;
			let g = out.find((x) => x.name === name);
			if (!g) {
				g = { name, items: [] };
				out.push(g);
			}
			g.items.push({ preset, index: -1 });
		}
		// Ungrouped presets first, then groups in order of first appearance.
		out.sort((a, b) => (a.name === null ? -1 : b.name === null ? 1 : 0));
		let i = 0;
		for (const g of out) for (const item of g.items) item.index = i++;
		return out;
	});
	const flat = $derived(groups.flatMap((g) => g.items.map((it) => it.preset)));
	const selectedIndex = $derived(flat.findIndex((p) => p.id === selected));

	function position() {
		if (!trigger) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		if (vw < 560) {
			place = { sheet: true, style: '' };
			return;
		}
		const r = trigger.getBoundingClientRect();
		const width = Math.min(420, vw - 32);
		const rawLeft = align === 'end' ? r.right - width : r.left;
		const left = Math.max(16, Math.min(rawLeft, vw - width - 16));
		const below = vh - r.bottom - 16;
		const above = r.top - 16;
		const style =
			below >= 280 || below >= above
				? `top: ${r.bottom + 6}px; max-height: ${Math.min(520, below - 6)}px;`
				: `bottom: ${vh - r.top + 6}px; max-height: ${Math.min(520, above - 6)}px;`;
		place = { sheet: false, style: `${style} left: ${left}px; width: ${width}px;` };
	}

	async function show(at?: number) {
		if (!flat.length) return;
		active = at ?? (selectedIndex >= 0 ? selectedIndex : 0);
		open = true;
		position();
		await tick();
		listbox?.focus({ preventScroll: true });
		reveal();
	}

	function hide(returnFocus = true) {
		if (!open) return;
		open = false;
		if (returnFocus) trigger?.focus();
	}

	function choose(i: number) {
		const preset = flat[i];
		if (!preset) return;
		hide();
		onselect(preset);
	}

	function reveal() {
		document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
	}

	let typed = '';
	let typedAt = 0;

	function typeahead(char: string) {
		const now = Date.now();
		typed = now - typedAt > 600 ? char : typed + char;
		typedAt = now;
		const n = flat.length;
		const startAt = typed.length === 1 ? active + 1 : active;
		for (let k = 0; k < n; k++) {
			const i = (startAt + k) % n;
			if (flat[i].label.toLowerCase().startsWith(typed.toLowerCase())) {
				active = i;
				reveal();
				return;
			}
		}
	}

	function onListKeydown(event: KeyboardEvent) {
		const n = flat.length;
		switch (event.key) {
			case 'ArrowDown':
				active = (active + 1) % n;
				break;
			case 'ArrowUp':
				active = (active - 1 + n) % n;
				break;
			case 'Home':
				active = 0;
				break;
			case 'End':
				active = n - 1;
				break;
			case 'PageDown':
				active = Math.min(n - 1, active + 5);
				break;
			case 'PageUp':
				active = Math.max(0, active - 5);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				choose(active);
				return;
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				hide();
				return;
			case 'Tab':
				hide(false);
				return;
			default:
				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
					event.preventDefault();
					typeahead(event.key);
				}
				return;
		}
		event.preventDefault();
		reveal();
	}

	function onTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			show();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			show(selectedIndex >= 0 ? selectedIndex : flat.length - 1);
		}
	}

	$effect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (popover?.contains(target) || trigger?.contains(target)) return;
			hide(false);
		};
		const onScroll = (e: Event) => {
			if (popover?.contains(e.target as Node)) return;
			position();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('resize', position);
		window.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', position);
			window.removeEventListener('scroll', onScroll, { capture: true });
		};
	});
</script>

<div class="preset-menu">
	<Button
		bind:element={trigger}
		{variant}
		{size}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listId : undefined}
		disabled={!presets.length}
		onclick={() => (open ? hide() : show())}
		onkeydown={onTriggerKeydown}
	>
		{#snippet icon()}<Icon name="list" size={16} />{/snippet}
		{label}
		<Icon name="chevron-down" size={14} class="chev" />
	</Button>

	{#if open}
		{#if place.sheet}<div class="backdrop" aria-hidden="true"></div>{/if}
		<div class={['popover', { sheet: place.sheet }]} style={place.style} bind:this={popover}>
			{#if place.sheet}
				<div class="sheet-head">
					<span class="sheet-title">{label}</span>
					<IconButton icon="x" label="Close" size="sm" onclick={() => hide()} />
				</div>
			{/if}
			<div
				bind:this={listbox}
				id={listId}
				class="list"
				role="listbox"
				tabindex="-1"
				aria-label={label}
				aria-activedescendant={optionId(active)}
				onkeydown={onListKeydown}
			>
				{#each groups as group, g (g)}
					<div
						class="group"
						role="group"
						aria-labelledby={group.name ? `${uid}-group-${g}` : undefined}
					>
						{#if group.name}
							<div class="group-label" id="{uid}-group-{g}" role="presentation">{group.name}</div>
						{/if}
						{#each group.items as { preset, index } (preset.id)}
							<!-- Keyboard selection is handled by the listbox (aria-activedescendant). -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								id={optionId(index)}
								class={['option', { active: index === active }]}
								role="option"
								aria-selected={index === active}
								tabindex="-1"
								onclick={() => choose(index)}
								onpointermove={() => (active = index)}
							>
								<div class="option-main">
									<span class={['option-label', { mono: monoLabels }]}>{preset.label}</span>
									{#if preset.id === selected}
										<span class="current"><Icon name="check" size={15} label="Current" /></span>
									{/if}
								</div>
								{#if preset.description}<div class="option-desc">{preset.description}</div>{/if}
								{#if preset.cite}<div class="option-cite">
										<CitationTag cite={preset.cite} />
									</div>{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.preset-menu {
		display: inline-flex;
	}
	.preset-menu :global(.chev) {
		margin-right: -4px;
		color: var(--text-3);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: var(--backdrop);
	}
	.popover {
		position: fixed;
		z-index: 91;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
	}
	.popover.sheet {
		left: 12px;
		right: 12px;
		bottom: 12px;
		max-height: min(75dvh, 560px);
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.sheet-title {
		font-family: var(--font-serif);
		font-weight: 600;
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--space-1) 0;
	}
	.list:focus {
		outline: none;
	}
	.group + .group {
		margin-top: var(--space-1);
		padding-top: var(--space-1);
		border-top: 1px solid var(--border);
	}
	.group-label {
		padding: var(--space-2) var(--space-4) var(--space-1);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.option {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin: 0 var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		cursor: pointer;
	}
	.option.active {
		background: var(--accent-soft);
	}
	.list:focus-visible .option.active {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.option-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.option-label {
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.option-label.mono {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-weight: 400;
	}
	.current {
		display: flex;
		color: var(--accent);
	}
	.option-desc {
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.45;
	}
	.option-cite {
		display: flex;
		margin-top: 2px;
	}
</style>
