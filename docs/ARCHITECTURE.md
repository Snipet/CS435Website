# Architecture and conventions

This document is the contract every part of the site is built against. Read it
before adding a tool or touching the engine.

## 1. Principles

1. **Everything runs in the browser.** The site is prerendered static HTML plus
   client-side Svelte 5. No backend, no network calls, no analytics.
2. **Engine and UI are separate.** Algorithms live in `src/lib/theory/` as pure,
   framework-free TypeScript with unit tests. Svelte components only render
   and orchestrate.
3. **Lecture fidelity.** Notation, naming and constructions follow the CS435
   lecture decks exactly (see §3). Where the decks are silent we pick one
   documented default (§3.9) and apply it everywhere.
4. **Algorithms expose their steps.** Every construction returns the final
   result _and_ a step trace, so any tool can play it forward and backward.
5. **Plain copy.** Pages say what a tool does and what the controls do. Copy
   never describes the site's teaching purpose or how it "helps" anyone. Avoid
   phrases like "helps you understand", "build intuition", "learn by
   exploring", "self-exploration", and labels like "common mistake" or
   "misconception". Questions from the slides may be posed as-is.
6. **Accessible and responsive.** Keyboard reachable controls, visible focus,
   labels on inputs, `aria-live` for step announcements, no horizontal page
   scroll at 360 px, light and dark themes via tokens in `src/app.css`.

## 2. Layout of the code

```
src/
  app.css                     design tokens (light/dark), base element styles
  lib/
    site.ts                   site name, nav links
    lectures.ts               deck catalog + formatCitation()
    theory/                   pure TS engine (no Svelte, no DOM)
      charset.ts              CharSet (sets of code points) + partitionCharSets
      chars.ts                showChar, formatString, formatStringSet, formatLabel, formatClass
      regex/                  AST, lecture + flex parsers, printer, analysis
      automata/               automaton model and algorithms
      grammar/                CFG model, parser, derivations, Earley parser, analysis
    components/
      layout/                 header, footer, theme toggle
      ui/                     generic UI kit (buttons, panels, tabs, inputs, stepper…)
      graph/                  AutomatonView, TransitionTable, layout
    tools/
      types.ts                ToolMeta
      registry.ts             glob-imports catalog/*.ts
      catalog/<slug>.ts       one file per tool: `export const tool: ToolMeta`
    url-state.ts              share-link state in the URL hash (re-exports url-state.svelte.ts,
                              which holds the code because syncToHash uses runes)
  routes/
    +page.svelte              home: tools grouped by compiler stage
    notation/+page.svelte     notation reference
    midterm/+page.svelte      midterm review list; topics.ts holds the list and its links
    <slug>/+page.svelte       one route per tool
docs/ARCHITECTURE.md          this file
```

A tool owns `src/routes/<slug>/`, `src/lib/tools/catalog/<slug>.ts`, and (if
needed) `src/lib/tools/<slug>/` for tool-specific components, presets and
logic. Tools never edit each other's folders. Anything two tools need goes into
`theory/` or `components/`.

`notation/` and `midterm/` are reference pages, not tools: no catalog entry, no
`ToolPage`, no `syncToHash` state (their URL hash is an in-page anchor). The
midterm page links each topic of the review list to the tools and notation
sections that cover it. To open a tool on one of that tool's own presets or
views, `src/routes/midterm/topics.ts` imports from tool folders, read-only, and
only data: a tool's `presets.ts`, the phase table's `groupings.ts`, and the
types of a tool's `state.ts`. It imports no tool's components or engine code,
and a tool never imports from the page. Its spec checks every linked state
against the tool's own hash validator and loader, every tool slug against the
registry and `LinkStates`, and every notation anchor against the notation page.

## 3. Notation canon

### 3.1 Sets, strings, languages

| Concept           | Render                                                                                                   | Source                          |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Alphabet          | `Σ = { 0, 1 }` (spaces inside braces)                                                                    | Lexical Analysis, slide 19      |
| Empty string      | `ε` in REs and on edges; `""` inside sets                                                                | Lexical Analysis, slides 23, 26 |
| Empty language    | `ɸ` (U+0278), `L(ɸ) = { }`                                                                               | Lexical Analysis, slide 23      |
| Language of R / M | `L(R)`, `L(M)`                                                                                           |                                 |
| Strings           | double quotes: `"if"`, `"1110"`                                                                          |                                 |
| RE literals       | single quotes: `'if'`, `'\t'`, `' '`                                                                     |                                 |
| Token pairs       | `(Identifier, "f")` (Lexical Analysis II) or `<ID,'A'>` (Intro, compiler architecture); tools offer both |                                 |

Use `formatString`, `formatStringSet`, `showChar` from `theory/chars.ts`. Never
hand-roll quoting.

### 3.2 Lecture RE notation (default dialect)

- Literals: `'c'`, multi-character `'if'` (= `'i' 'f'`, treated as one unit, so
  `'ab'*` = `('a' 'b')*`). Escapes inside quotes: `\t \n \r \\ \' \"`. Curly
  quotes `‘ ’` are accepted as `'`. Double-quoted `"if"` is accepted as a
  literal with an info diagnostic.
- Bare single symbols: any character that is not an operator, quote, or
  whitespace, e.g. `(0 | 1)*00`. Digits and punctuation are symbols.
- Names: a run of letters/digits/underscores starting with a letter is a
  reference when it names a regular definition; otherwise it is read as a
  sequence of one-character symbols and an info diagnostic says so (e.g.
  `abb` → `a b b`).
- `ε` / `ϵ` / `\e` = epsilon; `ɸ` / `φ` / `ϕ` / `∅` / `\p` = empty language;
  `Σ` / `\S` = any single symbol of the alphabet.
- Operators, tightest first: postfix `*`, `+` (also `⁺`), `?`, `^n` (also
  superscript digits such as `³`); then concatenation (juxtaposition; spaces are
  cosmetic); then `|`. Parentheses group.
- Ranges: `'A' | … | 'Z'` (with `…` or `...`) between single-character literals
  is a range. `[a-z]`-style classes are also accepted.
- Regular definitions: one per line, `name = RE`. Lines starting with `//` are
  comments. Definitions may appear in any order; cycles are errors.
- Extensions so every AST prints and reads back: `A^{n,m}` / `A^{n,}` (bounded
  repetition), `\u{H…}` escapes, `A^*` / `A^+` as spellings of `A*` / `A+`.

### 3.3 Flex dialect (Scanning with Flex)

Full flex pattern syntax: `x`, `\.`, `"string"`, `.` (any char but `\n`), `^`,
`$`, `[xyz]`, `[^xyz]`, `[a-z]`, `r*`, `r+`, `r?`, `r{n}`, `r{n,}`, `r{n,m}`,
`r1r2`, `r1|r2`, `(r)`, `r1/r2` (trailing context), `{NAME}`. Definitions are
`NAME pattern` lines in the definitions section. The slide prints trailing
context as `r1 \ r2`; the site uses real flex syntax `r1/r2` and the notation
page notes the difference. As in flex, `^` / `$` anywhere but the very start /
end are ordinary characters, `""` is ε, only ASCII whitespace ends a pattern,
and classes accept `[:alpha:]`-style names (lowercase) and their complements
`[:^alpha:]`. `\u{H…}` is accepted as an escape (flex itself has none) so every
code point can be printed; a pattern that uses it gets an info note, and
`flexCaveats` lists what a flex printout writes that flex would read
differently.

### 3.4 Automata formalism

- DFA `M = (Σ, S, s0, F, T)`, `T: S × Σ → S` (total). NFA uses `Q` and
  `Δ : Q × (Σ ∪ { ε }) → P(Q)`.
- A transition is written `s1 →a s2` (symbol as superscript).
- "Accepting" and "final" are synonyms; outcomes are "accept" / "reject".
- A missing transition in a drawn DFA means the machine moves to a _trap_
  state or _crashes_ (Lexical Analysis III, slide 6).

### 3.5 Diagram conventions

- State = circle (ellipse for long names); accepting = double outline; start =
  arrow in from nowhere; trap = dashed outline.
- Edges curve; parallel symbols merge into one label joined by commas (`0,1`).
- Self-loops above the state. ε-edges use the `--epsilon` color and label `ε`.
- Machines read left to right.
- Active states (simulation) are filled with `--active-soft` and stroked
  `--active`; the transition just taken is drawn in `--active`.

### 3.6 State naming

