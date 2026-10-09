<!--
	A compact reference for C- as this compiler implements it: lexical
	conventions, the token table, the grammar, the semantic rules and the
	run-time conventions of the generated code.
-->
<script lang="ts">
	import {
		AC,
		AC1,
		FP,
		GP,
		KEYWORDS,
		PC,
		SYMBOLS,
		TOKEN_TYPES,
		spellingOf,
		type IdentifierMode,
		type TokenType
	} from '$lib/theory/cminus';
	import { DADDR_SIZE, IADDR_SIZE } from '$lib/tools/tiny-vm/machine';
	import GrammarText from './GrammarText.svelte';

	interface Props {
		/** The identifier rule in use. */
		identifiers: IdentifierMode;
		/** Link that opens the BNF in Context-Free Grammars; null hides it. */
		grammarHref: string | null;
	}

	let { identifiers, grammarHref }: Props = $props();

	const keywords = Object.keys(KEYWORDS);
	const symbols = SYMBOLS.map(([text]) => text);
	const idRule = $derived(
		identifiers === 'letters' ? 'letter letter*' : "letter (letter | digit | '_')*"
	);

	const OTHER: Partial<Record<TokenType, string>> = {
		NUM: 'digit digit*',
		ENDFILE: 'the end of the text',
		ERROR: 'text that is no token'
	};
	const tokens = $derived(
		TOKEN_TYPES.map((type) => {
			const spelling = spellingOf(type);
			return {
				type,
				spelling: spelling ?? (type === 'ID' ? idRule : (OTHER[type] ?? '')),
				literal: spelling !== null,
				words: type === 'ENDFILE' || type === 'ERROR'
			};
		})
	);

	const registers = [
		{ name: 'ac', n: AC, role: 'accumulator: operands, results, and the value a function returns' },
		{ name: 'ac1', n: AC1, role: 'second operand, and the address of an array element' },
		{
			name: 'fp',
			n: FP,
			role: 'frame pointer: the base of the running function’s activation record'
		},
		{
			name: 'gp',
			n: GP,
			role: 'global pointer: the highest data address, where the globals start'
		},
		{ name: 'pc', n: PC, role: 'program counter' }
	];
</script>

