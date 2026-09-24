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
    <slug>/+page.svelte       one route per tool
docs/ARCHITECTURE.md          this file
```

A tool owns `src/routes/<slug>/`, `src/lib/tools/catalog/<slug>.ts`, and (if
needed) `src/lib/tools/<slug>/` for tool-specific components, presets and
logic. Tools never edit each other's folders. Anything two tools need goes into
`theory/` or `components/`.

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

### 3.3 Flex dialect (Scanning with Flex)

Full flex pattern syntax: `x`, `\.`, `"string"`, `.` (any char but `\n`), `^`,
`$`, `[xyz]`, `[^xyz]`, `[a-z]`, `r*`, `r+`, `r?`, `r{n}`, `r{n,}`, `r{n,m}`,
`r1r2`, `r1|r2`, `(r)`, `r1/r2` (trailing context), `{NAME}`. Definitions are
`NAME pattern` lines in the definitions section. The slide prints trailing
context as `r1 \ r2`; the site uses real flex syntax `r1/r2` and the notation
page notes the difference.

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
| Thompson NFA  | Letters `A, B, C, …` by final layout column, then top to bottom (reproduces the `(1                                                                                                                          | 0)*1`NFA A–J). After`Z`: `AA, AB, …`. |
| Subset DFA    | Concatenated NFA names in discovery order (`ABCDHI`, `FGABCDHI`, `EJGABCDHI`). Falls back to `{AA, B}` set notation when any NFA name has more than one character. Alternatives: sorted set, or `D0, D1, …`. |
| Empty subset  | `∅`; omitted by default (trap convention) with an option to show it.                                                                                                                                         |
| Minimized DFA | The first member's name; `State.merged` lists all members.                                                                                                                                                   |
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
	opts?: { defs?: ReadonlyMap<string, Regex>; source?: string | null }
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
	entries: DefinitionEntry[];
	diagnostics: Diagnostic[];
}
function parseDefinitions(text: string): DefinitionsResult; // lines "name = RE"

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
	opts?: { defs?: ReadonlyMap<string, Regex> }
): FlexParseResult;
function parseFlexDefinitions(
	lines: { name: string; text: string; line: number }[]
): DefinitionsResult;

// print.ts
function printRegex(
	r: Regex,
	opts?: { dialect?: 'lecture' | 'flex'; expandRefs?: boolean; parens?: 'minimal' | 'full' }
): string;

// analyze.ts
function nullable(r: Regex): boolean;
function symbolsOf(r: Regex): CharSet; // union of every chars node (refs expanded)
function containsAny(r: Regex): boolean; // uses Σ
function resolveAny(r: Regex, alphabet: CharSet): Regex;
function refsIn(r: Regex): string[];
function walk(r: Regex, visit: (node: Regex, path: number[], depth: number) => void): void;
function nodeAtPath(r: Regex, path: number[]): Regex | undefined;
```

### 4.3 Automata (`theory/automata/`)

```ts
// types.ts — Automaton, State, Transition, AcceptInfo, Positions (see file)

// core.ts
function alphabetOf(a): CharSet; // declared Σ or union of labels
function symbolClasses(a, extra?: CharSet[]): CharSet[]; // disjoint classes covering every label (ascending)
function outgoing(a, s): Transition[];
function incoming(a, s): Transition[];
function letterName(i: number): string; // 0→A … 25→Z, 26→AA …
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
function parseAutomatonText(text: string): {
	automaton: Automaton | null;
	diagnostics: Diagnostic[];
};
function formatAutomatonText(a): string;
// Text format:  "start: A" / "accept: B C" / "A 0,1 B" / "A ε B" / "A 'x' B" / "A [a-z] B"; "#" comments.

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
): { targets: StateId[]; via: number[] };

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

// minimize.ts
interface MinimizeRound {
	blocks: StateId[][];
	splits: { block: StateId[]; parts: StateId[][]; symbol: CharSet; witness: string }[];
}
interface MinimizeResult {
	dfa: Automaton;
	rounds: MinimizeRound[];
	blockOf: Map<StateId, number>;
	input: Automaton /* total, trimmed machine that was partitioned */;
	trap: StateId | null;
	removed: StateId[];
}
function minimize(dfa, opts?: { splitByToken?: boolean }): MinimizeResult;
function distinguish(
	dfa,
	p: StateId,
	q: StateId
): { equivalent: true } | { equivalent: false; witness: string; accepts: StateId };

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
}
function scan(rules: TokenRule[], input: string, opts?: { errorRule?: boolean }): ScanResult;
function scannerNfa(rules: TokenRule[]): { nfa: Automaton; starts: StateId[] };
function scannerDfa(rules: TokenRule[], opts?: { minimal?: boolean }): Automaton; // accept tags carry the token
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
```

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

### 5.2 Graph components (`$lib/components/graph/`)

- `AutomatonView.svelte` — SVG renderer following §3.5. Props: `automaton`,
  `positions?` (pinned; otherwise automatic left-to-right layout),
  `highlight?: { active?, taken?, dim?, dimTransitions?, tone? }`,
  `groups?: { id, label, states, tone? }[]` (fragment outlines, partition
  blocks), `names?: NamedSet[]` for labels, `editable?`, `selected?` (bindable),
  callbacks `onchange`, `onstateclick`, `ontransitionclick`, plus `height`,
  `ariaLabel`. Supports pan/zoom and "fit".
- `TransitionTable.svelte` — table per §3.7 with row/cell highlight and click
  callbacks.
- `layout.ts` — pure layout (`layoutAutomaton`) returning node positions and
  edge geometry; unit-tested.

### 5.3 UI kit (`$lib/components/ui/`)

`Button`, `IconButton`, `Toggle`, `SegmentedControl`, `Tabs`, `Panel`,
`Callout`, `Badge`, `Kbd`, `Select`, `NumberField`, `TextField`,
`CodeEditor` (monospace textarea with line numbers and diagnostic markers),
`RegexField` (single-line RE input with ε/ɸ/Σ/|/*/+ palette and inline
diagnostics), `StepControls` + `Stepper` class (`stepper.svelte.ts`),
`PresetMenu` (grouped presets with citations), `CitationTag`, `CharStream`
(input characters with visible whitespace and highlight ranges), `StringSetView`,
`TokenPairs` (token output in either lecture format), `CopyLinkButton`,
`ToolPage`, `Disclosure` (for slide questions' answers).

## 6. Quality bar

- `npm run lint`, `npm run check`, `npm test`, `npm run build` all pass.
- Engine: unit tests for every exported function, including golden tests that
  reproduce the slide artifacts exactly.
- UI: works at 360 px wide and on desktop, in light and dark themes, with
  keyboard only. No console errors.
- Prerendering: every route must prerender (no `window` access at module top
  level; read the URL hash in `onMount`/`$effect`).