| Context       | Names                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thompson NFA  | Letters `A, B, C, …` by final layout column, then top to bottom (reproduces the `(1 \| 0)*1` NFA A–J). After `Z`: `AA, AB, …`.                                                                               |
| Subset DFA    | Concatenated NFA names in discovery order (`ABCDHI`, `FGABCDHI`, `EJGABCDHI`). Falls back to `{AA, B}` set notation when any NFA name has more than one character. Alternatives: sorted set, or `D0, D1, …`. |
| Empty subset  | `∅`; omitted by default (trap convention) with an option to show it.                                                                                                                                         |
| Minimized DFA | The first member's name; `State.merged` lists all members (ids in the DFA that was minimized).                                                                                                               |
| Hand-built    | Whatever the user types; new states default to the next free letter.                                                                                                                                         |
| Relop         | `0`–`8` as on Lexical Analysis IV, slide 16.                                                                                                                                                                 |

### 3.7 Tables

Rows = states, columns = input symbols (symbol classes in ascending order),
cells = next state. Start row is marked `→`; accepting rows are marked with a
double-circle glyph `◎` (never `*`, which means _retract_ on the relop slide).
NFA tables have set-valued cells and an `ε` column.

### 3.8 Citations

Presets cite the deck and slide with `formatCitation({ deck: '06', slide: 8 })`
→ "Lexical Analysis III · slide 8". Never name the instructor or university.

### 3.9 Defaults where the decks are silent

- Precedence: postfix > concatenation > `|`.
- Thompson (lecture variant only): `A*` = new s, f; `s →ε A.start`,
  `A.final →ε s`, `s →ε f` (no `A.final →ε f`). Concatenation adds
  `A.final →ε B.start` (no merging). n-ary nodes fold left-associatively.
  `A+` = `A A*` (fresh copy), `A^n` = n fresh copies, `A{n,m}` = n copies then
  (m − n) copies of `A?`, `A{n,}` = n copies then `A*`, `A?` = `A | ε`,
  `ɸ` = s, f with no edge, a class = one edge labeled with the set, `Σ` = one
  edge labeled with the alphabet, definition references expand fresh per use.
- ε-closure order: seeds first (in given order), then additions in DFS preorder
  following ε-edges in creation order.
- Subset construction: FIFO worklist; symbols in ascending order; `move` scans
  the source subset's states in name order and follows edges in creation
  order; a DFA state accepts iff it contains an accepting NFA state; for
  scanner automata the reported token is the lowest rule index among them.
- Minimization: Moore-style partition refinement on the total DFA (explicit
  trap if needed). The initial partition separates non-accepting states from
  accepting states, and accepting states by token. Each split records a
  distinguishing string.
- Scanning: maximal munch (longest prefix, length ≥ 1), ties to the earliest
  rule. The optional Error rule matches exactly one character and is listed
  last. Skipped rules (e.g. Whitespace) are matched and then dropped.
  Lexical Analysis II, slide 7 scans `"f+3  +g"` (two spaces) but lists
  `(Whitespace, " ")`; presets and examples use the slide's input and the
  maximal-munch lexeme `"  "`.
- flex: longest match, ties to the earliest rule, unmatched characters are
  ECHOed.

### 3.10 Grammars and parsing

- Productions use `→` (input also accepts `->`): `E → T | T + E`. Alternatives
  are separated by `|`, on one line or on continuation lines that start with
  `|`. `ε` (also `epsilon`) is the empty right-hand side.
- **Derivation steps use the same arrow `→`** (Introduction to Parsing, slides
  12, 19–20), with `→*` for zero or more steps and `→+` for one or more. The
  decks never use `⇒` or lm/rm subscripts; say "leftmost derivation" in words.
- A symbol is a non-terminal exactly when it appears on a left-hand side.
  By convention non-terminals are capitalized (`E`, `EXPR`, `NounPhrase`) and
  terminals are lower-case names or punctuation (`int`, `id`, `+`, `(`), but
  `OTHER` in the dangling-else grammar is a terminal. The start symbol is the
  left-hand side of the first production.
- Symbols are separated by spaces; each punctuation character is its own
  symbol (`E+E` reads as `E + E`). The hyphen is the one exception: between
  two name characters it belongs to the name (`if-stmt`, `var-declaration`),
  so a subtraction is written with spaces (`E - T`), and the parsers warn
  about an `E-T` whose parts are symbols of the grammar. Multi-character or
  multi-word terminals are quoted, in grammars and in token strings:
  `"the cat"`, `'=='`, `a "==" b`. New non-terminals made by a rewrite are
  primed: `S’` (input accepts `S'`).
- CFG four-tuple `(N, T, S, P)`; `L(G) = { a1a2 … an | S →* a1a2 … an and ai ∈ T }`;
  the successive strings of a derivation are _sentential forms_. Sets of
  symbols are written like every set (§3.1): `N = { E }`,
  `T = { int, +, *, (, ) }`; print them, and FIRST and FOLLOW sets
  (`{ +, ε }`, `{ ), $ }`), with `printSet`.
- `$` and `ε` are reserved for the end of the input and the empty string. A
  grammar that uses one of them as a symbol (`S’ → S $`, a quoted `"ε"`)
  still parses, with a warning: in FIRST and FOLLOW sets the symbol and the
  marker are the same string (`reservedSymbols` lists such symbols).
- EBNF (Top-Down Parsing, slides 24, 36–39): `{ α }` is zero or more α and
  `[ α ]` is optional α, with spaces inside the brackets: `E → T { + T }`,
  `E → T [ + E ]`.
- Token strings are space-separated: `int * int`. Predictive parsers end the
  input with `$`.
- Parse trees: root at the top, children left to right joined by plain
  straight lines, no boxes around labels, operator terminals drawn as children,
  leaves one level below their own parent (not on a common baseline). When two
  trees for one string are shown side by side they get two different colors;
  a rejected tree is crossed out with a large X in `--reject`.
- Recursive descent (Top-Down Parsing): instances of non-terminals in a tree
  may be numbered from 0 at the root (`E0 → T1 + E2`); functions for the i-th
  production are numbered from 1 (`E1`, `E2`, `T1` …). Status messages are
  exactly "Mismatch: int is not (", "Backtrack …", "Match! Advance input." and
  "End of input, accept". Code is C with a space before call parentheses
  (`match (PLUS)`), as on the slides.
- Disambiguating declarations use bison syntax, one per line, lowest
  precedence first: `%left +` then `%left *`.
- Chomsky hierarchy (Introduction to Parsing, slide 23): type 0 unrestricted /
  Turing machine; type 1 context sensitive / linear bounded automaton (ND);
  type 2 context free `V → α` / push-down automaton (ND); type 3 regular
  `V → w | wU` / NFA or DFA.

## 4. Engine API (src/lib/theory)

All functions are pure; inputs are never mutated. Errors in user input are
reported as `Diagnostic`s, never thrown. Programming errors may throw.

### 4.1 Shared

```ts
// charset.ts
class CharSet { EMPTY; ANY; of(...); single(c); range(lo, hi); fromRanges(); fromCodePoints();
  isEmpty; size; isSingleton; first(); firstChar(); has(c); union; intersect; subtract;
  complement; overlaps; isSubsetOf; equals; key(); codePoints(limit); chars(limit) }
function partitionCharSets(sets): CharSet[]
// chars.ts
showChar(c, ctx), formatString(s), formatStringSet(strings, { more }),
formatLabel(set, { names, separator }), formatClass(set)
```

### 4.2 Regex (`theory/regex/`)

```ts
// ast.ts — see file. Node kinds: empty epsilon chars any concat alt star plus optional repeat ref.
// Builders: empty() eps() any() sym(text) chars(set) cat(...) alt(...) star() plus() opt() pow(n) repeat(min,max) ref(name, body)
// clauseName(node), children(node)

// ../diagnostics.ts (theory/diagnostics.ts, shared with automata)
interface Diagnostic {
	severity: 'error' | 'warning' | 'info';
	message: string;
	span?: Span;
}

// lecture.ts
type ParseResult =
	{ ok: true; regex: Regex; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] };
function parseRegex(
	text: string,
	// invalid: names of definitions that failed; a use is an error, not symbols
	opts?: {
		defs?: ReadonlyMap<string, Regex>;
		source?: string | null;
		invalid?: ReadonlySet<string>;
	}
): ParseResult;
interface DefinitionEntry {
	name: string;
	line: number;
	text: string;
	nameSpan: Span;
	exprSpan: Span;
	regex: Regex | null;
}
interface DefinitionsResult {
	defs: Map<string, Regex>;
	invalid: Set<string>; // written but not built; pass { defs, invalid } to the parsers
	entries: DefinitionEntry[];
	diagnostics: Diagnostic[];
}
function parseDefinitions(text: string): DefinitionsResult; // lines "name = RE"
// Both parsers report trees deeper than 500 levels (parentheses, chained postfix
// operators, and definition bodies all count) as an error, so recursion over any
// parsed AST is safe.

// flex.ts
interface FlexPattern {
	regex: Regex;
	bol: boolean;
	eol: boolean;
	trailing: Regex | null;
}
type FlexParseResult =
	| { ok: true; pattern: FlexPattern; diagnostics: Diagnostic[] }
	| { ok: false; diagnostics: Diagnostic[] };
function parseFlexPattern(
	text: string,
	opts?: { defs?: ReadonlyMap<string, Regex>; invalid?: ReadonlySet<string> }
): FlexParseResult;
// Spans are relative to each `text`, or absolute when textStart/nameStart are given.
function parseFlexDefinitions(
	lines: { name: string; text: string; line: number; textStart?: number; nameStart?: number }[]
): DefinitionsResult;
const FLEX_DOT: CharSet; // `.` = every character except \n

// print.ts
function printRegex(
	r: Regex,
	opts?: {
		dialect?: 'lecture' | 'flex';
		expandRefs?: boolean;
		parens?: 'minimal' | 'full';
		symbols?: 'quoted' | 'bare'; // lecture: 0 instead of '0'
		names?: Iterable<string>; // bare: definition names in scope; such letters stay quoted
	}
): string;
function printFlexPattern(p: FlexPattern, opts?): string; // ^, regex, /trailing, $
function flexCaveats(r: Regex): string[]; // ɸ and \u{…} in the flex printout (and its definitions)

// analyze.ts — each distinct node (e.g. a shared definition body) is handled once,
// except by walk, which visits a definition once per use.
function nullable(r: Regex): boolean;
function symbolsOf(r: Regex): CharSet; // union of every chars node (refs expanded)
function containsAny(r: Regex): boolean; // uses Σ
function resolveAny(r: Regex, alphabet: CharSet): Regex;
function refsIn(r: Regex): string[];
function walk(r: Regex, visit: (node: Regex, path: number[], depth: number) => void): void;
function nodeAtPath(r: Regex, path: number[]): Regex | undefined;
function expandRefs(r: Regex): Regex;
function regexEquals(a: Regex, b: Regex): boolean; // structure only (no spans/text)
```

