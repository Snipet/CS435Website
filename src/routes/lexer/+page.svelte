<script lang="ts">
	import { tick } from 'svelte';
	import {
		Button,
		Callout,
		CharStream,
		CitationTag,
		CodeEditor,
		Disclosure,
		Icon,
		IconButton,
		Panel,
		PresetMenu,
		SegmentedControl,
		StepControls,
		Stepper,
		Tabs,
		Toggle,
		TokenPairs,
		ToolPage,
		type HighlightRange
	} from '$lib/components/ui';
	import type { TokenFormat } from '$lib/components/ui/token-format';
	import { formatString } from '$lib/theory/chars';
	import { tool } from '$lib/tools/catalog/lexer';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';
	import LookaheadView from '$lib/tools/lexer/LookaheadView.svelte';
	import MatchMatrix from '$lib/tools/lexer/MatchMatrix.svelte';
	import RLine from '$lib/tools/lexer/RLine.svelte';
	import RuleList from '$lib/tools/lexer/RuleList.svelte';
	import StripView from '$lib/tools/lexer/StripView.svelte';
	import { toFlexSpec } from '$lib/tools/lexer/flex';
	import { lookaheadIndex, lookaheadPoint, lookaheadStart } from '$lib/tools/lexer/lookahead';
	import {
		DEFAULT_PRESET_ID,
		presetById,
		presets,
		type LexerPreset,
		type PresetTry
	} from '$lib/tools/lexer/presets';
	import {
		MAX_INPUT,
		MAX_MATRIX_CELLS,
		advance,
		describeStep,
		runScan
	} from '$lib/tools/lexer/scan';
	import { MAX_DFA_STATES, buildSpec } from '$lib/tools/lexer/spec';
	import {
		isLexerHash,
		normalizeState,
		ruleLinkState,
		type LexerState,
		type LexerTab
	} from '$lib/tools/lexer/state';

	const initial = presetById(DEFAULT_PRESET_ID)!;
	let lex = $state<LexerState>(normalizeState({ ...initial.value, preset: initial.id }));

	// Stable keys for the rule rows (not saved): rows keep their DOM when reordered.
	let nextKey = 0;
	let keys = $state<number[]>(lex.rules.map(() => nextKey++));

	const spec = $derived(buildSpec(lex.defs, lex.rules));
	const run = $derived(runScan(spec, lex.input, lex.errorRule));
	const laIndex = $derived(lookaheadIndex(run));

	const stepper = new Stepper(() => run.steps.length);
	const laStepper = new Stepper(() => laIndex.total);

	syncToHash(() => lex, {
		onLoad: (v) => apply(normalizeState(v)),
		validate: isLexerHash
	});

	$effect(() => {
		lex.step = stepper.index;
	});
	$effect(() => {
		lex.lookahead = laStepper.index;
	});

	let noteOpen = $state(true);

	function apply(next: LexerState) {
		stepper.pause();
		laStepper.pause();
		Object.assign(lex, next);
		keys = next.rules.map(() => nextKey++);
		stepper.set(next.step);
		laStepper.set(next.lookahead);
	}

	function loadPreset(p: LexerPreset) {
		apply(normalizeState({ ...p.value, preset: p.id }));
		noteOpen = true;
	}

	const activePreset = $derived(presetById(lex.preset));

	/** A follow-up is applied when the state already has its values. */
	function applied(t: PresetTry): boolean {
		return (
			(t.input === undefined || lex.input === t.input) &&
			(t.errorRule === undefined || lex.errorRule === t.errorRule)
		);
	}

	function setTry(t: PresetTry, back: boolean) {
		const p = activePreset;
		if (!p) return;
		if (t.input !== undefined) lex.input = back ? p.value.input : t.input;
		if (t.errorRule !== undefined)
			lex.errorRule = back ? (p.value.errorRule ?? false) : t.errorRule;
		stepper.set(0);
		laStepper.set(0);
	}

	function backLabel(t: PresetTry, p: LexerPreset): string {
		if (t.input !== undefined) return `Back to ${formatString(p.value.input)}`;
		return p.value.errorRule ? 'Turn the Error rule back on' : 'Turn the Error rule off';
	}

	let rulesBox: HTMLDivElement | undefined = $state();

	async function addRule() {
		lex.rules.push({ name: '', re: '', drop: false });
		keys.push(nextKey++);
		await tick();
		rulesBox?.querySelector<HTMLInputElement>('ol > li:last-child input')?.focus();
	}

	/** After the last rule is deleted, focus moves to "Add rule". */
	let addButton: HTMLButtonElement | undefined = $state();
	async function onRemove() {
		if (lex.rules.length > 0) return;
		await tick();
		addButton?.focus();
	}

	function onTab(id: string) {
		const tab = id as LexerTab;
		// Keep the two walks on the same token when switching between them.
		if (tab === 'lookahead') {
			const point = lookaheadPoint(run, laIndex, laStepper.index);
			if (!point || point.scanStep !== stepper.index) {
				laStepper.set(lookaheadStart(laIndex, stepper.index));
			}
		} else if (lex.tab === 'lookahead') {
			const point = lookaheadPoint(run, laIndex, laStepper.index);
			if (point) stepper.set(point.scanStep);
		}
		lex.tab = tab;
	}

	// The current step of the scanning loop.
	const step = $derived(run.steps[stepper.index]);
	const stepToken = $derived.by(() => {
		const t = run.tokenAt[stepper.index];
		return t === null || t === undefined ? null : run.tokens[t];
	});
	const activeToken = $derived(run.tokenAt[stepper.index] ?? null);

	const streamHighlights = $derived.by((): HighlightRange[] => {
		const out: HighlightRange[] = [];
		const upto = Math.min(stepper.index, run.tokens.length);
		for (let t = 0; t < upto; t++) {
			const tok = run.tokens[t];
			// Consumed input is muted, each token underlined in its rule's color. Dropped
			// lexemes are not captioned, to keep the stream readable.
			out.push({
				start: tok.start,
				end: tok.end,
				tone: tok.error ? 'reject' : tok.skipped ? 'muted' : tok.rule,
				label: tok.skipped ? undefined : tok.name,
				muted: true
			});
		}
		if (stepToken) {
			out.push({
				start: stepToken.start,
				end: stepToken.end,
				tone: 'active',
				label: stepToken.name
			});
		} else if (step) {
			out.push({
				start: step.pos,
				end: advance(run.text, step.pos, 1),
				tone: 'reject',
				label: 'stuck'
			});
		}
		return out;
	});
	const streamLookahead = $derived.by(() => {
		if (!step) return null;
		const readEnd = advance(run.text, step.pos, step.maxLen);
		const from = stepToken ? stepToken.end : step.pos;
		return readEnd > from ? { start: from, end: readEnd } : null;
	});

	const stepCtx = $derived({ spec, run, errorRule: lex.errorRule, format: lex.format });

	const reported = $derived(run.tokens.filter((t) => !t.skipped).length);
	const droppedCount = $derived(run.tokens.length - reported);

	const problems = $derived.by(() => {
		const out: string[] = [];
		for (const r of spec.rules) {
			if (r.problem === 'error')
				out.push(
					`R${r.index + 1} (${r.name}) has an error, so it matches nothing until it is fixed.`
				);
			else if (r.problem === 'too-large')
				out.push(
					`R${r.index + 1} (${r.name}) needs a DFA with more than ${MAX_DFA_STATES} states, so it is left out.`
				);
		}
		return out;
	});

	// The flex spec is only written out when the flex tool is part of the site.
	const flexHref = $derived(
		toolBySlug('flex')
			? toolLink('flex', {
					spec: toFlexSpec(spec.rules, { errorRule: lex.errorRule, format: lex.format }).spec,
					input: run.text
				})
			: null
	);
	const dfaHref = $derived(toolLink('scanner-dfa', ruleLinkState(lex)));

	const formatOptions: { value: TokenFormat; label: string; title: string }[] = [
		{ value: 'paren', label: '(Identifier, "f")', title: 'As in Lexical Analysis II' },
		{ value: 'angle', label: "<ID,'f'>", title: 'As in the compiler-architecture intro' }
	];

	const tabs = [
		{ id: 'matches', label: 'Prefix matches' },
		{ id: 'lookahead', label: 'Lookahead' },
		{ id: 'strip', label: 'Strip first' }
	];
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={lex.preset} onselect={loadPreset} align="end" />
	{/snippet}

	{#if activePreset && noteOpen}
		<aside class="note" aria-label="About this example">
			<div class="note-main">
				<div class="note-head">
					{#if activePreset.cite}<CitationTag cite={activePreset.cite} size="md" />{/if}
					<span class="note-title">{activePreset.label}</span>
				</div>
				{#if activePreset.description}<p class="note-desc">{activePreset.description}</p>{/if}
				{#if activePreset.question}
					<p class="question">{activePreset.question.text}</p>
					<Disclosure summary="Show answer" openSummary="Hide answer">
						<p class="answer">{activePreset.question.answer}</p>
					</Disclosure>
				{/if}
				{#if activePreset.tries?.length}
					<div class="tries">
						{#each activePreset.tries as t (t.label)}
							{@const done = applied(t)}
							<Button size="sm" onclick={() => setTry(t, done)}>
								{#snippet icon()}<Icon name={done ? 'reset' : 'arrow-right'} size={14} />{/snippet}
								{done ? backLabel(t, activePreset) : t.label}
							</Button>
						{/each}
					</div>
				{/if}
			</div>
			<IconButton icon="x" size="sm" label="Hide this note" onclick={() => (noteOpen = false)} />
		</aside>
	{/if}

	<div class="top">
		<Panel title="Token rules">
			<div class="spec-body">
				<CodeEditor
					label="Helper definitions"
					bind:value={lex.defs}
					diagnostics={spec.defs.diagnostics}
					minRows={2}
					maxRows={8}
					tabInserts={false}
					placeholder="digit = '0' | … | '9'"
				/>

				<div class="rules" bind:this={rulesBox}>
					<div class="rules-head">
						<h3>Rules</h3>
						<span class="hint">Listed first wins a tie</span>
					</div>
					{#if lex.rules.length}
						<RuleList bind:rules={lex.rules} bind:keys infos={spec.rules} onremove={onRemove} />
					{:else}
						<p class="empty">No rules yet.</p>
					{/if}
					<div class="rules-foot">
						<Button size="sm" onclick={addRule} bind:element={addButton}>
							{#snippet icon()}<Icon name="plus" size={15} />{/snippet}
							Add rule
						</Button>
						<Toggle
							bind:checked={lex.errorRule}
							label="Error rule (any one character, listed last)"
						/>
					</div>
				</div>

				<div class="r-box">
					<RLine rules={spec.rules} errorRule={lex.errorRule} />
				</div>

				{#if problems.length}
					<Callout tone="warn">
						{#each problems as p (p)}<p class="problem">{p}</p>{/each}
					</Callout>
				{/if}
			</div>
			{#snippet footer()}
				{#if flexHref || dfaHref}
					<div class="links">
						{#if flexHref}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
							<a class="link-btn" href={flexHref}>
								Open as a flex spec <Icon name="arrow-right" size={15} />
							</a>
						{/if}
						{#if dfaHref}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path -->
							<a class="link-btn" href={dfaHref}>
								Build the scanner DFA <Icon name="arrow-right" size={15} />
							</a>
						{/if}
					</div>
				{:else}
					<span class="foot-note">
						R = R<sub>1</sub> | … | R<sub>n</sub>: the longest prefix wins; among rules matching it,
						the one listed first.
					</span>
				{/if}
			{/snippet}
		</Panel>

		<div class="side">
			<Panel title="Input">
				<CodeEditor
					ariaLabel="Input to scan"
					bind:value={lex.input}
					minRows={2}
					maxRows={12}
					lineNumbers={false}
					placeholder="Type the input to scan"
				/>
				<p class="count">
					{[...lex.input].length} character{[...lex.input].length === 1 ? '' : 's'}
				</p>
				{#if run.limit === 'matrix'}
					<Callout tone="warn">
						Only the first {[...run.text].length} characters are scanned: past them, the prefix-match
						tables would hold more than {MAX_MATRIX_CELLS.toLocaleString('en-US')} entries.
					</Callout>
				{:else if run.limit === 'length'}
					<Callout tone="warn">Only the first {MAX_INPUT} characters are scanned.</Callout>
				{/if}
			</Panel>

			<Panel
				title="Tokens"
				subtitle="{reported} reported{droppedCount ? ` · ${droppedCount} dropped` : ''}"
			>
				{#snippet actions()}
					<SegmentedControl
						label="Token format"
						options={formatOptions}
						bind:value={lex.format}
						size="sm"
						mono
					/>
				{/snippet}
				<div class="tokens">
					<TokenPairs
						tokens={run.tokens}
						format={lex.format}
						showSkipped={lex.showDropped}
						active={activeToken}
						empty={lex.input ? 'No tokens' : 'No input'}
					/>
					{#if run.stuck !== null}
						<Callout tone="error">
							Stuck at position {run.stuck}: no prefix of {formatString(
								[...run.text.slice(run.stuck)].slice(0, 24).join('')
							)} matches R.
							{#if !lex.errorRule}
								<div class="stuck-action">
									<Button size="sm" onclick={() => (lex.errorRule = true)}>
										Turn on the Error rule
									</Button>
								</div>
							{/if}
						</Callout>
					{/if}
					<Toggle bind:checked={lex.showDropped} label="Show dropped tokens" />
				</div>
			</Panel>
		</div>
	</div>

	<Panel title="Scanner">
		<Tabs {tabs} value={lex.tab} label="Scanner views" onchange={onTab}>
			{#snippet children(id)}
				{#if id === 'matches'}
					{#if step}
						<div class="matches">
							<StepControls {stepper} noun="Step" ariaLabel="Scanning steps">
								{#snippet label()}<span class="sentence"
										>{describeStep(stepCtx, stepper.index)}</span
									>{/snippet}
							</StepControls>
							<div class="stream-box">
								<CharStream
									text={run.text}
									size="lg"
									cursor={step.pos}
									lookahead={streamLookahead}
									highlights={streamHighlights}
									indices={run.text.length <= 64}
									ariaLabel="Input, at position {step.pos}"
								/>
							</div>
							<MatchMatrix {spec} {run} step={stepper.index} errorRule={lex.errorRule} />
						</div>
					{:else}
						<p class="empty">Type an input to scan.</p>
					{/if}
				{:else if id === 'lookahead'}
					<LookaheadView
						{spec}
						{run}
						index={laIndex}
						stepper={laStepper}
						errorRule={lex.errorRule}
						format={lex.format}
					/>
				{:else}
					<StripView
						{spec}
						{run}
						errorRule={lex.errorRule}
						format={lex.format}
						showDropped={lex.showDropped}
						bind:strip={lex.strip}
					/>
				{/if}
			{/snippet}
		</Tabs>
	</Panel>
</ToolPage>

<style>
	/* Lexemes such as "  " keep their spaces. */
	.sentence {
		white-space: pre-wrap;
	}
	.note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-4) var(--space-5);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	.note-main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.note-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.note-title {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		white-space: pre-wrap;
	}
	.note-desc {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.question {
		margin: var(--space-1) 0 0;
		font-family: var(--font-serif);
		font-size: var(--text-lg);
		font-style: italic;
	}
	.answer {
		margin: 0;
		color: var(--text);
		font-size: var(--text-sm);
		max-width: var(--content-width);
	}
	.tries {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.top {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.top {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		}
		.side {
			position: sticky;
			top: calc(64px + var(--space-4));
		}
	}

	.spec-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.rules-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.rules-head h3 {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.rules-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}
	/* Scroll boxes are positioned so visually hidden text inside them cannot widen the page. */
	.r-box {
		position: relative;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius);
		background: var(--surface-2);
		overflow-x: auto;
	}
	.problem {
		margin: 0;
	}
	.problem + .problem {
		margin-top: var(--space-1);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}
	.link-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
		text-decoration: none;
	}
	.link-btn:hover {
		text-decoration: underline;
	}
	.foot-note {
		color: var(--text-3);
		font-size: var(--text-xs);
	}

	.count {
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
	.tokens {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.stuck-action {
		margin-top: var(--space-2);
	}

	.matches {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.stream-box {
		position: relative;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow-x: auto;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
	}
	@media (max-width: 560px) {
		.note {
			padding: var(--space-3);
		}
		.stream-box {
			padding: var(--space-3);
		}
	}
</style>
