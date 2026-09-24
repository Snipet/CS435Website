<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import { printFlexPattern, printRegex, refsIn } from '$lib/theory/regex';
	import { toolLink } from '$lib/tools/links';
	import type { FlexSpec } from './spec';
	import { MAX_EXPANDED, expandedSize } from './view';

	const TOO_LONG = 'too long to show';

	interface Props {
		spec: FlexSpec;
		/** Called with a rule index to show it in the editor. */
		onreveal?: (rule: number) => void;
	}

	let { spec, onreveal }: Props = $props();

	const definitions = $derived(
		spec.defs.entries.map((e) => {
			const expanded =
				e.regex && refsIn(e.regex).length
					? expandedSize(e.regex) > MAX_EXPANDED
						? TOO_LONG
						: printRegex(e.regex, { dialect: 'flex', expandRefs: true })
					: null;
			return { name: e.name, text: e.text, expanded };
		})
	);

	const rows = $derived(
		spec.rules.map((r) => {
			const p = r.pattern;
			const size = p ? expandedSize(p.regex) + (p.trailing ? expandedSize(p.trailing) : 0) : 0;
			const expandedText =
				p && size <= MAX_EXPANDED ? printFlexPattern(p, { expandRefs: true }) : p ? TOO_LONG : null;
			const hasRefs =
				!!p &&
				(refsIn(p.regex).length > 0 || (p.trailing !== null && refsIn(p.trailing).length > 0));
			const link =
				p && size <= MAX_EXPANDED && expandedText
					? toolLink('regex', { re: expandedText, dialect: 'flex' })
					: null;
			return { rule: r, expanded: hasRefs ? expandedText : null, link };
		})
	);
	const showSc = $derived(spec.startConditions.length > 0 || spec.rules.some((r) => r.sc));
</script>

<div class="rules-view">
	{#if definitions.length}
		<section aria-labelledby="defs-title">
			<h3 id="defs-title">Definitions</h3>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Name</th>
							<th scope="col">Pattern</th>
							<th scope="col">With {'{NAME}'} expanded</th>
						</tr>
					</thead>
					<tbody>
						{#each definitions as d (d.name)}
							<tr>
								<th scope="row" class="mono name">{d.name}</th>
								<td class="mono">{d.text}</td>
								<td class="mono">
									{#if d.expanded}{d.expanded}{:else}<span class="same">same</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<section aria-labelledby="rules-title">
		<h3 id="rules-title">Rules <span class="count">{spec.rules.length}</span></h3>
		{#if spec.rules.length === 0}
			<p class="empty">The rules section is empty.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Rule</th>
							{#if showSc}<th scope="col">Start conditions</th>{/if}
							<th scope="col">Pattern</th>
							<th scope="col">With {'{NAME}'} expanded</th>
							<th scope="col">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.rule.index)}
							{@const r = row.rule}
							<tr>
								<th scope="row">
									<button
										type="button"
										class="num-chip"
										style={toneStyle(r.index)}
										title="Show rule {r.index + 1} in the editor (line {r.line})"
										onclick={() => onreveal?.(r.index)}
										aria-label="Rule {r.index + 1}, line {r.line}: show in the editor"
									>
										{r.index + 1}
									</button>
								</th>
								{#if showSc}
									<td class="mono sc">{r.sc ? `<${r.sc.join(',')}>` : 'INITIAL, %s'}</td>
								{/if}
								<td class="mono">{r.patternText}</td>
								<td class="mono expanded">
									{#if row.expanded}
										<span>{row.expanded}</span>
									{:else if r.eof}
										<span class="same">end of input</span>
									{:else}
										<span class="same">same</span>
									{/if}
									{#if row.link}
										<!-- toolLink builds the path with resolve(). -->
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
										<a class="open" href={row.link} title="Open this pattern in the regex tool">
											Open in Regex <Icon name="arrow-right" size={13} />
										</a>
									{/if}
								</td>
								<td class="mono action">
									{#if r.bar}
										<span class="same">| (same action as rule {r.actionRule + 1})</span>
									{:else if r.actionText}
										<code>{r.actionText}</code>
									{:else}
										<span class="same">empty (discard)</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.rules-view {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-base);
	}
	.count {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 400;
	}
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	table {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	th,
	td {
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}
	thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	tbody th {
		font-weight: 400;
	}
	/* break-word, not anywhere: a column is never squeezed narrower than its longest token. */
	.mono {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		overflow-wrap: break-word;
	}
	.name {
		color: var(--syn-name);
		font-weight: 600;
		white-space: nowrap;
	}
	.sc {
		color: var(--epsilon);
		white-space: nowrap;
	}
	.same {
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
	.expanded {
		min-width: 12rem;
	}
	.expanded > span {
		display: block;
	}
	.open {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		margin-top: 4px;
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.open:hover {
		text-decoration: underline;
	}
	.action {
		min-width: 14rem;
	}
	.action code {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		padding: 0;
		border: 0;
		background: none;
		white-space: pre-wrap;
	}
	.num-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6rem;
		height: 1.35rem;
		padding: 0 5px;
		border: 0;
		border-radius: 999px;
		background: var(--tone-bg);
		color: var(--tone-fg);
		font-size: var(--text-xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.num-chip:hover {
		box-shadow: 0 0 0 1px var(--tone-fg);
	}
	.empty {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
</style>
