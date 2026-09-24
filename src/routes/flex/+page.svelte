<script lang="ts">
	import { untrack } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import CodeEditor from '$lib/components/ui/CodeEditor.svelte';
	import Disclosure from '$lib/components/ui/Disclosure.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import PresetMenu from '$lib/components/ui/PresetMenu.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import ToolPage from '$lib/components/ui/ToolPage.svelte';
	import { Stepper } from '$lib/components/ui/stepper.svelte';
	import { tool } from '$lib/tools/catalog/flex';
	import BuildStrip from '$lib/tools/flex/BuildStrip.svelte';
	import ConsoleView from '$lib/tools/flex/ConsoleView.svelte';
	import RulesTable from '$lib/tools/flex/RulesTable.svelte';
	import StepView from '$lib/tools/flex/StepView.svelte';
	import WordCount from '$lib/tools/flex/WordCount.svelte';
	import { hasCurlyQuotes, straightenQuotes } from '$lib/tools/flex/c-lexer';
	import { specTokens, type Focus } from '$lib/tools/flex/highlight';
	import { presetById, presets, type FlexPreset } from '$lib/tools/flex/presets';
	import { compileSpec } from '$lib/tools/flex/program';
	import { runScanner } from '$lib/tools/flex/runtime';
	import { parseSpec } from '$lib/tools/flex/spec';
	import {
		defaultState,
		fromLink,
		isFlexState,
		type FlexState,
		type FlexView
	} from '$lib/tools/flex/state';
	import { describeInput, formatReturn, visible } from '$lib/tools/flex/view';
	import { WC_GLOBALS } from '$lib/tools/flex/wc';
	import { syncToHash } from '$lib/url-state';

	let flex = $state<Required<FlexState>>(defaultState());
	/** The spec and input the results were computed from (typing is debounced). */
	let settled = $state({ spec: flex.spec, input: flex.input });

	const compiled = $derived(compileSpec(flex.spec));
	const runCompiled = $derived(settled.spec === flex.spec ? compiled : compileSpec(settled.spec));
	const watch = $derived(
		WC_GLOBALS.every((n) => runCompiled.numeric.has(n)) ? [...WC_GLOBALS] : []
	);
	const run = $derived(runScanner(runCompiled, settled.input, { watch }));
	const fresh = $derived(settled.spec === flex.spec && settled.input === flex.input);

	const stepper = new Stepper(() => run.steps.length);

	function load(v: FlexState) {
		const next = fromLink(v);
		Object.assign(flex, next);
		settled = { spec: next.spec, input: next.input };
		stepper.set(next.step);
	}

	syncToHash(() => flex, { onLoad: load, validate: isFlexState });

	// Results follow typing after a short pause, so long runs never block the editor.
	$effect(() => {
		const spec = flex.spec;
		const input = flex.input;
		const done = untrack(() => settled.spec === spec && settled.input === input);
		if (done) return;
		const timer = setTimeout(() => (settled = { spec, input }), 220);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const i = stepper.index;
		untrack(() => {
			if (flex.step !== i) flex.step = i;
		});
	});

	function choosePreset(p: FlexPreset) {
		load({
			spec: p.value.spec,
			input: p.value.inputs[0].value,
			preset: p.id,
			view: flex.view,
			step: 0
		});
	}

	function setInput(value: string) {
		flex.input = value;
		settled = { spec: flex.spec, input: value };
		stepper.first();
	}

	const preset = $derived(presetById(flex.preset));
	const unchanged = $derived(!!preset && preset.value.spec === flex.spec);
	const samples = $derived(preset && preset.value.inputs.length > 1 ? preset.value.inputs : []);
	const sample = $derived(preset?.value.inputs.find((s) => s.value === flex.input) ?? null);

	const step = $derived(run.steps[stepper.index] ?? null);
	const focus = $derived.by((): Focus[] => {
		if (flex.view !== 'step' || !fresh || !step) return [];
		const rules = compiled.spec.rules;
		const out: Focus[] = [];
		if (step.rule !== null && rules[step.rule]) {
			const r = rules[step.rule];
			out.push({ start: r.patternStart, end: r.patternEnd });
		}
		if (step.actionRule !== null && step.actionRule >= 0 && rules[step.actionRule]) {
			const a = rules[step.actionRule];
			out.push({ start: a.actionStart, end: a.actionEnd });
		}
		return out;
	});
	const highlight = $derived.by(() => {
		const spec = compiled.spec;
		const f = focus;
		return (text: string) => specTokens(text === spec.text ? spec : parseSpec(text), f);
	});
	const editorDiagnostics = $derived([
		...compiled.diagnostics,
		...(fresh ? run.diagnostics.filter((d) => d.span) : [])
	]);
	const sections = $derived(compiled.spec.sections);
	const ruleCount = $derived(compiled.spec.rules.length);
	const defCount = $derived(compiled.spec.definitions.length);

	const tabs = $derived([
		{ id: 'run', label: 'Run' },
		{ id: 'step', label: 'Step through', badge: run.steps.length || undefined },
		{ id: 'rules', label: 'Rules', badge: ruleCount }
	]);

	let specEditor: HTMLTextAreaElement | undefined = $state();

	function revealRule(index: number) {
		const r = compiled.spec.rules[index];
		const ta = specEditor;
		if (!r || !ta) return;
		ta.focus({ preventScroll: true });
		ta.setSelectionRange(r.patternStart, r.actionEnd);
		ta.scrollIntoView({ block: 'nearest' });
	}

	function download() {
		const blob = new Blob([straightenQuotes(flex.spec)], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'spec.l';
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function showCall(lastStep: number) {
		flex.view = 'step';
		if (lastStep >= 0) stepper.set(lastStep);
	}

	const lineRange = (r: [number, number]) =>
		r[0] === r[1] ? `line ${r[0]}` : `lines ${r[0]}–${r[1]}`;
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu {presets} selected={unchanged ? flex.preset : null} onselect={choosePreset} />
	{/snippet}

	<div class="flex-tool">
		<BuildStrip />

		<div class="workspace">
			<div class="inputs">
				<Panel title="spec.l" subtitle="flex specification">
					{#snippet actions()}
						{#if hasCurlyQuotes(flex.spec)}
							<Button size="sm" onclick={() => (flex.spec = straightenQuotes(flex.spec))}>
								Use straight quotes
							</Button>
						{/if}
						<Button size="sm" variant="ghost" onclick={download}>Download spec.l</Button>
					{/snippet}
					<CodeEditor
						bind:value={flex.spec}
						bind:element={specEditor}
						ariaLabel="spec.l, the flex specification"
						language="flex"
						{highlight}
						diagnostics={editorDiagnostics}
						minRows={16}
						maxRows={30}
						wrap={false}
					/>
					<ul class="outline" aria-label="Sections of the spec">
						<li>
							<span class="dot defs" aria-hidden="true"></span>Definitions
							<span class="where"
								>{lineRange(sections.definitions)} · {defCount} definition{defCount === 1
									? ''
									: 's'}</span
							>
						</li>
						{#if sections.rules}
							<li>
								<span class="dot rules" aria-hidden="true"></span>Rules
								<span class="where"
									>{lineRange(sections.rules)} · {ruleCount} rule{ruleCount === 1 ? '' : 's'}</span
								>
							</li>
						{/if}
						{#if sections.user}
							<li>
								<span class="dot user" aria-hidden="true"></span>User code
								<span class="where">{lineRange(sections.user)}</span>
							</li>
						{/if}
					</ul>
					{#snippet footer()}
						{#if preset}
							<div class="preset-note">
								<p>
									<strong>{preset.label}</strong>{#if !unchanged}<span class="edited">
											(edited)</span
										>{/if}. {preset.description}
								</p>
								{#if preset.cite}<CitationTag cite={preset.cite} />{/if}
							</div>
							{#if preset.id === 'example-2'}
								<Disclosure
									summary="The comment says this spec does NOT work. Why not?"
									openSummary="Hide answer"
								>
									<p class="answer">
										It counts separators, not words. <code>wd</code> goes up at every newline (rule
										1) and at every run of blanks that does not start a line (rule 3). A blank
										before a newline or an empty line adds a word that is not there, and a last word
										with no newline after it is never counted. The Word count panel compares the
										counters with <code>wc</code> for the input in data.txt.
									</p>
								</Disclosure>
							{/if}
						{:else}
							<p class="preset-note-plain">
								Your own spec. Choose a preset to load one of the lecture examples.
							</p>
						{/if}
					{/snippet}
				</Panel>
			</div>

			<div class="side">
				<Panel title="data.txt" subtitle="input">
					<CodeEditor
						bind:value={flex.input}
						ariaLabel="data.txt, the input the scanner reads"
						minRows={3}
						maxRows={10}
					/>
					<p class="input-info">{describeInput(flex.input)}</p>
					{#if samples.length}
						<div class="samples">
							<p class="samples-label" id="samples-label">Sample inputs</p>
							<ul class="sample-list" aria-labelledby="samples-label">
								{#each samples as s, i (i)}
									<li>
										<button
											type="button"
											class="sample"
											aria-pressed={flex.input === s.value}
											title={JSON.stringify(s.value)}
											onclick={() => setInput(s.value)}>{visible(s.value)}</button
										>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if sample?.note && preset?.id !== 'example-2'}
						<p class="sample-note">{sample.note}</p>
					{/if}
				</Panel>

				<div class={['results', { stale: !fresh }]}>
					<Panel padding="none">
						<Tabs
							{tabs}
							value={flex.view}
							label="Results"
							onchange={(id) => (flex.view = id as FlexView)}
						>
							{#snippet children(id)}
								<div class="tab-body">
									{#if id === 'run'}
										<div class="run-head">
											<code class="cmdline"
												><span class="prompt" aria-hidden="true">$</span>./a.out &lt; data.txt</code
											>
											{#if run.ran}
												{#if run.exitStatus !== null}
													<Badge tone={run.exitStatus === 0 ? 'accept' : 'reject'} variant="soft"
														>exit status {run.exitStatus}</Badge
													>
												{:else}
													<Badge tone="reject">stopped</Badge>
												{/if}
											{/if}
										</div>
										{#if !runCompiled.ok}
											<Callout tone="error" title="The spec has errors">
												Fix the problems listed under the spec to run it.
											</Callout>
										{:else if !run.ran}
											<Callout tone="error">{run.diagnostics[0]?.message ?? 'Nothing ran.'}</Callout
											>
										{:else}
											<ConsoleView output={run.output} label="Output of ./a.out" maxRows={18} />
											{#if run.stopped}
												<Callout tone="error" title="The program stopped">{run.stopped}</Callout>
											{/if}
											<section class="calls" aria-labelledby="calls-title">
												<h3 id="calls-title" class="section-label">yylex() calls</h3>
												{#if run.calls.length === 0}
													<p class="muted">yylex() was not called.</p>
												{:else if run.calls.length === 1}
													{@const c = run.calls[0]}
													<p class="calls-text">
														{c.returned === null
															? 'yylex() was called once and did not return.'
															: 'yylex() was called once and returned'}
														{#if c.returned !== null}<code
																>{formatReturn(c.returned, run.valueNames)}</code
															>.{/if}
													</p>
												{:else}
													<p class="calls-text">
														yylex() was called {run.calls.length} times. Return values in order (choose
														one to see its last match):
													</p>
													<ol class="call-list">
														{#each run.calls.slice(0, 300) as c (c.index)}
															<li>
																<button
																	type="button"
																	class="call"
																	aria-label="Call {c.index}: {c.returned === null
																		? 'stopped'
																		: `returned ${formatReturn(c.returned, run.valueNames)}`}"
																	onclick={() => showCall(c.lastStep)}
																	><span class="call-n" aria-hidden="true">{c.index}</span><span
																		class="call-v"
																		aria-hidden="true"
																		>{c.returned === null
																			? 'stopped'
																			: formatReturn(c.returned, run.valueNames)}</span
																	></button
																>
															</li>
														{/each}
													</ol>
													{#if run.calls.length > 300}
														<p class="muted">… and {run.calls.length - 300} more calls</p>
													{/if}
												{/if}
											</section>
										{/if}
									{:else if id === 'step'}
										<StepView {run} spec={runCompiled.spec} input={settled.input} {stepper} />
									{:else}
										<RulesTable spec={compiled.spec} onreveal={revealRule} />
									{/if}
								</div>
							{/snippet}
						</Tabs>
					</Panel>
				</div>
			</div>
		</div>

		{#if run.ran && run.watch}
			<Panel title="Word count" subtitle="nl, wd, ch next to wc">
				<WordCount {run} spec={runCompiled.spec} input={settled.input} />
			</Panel>
		{/if}
	</div>
</ToolPage>

<style>
	.flex-tool {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	@media (min-width: 1100px) {
		.workspace {
			grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		}
	}
	.inputs,
	.side,
	.results {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.results {
		transition: opacity var(--duration) var(--ease);
	}
	.results.stale {
		opacity: 0.72;
	}
	.tab-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		min-width: 0;
	}
	.outline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 500;
	}
	.outline li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.where {
		color: var(--text-3);
		font-weight: 400;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.dot.defs {
		background: var(--syn-name);
	}
	.dot.rules {
		background: var(--syn-operator);
	}
	.dot.user {
		background: var(--syn-keyword);
	}
	.preset-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
	}
	.preset-note p,
	.preset-note-plain {
		margin: 0;
	}
	.edited {
		color: var(--text-3);
		font-weight: 400;
	}
	.answer {
		max-width: 60ch;
		margin: var(--space-2) 0 0;
		color: var(--text);
		font-size: var(--text-sm);
	}
	.input-info {
		margin: var(--space-2) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.samples {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-3);
	}
	.samples-label {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.sample-list li {
		max-width: 100%;
		min-width: 0;
	}
	.sample-list {
		display: flex;
		min-width: 0;
		max-width: 100%;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sample {
		padding: 3px 10px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		max-width: 100%;
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		white-space: pre;
		text-overflow: ellipsis;
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.sample:hover {
		background: var(--surface-2);
	}
	.sample[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.sample-note {
		margin: var(--space-2) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.run-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.cmdline {
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.8125rem;
	}
	.prompt {
		margin-right: 0.6ch;
		color: var(--text-3);
		user-select: none;
	}
	.calls {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.section-label {
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.calls-text {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.call-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.call {
		display: inline-flex;
		align-items: stretch;
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.call:hover {
		border-color: var(--accent);
	}
	.call-n {
		padding: 2px 6px;
		background: var(--surface-2);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.call-v {
		padding: 2px 8px;
		font-family: var(--font-mono);
	}
	.muted {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	/* The rule the step view is on, drawn in the spec editor. */
	.flex-tool :global(.fx-focus) {
		border-radius: 2px;
		background: var(--active-soft);
		box-shadow: inset 0 -2px 0 var(--active);
	}
</style>
