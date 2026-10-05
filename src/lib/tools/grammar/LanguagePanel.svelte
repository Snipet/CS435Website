<!--
	L(G): whether it is finite, its sentences by length up to a chosen number of
	tokens, and a sentence made by replacing non-terminals with productions
	picked at random.
-->
<script lang="ts">
	import { DerivationChain, TokenStream } from '$lib/components/grammar';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import Updating from '$lib/components/ui/Updating.svelte';
	import { formatStringSet } from '$lib/theory/chars';
	import type { ChainView } from './builder';
	import { RANDOM_DEFAULTS, type RandomSentence } from './random';
	import { PLAIN, type Spelling } from './spelling';
	import { MAX_LENGTH_LIMIT } from './state';
	import { LIST_LIMIT, byLength, type LanguageView } from './views';

	interface Props {
		/** From the grammar alone: L(G) is empty, finite or infinite. */
		size: 'empty' | 'finite' | 'infinite';
		/** The last listing computed; null before the first one. */
		listing: LanguageView | null;
		/** `listing` is for an earlier grammar or length. */
		stale: boolean;
		failure?: string | null;
		maxLength: number;
		/** Every terminal is one character: L(G) is also written as a set of strings. */
		characters: boolean;
		/** How the symbols are written: as the grammar text writes them. */
		write?: Spelling;
		/** The random sentence for the current seed; null before the button is used. */
		random: RandomSentence | null;
		/** Its leftmost derivation, as a chain. */
		randomChain: ChainView | null;
		onrandom: () => void;
		/** Shows a sentence in the Membership panel. */
		onparse: (sentence: string[]) => void;
	}

	let {
		size,
		listing,
		stale,
		failure = null,
		maxLength = $bindable(),
		characters,
		write = PLAIN,
		random,
		randomChain,
		onrandom,
		onparse
	}: Props = $props();

	const uid = $props.id();
	const tokensText = (n: number) => `${n} ${n === 1 ? 'token' : 'tokens'}`;
	const count = new Intl.NumberFormat('en-US');

	/** The groups of one length, each with the index of its first sentence in the whole list. */
	const groups = $derived.by(() => {
		let start = 0;
		return (listing ? byLength(listing.sentences) : []).map((group) => {
			const placed = { ...group, start };
			start += group.items.length;
			return placed;
		});
	});
	const sentenceCount = $derived(listing?.sentences.length ?? 0);

	// The sentences are one tab stop: arrow keys move between them.
	let list: HTMLDivElement | undefined = $state();
	let focusAt = $state(0);
	const tabStop = $derived(Math.min(focusAt, Math.max(0, sentenceCount - 1)));

	function onSentenceKey(event: KeyboardEvent, index: number) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = Math.min(index + 1, sentenceCount - 1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = Math.max(index - 1, 0);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = sentenceCount - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		focusAt = next;
		list?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
	}

	const set = $derived(
		listing && characters
			? formatStringSet(
					listing.sentences.map((s) => s.join('')),
					{ more: listing.more }
				)
			: null
	);
	const total = $derived(listing && !stale ? listing.total : null);
</script>

