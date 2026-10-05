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
	import {
		convertArrows,
		highlightGrammar,
		paletteInsertion,
		type ArrowConversion
	} from './grammar-text';

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

	// What the last edit was. Undo and redo are not rewritten (undoing a
	// conversion would convert again), nor is text an input method is composing.
	let lastEdit = { history: false, composing: false };
	$effect(() => {
		const ta = element;
		if (!ta) return;
		// Capturing, so it runs before CodeEditor's own handler calls `handleInput`.
		const note = (event: Event) => {
			const e = event as InputEvent;
			lastEdit = {
				history: (e.inputType ?? '').startsWith('history'),
				composing: e.isComposing === true
			};
		};
		ta.addEventListener('input', note, true);
		return () => ta.removeEventListener('input', note, true);
	});

	let converting = false;

	/** Replaces each `->` in the textarea and puts the caret back where it was. */
	async function applyArrows(ta: HTMLTextAreaElement, result: ArrowConversion) {
		// execCommand keeps the browser's undo stack; each call fires `input`.
		let native = typeof document.execCommand === 'function';
		for (let k = result.ranges.length - 1; k >= 0 && native; k--) {
			ta.setSelectionRange(result.ranges[k].start, result.ranges[k].end);
			native = document.execCommand('insertText', false, '→');
		}
		if (ta.value !== result.text) {
			value = result.text;
			await tick();
		}
		ta.setSelectionRange(result.caret, result.caret);
	}

	async function handleInput(next: string) {
		if (converting) return;
		const ta = element;
		if (ta && !readonly && !lastEdit.history && !lastEdit.composing) {
			const result = convertArrows(next, ta.selectionStart ?? next.length, { ebnf });
			if (result.changed) {
				converting = true;
				try {
					await applyArrows(ta, result);
				} finally {
					converting = false;
				}
				oninput?.(value);
				return;
			}
		}
		oninput?.(next);
	}

	async function insert(symbol: string) {
		const ta = element;
		if (!ta || readonly) return;
		const start = ta.selectionStart ?? value.length;
		const end = ta.selectionEnd ?? start;
		const text = paletteInsertion(symbol, value, start, end);
		ta.focus();
		ta.setSelectionRange(start, end);
		if (document.execCommand?.('insertText', false, text)) return;
		value = value.slice(0, start) + text + value.slice(end);
		oninput?.(value);
		await tick();
		ta.setSelectionRange(start + text.length, start + text.length);
	}

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
							onclick={() => insert(item.insert)}
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
		oninput={handleInput}
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
