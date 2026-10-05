<!--
	The rewrite of the grammar: before and after side by side as on slide 39,
	the choice between EBNF and BNF with ε for the result of removing left
	recursion, every change with what it did, the check that the language is
	kept, and the button that hands the result to the parser.
-->
<script lang="ts">
	import { Badge, Button, Callout, CitationTag, Icon, SegmentedControl } from '$lib/components/ui';
	import type { Citation } from '$lib/lectures';
	import GrammarBox from './GrammarBox.svelte';
	import SameStrings, { type Comparison } from './SameStrings.svelte';
	import type {
		ChangeKind,
		NonterminalOrder,
		RecursionKind,
		ResultForm,
		Rewrite
	} from './transform';

	interface Props {
		rewrite: Rewrite;
		/** The check that the grammar as written and this result generate the same strings. */
		comparison: Comparison;
		form: ResultForm;
		order: NonterminalOrder;
		/** N of the grammar as written, to name the two orders. */
		nonterminals?: readonly string[];
		/** The non-terminals of the grammar as written whose rule starts or ends with themselves. */
		kinds?: readonly RecursionKind[];
		/** The parser below is generated from this result. */
		inUse: boolean;
		onuse: () => void;
		/** An option was changed. */
		onchange?: () => void;
		/** Links that open the rewritten grammar in other tools. */
		links?: readonly { title: string; href: string }[];
	}

	let {
		rewrite,
		comparison,
		form = $bindable(),
		order = $bindable(),
		nonterminals = [],
		kinds = [],
		inUse,
		onuse,
		onchange,
		links = []
	}: Props = $props();

	const FORMS: { value: ResultForm; label: string; title: string }[] = [
		{ value: 'ebnf', label: 'EBNF', title: 'S → β { α }' },
		{ value: 'bnf', label: 'BNF with ε', title: 'S → β S’ ; S’ → α S’ | ε' }
	];
	/** The two orders by their names when there are few non-terminals: `S, A` and `A, S`. */
	const orders = $derived.by((): { value: NonterminalOrder; label: string; title: string }[] => {
		const short = nonterminals.length > 0 && nonterminals.length <= 4;
		return [
			{
				value: 'written',
				label: short ? nonterminals.join(', ') : 'As written',
				title: 'The non-terminals in the order the grammar is written in'
			},
			{
				value: 'reversed',
				label: short ? [...nonterminals].reverse().join(', ') : 'Reversed',
				title: 'The non-terminals in the reverse order'
			}
		];
	});
	const KIND: Record<ChangeKind, string> = {
		'left-recursion': 'Left recursion removed',
		substitution: 'Substitution',
		'left-factor': 'Left factored',
		dropped: 'Production dropped'
	};
	/** "See text … for general algorithm". */
	const GENERAL: Citation = { deck: '11', slide: 27 };
	/** "Right recursion implies right associativity. Not a problem for RD." */
	const RIGHT: Citation = { deck: '11', slide: 39 };

	const unchanged = $derived(rewrite.changes.length === 0);
	/** Right-recursive non-terminals whose rule no change speaks of: they stay as they are. */
	const kept = $derived(
		kinds
			.filter((kind) => kind.right && !kind.left)
			.map((kind) => kind.nonterminal)
			.filter((name) => !rewrite.changes.some((change) => change.nonterminal === name))
	);
	const list = (parts: readonly string[]) =>
		new Intl.ListFormat('en', { type: 'conjunction' }).format(parts);
</script>

