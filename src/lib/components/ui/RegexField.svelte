<script lang="ts" module>
	export type PaletteSymbol = string | { insert: string; label?: string; title?: string };

	export const DEFAULT_SYMBOLS: readonly PaletteSymbol[] = [
		'ε',
		'ɸ',
		'Σ',
		'|',
		'*',
		'+',
		'?',
		'(',
		')',
		"'"
	];

	const TITLES: Record<string, string> = {
		ε: 'Epsilon, the empty string (type \\e)',
		ɸ: 'Empty language (type \\p)',
		Σ: 'Any symbol of the alphabet (type \\S)',
		'|': 'Choice',
		'*': 'Iteration (Kleene closure)',
		'+': 'Positive closure',
		'?': 'Optional',
		'(': 'Open group',
		')': 'Close group',
		"'": 'Quote a literal'
	};
</script>

<script lang="ts">
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { summarizeDiagnostics } from './diagnostic-summary';
	import Icon from './Icon.svelte';
	import ProblemStatus from './ProblemStatus.svelte';
	import { applyAliases, DEFAULT_ALIASES } from './regex-aliases';

	interface Props {
		value?: string;
		label?: string;
		/** Accessible name when there is no visible label. */
		ariaLabel?: string;
		placeholder?: string;
		/** Palette buttons; each inserts its text at the caret. */
		symbols?: readonly PaletteSymbol[];
		/** Typed aliases converted on input (default \e → ε, \p → ɸ, \S → Σ); false disables. */
		aliases?: Readonly<Record<string, string>> | false;
		diagnostics?: readonly Diagnostic[];
		/** Spans with this `source` index into `value` and get an excerpt (default null). */
		source?: string | null;
		size?: 'md' | 'lg';
		disabled?: boolean;
		id?: string;
		element?: HTMLInputElement;
		oninput?: (value: string) => void;
		/** Called with the value when Enter is pressed. */
		onsubmit?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		label,
		ariaLabel,
		placeholder,
		symbols = DEFAULT_SYMBOLS,
		aliases = DEFAULT_ALIASES,
		diagnostics = [],
		source = null,
		size = 'lg',
		disabled = false,
		id,
		element = $bindable(),
		oninput,
		onsubmit
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `regex-${uid}`);
	const hasError = $derived(diagnostics.some((d) => d.severity === 'error'));
	const items = $derived(
		symbols.map((s) =>
			typeof s === 'string'
				? { insert: s, label: s, title: TITLES[s] ?? `Insert ${s}` }
				: { insert: s.insert, label: s.label ?? s.insert, title: s.title ?? `Insert ${s.insert}` }
		)
	);

	// The caret when the field last had focus, and the text it belongs to. The
	// palette inserts there; after an outside change (a preset) it appends.
	let lastSelection: { start: number; end: number; text: string } | null = null;
	let focusIndex = $state(0);
	const paletteButtons: HTMLButtonElement[] = $state([]);

	function remember() {
		if (!element) return;
		lastSelection = {
			start: element.selectionStart ?? value.length,
			end: element.selectionEnd ?? value.length,
			text: value
		};
	}

	/** Where a palette symbol goes when the field is not focused. */
	function savedSelection(): { start: number; end: number } {
		if (lastSelection && lastSelection.text === value) return lastSelection;
		return { start: value.length, end: value.length };
	}

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const el = event.currentTarget;
		let next = el.value;
		if (aliases) {
			const result = applyAliases(next, el.selectionStart ?? next.length, aliases);
			if (result.changed) {
				next = result.text;
				el.value = next;
				el.setSelectionRange(result.caret, result.caret);
			}
		}
		value = next;
		remember();
		oninput?.(next);
	}

	function insert(text: string) {
		const el = element;
		if (!el || disabled) return;
		const focused = document.activeElement === el;
		const saved = savedSelection();
		const start = focused ? (el.selectionStart ?? value.length) : saved.start;
		const end = focused ? (el.selectionEnd ?? value.length) : saved.end;
		el.focus();
		el.setSelectionRange(start, end);
		// execCommand keeps native undo and fires `input`; fall back to a direct edit.
		if (document.execCommand?.('insertText', false, text)) return;
		const next = value.slice(0, start) + text + value.slice(end);
		value = next;
		el.value = next;
		el.setSelectionRange(start + text.length, start + text.length);
		remember();
		oninput?.(next);
	}

	function paletteKeydown(event: KeyboardEvent) {
		const n = items.length;
		let next: number;
		if (event.key === 'ArrowRight') next = (focusIndex + 1) % n;
		else if (event.key === 'ArrowLeft') next = (focusIndex - 1 + n) % n;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = n - 1;
		else return;
		event.preventDefault();
		focusIndex = next;
		paletteButtons[next]?.focus();
	}

	interface Excerpt {
		before: string;
		mark: string;
		after: string;
	}

	function excerpt(d: Diagnostic): Excerpt | null {
		if (!d.span || d.span.source !== source) return null;
		const start = Math.max(0, Math.min(d.span.start, value.length));
		const end = Math.max(start, Math.min(d.span.end, value.length));
		const context = 24;
		const from = Math.max(0, start - context);
		const to = Math.min(value.length, end + context);
		return {
			before: (from > 0 ? '…' : '') + value.slice(from, start),
			mark: value.slice(start, end),
			after: value.slice(end, to) + (to < value.length ? '…' : '')
		};
	}

	function select(d: Diagnostic) {
		if (!element || !d.span) return;
		element.focus();
		element.setSelectionRange(
			Math.min(d.span.start, value.length),
			Math.min(Math.max(d.span.end, d.span.start), value.length)
		);
	}
