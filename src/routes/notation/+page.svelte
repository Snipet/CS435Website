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
	import {
		DerivationChain,
		LrItem,
		LrState,
		ParseTreeView,
		TokenStream,
		pathKey,
		type ItemStyle,
		type ItemView
	} from '$lib/components/grammar';
	import { printSet } from '$lib/theory/grammar';
	import {
		bottomUpTree,
		emptyParensTree,
		instanceLabels,
		instanceTree,
		leftAssocTrees,
		precedenceTrees,
		shiftReduceForest,
		sumTrees
	} from '$lib/components/grammar/fixtures';
	import GrammarClasses from './GrammarClasses.svelte';
	import LegendGlyph, { type GlyphKind } from './LegendGlyph.svelte';
	import {
		danglingElseGrammar,
		ebnfRewrites,
		expressionGrammar,
		grammarSegments,
		precedenceDeclarations,
		productionFunctions,
		rewriteChain,
		statusMessages
	} from './grammar-notation';
	import {
		bisonDeclarations,
		bottomUpGrammar,
		cellCode,
		closureCode,
		configurationPieces,
		conflictExamples,
		formPieces,
		formText,
		handleRows,
		ll1Algorithm,
		ll1Columns,
		ll1Grammar,
		ll1Sets,
		ll1Table,
		ll1Trace,
		lrAlgorithm,
		lrEdges,
		lrGrammar,
		lrItem,
		lrNonterminals,
		lrStates,
		lrTableRows,
		lrTerminals,
		shiftReduceForestRow,
		shiftReduceTrace,
		shiftRules,
		transitionCode,
		type FormPiece
	} from './parsing-notation';

	const groups = [
		{
			id: 'lexical',
			title: 'Lexical analysis',
			sections: [
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
			]
		},
		{
			id: 'parsing',
			title: 'Grammars and parsing',
			sections: [
				{ id: 'productions', title: 'Productions and alternatives' },
				{ id: 'derivations', title: 'Derivations' },
				{ id: 'cfg', title: 'Context-free grammars' },
				{ id: 'chomsky', title: 'Chomsky hierarchy' },
				{ id: 'ebnf', title: 'EBNF' },
				{ id: 'trees', title: 'Parse trees' },
				{ id: 'descent', title: 'Recursive descent' },
				{ id: 'declarations', title: 'Disambiguating declarations' }
			]
		},
		{
			id: 'bottom-up',
			title: 'LL(1) and bottom-up parsing',
			sections: [
				{ id: 'first-follow', title: 'First and Follow' },
				{ id: 'll1-tables', title: 'LL(1) parsing tables' },
				{ id: 'll1-traces', title: 'LL(1) parse traces' },
				{ id: 'handles', title: 'Handles' },
				{ id: 'shift-reduce', title: 'Shift-reduce parsing' },
				{ id: 'lr-items', title: 'LR(1) items' },
				{ id: 'lr-tables', title: 'LR parsing tables' },
				{ id: 'conflicts', title: 'Conflicts' },
				{ id: 'bison', title: 'Precedence in bison' },
				{ id: 'grammar-classes', title: 'Grammar classes' }
			]
		}
	] as const;

	const sections = [...groups[0].sections, ...groups[1].sections, ...groups[2].sections] as const;

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
		defaults: [{ deck: '08', slide: [3, 5] }],
		productions: [
			{ deck: '09', slide: [12, 14] },
			{ deck: '09', slide: 26 },
			{ deck: '10', slide: 11 }
		],
		derivations: [
			{ deck: '09', slide: 12 },
			{ deck: '09', slide: [17, 20] },
			{ deck: '09', slide: 22 }
		],
		cfg: [{ deck: '09', slide: [14, 15] }],
		chomsky: [{ deck: '09', slide: 23 }],
		ebnf: [
			{ deck: '11', slide: [24, 25] },
			{ deck: '11', slide: [36, 39] }
		],
		trees: [
			{ deck: '10', slide: [4, 5] },
			{ deck: '10', slide: 10 },
			{ deck: '10', slide: 17 }
		],
		descent: [
			{ deck: '11', slide: [5, 20] },
			{ deck: '11', slide: [29, 34] },
			{ deck: '11', slide: 37 }
		],
		declarations: [{ deck: '10', slide: [16, 18] }],
		'first-follow': [
			{ deck: '12', slide: [18, 19] },
			{ deck: '12', slide: [20, 23] }
		],
		'll1-tables': [
			{ deck: '12', slide: 3 },
			{ deck: '12', slide: [7, 9] },
			{ deck: '12', slide: [24, 26] }
		],
		'll1-traces': [{ deck: '12', slide: [10, 12] }],
		handles: [
			{ deck: '13', slide: 2 },
			{ deck: '13', slide: 4 },
			{ deck: '13', slide: [5, 11] }
		],
		'shift-reduce': [
			{ deck: '14', slide: [2, 3] },
			{ deck: '14', slide: [4, 15] }
		],
		'lr-items': [
			{ deck: '15', slide: [5, 7] },
			{ deck: '15', slide: [10, 14] }
		],
		'lr-tables': [
			{ deck: '14', slide: [16, 19] },
			{ deck: '14', slide: [20, 21] }
		],
		conflicts: [
			{ deck: '15', slide: [16, 18] },
			{ deck: '15', slide: [23, 25] }
		],
		bison: [{ deck: '15', slide: [19, 22] }],
		'grammar-classes': [{ deck: '15', slide: 26 }]
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

	const treeRules = [
		'The root is at the top; children are drawn left to right.',
		'Plain straight lines fan out from a point under the parent. Labels have no boxes.',
		'A single child sits directly below its parent.',
		'Operators such as + are children, like any other symbol.',
		'A leaf sits one level below its own parent; the leaves do not share a baseline.',
		'Two trees for one string are drawn in two colors.',
		'A tree that is ruled out is crossed out with an X.',
		'An ε-production is drawn with an ε leaf.'
	];

	const bottomUpTreeRules = [
		'The tokens sit on one bottom row, in input order, evenly spaced.',
		'Each reduction adds a node above its children, centered over them, so the tree grows upward.',
		'A node with a single child sits directly above it.',
		'A node is raised further when a line to one of its children would pass through another child’s subtree.'
	];

	/** A right-hand side in an LL(1) cell: symbols with spaces, ε for none. */
	const rhsText = (symbols: readonly string[]) => (symbols.length ? symbols.join(' ') : 'ε');

	// Bottom-up Parsing III, slides 5, 8 and 14: one item in each of its forms.
	const formsItem = lrItem('E', 'E + • ( E )', '+');
	const itemForms: { name: string; used: string; style: ItemStyle; item: ItemView }[] = [
		{
			name: 'Bracketed',
			used: 'definitions, algorithms and conflicts',
			style: 'bracketed',
			item: formsItem
		},
		{ name: 'Spaced', used: 'running text', style: 'spaced', item: formsItem },
		{ name: 'Compact', used: 'inside a state box', style: 'compact', item: formsItem }
	];
	const mergedItem = lrItem('E', '• int', '$', '+');
	const lrColumns = [...lrTerminals, ...lrNonterminals];
	const srPieces = configurationPieces(shiftReduceForestRow);

	// Top-Down Parsing, slide 20 numbers the instances E0, T1, T2.
	const instanceLabel = (_: unknown, path: number[]) => instanceLabels[pathKey(path)];

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
		content="The notation used by the CS435 tools: regular expressions, flex patterns, finite automata, state names, transition tables, token formats, grammars, derivations, parse trees, LL(1) tables, shift-reduce parsing, LR(1) items, and parse conflicts."
	/>