### 4.3 Automata (`theory/automata/`)

```ts
// types.ts — Automaton, State, Transition, AcceptInfo, Positions (see file)

// core.ts
function alphabetOf(a): CharSet; // union of labels, plus the declared Σ when there is one
function labelUnion(a): CharSet; // union of labels only
function symbolClasses(a, extra?: CharSet[]): CharSet[]; // disjoint classes covering every label (ascending)
function isLabeled(t): boolean; // a non-ε transition with a non-empty label
function outgoing(a, s): Transition[];
function incoming(a, s): Transition[];
function outgoingIndex(a): Transition[][]; // [state] = outgoing transitions by creation id
function letterName(i: number): string; // 0→A … 25→Z, 26→AA …
function compareNames(x: string, y: string): number; // total "name order": q2 < q10, Z < AA
function sortByName(a, ids: Iterable<StateId>): StateId[];
interface DeterminismReport {
	kind: 'dfa' | 'partial-dfa' | 'nfa';
	epsilonMoves: Transition[];
	conflicts: { state: StateId; symbols: CharSet; transitions: Transition[] }[];
	missing: { state: StateId; symbols: CharSet }[];
}
function analyzeDeterminism(a): DeterminismReport;
function complete(a, opts?: { trapName?: string }): { automaton: Automaton; trap: StateId | null };
function reachableStates(a): Set<StateId>;
function removeUnreachable(a): {
	automaton: Automaton;
	removed: StateId[];
	map: Map<StateId, StateId>;
};
interface TableRow {
	state: StateId;
	cells: StateId[][];
	epsilon: StateId[];
} // cells[classIndex] = targets
function transitionTable(a, classes?: CharSet[]): { classes: CharSet[]; rows: TableRow[] };
// Unions of the classes whose columns in transitionTable(a, classes) are identical (same targets
// in every state's row; ε-moves play no part), ascending by first code point, empty classes dropped:
// [A-Z] and [a-z] become one class when every state moves to the same states on both. Distinct but
// equivalent targets keep classes apart. subsetConstruction and minimize do not use it. With
// names, a union that is not a named set splits back into the named sets made of its classes
// (largest first, disjoint) plus one class for the rest: digit ∪ _ stays [digit, _] unless named.
function mergeEquivalentClasses(a, classes: CharSet[], opts?: { names?: NamedSet[] }): CharSet[];
function parseAutomatonText(text: string): {
	automaton: Automaton | null;
	diagnostics: Diagnostic[];
};
function formatAutomatonText(a): string; // repeated names (and '' on several states) get fresh names
// Text format:  "start: A" / "accept: B C" / "A 0,1 B" / "A ε B" / "A 'x' B" / "A [a-z] B"; "#" comments.
// Also "A -0,1-> B", "states: A B C" (fixes id order), "alphabet: 0,1", and "double-quoted" state names.
// Quotes and brackets open only at the start of a word or comma item, so q0' is a bare name.

// thompson.ts
interface ThompsonFragment {
	path: number[];
	node: Regex;
	start: StateId;
	final: StateId;
	states: StateId[];
}
interface ThompsonStep {
	path: number[];
	node: Regex;
	clause: string;
	fragment: ThompsonFragment;
	newStates: StateId[];
	newTransitions: number[];
	demoted: StateId[];
	stateCount: number;
	transitionCount: number;
	note?: string;
}
interface ThompsonResult {
	nfa: Automaton;
	steps: ThompsonStep[];
	positions: Positions;
	fragments: ThompsonFragment[];
}
function thompson(r: Regex, opts?: { alphabet?: CharSet }): ThompsonResult;
// Golden: (1 | 0)*1 → A–J with exactly the slide's 11 edges; states are named by layout.
// State ids follow the names (A = 0); transition ids follow creation order. States created
// through step i: thompsonStatesThrough(result, i). Layout: every fragment's start and final
// sit on its vertical center, so concatenated parts share one axis (slides 4, 6).

// closure.ts
interface ClosureEvent {
	kind: 'seed' | 'follow' | 'skip';
	state: StateId;
	via?: number;
}
function epsilonClosure(a, seeds: Iterable<StateId>): StateId[]; // ordered per §3.9
function epsilonClosureTrace(
	a,
	seeds: Iterable<StateId>
): { order: StateId[]; events: ClosureEvent[] };
function move(
	a,
	states: Iterable<StateId>,
	symbol: CharSet | string
): { targets: StateId[]; via: number[] }; // a CharSet moves on each of its symbols (union)
// The same operations with lookup tables built once, for many calls on one automaton:
class ClosureIndex {
	constructor(a);
	closure(seeds);
	closureTrace(seeds);
	move(states, symbol);
}

// subset.ts
type SubsetNaming = 'discovery' | 'sorted-set' | 'numbered';
type SubsetStep =
	| { kind: 'start'; dstate: StateId; closure: { order: StateId[]; events: ClosureEvent[] } }
	| { kind: 'move'; from: StateId; symbol: CharSet; targets: StateId[]; via: number[] }
	| { kind: 'closure'; from: StateId; symbol: CharSet; order: StateId[]; events: ClosureEvent[] }
	| {
			kind: 'target';
			from: StateId;
			symbol: CharSet;
			to: StateId | null;
			isNew: boolean;
			transition: number | null;
	  }
	| { kind: 'done' };
// every step also carries { dfaStates: number; dfaTransitions: number } (cumulative, for partial rendering)
interface SubsetResult {
	dfa: Automaton;
	steps: (SubsetStep & { dfaStates: number; dfaTransitions: number })[];
	classes: CharSet[];
	empty: StateId | null;
}
function subsetConstruction(
	nfa,
	opts?: { naming?: SubsetNaming; includeEmpty?: boolean }
): SubsetResult;
// Golden: Thompson((1 | 0)*1) → ABCDHI, FGABCDHI, EJGABCDHI with the slide's edges.
const EMPTY_SUBSET_NAME = '∅';
function subsetAccept(nfa, subset: Iterable<StateId>): AcceptInfo | undefined; // lowest rule wins

// minimize.ts
interface MinimizeRound {
	blocks: StateId[][];
	splits: {
		block: StateId[];
		parts: StateId[][];
		symbol: CharSet;
		// A witness is accepted from exactly one part, or (splitting by token) from both with different tokens.
		witness: string /* separates parts[0] and parts[1] */;
		witnesses: { part: number; symbol: CharSet; witness: string }[] /* parts[0] vs each part */;
	}[];
}
interface MinimizeResult {
	dfa: Automaton /* State.merged = ids of the machine passed in (ascending); an added trap is not listed */;
	rounds: MinimizeRound[];
	blockOf: Map<StateId, number>;
	input: Automaton /* total, trimmed machine that was partitioned; rounds and blockOf use its ids */;
	trap: StateId | null;
	removed: StateId[];
	map: Map<StateId, StateId> /* original id → input id */;
}
function minimize(dfa, opts?: { splitByToken?: boolean }): MinimizeResult;
type Distinction =
	| { equivalent: true }
	| {
			equivalent: false;
			witness: string;
			accepts: StateId /* p when both accept */;
			tokens?: { p: string; q: string } /* both accept, different tokens */;
	  };
function distinguish(
	dfa,
	p: StateId,
	q: StateId,
	opts?: { byToken?: boolean /* default true */ }
): Distinction;
// minimize and distinguish throw on NFAs: check analyzeDeterminism(a).kind !== 'nfa' first (or use toDfa).

// simulate.ts
interface DfaStep {
	pos: number;
	state: StateId | null;
	via?: number;
	char?: string;
}
interface DfaRun {
	steps: DfaStep[];
	accepted: boolean;
	outcome: 'accept' | 'reject' | 'stuck';
	stuckAt?: number;
}
function runDfa(a, input: string): DfaRun; // partial DFAs allowed; missing edge → 'stuck'
interface NfaStep {
	pos: number;
	char?: string;
	moved: StateId[];
	active: StateId[];
	taken: number[];
	closure: number[];
}
interface NfaRun {
	steps: NfaStep[];
	accepted: boolean;
}
function runNfa(a, input: string): NfaRun; // steps[0] = ε-closure(start), pos 0
interface PathNode {
	state: StateId;
	pos: number;
	via?: number;
	children: PathNode[];
	accepting: boolean;
	dead: boolean;
}
function pathTree(
	a,
	input: string,
	opts?: { maxNodes?: number }
): { root: PathNode; truncated: boolean };
function accepts(a, input: string): boolean;

// language.ts
function regexToNfa(r: Regex, opts?: { alphabet?: CharSet }): Automaton;
function regexToDfa(r: Regex, opts?: { alphabet?: CharSet; minimal?: boolean }): Automaton;
function toDfa(a): Automaton; // determinize if needed
function enumerate(
	a,
	opts: { maxLength: number; limit: number }
): { strings: string[]; truncated: boolean }; // shortlex
function isEmptyLanguage(a): boolean;
function isFiniteLanguage(a): boolean;
function countByLength(a, maxLength: number): bigint[];
function shortestAccepted(a): string | null;
interface Comparison {
	equivalent: boolean;
	onlyA: string | null;
	onlyB: string | null;
	examples: { onlyA: string[]; onlyB: string[]; both: string[] };
}
function compareLanguages(a, b, opts?: { exampleLimit?: number; maxLength?: number }): Comparison;

// scanner.ts
interface TokenRule {
	name: string;
	regex: Regex;
	skip?: boolean;
}
interface MatchMatrix {
	pos: number;
	maxLen: number;
	matches: boolean[][] /* [rule][len - 1] */;
	length: number | null;
	rule: number | null;
}
interface ScanToken {
	rule: number;
	name: string;
	lexeme: string;
	start: number;
	end: number;
	skipped: boolean;
	error: boolean;
}
interface ScanResult {
	tokens: ScanToken[];
	steps: MatchMatrix[];
	stuck: number | null;
	cutoff?: number; // set only when opts.maxReads stopped the scan: offset of the next, unscanned token
}
// Σ in a rule means any symbol of opts.alphabet; all three default to scannerAlphabet(rules).
function scannerAlphabet(rules: TokenRule[], extra?: CharSet): CharSet; // symbols the rules use ∪ extra
function scan(
	rules: TokenRule[],
	input: string,
	opts?: {
		errorRule?: boolean;
		alphabet?: CharSet;
		maxReads?: number; /* total of the steps' maxLen */
	}
): ScanResult;
function scannerNfa(
	rules: TokenRule[],
	opts?: { alphabet?: CharSet }
): {
	nfa: Automaton;
	starts: StateId[];
	positions: Positions /* rules' Thompson layouts stacked */;
};
function scannerDfa(
	rules: TokenRule[],
	opts?: { minimal?: boolean; alphabet?: CharSet }
): Automaton; // accept tags carry the token
const ERROR_TOKEN = 'Error';
const ERROR_RULE = -1; // ScanToken.rule of Error tokens (scan and driveScanner)
interface DriverStep {
	pos: number;
	state: StateId | null;
	char?: string;
	lastAccept: { state: StateId; pos: number } | null;
}
function longestMatchRun(
	dfa,
	input: string,
	start: number
): { steps: DriverStep[]; token: { state: StateId; end: number } | null };
// Whole input with longestMatchRun; same tokens as scan(rules) for scannerDfa(rules) with the same alphabet.
function driveScanner(
	dfa,
	input: string,
	opts?: { errorRule?: boolean; skip?: ReadonlySet<string> /* token names */ }
): {
	tokens: ScanToken[];
	runs: { start: number; steps: DriverStep[]; token: { state: StateId; end: number } | null }[];
	stuck: number | null;
};

// serialize.ts — plain-data forms for postMessage (structured clone drops class
// prototypes: a cloned CharSet is a bare { ranges }). Each …FromPlain rebuilds engine objects.
type PlainCharSet = [lo: number, hi: number][];
function charSetToPlain(set): PlainCharSet;
function charSetFromPlain(p: PlainCharSet | { ranges }): CharSet; // also revives a cloned CharSet
class CharSetInterner {
	constructor(seed?: Iterable<CharSet>);
	add(set);
	get(plain);
} // one object per distinct set
function automatonToPlain(a): PlainAutomaton; // labels and alphabet as ranges
function automatonFromPlain(p, intern?): Automaton;
function closureEventsToPlain(events): number[]; // flat (kind, state, via) triples
function closureEventsFromPlain(p): ClosureEvent[];
function subsetResultToPlain(r): PlainSubsetResult; // step symbols as class indices, events flat
function subsetResultFromPlain(p): SubsetResult; // step symbols and DFA labels are the `classes` objects again
```

