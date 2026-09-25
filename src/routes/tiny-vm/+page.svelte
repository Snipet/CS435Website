<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import {
		Badge,
		Callout,
		CitationTag,
		CodeEditor,
		Disclosure,
		IconButton,
		Panel,
		PresetMenu,
		SegmentedControl,
		Tabs,
		TextField,
		ToolPage,
		keyToCommand,
		type Tone
	} from '$lib/components/ui';
	import { hasErrors } from '$lib/theory/diagnostics';
	import { tool } from '$lib/tools/catalog/tiny-vm';
	import { syncToHash } from '$lib/url-state';
	import CodeListing from '$lib/tools/tiny-vm/CodeListing.svelte';
	import ConsoleView from '$lib/tools/tiny-vm/ConsoleView.svelte';
	import DataMemory from '$lib/tools/tiny-vm/DataMemory.svelte';
	import InPrompt from '$lib/tools/tiny-vm/InPrompt.svelte';
	import InputQueueView from '$lib/tools/tiny-vm/InputQueueView.svelte';
	import InstructionMemory from '$lib/tools/tiny-vm/InstructionMemory.svelte';
	import MachineControls from '$lib/tools/tiny-vm/MachineControls.svelte';
	import RegisterFile from '$lib/tools/tiny-vm/RegisterFile.svelte';
	import InstructionSet from '$lib/tools/tiny-vm/InstructionSet.svelte';
	import { appendInput, inputError, parseInputs } from '$lib/tools/tiny-vm/input';
	import { DADDR_SIZE, IADDR_SIZE, PC_REG } from '$lib/tools/tiny-vm/machine';
	import { highlightTM, parseTM, parseTMCached, programKey } from '$lib/tools/tiny-vm/parse';
	import { presetById, presets, type TinyVmPreset } from '$lib/tools/tiny-vm/presets';
	import { SCROLL_REGION_ATTR } from '$lib/tools/tiny-vm/scroll-region';
	import {
		defaultState,
		isTinyVmHash,
		normalizeState,
		stateFromPreset,
		type TinyVmState
	} from '$lib/tools/tiny-vm/state';
	import { STEP_TM, stepTMFocus, stepTMLines } from '$lib/tools/tiny-vm/steptm';
	import { MAX_TRACE, RUN_BUDGET, Trace } from '$lib/tools/tiny-vm/trace';
	import {
		PHASES,
		STATUS_TEXT,
		atRunLimit,
		back,
		currentAddress,
		describe,
		forward,
		jumpTarget,
		memoryAddress,
		run,
		snapToInstruction,
		viewAt,
		waitPosition,
		type Granularity,
		type ViewStatus
	} from '$lib/tools/tiny-vm/view';

	let vm = $state<TinyVmState>(defaultState());

	syncToHash(() => vm, {
		onLoad: (v) => apply(normalizeState(v)),
		validate: isTinyVmHash
	});

	// Program, input, and the run they determine.
	const parsed = $derived(parseTMCached(vm.program));
	const broken = $derived(hasErrors(parsed.diagnostics));
	const queue = $derived(parseInputs(vm.input));
	const queueError = $derived(inputError(queue));
	const trace = $derived(new Trace(parsed.program, queue.values));

	// The machine at the current position.
	const view = $derived(viewAt(trace, broken ? 0 : vm.step, vm.mode));
	const t = $derived(view.t);
	const caption = $derived(describe(view, vm.mode));
	const canBack = $derived(!broken && t > 0);
	const canStep = $derived(!broken && forward(trace, t, vm.mode) !== t);
	/** Step and Run stay usable at an IN that needs a value: they move focus to its prompt. */
	const canAct = $derived(canStep || (!broken && !!view.waiting));
	// `trace.end` is not reactive: `t` (an argument) makes this update after every Run.
	const atLimit = $derived(atRunLimit(trace, t));
	const current = $derived(currentAddress(view));
	const pc = $derived(view.machine.reg[PC_REG]);
	const consoleNow = $derived(trace.consoleAt(view.executed));
	const latestOutput = $derived(
		view.record?.kind === 'step' && view.phase === 3 ? view.record.index : null
	);

	/** Registers the current instruction reads, marked while it is decoded. */
	const reads = $derived.by((): number[] => {
		const rec = view.record;
		if (!rec || rec.kind !== 'step' || !rec.instr || view.phase !== 2) return [];
		if (rec.cls !== 'RR') return [rec.s];
		switch (rec.instr.op) {
			case 'ADD':
			case 'SUB':
			case 'MUL':
			case 'DIV':
				return [rec.s, rec.t];
			case 'OUT':
				return [rec.r];
			default:
				return [];
		}
	});

	// Presets and the slide's pseudo-code.
	const presetKeys = presets.map((p) => ({
		preset: p,
		key: programKey(parseTM(p.value.program).program)
	}));
	const programId = $derived(programKey(parsed.program));
	const activePreset = $derived(presetById(vm.preset));
	const presetMatches = $derived(
		!!activePreset && presetKeys.find((x) => x.preset === activePreset)?.key === programId
	);
	const pseudo = $derived(
		broken
			? null
			: (presetKeys.find((x) => x.preset.pseudo && x.key === programId)?.preset.pseudo ?? null)
	);
	const pseudoActive = $derived.by(() => {
		const line = current === null ? undefined : pseudo?.lineOf[current];
		return new Set(line === undefined ? [] : [line]);
	});
	const pseudoUpcoming = $derived(current === null ? (pseudo?.lineOf[pc] ?? null) : null);
	const stepTM = $derived(stepTMLines(view, vm.mode));
	const stepTMLine = $derived(stepTMFocus(view));
	const stepTMText = STEP_TM.map((l) => l.text);

	let noteOpen = $state(true);
	let sideTab = $state('pseudo');

	// Controls.
	let playing = $state(false);
	let speed = $state(1);
	/** A Run stopped at an IN; it continues once the value is entered. */
	let resumeRun = $state(false);
	let budgetSpent = $state(false);
	let stepButton: HTMLButtonElement | undefined = $state();
	let promptInput: HTMLInputElement | undefined = $state();

	const unit = $derived(vm.mode === 'phase' ? 'phase' : 'instruction');
	const STEPS_PER_SECOND = 2;

	function settle() {
		budgetSpent = false;
		resumeRun = false;
	}

	function apply(next: TinyVmState) {
		playing = false;
		settle();
		Object.assign(vm, next);
	}

	function loadPreset(p: TinyVmPreset) {
		apply(stateFromPreset(p, vm.mode));
		noteOpen = true;
		sideTab = 'pseudo';
	}

	async function focusPrompt() {
		await tick();
		if (view.waiting) promptInput?.focus();
	}

	function step() {
		settle();
		const next = forward(trace, t, vm.mode);
		if (next !== t) vm.step = next;
		focusPrompt();
	}

	function stepBack() {
		playing = false;
		settle();
		vm.step = back(t, vm.mode);
	}

	function reset() {
		playing = false;
		settle();
		vm.step = 0;
	}

	function runAll() {
		playing = false;
		settle();
		if (view.waiting) {
			// Continue the run once the value is entered.
			resumeRun = true;
			focusPrompt();
			return;
		}
		const r = run(trace, t, vm.mode);
		vm.step = r.t;
		budgetSpent = r.budgetSpent;
		resumeRun = trace.end?.kind === 'waiting' && r.t === waitPosition(trace, vm.mode);
		focusPrompt();
	}

	function togglePlay() {
		if (playing) {
			playing = false;
		} else if (canStep) {
			settle();
			playing = true;
		}
	}

	$effect(() => {
		if (!playing) return;
		const id = setInterval(
			() => {
				const next = forward(trace, t, vm.mode);
				if (next === t) {
					playing = false;
					return;
				}
				vm.step = next;
				if (forward(trace, next, vm.mode) === next) {
					playing = false;
					focusPrompt();
				}
			},
			1000 / (STEPS_PER_SECOND * speed)
		);
		return () => clearInterval(id);
	});

	async function enterInput(value: number) {
		const wait = view.waiting;
		if (!wait) return;
		const resume = resumeRun;
		vm.input = appendInput(vm.input, value);
		vm.step = 3 * (wait.index + 1);
		settle();
		if (resume) runAll();
		await tick();
		if (!view.waiting) stepButton?.focus();
	}

	function setMode(mode: Granularity) {
		settle();
		if (mode === 'instruction') vm.step = snapToInstruction(trace, t);
		vm.mode = mode;
	}

	function onProgramInput() {
		playing = false;
		settle();
		vm.step = 0;
	}

	/**
	 * ←/→ step, Home resets, End runs, Space plays, while focus is in the machine
	 * (except in a box that scrolls: those keys scroll it).
	 */
	const shortcuts: Attachment<HTMLElement> = (node) => {
		const onkeydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			const el = event.target instanceof HTMLElement ? event.target : node;
			if (el.hasAttribute(SCROLL_REGION_ATTR)) return;
			const command = keyToCommand(
				event.key,
				{
					tagName: el.tagName,
					role: el.getAttribute('role'),
					type: el instanceof HTMLInputElement ? el.type : null,
					isContentEditable: el.isContentEditable
				},
				{ ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey }
			);
			if (!command) return;
			event.preventDefault();
			if (command === 'next' && canAct) step();
			else if (command === 'prev' && canBack) stepBack();
			else if (command === 'first' && canBack) reset();
			else if (command === 'last' && canAct) runAll();
			else if (command === 'toggle') togglePlay();
		};
		node.addEventListener('keydown', onkeydown);
		return () => node.removeEventListener('keydown', onkeydown);
	};

	const modeOptions: { value: Granularity; label: string; title: string }[] = [
		{ value: 'instruction', label: 'Instruction', title: 'Each step runs one stepTM call' },
		{
			value: 'phase',
			label: 'Fetch / decode / execute',
			title: 'Each instruction takes three steps'
		}
	];

	const STATUS_TONE: Record<ViewStatus, Tone | 'neutral'> = {
		ready: 'neutral',
		running: 'info',
		waiting: 'active',
		srOKAY: 'neutral',
		srHALT: 'accept',
		srIMEM_ERR: 'reject',
		srDMEM_ERR: 'reject',
		srZERODIVIDE: 'reject'
	};
	const statusCode = $derived(view.status.startsWith('sr') ? view.status : null);

	const loadedRange = $derived.by(() => {
		const e = parsed.program.entries;
		if (!e.length) return 'nothing loaded';
		const n = e.length;
		const span = e[0].addr === e[n - 1].addr ? `${e[0].addr}` : `${e[0].addr}–${e[n - 1].addr}`;
		return `${n} instruction${n === 1 ? '' : 's'} at ${span}`;
	});

	const PROGRAM_PLACEHOLDER = '0:  IN   0,0,0\n1:  OUT  0,0,0\n2:  HALT';

	const sideTabs = [
		{ id: 'pseudo', label: 'Pseudo-code' },
		{ id: 'steptm', label: 'stepTM' }
	];
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu
			{presets}
			selected={presetMatches ? vm.preset : null}
			onselect={loadPreset}
			align="end"
		/>
	{/snippet}

	{#if activePreset && presetMatches && noteOpen}
		<aside class="note" aria-label="About this program">
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
			</div>
			<IconButton icon="x" size="sm" label="Hide this note" onclick={() => (noteOpen = false)} />
		</aside>
	{/if}

	<div class="io">
		<Panel title="Program" subtitle={loadedRange}>
			<CodeEditor
				ariaLabel="TM program"
				bind:value={vm.program}
				diagnostics={parsed.diagnostics}
				highlight={highlightTM}
				language="tm"
				minRows={9}
				maxRows={18}
				wrap={false}
				placeholder={PROGRAM_PLACEHOLDER}
				oninput={onProgramInput}
			/>
			{#snippet footer()}
				<Disclosure summary="Instruction set" openSummary="Hide instruction set">
					<InstructionSet />
				</Disclosure>
			{/snippet}
		</Panel>

		<Panel title="Input">
			<div class="input-body">
				<TextField
					label="Input values"
					description="Integers IN reads, in order; separate them with spaces or commas."
					bind:value={vm.input}
					error={queueError ?? undefined}
					mono
					placeholder="e.g. 3"
					oninput={settle}
				/>
				<InputQueueView values={queue.values} read={view.machine.inPos} />
			</div>
		</Panel>
	</div>

	<section class="machine" aria-label="Machine" {@attach shortcuts}>
		<Panel title="Machine" class="control-panel">
			{#snippet actions()}
				<SegmentedControl
					label="Step by"
					options={modeOptions}
					value={vm.mode}
					size="sm"
					onchange={setMode}
				/>
			{/snippet}
			<div class="control-body">
				<div class="toolbar">
					<MachineControls
						{canBack}
						canStep={canAct}
						canRun={canAct}
						canPlay={canStep}
						{playing}
						{speed}
						{unit}
						onreset={reset}
						onback={stepBack}
						onstep={step}
						onrun={runAll}
						ontoggle={togglePlay}
						onspeed={(s) => (speed = s)}
						bind:stepButton
					/>
					<div class="status">
						<span class="visually-hidden">Status:</span>
						<Badge tone={STATUS_TONE[view.status]} mono={!!statusCode}>
							{statusCode ?? STATUS_TEXT[view.status]}
						</Badge>
						{#if statusCode}<span class="status-text">{STATUS_TEXT[view.status]}</span>{/if}
						<span class="counter">
							<span class="counter-label">Executed</span>
							<span class="counter-value">{view.executed.toLocaleString('en-US')}</span>
						</span>
					</div>
				</div>

				<div
					class={[
						'caption',
						{
							halted: view.status === 'srHALT',
							failed: !!statusCode && view.status !== 'srHALT' && view.status !== 'srOKAY'
						}
					]}
					aria-live={playing ? 'off' : 'polite'}
					aria-atomic="true"
				>
					{#if vm.mode === 'phase'}
						<ol class="phases" aria-hidden="true">
							{#each PHASES as name, i (name)}
								{@const n = i + 1}
								<li
									class={{ done: view.phase > n, now: view.phase === n, pending: view.phase < n }}
								>
									{name}
								</li>
							{/each}
						</ol>
					{/if}
					<p class="caption-text">
						{#if caption.kind === 'instruction'}
							<code class="caption-instr">{caption.label}</code>
						{:else}
							<!-- In phase steps the pills show the phase; screen readers still hear it. -->
							<span
								class={[
									'caption-label',
									caption.kind,
									{ 'visually-hidden': vm.mode === 'phase' && caption.kind === 'phase' }
								]}>{caption.label}</span
							>
						{/if}
						<span class="caption-body">{caption.text}</span>
					</p>
				</div>

				{#if view.waiting && !broken}
					<InPrompt
						wait={view.waiting}
						resumes={resumeRun}
						onsubmit={enterInput}
						bind:element={promptInput}
					/>
				{/if}
				{#if broken}
					<Callout tone="error">
						The program has errors (listed under it). The machine loads it once they are fixed.
					</Callout>
				{:else if atLimit}
					<Callout tone="warn">
						The run stops after {MAX_TRACE.toLocaleString('en-US')} instructions without reaching HALT.
					</Callout>
				{:else if budgetSpent && canStep}
					<Callout tone="warn">
						Run executed {RUN_BUDGET.toLocaleString('en-US')} instructions without reaching HALT. Run
						again to continue.
					</Callout>
				{/if}
			</div>
		</Panel>

		<div class="views">
			<Panel title="Instruction memory" subtitle="iMem, {IADDR_SIZE} cells" class="imem-panel">
				<InstructionMemory
					program={parsed.program}
					{pc}
					{current}
					phase={view.phase}
					target={jumpTarget(view)}
				/>
				<p class="legend">
					<span class="legend-item"
						><span class="key key-pc" aria-hidden="true">→</span> PC (reg[7])</span
					>
					<span class="legend-item"
						><span class="key key-current" aria-hidden="true"></span> instruction of this step</span
					>
					<span class="legend-item"
						><span class="key key-target" aria-hidden="true">m</span> jump target</span
					>
				</p>
			</Panel>

			<div class="state">
				<Panel title="Registers">
					<RegisterFile reg={view.machine.reg} written={view.written} flashKey={t} {reads} />
				</Panel>
				<Panel title="Data memory" subtitle="dMem, {DADDR_SIZE} cells">
					<DataMemory
						dMem={view.machine.dMem}
						address={memoryAddress(view)}
						write={view.memWrite}
						flashKey={t}
					/>
				</Panel>
				<Panel title="Console">
					<ConsoleView
						lines={consoleNow.lines}
						dropped={consoleNow.dropped}
						latest={latestOutput}
					/>
				</Panel>
			</div>

			<Panel title={pseudo ? undefined : 'stepTM'} class="side-panel">
				{#if pseudo}
					<Tabs tabs={sideTabs} bind:value={sideTab} label="Listings">
						{#snippet children(id)}
							{#if id === 'pseudo'}
								<CodeListing
									lines={pseudo.lines}
									active={pseudoActive}
									upcoming={pseudoUpcoming}
									ariaLabel="Pseudo-code"
								/>
								<p class="side-note">The line for the instruction of the current step is marked.</p>
							{:else}
								<CodeListing
									lines={stepTMText}
									active={stepTM.active}
									path={stepTM.path}
									focus={stepTMLine}
									ariaLabel="stepTM"
									size="sm"
									maxHeight="34rem"
								/>
								<p class="side-note">
									<code>iarg1</code> … <code>iarg3</code> stand for
									<code>currentinstruction.iarg1</code> … <code>iarg3</code>. This machine also
									treats pc = {IADDR_SIZE} and m = {DADDR_SIZE} as out of range.
								</p>
							{/if}
						{/snippet}
					</Tabs>
				{:else}
					<CodeListing
						lines={stepTMText}
						active={stepTM.active}
						path={stepTM.path}
						focus={stepTMLine}
						ariaLabel="stepTM"
						size="sm"
						maxHeight="34rem"
					/>
					<p class="side-note">
						<code>iarg1</code> … <code>iarg3</code> stand for
						<code>currentinstruction.iarg1</code> … <code>iarg3</code>. This machine also treats pc
						=
						{IADDR_SIZE} and m = {DADDR_SIZE} as out of range.
					</p>
				{/if}
			</Panel>
		</div>
	</section>
</ToolPage>

<style>
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
		min-width: 0;
	}
	.note-title {
		font-weight: 600;
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
		max-width: var(--content-width);
		font-size: var(--text-sm);
	}

	.io {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	@media (min-width: 900px) {
		.io {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}
	.input-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.machine {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	.machine :global(.control-panel) {
		position: sticky;
		top: calc(56px + var(--space-3));
		z-index: 5;
		box-shadow: var(--shadow);
	}
	@media (max-width: 759px), (max-height: 700px) {
		.machine :global(.control-panel) {
			position: static;
			box-shadow: var(--shadow-sm);
		}
	}
	.control-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3) var(--space-4);
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
	}
	.status-text {
		color: var(--text-2);
	}
	.counter {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding-left: var(--space-3);
		border-left: 1px solid var(--border);
	}
	.counter-label {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.counter-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.caption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		min-height: 3rem;
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--active);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--surface-2);
	}
	.caption.halted {
		border-left-color: var(--accept);
	}
	.caption.failed {
		border-left-color: var(--reject);
		background: var(--reject-soft);
	}
	.phases {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.phases li {
		position: relative;
		padding: 2px 9px;
		border: 1px dashed var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-3);
	}
	.phases li + li {
		margin-left: 12px;
	}
	.phases li + li::before {
		content: '';
		position: absolute;
		top: 50%;
		left: -13px;
		width: 10px;
		height: 1px;
		background: var(--border-strong);
	}
	.phases li.done {
		border-style: solid;
		color: var(--text-2);
	}
	.phases li.now {
		border-style: solid;
		border-color: var(--active);
		background: var(--active-soft);
		color: var(--text);
	}
	.caption-text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px var(--space-3);
		margin: 0;
		min-width: 0;
		flex: 1 1 20rem;
	}
	.caption-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.caption-label.reset {
		color: var(--text-2);
	}
	.caption-instr {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font-weight: 600;
	}
	.caption-body {
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}

	.views {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	.state {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 760px) {
		.views {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.views :global(.side-panel) {
			grid-column: 1 / -1;
		}
	}
	@media (min-width: 1180px) {
		.views {
			grid-template-columns: minmax(0, 0.95fr) minmax(0, 1fr) minmax(0, 1.1fr);
		}
		.views :global(.side-panel) {
			grid-column: auto;
		}
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
		margin: var(--space-3) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.key {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 16px;
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.key-pc {
		color: var(--accent);
		font-size: 0.9375rem;
	}
	.key-current {
		border-left: 3px solid var(--active);
		background: var(--active-soft);
	}
	.key-target {
		padding: 0 5px;
		border: 1px dashed var(--info);
		border-radius: 999px;
		color: var(--info);
	}
	.side-note {
		margin: var(--space-3) 0 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	@media (max-width: 560px) {
		.note {
			padding: var(--space-3);
		}
		.counter {
			padding-left: 0;
			border-left: 0;
		}
	}
</style>
