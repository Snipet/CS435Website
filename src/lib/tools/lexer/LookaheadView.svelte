<!--
	The Lookahead tab: the scanner reads one character at a time from the
	token start. The input splits into consumed | lookahead | unread, and every
	rule is a complete match, a viable prefix, or dead.
-->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import StepControls from '$lib/components/ui/StepControls.svelte';
	import type { Stepper } from '$lib/components/ui/stepper.svelte';
	import { toneStyle } from '$lib/components/ui/tones';
	import type { HighlightRange } from '$lib/components/ui/types';
	import type { TokenFormat } from '$lib/components/ui/token-format';
	import { formatString } from '$lib/theory/chars';
	import {
		describeLookahead,
		longestSoFar,
		lookaheadPoint,
		ruleMachine,
		standingsAt,
		type LookaheadIndex,
		type RuleStanding
	} from './lookahead';
	import { advance, lexAlphabet, type LexRun } from './scan';
	import type { LexSpec } from './spec';

	interface Props {
		spec: LexSpec;
		run: LexRun;
		index: LookaheadIndex;
		stepper: Stepper;
		errorRule: boolean;
		format: TokenFormat;
	}

	let { spec, run, index, stepper, errorRule, format }: Props = $props();

	const machines = $derived.by(() => {
		const alphabet = lexAlphabet(spec, run.text);
		return spec.tokenRules.map((r) => ruleMachine(r.regex, alphabet));
	});
	const point = $derived(lookaheadPoint(run, index, stepper.index));
	const standings = $derived(point ? standingsAt(machines, run, point, errorRule) : []);
	const best = $derived(point ? longestSoFar(run, point) : null);

	const highlights = $derived.by((): HighlightRange[] => {
		if (!point) return [];
		const out: HighlightRange[] = [];
		for (let t = 0; t < Math.min(point.scanStep, run.tokens.length); t++) {
			const tok = run.tokens[t];
			out.push({
				start: tok.start,
				end: tok.end,
				tone: tok.error ? 'reject' : tok.skipped ? 'muted' : tok.rule,
				muted: true
			});
		}
		if (best) {
			out.push({
				start: point.pos,
				end: advance(run.text, point.pos, best.length),
				tone: 'accept',
				label: 'longest so far'
			});
		}
		return out;
	});

	interface Row {
		index: number;
		name: string;
		re: string;
		standing: RuleStanding;
	}
	const rows = $derived.by((): Row[] => {
		const out: Row[] = spec.rules.map((r, j) => ({
			index: j,
			name: r.name,
			re: r.re,
			standing: standings[j] ?? { status: 'dead', more: false }
		}));
		if (errorRule) {
			out.push({
				index: spec.rules.length,
				name: 'Error',
				re: 'any one character',
				standing: standings[spec.rules.length] ?? { status: 'dead', more: false }
			});
		}
		return out;
	});

	const STATUS = {
		match: { text: 'complete match', tone: 'accept' },
		viable: { text: 'viable prefix', tone: 'info' },
		dead: { text: 'dead', tone: 'muted' }
	} as const;

	const ctx = $derived({ spec, run, errorRule, format });
</script>

{#if point}
	<div class="lookahead">
		<StepControls {stepper} noun="Step" ariaLabel="Lookahead steps">
			{#snippet label()}<span class="sentence">{describeLookahead(ctx, point, standings)}</span
				>{/snippet}
		</StepControls>

		<div class="stream-box">
			<CharStream
				text={run.text}
				size="lg"
				cursor={point.pos}
				lookahead={{ start: point.pos, end: point.end }}
				{highlights}
				indices={run.text.length <= 64}
				ariaLabel="Input; consumed up to position {point.pos}, lookahead {formatString(
					run.text.slice(point.pos, point.end)
				)}"
			/>
			<dl class="split">
				<div>
					<dt>Consumed</dt>
					<dd><code>{formatString(run.text.slice(0, point.pos))}</code></dd>
				</div>
				<div>
					<dt>Lookahead</dt>
					<dd class="la"><code>{formatString(run.text.slice(point.pos, point.end))}</code></dd>
				</div>
				<div>
					<dt>Longest match so far</dt>
					<dd>
						{#if best}
							<code
								>{formatString(
									run.text.slice(point.pos, advance(run.text, point.pos, best.length))
								)}</code
							>
							<span class="by">({spec.rules[best.rule]?.name})</span>
						{:else}
							<span class="none">none yet</span>
						{/if}
					</dd>
				</div>
			</dl>
		</div>

		<div class="table-wrap">
			<table class="status">
				<caption class="visually-hidden">
					Each rule after reading {formatString(run.text.slice(point.pos, point.end))}
				</caption>
				<thead>
					<tr>
						<th scope="col">Rule</th>
						<th scope="col">
							After reading <code>{formatString(run.text.slice(point.pos, point.end))}</code>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.index)}
						{@const s = STATUS[row.standing.status]}
						<tr
							class={row.standing.status}
							style={toneStyle(row.index === spec.rules.length ? 'reject' : row.index)}
						>
							<th scope="row">
								<span class="ri">R<sub>{row.index + 1}</sub></span>
								<span class="rn">{row.name}</span>
								<code class="rre" title={row.re}>{row.re}</code>
							</th>
							<td>
								<Badge tone={s.tone}>{s.text}</Badge>
								{#if row.standing.status === 'match' && row.standing.more}
									<span class="more">a longer string can match too</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">
			A viable prefix can still be extended to a string in L(R<sub>j</sub>): its state in the rule's
			minimal DFA can reach an accepting state. A dead rule cannot match anything that starts with
			these characters.
		</p>
	</div>
{:else}
	<p class="empty">Type an input to scan.</p>
{/if}

<style>
	/* Lexemes such as "  " keep their spaces. */
	.sentence {
		white-space: pre-wrap;
	}
	.lookahead {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.stream-box {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow-x: auto;
	}
	.split {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-6);
		margin: 0;
		font-size: var(--text-sm);
	}
	.split div {
		min-width: 0;
	}
	.split dt {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.split dd {
		margin: 2px 0 0;
		overflow-wrap: anywhere;
	}
	.split code {
		white-space: pre-wrap;
	}
	.la code {
		border-color: var(--active);
		border-style: dashed;
	}
	.by {
		color: var(--text-2);
	}
	.none {
		color: var(--text-3);
	}
	.table-wrap {
		position: relative;
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.status {
		width: 100%;
		font-size: var(--text-sm);
	}
	.status th,
	.status td {
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: middle;
	}
	.status tbody tr:last-child > * {
		border-bottom: 0;
	}
	.status thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.status thead code {
		text-transform: none;
		letter-spacing: 0;
	}
	.status tbody th {
		font-weight: 400;
		white-space: nowrap;
	}
	.ri {
		display: inline-block;
		min-width: 2rem;
		color: var(--tone-fg);
		font-family: var(--font-serif);
		font-style: italic;
		font-weight: 600;
	}
	.ri sub {
		font-size: 0.72em;
		font-style: normal;
	}
	.rn {
		margin-right: var(--space-2);
		font-weight: 600;
	}
	.rre {
		display: inline-block;
		max-width: 16rem;
		overflow: hidden;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-3);
		font-size: 0.8125rem;
		text-overflow: ellipsis;
		vertical-align: bottom;
		white-space: nowrap;
	}
	tr.dead .rn,
	tr.dead .rre {
		color: var(--text-3);
	}
	.more {
		margin-left: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.note {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.empty {
		margin: 0;
		color: var(--text-3);
	}
	@media (max-width: 600px) {
		.rre {
			display: none;
		}
	}
</style>