### 4.4 Grammars (`theory/grammar/`)

```ts
// types.ts — Grammar, Production, Ebnf, EbnfRule, EbnfGrammar, ParseNode,
// SententialForm, DerivationStep, Derivation, END_MARKER, EPSILON (see file)

// parse.ts
function parseGrammar(text: string): { grammar: Grammar | null; diagnostics: Diagnostic[] };
function parseEbnf(text: string): { grammar: EbnfGrammar | null; diagnostics: Diagnostic[] };
// Notation per §3.10. In parseGrammar, { } [ ] are ordinary terminals; in parseEbnf
// they are metasymbols (quote them to use them as terminals). Lines starting
// with // and /* … */ comments are ignored.
function makeGrammar(
	productions: readonly { lhs: string; rhs: readonly string[]; span?: Span }[],
	opts?: { terminals?: readonly string[] } // these terminals first, in this order
): Grammar; // a grammar built in code: S = first lhs, N = the lhs, ids in order, repeats dropped
function printGrammar(
	g: Grammar,
	opts?: { perLine?: 'nonterminal' | 'production' | 'alternative' }
): string; // 'alternative': each further alternative on its own line, under the arrow, after |
function printEbnf(g: EbnfGrammar): string;
function printSymbols(symbols: readonly string[], opts?: { ebnf?: boolean }): string; // "E + T", "ε" for []
function printSet(symbols: Iterable<string>): string; // "{ int, +, ε }", "{ }"; for N, T, FIRST, FOLLOW
function tokenizeInput(
	text: string,
	terminals: readonly string[],
	opts?: { nonterminals?: readonly string[] } // only for the message "E is a non-terminal"
): { tokens: string[]; spans: Span[]; diagnostics: Diagnostic[] }; // same lexing as grammar symbols
function ebnfToGrammar(e: EbnfGrammar): Grammar; // plain CFG for the same language
type GrammarTokenKind =
	'nonterminal' | 'terminal' | 'arrow' | 'bar' | 'epsilon' | 'bracket' | 'comment';
interface GrammarToken {
	kind: GrammarTokenKind;
	span: Span;
	name?: string; /* symbols only */
}
function scanGrammar(text: string, opts?: { ebnf?: boolean }): GrammarToken[]; // for highlighting

// analyze.ts
function nullable(g: Grammar): Set<string>;
function firstSets(g: Grammar): Map<string, Set<string>>; // ε is listed as EPSILON
function followSets(g: Grammar): Map<string, Set<string>>; // END_MARKER in FOLLOW(S)
function firstOfSequence(
	g: Grammar,
	symbols: readonly string[],
	first?: Map<string, Set<string>>
): Set<string>;
function reservedSymbols(g: Grammar): string[]; // symbols of g named like END_MARKER or EPSILON
function unreachable(g: Grammar): string[];
function unproductive(g: Grammar): string[];
interface LeftRecursion {
	nonterminal: string;
	immediate: boolean;
	chain: number[]; /* production ids of V →+ V α */
}
function leftRecursion(g: Grammar): LeftRecursion[];
function cycles(g: Grammar): string[][]; // groups of non-terminals with A →+ A, e.g. A → A | a
interface ChomskyReport {
	type: 2 | 3;
	regular: boolean[]; /* per production: has the form V → w | wU */
}
function chomskyType(g: Grammar): ChomskyReport;
function sentenceLengths(g: Grammar): { min: number; max: number } | null; // max Infinity; null: L(G) = { }
function isEmptyLanguage(g: Grammar): boolean;
function isFiniteLanguage(g: Grammar): boolean;

// derive.ts
function applyStep(form: SententialForm, index: number, p: Production): SententialForm;
function nonterminalPositions(g: Grammar, form: SententialForm): number[];
function derivationFromTree(
	g: Grammar,
	tree: ParseNode,
	order: 'leftmost' | 'rightmost'
): Derivation;
function treeFromDerivation(g: Grammar, d: Derivation): ParseNode; // partial trees allowed
function yieldOf(tree: ParseNode): string[];
function treeEquals(a: ParseNode, b: ParseNode): boolean;
function bracketForm(tree: ParseNode): string; // "E( E(int) + E( E(int) + E(int) ) )", "S(ε)"

// earley.ts
const DEFAULT_MAX_STEPS = 10_000_000; // work limit in Earley items: about a second
function recognizes(g: Grammar, tokens: readonly string[]): boolean;
function parseTrees(
	g: Grammar,
	tokens: readonly string[],
	opts?: { limit?: number } // default 50
): { trees: ParseNode[]; truncated: boolean }; // every parse tree, up to limit
function enumerateLanguage(
	g: Grammar,
	opts: { maxLength: number; limit: number; maxSteps?: number }
): { strings: string[][]; truncated: boolean; limited: boolean }; // by length, then terminal order
function compareGrammars(
	a: Grammar,
	b: Grammar,
	opts: { maxLength: number; maxSentences?: number; maxSteps?: number } // defaults 20000, DEFAULT_MAX_STEPS
): { onlyA: string[][]; onlyB: string[][]; checkedUpTo: number };
```