</svelte:head>

{#snippet toc()}
	<div class="toc">
		{#each groups as group (group.id)}
			<p class="toc-group">{group.title}</p>
			<ol class="toc-list" aria-label={group.title}>
				{#each group.sections as s (s.id)}
					<li>
						<a href="#{s.id}" aria-current={activeId === s.id ? 'location' : undefined}>{s.title}</a
						>
					</li>
				{/each}
			</ol>
		{/each}
	</div>
{/snippet}

{#snippet grammar(text: string, opts?: { ebnf?: boolean; nonterminals?: readonly string[] })}
	<pre class="code">{#each grammarSegments(text, opts) as seg, i (i)}{#if seg.className}<span
					class={seg.className}>{seg.text}</span
				>{:else}{seg.text}{/if}{/each}</pre>
{/snippet}

{#snippet divider()}<span class="divider" title="divider">I</span>{/snippet}

{#snippet becomes()}<span class="becomes">⇒</span>{/snippet}

{#snippet pieces(list: FormPiece[], mark: string)}{#each list as piece, j (j)}{#if piece.mark}<span
				class={mark}>{piece.text}</span
			>{:else}{piece.text}{/if}{/each}{/snippet}

{#snippet itemList(items: readonly ItemView[], partial: boolean)}
	<ul class="item-list">
		{#each items as item, i (i)}<li><LrItem {item} /></li>{/each}
		{#if partial}<li class="omitted">…</li>{/if}
	</ul>
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
			<p class="group-label">{groups[0].title}</p>

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

			<p class="group-label">{groups[1].title}</p>

			<!-- Productions -->
			<section aria-labelledby="productions">
				{@render sectionHead('productions', 'Productions and alternatives')}
				<p>
					A grammar is written as a list of <dfn>productions</dfn>. A production has one
					non-terminal on the left of <span class="f">→</span> and, on the right, the symbols that may
					replace it.
				</p>
				<div class="table-wrap">
					<table class="ref">
						<thead>
							<tr
								><th scope="col">Written</th><th scope="col">Meaning</th><th scope="col">Example</th
								></tr
							>
						</thead>
						<tbody>
							<tr>
								<td class="f sym">→</td>
								<td>Production: the left-hand side may be replaced by the right-hand side</td>
								<td class="f">E → E + E</td>
							</tr>
							<tr>
								<td class="f sym">|</td>
								<td>
									Separates the alternatives of one non-terminal:
									<span class="f">S → 0 | 1</span> stands for <span class="f">S → 0</span> and
									<span class="f">S → 1</span>
								</td>
								<td class="f">E → T | T + E</td>
							</tr>
							<tr>
								<td class="f sym">ε</td>
								<td>The empty right-hand side</td>
								<td class="f">S → ε | ( S )</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div class="code-pair">
					<figure>
						{@render grammar(expressionGrammar)}
						<figcaption>
							<span>One line per non-terminal</span>
							<CitationTag cite={{ deck: '11', slide: 4 }} />
						</figcaption>
					</figure>
					<figure>
						{@render grammar(danglingElseGrammar)}
						<figcaption>
							<span>Continuation lines start with <span class="f">|</span></span>
							<CitationTag cite={{ deck: '10', slide: 11 }} />
						</figcaption>
					</figure>
				</div>
				<dl class="rules">
					<dt>Non-terminals</dt>
					<dd>
						A symbol is a non-terminal exactly when it has a production, that is, when it appears on
						a left-hand side. By convention non-terminals are written with a capital letter:
						<span class="f">E</span>, <span class="f">EXPR</span>,
						<span class="f">NounPhrase</span>.
					</dd>
					<dt>Terminals</dt>
					<dd>
						Every other symbol. By convention terminals are lower-case names or punctuation:
						<span class="f">int</span>, <span class="f">id</span>, <span class="f">+</span>,
						<span class="f">(</span>. The spelling does not decide: <span class="f">OTHER</span> in the
						grammar above has no production, so it is a terminal.
					</dd>
					<dt>Start symbol</dt>
					<dd>The left-hand side of the first production.</dd>
					<dt>Spacing</dt>
					<dd>
						Symbols are separated by spaces. Each punctuation character is a symbol by itself, so
						<span class="f">E+E</span> is read as <span class="f">E + E</span>.
					</dd>
					<dt>Quoted terminals</dt>
					<dd>
						A terminal of several characters or several words is quoted:
						<span class="f">"the cat"</span>, <span class="f">'=='</span>.
					</dd>
					<dt>Primes</dt>
					<dd>
						A non-terminal added by a rewrite is named with a prime: <span class="f">S’</span> next
						to <span class="f">S</span>.
					</dd>
					<dt>Comments</dt>
					<dd>
						Lines starting with <span class="f">//</span> and text between <span class="f">/*</span>
						and <span class="f">*/</span> are ignored.
					</dd>
				</dl>

				<h3>Typing the symbols</h3>
				<p>
					Grammar fields turn <span class="f">-&gt;</span> into <span class="f">→</span> as you
					type, and the buttons above a field insert a symbol at the cursor. Inside quotes and
					comments
					<span class="f">-&gt;</span> stays as typed, so a terminal spelled that way is written
					<span class="f">'-&gt;'</span>.
				</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead>
							<tr
								><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col">Type</th
								></tr
							>
						</thead>
						<tbody>
							<tr><td class="f sym">→</td><td>Production arrow</td><td class="f">-&gt;</td></tr>
							<tr
								><td class="f sym">ε</td><td>Empty right-hand side</td><td class="f">epsilon</td
								></tr
							>
							<tr><td class="f sym">S’</td><td>Primed name</td><td class="f">S'</td></tr>
						</tbody>
					</table>
				</div>
			</section>

			<!-- Derivations -->
			<section aria-labelledby="derivations">
				{@render sectionHead('derivations', 'Derivations')}
				<p>
					A <dfn>derivation</dfn> begins with the start symbol and replaces one non-terminal at a
					time by a right-hand side of one of its productions, until only terminals remain. The
					strings along the way are <dfn>sentential forms</dfn>.
				</p>
				<p>
					A step is written with the same arrow as a production. In this chain the underlined
					non-terminal is the one the next step replaces, and the tinted symbols are what the step
					before put in.
				</p>
				<figure>
					<div class="example">
						<DerivationChain
							forms={rewriteChain.forms}
							steps={rewriteChain.steps}
							nonterminals={rewriteChain.nonterminals}
							size="lg"
							ariaLabel="Derivation of ( int + int ) * int"
						/>
					</div>
					<figcaption>
						<span>The slide writes the last three steps as <span class="f">…</span></span>
						<CitationTag cite={{ deck: '09', slide: 12 }} />
					</figcaption>
				</figure>
				<div class="table-wrap">
					<table class="ref compact">
						<thead><tr><th scope="col">Written</th><th scope="col">Meaning</th></tr></thead>
						<tbody>
							<tr><td class="f sym">→</td><td>One step: one non-terminal is replaced</td></tr>
							<tr><td class="f sym">→<sup>*</sup></td><td>0 or more steps</td></tr>
							<tr><td class="f sym">→<sup>+</sup></td><td>1 or more steps</td></tr>
						</tbody>
					</table>
				</div>
				<p>
					One step replaces a single non-terminal <span class="f">X<sub>i</sub></span> and leaves the
					rest of the string as it is:
				</p>
				<p class="display f">
					X<sub>1</sub> … X<sub>i-1</sub> <b>X<sub>i</sub></b> X<sub>i+1</sub> … X<sub>n</sub> → X<sub
						>1</sub
					>
					… X<sub>i-1</sub> <b>Y<sub>1</sub> … Y<sub>m</sub></b> X<sub>i+1</sub> … X<sub>n</sub>
				</p>
				<p>
					if there is a production <span class="f"
						>X<sub>i</sub> → Y<sub>1</sub> … Y<sub>m</sub></span
					>. The language of a grammar <span class="f">G</span> with start symbol
					<span class="f">S</span> is the set of strings of terminals that
					<span class="f">S</span> derives:
				</p>
				<p class="display f">
					L(G) = &#123; a<sub>1</sub>a<sub>2</sub> … a<sub>n</sub> | S →<sup>*</sup>
					a<sub>1</sub>a<sub>2</sub> … a<sub>n</sub> and a<sub>i</sub> ∈ T &#125;
				</p>
				<p>
					A leftmost derivation replaces the leftmost non-terminal in every step, and a rightmost
					derivation the rightmost one. Both are named in words; the arrow stays the same.
				</p>
			</section>

			<!-- CFG -->
			<section aria-labelledby="cfg">
				{@render sectionHead('cfg', 'Context-free grammars')}
				<p>A context-free grammar (CFG) <span class="f">G</span> is a four-tuple. It consists of</p>
				<ol class="tuple">
					<li>a set of non-terminals <span class="f">N</span>,</li>
					<li>a set of terminals <span class="f">T</span>,</li>
					<li>a start symbol <span class="f">S</span>, which is a non-terminal, and</li>
					<li>a set of productions <span class="f">P</span>.</li>
				</ol>
				<p class="display f">G = (N, T, S, P)</p>
				<p>
					For a non-terminal <span class="f">E ∈ N</span>, a production is either
					<span class="f">E → ε</span> or
					<span class="f">E → Y<sub>1</sub> Y<sub>2</sub> … Y<sub>n</sub></span> where each
					<span class="f">Y<sub>i</sub> ∈ N ∪ T</span>.
				</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead>
							<tr>
								<th scope="col">Grammar</th>
								<th scope="col">N</th>
								<th scope="col">T</th>
								<th scope="col">S</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="f">E → int<br />E → E + E<br />E → E * E<br />E → ( E )</td>
								<td class="f">&#123; E &#125;</td>
								<td class="f">&#123; int, +, *, (, ) &#125;</td>
								<td class="f">E</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<!-- Chomsky hierarchy -->
			<section aria-labelledby="chomsky">
				{@render sectionHead('chomsky', 'Chomsky hierarchy')}
				<div class="table-wrap">
					<table class="ref chomsky">
						<thead>
							<tr>
								<th scope="col">Type</th>
								<th scope="col">Language</th>
								<th scope="col">Form</th>
								<th scope="col">Recognizer</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>0</td>
								<td>Unrestricted or recursively enumerable</td>
								<td class="f">αXβ → αδβ<br />X ∈ N ∪ T<br />α, β, δ ∈ (N ∪ T)*</td>
								<td>Turing machine</td>
							</tr>
							<tr>
								<td>1</td>
								<td>Context Sensitive</td>
								<td class="f">αVβ → αδβ<br />V ∈ N<br />δ ≠ ε</td>
								<td>Linear Bounded Automaton (ND)</td>
							</tr>
							<tr>
								<td>2</td>
								<td>Context Free</td>
								<td class="f">V → α<br />V ∈ N<br />α ∈ (N ∪ T)*</td>
								<td>Push-down Automaton (ND)</td>
							</tr>
							<tr>
								<td>3</td>
								<td>Regular</td>
								<td class="f">V → w | wU<br />w ∈ T*; U, V ∈ N</td>
								<td>NFA or DFA</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					(ND) marks a nondeterministic recognizer. The four classes are nested: each one contains
					the classes below it in the table.
					<CitationTag cite={{ deck: '09', slide: 24 }} />
				</p>
			</section>

			<!-- EBNF -->
			<section aria-labelledby="ebnf">
				{@render sectionHead('ebnf', 'EBNF')}
				<p>
					Extended BNF adds two pairs of brackets to right-hand sides. They are written with spaces
					inside.
				</p>
				<div class="table-wrap">
					<table class="ref">
						<thead>
							<tr
								><th scope="col">Written</th><th scope="col">Meaning</th><th scope="col">Example</th
								></tr
							>
						</thead>
						<tbody>
							<tr>
								<td class="f">&#123; α &#125;</td>
								<td>Zero or more α</td>
								<td class="f">E → T &#123; + T &#125;</td>
							</tr>
							<tr>
								<td class="f">[ α ]</td>
								<td>Optional α</td>
								<td class="f">E → T [ + E ]</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>Grammars from the slides, without and with the brackets:</p>
				<ul class="rewrites">
					{#each ebnfRewrites as r (r.slide)}
						<li>
							{@render grammar(r.before, { nonterminals: r.nonterminals })}
							<span class="becomes">becomes</span>
							{@render grammar(r.after, { ebnf: true, nonterminals: r.nonterminals })}
							<span class="from"><CitationTag cite={{ deck: '11', slide: r.slide }} /></span>
						</li>
					{/each}
				</ul>
				<p>
					Left recursion turns into a repetition and a shared beginning into an option. In an EBNF
					grammar <span class="f">&#123; &#125; [ ]</span> are metasymbols, and a bracket that is a
					terminal is quoted: <span class="f">'['</span>. In a plain grammar they are ordinary
					terminals.
				</p>
			</section>

			<!-- Parse trees -->
			<section aria-labelledby="trees">
				{@render sectionHead('trees', 'Parse trees')}
				<p>
					A parse tree has the start symbol at its root. The children of a non-terminal are the
					symbols of the right-hand side that replaced it, and the leaves, read from left to right,
					spell the string.
				</p>
				<ul class="tree-rules">
					{#each treeRules as rule (rule)}<li>{rule}</li>{/each}
				</ul>
				<div class="tree-figs">
					<figure class="wide">
						<div class="example trees">
							<ParseTreeView
								tree={sumTrees.left}
								tone={2}
								ariaLabel="Parse tree of int + int + int that groups to the left"
							/>
							<ParseTreeView
								tree={sumTrees.right}
								tone={3}
								ariaLabel="Parse tree of int + int + int that groups to the right"
							/>
						</div>
						<figcaption>
							<span
								>The two parse trees of <span class="f">int + int + int</span> under
								<span class="f">E → E + E | E * E | ( E ) | int</span></span
							>
							<CitationTag cite={{ deck: '10', slide: 4 }} />
						</figcaption>
					</figure>
					<figure>
						<div class="example trees">
							<ParseTreeView
								tree={leftAssocTrees.right}
								tone={3}
								rejected
								ariaLabel="Parse tree of int + int + int that groups to the right"
							/>
						</div>
						<figcaption>
							<span
								>Ruled out by <span class="f">%left +</span> under
								<span class="f">E → E + E | int</span></span
							>
							<CitationTag cite={{ deck: '10', slide: 17 }} />
						</figcaption>
					</figure>
					<figure>
						<div class="example trees">
							<ParseTreeView tree={emptyParensTree} ariaLabel="Parse tree of ( )" />
						</div>
						<figcaption>
							<span
								><span class="f">( )</span> under <span class="f">S → ε | ( S )</span>: the inner
								<span class="f">S</span> derives ε</span
							>
							<CitationTag cite={{ deck: '09', slide: 27 }} />
						</figcaption>
					</figure>
				</div>
			</section>

			<!-- Recursive descent -->
			<section aria-labelledby="descent">
				{@render sectionHead('descent', 'Recursive descent')}
				<p>
					A recursive-descent parser builds the parse tree from the top and from left to right. It
					tries the productions of a non-terminal in the order they are written.
				</p>

				<h3>Input pointer</h3>
				<p>
					An <span class="f">↑</span> stands under the next token, and after the last token at the end
					of the input. Tokens that are already matched are muted.
				</p>
				<div class="example streams">
					<TokenStream tokens={['(', 'int', ')']} pointer={1} size="lg" />
					<TokenStream tokens={['(', 'int', ')']} pointer={3} size="lg" />
				</div>
				<p>
					A predictive parser ends its input with <span class="f">$</span>, which is then the last
					token the pointer reaches.
				</p>
				<figure>
					<div class="example streams">
						<TokenStream tokens={['int', '*', 'int']} endMarker pointer={3} size="lg" />
					</div>
					<figcaption><CitationTag cite={{ deck: '11', slide: 37 }} /></figcaption>
				</figure>

				<h3>Status messages</h3>
				<dl class="rules messages">
					{#each statusMessages as m (m.text)}
						<dt>{m.text}</dt>
						<dd>{m.when}</dd>
					{/each}
				</dl>

				<h3>Instances and functions</h3>
				<p>
					Occurrences of a non-terminal in a tree are numbered to tell them apart, starting from 0
					at the root:
					<span class="f">E<sub>0</sub> → T<sub>1</sub> + E<sub>2</sub></span>.
				</p>
				<figure>
					<div class="example trees">
						<ParseTreeView
							tree={instanceTree}
							labels={instanceLabel}
							ariaLabel="Parse tree of int * int with numbered instances"
						/>
					</div>
					<figcaption>
						<span
							><span class="f">int * int</span> under
							<span class="f">E → T + E | T</span>,
							<span class="f">T → ( E ) | int | int * T</span></span
						>
						<CitationTag cite={{ deck: '11', slide: 20 }} />
					</figcaption>
				</figure>
				<p>
					The function that checks the <i>i</i>-th production of a non-terminal carries that number,
					counted from 1 in the order the productions are written. The function without a number
					tries them in that order. The slides number the functions for the grammar below, which has
					the same productions as the grammar of the tree above in another order:
				</p>
				<figure>
					{@render grammar(expressionGrammar)}
					<figcaption><CitationTag cite={{ deck: '11', slide: [31, 34] }} /></figcaption>
				</figure>
				<div class="table-wrap">
					<table class="ref compact">
						<thead><tr><th scope="col">Function</th><th scope="col">Checks</th></tr></thead>
						<tbody>
							{#each productionFunctions as fn (fn.name + fn.number)}
								<tr>
									<td class="f">{fn.name}<sub>{fn.number}</sub> ()</td>
									<td class="f">{fn.production}</td>
								</tr>
							{/each}
							<tr>
								<td><span class="f">E ()</span>, <span class="f">T ()</span></td>
								<td>any production of the non-terminal</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					Parser code is C, written as on the slides with a space before the parentheses of a call:
				</p>
				<figure>
					<pre class="code">bool E<sub>2</sub
						> () &#123; return T () &amp;&amp; match (PLUS) &amp;&amp; E (); &#125;</pre>
					<figcaption><CitationTag cite={{ deck: '11', slide: 34 }} /></figcaption>
				</figure>
			</section>

			<!-- Disambiguating declarations -->
			<section aria-labelledby="declarations">
				{@render sectionHead('declarations', 'Disambiguating declarations')}
				<p>
					An ambiguous grammar can be kept as it is and given declarations that pick one tree for
					each string. They are written in bison syntax, one per line.
				</p>
				<figure>
					{@render grammar(precedenceDeclarations)}
					<figcaption><CitationTag cite={{ deck: '10', slide: 18 }} /></figcaption>
				</figure>
				<dl class="rules">
					<dt><span class="f">%left</span></dt>
					<dd>
						Makes the operator left-associative: <span class="f">int + int + int</span> groups as
						<span class="f">( int + int ) + int</span>.
					</dd>
					<dt>Order of the lines</dt>
					<dd>
						Lowest precedence first: an operator declared on a later line binds tighter. Here
						<span class="f">*</span> binds tighter than <span class="f">+</span>, so
						<span class="f">int + int * int</span> groups as
						<span class="f">int + ( int * int )</span>.
					</dd>
				</dl>
				<figure>
					<div class="example trees">
						<ParseTreeView
							tree={precedenceTrees.left}
							tone={3}
							rejected
							ariaLabel="Parse tree of int + int * int with * at the root"
						/>
						<ParseTreeView
							tree={precedenceTrees.right}
							tone={3}
							ariaLabel="Parse tree of int + int * int with + at the root"
						/>
					</div>
					<figcaption>
						<span
							><span class="f">int + int * int</span> under
							<span class="f">E → E + E | E * E | int</span> with the two declarations</span
						>
						<CitationTag cite={{ deck: '10', slide: 18 }} />
					</figcaption>
				</figure>
			</section>

			<p class="group-label">{groups[2].title}</p>

			<!-- First and Follow -->
			<section aria-labelledby="first-follow">
				{@render sectionHead('first-follow', 'First and Follow')}
				<p>
					A predictive parser chooses a production by the next token. Two sets of terminals decide
					the choice. <dfn>First</dfn> of a string of symbols holds the terminals that can begin
					what it derives, and ε when it derives ε. <dfn>Follow</dfn> of a non-terminal holds the terminals
					that can come right after it in a sentential form.
				</p>
				<p class="display f">
					First(X) = &#123; b | X →<sup>*</sup> bα &#125; ∪ &#123; ε | X →<sup>*</sup> ε &#125;
				</p>
				<p class="display f">Follow(X) = &#123; b | S →<sup>*</sup> β X b ω &#125;</p>
				<p>
					Here b is a terminal and α, β, ω are strings of grammar symbols.
					<span class="f">$</span> is the end marker: the end of the input, the bottom of the parser’s
					stack, and a member of Follow(S) for the start symbol S.
				</p>
				<div class="rule-pair">
					<div>
						<h3>Computing First</h3>
						<ol class="steps">
							<li><span class="f">First(b) = &#123; b &#125;</span> for a terminal b.</li>
							<li>
								For every production <span class="f">X → A<sub>1</sub> … A<sub>n</sub></span>: add
								<span class="f">First(A<sub>1</sub>) – &#123; ε &#125;</span> to First(X) and stop
								if
								<span class="f">ε ∉ First(A<sub>1</sub>)</span>; then the same for A<sub>2</sub>, …,
								A<sub>n</sub>. If no step stops, add ε to First(X). Ignore A<sub>i</sub> if it is X.
							</li>
						</ol>
					</div>
					<div>
						<h3>Computing Follow</h3>
						<ol class="steps">
							<li>Compute the First sets of all non-terminals.</li>
							<li>Add <span class="f">$</span> to Follow(S).</li>
							<li>
								For every production <span class="f">Y → … X A<sub>1</sub> … A<sub>n</sub></span>:
								add
								<span class="f">First(A<sub>1</sub>) – &#123; ε &#125;</span> to Follow(X) and stop
								if
								<span class="f">ε ∉ First(A<sub>1</sub>)</span>; then the same for A<sub>2</sub>, …,
								A<sub>n</sub>. If no step stops, add Follow(Y) to Follow(X).
							</li>
						</ol>
					</div>
				</div>
				<p>The rules are applied until no set changes.</p>
				<figure>
					<div class="grammar-sets">
						{@render grammar(ll1Grammar)}
						<div class="table-wrap">
							<table class="ref compact">
								<thead>
									<tr>
										<th scope="col" class="notation-head">X</th>
										<th scope="col" class="notation-head">First(X)</th>
										<th scope="col" class="notation-head">Follow(X)</th>
									</tr>
								</thead>
								<tbody>
									{#each ll1Sets as row (row.nonterminal)}
										<tr>
											<td class="f">{row.nonterminal}</td>
											<td class="f">{printSet(row.first)}</td>
											<td class="f">{printSet(row.follow)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
					<figcaption>
						<span>First and Follow of the left-factored expression grammar</span>
						<CitationTag cite={{ deck: '12', slide: [21, 23] }} />
					</figcaption>
				</figure>
			</section>

			<!-- LL(1) parsing tables -->
			<section aria-labelledby="ll1-tables">
				{@render sectionHead('ll1-tables', 'LL(1) parsing tables')}
				<p>
					An <dfn>LL(1)</dfn> parser reads the input from <b>L</b>eft to right, builds a
					<b>L</b>eftmost derivation, and predicts each production from <b>1</b> token of lookahead, without
					backtracking. Its choices form a two-dimensional table:
				</p>
				<ul class="tree-rules">
					<li>Rows are non-terminals; columns are terminals, then <span class="f">$</span>.</li>
					<li>
						A cell holds the right-hand side to expand the row’s non-terminal by (<span class="f"
							>int Y</span
						>, <span class="f">ε</span>), not the whole production.
					</li>
					<li>A blank cell is an error.</li>
					<li>
						A cell is named by its row and column, <span class="f">[E, int]</span>; the parser looks
						up
						<span class="f">T[N, a]</span>.
					</li>
				</ul>
				<figure>
					<div class="scroll">
						<table class="tt" aria-label="LL(1) parsing table">
							<thead>
								<tr>
									<th scope="col"><span class="visually-hidden">Non-terminal</span></th>
									{#each ll1Columns as column (column)}<th scope="col">{column}</th>{/each}
								</tr>
							</thead>
							<tbody>
								{#each ll1Table as row (row.nonterminal)}
									<tr>
										<th scope="row">{row.nonterminal}</th>
										{#each ll1Columns as column (column)}
											{@const rhs = row.cells[column]}
											<td>{rhs ? rhsText(rhs) : ''}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<figcaption>
						<span>The table of the grammar above, with the rows in the slide’s order</span>
						<CitationTag cite={{ deck: '12', slide: 7 }} />
					</figcaption>
				</figure>

				<h3>Filling the table</h3>
				<p>For each production <span class="f">A → α</span>:</p>
				<ol class="tuple">
					<li>
						for each terminal <span class="f">b ∈ First(α)</span>, set
						<span class="f">T[A, b] = α</span>;
					</li>
					<li>
						if <span class="f">α →<sup>*</sup> ε</span>, for each
						<span class="f">b ∈ Follow(A)</span>, set <span class="f">T[A, b] = α</span> (b may be $).
					</li>
				</ol>
				<dl class="rules">
					<dt><span class="f">Y → * T</span></dt>
					<dd>goes in the columns of <span class="f">First( *T ) = &#123; * &#125;</span>.</dd>
					<dt><span class="f">Y → ε</span></dt>
					<dd>
						goes in the columns of <span class="f">Follow( Y ) = &#123; +, ), $ &#125;</span>.
					</dd>
				</dl>
				<p>
					A grammar is LL(1) when no cell is multiply defined. An ambiguous, left-recursive, or not
					left-factored grammar is not LL(1), and neither are most programming-language grammars.
				</p>
			</section>

			<!-- LL(1) parse traces -->
			<section aria-labelledby="ll1-traces">
				{@render sectionHead('ll1-traces', 'LL(1) parse traces')}
				<p>
					The parser keeps the symbols it still has to match on a stack, which starts as
					<span class="f">&lt; S $ &gt;</span>. It looks at the top of the stack and the next token:
				</p>
				<dl class="rules">
					<dt>Non-terminal on top</dt>
					<dd>
						It is replaced by the right-hand side in its cell for the next token. A blank cell is an
						error.
					</dd>
					<dt>Terminal on top</dt>
					<dd>
						It must be the next token: it is popped and the input advances. Otherwise it is an
						error.
					</dd>
					<dt>Accept</dt>
					<dd>At the end of the input, with the stack empty.</dd>
				</dl>
				<figure>
					<pre class="code">{ll1Algorithm}</pre>
					<figcaption><CitationTag cite={{ deck: '12', slide: 11 }} /></figcaption>
				</figure>
				<p>
					A trace has three columns. <b>Stack</b> has its top on the left and $ at the bottom.
					<b>Input</b> is the rest of the input, ending with $. <b>Action</b> is what is done to the
					row’s stack and input: the right-hand side pushed (<span class="f">T X</span>),
					<span class="f">terminal</span> when the top matches the next token,
					<span class="f">ε</span> when an ε-production pops the top, and
					<span class="f">ACCEPT</span> when both are down to $.
				</p>
				<figure>
					<div class="table-wrap">
						<table class="ref trace" aria-label="LL(1) trace of int * int $">
							<thead>
								<tr>
									<th scope="col">Stack</th>
									<th scope="col">Input</th>
									<th scope="col">Action</th>
								</tr>
							</thead>
							<tbody>
								{#each ll1Trace as row, i (i)}
									<tr>
										<td class="f">{row.stack.join(' ')}</td>
										<td class="f">{row.input.join(' ')}</td>
										<td class="f">{row.action}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<figcaption>
						<span><span class="f">int * int $</span> with the table above</span>
						<CitationTag cite={{ deck: '12', slide: 12 }} />
					</figcaption>
				</figure>
			</section>

			<!-- Handles -->
			<section aria-labelledby="handles">
				{@render sectionHead('handles', 'Handles')}
				<p>
					A bottom-up parser builds the parse tree from the leaves up. Its most common form is
					<dfn>LR</dfn> parsing: the tokens are read from <b>L</b>eft to right, and the parser
					builds a <b>R</b>ightmost derivation, in reverse.
				</p>
				<p>
					It reduces the input to the start symbol by inverting productions. Each step takes the
					current sentential form <span class="f">sent</span> and the first β in it such that
				</p>
				<p class="display f">A → β and S →<sup>*</sup> α A γ → α β γ = sent</p>
				<p>
					and replaces β by A, so that α A γ is the next form. Such a β is a <dfn>handle</dfn>.
					Right of a handle there are only terminals (γ), because α A γ → α β γ is a step of a
					rightmost derivation.
				</p>
				<div class="bottom-up">
					<figure>
						<div class="example reverse">
							<span class="up" aria-hidden="true"></span>
							<ol class="forms" aria-label="Reductions of int + (int), each form with its handle">
								{#each handleRows as row, i (i)}
									<li class="f">
										{@render pieces(
											formPieces(row.form, row.handle?.[0] ?? 0, row.handle?.[1] ?? 0),
											'handle'
										)}
									</li>
								{/each}
							</ol>
						</div>
						<figcaption>
							<span>The handles in red. Read upward, the list is a rightmost derivation.</span>
							<CitationTag cite={{ deck: '13', slide: 10 }} />
						</figcaption>
					</figure>
					<figure>
						<div class="example trees">
							<ParseTreeView
								tree={bottomUpTree}
								layout="baseline"
								ariaLabel="Bottom-up parse tree of int + ( int )"
							/>
						</div>
						<figcaption>
							<span
								><span class="f">int + (int)</span> under
								<span class="f">{bottomUpGrammar}</span></span
							>
							<CitationTag cite={{ deck: '13', slide: [5, 10] }} />
						</figcaption>
					</figure>
				</div>
				<p>Bottom-up trees are drawn differently from top-down ones:</p>
				<ul class="tree-rules">
					{#each bottomUpTreeRules as rule (rule)}<li>{rule}</li>{/each}
				</ul>
				<p>
					The bottom-up decks write sentential forms with each parenthesis next to what it encloses:
					<span class="f">{formText(['E', '+', '(', 'int', ')'])}</span>.
				</p>
			</section>

			<!-- Shift-reduce parsing -->
			<section aria-labelledby="shift-reduce">
				{@render sectionHead('shift-reduce', 'Shift-reduce parsing')}
				<p>
					A shift-reduce parser splits the string in two at a divider, drawn as a red
					{@render divider()}. Left of it are terminals and non-terminals; right of it are the
					tokens not examined yet. The divider marks the end of the next potential handle. At the
					start the whole input is right of it:
					<span class="f">{@render divider()} x<sub>1</sub> x<sub>2</sub> … x<sub>n</sub></span>.
				</p>
				<dl class="rules">
					<dt>Shift</dt>
					<dd>
						Move {@render divider()} one place to the right:
						<span class="f"
							>E + ( {@render divider()} int ) {@render becomes()} E + ( int {@render divider()} )</span
						>
					</dd>
					<dt>Reduce</dt>
					<dd>
						Apply an inverse production at the handle, just left of the divider:
						<span class="f"
							>E + ( <span class="underline">E + ( E )</span>
							{@render divider()} ) {@render becomes()} E + ( <span class="underline">E</span>
							{@render divider()} )</span
						>
					</dd>
				</dl>
				<p>
					Here {@render becomes()} is one move of the parser, not a derivation step. The left part is
					a stack: a shift pushes a terminal, and a reduce by A → α pops the symbols of α (zero or more)
					and pushes A.
				</p>
				<h3>Traces</h3>
				<p>
					One configuration per row, with its action on the right: <span class="f">shift</span>,
					<span class="f">shift 3 times</span> (shifts in a row on one line),
					<span class="f">red. E → int</span> (reduce by E → int), and
					<span class="f">accept</span>. The symbols an action works on are colored: the handle left
					of the divider before a reduce, the tokens right of it before a shift. The input ends with
					$.
				</p>
				<figure>
					<div class="table-wrap">
						<table class="ref sr-trace" aria-label="Shift-reduce trace of int + (int) + (int)$">
							<thead>
								<tr><th scope="col">Configuration</th><th scope="col">Action</th></tr>
							</thead>
							<tbody>
								{#each shiftReduceTrace as row, i (i)}
									{@const parts = configurationPieces(row)}
									<tr>
										<td class="f config"
											>{@render pieces(parts.left, 'next')}{parts.left.length
												? ' '
												: ''}{@render divider()}
											{@render pieces(parts.right, 'next')}</td
										>
										<td class="f">{row.action}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<figcaption>
						<span>Under <span class="f">{bottomUpGrammar}</span></span>
						<CitationTag cite={{ deck: '14', slide: 14 }} />
					</figcaption>
				</figure>
				<p>
					Beside a trace, the tree grows over the tokens: a subtree for each symbol on the stack,
					the tokens still to come as bare leaves, and ↑ under the divider.
				</p>
				<figure>
					<div class="example trees">
						<ParseTreeView
							forest={shiftReduceForest.roots}
							marker={shiftReduceForest.marker}
							ariaLabel="Partial parse tree of int + (int) at E + (int I )$"
						/>
					</div>
					<figcaption>
						<span
							><span class="f">int + (int)</span> at
							<span class="f"
								>{@render pieces(srPieces.left, 'next')}
								{@render divider()}
								{@render pieces(srPieces.right, 'next')}</span
							></span
						>
						<CitationTag cite={{ deck: '14', slide: [4, 14] }} />
					</figcaption>
				</figure>
			</section>

			<!-- LR(1) items -->
			<section aria-labelledby="lr-items">
				{@render sectionHead('lr-items', 'LR(1) items')}
				<p>
					An <dfn>LR(1) item</dfn> is a production with a dot in its right-hand side and one lookahead
					terminal:
				</p>
				<p class="display f">[X → α<span class="item-dot">•</span>β, a]</p>
				<p>
					X → αβ is a production and a is a terminal. The item says that the parser is trying to
					find an X followed by an a, has α on top of the stack, and next needs to see a prefix of
					something derived from βa. The dot, in red, does the job of the divider
					{@render divider()}: in both, the stack is on the left.
				</p>
				<div class="table-wrap">
					<table class="ref">
						<thead>
							<tr>
								<th scope="col">Form</th>
								<th scope="col">Used</th>
								<th scope="col">Example</th>
							</tr>
						</thead>
						<tbody>
							{#each itemForms as form (form.name)}
								<tr>
									<td>{form.name}</td>
									<td>{form.used}</td>
									<td><LrItem item={form.item} style={form.style} /></td>
								</tr>
							{/each}
							<tr>
								<td>Merged lookaheads</td>
								<td>items that differ only in their lookahead, on one line</td>
								<td>
									<LrItem item={mergedItem} style="compact" /> stands for
									<LrItem item={{ ...mergedItem, lookaheads: ['$'] }} style="compact" /> and
									<LrItem item={{ ...mergedItem, lookaheads: ['+'] }} style="compact" />
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h3>The parsing DFA</h3>
				<p>
					The grammar gets a new start symbol S and the production
					<span class="f">S → E</span> (not needed when E has only one production); when the
					grammar’s own start symbol is S, the new one is S’. The start state is
					<span class="f">Closure(&#123; S → •E, $ &#125;)</span>. A state is a closed set of items,
					and <span class="f">Transition(state, y)</span> is the state after the symbol y, a terminal
					or a non-terminal.
				</p>
				<div class="code-pair even">
					<figure>
						<pre class="code">{closureCode}</pre>
						<figcaption><CitationTag cite={{ deck: '15', slide: 10 }} /></figcaption>
					</figure>
					<figure>
						<pre class="code">{transitionCode}</pre>
						<figcaption><CitationTag cite={{ deck: '15', slide: 13 }} /></figcaption>
					</figure>
				</div>
				<p>
					A state with an item <span class="f">[X → α<span class="item-dot">•</span>, b]</span> is
					labeled “reduce with X → α on b”, written beside the state as
					<span class="f">E → int on $, +</span>. The state with
					<span class="f">[S → E<span class="item-dot">•</span>, $]</span> is labeled
					<span class="f">accept on $</span>. The start state is state 0.
				</p>
				<figure>
					<div class="example states">
						{#each lrStates as state (state.number)}
							<LrState number={state.number} items={state.items} start="S" />
						{/each}
					</div>
					<figcaption>
						<span
							>States 0–6 for <span class="f">{lrGrammar.replace('\n', ', ')}</span>, with the edges {#each lrEdges as [from, symbol, to], i (i)}{i
									? ', '
									: ''}<span class="f">{from} →<sup>{symbol}</sup> {to}</span>{/each}</span
						>
						<CitationTag cite={{ deck: '15', slide: 14 }} />
					</figcaption>
				</figure>
			</section>

			<!-- LR parsing tables -->
			<section aria-labelledby="lr-tables">
				{@render sectionHead('lr-tables', 'LR parsing tables')}
				<p>
					The parser chooses between shift and reduce with the DFA. It runs the DFA on the stack and
					looks at the state X it ends in and the token tok after the divider: if X has a transition
					on tok, it shifts; if X is labeled <span class="f">A → β on tok</span>, it reduces by A →
					β; in a state labeled <span class="f">accept on $</span> with $ next, it accepts.
				</p>
				<p>
					The DFA is stored as a table. Rows are states and columns are grammar symbols: the
					terminals and $ make up the <dfn>action</dfn> table, and the non-terminals, after a
					vertical rule, the <dfn>goto</dfn> table.
				</p>
				<div class="table-wrap">
					<table class="ref compact">
						<thead><tr><th scope="col">Entry</th><th scope="col">Meaning</th></tr></thead>
						<tbody>
							<tr><td class="f">s4</td><td>shift, and go to state 4</td></tr>
							<tr><td class="f">g6</td><td>in a non-terminal column: go to state 6</td></tr>
							<tr
								><td class="f">r<sub>E→int</sub></td><td
									>reduce by the production written under the r</td
								></tr
							>
							<tr><td class="f">accept</td><td>accept</td></tr>
							<tr><td>blank</td><td>error</td></tr>
						</tbody>
					</table>
				</div>
				<figure>
					<div class="scroll">
						<table class="tt lr" aria-label="Rows 3 to 7 of the LR parsing table">
							<thead>
								<tr>
									<th scope="col"><span class="visually-hidden">State</span></th>
									{#each lrColumns as column, k (column)}
										<th scope="col" class:rule={k === lrTerminals.length}>{column}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each [null, ...lrTableRows, null] as row, i (i)}
									<tr class:more={!row}>
										<th scope="row">{row ? row.state : '…'}</th>
										{#each lrColumns as column, k (column)}
											{@const cell = row?.cells[column]}
											{@const code = cell ? cellCode(cell) : null}
											<td class:rule={k === lrTerminals.length}
												>{#if code}{code.code}{#if code.production}<sub>{code.production}</sub
														>{/if}{/if}</td
											>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<figcaption>
						<span
							>Rows 3–7 for <span class="f">{bottomUpGrammar}</span>. The slide prints the two
							entries of row 6 one column to the left; by the DFA they are under + and ).</span
						>
						<CitationTag cite={{ deck: '14', slide: 19 }} />
					</figcaption>
				</figure>

				<h3>The LR stack</h3>
				<p>
					Running the DFA over the whole stack after every move repeats work. Instead each stack
					element remembers the state it brings the DFA to: the stack holds pairs
					<span class="f long"
						>&lt; sym<sub>1</sub>, state<sub>1</sub> &gt; … &lt; sym<sub>n</sub>, state<sub>n</sub> &gt;</span
					>, where state<sub>k</sub> is the state of the DFA after sym<sub>1</sub> … sym<sub>k</sub
					>. It starts as <span class="f">&lt; dummy, 0 &gt;</span>, state 0 being the start state.
				</p>
				<figure>
					<pre class="code">{lrAlgorithm}</pre>
					<figcaption><CitationTag cite={{ deck: '14', slide: 21 }} /></figcaption>
				</figure>
			</section>

			<!-- Conflicts -->
			<section aria-labelledby="conflicts">
				{@render sectionHead('conflicts', 'Conflicts')}
				<p>
					A parser generator reports a grammar it cannot build a table for in terms of the items of
					a state. Two kinds of conflict:
				</p>
				<dl class="rules">
					<dt>Shift/reduce</dt>
					<dd>
						The state contains
						<span class="f">[X → α<span class="item-dot">•</span>aβ, b]</span> and
						<span class="f">[Y → γ<span class="item-dot">•</span>, a]</span>. On a, the parser could
						shift into <span class="f">[X → αa<span class="item-dot">•</span>β, b]</span> or reduce with
						Y → γ.
					</dd>
					<dt>Reduce/reduce</dt>
					<dd>
						The state contains
						<span class="f">[X → α<span class="item-dot">•</span>, a]</span> and
						<span class="f">[Y → β<span class="item-dot">•</span>, a]</span>.
					</dd>
				</dl>
				<p>
					Shift/reduce conflicts usually come from an ambiguous grammar, such as the dangling else,
					where a state contains
					<LrItem item={lrItem('S', 'if E then S •', 'else')} /> and
					<LrItem item={lrItem('S', 'if E then S • else S', 'x')} />. Reduce/reduce conflicts come
					from gross ambiguity. The slides show part of a state and part of the state its transition
					on a symbol leads to, joined by {@render becomes()} with the symbol on top; … stands for items
					left out.
				</p>
				<div class="conflicts">
					{#each conflictExamples as ex (ex.slide)}
						<figure>
							<div class="example transition">
								{@render itemList(ex.from, ex.partial)}
								<span class="f arrow">{@render becomes()}<sup>{ex.symbol}</sup></span>
								{@render itemList(ex.to, ex.partial)}
							</div>
							<figcaption>
								<span><span class="f">{ex.grammar}</span>: {ex.conflict}</span>
								<CitationTag cite={{ deck: '15', slide: ex.slide }} />
							</figcaption>
						</figure>
					{/each}
				</div>
				<p>
					<span class="f">S → ε | id | id S</span> has two parse trees for
					<span class="f">id</span>. Rewritten as <span class="f">S → ε | id S</span>, it has none
					of these conflicts.
				</p>
			</section>

			<!-- Precedence in bison -->
			<section aria-labelledby="bison">
				{@render sectionHead('bison', 'Precedence in bison')}
				<p>
					Bison settles shift/reduce conflicts with declarations of precedence and associativity:
				</p>
				<figure>
					{@render grammar(bisonDeclarations)}
					<figcaption><CitationTag cite={{ deck: '15', slide: 19 }} /></figcaption>
				</figure>
				<dl class="rules">
					<dt>Order of the lines</dt>
					<dd>
						A later line binds tighter: here <span class="f">*</span> over <span class="f">+</span>.
						Bison quotes a character terminal, so <span class="f">%left '+'</span> is the
						declaration
						<span class="f">%left +</span> of
						<a href="#declarations">Disambiguating declarations</a>.
					</dd>
					<dt>Precedence of a rule</dt>
					<dd>
						That of its last terminal: <span class="f">E → E * E</span> has the precedence of
						<span class="f">*</span>.
					</dd>
					<dt>Shift if</dt>
					<dd>
						<ul class="plain">
							{#each shiftRules as rule (rule)}<li>{rule}</li>{/each}
						</ul>
					</dd>
				</dl>
				<p>
					In the state with <LrItem item={conflictExamples[0].to[0]} /> and
					<LrItem item={conflictExamples[0].to[1]} />, the rule E → E * E has a higher precedence
					than the terminal +, so the parser reduces. The dangling-else conflict goes away when else
					is declared with a higher precedence than then, or by the default shift.
				</p>
			</section>

			<!-- Grammar classes -->
			<section aria-labelledby="grammar-classes">
				{@render sectionHead('grammar-classes', 'Grammar classes')}
				<p>
					Every LL(k) grammar is LR(k), every LL(1) grammar LR(1), and every LL(0) grammar LR(0). No
					ambiguous grammar is in any of these classes.
				</p>
				<figure>
					<div class="example">
						<GrammarClasses />
					</div>
					<figcaption>
						<span>Simple LR (SLR); Look-ahead LR (LALR)</span>
						<CitationTag cite={{ deck: '15', slide: 26 }} />
					</figcaption>
				</figure>
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
	/* One numbering across the groups. */
	.toc {
		counter-reset: toc;
	}
	.toc-group {
		margin: var(--space-3) 0 var(--space-1);
		padding-left: 10px;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.toc-group:first-child {
		margin-top: 0;
	}
	.toc-list {
		margin: 0;
		padding: 0;
		list-style: none;
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
	/* A group title sits close to its first section. */
	.group-label {
		margin: 0 0 calc(var(--space-5) - var(--space-8));
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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

	.display b {
		color: var(--accent);
		font-weight: 600;
	}
	.chomsky td:nth-child(3) {
		min-width: 11rem;
		line-height: 1.7;
	}
	.rewrites {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rewrites li {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
	}
	.becomes {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	@media (min-width: 720px) {
		.rewrites li {
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
			gap: var(--space-2) var(--space-3);
		}
		.rewrites .from {
			grid-column: 1 / -1;
		}
	}

	.tree-rules {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding-left: 1.3em;
		color: var(--text-2);
	}
	.tree-figs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 640px) {
		.tree-figs {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.tree-figs .wide {
			grid-column: 1 / -1;
		}
	}
	.trees {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-evenly;
		gap: var(--space-5) var(--space-7);
	}
	.streams {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-4) var(--space-8);
	}
	.messages dt {
		font-style: italic;
	}

	/* LL(1) and bottom-up parsing */
	.rule-pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
	}
	@media (min-width: 720px) {
		.rule-pair {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.rule-pair h3 {
		margin: 0;
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: var(--space-2) 0 0;
		padding-left: 1.4em;
		color: var(--text-2);
	}
	.grammar-sets {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4);
	}
	@media (min-width: 640px) {
		.grammar-sets {
			grid-template-columns: max-content minmax(0, 1fr);
		}
	}
	.grammar-sets .code {
		margin: 0;
	}
	.scroll {
		max-width: 100%;
		overflow-x: auto;
	}
	.scroll .tt {
		margin: 1px;
	}
	.tt .rule {
		border-left: 2px solid var(--border-strong);
	}
	.tt sub {
		font-size: 0.72em;
	}
	.tt tr.more th {
		background: none;
		color: var(--text-3);
		text-align: center;
	}
	.tt tr.more th,
	.tt tr.more td {
		padding-top: 2px;
		padding-bottom: 2px;
	}
	.bottom-up {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	@media (min-width: 720px) {
		.bottom-up {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.ref thead th.notation-head {
		font-family: var(--font-mono);
		letter-spacing: 0;
		text-transform: none;
	}
	.becomes {
		font-family: var(--font-sans);
		font-size: 1.1em;
	}
	.reverse {
		display: flex;
		align-items: stretch;
		gap: var(--space-4);
	}
	.up {
		position: relative;
		flex: none;
		width: 2px;
		margin: 9px 7px 4px;
		background: var(--text);
	}
	.up::before {
		position: absolute;
		top: -9px;
		left: -5px;
		border: 6px solid transparent;
		border-top: 0;
		border-bottom: 10px solid var(--text);
		content: '';
	}
	.forms {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		font-size: 1.05rem;
		list-style: none;
	}
	.handle {
		color: var(--reject);
		font-weight: 600;
	}
	.divider {
		color: var(--reject);
		font-family: var(--font-sans);
		font-weight: 600;
	}
	.underline {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.next {
		color: var(--tok-3);
		font-weight: 600;
	}
	td.f.config {
		white-space: nowrap;
	}
	.item-dot {
		display: inline-block;
		color: var(--reject);
		font-weight: 700;
		transform: scale(1.5);
	}
	.states {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-4) var(--space-5);
	}
	.code-pair.even {
		align-items: start;
	}
	@media (min-width: 900px) {
		.code-pair.even {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.conflicts {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
	.transition {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		overflow-x: auto;
	}
	.item-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		font-size: var(--text-sm);
		list-style: none;
	}
	.item-list .omitted {
		padding-left: 2.5em;
		color: var(--text-3);
	}
	.arrow {
		font-size: 1.15rem;
	}
	.arrow sup {
		font-size: 0.65em;
	}
	.plain {
		margin: 0;
		padding-left: 1.2em;
	}
	@media (min-width: 720px) {
		.messages {
			grid-template-columns: max-content minmax(0, 1fr);
		}
	}
</style>
