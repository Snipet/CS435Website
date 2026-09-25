<!--
	L(R) listed in shortlex order up to a chosen length, whether it is finite,
	and how many strings it has of each length.
-->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import StringSetView from '$lib/components/ui/StringSetView.svelte';
	import { formatString } from '$lib/theory/chars';
	import { groupDigits, LIST_LIMIT, type LanguageListing } from './analysis';
	import { MAX_LENGTH_LIMIT } from './state';

	interface Props {
		listing: LanguageListing;
		maxLength: number;
		/** States of the minimal DFA. */
		states: number;
		/** The listing is for an earlier R or length (a newer one is being computed). */
		stale?: boolean;
	}

	let { listing, maxLength = $bindable(), states, stale = false }: Props = $props();

	const uid = $props.id();
	const limited = $derived(listing.strings.length >= LIST_LIMIT);
	/** Every string is longer than the list goes: the shortest one, and its length. */
	const beyond = $derived(
		listing.strings.length === 0 && listing.shortest !== null
			? { text: listing.shortest, length: [...listing.shortest].length }
			: null
	);
	const symbolsText = (n: number) => `${n} ${n === 1 ? 'symbol' : 'symbols'}`;
</script>

<div class="language" aria-busy={stale}>
	<div class={['summary', { 'stale-data': stale }]}>
		{#if listing.empty}
			<Badge tone="reject" mono>L(R) = &#123; &#125;</Badge>
		{:else if listing.finite}
			<Badge tone="info"
				>finite: {groupDigits(listing.total ?? 0n)}
				{listing.total === 1n ? 'string' : 'strings'}</Badge
			>
		{:else}
			<Badge tone="accent">infinite</Badge>
		{/if}
		<span class="states">Minimal DFA: {states} {states === 1 ? 'state' : 'states'}</span>
	</div>

	<div class="length">
		<label for="{uid}-len">Longest string listed</label>
		<span class="slider">
			<input
				id="{uid}-len"
				type="range"
				min="0"
				max={MAX_LENGTH_LIMIT}
				step="1"
				bind:value={maxLength}
				aria-valuetext="{maxLength} {maxLength === 1 ? 'symbol' : 'symbols'}"
			/>
			<output for="{uid}-len" class="value">{maxLength}</output>
		</span>
	</div>

	<div class={['set', { 'stale-data': stale }]}>
		{#if beyond}
			<p class="beyond">
				L(R) has no strings of up to {symbolsText(maxLength)}. Its shortest string has
				{symbolsText(beyond.length)}:
				<span class="formal">{formatString(beyond.text)}</span>.
			</p>
		{:else}
			<StringSetView prefix="L(R) =" strings={listing.strings} more={listing.truncated} />
		{/if}
	</div>
	<p class="caption">
		Shortlex order: shorter strings first, then by symbol. Strings of up to {symbolsText(
			maxLength
		)}{limited ? `; the first ${LIST_LIMIT} are listed` : ''}.
	</p>

	<div class={['counts-wrap', { 'stale-data': stale }]}>
		<table class="counts">
			<caption>Number of strings of each length</caption>
			<thead>
				<tr>
					<th scope="col">Length</th>
					<th scope="col" class="num">Strings</th>
				</tr>
			</thead>
			<tbody>
				{#each listing.counts as c, k (k)}
					<tr>
						<th scope="row">{k}</th>
						<td class={['num', { zero: c === 0n }]}>{groupDigits(c)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.language {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.states {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.length {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.length label {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.slider {
		display: flex;
		flex: 1 1 10rem;
		align-items: center;
		gap: var(--space-3);
		max-width: 18rem;
	}
	input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.value {
		min-width: 2ch;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.set {
		max-height: 17rem;
		overflow-y: auto;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.caption {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.counts-wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.counts {
		width: 100%;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.counts caption {
		padding: 8px 12px 0;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-align: left;
		text-transform: uppercase;
	}
	.counts th,
	.counts td {
		padding: 4px 12px;
		text-align: left;
		white-space: nowrap;
	}
	.counts .num {
		text-align: right;
	}
	.counts thead th {
		padding-top: 6px;
		border-bottom: 1px solid var(--border);
		color: var(--text-3);
		font-weight: 500;
	}
	.counts tbody tr + tr {
		border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
	}
	.counts tbody tr:last-child > * {
		padding-bottom: 6px;
	}
	.counts th[scope='row'] {
		width: 5rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 400;
	}
	.counts td {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.counts td.zero {
		color: var(--text-3);
	}
	.beyond {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.formal {
		color: var(--text);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		overflow-wrap: break-word;
		white-space: pre-wrap;
	}
</style>