- **Diagnostics of the parsers.** Errors (no grammar is returned): empty text,
  a line without `→`, a left-hand side that is not one symbol, an empty
  alternative (write `ε`), an unclosed quote or comment, and for EBNF
  unbalanced or empty `{ }` `[ ]`. Warnings: a repeated production (listed
  once), `ε` next to other symbols, an unreachable non-terminal, a
  non-terminal that derives no terminal string, a symbol named `$` or `ε`, a
  hyphenated name whose parts are all symbols of the grammar (`E-T`,
  `int-int`). Notes (`info`): one per non-terminal that does not start with a
  capital letter, at its first left-hand side; a hyphenated name with a
  non-terminal among its parts.
- **Token strings.** `tokenizeInput` reports each symbol that is not in
  `terminals`. A terminal that needs quotes and is written bare is read as
  several symbols; when they are not all terminals, one error covers them
  (`== is read as 2 symbols. Write "==" in quotes.`). Pass
  `[...g.terminals, END_MARKER]` to allow the closing `$`.
- **`$` and `ε` in sets.** FIRST and FOLLOW sets hold EPSILON and END_MARKER as
  plain strings. A tool that shows these sets or builds a predictive parser
  checks `reservedSymbols(g)` first; when it is not empty the sets are
  ambiguous for that grammar. Print a set with `printSet` (`printSymbols`
  quotes `ε`, because there it is the name of a symbol).
- **Order.** Sets and lists follow the grammar: N and T in order of first
  appearance, then `$`, then `ε`. `parseTrees` lists earlier productions
  first and, within a production, shorter spans for the symbols on the left
  first, so `int + int + int` under `E → E + E | int` gives the right-nested
  tree `E( E(int) + E( E(int) + E(int) ) )` before the left-nested one (the
  slides draw the left-nested tree first; a tool that follows a slide picks
  the tree it needs with `bracketForm` or `treeEquals`). `enumerateLanguage`
  lists shorter sentences first and orders one length by the order of T, so
  `S → 1 A ; A → 0 | 1` gives `1 1` before `1 0`.
- **Cyclic grammars.** `A → A | a` has infinitely many derivations of `a`
  (`cycles(g)` is not empty). `parseTrees` leaves out trees in which a node
  repeats the non-terminal and token range of one of its ancestors, which
  keeps the list finite.
- **`truncated` and `limited`.** `parseTrees(…).truncated` says there are more
  trees than `limit`. `enumerateLanguage(…).truncated` says L(G) has sentences
  that are not listed, which includes sentences longer than `maxLength` (as
  for `enumerate` on automata: `S → 1 A ; A → 0 | 1 A` with `maxLength: 4` is
  truncated); `limited` says the list itself was cut, by `limit` or by the
  work limit. `compareGrammars(…).checkedUpTo` is `maxLength` unless a
  language passes `maxSentences` or the work passes `maxSteps`; then it is the
  last length that was compared completely.
- **Cost.** No function throws or runs out of stack because its input is
  long or deep: `parseTrees` builds a tree of 20000 nested parentheses, and
  `yieldOf`, `treeEquals` and `bracketForm` take it (a `Derivation` holds
  every sentential form, so its size grows with the square of the sentence
  length). The analyses follow the productions with worklists and take a
  fraction of a second on a grammar of 20000 rules. `recognizes` and
  `parseTrees` take up to about the cube of the number of tokens for an
  ambiguous grammar (`E → E + E | E * E | ( E ) | int` on 1000 tokens: a
  fraction of a second), and `parseTrees` then a time per tree that grows
  with the size of the tree, also for grammars with cycles. Listing a
  language costs about the cube of the sentence length per sentence: call
  `enumerateLanguage` and `compareGrammars` from a worker (§5.4) with a
  `maxLength` of a few dozen at most; `maxSteps` bounds the time whatever the
  bounds are.

### 4.5 C- compiler (`theory/cminus/`)

A compiler for C- (the language of Appendix A of the course text) that keeps
the result of every phase: characters → tokens → abstract syntax tree → symbol
tables and types → three-address code → optimized three-address code → TINY
Machine (TM) code. `run.ts`, `codegen.ts` and `interpret.ts` import the
machine, its instruction type and its memory sizes from
`$lib/tools/tiny-vm/machine` (pure TypeScript); nothing else in `theory/`
imports from a tool.

