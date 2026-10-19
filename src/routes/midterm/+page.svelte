<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		browserStorage,
		canWrite,
		readFlags,
		readIds,
		storageKey,
		writeFlags,
		writeIds,
		type KeyValueStore
	} from '$lib/checklist';
	import Button from '$lib/components/ui/Button.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { pageTitle } from '$lib/site';
	import {
		DEFAULT_VIEW,
		completeLines,
		groups,
		knownIds,
		lines,
		linesUnder,
		shownLines,
		tally,
		tallyText,
		withCheck,
		type Line,
		type Tally,
		type View
	} from './checklist';
	import {
		EXAM,
		KIND_LABELS,
		STAR_NOTE,
		SUMMARY,
		TITLE,
		chipsFor,
		isInline,
		sectionStars,
		sectionTitle,
		type Stars,
		type TopicLink
	} from './topics';

	const STAR_TEXT: Record<Stars, string> = { 0: '', 1: 'One asterisk', 2: 'Two asterisks' };

	/** Where the checks and the view options are kept in the browser. */
	const CHECKS_KEY = storageKey('midterm-checklist', 1);
	const VIEW_KEY = storageKey('midterm-checklist-view', 1);

	let activeId = $state(groups[0].section.id);

	/*
	 * Checks and view options. The page is prerendered with nothing checked and
	 * the default view; the stored ones are read once it is mounted.
	 */
	let checked = $state.raw<ReadonlySet<string>>(new Set());
	let view = $state<View>({ ...DEFAULT_VIEW });
	/** False when the browser does not keep what the page stores: checks then last as long as the page. */
	let saving = $state(true);
	let store: KeyValueStore | null = null;

	let confirming = $state(false);
	/** Read out by screen readers: what an action did that the page does not show where the focus is. */
	let status = $state('');

	let content: HTMLElement | undefined = $state();
	let countEl: HTMLElement | undefined = $state();
	let clearEl: HTMLButtonElement | undefined = $state();
	let cancelEl: HTMLButtonElement | undefined = $state();

	const visible = $derived(shownLines(checked, view));
	const complete = $derived(completeLines(checked));
	const overall = $derived(tally(lines, checked, view));
	const groupTallies = $derived(
		new Map(groups.map((g) => [g.section.id, tally(g.lines, checked, view)]))
	);

	const percent = (t: Tally) => (t.total === 0 ? 0 : (100 * t.checked) / t.total);
	const isFull = (t: Tally) => t.total > 0 && t.checked === t.total;

	function saveChecks() {
		if (!writeIds(store, CHECKS_KEY, checked)) saving = false;
	}

	function saveView() {
		if (!writeFlags(store, VIEW_KEY, view, DEFAULT_VIEW)) saving = false;
	}

	function setView(change: Partial<View>) {
		Object.assign(view, change);
		saveView();
	}

	async function toggle(line: Line, input: HTMLInputElement) {
		const on = input.checked;
		const next = withCheck(checked, line.id, on);
		// A line checked while checked lines are hidden goes away: the focus moves on to
		// the next checkbox still there (or the one before it).
		const focused = document.activeElement === input;
		const boxes =
			on && view.hideChecked && content
				? [...content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
				: null;
		checked = next;
		saveChecks();
		if (!boxes) return;
		await tick();
		if (input.isConnected) return;
		status = `Checked and hidden: ${line.topic.text}`;
		if (!focused) return;
		const at = boxes.indexOf(input);
		const target =
			boxes.slice(at + 1).find((b) => b.isConnected) ??
			boxes
				.slice(0, at)
				.reverse()
				.find((b) => b.isConnected);
		(target ?? countEl)?.focus();
	}

	async function askClear() {
		confirming = true;
		await tick();
		cancelEl?.focus();
	}

	async function cancelClear() {
		confirming = false;
		await tick();
		clearEl?.focus();
	}

	function escapeClear(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		void cancelClear();
	}

	async function clearChecks() {
		checked = new Set();
		saveChecks();
		confirming = false;
		status = 'Checks cleared.';
		await tick();
		countEl?.focus();
	}

	onMount(() => {
		store = browserStorage();
		const ids = readIds(store, CHECKS_KEY);
		const flags = readFlags(store, VIEW_KEY, DEFAULT_VIEW);
		saving = ids !== null && canWrite(store);
		// Ids of lines that are no longer on the list are left out.
		if (ids?.size) checked = knownIds(ids);
		if (flags) Object.assign(view, flags);
		// The browser has scrolled to a group named in the URL before lines above it were left out.
		const target = location.hash.length > 1 ? location.hash.slice(1) : null;
		if (target && (view.hideChecked || view.starredOnly)) {
			void tick().then(() => document.getElementById(target)?.scrollIntoView());
		}

		// Checks made in another tab of this page.
		const onStorage = (e: StorageEvent) => {
			if (!store || e.storageArea !== store) return;
			if (e.key === null || e.key === CHECKS_KEY) {
				const stored = readIds(store, CHECKS_KEY);
				if (stored) checked = knownIds(stored);
			}
			if (e.key === null || e.key === VIEW_KEY) {
				const stored = readFlags(store, VIEW_KEY, DEFAULT_VIEW);
				if (stored) Object.assign(view, stored);
			}
		};
		addEventListener('storage', onStorage);
		return () => removeEventListener('storage', onStorage);
	});

	onMount(() => {
		const elements = groups
			.map((g) => document.getElementById(g.section.id))
			.filter((el): el is HTMLElement => el !== null);
		// A link from the table of contents puts a group just under the sticky header
		// (scroll-padding-top). The current group is the last one that starts at or above
		// a line a little below that, so a short group is current once it is scrolled to;
		// at the bottom of the page it is the last group.
		const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
		const line = (Number.isFinite(padding) ? padding : 72) + 24;
		const update = () => {
			let current = elements[0];
			for (const g of elements) if (g.getBoundingClientRect().top <= line) current = g;
			const root = document.documentElement;
			if (root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2) {
				current = elements[elements.length - 1];
			}
			if (current) activeId = current.id;
		};
		update();
		addEventListener('scroll', update, { passive: true });
		addEventListener('resize', update);
		return () => {
			removeEventListener('scroll', update);
			removeEventListener('resize', update);
		};
	});
</script>

<svelte:head>
	<title>{pageTitle(TITLE)}</title>
	<meta name="description" content={SUMMARY} />
</svelte:head>

{#snippet stars(n: Stars)}
	{#if n > 0}<span class="stars" aria-hidden="true">{'★'.repeat(n)}</span><span
			class="visually-hidden">{STAR_TEXT[n]}:</span
		>{/if}
{/snippet}

<!-- A line's checkbox, labeled with the line's text. -->
{#snippet check(line: Line)}
	{@const on = checked.has(line.id)}
	<label class="check">
		<input
			type="checkbox"
			checked={on}
			aria-describedby={line.sub.length ? `under-${line.index}` : undefined}
			onchange={(e) => toggle(line, e.currentTarget)}
		/><span class="print-box" aria-hidden="true">{on ? '☑' : '☐'}</span><span class="text"
			>{line.topic.text}</span
		>
	</label>
{/snippet}

<!-- How many of the lines under a line are checked, read with its checkbox. -->
{#snippet under(line: Line)}
	{#if line.sub.length}
		{@const all = linesUnder(line)}
		<span class="visually-hidden" id="under-{line.index}"
			>{all.filter((l) => checked.has(l.id)).length} of {all.length}
			{all.length === 1 ? 'line' : 'lines'} under it checked</span
		>
	{/if}
{/snippet}

{#snippet meter(t: Tally)}
	<span class={['meter', { full: isFull(t) }]} aria-hidden="true"
		><span class="meter-fill" style:width="{percent(t)}%"></span></span
	>
{/snippet}

{#snippet chips(links: readonly TopicLink[])}
	{@const list = chipsFor(links)}
	{#if list.length}
		<ul class="chips">
			{#each list as chip (chip.href)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chipFor resolves the path (toolHref, toolLink, resolve) -->
					<a class="chip" href={chip.href}>
						<span class="chip-parts">
							<span class="chip-part">
								<span class="chip-kind">{KIND_LABELS[chip.kind]}:</span>
								<span class="chip-name">{chip.name}</span>
							</span>
							{#if chip.example}
								<span class={['chip-part', 'chip-example', { code: chip.code }]}
									>{chip.example}</span
								>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet row(line: Line, depth: number)}
	<!-- Points are run on one line only directly under a topic; inside rows of points they are rows too. -->
	{@const inline = depth === 0 && isInline(line.topic.sub)}
	{@const sub = line.sub.filter((s) => visible.shown.has(s.id))}
	<li
		class={[
			'row',
			{
				nested: depth > 0,
				context: !visible.matched.has(line.id),
				complete: complete.has(line.id)
			}
		]}
		style:--depth={depth}
	>
		<div class="line">
			<span class="mark">{@render stars(line.topic.stars)}</span>
			<div class="what">
				{@render check(line)}
				{@render under(line)}
				{#if sub.length && inline}
					<ul class="points">
						{#each sub as point (point.id)}
							<li
								class={[
									{
										context: !visible.matched.has(point.id),
										complete: complete.has(point.id)
									}
								]}
							>
								{@render stars(point.topic.stars)}{@render check(point)}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			{@render chips(line.topic.links)}
		</div>
		{#if sub.length && !inline}
			<ul class="rows">
				{#each sub as point (point.id)}{@render row(point, depth + 1)}{/each}
			</ul>
		{/if}
	</li>
{/snippet}

{#snippet toc()}
	<ol class="toc-list">
		{#each groups as group (group.section.id)}
			{@const section = group.section}
			{@const n = sectionStars(section)}
			{@const done = isFull(groupTallies.get(section.id)!)}
			<li>
				<a href="#{section.id}" aria-current={activeId === section.id ? 'location' : undefined}>
					<span class="toc-text">
						{#each section.heads as head, i (head.text)}
							<span
								>{head.text}{#if i < section.heads.length - 1}<span class="visually-hidden">;</span
									>{/if}</span
							>
						{/each}
					</span>
					{#if n > 0}<span class="toc-stars" aria-hidden="true">{'★'.repeat(n)}</span>{/if}
					{#if done}<span class="toc-done" aria-hidden="true">✓</span><span class="visually-hidden"
							>(all checked)</span
						>{/if}
				</a>
			</li>
		{/each}
	</ol>
{/snippet}

<div class="midterm">
	<header class="page-head">
		<h1>{TITLE}</h1>
		<p class="lede">{SUMMARY}</p>
	</header>

	<div class="about">
		<p class="exam"><span class="exam-label">Exam:</span> {EXAM}</p>
		<div class="legend">
			<ul class="legend-keys" aria-label="Legend">
				<li><span class="stars">★</span> one asterisk in the list</li>
				<li><span class="stars">★★</span> two asterisks</li>
			</ul>
			<p class="legend-note">The list: “{STAR_NOTE}”</p>
		</div>
	</div>

	<div class="checklist" role="region" aria-labelledby="checklist-title">
		<div class="tally">
			<p class="checklist-title" id="checklist-title">Checklist</p>
			<p class="count" tabindex="-1" bind:this={countEl}>{tallyText(overall, view)}</p>
			{@render meter(overall)}
		</div>
		<div class="options">
			<Toggle
				label="Hide checked lines"
				bind:checked={view.hideChecked}
				onchange={(on) => setView({ hideChecked: on })}
			/>
			<Toggle
				label="Only starred lines"
				bind:checked={view.starredOnly}
				onchange={(on) => setView({ starredOnly: on })}
			/>
		</div>
		<p class="saved">
			{#if saving}
				Checks are saved in this browser only.
			{:else}
				This browser does not keep the checks: they last until the page is closed or reloaded.
			{/if}
		</p>
		<div class="clear" role="group" aria-label="Clear checks">
			{#if confirming && checked.size > 0}
				<span class="confirm" id="clear-question"
					>Clear all {checked.size}
					{checked.size === 1 ? 'check' : 'checks'}?</span
				>
				<Button
					variant="primary"
					size="sm"
					aria-describedby="clear-question"
					onclick={clearChecks}
					onkeydown={escapeClear}>Clear checks</Button
				>
				<Button
					variant="ghost"
					size="sm"
					bind:element={cancelEl}
					onclick={cancelClear}
					onkeydown={escapeClear}>Cancel</Button
				>
			{:else}
				<Button size="sm" bind:element={clearEl} disabled={checked.size === 0} onclick={askClear}
					>Clear checks</Button
				>
			{/if}
		</div>
		<p class="visually-hidden" role="status">{status}</p>
	</div>

	<details class="toc-mobile">
		<summary>On this page</summary>
		<nav aria-label="On this page (compact)">{@render toc()}</nav>
	</details>

	<div class="layout">
		<aside class="toc-side">
			<nav aria-label="On this page">
				<p class="toc-title">On this page</p>
				{@render toc()}
			</nav>
		</aside>

		<div class="content" bind:this={content}>
			{#each groups as group (group.section.id)}
				{@const section = group.section}
				{@const t = groupTallies.get(section.id)!}
				{@const heads = group.heads.filter((h) => visible.shown.has(h.id))}
				{@const topics = group.topics.filter((h) => visible.shown.has(h.id))}
				<section id={section.id} aria-label={sectionTitle(section)}>
					<div class="heads">
						{#each heads as head (head.id)}
							<div
								class={[
									'line',
									{
										context: !visible.matched.has(head.id),
										complete: complete.has(head.id)
									}
								]}
							>
								<h2>
									<span class="mark">{@render stars(head.topic.stars)}</span>
									{@render check(head)}
								</h2>
								{@render under(head)}
								{@render chips(head.topic.links)}
							</div>
						{:else}
							<!-- The view leaves out every line of the group. -->
							<div class="line context">
								<h2><span class="mark"></span><span class="text">{sectionTitle(section)}</span></h2>
							</div>
						{/each}
						<p class="group-tally">
							{#if t.total > 0}
								<span>{tallyText(t, view)}</span>
								{@render meter(t)}
							{:else}
								<span>No starred lines.</span>
							{/if}
						</p>
					</div>
					{#if topics.length}
						<ul class="rows topics">
							{#each topics as topic (topic.id)}{@render row(topic, 0)}{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	</div>
</div>

<style>
	.midterm {
		/* The gutter the stars stand in, left of every line. */
		--mark: 2.25rem;
		/* A checkbox and the space after it: points are indented by this much. */
		--box: 1rem;
		--indent: calc(var(--box) + 0.5rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.page-head {
		max-width: var(--content-width);
	}
	.lede {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-lg);
		line-height: 1.55;
		text-wrap: balance;
	}
	.stars {
		color: var(--accent);
		font-family: var(--font-sans);
		font-size: 0.8125rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	/* Exam line and legend */
	.about {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-6);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.exam {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-lg);
		font-weight: 600;
		white-space: nowrap;
	}
	.exam-label {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.legend {
		display: flex;
		flex: 1 1 18rem;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.legend-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 2px var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.legend-keys .stars {
		margin-right: 4px;
	}
	.legend-note {
		margin: 0;
		color: var(--text-3);
	}

	/* Checklist: progress, view options, clearing */
	.checklist {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.tally {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--space-3);
		min-width: 0;
	}
	.checklist-title {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.count {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.count:focus-visible {
		border-radius: var(--radius-sm);
	}
	.tally > .meter {
		flex: 1 1 8rem;
		max-width: 22rem;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
	}
	.saved {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.clear {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.confirm {
		font-size: var(--text-sm);
		font-weight: 500;
	}
	@media (min-width: 720px) {
		.checklist {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			row-gap: var(--space-2);
		}
		.options,
		.clear {
			justify-content: flex-end;
		}
	}

	/* A slim progress bar. */
	.meter {
		display: block;
		height: 6px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--surface-3);
	}
	.meter-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width var(--duration) var(--ease);
	}
	.meter.full .meter-fill {
		background: var(--accept);
	}

	/* Table of contents */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-7);
	}
	.toc-side {
		display: none;
	}
	.toc-mobile {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.toc-mobile summary {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.toc-mobile nav {
		padding: 0 var(--space-3) var(--space-3);
	}
	.toc-title {
		margin: 0 0 var(--space-2);
		padding-left: 10px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.toc-list {
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: toc;
	}
	.toc-list li {
		counter-increment: toc;
	}
	.toc-list a {
		display: flex;
		gap: 10px;
		padding: 5px 8px;
		border-left: 2px solid transparent;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.35;
		text-decoration: none;
	}
	.toc-list a::before {
		content: counter(toc);
		min-width: 1.1em;
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.toc-list a:hover {
		color: var(--text);
	}
	.toc-list a[aria-current] {
		border-left-color: var(--accent);
		color: var(--text);
		font-weight: 500;
	}
	.toc-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.toc-stars,
	.toc-done {
		flex: none;
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.6;
	}
	.toc-stars {
		color: var(--accent);
	}
	.toc-done {
		color: var(--accept);
		font-weight: 600;
	}
	@media (min-width: 1024px) {
		.layout {
			grid-template-columns: 220px minmax(0, 1fr);
		}
		.toc-side {
			display: block;
		}
		.toc-side nav {
			position: sticky;
			top: calc(56px + var(--space-5));
		}
		.toc-mobile {
			display: none;
		}
	}

	/* The list */
	.content {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
		container-type: inline-size;
	}
	section {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.heads {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border-strong);
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* How many lines of a group are checked, under its heading. */
	.group-tally {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: calc(-1 * var(--space-2)) 0 0;
		padding-left: calc(var(--mark) + var(--indent));
		color: var(--text-3);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
	.group-tally .meter {
		flex: 0 1 8rem;
		height: 4px;
	}

	/*
	 * One line of the list: the stars in the gutter, the checkbox and the text,
	 * and the chips, under the text or (in a wide column) beside it.
	 */
	.line {
		display: grid;
		grid-template-columns: var(--mark) minmax(0, 1fr);
		align-items: baseline;
		row-gap: 6px;
	}
	.line > h2 {
		grid-column: 1 / -1;
	}
	.line > .what,
	.line > .chips {
		grid-column: 2;
	}
	/* Chips under the text start where the text does. */
	.line > .chips {
		padding-left: var(--indent);
	}
	.mark {
		flex: none;
		width: var(--mark);
	}
	h2 {
		display: flex;
		align-items: baseline;
		min-width: 0;
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.3;
	}
	.text {
		min-width: 0;
		overflow-wrap: break-word;
	}
	.row > .line {
		padding: 7px 0;
	}
	.topics > .row + .row {
		border-top: 1px solid var(--border);
	}
	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		min-width: 0;
	}

	/* A checkbox with the line's text as its label. */
	.check {
		display: inline-flex;
		align-items: baseline;
		gap: calc(var(--indent) - var(--box));
		min-width: 0;
		cursor: pointer;
	}
	.check input {
		flex: none;
		position: relative;
		top: 0.15em;
		width: var(--box);
		height: var(--box);
		margin: 0;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.print-box {
		display: none;
	}
	/* Checked, with every line under it checked. */
	.complete > .line .text,
	.complete > h2 .text,
	.complete > .check .text {
		color: var(--text-3);
	}
	/* Shown only for the lines under it that the view shows. */
	.context > .line,
	.line.context,
	.points > .context {
		opacity: 0.6;
	}

	/* Points under a topic: on one line, or as rows of their own. */
	.points {
		display: flex;
		flex-wrap: wrap;
		gap: 2px var(--space-4);
		margin: 2px 0 0;
		padding: 0 0 0 var(--indent);
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
		list-style: none;
	}
	.points > li {
		min-width: 0;
	}
	.points .stars {
		margin-right: 3px;
	}
	.row.nested > .line {
		padding: 3px 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.row.nested > .line > .what {
		padding-left: calc(var(--depth) * var(--indent));
	}
	.row.nested > .line > .chips {
		padding-left: calc((var(--depth) + 1) * var(--indent));
	}
	.topics > .row > .rows {
		padding-bottom: 6px;
	}

	/* Chips */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chips li {
		display: flex;
		min-width: 0;
	}
	.chip {
		display: inline-flex;
		min-width: 0;
		padding: 3px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		font-size: 0.8125rem;
		line-height: 1.5;
		text-decoration: none;
		transition:
			border-color var(--duration) var(--ease),
			background var(--duration) var(--ease);
	}
	.chip:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--text);
	}

	/*
	 * The parts of a chip on one line with a dot between them. Each part carries
	 * its dot in its left padding. The parts are shifted left by that padding and
	 * clipped there, so the first part of every line, also after a wrap, starts
	 * without a dot.
	 */
	.chip-parts {
		--dot: 14px;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		min-width: 0;
		margin: 0 0 0 calc(-1 * var(--dot));
		clip-path: inset(0 0 0 var(--dot));
	}
	.chip-part {
		position: relative;
		min-width: 0;
		padding-left: var(--dot);
	}
	.chip-example::before {
		position: absolute;
		left: 0;
		width: var(--dot);
		color: var(--text-3);
		font-family: var(--font-sans);
		text-align: center;
		content: '·';
		content: '·' / '';
	}
	.chip-kind {
		color: var(--text-3);
	}
	.chip-name {
		color: var(--accent);
		font-weight: 500;
	}
	/* What the tool opens on: "Scanner Rules · new foo". */
	.chip-example {
		color: var(--text-2);
	}
	.chip-example.code {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-ligatures: none;
	}

	/* A wide column: the chips stand beside the text. */
	@container (min-width: 640px) {
		.line {
			grid-template-columns: var(--mark) minmax(0, 1fr) minmax(0, 50%);
		}
		.line > h2 {
			grid-column: 1 / 3;
		}
		.line > .chips,
		.row.nested > .line > .chips {
			grid-column: 3;
			padding-left: var(--space-4);
		}
		/* Without chips the text may run the whole width. */
		.line > h2:last-child,
		.line > .what:last-child {
			grid-column-end: -1;
		}
	}

	/*
	 * Printed: the list with ☐ and ☑ for the checkboxes, in the paper's own
	 * colors (system colors under a light scheme) whatever the theme.
	 */
	@media print {
		.midterm {
			--surface: Canvas;
			--surface-2: Canvas;
			--surface-3: Canvas;
			--text: CanvasText;
			--text-2: CanvasText;
			--text-3: GrayText;
			--accent: CanvasText;
			--accept: CanvasText;
			--border: GrayText;
			--border-strong: GrayText;
			color-scheme: light;
			color: CanvasText;
		}
		.options,
		.saved,
		.clear,
		.meter,
		.toc-side,
		.toc-mobile,
		.chips {
			display: none;
		}
		.checklist,
		.about {
			border: none;
			padding: 0;
		}
		.layout {
			display: block;
		}
		.check input {
			display: none;
		}
		.print-box {
			display: inline;
			font-family: var(--font-sans);
			font-size: 1.15em;
			line-height: 1;
		}
		.context > .line,
		.line.context,
		.points > .context {
			opacity: 1;
		}
		.line {
			break-inside: avoid;
		}
	}
</style>