<div class="language">
	<div class="listing">
		<p class="definition">
			L(G) = &#123; a<sub>1</sub>a<sub>2</sub> … a<sub>n</sub> | S →* a<sub>1</sub>a<sub>2</sub> … a<sub
				>n</sub
			>
			and a<sub>i</sub> ∈ T &#125;
		</p>
		<div class="summary">
			{#if size === 'empty'}
				<Badge tone="reject">empty</Badge>
				<span class="formal">L(G) = &#123; &#125;</span>
			{:else if size === 'finite'}
				<Badge tone="info">
					{#if total !== null}
						finite: {count.format(total)} {total === 1 ? 'sentence' : 'sentences'}
					{:else}
						finite
					{/if}
				</Badge>
			{:else}
				<Badge tone="accent">infinite</Badge>
			{/if}
			{#if stale && !failure}<Updating />{/if}
		</div>

		<div class="length">
			<label for="{uid}-len">Longest sentence listed</label>
			<span class="slider">
				<input
					id="{uid}-len"
					type="range"
					min="0"
					max={MAX_LENGTH_LIMIT}
					step="1"
					bind:value={maxLength}
					aria-valuetext={tokensText(maxLength)}
				/>
				<output for="{uid}-len" class="value">{tokensText(maxLength)}</output>
			</span>
		</div>

		{#if failure}
			<Callout tone="warn">{failure}</Callout>
		{:else if listing}
			<div
				bind:this={list}
				class={['sentences', { 'stale-data': stale }]}
				role="group"
				aria-label="Sentences of L(G)"
				aria-describedby="{uid}-keys"
				aria-busy={stale}
			>
				{#if set}
					<p class="set"><span class="lhs">L(G) =</span> {set}</p>
				{/if}
				{#if groups.length === 0}
					<p class="note">
						{#if size === 'empty'}
							No string of terminals can be derived from the start symbol.
						{:else}
							L(G) has no sentence of up to {tokensText(maxLength)}.
						{/if}
					</p>
				{:else}
					<table class="groups">
						<caption class="visually-hidden">Sentences of L(G) by length</caption>
						<tbody>
							{#each groups as group (group.length)}
								<tr>
									<th scope="row">{tokensText(group.length)}</th>
									<td>
										<ul class="items">
											{#each group.items as sentence, i (i)}
												{@const index = group.start + i}
												<li>
													<button
														type="button"
														class={['sentence', { eps: sentence.length === 0 }]}
														title="Parse in the Membership panel"
														tabindex={index === tabStop ? 0 : -1}
														data-index={index}
														onclick={() => onparse(sentence)}
														onkeydown={(event) => onSentenceKey(event, index)}
														onfocus={() => (focusAt = index)}>{write.symbols(sentence)}</button
													>
												</li>
											{/each}
										</ul>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
			<p class="caption">
				Shorter sentences first; within one length, in the order of T.
				{#if listing.cut}The first {LIST_LIMIT} are listed.{/if}
				A sentence opens in the Membership panel when it is selected.
				<span class="visually-hidden" id="{uid}-keys">Arrow keys move between the sentences.</span>
			</p>
		{:else}
			<p class="note"><Updating label="Listing L(G)…" standalone /></p>
		{/if}
	</div>

	<section class="random" aria-label="Random sentence">
		<div class="random-head">
			<Button size="sm" onclick={onrandom} disabled={size === 'empty'}>Random sentence</Button>
		</div>
		{#if random?.ok && randomChain}
			<div class="random-line">
				{#if random.sentence.length > 0}
					<TokenStream tokens={random.sentence.map(write.symbol)} ariaLabel="Random sentence" />
				{:else}
					<span class="eps-big" role="img" aria-label="The empty string">ε</span>
				{/if}
				<Button variant="ghost" size="sm" onclick={() => onparse(random.sentence)}>Parse</Button>
			</div>
			<h3 class="cap">Its leftmost derivation</h3>
			<DerivationChain
				forms={randomChain.forms}
				steps={randomChain.steps}
				nonterminals={randomChain.nonterminals}
				ariaLabel="Leftmost derivation of the random sentence"
			/>
		{:else if random && !random.ok}
			<p class="note">
				{#if random.reason === 'empty'}
					L(G) is empty: there is no sentence to make.
				{:else}
					Every expansion found for this grammar is too large to show.
				{/if}
			</p>
		{:else}
			<p class="note">No sentence drawn yet.</p>
		{/if}
		<p class="caption">
			Starting from the start symbol, each non-terminal is replaced with one of its productions,
			picked at random down to depth {RANDOM_DEFAULTS.maxDepth}; deeper non-terminals take their
			shortest expansion.
		</p>
	</section>
</div>

<style>
	.language {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	@media (min-width: 1000px) {
		.language {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
			gap: var(--space-6);
		}
		.random {
			padding-left: var(--space-6);
			border-left: 1px solid var(--border);
		}
	}
	@media (max-width: 999.98px) {
		.random {
			padding-top: var(--space-4);
			border-top: 1px solid var(--border);
		}
	}
	.listing,
	.random {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.definition {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.definition sub {
		font-size: 0.72em;
		line-height: 0;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-height: 22px;
	}
	.formal {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
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
		flex: 1 1 12rem;
		align-items: center;
		gap: var(--space-3);
		max-width: 22rem;
	}
	input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.value {
		min-width: 9ch;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}
	.sentences {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-height: 19rem;
		overflow-y: auto;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.set {
		margin: 0;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.lhs {
		color: var(--text-2);
	}
	.groups {
		width: 100%;
	}
	.groups th {
		width: 5.5rem;
		padding: 5px var(--space-3) 5px 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 500;
		text-align: left;
		vertical-align: top;
		white-space: nowrap;
	}
	.groups td {
		padding: 2px 0;
	}
	.groups tr + tr th,
	.groups tr + tr td {
		border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
	}
	.items {
		display: flex;
		flex-wrap: wrap;
		gap: 2px var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.items li {
		min-width: 0;
		max-width: 100%;
	}
	.sentence {
		max-width: 100%;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-ligatures: none;
		text-align: left;
		overflow-wrap: anywhere;
		cursor: pointer;
	}
	.sentence:hover {
		border-color: var(--border-strong);
		background: var(--surface);
	}
	.sentence.eps {
		color: var(--syn-special);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.caption {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	.random-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		min-height: 30px;
	}
	.cap {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.5;
		text-transform: uppercase;
	}
	.random-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.eps-big {
		color: var(--syn-special);
		font-family: var(--font-mono);
	}
</style>
