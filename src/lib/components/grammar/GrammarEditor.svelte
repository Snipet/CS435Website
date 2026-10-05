<!--
	CodeEditor for grammar text (docs/ARCHITECTURE.md §3.10): a palette for the
	symbols that are not on a keyboard, `->` turned into `→` while typing, and
	coloring of non-terminals, terminals and metasymbols.
-->
<script lang="ts" module>
	interface PaletteItem {
		insert: string;
		name: string;
		title: string;
	}

	const SYMBOLS: readonly PaletteItem[] = [
		{ insert: '→', name: 'arrow', title: 'Production arrow (or type ->)' },
		{ insert: '|', name: 'bar', title: 'Separates alternatives' },
		{ insert: 'ε', name: 'epsilon', title: 'Epsilon, the empty right-hand side (or type epsilon)' }
	];
	const EBNF_SYMBOLS: readonly PaletteItem[] = [
		{ insert: '{', name: 'opening brace', title: 'Opens a repetition: zero or more' },
		{ insert: '}', name: 'closing brace', title: 'Closes a repetition' },
		{ insert: '[', name: 'opening bracket', title: 'Opens an option: zero or one' },
		{ insert: ']', name: 'closing bracket', title: 'Closes an option' }
	];
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import CodeEditor from '$lib/components/ui/CodeEditor.svelte';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { createGrammarInput } from './grammar-input';
	import { highlightGrammar } from './grammar-text';

	interface Props {
		value?: string;
		/** Visible label above the editor; otherwise pass `ariaLabel`. */
		label?: string;
		ariaLabel?: string;
		/**
		 * N and T of the grammar parsed from `value`, for the coloring. A symbol in
		 * neither list is a non-terminal when the text has it on a left-hand side.
		 */
		nonterminals?: readonly string[];
		terminals?: readonly string[];
		/** EBNF: `{ } [ ]` are metasymbols and get palette buttons. */
		ebnf?: boolean;
		/** Problems to underline and list; span offsets index into `value`. */
		diagnostics?: readonly Diagnostic[];
		/** Only underline spans with this `span.source` (see CodeEditor). */
		source?: string | null;
		minRows?: number;
		maxRows?: number;
		readonly?: boolean;
		placeholder?: string;
		id?: string;
		/** The textarea, for focusing. */
		element?: HTMLTextAreaElement;
		oninput?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		label,
		ariaLabel = 'Grammar',
		nonterminals,
		terminals,
		ebnf = false,
		diagnostics = [],
		source,
		minRows = 4,
		maxRows,
		readonly = false,
		placeholder,
		id,
		element = $bindable(),
		oninput
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `grammar-${uid}`);
	const items = $derived(ebnf ? [...SYMBOLS, ...EBNF_SYMBOLS] : SYMBOLS);

	// Called by CodeEditor while it renders, so it follows the lists and `ebnf`.
	const highlight = (text: string) => highlightGrammar(text, { nonterminals, terminals, ebnf });

	// The palette and the `->` conversion (see grammar-input.ts).
	const editing = createGrammarInput({
		field: () => element,
		// execCommand keeps the browser's undo stack; each call fires `input`.
		insertText: (text) =>
			typeof document.execCommand === 'function' && document.execCommand('insertText', false, text),
		setText: async (text) => {
			value = text;
			await tick();
		},
		readonly: () => readonly,
		ebnf: () => ebnf,
		oninput: (text) => oninput?.(text)
	});

	$effect(() => {
		const ta = element;
		if (!ta) return;
		// Capturing, so it runs before CodeEditor's own handler calls `editing.input`.
		const note = (event: Event) => editing.note(event as InputEvent);
		ta.addEventListener('input', note, true);
		return () => ta.removeEventListener('input', note, true);
	});

	let focusIndex = $state(0);
	const buttons: HTMLButtonElement[] = $state([]);

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
		buttons[next]?.focus();
	}
</script>

<div class="grammar-editor">
	{#if label || !readonly}
		<div class="head">
			{#if label}<label class="label" for={inputId}>{label}</label>{/if}
			{#if !readonly}
				<div class="palette" role="toolbar" aria-label="Insert symbol" aria-controls={inputId}>
					{#each items as item, i (item.insert)}
						<button
							bind:this={buttons[i]}
							type="button"
							class="sym"
							tabindex={i === Math.min(focusIndex, items.length - 1) ? 0 : -1}
							title={item.title}
							aria-label="Insert {item.insert} ({item.name})"
							onmousedown={(event) => event.preventDefault()}
							onclick={() => editing.insert(item.insert)}
							onkeydown={paletteKeydown}
							onfocus={() => (focusIndex = i)}>{item.insert}</button
						>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
	<CodeEditor
		bind:value
		bind:element
		id={inputId}
		ariaLabel={label ? undefined : ariaLabel}
		language={ebnf ? 'ebnf' : 'grammar'}
		{highlight}
		{diagnostics}
		{source}
		{readonly}
		{minRows}
		{maxRows}
		{placeholder}
		tabInserts={false}
		oninput={editing.input}
	/>
</div>

<style>
	.grammar-editor {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px var(--space-3);
	}
	.label {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-left: auto;
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
</style>
