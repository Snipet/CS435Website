<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { summarizeDiagnostics } from './diagnostic-summary';
	import Icon from './Icon.svelte';
	import ProblemStatus from './ProblemStatus.svelte';
	import { layoutLines, lineCol, lineIndexAt, lineStarts } from './editor-lines';
	import type { HighlightToken } from './types';

	interface Props {
		value?: string;
		/** Visible label above the editor; otherwise pass `ariaLabel`. */
		label?: string;
		ariaLabel?: string;
		/** Language hint for highlighters and styling (`data-language`). */
		language?: string;
		/** Token coloring; return ranges with global `hl-*` classes. Keep it fast. */
		highlight?: (text: string) => HighlightToken[];
		/** Problems to underline and list; span offsets index into `value`. */
		diagnostics?: readonly Diagnostic[];
		/**
		 * Only underline spans whose `span.source` equals this (e.g. `null` for the
		 * main text). When omitted every span is drawn. All messages are listed.
		 */
		source?: string | null;
		readonly?: boolean;
		minRows?: number;
		maxRows?: number;
		/** Soft-wrap long lines (default) or scroll horizontally. */
		wrap?: boolean;
		lineNumbers?: boolean;
		/** Tab inserts a tab character (Esc, then Tab, moves focus on). */
		tabInserts?: boolean;
		placeholder?: string;
		id?: string;
		/** The textarea, for focusing. */
		element?: HTMLTextAreaElement;
		oninput?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		label,
		ariaLabel,
		language,
		highlight,
		diagnostics = [],
		source,
		readonly = false,
		minRows = 4,
		maxRows = 16,
		wrap = true,
		lineNumbers = true,
		tabInserts = true,
		placeholder,
		id,
		element = $bindable(),
		oninput
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `editor-${uid}`);

	let mirror: HTMLDivElement | undefined = $state();
	let escapeArmed = false;

	const drawn = $derived(
		source === undefined ? diagnostics : diagnostics.filter((d) => d.span?.source === source)
	);
	const tokens = $derived(highlight ? highlight(value) : []);
	const lines = $derived(layoutLines(value, tokens, drawn));
	const digits = $derived(Math.max(2, String(lines.length).length));
	const hasError = $derived(diagnostics.some((d) => d.severity === 'error'));
	const located = $derived(new Set(drawn));

	function location(d: Diagnostic): string | null {
		if (!d.span || !located.has(d)) return null;
		const { line, col } = lineCol(value, d.span.start);
		return `Line ${line}, col ${col}`;
	}
	const summary = $derived(
		summarizeDiagnostics(diagnostics, (d) =>
			d.span && located.has(d) ? `line ${lineCol(value, d.span.start).line}` : null
		)
	);

	async function insertText(text: string) {
		const ta = element;
		if (!ta) return;
		// execCommand keeps the browser's undo stack intact; fall back if unsupported.
		if (document.execCommand?.('insertText', false, text)) return;
		const start = ta.selectionStart;
		value = value.slice(0, start) + text + value.slice(ta.selectionEnd);
		oninput?.(value);
		await tick();
		ta.setSelectionRange(start + text.length, start + text.length);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			escapeArmed = true;
			return;
		}
		if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
		const plainTab =
			event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
		if (plainTab && tabInserts && !readonly && !escapeArmed) {
			event.preventDefault();
			insertText('\t');
		}
		escapeArmed = false;
	}

	/** Selects a diagnostic's span in the textarea and scrolls it into view. */
	function reveal(d: Diagnostic) {
		const ta = element;
		if (!ta || !d.span) return;
		const start = Math.min(d.span.start, value.length);
		const end = Math.min(Math.max(d.span.end, start), value.length);
		ta.focus({ preventScroll: true });
		ta.setSelectionRange(start, end);
		const row = mirror?.querySelectorAll('.lt:not(.pad)')[lineIndexAt(lineStarts(value), start)];
		row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
</script>

<div
	class={['code-editor', { invalid: hasError, readonly, nowrap: !wrap }]}
	style="--min-rows: {minRows}; --max-rows: {maxRows}; --digits: {lineNumbers ? digits : 0};"
	data-language={language}
>
	{#if label}
		<div class="head">
			<label class="label" for={inputId}>{label}</label>
			{#if tabInserts && !readonly}<span class="hint" aria-hidden="true">Esc, Tab to leave</span
				>{/if}
		</div>
	{/if}
	<div class="frame">
		<div class={['scroller', { gutter: lineNumbers }]}>
			<div class={['grid', { gutter: lineNumbers }]}>
				<div class="mirror" aria-hidden="true" bind:this={mirror}>
					{#if lineNumbers}<span class="ln pad"></span>{/if}<span class="lt pad"></span>
					{#each lines as line (line.number)}
						{#if lineNumbers}
							<span
								class={['ln', line.severity && `sev-${line.severity}`]}
								title={line.messages.join('\n') || undefined}>{line.number}</span
							>
						{/if}
						<span class="lt"
							>{#each line.segments as seg, i (i)}{#if seg.point}<span class="pt sev-{seg.severity}"
									></span>{:else if seg.className || seg.severity}<span
										class={[seg.className, seg.severity && `sev-${seg.severity}`]}>{seg.text}</span
									>{:else}{seg.text}{/if}{/each}</span
						>
					{/each}
					{#if lineNumbers}<span class="ln pad"></span>{/if}<span class="lt pad"></span>
				</div>
				<textarea
					bind:this={element}
					bind:value
					id={inputId}
					aria-label={label ? undefined : ariaLabel}
					aria-invalid={hasError ? 'true' : undefined}
					aria-describedby="{uid}-hint{diagnostics.length ? ` ${uid}-diags` : ''}"
					{placeholder}
					{readonly}
					wrap={wrap ? 'soft' : 'off'}
					spellcheck="false"
					autocapitalize="off"
					autocomplete="off"
					{onkeydown}
					onfocus={() => (escapeArmed = false)}
					onblur={() => (escapeArmed = false)}
					oninput={() => oninput?.(value)}></textarea>
			</div>
		</div>
		<span class="visually-hidden" id="{uid}-hint"
			>{readonly
				? 'Read only.'
				: tabInserts
					? 'Tab inserts a tab. Press Escape, then Tab, to move focus out of the editor.'
					: ''}</span
		>
	</div>
	<ProblemStatus {summary} />
	{#if diagnostics.length}
		<ul class="diags" id="{uid}-diags">
			{#each diagnostics as d, i (i)}
				{@const where = location(d)}
				<li class="sev-{d.severity}">
					<Icon
						name={d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info'}
						size={15}
						label={d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Warning' : 'Note'}
					/>
					{#if where}
						<button type="button" class="diag-link" onclick={() => reveal(d)}>
							<span class="msg">{d.message}</span>
							<span class="loc">{where}</span>
						</button>
					{:else}
						<span class="msg">{d.message}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.code-editor {
		--lh: 1.375rem;
		--pad-y: 10px;
		--pad-x: 12px;
		--gutter-bg: var(--surface-2);
		/* rem, not ch: the gutter width is used in elements with different fonts. */
		--gutter-w: calc(var(--digits) * 0.5rem + 20px);
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-2);
	}
	.frame {
		position: relative;
		min-width: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		transition: border-color var(--duration) var(--ease);
	}
	.frame:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	.invalid .frame {
		border-color: var(--reject);
	}
	.scroller {
		max-height: calc(var(--max-rows) * var(--lh) + 2 * var(--pad-y));
		overflow: auto;
		border-radius: inherit;
		overscroll-behavior: contain;
	}
	/* The gutter strip is the scroller's own (non-scrolling) background. */
	.scroller.gutter {
		background: linear-gradient(
			to right,
			var(--gutter-bg) calc(var(--gutter-w) - 1px),
			var(--border) calc(var(--gutter-w) - 1px) var(--gutter-w),
			transparent var(--gutter-w)
		);
	}
	.grid,
	textarea {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		line-height: var(--lh);
		font-variant-ligatures: none;
		font-feature-settings: normal;
		letter-spacing: 0;
		tab-size: 4;
	}
	.grid {
		position: relative;
		min-height: calc(var(--min-rows) * var(--lh) + 2 * var(--pad-y));
	}
	.nowrap .grid {
		width: max-content;
		min-width: 100%;
	}
	.mirror {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		color: var(--text);
	}
	.gutter .mirror {
		grid-template-columns: var(--gutter-w) minmax(0, 1fr);
	}
	.nowrap .mirror {
		grid-template-columns: minmax(max-content, 1fr);
	}
	.nowrap .gutter .mirror {
		grid-template-columns: var(--gutter-w) minmax(max-content, 1fr);
	}
	.lt {
		min-height: var(--lh);
		padding: 0 var(--pad-x);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.nowrap .lt {
		white-space: pre;
		overflow-wrap: normal;
	}
	.pad {
		min-height: var(--pad-y);
		height: var(--pad-y);
	}
	.ln {
		position: sticky;
		left: 0;
		z-index: 2;
		padding: 0 10px 0 8px;
		border-right: 1px solid var(--border);
		background: var(--gutter-bg);
		color: var(--text-3);
		font-size: 0.75rem;
		text-align: right;
		user-select: none;
		font-variant-numeric: tabular-nums;
	}
	.ln.sev-error {
		color: var(--reject);
		background: color-mix(in srgb, var(--reject) 12%, var(--gutter-bg));
		font-weight: 600;
	}
	.ln.sev-warning {
		color: var(--active);
		background: color-mix(in srgb, var(--active) 12%, var(--gutter-bg));
	}
	.ln.sev-info {
		color: var(--info);
	}
	.lt .sev-error {
		text-decoration: underline wavy var(--reject);
		background: color-mix(in srgb, var(--reject) 12%, transparent);
	}
	.lt .sev-warning {
		text-decoration: underline wavy var(--active);
		background: color-mix(in srgb, var(--active) 12%, transparent);
	}
	.lt .sev-info {
		text-decoration: underline dotted var(--info);
	}
	.lt .sev-error,
	.lt .sev-warning,
	.lt .sev-info {
		text-decoration-thickness: 1px;
		text-underline-offset: 4px;
		text-decoration-skip-ink: none;
	}
	.pt {
		position: relative;
		display: inline-block;
		width: 0;
		height: 0;
		background: none;
		text-decoration: none;
	}
	.pt::before {
		content: '';
		position: absolute;
		left: -4px;
		top: 4px;
		border: 4px solid transparent;
		border-bottom: 5px solid var(--pt-color, var(--reject));
	}
	.pt.sev-warning {
		--pt-color: var(--active);
	}
	.pt.sev-info {
		--pt-color: var(--info);
	}
	textarea {
		position: absolute;
		inset: 0 0 0 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: var(--pad-y) var(--pad-x);
		border: 0;
		background: transparent;
		color: transparent;
		-webkit-text-fill-color: transparent;
		caret-color: var(--text);
		resize: none;
		overflow: hidden;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		outline: none;
	}
	.gutter textarea {
		left: var(--gutter-w);
		width: calc(100% - var(--gutter-w));
	}
	.nowrap textarea {
		white-space: pre;
		overflow-wrap: normal;
	}
	textarea::placeholder {
		color: var(--text-3);
		-webkit-text-fill-color: var(--text-3);
		opacity: 1;
	}
	textarea::selection {
		background: color-mix(in srgb, var(--accent) 30%, transparent);
		-webkit-text-fill-color: transparent;
	}
	.readonly textarea {
		caret-color: transparent;
	}
	.readonly .frame {
		background: var(--surface-2);
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--text-3);
		opacity: 0;
		transition: opacity var(--duration) var(--ease);
	}
	.code-editor:focus-within .hint {
		opacity: 1;
	}
	.diags {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 2px 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
	.diags li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 2px 0;
		color: var(--text);
	}
	.diags li :global(.icon) {
		margin-top: 3px;
	}
	.diags .sev-error :global(.icon) {
		color: var(--reject);
	}
	.diags .sev-warning :global(.icon) {
		color: var(--active);
	}
	.diags .sev-info :global(.icon) {
		color: var(--info);
	}
	.diag-link {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.diag-link:hover .msg {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.loc {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