```ts
// tokens.ts
interface SourceSpan extends Span {
	line: number; // 1-based, of `start`
	column: number; // 1-based, UTF-16 code units
}
interface SourceDiagnostic extends Diagnostic {
	span?: SourceSpan; // every phase sets it; Compilation.diagnostics requires it
}
// TokenType, in the course's upper-case names: ELSE IF INT RETURN VOID WHILE ID NUM
// PLUS MINUS TIMES OVER LT LTE GT GTE EQ NEQ ASSIGN SEMI COMMA LPAREN RPAREN
// LBRACKET RBRACKET LBRACE RBRACE ENDFILE ERROR
interface Token {
	type: TokenType;
	lexeme: string;
	span: SourceSpan;
	value?: number; /* NUM */
}
interface Trivia {
	kind: 'whitespace' | 'comment';
	text: string;
	span: SourceSpan;
}
const KEYWORDS, SYMBOLS, TOKEN_TYPES;
function spellingOf(type: TokenType): string | null; // "while", "<="; null for ID NUM ENDFILE ERROR
function joinSpans(a: SourceSpan, b: SourceSpan): SourceSpan;

// scanner.ts
type IdentifierMode = 'letters' | 'extended'; // letter letter*  |  letter (letter | digit | _)*
function scan(
	source: string,
	opts?: { identifiers?: IdentifierMode }
): { tokens: Token[] /* ENDFILE last */; trivia: Trivia[]; diagnostics: SourceDiagnostic[] };

// ast.ts — nodes { id, span, kind, … }; ids are preorder numbers from 0 (Program).
// Kinds: Program VarDecl FunDecl Param Compound If While Return ExprStmt
//        Assign Binary Var Index Call Num. Parentheses leave no node.
type Decl = VarDecl | FunDecl;
type Stmt = Compound | If | While | Return | ExprStmt;
type Expr = Assign | Binary | Var | Index | Call | Num;
type AstNode = Program | Decl | Param | Stmt | Expr;
function childrenOf(node: AstNode): AstNode[];
function walk(
	root: AstNode,
	visit: (node: AstNode, depth: number, parent: AstNode | null) => void
): void;
function allNodes(root: AstNode): AstNode[]; // preorder: allNodes(program)[id].id === id
function findNode(root: AstNode, id: number): AstNode | null;
function nodeAt(root: AstNode, offset: number): AstNode | null; // innermost node at a source offset
function nodeLabel(node: AstNode): string; // "VarDecl int a[10]", "Binary +", "Var x"
function astLines(root: AstNode): { id: number; depth: number; label: string; span: SourceSpan }[];
function printAst(root: AstNode, opts?: { indent?: string }): string; // one node per line
function printExpr(e: Expr): string; // C- text with the fewest parentheses

// parser.ts — predictive recursive descent, one function per non-terminal of CMINUS_EBNF.
const CMINUS_BNF: string; // the 29 rules, readable by parseGrammar
const CMINUS_EBNF: string; // the grammar the parser follows, readable by parseEbnf
const MAX_NESTING = 200, // statements and parenthesized expressions
	MAX_TREE_DEPTH = 500, // levels of the tree; a + a + a + … is a level per operator
	MAX_SYNTAX_ERRORS = 50;
interface ParseResult {
	program: Program; // what parsed; a statement or declaration with a syntax error is left out
	diagnostics: SourceDiagnostic[];
	ok: boolean;
}
function parse(tokens: readonly Token[]): ParseResult;
function parseSource(source: string, opts?: { identifiers?: IdentifierMode }): ParseResult;

// semantic.ts
type CType =
	| { kind: 'int' }
	| { kind: 'void' }
	| { kind: 'array' }
	| { kind: 'error' }
	| { kind: 'function'; returns: 'int' | 'void'; params: ('int' | 'array')[] };
function typeText(t: CType): string; // "int", "int[]", "(int, int[]) → int", "error"
interface SymbolInfo {
	id: number;
	name: string;
	kind: 'variable' | 'array' | 'function' | 'parameter' | 'array-parameter';
	type: CType;
	scope: number; // id of the declaring scope
	depth: number; // 0 global, 1 function, 2+ nested blocks
	declSpan: SourceSpan | null; // null for input and output
	node: number | null;
	uses: SourceSpan[];
	size: number | null; // arrays
	params: { name: string; type: 'int' | 'array' }[] | null; // functions
	builtin: boolean;
	location: { base: 'gp' | 'fp'; offset: number } | null; // null for functions
}
interface Scope {
	id: number;
	kind: 'global' | 'function' | 'block';
	name: string; // "global", "gcd", "main.1", "main.1.2"
	depth: number;
	parent: number | null;
	children: number[];
	symbols: number[];
	function: number | null;
	node: number | null;
	span: SourceSpan | null;
}
interface FunctionInfo {
	name: string;
	symbol: number;
	node: number;
	scope: number;
	returns: 'int' | 'void';
	params: number[];
	locals: number[]; // every local, nested blocks included
	frameSize: number; // cells before the temporaries
}
interface SemanticResult {
	symbols: SymbolInfo[]; // input and output first
	scopes: Scope[]; // scopes[0] is global
	functions: FunctionInfo[];
	types: Map<number, CType>; // expression node id → type
	refs: Map<number, number>; // Var/Index/Call and VarDecl/Param/FunDecl node id → symbol id
	globalsSize: number;
	diagnostics: SourceDiagnostic[];
	ok: boolean; // no error (warnings allowed)
}
function analyze(program: Program): SemanticResult; // for a tree without syntax errors
function visibleSymbols(result: SemanticResult, scopeId: number): SymbolInfo[];

// ir.ts — quads in the layout of the phases tool: `#5`, `t1`, `L1`, `_`.
// QuadOp: + - * / < <= > >= == != := =[] []= param call return label goto if_false begin end
type Operand =
	| { kind: 'const'; value: number }
	| { kind: 'var'; name: string; symbol: number }
	| { kind: 'temp'; name: string }
	| { kind: 'label'; name: string }
	| { kind: 'function'; name: string; symbol: number }
	| { kind: 'count'; value: number };
interface Quad {
	id: number; // index in the generated code; kept by the optimizer
	op: QuadOp;
	arg1: Operand | null;
	arg2: Operand | null;
	result: Operand | null;
	node: number | null;
	span: SourceSpan | null;
	changed?: ('op' | 'arg1' | 'arg2' | 'result')[]; // optimized code only
}
interface IrProgram {
	quads: Quad[];
	functions: {
		name: string;
		symbol: number;
		from: number;
		to: number;
		names: Map<number, string>;
	}[];
}
function generateIr(program: Program, semantic: SemanticResult): IrProgram;
function quadColumns(q: Quad): [string, string, string, string];
function formatQuad(q: Quad): string; // "+ x #1 t1"
function quadText(q: Quad): string; // "t1 := x + 1", "a[i] := t2", "L1:"
function printQuads(quads: readonly Quad[]): string; // four aligned columns
function printCode(quads: readonly Quad[]): string; // one-line forms, labels at the margin
function operandText(o: Operand | null): string;
function sameOperand(a: Operand | null, b: Operand | null): boolean;
function temporariesOf(quads: readonly Quad[]): string[];
function functionRanges(quads: readonly Quad[]): { name; symbol; from; to }[];

// optimize.ts
// OptimizePass: constant copy fold identity branch retarget dead-temp jump label keep
interface OptimizeLogEntry {
	pass: OptimizePass;
	round: number;
	function: string;
	quad: number; // Quad.id
	before: string;
	after: string | null; // null: removed
	text: string;
}
function optimize(
	ir: IrProgram,
	semantic: SemanticResult
): { program: IrProgram; log: OptimizeLogEntry[]; rounds: number; removed: number[] };
function basicBlocks(quads: readonly Quad[]): { from: number; to: number }[];
function isLeader(quads: readonly Quad[], i: number): boolean;

// codegen.ts
interface TmInstruction {
	addr: number;
	instr: Instruction; // tiny-vm: { op, a1, a2, a3 }
	comment: string;
	quad: number | null; // index in the quads the code was generated from
	span: SourceSpan | null;
	function: string | null;
	header: string[]; // comment lines above it in the listing
	line: number; // 1-based line in the listing
	origin: number; // address before the peephole pass
}
interface TmCode {
	instructions: TmInstruction[];
	listing: string; // parseTM reads it back
	entries: Map<string, number>;
	haltAddress: number;
	negativeSubscriptAddress: number;
}
interface FrameLayout {
	function: string;
	size: number;
	slots: { name: string; kind: SlotKind; offset: number; size: number; symbol: number | null }[];
}
interface CodegenResult {
	code: TmCode; // straight from the quads; may be longer than instruction memory (isLoadable)
	peephole: {
		code: TmCode; // the code to run
		changes: {
			rule: 'store-load' | 'jump-to-next';
			addr: number;
			instruction: string;
			text: string;
		}[];
	};
	globals: { size: number; slots: { name; kind; offset; address; size; symbol }[] };
	frames: FrameLayout[]; // input, output, then the program's functions
	diagnostics: SourceDiagnostic[]; // what does not fit the machine, each with a span
	ok: boolean;
}
function generateCode(ir: IrProgram, semantic: SemanticResult): CodegenResult;
function formatListing(instructions: readonly TmInstruction[], trailer?: readonly string[]): string;

// run.ts, interpret.ts
type StopReason =
	| 'halted'
	| 'input-exhausted'
	| 'step-budget'
	| 'memory-error'
	| 'zero-divide'
	| 'negative-subscript'
	| 'subscript-out-of-range' /* interpreter only */;
function runTM(
	code: TmCode,
	inputs: readonly number[],
	opts?: { maxSteps?: number } // default DEFAULT_STEP_BUDGET = 1 000 000 instructions
): { outputs: number[]; stop: StopReason; steps: number; pc: number | null; machine: Machine };
function isLoadable(code: TmCode): boolean; // fits in instruction memory: runTM runs only such code
function instructionMemory(code: TmCode): InstructionMemory;
function interpret(
	program: Program,
	semantic: SemanticResult,
	inputs: readonly number[],
	opts?: { maxSteps?: number; maxCallDepth?: number } // defaults 1 000 000 and 512
): {
	outputs: number[];
	stop: StopReason;
	steps: number;
	node: number | null; // where it stopped; main when the program does not fit before it starts
	span: SourceSpan | null;
};

// compile.ts
type Phase = 'scanner' | 'parser' | 'semantic' | 'ir' | 'optimizer' | 'codegen';
interface Compilation {
	source: string;
	options: { identifiers: IdentifierMode; optimize: boolean };
	scan: ScanResult;
	parse: ParseResult | null;
	semantic: SemanticResult | null;
	ir: IrProgram | null;
	optimized: OptimizeResult | null; // null when the optimizer is off
	codegen: CodegenResult | null;
	stoppedAt: Phase | null;
	diagnostics: PhaseDiagnostic[]; // SourceDiagnostic & { phase: Phase; span: SourceSpan }
}
function compile(
	source: string,
	opts?: { identifiers?: IdentifierMode; optimize?: boolean } // defaults 'letters', true
): Compilation;
function codeQuads(c: Compilation): IrProgram | null; // the quads the code came from
function finalCode(c: Compilation): TmCode | null; // null unless the program compiled
function codeBeforePeephole(c: Compilation): TmCode | null; // codegen.code when it can run too
function runCompilation(c, inputs, opts?): RunResult | null;
function interpretCompilation(c, inputs, opts?): InterpretResult | null;

