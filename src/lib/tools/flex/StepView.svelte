<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import StepControls from '$lib/components/ui/StepControls.svelte';
	import { stepperKeys, type Stepper } from '$lib/components/ui/stepper.svelte';
	import { formatString } from '$lib/theory/chars';
	import CandidateTable from './CandidateTable.svelte';
	import ConsoleView from './ConsoleView.svelte';
	import { MAX_RECORDED_STEPS, type FlexRun } from './runtime';
	import { scName, type FlexSpec } from './spec';
	import { describeStep, formatReturn, inputWindow, stepAt, stepHighlights } from './view';

	interface Props {
		run: FlexRun;
		spec: FlexSpec;
		input: string;
		stepper: Stepper;
	}

	let { run, spec, input, stepper }: Props = $props();

	const step = $derived(run.steps[stepper.index] ?? null);
	const win = $derived(
		step ? inputWindow(input, step.pos, Math.max(step.context, step.next)) : null
	);
	const highlights = $derived(step && win ? stepHighlights(run, step.index, win.offset) : []);
	const lookahead = $derived(
		step && win && step.context > step.end
			? { start: step.end - win.offset, end: step.context - win.offset }
			: null
	);
	const action = $derived(
		step && step.actionRule !== null && step.actionRule >= 0 ? spec.rules[step.actionRule] : null
	);
	const winner = $derived(step && step.rule !== null ? spec.rules[step.rule] : null);
	const stepOutput = $derived(step ? run.output.filter((c) => c.at === step.index) : []);
	const hasSc = $derived(spec.startConditions.length > 0);
	const usesBol = $derived(spec.rules.some((r) => r.pattern?.bol));

	/** Clicking a character goes to the match that covers it (the step controls handle keys). */
	function pick(event: MouseEvent) {
		const el = (event.target as Element).closest<HTMLElement>('[data-index]');
		if (!el || !win) return;
		const s = stepAt(run, Number(el.dataset.index) + win.offset);
		if (s !== null) stepper.set(s);
	}
</script>

