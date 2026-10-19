<!--
	How a conflict is settled (Bottom-up Parsing III, slides 19–20): for a
	shift/reduce conflict the rule's precedence (that of its last terminal) and
	the terminal's, slide 19's three conditions for a shift with the ones that
	hold marked, and the outcome in the deck's words.
-->
<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { printSymbols } from '$lib/theory/grammar/parse';
	import type { PrecedenceLine } from './precedence';
	import { SHIFT_IF, type Explanation } from './resolution';
	import { precedenceText } from './view';

	interface Props {
		explanation: Explanation;
		/** The declaration lines, to name the line a precedence comes from. */
		lines: readonly PrecedenceLine[];
	}

	let { explanation, lines }: Props = $props();

	const rule = $derived(explanation.rule);
	const token = $derived(explanation.token);
</script>

<div class="resolution">
	{#if rule && token && explanation.shiftIf}
		<dl class="precedences">
			<div>
				<dt>Rule <span class="f">{rule.text}</span></dt>
				<dd>
					{#if rule.last === null}
						no terminal, so no precedence
					{:else}
						last terminal <span class="f">{printSymbols([rule.last])}</span>:
						{precedenceText(rule.precedence, lines)}
					{/if}
				</dd>
			</div>
			<div>
				<dt>Terminal <span class="f">{printSymbols([token.terminal])}</span></dt>
				<dd>{precedenceText(token.precedence, lines)}</dd>
			</div>
		</dl>
		<p class="lead">Resolve shift/reduce conflict with a <em>shift</em> if</p>
		<ul class="conditions">
			{#each SHIFT_IF as condition, i (condition)}
				{@const holds = explanation.shiftIf[i]}
				<li class={{ holds }}>
					<Icon name={holds ? 'check' : 'x'} size={14} />
					<span class="visually-hidden">{holds ? 'holds:' : 'does not hold:'}</span>
					{condition}
				</li>
			{/each}
		</ul>
	{/if}
	<p class="verdict">
		{explanation.text}{explanation.by === 'default' ? '; bison reports the conflict' : ''}.
	</p>
</div>

<style>
	.resolution {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--text-sm);
	}
	.precedences {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
	}
	/* A pair on one line when it fits; the precedence wraps under a long rule. */
	.precedences div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-3);
	}
	.precedences dt {
		color: var(--text-2);
	}
	.precedences dd {
		margin: 0;
	}
	.f {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.lead,
	.verdict {
		margin: 0;
	}
	.conditions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.conditions li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		color: var(--text-3);
	}
	.conditions li :global(.icon) {
		flex: none;
		align-self: center;
	}
	.conditions li.holds {
		color: var(--text);
	}
	.conditions li.holds :global(.icon) {
		color: var(--accept);
	}
	.verdict {
		font-weight: 600;
	}
</style>