// runtime.ts — AC AC1 FP GP PC, registerName, frame offsets, INT_MIN, INT_MAX,
// arith(op, a, b) (null for a division by zero) and compare(op, a, b).
// samples.ts — SAMPLES, sampleById, UNDECLARED_SOURCE.
```

- **Phases stop at the first error.** `compile` fills the results in order and
  leaves every phase after an error `null`; `stoppedAt` names the phase.
  Warnings (an int function that may reach its end without a return) do not
  stop it. The one exception to "later phases are null": when the code or its
  data does not fit the machine, `stoppedAt` is `'codegen'` and `codegen` is
  still there to show (`finalCode` is `null`). Every entry of
  `Compilation.diagnostics` has a span.
- **Fitting the machine.** The code generator reports three things, as
  errors. The code after the peephole pass is longer than the 1024
  instruction cells (span: the name of main). The global variables and the
  record of one function, temporaries included, are more than the 1024 data
  cells (span: the name of the function). A function is called, and on the
  shortest chain of calls from main to it the global variables and the
  records on the stack are more than the data cells (span: the call that
  ends the chain; the message lists the records; one report per function).
  Recursion is not counted, so a program that compiles can still run out of
  stack: `memory-error`. `codegen.code`, from before the peephole pass, may be
  longer than instruction memory in a program that compiles; `runTM` does not
  run such code (`memory-error`, 0 steps, `pc: null`). `isLoadable(code)`
  tells, and `codeBeforePeephole(c)` is that code only when it can run.
- **Scanner.** Maximal munch; a reserved word wins over ID. An illegal
  character and a `!` without `=` are one ERROR token each; a comment that is
  never closed is one ERROR token to the end of the text (and no trivia
  entry). Tokens and trivia together cover the whole text.
- **Parser.** The EBNF is the BNF with left recursion written as repetition.
  Three choices take more than one token: a declaration is a variable or a
  function by the token after `type-specifier ID`; `void` alone is the empty
  parameter list; for `expression` the parser reads a var (or call) and then
  looks for `=`, and without one hands what it read to `simple-expression` as
  its first factor (nothing is rewound). Recovery is panic mode: the statement
  or declaration is dropped, tokens are skipped through the next `;` or up to
  a `}`. `a < b < c`, an assignment whose left side is not a var, and `()`
  for a parameter list are reported without dropping anything. Nesting
  deeper than `MAX_NESTING`, a tree deeper than `MAX_TREE_DEPTH` and more
  than `MAX_SYNTAX_ERRORS` errors end the parse, so every later walk of the
  tree may recurse (and a `Compilation` can be cloned). These are limits of
  the parser, not of the grammar: `a + b + c` is a level of the tree per
  operator, so a flat expression of about 500 operators in a row is refused,
  with a message that calls it too long rather than nested. Within the
  limits the parser accepts exactly the token strings that `CMINUS_BNF`
  derives (a spec checks it with `recognizes` on mutated programs and random
  token strings).
- **Semantic analyzer.** Errors: undeclared name (once per use; the
  expression gets the type `error`, which is accepted everywhere, so one
  mistake gives one message); redeclaration in a scope (`input` and `output`
  are in the global scope); void variable or parameter; main missing, not
  last, or not `void main(void)`; a call of something that is not a function;
  wrong number of arguments; an array where an int parameter is and the
  reverse; an array, a void call or a function name where an int is needed
  (operand, condition, right side of `=`, returned value, subscript,
  statement); indexing something that is not an array; assigning to an array
  or a function; `return` with a value in a void function and without one in
  an int function; a number or array size that does not fit in 32 bits; an
  array of size 0. Diagnostics come in source order.
- **Three-address code.** Evaluation is left to right. Where a later operand
  can change a variable an earlier operand named (an assignment to it, or for
  a global any call), the earlier value is first copied to a temporary. The
  `param` quads of a call directly precede it: every argument is computed
  first. Temporaries are numbered per function, labels through the program.
  In quad text a variable has its source name, except that the local of a
  nested block that hides or repeats another name is `x.2`, `x.3`, …, and so
  is a variable spelled like a temporary or a label (`t1.2`, `L1.2`; only
  `extended` identifiers can be); the operand's `symbol` is what identifies
  it.
- **Optimizer.** Passes: constant and copy propagation, folding (32-bit
  wrap-around; never a division by zero), the identities `x + 0`, `0 + x`,
  `x − 0`, `x * 1`, `1 * x`, `x / 1`, `x * 0`, `0 * x`, and `if_false` on a
  constant, all within a basic block; then `t := a op b · x := t` becomes
  `x := a op b` when t has no other use, unused temporaries go, and so do
  jumps to the next quad and labels nothing jumps to. Rounds repeat until
  nothing changes. A call, a division whose divisor may be zero and an array
  read whose subscript may be negative are never removed (of an unused call
  only the result is dropped), so the optimized program stops where the
  original does. Unreachable code is left in place.
- **Run-time conventions** (the header of `runtime.ts` has the full text).
  ac = 0, ac1 = 1, fp = 5, gp = 6, pc = 7. Globals start at `0(gp)` (gp is
  1023, read from dMem[0]) and go down; activation records lie below them and
  grow toward address 0: `0(fp)` the caller's fp, `-1(fp)` the return address,
  then parameters, locals, temporaries. Element 0 of an array has the lowest
  address; an array parameter holds the address of element 0. Code: the
  prelude (0–4), `HALT` (5, main returns here), a second `HALT` (6, the target
  of a negative subscript), `input` (7), `output` (10), then the functions.
  Every quad is translated on its own through ac and ac1; jumps are
  pc-relative. Ordering comparisons test the signs before subtracting, so
  they are exact for every pair of 32-bit values.
- **Agreement.** `interpret` and the TM code print the same and stop for the
  same reason, with the optimizer on or off and before or after the peephole
  pass; specs check it on the sample programs and on random programs. Outside
  that agreement, because the language leaves them undefined: reading a local
  variable before assigning it and the value of an int function that ends
  without `return` (the interpreter gives 0, the machine whatever the cell or
  ac holds), a subscript past the end of an array (the interpreter stops with
  `subscript-out-of-range`, compiled code reads or writes the cell that is
  there), and running out of memory. The machine has 1024 data cells for the
  globals and every record on the stack, temporaries included. The
  interpreter keeps no such count. It stops with `memory-error` in three
  cases: the global variables and one record without temporaries (of main
  at the start, of a function at its call) are more than 1024 cells, which
  the code generator refuses as well; calls nest more than 512 deep, which
  is more records than the machine holds; the JavaScript stack gives out
  first (deep recursion through deeply nested statements). It gives a
  variable its storage when the variable is first used, and no array larger
  than the machine's memory ever gets any, so a run costs time and memory in
  proportion to its steps, whatever sizes the program declares.
- **Plain data.** A `Compilation` holds objects, arrays and Maps only, so it
  survives a structured clone (§5.4).

## 5. UI contracts

### 5.1 Tool pages

Every tool page renders inside `ToolPage` (`$lib/components/ui/ToolPage.svelte`)
with its `ToolMeta`, and keeps its user-editable state in the URL hash through
`$lib/url-state.ts` so the "Copy link" button reproduces the exact view:

```ts
let state = $state({ regex: '(1 | 0)*1', input: '' }); // JSON-serializable
syncToHash(() => state, { onLoad: (v) => Object.assign(state, v), validate });
```

The hash is read on mount and on `hashchange`, and written (debounced, hash
only) when the state changes; an untouched page keeps a clean URL. When an
in-page anchor (e.g. the skip link) replaces the hash, the state is put back,
and `flushHash()` (called by Copy link) makes `location.href` carry the current
state. One `syncToHash` per page. Link to a tool with `toolHref(slug)` from
`$lib/site`.

### 5.1a Cross-tool links

`$lib/tools/links.ts` lists the state each tool accepts in its URL hash
(`LinkStates`). Build a link with `toolLink('thompson', { re, defs })`; it
returns `null` when the target tool is not registered, so hide the link in that
case (prerendering fails on links to pages that do not exist). A tool's own
saved state must accept its `LinkStates` shape (extra fields are allowed).

`phases` and `t-diagrams` have no `LinkStates` entry: no tool links to them on
a state (`tiny-vm` has one: the C- compiler opens its generated code there). Link to them with `toolHref(slug)`, behind
`toolBySlug(slug)` for the same reason. The midterm page (§2) is the one caller
that opens two of them on a view: it appends `encode(state)` to
`toolHref('phases')` and `toolHref('t-diagrams')`, where `state` has the shape
the tool saves in its own hash (`Partial<PhasesState>`, `TDiagramsHash`), and
its spec holds each of these states against the tool's validator. A tool that
other tools start to link to on a state gets a `LinkStates` entry.

### 5.2 Graph components (`$lib/components/graph/`)

- `AutomatonView.svelte` — SVG renderer following §3.5. Props: `automaton`,
  `positions?` (pinned; otherwise automatic left-to-right layout),
  `highlight?: { active?, taken?, dim?, dimTransitions?, tone? }` (`taken` and
  `dimTransitions` hold transition ids; `tone` maps a state to `'accept'`,
  `'reject'` or `'info'`), `groups?: { id, label?, states, tone?, faint? }[]`
  (fragment outlines, partition blocks; `tone` is a palette index 0–5; `faint`
  draws a lighter, dashed outline), `extent?` (a box, in user units, that
  "fit" always includes, so a machine drawn step by step keeps its scale),
  `names?: NamedSet[]` for labels, `editable?`, `selected?` (bindable:
  `{ kind: 'state', id } | { kind: 'edge', key } | null`), callbacks
  `onchange(automaton, positions)`, `onstateclick(id)`,
  `ontransitionclick(transitionIds, edgeKey)`, plus `height` (px or `'auto'`),
  `ariaLabel`, `startLabel` (text on the start arrow, e.g. `start`),
  `viewKey?`, `hideNames?` (draw states without names, as on unlabeled slide
  drawings) and `selectionActions?` (default true; false keeps only "Add state"
  and the hints in the bar under an editable drawing, for pages with their own
  inspector). Supports pan/zoom (arrow keys pan from the drawing or the zoom
  buttons) and "fit"; `fit()` is also a component export (`bind:this`).
  Passing a machine the view did not just report through `onchange` (compared
  by object, then by `layoutKey`) refits the view, clears the selection and
  drops a drag or label edit in progress; an echo of its own edit, with or
  without the positions, keeps the view. With `viewKey` set, only a change of
  `viewKey` refits (a stepper passes a constant key to keep the user's zoom).
  Types are in `graph/types.ts`.
- `TransitionTable.svelte` — table per §3.7: `automaton`, `classes?` (used as
  given), `names?`, `highlight?: { state?, states?, cell?: { state, column } }`
  (`states` marks several rows, e.g. an NFA's active set; the ε column comes
  last), `onCellClick?(state, column, symbols)` (`symbols` is null
  for ε), `compact?`, `caption?` (visually hidden). Default columns come from
  `tableColumns` in `table.ts`: classes of Σ and every label, with classes that
  every state treats alike merged into one column (`mergeEquivalentClasses`, so
  separate `[A-Z]` and `[a-z]` transitions to the same states share a column,
  headed by a named set such as `letter` when the merged class is one; with
  `names`, a named set never goes into an unnamed column, so `digit` and `_`
  stay apart unless their union is named, at any alphabet size), one column
  per symbol when there are at most 16 symbols (named sets stay whole), and a
  class only reached through `display` labels headed by that text (`other`),
  never merged, and listed last. Given `classes` are used as they are. The
  scanner-dfa tool's table T merges its label classes the same way, names
  included (its `other` column is never merged, so EOF keeps its entry).
- `layout.ts` — pure layout (`layoutAutomaton(a, { positions?, names?,
startLabel? })`) returning node geometry, one edge per (from, to, ε) keyed by
  `edgeKey`, the start arrow, and bounds; unit-tested. The start state ranks
  first even when other states have no way in, and the start arrow comes in
  from the left or the first side clear of states, edges and labels. Results
  are cached by `layoutKey(a, opts)` (structure only) and shared, so treat
  them as read-only; rebuilding the same machine as a new object is cheap.
  Machines up to 10 states try several dagre alignments; larger ones take
  one pass. To keep states in place while a construction grows (and to skip
  dagre while stepping), lay out the final machine once and pass its node
  centers as `positions`.
- `label-text.ts` — `parseLabelText` / `labelText`: the editable text form of a
  transition label (`0,1`, `a-z`, `ε`, `' '`, `[^\n]`, named sets). A spaced
  range (`a - z`) is an error; symbols spelled like a name are quoted.
- `edit.ts` — immutable editing operations used by the editor (add or remove
  states with renumbering, set edge labels, …). New symbols on an edge never
  merge into a transition with a `display` override.

### 5.2a Grammar components (`$lib/components/grammar/`)

- `ParseTreeView.svelte` — draws a `ParseNode` per §3.10 (root on top, plain
  lines, unboxed labels). Props: `tree`, `tone?` (color of the whole tree),
  `highlight?` (paths of nodes to mark as current / new / matched),
  `rejected?` (draw the X), `labels?` (per-node label override, e.g. instance
  subscripts `E0`, `T1`), `onnodeclick?`, `ariaLabel`. Scales to its container
  and scrolls inside its own box when very wide.
- `GrammarEditor.svelte` — `CodeEditor` for grammar text with a `→ | ε` palette,
  highlighting of non-terminals / terminals / metasymbols, and diagnostics.
- `TokenStream.svelte` — a token string with an input pointer (`↑` under the
  next token), consumed tokens muted, and optional highlight ranges.
- `DerivationChain.svelte` — sentential forms joined by `→`, with the replaced
  non-terminal and its replacement marked, wrapping across lines.

### 5.3 UI kit (`$lib/components/ui/`)

`Button`, `IconButton`, `Toggle`, `SegmentedControl`, `Tabs`, `Panel`,
`Callout`, `Badge`, `Kbd`, `Select`, `NumberField`, `TextField`,
`CodeEditor` (monospace textarea with line numbers and diagnostic markers),
`RegexField` (single-line RE input with ε/ɸ/Σ/|/*/+ palette, inline
diagnostics, and an optional `highlight` range), `StepControls` + `Stepper` class (`stepper.svelte.ts`),
`PresetMenu` (grouped presets with citations), `CitationTag`, `CharStream`
(input characters with visible whitespace and highlight ranges), `StringSetView`,
`TokenPairs` (token output in either lecture format), `CopyLinkButton`,
`ToolPage`, `Disclosure` (for slide questions' answers), `Updating` (a
delayed "Updating…" mark for results being recomputed) and the `WorkerTask`
class (§5.4).

### 5.4 Heavy work off the main thread

A computation that can take long enough to be felt while typing (building,
minimizing and comparing automata; enumerating languages; derivations; the
subset construction and its layouts) runs in a module Web Worker through
`WorkerTask` (`$lib/components/ui/worker-task.svelte.ts`). Parsing and
diagnostics stay on the page so they follow every keystroke.

```ts
// x.worker.ts: the worker's side
import { serveTask } from '$lib/components/ui/worker-protocol';
serveTask(computeViews); // (input) => output, pure; plain data in and out