<div class="step-view" {@attach stepperKeys(stepper)}>
	{#if run.steps.length === 0}
		<p class="empty">
			{run.ran
				? 'The program did not call yylex().'
				: 'Nothing ran: see the problems listed under the spec.'}
		</p>
	{:else}
		<StepControls {stepper} noun="Step" ariaLabel="Step through the matches">
			{#snippet label(i)}
				{@const s = run.steps[i]}
				{#if s}{describeStep(s, spec, run.valueNames)}{/if}
			{/snippet}
		</StepControls>

		{#if step && win}
			<div class="meta">
				<Badge variant="outline">yylex() call {step.call}</Badge>
				{#if step.kind === 'eof'}
					<Badge variant="outline">end of input</Badge>
				{:else}
					<Badge variant="outline">line {step.line}, column {step.col}</Badge>
				{/if}
				{#if hasSc}
					<Badge variant="outline" tone="epsilon">start condition {scName(spec, step.sc)}</Badge>
				{/if}
				{#if usesBol && step.atBol && step.kind !== 'eof'}
					<Badge variant="outline">at line start</Badge>
				{/if}
			</div>

			<!-- Mouse shortcut only: the step controls and ←/→ reach every match from the keyboard. -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="stream" onclick={pick} title="Choose a character to go to its match">
				{#if win.clippedStart}<span class="clip">… earlier input not shown</span>{/if}
				<CharStream
					text={win.text}
					{highlights}
					{lookahead}
					cursor={step.pos - win.offset}
					showEnd
					ariaLabel="data.txt with the current match highlighted"
				/>
				{#if win.clippedEnd}<span class="clip">… later input not shown</span>{/if}
			</div>
			{#if lookahead}
				<p class="hint">
					The dashed underline is trailing context: it counts toward the match length but stays in
					the input.
				</p>
			{/if}

			<div class="grid">
				<section class="tried" aria-labelledby="tried-title">
					<h3 id="tried-title">
						{step.kind === 'eof' ? 'End of input' : 'Rules tried'}
					</h3>
					{#if step.kind === 'eof'}
						<p class="eof">
							{#if winner}
								The <code>&lt;&lt;EOF&gt;&gt;</code> rule on line {winner.line} runs for start condition
								{scName(spec, step.sc)}.
							{:else}
								No <code>&lt;&lt;EOF&gt;&gt;</code> rule applies, so yylex returns 0 (the default
								<code>yyterminate()</code>).
							{/if}
						</p>
					{:else}
						<CandidateTable {step} {spec} />
					{/if}
				</section>

				<section class="result" aria-labelledby="result-title">
					<h3 id="result-title">Result</h3>
					<dl>
						{#if step.kind !== 'eof'}
							<dt><code>yytext</code></dt>
							<dd class="mono">{formatString(step.yytext)}</dd>
							<dt><code>yyleng</code></dt>
							<dd class="mono">{step.yyleng}</dd>
						{/if}
						<dt>Action</dt>
						<dd>
							{#if step.kind === 'default'}
								<span class="mono">ECHO;</span> <span class="muted">(default rule)</span>
							{:else if action}
								<span class="muted"
									>line {action.line}{action.index !== step.rule
										? `, shared by rule ${step.rule! + 1} with |`
										: ''}</span
								>
								{#if action.actionText}
									<pre class="code"><code>{action.actionText}</code></pre>
								{:else}
									<span class="muted">empty: the match is discarded</span>
								{/if}
							{:else if step.kind === 'eof'}
								<span class="mono">yyterminate();</span>
							{:else}
								<span class="muted">empty: the match is discarded</span>
							{/if}
						</dd>
						{#if step.yyless !== null}
							<dt><code>yyless</code></dt>
							<dd>
								<span class="mono">yyless({step.yyless})</span>
								<span class="muted"
									>puts back {step.end - step.pos - step.yyless} character{step.end -
										step.pos -
										step.yyless ===
									1
										? ''
										: 's'}</span
								>
							</dd>
						{/if}
						{#if step.next > step.end}
							<dt><code>input()</code></dt>
							<dd class="muted">
								read {step.next - step.end} more character{step.next - step.end === 1 ? '' : 's'}
							</dd>
						{/if}
						{#if step.scAfter !== step.sc}
							<dt><code>BEGIN</code></dt>
							<dd class="mono">{scName(spec, step.sc)} → {scName(spec, step.scAfter)}</dd>
						{/if}
						<dt>Output</dt>
						<dd>
							{#if stepOutput.length}
								<ConsoleView
									output={stepOutput}
									label="Output of this step"
									legend={false}
									maxRows={4}
								/>
							{:else}
								<span class="muted">none</span>
							{/if}
						</dd>
						{#if step.returned !== null}
							<dt>yylex returns</dt>
							<dd class="mono">{formatReturn(step.returned, run.valueNames)}</dd>
						{/if}
					</dl>
				</section>
			</div>

			<section class="so-far" aria-labelledby="so-far-title">
				<h3 id="so-far-title">Output so far</h3>
				<ConsoleView
					output={run.output}
					upTo={step.index}
					current={step.index}
					label="Output up to this step"
					maxRows={10}
				/>
			</section>
		{/if}
		{#if run.truncated}
			<Callout tone="info">
				Only the first {MAX_RECORDED_STEPS.toLocaleString('en-US')} matches are recorded; the Run tab
				shows the whole output.
			</Callout>
		{/if}
	{/if}
</div>

<style>
	.step-view {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.empty {
		margin: 0;
		color: var(--text-2);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.stream {
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-height: 18rem;
		overflow: auto;
		padding: var(--space-4) var(--space-4) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.clip,
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
	}
	.eof {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: var(--text-sm);
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: baseline;
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: var(--text-sm);
	}
	dt {
		color: var(--text-2);
		font-weight: 500;
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
	}
	.muted {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.code {
		margin-top: 4px;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--active-soft);
		box-shadow: inset 2px 0 0 var(--active);
		font-size: 0.8125rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.code code {
		padding: 0;
		border: 0;
		background: none;
	}
</style>
