<script lang="ts">
	import { onMount } from 'svelte';
	import type { Citation } from '$lib/lectures';
	import { pageTitle } from '$lib/site';
	import Callout from '$lib/components/ui/Callout.svelte';
	import CharStream from '$lib/components/ui/CharStream.svelte';
	import CitationTag from '$lib/components/ui/CitationTag.svelte';
	import StringSetView from '$lib/components/ui/StringSetView.svelte';
	import TokenPairs from '$lib/components/ui/TokenPairs.svelte';
	import type { HighlightRange, TokenPair } from '$lib/components/ui/types';
	import LegendGlyph, { type GlyphKind } from './LegendGlyph.svelte';

	const sections = [
		{ id: 'sets', title: 'Sets, strings, and languages' },
		{ id: 'regex', title: 'Regular expressions' },
		{ id: 'precedence', title: 'Operator precedence' },
		{ id: 'definitions', title: 'Regular definitions' },
		{ id: 'typing', title: 'Typing the symbols' },
		{ id: 'flex', title: 'Flex patterns' },
		{ id: 'automata', title: 'Finite automata' },
		{ id: 'diagrams', title: 'Diagram legend' },
		{ id: 'names', title: 'State names' },
		{ id: 'tables', title: 'Transition tables' },
		{ id: 'tokens', title: 'Tokens and lexemes' },
		{ id: 'defaults', title: 'Conventions beyond the slides' }
	] as const;

	type SectionId = (typeof sections)[number]['id'];

	const cites: Record<SectionId, Citation[]> = {
		sets: [
			{ deck: '04', slide: [19, 22] },
			{ deck: '06', slide: 6 }
		],
		regex: [{ deck: '04', slide: [23, 27] }],
		precedence: [],
		definitions: [
			{ deck: '04', slide: 27 },
			{ deck: '04', slide: 31 }
		],
		typing: [],
		flex: [
			{ deck: '07', slide: [6, 7] },
			{ deck: '07', slide: 10 }
		],
		automata: [{ deck: '06', slide: [3, 13] }],
		diagrams: [
			{ deck: '06', slide: 5 },
			{ deck: '06', slide: 10 }
		],
		names: [
			{ deck: '08', slide: 6 },
			{ deck: '08', slide: 10 },
			{ deck: '08', slide: 16 }
		],
		tables: [
			{ deck: '08', slide: 14 },
			{ deck: '08', slide: 16 }
		],
		tokens: [
			{ deck: '05', slide: 7 },
			{ deck: '01', slide: 4 },
			{ deck: '05', slide: [10, 12] }
		],
		defaults: [{ deck: '08', slide: [3, 5] }]
	};

	const legend: { kind: GlyphKind; name: string; text: string }[] = [
		{ kind: 'state', name: 'State', text: 'A circle.' },
		{
			kind: 'long',
			name: 'Long state name',
			text: 'An ellipse, e.g. a subset-construction state.'
		},
		{ kind: 'start', name: 'Start state', text: 'An arrow in from nowhere.' },
		{
			kind: 'accepting',
			name: 'Accepting state',
			text: 'A double outline. “Final” means the same.'
		},
		{ kind: 'transition', name: 'Transition', text: 'On input a, go from A to B.' },
		{ kind: 'multi', name: 'Several symbols', text: 'One edge; its symbols are joined by commas.' },
		{ kind: 'loop', name: 'Self-loop', text: 'Drawn above the state.' },
		{ kind: 'epsilon', name: 'ε-move', text: 'Moves without reading input; drawn in violet.' },
		{
			kind: 'trap',
			name: 'Trap state',
			text: 'A dashed outline. Missing transitions lead here; it never accepts.'
		},
		{
			kind: 'active',
			name: 'Current state',
			text: 'During a run: filled in amber, with the transition just taken.'
		}
	];

	// Lexical Analysis II, slide 7 scans "f+3  +g" (two spaces). The slide lists
	// (Whitespace, " "); maximal munch matches both spaces (docs/ARCHITECTURE.md §3.9).
	const scannedText = 'f+3  +g';
	const scanned: (TokenPair & { start: number; end: number })[] = [
		{ name: 'Identifier', lexeme: 'f', rule: 2, start: 0, end: 1 },
		{ name: 'Plus', lexeme: '+', rule: 3, start: 1, end: 2 },
		{ name: 'Integer', lexeme: '3', rule: 1, start: 2, end: 3 },
		{ name: 'Whitespace', lexeme: '  ', rule: 0, start: 3, end: 5, skipped: true },
		{ name: 'Plus', lexeme: '+', rule: 3, start: 5, end: 6 },
		{ name: 'Identifier', lexeme: 'g', rule: 2, start: 6, end: 7 }
	];
	const scannedRanges: HighlightRange[] = scanned.map((t) => ({
		start: t.start,
		end: t.end,
		tone: t.skipped ? 'muted' : (t.rule ?? 0),
		label: t.name
	}));
	let hovered = $state<number | null>(null);

	let activeId = $state<SectionId>('sets');

	onMount(() => {
		const heads = sections
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		// The current section is the last one whose heading is above 45% of the
		// viewport; at the bottom of the page it is the last section. Scroll events
		// already arrive at most once per frame, so this runs directly.
		const update = () => {
			const line = innerHeight * 0.45;
			let current = heads[0];
			for (const h of heads) if (h.getBoundingClientRect().top <= line) current = h;
			const root = document.documentElement;
			if (root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2) {
				current = heads[heads.length - 1];
			}
			if (current) activeId = current.id as SectionId;
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
	<title>{pageTitle('Notation')}</title>
	<meta
		name="description"
		content="The notation used by the CS435 tools: regular expressions, flex patterns, finite automata, state names, transition tables, and token formats."
	/>
</svelte:head>

{#snippet toc()}
	<ol class="toc-list">
		{#each sections as s (s.id)}
			<li>
				<a href="#{s.id}" aria-current={activeId === s.id ? 'location' : undefined}>{s.title}</a>
			</li>
		{/each}
	</ol>
{/snippet}

{#snippet sectionHead(id: SectionId, title: string)}
	<div class="section-head">
		<h2 {id}>{title}</h2>
		{#if cites[id].length}
			<div class="cites">
				{#each cites[id] as cite, i (i)}<CitationTag {cite} />{/each}
			</div>
		{/if}
	</div>
{/snippet}

<div class="notation">
	<header class="page-head">
		<h1>Notation</h1>
		<p class="lede">
			The symbols and conventions the tools use. They follow the lecture slides; each section cites
			the slides it comes from.
		</p>
	</header>

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
			<!-- Sets, strings, languages -->
			<section aria-labelledby="sets">
				{@render sectionHead('sets', 'Sets, strings, and languages')}
				<p>
					An <dfn>alphabet</dfn> Σ is a finite set of symbols. A <dfn>language</dfn> over Σ is a set of
					strings of symbols drawn from Σ.
				</p>
				<div class="table-wrap">
					<table class="ref">
						<thead>
							<tr
								><th scope="col">Concept</th><th scope="col">Written</th><th scope="col">Example</th
								></tr
							>
						</thead>
						<tbody>
							<tr>
								<td>Alphabet</td>
								<td class="f">Σ</td>
								<td class="f">Σ = &#123; 0, 1 &#125;</td>
							</tr>
							<tr>
								<td>String</td>
								<td>double quotes</td>
								<td class="f">"if", "1110"</td>
							</tr>
							<tr>
								<td>Empty string</td>
								<td
									><span class="f">""</span> in a set; <span class="f">ε</span> in an RE or on an edge</td
								>
								<td class="f">L(ε) = &#123; "" &#125;</td>
							</tr>
							<tr>
								<td>Empty language</td>
								<td
									><span class="f">ɸ</span> in an RE; <span class="f">&#123; &#125;</span> as a set</td
								>
								<td class="f">L(ɸ) = &#123; &#125;</td>
							</tr>
							<tr>
								<td>RE literal</td>
								<td>single quotes</td>
								<td class="f">'if', '\t', ' '</td>
							</tr>
							<tr>
								<td>Language of an RE</td>
								<td class="f">L(R)</td>
								<td class="f">L('1' '0'*)</td>
							</tr>
							<tr>
								<td>Language of a machine</td>
								<td class="f">L(M)</td>
								<td class="f">L(M) = &#123; "1" &#125;</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					Sets of strings are written with spaces inside the braces, and <span class="f">…</span> marks
					a set that goes on:
				</p>
				<div class="example">
					<StringSetView prefix="L('0'*) =" strings={['', '0', '00', '000']} more />
				</div>
			</section>

			<!-- Regular expressions -->
			<section aria-labelledby="regex">
				{@render sectionHead('regex', 'Regular expressions')}
				<p>
					Each clause of the inductive definition, with the language it denotes. <span class="f"
						>A</span
					>
					and <span class="f">B</span> stand for any regular expressions.
				</p>
				<div class="table-wrap">
					<table class="ref clauses">
						<thead>
							<tr
								><th scope="col">Clause</th><th scope="col">RE</th><th scope="col">Language</th></tr
							>
						</thead>
						<tbody>
							<tr class="group"><th colspan="3" scope="colgroup">Basis</th></tr>
							<tr>
								<td>Atomic</td>
								<td class="f">'c'</td>
								<td class="f">L('c') = &#123; "c" &#125; <span class="note">for any c ∈ Σ</span></td
								>
							</tr>
							<tr>
								<td>Empty</td>
								<td class="f">ɸ</td>
								<td class="f">L(ɸ) = &#123; &#125;</td>
							</tr>
							<tr>
								<td>Epsilon</td>
								<td class="f">ε</td>
								<td class="f">L(ε) = &#123; "" &#125;</td>
							</tr>
							<tr class="group"><th colspan="3" scope="colgroup">Inductive</th></tr>
							<tr>
								<td>Concatenation</td>
								<td class="f">AB</td>
								<td class="f">L(AB) = &#123; ab | a ∈ L(A) and b ∈ L(B) &#125;</td>
							</tr>
							<tr>
								<td>Choice/Alternation</td>
								<td class="f">A | B</td>
								<td class="f">L(A | B) = &#123; s | s ∈ L(A) or s ∈ L(B) &#125;</td>
							</tr>
							<tr>
								<td>Iteration (Kleene closure)</td>
								<td class="f">A*</td>
								<td class="f">L(A*) = &#123; "" &#125; ∪ L(A) ∪ L(AA) ∪ L(AAA) ∪ …</td>
							</tr>
							<tr>
								<td>Positive closure</td>
								<td class="f">A<sup>+</sup></td>
								<td class="f">L(A<sup>+</sup>) = L(A A*)</td>
							</tr>
							<tr>
								<td>Fixed iteration</td>
								<td class="f">A<sup>n</sup></td>
								<td class="f"
									>L(A<sup>n</sup>) = L(A A … A) <span class="note">A repeated n times</span></td
								>
							</tr>
							<tr class="group"><th colspan="3" scope="colgroup">Also accepted</th></tr>
							<tr>
								<td>Optional</td>
								<td class="f">A?</td>
								<td class="f">L(A?) = L(A | ε)</td>
							</tr>
							<tr>
								<td>Any symbol</td>
								<td class="f">Σ</td>
								<td class="f">L(Σ) = &#123; "c" | c ∈ Σ &#125;</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h3>Writing expressions</h3>
				<dl class="rules">
					<dt>Literals</dt>
					<dd>
						<span class="f">'c'</span>, or several characters at once: <span class="f">'if'</span>
						abbreviates <span class="f">'i' 'f'</span>, so
						<span class="f">L('if') = &#123; "if" &#125;</span>. A quoted literal is one unit:
						<span class="f">'ab'*</span>
						means
						<span class="f">('a' 'b')*</span>. Inside quotes,
						<span class="f">\t \n \r \\ \' \"</span>
						are escapes. Curly quotes <span class="f">‘ ’</span> work like <span class="f">'</span>;
						a double-quoted <span class="f">"if"</span> is read as a literal, with a note.
					</dd>
					<dt>Bare symbols</dt>
					<dd>
						Any character that is not an operator, a quote, or a space is a symbol by itself, as in
						<span class="f">(0 | 1)*00</span>. Digits and punctuation are symbols. Spaces only
						separate; <span class="f">(0|1)*00</span> is the same expression.
					</dd>
					<dt>Names</dt>
					<dd>
						A word such as <span class="f">digit</span> refers to a regular definition with that
						name. A word that names no definition is read as single symbols:
						<span class="f">abb</span> is <span class="f">a b b</span>, with a note.
					</dd>
					<dt>Ranges</dt>
					<dd>
						<span class="f">'A' | … | 'Z'</span> (with <span class="f">…</span> or
						<span class="f">...</span>) between single characters is the whole range. Classes such
						as <span class="f">[a-z]</span> also work.
					</dd>
				</dl>
			</section>

			<!-- Precedence -->
			<section aria-labelledby="precedence">
				{@render sectionHead('precedence', 'Operator precedence')}
				<ol class="ladder">
					<li>
						<span class="rank">1</span><span class="f">* + ? <sup>n</sup></span><span
							>Postfix operators bind tightest</span
						>
					</li>
					<li>
						<span class="rank">2</span><span class="f">AB</span><span>then concatenation</span>
					</li>
					<li><span class="rank">3</span><span class="f">A | B</span><span>then choice</span></li>
				</ol>
				<p>Parentheses group. Some expressions with the grouping made explicit:</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead><tr><th scope="col">Written</th><th scope="col">Means</th></tr></thead>
						<tbody>
							<tr><td class="f">ab*</td><td class="f">a (b*)</td></tr>
							<tr><td class="f">ab | c</td><td class="f">(a b) | c</td></tr>
							<tr><td class="f">a | b*c</td><td class="f">a | ((b*) c)</td></tr>
							<tr><td class="f">'ab'*</td><td class="f">('a' 'b')*</td></tr>
							<tr><td class="f">(0 | 1)*00</td><td class="f">((0 | 1)*) 0 0</td></tr>
							<tr><td class="f">digit<sup>3</sup>+</td><td class="f">((digit<sup>3</sup>)+)</td></tr
							>
						</tbody>
					</table>
				</div>
				<p>
					Constructions that follow the two-operand definitions group longer chains from the left:
					<span class="f">A B C</span> is <span class="f">(A B) C</span> and
					<span class="f">A | B | C</span> is <span class="f">(A | B) | C</span>.
				</p>
			</section>

			<!-- Regular definitions -->
			<section aria-labelledby="definitions">
				{@render sectionHead('definitions', 'Regular definitions')}
				<p>
					A regular definition names an expression so other expressions can use it. Write one per
					line as <span class="f">name = RE</span>. Lines starting with <span class="f">//</span>
					are comments. Definitions may come in any order, but a definition may not use itself, directly
					or through others.
				</p>
				<div class="code-pair">
					<figure>
						<pre class="code"><span class="hl-comment">// a non-empty string of digits</span>
<span class="hl-name">digit</span>  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
<span class="hl-name">number</span> = digit digit*</pre>
						<figcaption><CitationTag cite={{ deck: '04', slide: 27 }} /></figcaption>
					</figure>
					<figure>
						<pre class="code"><span class="hl-name">area</span>     = digit<sup>3</sup>
<span class="hl-name">exchange</span> = digit<sup>3</sup>
<span class="hl-name">phone</span>    = digit<sup>4</sup>
<span class="hl-name">number</span>   = '(' area ')' exchange '-' phone</pre>
						<figcaption><CitationTag cite={{ deck: '04', slide: 31 }} /></figcaption>
					</figure>
				</div>
			</section>

			<!-- Typing -->
			<section aria-labelledby="typing">
				{@render sectionHead('typing', 'Typing the symbols')}
				<p>
					Expression fields turn <span class="f">\e</span>, <span class="f">\p</span>, and
					<span class="f">\S</span> into their symbols as you type, and the buttons under a field insert
					a symbol at the cursor.
				</p>
				<div class="table-wrap">
					<table class="ref">
						<thead>
							<tr>
								<th scope="col">Symbol</th>
								<th scope="col">Meaning</th>
								<th scope="col">Type</th>
								<th scope="col">Also accepted</th>
							</tr>
						</thead>
						<tbody>
							<tr
								><td class="f sym">ε</td><td>Empty string</td><td class="f">\e</td><td class="f"
									>ϵ</td
								></tr
							>
							<tr
								><td class="f sym">ɸ</td><td>Empty language</td><td class="f">\p</td><td class="f"
									>φ ϕ ∅</td
								></tr
							>
							<tr
								><td class="f sym">Σ</td><td>Any one symbol of the alphabet</td><td class="f">\S</td
								><td></td></tr
							>
							<tr
								><td class="f sym">A<sup>+</sup></td><td>Positive closure</td><td class="f">A+</td
								><td class="f">A⁺</td></tr
							>
							<tr
								><td class="f sym">A<sup>3</sup></td><td>Fixed iteration</td><td class="f">A^3</td
								><td class="f">A³</td></tr
							>
							<tr
								><td class="f sym">…</td><td>Range</td><td class="f">...</td><td class="f">…</td
								></tr
							>
						</tbody>
					</table>
				</div>
			</section>

			<!-- Flex -->
			<section aria-labelledby="flex">
				{@render sectionHead('flex', 'Flex patterns')}
				<p>
					Tools that read flex specifications use flex's own pattern syntax, where most characters
					stand for themselves and literals need no quotes.
				</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead><tr><th scope="col">Pattern</th><th scope="col">Matches</th></tr></thead>
						<tbody>
							<tr><td class="f">x</td><td>the character <span class="f">x</span></td></tr>
							<tr
								><td class="f">\.</td><td
									>the character <span class="f">.</span> (a backslash makes an operator literal)</td
								></tr
							>
							<tr><td class="f">"string"</td><td>the characters of <i>string</i>, literally</td></tr
							>
							<tr><td class="f">.</td><td>any character except newline</td></tr>
							<tr><td class="f">^</td><td>the beginning of a line</td></tr>
							<tr><td class="f">$</td><td>the end of a line</td></tr>
							<tr
								><td class="f">[xyz]</td><td
									>one character: <span class="f">x</span>, <span class="f">y</span>, or
									<span class="f">z</span>
									(escape <span class="f">-</span> as <span class="f">\-</span>)</td
								></tr
							>
							<tr
								><td class="f">[^xyz]</td><td
									>any character except <span class="f">x</span>, <span class="f">y</span>, and
									<span class="f">z</span></td
								></tr
							>
							<tr
								><td class="f">[a-z]</td><td
									>one character from <span class="f">a</span> to <span class="f">z</span></td
								></tr
							>
							<tr><td class="f">r*</td><td>Kleene closure</td></tr>
							<tr><td class="f">r+</td><td>positive closure</td></tr>
							<tr><td class="f">r?</td><td>optional</td></tr>
							<tr
								><td class="f">r<sub>1</sub>r<sub>2</sub></td><td
									><i>r</i><sub>1</sub> then <i>r</i><sub>2</sub> (concatenation)</td
								></tr
							>
							<tr
								><td class="f">r<sub>1</sub>|r<sub>2</sub></td><td
									><i>r</i><sub>1</sub> or <i>r</i><sub>2</sub> (choice)</td
								></tr
							>
							<tr><td class="f">(r)</td><td>grouping</td></tr>
							<tr
								><td class="f">r<sub>1</sub>/r<sub>2</sub></td><td
									><i>r</i><sub>1</sub> when followed by <i>r</i><sub>2</sub> (trailing context)</td
								></tr
							>
							<tr><td class="f">&#123;d&#125;</td><td>the expression defined by <i>d</i></td></tr>
							<tr class="group"><th colspan="2" scope="colgroup">Also accepted</th></tr>
							<tr><td class="f">r&#123;n&#125;</td><td>exactly <i>n</i> copies of <i>r</i></td></tr>
							<tr><td class="f">r&#123;n,&#125;</td><td><i>n</i> or more copies</td></tr>
							<tr><td class="f">r&#123;n,m&#125;</td><td><i>n</i> to <i>m</i> copies</td></tr>
						</tbody>
					</table>
				</div>
				<Callout tone="info" title="Trailing context">
					<p>
						The slide prints trailing context as <span class="f">r<sub>1</sub> \ r<sub>2</sub></span
						>. Flex, and this site, write it with a slash:
						<span class="f">r<sub>1</sub>/r<sub>2</sub></span>.
					</p>
				</Callout>
				<p>
					Definitions go in the definitions section, one per line as <span class="f"
						>NAME pattern</span
					>, and are used in braces:
				</p>
				<figure>
					<pre class="code"><span class="hl-name">DIGIT</span>    [0-9]
<span class="hl-name">LETTER</span>   [A-Za-z]
<span class="hl-name">ID</span
						>       &#123;LETTER&#125;(&#123;LETTER&#125;|&#123;DIGIT&#125;)*</pre>
					<figcaption><CitationTag cite={{ deck: '07', slide: 10 }} /></figcaption>
				</figure>
				<p>
					Flex takes the longest match, breaks ties in favor of the rule listed first, and copies
					characters no rule matches to the output. There are no back-references.
				</p>
			</section>

			<!-- Automata -->
			<section aria-labelledby="automata">
				{@render sectionHead('automata', 'Finite automata')}
				<p>A deterministic finite automaton (DFA) <span class="f">M</span> consists of</p>
				<ol class="tuple">
					<li>an input alphabet <span class="f">Σ</span>,</li>
					<li>a set of states <span class="f">S</span>,</li>
					<li>a start state <span class="f">s<sub>0</sub></span>,</li>
					<li>a set of accepting states <span class="f">F ⊆ S</span>, and</li>
					<li>a transition function <span class="f">T : S × Σ → S</span>.</li>
				</ol>
				<p class="display f">M = (Σ, S, s<sub>0</sub>, F, T)</p>
				<p>
					<span class="f">T</span> is total: every state has exactly one transition on every symbol.
					A transition is written <span class="f">s<sub>1</sub> →<sup>a</sup> s<sub>2</sub></span>:
					in state <span class="f">s<sub>1</sub></span>, on input <span class="f">'a'</span>, go to
					state <span class="f">s<sub>2</sub></span>.
				</p>
				<p>
					A nondeterministic automaton (NFA) may have several transitions on one symbol and ε-moves,
					which change state without reading input. Its states are
					<span class="f">Q</span> and its transition function returns a set of states:
				</p>
				<p class="display f">Δ : Q × (Σ ∪ &#123; ε &#125;) → P(Q)</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead
							><tr><th scope="col">At the end of the input</th><th scope="col">Outcome</th></tr
							></thead
						>
						<tbody>
							<tr><td>in an accepting state (for an NFA: able to reach one)</td><td>accept</td></tr>
							<tr><td>in any other state</td><td>reject</td></tr>
							<tr><td>no transition was possible along the way</td><td>reject</td></tr>
						</tbody>
					</table>
				</div>
				<p>
					“Accepting” and “final” are synonyms. When a drawn DFA has no transition for a symbol, the
					machine moves to a <dfn>trap state</dfn> (or crashes); tools can draw the trap state explicitly.
				</p>
			</section>

			<!-- Diagram legend -->
			<section aria-labelledby="diagrams">
				{@render sectionHead('diagrams', 'Diagram legend')}
				<p>Machines read from left to right.</p>
				<ul class="legend">
					{#each legend as item (item.kind)}
						<li>
							<LegendGlyph kind={item.kind} />
							<div>
								<p class="legend-name">{item.name}</p>
								<p class="legend-text">{item.text}</p>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<!-- State names -->
			<section aria-labelledby="names">
				{@render sectionHead('names', 'State names')}
				<div class="table-wrap">
					<table class="ref stack">
						<thead>
							<tr
								><th scope="col">Machine</th><th scope="col">States are named</th><th scope="col"
									>Example</th
								></tr
							>
						</thead>
						<tbody>
							<tr>
								<td>Thompson NFA</td>
								<td>
									Letters <span class="f">A, B, C, …</span> by column from left to right, then top
									to bottom. After <span class="f">Z</span> come <span class="f">AA, AB, …</span>
								</td>
								<td
									><span class="f">(1 | 0)*1</span> gives <span class="f">A</span> …
									<span class="f">J</span></td
								>
							</tr>
							<tr>
								<td>Subset-construction DFA</td>
								<td>
									The NFA states it contains, written together in the order they were found. If an
									NFA name has more than one letter, set notation is used instead:
									<span class="f">&#123;AA, B&#125;</span>. Tools can also show sorted sets or
									<span class="f">D0, D1, …</span>
								</td>
								<td class="f">ABCDHI, FGABCDHI, EJGABCDHI</td>
							</tr>
							<tr>
								<td>Empty subset</td>
								<td>
									<span class="f">∅</span>. Left out by default (it is the trap state); tools can
									show it.
								</td>
								<td class="f">∅</td>
							</tr>
							<tr>
								<td>Minimized DFA</td>
								<td
									>The name of the first state in each merged group; the merged states are listed.</td
								>
								<td><span class="f">S</span> for <span class="f">&#123;S, T&#125;</span></td>
							</tr>
							<tr>
								<td>Hand-built</td>
								<td>Whatever you type. New states take the next free letter.</td>
								<td class="f">S, T, U</td>
							</tr>
							<tr>
								<td>Relational operators</td>
								<td>Numbers, as on the slide.</td>
								<td class="f">0 … 8</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<!-- Tables -->
			<section aria-labelledby="tables">
				{@render sectionHead('tables', 'Transition tables')}
				<p>
					Rows are states, columns are input symbols in ascending order, and each cell is the next
					state. Row markers:
				</p>
				<ul class="markers">
					<li><span class="f mark">→</span> start state</li>
					<li><span class="f mark">◎</span> accepting state</li>
					<li>
						<span class="f mark">*</span> retract: push back one character (the relational-operator slide).
						It never means “accepting”.
					</li>
				</ul>
				<div class="table-pair">
					<figure>
						<table class="tt" aria-label="DFA transition table">
							<thead>
								<tr
									><th scope="col"><span class="visually-hidden">State</span></th><th scope="col"
										>0</th
									><th scope="col">1</th></tr
								>
							</thead>
							<tbody>
								<tr><th scope="row"><span class="m">→</span>S</th><td>T</td><td>U</td></tr>
								<tr><th scope="row"><span class="m"></span>T</th><td>T</td><td>U</td></tr>
								<tr><th scope="row"><span class="m">◎</span>U</th><td>T</td><td>U</td></tr>
							</tbody>
						</table>
						<figcaption>DFA <CitationTag cite={{ deck: '08', slide: 14 }} /></figcaption>
					</figure>
					<figure>
						<table class="tt" aria-label="NFA transition table">
							<thead>
								<tr
									><th scope="col"><span class="visually-hidden">State</span></th><th scope="col"
										>0</th
									><th scope="col">1</th><th scope="col">ε</th></tr
								>
							</thead>
							<tbody>
								<tr
									><th scope="row"><span class="m">→</span>A</th><td>∅</td><td>&#123;A, B&#125;</td
									><td>∅</td></tr
								>
								<tr><th scope="row"><span class="m">◎</span>B</th><td>∅</td><td>∅</td><td>∅</td></tr
								>
							</tbody>
						</table>
						<figcaption>
							NFA: cells are sets; an extra ε column <CitationTag cite={{ deck: '06', slide: 9 }} />
						</figcaption>
					</figure>
				</div>
			</section>

			<!-- Tokens -->
			<section aria-labelledby="tokens">
				{@render sectionHead('tokens', 'Tokens and lexemes')}
				<p>
					A <dfn>token</dfn> is a syntactic category, such as Identifier or Keyword. A
					<dfn>lexeme</dfn> is the string a token matched. The slides write token–lexeme pairs in two
					ways, and tools can show either:
				</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead
							><tr
								><th scope="col">Format</th><th scope="col">Lexeme</th><th scope="col">From</th></tr
							></thead
						>
						<tbody>
							<tr>
								<td class="f">(Identifier, "f")</td>
								<td>a string, in double quotes</td>
								<td><CitationTag cite={{ deck: '05', slide: 7 }} /></td>
							</tr>
							<tr>
								<td class="f">&lt;ID,'A'&gt;</td>
								<td>in single quotes</td>
								<td><CitationTag cite={{ deck: '01', slide: 4 }} /></td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					Scanning <span class="f pre">"{scannedText}"</span> (two spaces) with
					<span class="f long">R = Whitespace | Integer | Identifier | '+'</span>. Pointing at a
					pair highlights its lexeme. The slide lists the whitespace token as
					<span class="f pre">(Whitespace, " ")</span>; under maximal munch it matches both spaces.
				</p>
				<div class="example token-example">
					<CharStream
						text={scannedText}
						size="lg"
						highlights={hovered === null
							? scannedRanges
							: scannedRanges.map((r, i) => (i === hovered ? { ...r, tone: 'active' } : r))}
					/>
					<TokenPairs
						tokens={scanned}
						showSkipped
						onhover={(i) => (hovered = i)}
						active={hovered}
					/>
					<TokenPairs
						tokens={scanned}
						format="angle"
						onhover={(i) => (hovered = i)}
						active={hovered}
					/>
				</div>
				<p>
					In inputs, whitespace is drawn visibly: <span class="f">·</span> space,
					<span class="f">⇥</span> tab, <span class="f">↵</span> newline, <span class="f">␍</span>
					carriage return. Skipped tokens such as Whitespace are matched and then dropped; tools can show
					them struck through.
				</p>
				<dl class="rules">
					<dt>Maximal munch</dt>
					<dd>Each token is the longest prefix of the remaining input that matches some rule.</dd>
					<dt>Ties</dt>
					<dd>
						When rules <span class="f">R<sub>j</sub></span> and <span class="f">R<sub>k</sub></span>
						match the same longest prefix, the earlier one wins: <span class="f">min(j, k)</span>.
					</dd>
					<dt>Errors</dt>
					<dd>An optional Error rule, listed last, matches any one character.</dd>
				</dl>
			</section>

			<!-- Defaults -->
			<section aria-labelledby="defaults">
				{@render sectionHead('defaults', 'Conventions beyond the slides')}
				<p>
					Where the slides leave a choice open, every tool makes the same one. These choices fix
					state names and the order of steps.
				</p>
				<dl class="rules">
					<dt>Thompson’s construction</dt>
					<dd>
						<span class="f">A*</span> adds a new start <span class="f">s</span> and final
						<span class="f">f</span> with <span class="f">s →<sup>ε</sup> A.start</span>,
						<span class="f">A.final →<sup>ε</sup> s</span>, and
						<span class="f">s →<sup>ε</sup> f</span>, as drawn on the slide.
						<span class="f">AB</span> links <span class="f">A.final →<sup>ε</sup> B.start</span>
						without merging states. <span class="f">A<sup>+</sup></span> builds
						<span class="f">A A*</span> with a fresh copy of <span class="f">A</span>,
						<span class="f">A<sup>n</sup></span> builds <span class="f">n</span> copies,
						<span class="f">A?</span> builds <span class="f">A | ε</span>, and
						<span class="f">ɸ</span> is a start and a final state with no edge. Each use of a definition
						gets its own copy.
					</dd>
					<dt>ε-closure</dt>
					<dd>
						Lists the starting states first, then the states reached through ε-moves, depth first,
						following edges in the order they were created.
					</dd>
					<dt>Subset construction</dt>
					<dd>
						Unmarked DFA states are processed first in, first out; symbols in ascending order. A DFA
						state accepts when it contains an accepting NFA state; in a scanner it reports the token
						of the earliest rule among them.
					</dd>
					<dt>Minimization</dt>
					<dd>
						Starts from two groups, accepting and non-accepting states (accepting states are also
						split by token), and splits groups until no symbol separates their members. Each split
						comes with a string that tells the states apart.
					</dd>
				</dl>
			</section>
		</div>
	</div>
</div>

<style>
	.notation {
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
	}
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
		min-width: 1.4em;
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
	.toc-title {
		margin: 0 0 var(--space-2);
		padding-left: 10px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		max-width: 52rem;
		min-width: 0;
	}
	.content section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.content section > :global(*) {
		margin: 0;
	}
	.section-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.section-head h2 {
		margin: 0;
	}
	.cites {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	h3 {
		margin: var(--space-2) 0 0;
		font-size: var(--text-lg);
	}
	dfn {
		font-style: italic;
		font-weight: 500;
	}
	.f {
		font-family: var(--font-mono);
		font-size: 0.92em;
		font-variant-ligatures: none;
		white-space: nowrap;
	}
	.f.pre {
		white-space: pre;
	}
	/* break-word, not anywhere: a column is never squeezed narrower than its longest token. */
	td.f,
	.f.long {
		white-space: normal;
		overflow-wrap: break-word;
	}
	.note {
		margin-left: 0.5em;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
	}
	.display {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 1.05rem;
		text-align: center;
		white-space: normal;
	}
	.example {
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.token-example {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.ref {
		width: 100%;
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.ref th,
	.ref td {
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}
	.ref thead th {
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ref tbody tr:last-child > * {
		border-bottom: 0;
	}
	.ref tr.group th {
		padding-top: 12px;
		padding-bottom: 4px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ref td:first-child {
		white-space: nowrap;
	}
	.clauses td:nth-child(2) {
		white-space: nowrap;
	}
	.clauses td:nth-child(3) {
		min-width: 18rem;
	}
	@media (max-width: 600px) {
		.ref th,
		.ref td {
			padding: 8px 10px;
		}
		.ref td:first-child {
			white-space: normal;
		}
		.stack thead {
			display: none;
		}
		.stack,
		.stack tbody,
		.stack tr,
		.stack td {
			display: block;
		}
		.stack tr {
			padding: 10px 14px;
			border-bottom: 1px solid var(--border);
		}
		.stack tbody tr:last-child {
			border-bottom: 0;
		}
		.stack td,
		.ref.stack td {
			padding: 2px 0;
			border: 0;
		}
		.stack td:first-child {
			font-weight: 600;
		}
		.stack td:nth-child(3)::before {
			content: 'Example: ';
			color: var(--text-3);
			font-family: var(--font-sans);
			font-size: var(--text-xs);
		}
	}
	.sym {
		font-size: 1.1em;
	}

	.rules {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-1) var(--space-5);
		margin: 0;
	}
	.rules dt {
		font-weight: 600;
	}
	.rules dd {
		margin: 0 0 var(--space-3);
		color: var(--text-2);
	}
	@media (min-width: 720px) {
		.rules {
			grid-template-columns: 11rem minmax(0, 1fr);
		}
		.rules dd {
			margin-bottom: var(--space-2);
		}
	}

	.ladder {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ladder li {
		display: grid;
		grid-template-columns: 2rem 7rem minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.ladder li:nth-child(2) {
		margin-left: var(--space-4);
	}
	.ladder li:nth-child(3) {
		margin-left: var(--space-6);
	}
	.rank {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.ladder .f {
		white-space: pre;
	}

	figure {
		margin: 0;
		min-width: 0;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.code {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: 0.8125rem;
		line-height: 1.7;
	}
	.code-pair,
	.table-pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 900px) {
		.code-pair {
			grid-template-columns: 1.4fr 1fr;
		}
	}
	@media (min-width: 640px) {
		.table-pair {
			grid-template-columns: repeat(2, max-content);
			gap: var(--space-6);
		}
	}

	.tuple {
		margin: 0;
		padding-left: 1.6em;
	}
	.tuple li {
		padding: 2px 0;
	}

	.legend {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.legend li > :global(svg) {
		flex: none;
	}
	.legend-name {
		margin: 0;
		font-weight: 600;
		font-size: var(--text-sm);
	}
	.legend-text {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.markers {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.mark {
		display: inline-block;
		width: 1.6em;
		color: var(--accent);
		font-size: 1.05em;
		text-align: center;
	}
	.tt {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
		border: 1px solid var(--border-strong);
		background: var(--surface);
	}
	.tt th,
	.tt td {
		min-width: 3.2rem;
		padding: 6px 12px;
		border: 1px solid var(--border);
		text-align: center;
	}
	.tt thead th {
		background: var(--surface-2);
		font-weight: 600;
	}
	.tt tbody th {
		background: var(--surface-2);
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	.tt .m {
		display: inline-block;
		width: 1.4em;
		color: var(--accent);
	}
</style>
