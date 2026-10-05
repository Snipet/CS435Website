<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
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
		sections,
		type Stars,
		type Topic,
		type TopicLink
	} from './topics';

	const STAR_TEXT: Record<Stars, string> = { 0: '', 1: 'One asterisk', 2: 'Two asterisks' };

	let activeId = $state(sections[0].id);

	onMount(() => {
		const groups = sections
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		// A link from the table of contents puts a group just under the sticky header
		// (scroll-padding-top). The current group is the last one that starts at or above
		// a line a little below that, so a short group is current once it is scrolled to;
		// at the bottom of the page it is the last group.
		const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
		const line = (Number.isFinite(padding) ? padding : 72) + 24;
		const update = () => {
			let current = groups[0];
			for (const g of groups) if (g.getBoundingClientRect().top <= line) current = g;
			const root = document.documentElement;
			if (root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2) {
				current = groups[groups.length - 1];
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

{#snippet row(topic: Topic, depth: number)}
	<!-- Points are run on one line only directly under a topic; inside rows of points they are rows too. -->
	{@const inline = depth === 0 && isInline(topic.sub)}
	<li class={['row', { nested: depth > 0 }]} style:--depth={depth}>
		<div class="line">
			<span class="mark">{@render stars(topic.stars)}</span>
			<div class="what">
				<span class="text">{topic.text}</span>
				{#if topic.sub.length && inline}
					<ul class="points">
						{#each topic.sub as point (point.text)}
							<li>{@render stars(point.stars)}{point.text}</li>
						{/each}
					</ul>
				{/if}
			</div>
			{@render chips(topic.links)}
		</div>
		{#if topic.sub.length && !inline}
			<ul class="rows">
				{#each topic.sub as point (point.text)}{@render row(point, depth + 1)}{/each}
			</ul>
		{/if}
	</li>
{/snippet}

{#snippet toc()}
	<ol class="toc-list">
		{#each sections as section (section.id)}
			{@const n = sectionStars(section)}
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

		<div class="content">
			{#each sections as section (section.id)}
				<section id={section.id} aria-label={sectionTitle(section)}>
					<div class="heads">
						{#each section.heads as head (head.text)}
							<div class="line">
								<h2>
									<span class="mark">{@render stars(head.stars)}</span>
									<span class="text">{head.text}</span>
								</h2>
								{@render chips(head.links)}
							</div>
						{/each}
					</div>
					{#if section.topics.length}
						<ul class="rows topics">
							{#each section.topics as topic (topic.text)}{@render row(topic, 0)}{/each}
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
	.toc-stars {
		flex: none;
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.6;
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

	/*
	 * One line of the list: the stars in the gutter, the text, and the chips,
	 * under the text or (in a wide column) beside it.
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
		gap: 1px;
		min-width: 0;
	}

	/*
	 * Items on one line with a dot between them: the points under a topic, and the
	 * parts of a chip. Each item carries its dot in its left padding. The list is
	 * shifted left by that padding and clipped there, so the first item of every
	 * line, also after a wrap, starts without a dot.
	 */
	.points,
	.chip-parts {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		min-width: 0;
		margin: 0 0 0 calc(-1 * var(--dot));
		padding: 0;
		clip-path: inset(0 0 0 var(--dot));
		list-style: none;
	}
	.points > li,
	.chip-part {
		position: relative;
		min-width: 0;
		padding-left: var(--dot);
	}
	.points > li::before,
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

	/* Points under a topic: on one line, or as rows of their own. */
	.points {
		--dot: 1.5em;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.points .stars {
		margin-right: 3px;
	}
	.row.nested > .line {
		padding: 3px 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.row.nested > .line > .what,
	.row.nested > .line > .chips {
		padding-left: calc(var(--depth) * var(--space-4));
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
	.chip-parts {
		--dot: 14px;
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
</style>
