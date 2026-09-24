<script lang="ts">
	import {
		Callout,
		CitationTag,
		CodeEditor,
		Disclosure,
		Panel,
		PresetMenu,
		SegmentedControl,
		Select,
		Toggle,
		ToolPage
	} from '$lib/components/ui';
	import { tool } from '$lib/tools/catalog/phases';
	import { toolLink } from '$lib/tools/links';
	import { toolBySlug } from '$lib/tools/registry';
	import { syncToHash } from '$lib/url-state';
	import DeclTable from '$lib/tools/phases/DeclTable.svelte';
	import PhaseTable from '$lib/tools/phases/PhaseTable.svelte';
	import Toolchain from '$lib/tools/phases/Toolchain.svelte';
	import { GROUPING_INFO, GROUPINGS, type View } from '$lib/tools/phases/groupings';
	import { compile, MAX_SOURCE } from '$lib/tools/phases/pipeline';
	import { PRESETS, presetFor, type PhasesPreset } from '$lib/tools/phases/presets';
	import { lexerRules } from '$lib/tools/phases/scanner';
	import { reservedFor } from '$lib/tools/phases/semantic';
	import {
		b1IsInt,
		cIsConstant,
		defaultState,
		isPhasesHash,
		MAX_DECLS,
		setB1IsInt,
		setCIsConstant,
		stateFromHash,
		type PhasesState
	} from '$lib/tools/phases/state';

	let model = $state(defaultState());

	const compilation = $derived(compile(model.source, model.decls));
	const preset = $derived(presetFor(model));

	/** Identifiers the program uses that the table does not declare. */
	const undeclared = $derived.by(() => {
		const names: string[] = [];
		for (const t of compilation.scan.tokens)
			if (
				t.kind === 'ID' &&
				!compilation.declarations.table.has(t.lexeme) &&
				reservedFor(t.lexeme) === null &&
				!names.includes(t.lexeme)
			)
				names.push(t.lexeme);
		return names;
	});

	const lexerTool = toolBySlug('lexer');
	const lexer = $derived.by(() => {
		const { defs, rules } = lexerRules(model.view);
		const href = toolLink('lexer', { defs, rules, input: compilation.source });
		return href && lexerTool ? { href, title: lexerTool.title } : null;
	});

	const b1 = $derived(b1IsInt(model.decls));
	const cConstant = $derived(cIsConstant(model.decls));

	function load(p: PhasesPreset) {
		model.source = p.value.source;
		model.decls = p.value.decls.map((d) => ({ ...d }));
		model.view = p.value.view;
	}

	syncToHash<Partial<PhasesState>>(() => model, {
		validate: isPhasesHash,
		onLoad: (v) => Object.assign(model, stateFromHash($state.snapshot(model), v))
	});

	const viewOptions: { value: View; label: string; title: string }[] = [
		{ value: 'seven', label: '7 phases', title: 'Intro (cont’d): Compiler architecture · slide 4' },
		{
			value: 'five',
			label: '5 phases',
			title: 'Intro (cont’d): Compiler structure with examples · slide 2'
		}
	];
	const groupingOptions = GROUPINGS.map((g) => ({ value: g, label: GROUPING_INFO[g].label }));
	const info = $derived(GROUPING_INFO[model.grouping]);

	const GRAMMAR = [
		'program -> stmt*',
		'stmt    -> ID = expr ;',
		'         | if cond then stmt [ else stmt ]',
		'cond    -> expr relop expr        relop: == != < <= > >=',
		'expr    -> term ( ( + | - ) term )*',
		'term    -> factor ( ( * | / ) factor )*',
		'factor  -> ID | NUM | FNUM | ( expr )'
	].join('\n');
</script>