</script>

<div class={['regex-field', size, { invalid: hasError, disabled }]}>
	{#if label}<label class="label" for={inputId}>{label}</label>{/if}
	<input
		bind:this={element}
		id={inputId}
		class="input"
		type="text"
		{value}
		{placeholder}
		{disabled}
		aria-label={label ? undefined : ariaLabel}
		aria-invalid={hasError ? 'true' : undefined}
		aria-describedby={diagnostics.length ? `${uid}-diags` : undefined}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
		autocorrect="off"
		oninput={handleInput}
		onblur={remember}
		onselect={remember}
		onkeyup={remember}
		onkeydown={(e) => {
			if (e.key === 'Enter' && !e.isComposing && onsubmit) {
				e.preventDefault();
				onsubmit(value);
			}
		}}
	/>
	{#if items.length}
		<div class="palette" role="toolbar" aria-label="Insert symbol" aria-controls={inputId}>
			{#each items as item, i (i)}
				<button
					bind:this={paletteButtons[i]}
					type="button"
					class="sym"
					tabindex={i === focusIndex ? 0 : -1}
					title={item.title}
					aria-label="Insert {item.label}"
					{disabled}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => insert(item.insert)}
					onkeydown={paletteKeydown}
					onfocus={() => (focusIndex = i)}>{item.label}</button
				>
			{/each}
		</div>
	{/if}
	<ProblemStatus summary={summarizeDiagnostics(diagnostics)} />
	{#if diagnostics.length}
		<ul class="diags" id="{uid}-diags">
			{#each diagnostics as d, i (i)}
				{@const ex = excerpt(d)}
				<li class="sev-{d.severity}">
					<Icon
						name={d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info'}
						size={15}
						label={d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Warning' : 'Note'}
					/>
					<div class="diag">
						<span class="msg">{d.message}</span>
						{#if ex}
							<button
								type="button"
								class="excerpt"
								title="Select in the field"
								aria-label="Select the problem in the field"
								onclick={() => select(d)}
								><span>{ex.before}</span><mark class={{ point: ex.mark === '' }}>{ex.mark}</mark
								><span>{ex.after}</span></button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.regex-field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-2);
	}
	.input {
		width: 100%;
		min-width: 0;
		padding: 0 14px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-feature-settings: normal;
		transition: border-color var(--duration) var(--ease);
	}
	.lg .input {
		height: 48px;
		font-size: 1.125rem;
	}
	.md .input {
		height: 38px;
		font-size: 0.9375rem;
		padding: 0 12px;
	}
	.input::placeholder {
		color: var(--text-3);
	}
	.input:hover {
		border-color: var(--text-3);
	}
	.input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	.invalid .input {
		border-color: var(--reject);
	}
	.disabled {
		opacity: 0.55;
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.sym {
		display: grid;
		place-items: center;
		min-width: 32px;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.sym:hover {
		background: var(--surface-3);
		border-color: var(--border-strong);
	}
	.sym:active {
		transform: translateY(0.5px);
	}
	.sym:disabled {
		cursor: not-allowed;
	}
	.diags {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	.diags li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.diags li > :global(.icon) {
		margin-top: 3px;
	}
	.sev-error > :global(.icon) {
		color: var(--reject);
	}
	.sev-warning > :global(.icon) {
		color: var(--active);
	}
	.sev-info > :global(.icon) {
		color: var(--info);
	}
	.diag {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.excerpt {
		align-self: flex-start;
		max-width: 100%;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-ligatures: none;
		text-align: left;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		cursor: pointer;
	}
	.excerpt:hover {
		border-color: var(--border-strong);
	}
	mark {
		--m: var(--reject);
		padding: 1px 0;
		border-radius: 2px;
		background: color-mix(in srgb, var(--m) 18%, transparent);
		color: var(--text);
		text-decoration: underline wavy var(--m);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
		text-decoration-skip-ink: none;
	}
	.sev-warning mark {
		--m: var(--active);
	}
	.sev-info mark {
		--m: var(--info);
	}
	mark.point {
		display: inline-block;
		width: 2px;
		height: 1.1em;
		margin: 0 1px;
		padding: 0;
		vertical-align: text-bottom;
		background: var(--m);
		text-decoration: none;
	}
</style>
