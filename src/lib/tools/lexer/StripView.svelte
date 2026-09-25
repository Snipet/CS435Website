<!--
	The Strip first tab (Lexical Analysis, slide 12): delete every lexeme of a
	dropped rule, scan what is left, and compare with scanning as written.
-->
<script lang="ts">
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import TokenPairs from '$lib/components/ui/TokenPairs.svelte';
	import type { HighlightRange } from '$lib/components/ui/types';
	import type { TokenFormat } from '$lib/components/ui/token-format';
	import type { ScanToken } from '$lib/theory/automata';
	import { formatString } from '$lib/theory/chars';
	import { runScan, type LexRun } from './scan';
	import type { LexSpec } from './spec';
	import { MAX_DIFF_TOKENS, describeDiff, diffTokens, stripDropped } from './strip';

	interface Props {
		spec: LexSpec;
		run: LexRun;
		errorRule: boolean;
		format: TokenFormat;
		showDropped: boolean;
		strip: boolean;
	}

	let { spec, run, errorRule, format, showDropped, strip = $bindable() }: Props = $props();

	const uid = $props.id();

	const dropped = $derived(spec.rules.filter((r) => r.drop));
	const droppedNames = $derived(dropped.map((r) => r.name));
	const stripped = $derived(stripDropped(run));
	const again = $derived(strip ? runScan(spec, stripped.text, errorRule) : null);
	const diff = $derived(
		again && run.tokens.length <= MAX_DIFF_TOKENS && again.tokens.length <= MAX_DIFF_TOKENS
			? diffTokens(run.tokens, again.tokens)
			: null
	);

	function highlights(
		tokens: readonly ScanToken[],
		changed: boolean[] | undefined
	): HighlightRange[] {
		return tokens.flatMap((t, i): HighlightRange[] =>
			t.skipped
				? []
				: [
						{
							start: t.start,
							end: t.end,
							tone: changed?.[i] ? 'active' : t.error ? 'reject' : 'muted',
							label: t.name
						}
					]
		);
	}

	const listNames = (names: string[]) =>
		names.length <= 2
			? names.join(' and ')
			: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
</script>

<div class="strip">
	<Toggle
		bind:checked={strip}
		label="Remove whitespace and comments before scanning"
		description={dropped.length
			? `Deletes every lexeme of ${listNames(droppedNames)} (the dropped rule${dropped.length === 1 ? '' : 's'}), then scans what is left.`
			: 'No rule is dropped, so there is nothing to remove.'}
		disabled={dropped.length === 0}
	/>

	{#if strip && again && dropped.length}
		<div class="compare">
			<section class="side" aria-labelledby="{uid}-written">
				<h3 id="{uid}-written">Scanned as written</h3>
				<div class="stream">
					<CharStream text={run.text} highlights={highlights(run.tokens, diff?.changedA)} />
				</div>
				<TokenPairs
					tokens={run.tokens}
					{format}
					showSkipped={showDropped}
					ariaLabel="Tokens, scanned as written"
				/>
			</section>
			<section class="side" aria-labelledby="{uid}-first">
				<h3 id="{uid}-first">Stripped first</h3>
				<div class="stream">
					<CharStream
						text={stripped.text}
						highlights={highlights(again.tokens, diff?.changedB)}
						ariaLabel="Input after stripping: {formatString(stripped.text)}"
					/>
				</div>
				<TokenPairs
					tokens={again.tokens}
					{format}
					showSkipped={showDropped}
					ariaLabel="Tokens, stripped first"
				/>
				{#if again.stuck !== null}
					<p class="stuck">Stuck at position {again.stuck} of the stripped text.</p>
				{/if}
			</section>
		</div>
		<p class={['verdict', { same: diff?.same }]} aria-live="polite">
			{#if diff}
				{describeDiff(run.tokens, again.tokens, diff, format)}
			{:else}
				Too many tokens to compare.
			{/if}
		</p>
	{:else if dropped.length}
		<p class="hint">
			Turn on the switch to scan the input with the lexemes of {listNames(droppedNames)} removed first,
			next to the scan as written.
		</p>
	{/if}
</div>

<style>
	.strip {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.compare {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 800px) {
		.compare {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
	}
	.stream {
		min-width: 0;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
	}
	.verdict {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--active);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.verdict.same {
		border-left-color: var(--accept);
		font-family: var(--font-sans);
	}
	.hint,
	.stuck {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
