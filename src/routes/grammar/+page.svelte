<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { GrammarEditor } from '$lib/components/grammar';
	import { CitationTag, Icon, Panel, PresetMenu, ToolPage, WorkerTask } from '$lib/components/ui';
	import { hasErrors } from '$lib/theory/diagnostics';
	import {
		parseGrammar,
		printSymbols,
		sentenceLengths,
		tokenizeInput,
		type Grammar
	} from '$lib/theory/grammar';
	import { tool } from '$lib/tools/catalog/grammar';
	import { chainOf, symbolText } from '$lib/tools/grammar/builder';
	import ChomskyStrip from '$lib/tools/grammar/ChomskyStrip.svelte';
	import DerivationBuilder from '$lib/tools/grammar/DerivationBuilder.svelte';
	import FourTuple from '$lib/tools/grammar/FourTuple.svelte';
	import LanguagePanel from '$lib/tools/grammar/LanguagePanel.svelte';
	import MembershipPanel from '$lib/tools/grammar/MembershipPanel.svelte';
	import {
		activePreset,
		applyPreset,
		DEFAULT_PRESET_ID,
		presetById,
		presets,
		type GrammarPreset,
		type SlideQuestion
	} from '$lib/tools/grammar/presets';
	import { freshSeed, randomSentence } from '$lib/tools/grammar/random';
	import { regularNfa } from '$lib/tools/grammar/regular';
	import SlideNotes from '$lib/tools/grammar/SlideNotes.svelte';
	import {
		blankState,
		isGrammarHash,
		stateFromHash,
		type GrammarHash,
		type GrammarToolState,
		type StepPair
	} from '$lib/tools/grammar/state';
	import TestStrings from '$lib/tools/grammar/TestStrings.svelte';
	import { chomskyOf, tupleOf } from '$lib/tools/grammar/tuple';
	import {
		computeCheck,
		computeLanguage,
		failureText,
		testRows,
		type CheckRequest,
		type CheckView,
		type LanguageRequest,
		type LanguageView
	} from '$lib/tools/grammar/views';
	import { createViewsWorker } from '$lib/tools/grammar/worker';
	import { toolLink } from '$lib/tools/links';
	import { syncToHash } from '$lib/url-state';

	const initial = applyPreset(presetById(DEFAULT_PRESET_ID)!, blankState());
	let model = $state<GrammarToolState>(initial);

	/** The last grammar without errors: the views keep showing it, dimmed, while the text has errors. */
	let lastGood: { text: string; grammar: Grammar } | null = null;

	syncToHash<GrammarHash>(() => model, {
		validate: isGrammarHash,
		onLoad: (value) => {
			// A link starts afresh: no fallback to a grammar it does not describe.
			if (value.grammar !== model.grammar) lastGood = null;
			Object.assign(model, stateFromHash(value));
		}
	});

	function load(preset: GrammarPreset) {
		if (preset.value.grammar !== model.grammar) lastGood = null;
		Object.assign(model, applyPreset(preset, model));
	}

	// ---- The grammar -----------------------------------------------------------
	// Parsing and everything read off the productions is cheap and follows every
	// keystroke. Membership and the sentences of L(G) run the Earley parser and
	// are computed in a worker (views.ts).

	const parsed = $derived(parseGrammar(model.grammar));
	const shown = $derived.by(() => {
		if (parsed.grammar) lastGood = { text: model.grammar, grammar: parsed.grammar };
		return lastGood;
	});
	const grammar = $derived(shown?.grammar ?? null);
	/** The text has errors and the views show an earlier grammar. */
	const stale = $derived(shown !== null && parsed.grammar === null);

	const tuple = $derived(grammar ? tupleOf(grammar) : null);
	const chomsky = $derived(grammar ? chomskyOf(grammar) : null);
	const nfa = $derived(grammar ? regularNfa(grammar) : null);
	const size = $derived.by(() => {
		const range = grammar ? sentenceLengths(grammar) : null;
		return range === null ? 'empty' : range.max === Infinity ? 'infinite' : 'finite';
	});
	const characters = $derived(!!grammar && grammar.terminals.every((t) => [...t].length === 1));
	/** A shortest sentence, for the placeholder of the token-string field. */
	const example = $derived.by(() => {
		const shortest = grammar ? randomSentence(grammar, 0, { maxDepth: 0 }) : null;
		return shortest?.ok && shortest.sentence.length > 0
			? `e.g. ${printSymbols(shortest.sentence)}`
			: undefined;
	});

	const preset = $derived(activePreset(model));
	const regexHref = (q: SlideQuestion) => (q.re ? toolLink('regex', { re: q.re }) : null);

	// ---- Token strings ---------------------------------------------------------

	const tokenize = (text: string) =>
		grammar ? tokenizeInput(text, grammar.terminals, { nonterminals: grammar.nonterminals }) : null;
	const inputTokens = $derived(tokenize(model.input));
	const testErrors = $derived(
		model.tests.map(
			(text) => tokenize(text)?.diagnostics.find((d) => d.severity === 'error')?.message ?? null
		)
	);

	const checkRequest = $derived<CheckRequest | null>(
		shown
			? { kind: 'check', grammar: shown.text, input: model.input, tests: [...model.tests] }
			: null
	);
	const checkTask = new WorkerTask<CheckRequest, CheckView>({
		compute: computeCheck,
		worker: createViewsWorker,
		// The default preset, computed at once so the prerendered page shows its results.
		initial: untrack(() => checkRequest) ?? undefined
	});
	$effect(() => {
		if (checkRequest) checkTask.run(checkRequest);
	});
	const checked = $derived(
		checkTask.output && checkTask.input
			? { input: checkTask.input, output: checkTask.output }
			: null
	);
	const membershipStale = $derived(
		!checked || checked.input.grammar !== shown?.text || checked.input.input !== model.input
	);
	const checkFailure = $derived(failureText(checkTask.status, checkTask.error));
	const rows = $derived(testRows(model.tests, shown?.text ?? '', checked));

	// ---- L(G) ------------------------------------------------------------------

	const languageRequest = $derived<LanguageRequest | null>(
		shown ? { kind: 'language', grammar: shown.text, maxLength: model.maxLength } : null
	);
	const languageTask = new WorkerTask<LanguageRequest, LanguageView>({
		compute: computeLanguage,
		worker: createViewsWorker,
		initial: untrack(() => languageRequest) ?? undefined
	});
	$effect(() => {
		if (languageRequest) languageTask.run(languageRequest);
	});
	const languageStale = $derived(
		!languageTask.input ||
			languageTask.input.grammar !== shown?.text ||
			languageTask.input.maxLength !== model.maxLength
	);
	const languageFailure = $derived(failureText(languageTask.status, languageTask.error));

	const random = $derived(
		grammar && model.seed !== null ? randomSentence(grammar, model.seed) : null
	);
	const randomChain = $derived(grammar && random?.ok ? chainOf(grammar, random.derivation) : null);

	// ---- Links -----------------------------------------------------------------

	const nfaHref = $derived.by(() => {
		if (!nfa?.ok) return null;
		const typed = inputTokens;
		const input =
			typed && typed.tokens.length > 0 && !hasErrors(typed.diagnostics)
				? typed.tokens.join('')
				: undefined;
		return toolLink(
			'automata',
			input === undefined ? { text: nfa.text } : { text: nfa.text, input }
		);
	});
	const nfaNote = $derived.by(() => {
		if (!nfa || nfa.ok || nfa.reason !== 'long-terminals') return null;
		const names = nfa.terminals.slice(0, 4).map(symbolText).join(', ');
		const more = nfa.terminals.length > 4 ? ', …' : '';
		return `An NFA reads one character at a time, so the link to Finite Automata needs terminals of one character (here: ${names}${more}).`;
	});
	const ambiguityHref = $derived(
		shown ? toolLink('ambiguity', { grammar: shown.text, input: model.input }) : null
	);

	// ---- Moving between the panels ---------------------------------------------

	let builderEl: HTMLDivElement | undefined = $state();
	let membershipEl: HTMLDivElement | undefined = $state();

	async function reveal(el: HTMLElement | undefined) {
		await tick();
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
	}

	function loadDerivation(pairs: StepPair[]) {
		model.steps = pairs.map(([index, production]): StepPair => [index, production]);
		model.order = 'leftmost';
		void reveal(builderEl);
	}

	function parseText(text: string) {
		model.input = text;
		void reveal(membershipEl);
	}

	const parseSentence = (sentence: string[]) =>
		parseText(sentence.length > 0 ? printSymbols(sentence) : '');
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={preset?.id ?? null} onselect={load} align="end" />
	{/snippet}

	<div class="top">
		<Panel title="Grammar">
			<div class="editor">
				<GrammarEditor
					ariaLabel="Grammar"
					bind:value={model.grammar}
					nonterminals={parsed.grammar?.nonterminals}
					terminals={parsed.grammar?.terminals}
					diagnostics={parsed.diagnostics}
					minRows={5}
					maxRows={16}
					placeholder="E → E + T | T"
				/>
				<p class="hint">
					One production per line; <code>|</code> separates alternatives, also at the start of a
					continuation line. Type <code>-&gt;</code> for <code>→</code>, and write <code>ε</code> for
					an empty right-hand side. The first left-hand side is the start symbol.
				</p>
			</div>
		</Panel>

		{#if tuple && chomsky}
			<div class={['follows', { stale }]} inert={stale}>
				<Panel title="Four-tuple" subtitle="G = (N, T, S, P)">
					{#snippet actions()}
						<CitationTag cite={{ deck: '09', slide: 14 }} />
					{/snippet}
					<FourTuple {tuple} mark={chomsky.type === 2} />
					{#snippet footer()}
						<ChomskyStrip {chomsky} {nfaHref} {nfaNote} />
					{/snippet}
				</Panel>
			</div>
		{/if}
	</div>

	{#if preset}
		<SlideNotes {preset} {regexHref} />
	{/if}

	{#if grammar && shown}
		{#if stale}
			<p class="stale-note" role="status">
				<Icon name="info" size={16} />
				<span>The panels show the last grammar without errors.</span>
			</p>
		{/if}
		<div class={['views', 'follows', { stale }]} inert={stale}>
			<div class="anchor" bind:this={builderEl}>
				<DerivationBuilder
					{grammar}
					bind:steps={model.steps}
					bind:order={model.order}
					bind:lm={model.lm}
					bind:rm={model.rm}
				/>
			</div>

			<div class="pair">
				<div class="anchor" bind:this={membershipEl}>
					<Panel title="Membership" subtitle="is the string in L(G)?">
						<MembershipPanel
							bind:input={model.input}
							diagnostics={inputTokens?.diagnostics ?? []}
							result={checked?.output.input ?? null}
							stale={membershipStale}
							failure={checkFailure}
							start={symbolText(grammar.start)}
							{ambiguityHref}
							placeholder={example}
							onload={loadDerivation}
						/>
					</Panel>
				</div>
				<Panel title="Test strings">
					<TestStrings
						bind:tests={model.tests}
						{rows}
						errors={testErrors}
						blocked={checkFailure !== null}
						onparse={parseText}
					/>
				</Panel>
			</div>

			<Panel title="Language" subtitle="the sentences of L(G)">
				{#snippet actions()}
					<CitationTag cite={{ deck: '09', slide: 22 }} />
				{/snippet}
				<LanguagePanel
					{size}
					listing={languageTask.output}
					stale={languageStale}
					failure={languageFailure}
					bind:maxLength={model.maxLength}
					{characters}
					{random}
					{randomChain}
					onrandom={() => (model.seed = freshSeed())}
					onparse={parseSentence}
				/>
			</Panel>
		</div>
	{:else}
		<p class="blank">
			{model.grammar.trim() === ''
				? 'Enter a grammar above, or pick one from the presets.'
				: 'The derivation, membership and language panels appear once the grammar has no errors.'}
		</p>
	{/if}
</ToolPage>

<style>
	.top {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	.top > :global(*) {
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.top {
			grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
			align-items: start;
		}
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.6;
	}

	.views {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.anchor {
		min-width: 0;
		scroll-margin-top: calc(56px + var(--space-4));
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.pair {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
			align-items: start;
		}
	}
	.follows.stale :global(.panel) {
		opacity: 0.55;
		transition: opacity var(--duration) var(--ease);
	}
	.stale-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.stale-note :global(.icon) {
		flex: none;
		color: var(--info);
	}
	.blank {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
