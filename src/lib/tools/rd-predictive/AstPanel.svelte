<!--
	AST construction as on slide 40: the functions that build the tree, run step
	by step on the token string, with the local variables of every call and the
	trees that exist after each step. The rules X → Y { op Y } and X → Y [ op X ]
	can be shown in either form on the same input.
-->
<script lang="ts">
	import { ParseTreeView, TokenStream } from '$lib/components/grammar';
	import { Callout, SegmentedControl, StepControls, type Stepper } from '$lib/components/ui';
	import type { AstForm } from './ast';
	import CallStack from './CallStack.svelte';
	import CodeListing from './CodeListing.svelte';
	import GrammarBox from './GrammarBox.svelte';
	import type { AstModel } from './model';
	import StepLine from './StepLine.svelte';
	import {
		callSites,
		describeStep,
		forestAt,
		outcomeText,
		stackRows,
		tokenHighlights
	} from './view';

	interface Props {
		/** The functions for the grammar in the form shown, with their run. */
		model: AstModel;
		stepper: Stepper;
		/** The other form was chosen. */
		onform: (form: AstForm) => void;
		/** The token string has errors, so there is nothing to run. */
		inputError?: boolean;
	}

	let { model, stepper, onform, inputError = false }: Props = $props();

	const uid = $props.id();

	const FORMS: { value: AstForm; label: string; title: string }[] = [
		{ value: 'loop', label: '{ } left-associative', title: 'X → Y { op Y }: a loop' },
		{ value: 'recursion', label: '[ ] right-associative', title: 'X → Y [ op X ]: recursion' }
	];

	const run = $derived(model.run);
	const code = $derived(model.code);
	const index = $derived(stepper.index);
	const step = $derived(run ? run.steps[index] : undefined);
	const atEnd = $derived(!!run && index === run.steps.length - 1);
	const outcome = $derived(run ? outcomeText(run) : null);
	const forest = $derived(run ? forestAt(run, index) : []);
	/** Trees drawn: deep recursion leaves one unfinished tree in every call. */
	const FOREST_LIMIT = 8;
	/** Some rule of the grammar can be written in both forms. */
	const hasForms = $derived(model.written !== null);
	const none = $derived(code.program.functions.length === 0);

	const list = (parts: readonly string[]) =>
		new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);
</script>

<div class="ast">
	{#if hasForms}
		<div class="forms">
			<SegmentedControl
				options={FORMS}
				value={model.form}
				label="Operator rules with"
				showLabel
				size="sm"
				onchange={onform}
			/>
			<p class="implies">
				{#if model.form === 'loop'}
					A loop makes the tree so far the left child of each new node.
				{:else}
					A recursive call returns the tree of everything after the operator, which becomes the
					right child.
				{/if}
			</p>
		</div>
	{/if}

	<div class="grid">
		<div class="code-side">
			<GrammarBox label="Grammar the functions are for" text={model.reformed.text} ebnf />
			{#if model.reformed.changed.length > 0}
				<p class="note">
					The {model.reformed.changed.length === 1 ? 'rule' : 'rules'} of
					{list(model.reformed.changed)}
					{model.reformed.changed.length === 1 ? 'is' : 'are'} written with
					{model.form === 'loop' ? '{ }' : '[ ]'} here. The same strings are generated; the parser above
					keeps its grammar.
				</p>
			{/if}
			{#if code.missing.length > 0}
				<Callout tone="info" title="No function for {list(code.missing)}">
					<p>
						A function returns one tree. A rule gets one when each alternative is a single operand,
						optionally followed by <code>{'{ op operand }'}</code> or
						<code>[ op operand ]</code>, as in <code>E → T {'{ + T }'}</code> and
						<code>A → X [ op A ]</code>.
						{none ? '' : 'The functions below are not run.'}
					</p>
				</Callout>
			{/if}
			{#if !none}
				<CodeListing
					program={code.program}
					line={step?.line ?? null}
					sites={callSites(step)}
					tone={step ? describeStep(run!, index).tone : 'neutral'}
					maxHeight="min(34rem, 70vh)"
					ariaLabel="Functions that build the AST"
				/>
			{/if}
		</div>

		{#if run && step}
			<div class="side">
				<TokenStream
					tokens={run.tokens}
					pointer={step.pointer}
					highlights={tokenHighlights(run, index)}
					size="lg"
					ariaLabel="Token string with the input pointer"
				/>

				<StepControls {stepper} ariaLabel="Steps of the AST construction">
					{#snippet label(i: number)}
						{@const s = run.steps[i]}
						{#if s}
							<StepLine
								text={describeStep(run, i)}
								line={s.line}
								code={run.program.lines[s.line]?.text ?? ''}
							/>
						{/if}
					{/snippet}
				</StepControls>

				<!-- A finished AST is in the words of the last step and in the drawing below. -->
				{#if atEnd && outcome && outcome.tone !== 'success'}
					<Callout tone={outcome.tone} title={outcome.title} role="status">
						{#each outcome.lines as line, i (i)}<p>{line}</p>{/each}
					</Callout>
				{/if}

				<section aria-labelledby="{uid}-trees">
					<h3 id="{uid}-trees">
						Trees <span>every node that is no node’s child, with its tree</span>
					</h3>
					{#if forest.length === 0}
						<p class="empty">No node has been made yet.</p>
					{:else}
						{#if forest.length > FOREST_LIMIT}
							<p class="empty">The {FOREST_LIMIT} newest of {forest.length} trees are drawn.</p>
						{/if}
						<ul class="forest">
							{#each forest.slice(-FOREST_LIMIT) as t (t.root)}
								<li>
									<ParseTreeView
										tree={t.tree}
										highlight={{ current: t.current, dim: t.dim }}
										labelSize={18}
										ariaLabel="Tree {t.text}"
									/>
									<p class="names">
										{#each t.names as name, k (k)}{k > 0 ? ', ' : ''}<code>{name}</code>{:else}<span
												class="held">no variable</span
											>{/each}
									</p>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section aria-labelledby="{uid}-vars">
					<h3 id="{uid}-vars">Variables <span>of every call, innermost first</span></h3>
					<CallStack
						rows={stackRows(run, index)}
						ariaLabel="Calls with their variables, innermost first"
					/>
				</section>
			</div>
		{:else if !none && code.missing.length === 0}
			<p class="empty">
				{inputError
					? 'The functions run when the token string has no errors.'
					: 'The functions run on the token string of the Run panel.'}
			</p>
		{/if}
	</div>
</div>

<style>
	.ast {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.forms {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
	}
	.implies,
	.note,
	.empty {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.implies {
		flex: 1 1 18rem;
		min-width: 0;
	}
	.note,
	.empty {
		color: var(--text-3);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.grid {
			grid-template-columns: minmax(0, 6fr) minmax(320px, 6fr);
		}
	}
	.code-side,
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	section {
		min-width: 0;
	}
	h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		margin: 0 0 var(--space-2);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0;
	}
	h3 span {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 400;
	}
	.forest {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.forest li {
		display: flex;
		flex: 0 1 auto;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		min-width: 3.5rem;
		max-width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.names {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-xs);
		text-align: center;
	}
	.names code {
		padding: 0;
		border: 0;
		background: none;
		font-weight: 600;
	}
	.held {
		color: var(--text-3);
		font-style: italic;
	}
</style>