{#snippet groupingFigure()}
	{#if model.grouping === 'phases'}
		<p class="caption-text">{info.caption}</p>
	{:else if model.grouping === 'analysis'}
		<dl class="split">
			<dt>Analysis</dt>
			<dd>Lexical · Syntax · Semantic · Optimization</dd>
			<dt>Synthesis</dt>
			<dd>Code Generation · Optimization</dd>
		</dl>
	{:else if model.grouping === 'ends'}
		<div class="flow" role="img" aria-label={info.caption}>
			<span class="flow-text">Source Code</span>
			<span class="flow-arrow" aria-hidden="true">→</span>
			<span class="flow-box">Front End</span>
			<span class="flow-arrow" aria-hidden="true">→</span>
			<span class="flow-text">Intermediate Code</span>
			<span class="flow-arrow" aria-hidden="true">→</span>
			<span class="flow-box">Back End</span>
			<span class="flow-arrow" aria-hidden="true">→</span>
			<span class="flow-text">Target Code</span>
		</div>
		<p class="caption-text">
			Front end: source dependent. Back end: source independent. The IR is the glue between them:
			GCC (GENERIC, GIMPLE, RTL), LLVM (LLVM IR).
		</p>
	{:else}
		<p class="passes">
			Lexical, syntax // semantic // intermed cgen // <em>optimization</em> // cgen //
			<em>optimization</em>
		</p>
		<p class="caption-text">
			A pass is the processing of the entire source program. A single-pass compiler requires
			everything to be defined before being used; a multi-pass compiler may have to keep the entire
			program representation in memory.
		</p>
	{/if}
	{#if info.note}<p class="caption-note">{info.note}</p>{/if}
{/snippet}

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu presets={PRESETS} selected={preset?.id ?? null} onselect={load} align="end" />
	{/snippet}

	<div class="inputs">
		<Panel title="Source">
			<div class="stack">
				<CodeEditor
					ariaLabel="Source program"
					bind:value={model.source}
					diagnostics={compilation.diagnostics}
					source={null}
					minRows={3}
					maxRows={10}
					placeholder="A = B1 + C;"
				/>
				<Disclosure summary="Grammar" openSummary="Grammar">
					<pre class="grammar">{GRAMMAR}</pre>
					<p class="hint">
						ID is a letter followed by letters or digits; NUM is an int literal (1), FNUM a float
						literal (2.3). An <code>else</code> belongs to the nearest <code>if</code>.
					</p>
				</Disclosure>
				{#if compilation.truncated}
					<Callout tone="warn">
						Only the first {MAX_SOURCE} characters are compiled.
					</Callout>
				{/if}
				{#if preset?.questions}
					<section class="questions" aria-labelledby="slide-questions">
						<p class="questions-title" id="slide-questions">Questions on the slides</p>
						{#each preset.questions as q, i (i)}
							<div class="question">
								<div class="q-head">
									<p class="prompt">{q.prompt}</p>
									<CitationTag cite={q.cite} />
								</div>
								<Disclosure>
									<p class="answer">{q.answer}</p>
								</Disclosure>
							</div>
						{/each}
					</section>
				{/if}
			</div>
		</Panel>

		<Panel title="Declarations">
			<div class="stack">
				{#if b1 !== null || cConstant !== null}
					<div class="assume">
						<div class="assume-head">
							<span class="assume-title">The slide’s assumptions</span>
							<CitationTag cite={{ deck: '01', slide: 4 }} />
						</div>
						<div class="assume-toggles">
							{#if b1 !== null}
								<Toggle
									label="B1 is int"
									description="Off: B1 is float"
									checked={b1}
									onchange={(on) => setB1IsInt(model.decls, on)}
								/>
							{/if}
							{#if cConstant !== null}
								<Toggle
									label="C is the constant 2.3"
									description="Off: C is a float variable"
									checked={cConstant}
									onchange={(on) => setCIsConstant(model.decls, on)}
								/>
							{/if}
						</div>
					</div>
				{/if}
				<DeclTable
					bind:decls={model.decls}
					problems={compilation.declarations.problems}
					{undeclared}
					max={MAX_DECLS}
				/>
			</div>
		</Panel>
	</div>

	<Panel title={model.view === 'seven' ? '7 Phases of a Compiler' : 'Structure of a Compiler'}>
		{#snippet actions()}
			<SegmentedControl label="Phase list" options={viewOptions} bind:value={model.view} />
		{/snippet}
		<div class="stack">
			{#if model.view === 'seven'}
				<div class="grouping">
					<div class="grouping-controls">
						<!-- Four options do not fit a phone's width: a select there, one of the two shown. -->
						<div class="wide-only">
							<SegmentedControl
								label="Group the rows"
								showLabel
								size="sm"
								options={groupingOptions}
								bind:value={model.grouping}
							/>
						</div>
						<div class="narrow-only">
							<Select
								label="Group the rows"
								inline
								size="sm"
								options={groupingOptions}
								bind:value={model.grouping}
							/>
						</div>
						<CitationTag cite={info.cite} />
					</div>
					{@render groupingFigure()}
				</div>
			{:else}
				<div class="grouping">
					<div class="grouping-controls">
						<p class="caption-text">
							The five phases. The syntax row diagrams the statement with its words on top and the
							root at the bottom.
						</p>
						<CitationTag cite={{ deck: '03', slide: 2 }} />
						<CitationTag cite={{ deck: '03', slide: 9 }} />
					</div>
				</div>
			{/if}
			<PhaseTable {compilation} view={model.view} grouping={model.grouping} {lexer} />
		</div>
	</Panel>

	<Panel title="Preprocessors, Compilers, Assemblers, and Linkers">
		{#snippet actions()}<CitationTag cite={{ deck: '01', slide: 11 }} />{/snippet}
		<Toolchain
			compilerNote={model.view === 'seven' ? 'The seven phases above' : 'The five phases above'}
		/>
	</Panel>
</ToolPage>

<style>
	.inputs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
	}
	@media (min-width: 960px) {
		.inputs {
			grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.grammar {
		margin: 0 0 var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 0.8125rem;
		line-height: 1.6;
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.questions-title {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.question {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.q-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}
	.prompt {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-base);
		font-weight: 600;
	}
	.answer {
		font-size: var(--text-sm);
	}

	.assume {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.assume-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.assume-title {
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.assume-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
	}

	.grouping {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.grouping-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.narrow-only {
		display: none;
	}
	@media (max-width: 640px) {
		.wide-only {
			display: none;
		}
		.narrow-only {
			display: block;
		}
	}
	.caption-text {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.caption-note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.split {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 2px var(--space-3);
		margin: 0;
		font-size: var(--text-sm);
	}
	.split dt {
		font-weight: 600;
	}
	.split dd {
		margin: 0;
		color: var(--text-2);
	}
	.flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	.flow-text {
		color: var(--text-2);
	}
	.flow-box {
		padding: 3px 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		font-weight: 600;
	}
	.flow-arrow {
		color: var(--text-3);
	}
	.passes {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.passes em {
		color: var(--tok-3);
	}
</style>