// worker.ts (kept apart from the computation so the worker bundle does not include itself)
export const createWorker = () =>
	new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' });

// the page
const task = new WorkerTask<Input, Output>({
	compute: computeViews, // also the fallback on the main thread
	worker: createWorker, // called on the first run, from an effect: never while prerendering
	initial: untrack(() => request), // computed at once, so the prerendered page shows it
	timeLimit, // default 5000 ms
	key, // request identity (default JSON.stringify)
	onresult // (output, input) => void, untracked
});
$effect(() => task.run(request));
```

- `task.output` / `task.input` are the newest finished result and the input it
  was computed for; `task.status` is `'idle' | 'working' | 'timed-out' |
'error'` (`task.error` holds the message).
- The latest request wins: one request runs at a time and at most one waits
  (a newer one replaces it); answers to older requests are dropped by id. A
  running request that a newer one has replaced is abandoned once it has run
  `restartAfter` ms (default 300): the worker restarts with the waiting
  request, so the newest request never waits long behind older work.
- A request still running after `timeLimit` ms is abandoned (the worker is
  terminated and a new one starts with the next request); the page shows a
  `Callout` saying the input takes too long. The clock starts once the worker
  has loaded (it posts `READY`).
- Without a worker (prerendering, tests, a worker that fails to load) the
  computation runs synchronously on the main thread.
- Inputs and outputs are copied with the structured clone algorithm: send
  plain data, and use `theory/automata/serialize.ts` (or a tool's own plain
  types) for engine objects, reviving them on the page so rendering code keeps
  working on CharSets.
- Never show a result as current when it is for other inputs: compare
  `task.input` with the current request, mark stale views with the global
  `stale-data` class (dimmed after a short pause), `aria-busy` and
  `<Updating />`, and show a result that belongs to something else (another
  test string, another tree node) only if it is drawn with what it is for.
  A note shown instead of a result ("the DFA has more than 300 states") that
  came from an earlier result is marked stale the same way. A placeholder that
  is the only content while a result is computed ("Comparing…") is an
  `<Updating standalone />`, which screen readers read as a status.

## 6. Quality bar

- `npm run lint`, `npm run check`, `npm test`, `npm run build` all pass.
- Engine: unit tests for every exported function, including golden tests that
  reproduce the slide artifacts exactly.
- UI: works at 360 px wide and on desktop, in light and dark themes, with
  keyboard only. No console errors.
- Prerendering: every route must prerender (no `window` access at module top
  level; read the URL hash in `onMount`/`$effect`).
