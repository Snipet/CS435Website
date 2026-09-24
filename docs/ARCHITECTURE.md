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
}
// Σ in a rule means any symbol of opts.alphabet; all three default to scannerAlphabet(rules).
function scannerAlphabet(rules: TokenRule[], extra?: CharSet): CharSet; // symbols the rules use ∪ extra
function scan(
	rules: TokenRule[],
	input: string,
	opts?: { errorRule?: boolean; alphabet?: CharSet }
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

### 5.1a Cross-tool links

`$lib/tools/links.ts` lists the state each tool accepts in its URL hash
(`LinkStates`). Build a link with `toolLink('thompson', { re, defs })`; it
returns `null` when the target tool is not registered, so hide the link in that
case (prerendering fails on links to pages that do not exist). A tool's own
saved state must accept its `LinkStates` shape (extra fields are allowed).

### 5.2 Graph components (`$lib/components/graph/`)

- `AutomatonView.svelte` — SVG renderer following §3.5. Props: `automaton`,
  `positions?` (pinned; otherwise automatic left-to-right layout),
  `highlight?: { active?, taken?, dim?, dimTransitions?, tone? }` (`taken` and
  `dimTransitions` hold transition ids; `tone` maps a state to `'accept'`,
  `'reject'` or `'info'`), `groups?: { id, label?, states, tone? }[]`
  (fragment outlines, partition blocks; `tone` is a palette index 0–5),
  `names?: NamedSet[]` for labels, `editable?`, `selected?` (bindable:
  `{ kind: 'state', id } | { kind: 'edge', key } | null`), callbacks
  `onchange(automaton, positions)`, `onstateclick(id)`,
  `ontransitionclick(transitionIds, edgeKey)`, plus `height` (px or `'auto'`),
  `ariaLabel`, `startLabel` (text on the start arrow, e.g. `start`) and
  `viewKey?`, and `frame?` (a box that "fit" always shows, e.g. the finished
  machine's bounds while a construction grows on pinned positions). Supports
  pan/zoom (arrow keys pan from the drawing or the zoom buttons) and "fit";
  `fit()` is also a component export (`bind:this`).
  Passing a machine the view did not just report through `onchange` (compared
  by object, then by `layoutKey`) refits the view, clears the selection and
  drops a drag or label edit in progress; an echo of its own edit, with or
  without the positions, keeps the view. With `viewKey` set, only a change of
  `viewKey` refits (a stepper passes a constant key to keep the user's zoom).
  Types are in `graph/types.ts`.
- `TransitionTable.svelte` — table per §3.7: `automaton`, `classes?` (used as
  given), `names?`, `highlight?: { state?, cell?: { state, column } }` (the ε
  column comes last), `onCellClick?(state, column, symbols)` (`symbols` is null
  for ε), `compact?`, `caption?` (visually hidden). Default columns come from
  `tableColumns` in `table.ts`: classes of Σ and every label, one per symbol
  when there are at most 16 symbols, and a class only reached through
  `display` labels headed by that text (`other`) and listed last.
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
