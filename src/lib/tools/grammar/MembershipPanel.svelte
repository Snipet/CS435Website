<!--
	Membership of one token string: ∈ L(G) or ∉ L(G), and for a member its
	parse tree and leftmost derivation. The result is drawn with the tokens it
	was computed for, dimmed while a newer one is on its way.
-->
<script lang="ts">
	import { DerivationChain, ParseTreeView, TokenStream } from '$lib/components/grammar';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Callout from '$lib/components/ui/Callout.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Updating from '$lib/components/ui/Updating.svelte';
	import type { Diagnostic } from '$lib/theory/diagnostics';
	import { PLAIN, type Spelling } from './spelling';
	import { MAX_STEPS, type StepPair } from './state';
	import { MAX_CHAIN_STEPS, MAX_CHECK_TOKENS, MAX_TREE_TOKENS, type MembershipView } from './views';

	interface Props {
		input: string;
		/** Problems of the token string as typed. */
		diagnostics: readonly Diagnostic[];
		/** The last result computed; null before the first one. */
		result: MembershipView | null;
		/** `result` is for an earlier string or grammar. */
		stale: boolean;
		/** Shown instead of a result that could not be computed. */
		failure?: string | null;
		/** The start symbol, for the wording. */
		start: string;
		/** How the symbols are written: as the grammar text writes them. */
		write?: Spelling;
		/** Link to the Ambiguity tool for this grammar and string; null hides it. */
		ambiguityHref?: string | null;
		placeholder?: string;
		/** Loads a derivation into the builder. */
		onload: (pairs: StepPair[]) => void;
	}

	let {
		input = $bindable(),
		diagnostics,
		result,
		stale,
		failure = null,
		start,
		write = PLAIN,
		ambiguityHref = null,
		placeholder,
		onload
	}: Props = $props();

	const errors = $derived(diagnostics.filter((d) => d.severity === 'error'));
	const error = $derived(
		errors.length === 0
			? undefined
			: errors.length === 1
				? errors[0].message
				: `${errors[0].message} (and ${errors.length - 1} more)`
	);

	/** The string as typed has problems: no result belongs to it. */
	const invalid = $derived(errors.length > 0);
	const shown = $derived(!invalid && !failure && result && result.verdict !== 'invalid');
	const tokens = $derived(result ? result.tokens.map(write.symbol) : []);
	const member = $derived(result?.verdict === 'member');
	/**
	 * A non-terminal that derives itself and stands in a parse tree of the
	 * string: the trees are then infinitely many, and the ones counted are those
	 * without a node repeated above itself.
	 */
	const cycle = $derived(result && result.cycle !== null ? write.symbol(result.cycle) : null);
	const treeCount = $derived.by(() => {
		if (!result || result.trees === 0) return null;
		if (result.trees === 1 && !result.moreTrees) return 'It has one parse tree.';
		const n = result.moreTrees ? `more than ${result.trees}` : String(result.trees);
		return `It has ${n} parse trees; the first is drawn.`;
	});
	/** More than one parse tree: the Ambiguity tool has something to show. */
	const severalTrees = $derived(
		!!result && (result.trees > 1 || result.moreTrees || result.cycle !== null)
	);
	const derivation = $derived(result?.derivation ?? null);
	const tooManySteps = $derived(!!derivation && derivation.pairs.length > MAX_STEPS);

	/** Read out when the verdict changes. */
	const live = $derived.by(() => {
		if (!shown || stale || !result) return '';
		const text = tokens.length ? tokens.join(' ') : 'ε';
		if (result.verdict === 'member') return `${text} is in L(G).`;
		if (result.verdict === 'not-member') return `${text} is not in L(G).`;
		return '';
	});
</script>

<div class="membership">
	<TextField
		label="Token string"
		description="Terminals separated by spaces. Left empty, the string is ε."
		mono
		bind:value={input}
		{error}
		{placeholder}
		spellcheck="false"
		autocapitalize="off"
	/>

	{#if failure && !invalid}
		<Callout tone="warn">{failure}</Callout>
	{:else if shown && result}
		<div class={['result', { 'stale-data': stale }]} aria-busy={stale}>
			<div class="verdict">
				<div class="tokens">
					{#if tokens.length > 0}
						<TokenStream {tokens} ariaLabel="Tokens read" />
					{:else}
						<span class="eps" role="img" aria-label="The empty string">ε</span>
					{/if}
				</div>
				{#if result.verdict === 'too-long'}
					<Badge>not checked</Badge>
				{:else}
					<Badge tone={member ? 'accept' : 'reject'} mono aria-hidden="true">
						{member ? '∈ L(G)' : '∉ L(G)'}
					</Badge>
				{/if}
				{#if stale}<Updating />{/if}
			</div>

			{#if result.verdict === 'too-long'}
				<p class="note">
					Strings of more than {MAX_CHECK_TOKENS} tokens are not checked; this one has {result
						.tokens.length}.
				</p>
			{:else if !member}
				<p class="note">
					No sequence of replacements that starts from <span class="formal">{start}</span> gives this
					string.
				</p>
			{:else if result.tree && derivation}
				{#if treeCount}
					<p class="note">
						{#if cycle !== null}
							It has infinitely many parse trees:
							<span class="formal">{cycle}&nbsp;→+&nbsp;{cycle}</span>, so
							<span class="formal">{cycle}</span> can stand above itself in a tree any number of times.
							The tree drawn has no such repetition.
						{:else}
							{treeCount}
						{/if}
						{#if ambiguityHref && severalTrees}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path and adds the hash -->
							<a class="tool-link" href={stale ? undefined : ambiguityHref}>
								Open in Ambiguity <Icon name="arrow-right" size={14} />
							</a>
						{/if}
					</p>
				{/if}
				<div class="tree">
					<ParseTreeView tree={result.tree} ariaLabel="Parse tree of the token string" />
				</div>
				<section class="derivation" aria-label="Leftmost derivation">
					<h3 class="cap">Leftmost derivation</h3>
					{#if derivation.forms.length > 0}
						<DerivationChain
							forms={derivation.forms}
							steps={derivation.steps}
							nonterminals={derivation.nonterminals}
							ariaLabel="Leftmost derivation of the token string"
						/>
					{:else}
						<p class="note">
							It has {derivation.pairs.length} steps; chains of up to {MAX_CHAIN_STEPS} steps are written
							out.
						</p>
					{/if}
				</section>
				<div class="actions">
					<Button
						size="sm"
						disabled={stale || tooManySteps}
						onclick={() => onload(derivation.pairs)}
					>
						Load into the derivation builder
					</Button>
					{#if tooManySteps}
						<span class="note">The builder keeps up to {MAX_STEPS} steps.</span>
					{/if}
				</div>
			{:else}
				<p class="note">
					The parse tree is drawn for strings of up to {MAX_TREE_TOKENS} tokens; this one has {result
						.tokens.length}.
				</p>
			{/if}
		</div>
	{:else if !invalid}
		<p class="note"><Updating label="Checking…" standalone /></p>
	{/if}
	<p class="visually-hidden" aria-live="polite">{live}</p>
</div>

<style>
	.membership {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.tokens {
		min-width: 0;
		max-width: 100%;
	}
	.eps {
		color: var(--syn-special);
		font-family: var(--font-mono);
		font-size: 1rem;
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.formal {
		color: var(--text);
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: var(--space-2);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	.tool-link:hover {
		text-decoration: underline;
	}
	.tree {
		min-width: 0;
		padding: var(--space-2) 0;
	}
	.derivation {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
</style>
