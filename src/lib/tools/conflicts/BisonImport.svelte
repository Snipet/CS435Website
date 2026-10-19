<!--
	"Import from bison": a bison grammar file pasted here is read into the
	lecture notation and precedence lines (bison-import.ts); what is not read
	is listed with its place in the file.
-->
<script lang="ts">
	import { Button, CodeEditor, Disclosure } from '$lib/components/ui';
	import { importBison } from './bison-import';

	interface Props {
		/** Puts the grammar and the declarations read into the tool. */
		onuse: (grammar: string, precedence: string) => void;
	}

	let { onuse }: Props = $props();

	const uid = $props.id();
	let open = $state(false);
	let text = $state('');
	const read = $derived(text.trim() === '' ? null : importBison(text));
	const usable = $derived(!!read && read.grammar !== '');

	const PLACEHOLDER = `%token INT
%left '+'
%left '*'
%%
exp : exp '+' exp  { $$ = $1 + $3; }
    | exp '*' exp  { $$ = $1 * $3; }
    | INT
    ;
%%`;
</script>

<Disclosure summary="Import from bison" openSummary="Import from bison" variant="boxed" bind:open>
	<div class="import">
		<CodeEditor
			label="bison grammar file"
			language="bison"
			bind:value={text}
			diagnostics={read?.diagnostics ?? []}
			minRows={6}
			maxRows={16}
			placeholder={PLACEHOLDER}
		/>
		<p class="hint">
			Declarations, <code>%%</code>, the rules. Actions and C code are left out;
			<code>%left</code>, <code>%right</code> and <code>%nonassoc</code> lines become the precedence
			declarations, and <code>%start</code> the start symbol.
		</p>
		{#if read && usable}
			<div class="result" aria-labelledby="{uid}-result">
				<span class="caption" id="{uid}-result">Read as</span>
				<pre>{read.grammar}</pre>
				{#if read.precedence}<pre>{read.precedence}</pre>{/if}
			</div>
		{/if}
		<div>
			<Button
				variant="primary"
				size="sm"
				disabled={!usable}
				onclick={() => {
					if (!read || !usable) return;
					onuse(read.grammar, read.precedence);
				}}
			>
				Use this grammar
			</Button>
		</div>
	</div>
</Disclosure>

<style>
	.import {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding-top: var(--space-2);
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	code {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.caption {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	pre {
		max-height: 12rem;
		margin: 0;
		padding: 6px 10px;
		overflow: auto;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		white-space: pre;
	}
</style>