<div class="reference">
	<section class="cm-section">
		<h3 class="cm-heading">Lexical conventions</h3>
		<dl class="defs">
			<dt>Keywords</dt>
			<dd>
				<span class="chips"
					>{#each keywords as word (word)}<code>{word}</code>{/each}</span
				>
				<span class="cm-muted">Reserved: a keyword is never an ID.</span>
			</dd>
			<dt>Special symbols</dt>
			<dd>
				<span class="chips"
					>{#each symbols as text (text)}<code>{text}</code>{/each}<code>/*</code><code>*/</code
					></span
				>
			</dd>
			<dt>ID</dt>
			<dd>
				<code>ID = {idRule}</code>, <code>letter = 'a' | … | 'z' | 'A' | … | 'Z'</code>. Lower and
				upper case are distinct.
				{#if identifiers === 'letters'}
					Letters only, as the language defines it: <code>x1</code> is ID <code>x</code>, NUM
					<code>1</code>.
				{:else}
					The extended rule of Language options: the language itself defines letters only.
				{/if}
			</dd>
			<dt>NUM</dt>
			<dd><code>NUM = digit digit*</code>, <code>digit = '0' | … | '9'</code>.</dd>
			<dt>White space</dt>
			<dd>Blanks, tabs and line breaks separate tokens and produce none.</dd>
			<dt>Comments</dt>
			<dd>
				<code>/* … */</code>, wherever white space can stand. A comment ends at the first
				<code>*/</code> (comments do not nest) and can span lines.
			</dd>
			<dt>Longest match</dt>
			<dd>
				The longest token wins: <code>&lt;=</code> is LTE, <code>&lt; =</code> is LT ASSIGN.
			</dd>
		</dl>
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">Tokens</h3>
		<div class="cm-box tokens">
			<table class="cm-table">
				<caption class="visually-hidden">Token names and their spellings</caption>
				<thead>
					<tr>
						<th scope="col">Token</th>
						<th scope="col" class="cm-wide">Spelling</th>
					</tr>
				</thead>
				<tbody>
					{#each tokens as t (t.type)}
						<tr>
							<td class="type">{t.type}</td>
							<td class={{ literal: t.literal, words: t.words }}>{t.spelling}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="cm-section wide">
		<h3 class="cm-heading">Grammar</h3>
		<div class="pair">
			<GrammarText href={grammarHref} />
		</div>
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">Semantic rules</h3>
		<ul class="rules">
			<li>
				A name is declared before it is used. A declaration holds from where it is written to the
				end of its scope and hides the declarations of the same name in the scopes around it.
			</li>
			<li>
				Scopes: the global scope, one per function (its parameters and the locals of its body), one
				per nested compound statement. A scope declares a name once.
			</li>
			<li>The last declaration of a program is <code>void main(void)</code>.</li>
			<li>
				The types are <code>int</code> and arrays of <code>int</code>. <code>void</code> is only the return
				type of a function that returns no value.
			</li>
			<li>
				An <code>int</code> parameter is passed by value. An array parameter (<code>int a[]</code>)
				is passed by reference: the function works on the caller’s cells.
			</li>
			<li>
				A call gives one argument per parameter: an array for an array parameter, an
				<code>int</code> for the others.
			</li>
			<li>
				Operands, tests, subscripts, returned values and the right side of <code>=</code> are
				<code>int</code>. A comparison is 1 when it holds and 0 when it does not; a test is false
				when its value is 0.
			</li>
			<li>An assignment is an expression: its value is the value assigned.</li>
			<li>An <code>else</code> belongs to the nearest <code>if</code> that has none yet.</li>
			<li>
				A function declared <code>int</code> returns with <code>return expression;</code>, a
				<code>void</code> function with <code>return;</code> or at the end of its body.
			</li>
			<li>
				Input and output: <code>int input(void)</code> reads the next number of the input and
				<code>void output(int x)</code> prints <code>x</code>. Both are predefined in the global
				scope.
			</li>
			<li>
				An <code>int</code> is 32 bits. <code>+</code>, <code>-</code> and <code>*</code> wrap
				around, <code>/</code> drops the fraction, and a division by zero stops the program.
			</li>
		</ul>
	</section>

	<section class="cm-section">
		<h3 class="cm-heading">Run-time conventions</h3>
		<div class="cm-box">
			<table class="cm-table">
				<caption class="visually-hidden">Registers of the TINY Machine and their use</caption>
				<thead>
					<tr>
						<th scope="col">Register</th>
						<th scope="col" class="cm-wide">Use</th>
					</tr>
				</thead>
				<tbody>
					{#each registers as r (r.name)}
						<tr>
							<td class="type">{r.name} = {r.n}</td>
							<td class="words">{r.role}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<ul class="rules">
			<li>
				Data memory has {DADDR_SIZE} cells. The global variables start at <code>0(gp)</code>, the
				highest address, and go down. The activation records lie below them and grow toward address
				0, the record of main first.
			</li>
			<li>
				An activation record, from <code>fp</code> down: <code>0(fp)</code> the caller’s fp,
				<code>-1(fp)</code> the return address, then the parameters, the locals and the temporaries.
			</li>
			<li>
				Element 0 of an array has the lowest address. An array parameter is one cell that holds the
				address of element 0.
			</li>
			<li>
				A caller stores the arguments in the new record, saves its fp there, moves fp, puts the
				return address in ac and jumps. The function leaves its result in ac.
			</li>
			<li>
				Instruction memory has {IADDR_SIZE} cells: the prelude at 0, the <code>HALT</code> main
				returns to at 5, a second <code>HALT</code> at 6 for a negative subscript, input at 7, output
				at 10, then the functions in source order.
			</li>
			<li>
				A negative subscript stops the program. A subscript past the end of the array is not
				checked.
			</li>
		</ul>
	</section>
</div>

<style>
	.reference {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		min-width: 0;
	}
	@container cm-view (min-width: 40rem) {
		.reference {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
			align-items: start;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
	@container cm-view (min-width: 64rem) {
		.pair :global(.grammar) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.defs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2px var(--space-4);
		margin: 0;
		font-size: var(--text-sm);
	}
	@container cm-view (min-width: 30rem) {
		.defs {
			grid-template-columns: max-content minmax(0, 1fr);
			gap: var(--space-2) var(--space-4);
		}
	}
	.defs dt {
		font-weight: 600;
	}
	/* A row of words or symbols, each in its own box. */
	.chips {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 3px 4px;
		vertical-align: middle;
	}
	.defs dd {
		margin: 0 0 var(--space-2);
		color: var(--text-2);
	}
	@container cm-view (min-width: 30rem) {
		.defs dd {
			margin: 0;
		}
	}
	.tokens {
		max-height: 22rem;
	}
	.type {
		font-weight: 600;
	}
	.literal {
		color: var(--syn-keyword);
		font-weight: 600;
	}
	.words {
		color: var(--text-2);
		font-family: var(--font-sans);
		white-space: normal;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.rules li::marker {
		color: var(--text-3);
	}
</style>
