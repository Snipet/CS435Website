<!--
	bison's precedence declarations, one per line, lowest precedence first
	(Bottom-up Parsing III, slide 19), and a switch per declaration line that
	turns it off (`//` in front) or on again.
-->
<script lang="ts">
	import { CodeEditor, Toggle } from '$lib/components/ui';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { toggleLine, type PrecedenceLine } from './precedence';
	import { highlightPrecedence, lineCaption } from './view';

	interface Props {
		value: string;
		lines: readonly PrecedenceLine[];
		diagnostics: readonly Diagnostic[];
		oninput?: (value: string) => void;
	}

	let { value = $bindable(), lines, diagnostics, oninput }: Props = $props();

	const uid = $props.id();
	const PLACEHOLDER = "%left '+'\n%left '*'";
	const levels = $derived(lines.filter((l) => l.on).length);

	function toggle(line: PrecedenceLine, on: boolean) {
		value = toggleLine(value, line.line, on);
		oninput?.(value);
	}
</script>

<div class="precedence">
	<CodeEditor
		label="Precedence declarations"
		language="bison"
		bind:value
		{oninput}
		{diagnostics}
		highlight={highlightPrecedence}
		minRows={2}
		maxRows={8}
		placeholder={PLACEHOLDER}
		tabInserts={false}
	/>
	<p class="hint" id="{uid}-hint">
		One per line, lowest precedence first: a later line binds tighter. <code>%left</code>,
		<code>%right</code> or <code>%nonassoc</code>, then the terminals:
		<code>'+'</code> or <code>then</code>.
	</p>
	{#if lines.length}
		<ul class="lines" aria-label="Declaration lines" aria-describedby="{uid}-hint">
			{#each lines as line (line.line)}
				<li>
					<Toggle
						checked={line.on}
						onchange={(on) => toggle(line, on)}
						description="line {line.line + 1}, {lineCaption(line, levels)}"
					>
						<span class="decl">{line.text}</span>
					</Toggle>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.precedence {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	code,
	.decl {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.lines {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