<div class="rewrite">
	<div class="boxes">
		<GrammarBox label="Before" text={rewrite.before} ebnf />
		<span class="becomes"><Icon name="arrow-right" size={20} label="becomes" /></span>
		<GrammarBox label="After" text={rewrite.text} ebnf />
	</div>

	{#if rewrite.method !== 'none'}
		<div class="options">
			<SegmentedControl
				options={FORMS}
				bind:value={form}
				label="Result as"
				showLabel
				size="sm"
				{onchange}
			/>
			{#if rewrite.method === 'general'}
				<SegmentedControl
					options={orders}
					bind:value={order}
					label="Order of the non-terminals"
					showLabel
					size="sm"
					mono={orders[0].label !== 'As written'}
					{onchange}
				/>
			{/if}
		</div>
	{/if}

	{#if rewrite.method === 'general'}
		<p class="general">
			<Badge tone="info">General algorithm</Badge>
			<span>
				The left recursion goes through more than one non-terminal. The non-terminals are put in an
				order; a non-terminal at the front of a production is replaced by its alternatives when it
				comes earlier in the order; then the immediate left recursion that appears is removed. The
				slides leave this algorithm to the text.
			</span>
			<CitationTag cite={GENERAL} />
		</p>
	{/if}

	{#if unchanged && rewrite.notes.length === 0}
		<p class="nothing">
			Nothing to rewrite: the grammar has no left recursion and no alternatives with a common
			prefix.
		</p>
	{:else if !unchanged}
		<ol class="changes" aria-label="Changes">
			{#each rewrite.changes as change, i (i)}
				<li>
					<div class="what">
						<Badge>{KIND[change.kind]}</Badge>
						{#if change.cite}<CitationTag cite={change.cite} />{/if}
					</div>
					<div class="rules">
						<div class="rule-lines">
							{#each change.before as line, k (k)}<code>{line}</code>{/each}
						</div>
						<span class="to"><Icon name="arrow-right" size={16} label="becomes" /></span>
						<div class="rule-lines after">
							{#each change.after as line, k (k)}<code>{line}</code>{:else}<span class="gone"
									>no rule</span
								>{/each}
						</div>
					</div>
					<p class="text">{change.text}</p>
					{#if change.note}<p class="implies">{change.note}</p>{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if kept.length > 0}
		<p class="kept">
			<span>
				The right recursion of {list(kept)} stays as it is. Right recursion implies right associativity
				and is not a problem for recursive descent: the function calls itself after a token has been matched.
			</span>
			<CitationTag cite={RIGHT} />
		</p>
	{/if}

	{#each rewrite.notes as note, i (i)}
		<Callout tone={note.severity === 'error' ? 'error' : 'warn'}><p>{note.message}</p></Callout>
	{/each}

	{#if !unchanged}
		<SameStrings {comparison} />
	{/if}

	<div class="use">
		<Button variant={inUse ? 'secondary' : 'primary'} disabled={inUse} onclick={onuse}>
			Use this grammar below
		</Button>
		{#if inUse}
			<p class="in-use">
				<Icon name="check" size={16} />
				<span>The parser below is generated from the grammar under “After”.</span>
			</p>
		{:else}
			<span class="hint">The parser below is generated from another grammar.</span>
		{/if}
		{#each links as link (link.href)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- toolLink resolves the path (toolHref) -->
			<a class="open" href={link.href}>{link.title}</a>
		{/each}
	</div>
</div>

<style>
	.rewrite {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.boxes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: start;
	}
	.becomes {
		display: flex;
		justify-content: center;
		color: var(--text-3);
		transform: rotate(90deg);
	}
	@media (min-width: 720px) {
		.boxes {
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		}
		.becomes {
			/* Level with the first line of the boxes, below their captions. */
			padding-top: 2.15rem;
			transform: none;
		}
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-5);
	}
	.general {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.general span {
		flex: 1 1 24rem;
		min-width: 0;
	}
	.nothing {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.kept {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.kept span {
		flex: 1 1 24rem;
		min-width: 0;
	}
	.changes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.changes li {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.rules {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}
	.rule-lines {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.rule-lines code {
		padding: 0;
		border: 0;
		background: none;
		font-size: var(--text-sm);
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.rule-lines.after code {
		font-weight: 650;
	}
	.gone {
		color: var(--text-3);
		font-size: var(--text-sm);
		font-style: italic;
	}
	.to {
		display: flex;
		color: var(--text-3);
	}
	.text,
	.implies {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.text {
		color: var(--text-2);
	}
	.implies {
		padding-left: var(--space-3);
		border-left: 2px solid var(--border-strong);
	}
	.use {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.in-use {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.in-use :global(.icon) {
		flex: none;
		color: var(--accept);
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.open {
		margin-left: auto;
		font-size: var(--text-sm);
	}
</style>
