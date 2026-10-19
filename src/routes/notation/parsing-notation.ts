/**
 * Examples for the "LL(1) and bottom-up parsing" sections of the notation
 * page, from Table-based Predictive Parsing and the three bottom-up decks.
 * Tables, traces and item sets are written out by hand; the spec checks them
 * against the grammar engine and against a small LR(1) construction.
 */
import { joinSymbols, symbolSeparators, type ItemView } from '$lib/components/grammar';

// ─────────────────────────── LL(1) (Table-based Predictive Parsing) ───────────────────────────

/** The left-factored expression grammar as slides 8–9 box it. */
export const ll1Grammar = `E → T X
X → + E | ε
T → ( E ) | int Y
Y → * T | ε`;

/** Columns of the LL(1) table: the terminals in the slide's order, then $. */
export const ll1Columns = ['int', '*', '+', '(', ')', '$'] as const;

export interface Ll1Row {
	nonterminal: string;
	/** Right-hand side per column (`[]` for ε); a missing column is a blank cell. */
	cells: Partial<Record<(typeof ll1Columns)[number], string[]>>;
}

/** Slides 7–9, 12 and 25, with the rows in the slide's order T, E, X, Y. */
export const ll1Table: Ll1Row[] = [
	{ nonterminal: 'T', cells: { int: ['int', 'Y'], '(': ['(', 'E', ')'] } },
	{ nonterminal: 'E', cells: { int: ['T', 'X'], '(': ['T', 'X'] } },
	{ nonterminal: 'X', cells: { '+': ['+', 'E'], ')': [], $: [] } },
	{ nonterminal: 'Y', cells: { '*': ['*', 'T'], '+': [], ')': [], $: [] } }
];

/** First and Follow of the non-terminals of `ll1Grammar`, in the order slides 21 and 23 ask for them. */
export const ll1Sets: { nonterminal: string; first: string[]; follow: string[] }[] = [
	{ nonterminal: 'E', first: ['(', 'int'], follow: [')', '$'] },
	{ nonterminal: 'T', first: ['(', 'int'], follow: ['+', ')', '$'] },
	{ nonterminal: 'X', first: ['+', 'ε'], follow: [')', '$'] },
	{ nonterminal: 'Y', first: ['*', 'ε'], follow: ['+', ')', '$'] }
];

export interface Ll1TraceRow {
	/** Top of the stack first, $ at the bottom (last). */
	stack: string[];
	/** The input still to read, ending with $. */
	input: string[];
	/** The right-hand side pushed (`T X`), `terminal`, `ε` or `ACCEPT`. */
	action: string;
}

/** Slide 12: int * int $ with the table above, word for word. */
export const ll1Trace: Ll1TraceRow[] = [
	{ stack: ['E', '$'], input: ['int', '*', 'int', '$'], action: 'T X' },
	{ stack: ['T', 'X', '$'], input: ['int', '*', 'int', '$'], action: 'int Y' },
	{ stack: ['int', 'Y', 'X', '$'], input: ['int', '*', 'int', '$'], action: 'terminal' },
	{ stack: ['Y', 'X', '$'], input: ['*', 'int', '$'], action: '* T' },
	{ stack: ['*', 'T', 'X', '$'], input: ['*', 'int', '$'], action: 'terminal' },
	{ stack: ['T', 'X', '$'], input: ['int', '$'], action: 'int Y' },
	{ stack: ['int', 'Y', 'X', '$'], input: ['int', '$'], action: 'terminal' },
	{ stack: ['Y', 'X', '$'], input: ['$'], action: 'ε' },
	{ stack: ['X', '$'], input: ['$'], action: 'ε' },
	{ stack: ['$'], input: ['$'], action: 'ACCEPT' }
];

/** Slide 11: the table-driven LL(1) parser, as the slide writes it. */
export const ll1Algorithm = `// Assume table already created
initialize stack = < S $ > and next

repeat
  case stack of
    <N, rest> : if T[N,*next] == Y1 … Yn
                  then stack ← < Y1 … Yn rest >;
                  else error ();
    <t, rest> : if t == *next ++
                  then stack ← < rest >;
                  else error ();
until stack == < >`;

// ─────────────────────────── Handles (Bottom-Up Parsing) ───────────────────────────

/** Bottom-Up Parsing, slide 3. */
export const bottomUpGrammar = 'E → E + ( E ) | int';

/** A piece of a written form; `mark` pieces are drawn in the color of what they stand for. */
export interface FormPiece {
	text: string;
	mark?: boolean;
}

/**
 * Symbols joined as the bottom-up decks write sentential forms
 * (`E + (int) + (int)`), with the symbols in [from, to) as one marked piece.
 */
export function formPieces(symbols: readonly string[], from = 0, to = from): FormPiece[] {
	const seps = symbolSeparators(symbols, 'hug');
	const pieces: FormPiece[] = [];
	const add = (text: string, mark: boolean) => {
		if (!text) return;
		const last = pieces[pieces.length - 1];
		if (last && !!last.mark === mark) last.text += text;
		else pieces.push(mark ? { text, mark } : { text });
	};
	symbols.forEach((s, i) => {
		const inside = i >= from && i < to;
		// The space before the first marked symbol is not marked.
		add(seps[i], inside && i > from);
		add(s, inside);
	});
	return pieces;
}

export interface HandleRow {
	form: string[];
	/** [start, end) of the handle in `form`; null for the start symbol. */
	handle: [number, number] | null;
}

/**
 * int + (int) under E → E + ( E ) | int, reduced as on slides 5–10: each form
 * with its handle, down to E. Read upward, a rightmost derivation.
 */
export const handleRows: HandleRow[] = [
	{ form: ['int', '+', '(', 'int', ')'], handle: [0, 1] },
	{ form: ['E', '+', '(', 'int', ')'], handle: [3, 4] },
	{ form: ['E', '+', '(', 'E', ')'], handle: [0, 5] },
	{ form: ['E'], handle: null }
];

// ─────────────────────────── Shift-reduce (Bottom-up Parsing II) ───────────────────────────

export interface ShiftReduceRow {
	/** Left of the divider. */
	stack: string[];
	/** Right of the divider, without the closing $. */
	input: string[];
	action: string;
	/** How many symbols the action works on: the last of `stack` (reduce) or the first of `input` (shift). */
	next: number;
}

/** Slide 14: int + (int) + (int)$, row for row. */
export const shiftReduceTrace: ShiftReduceRow[] = [
	{
		stack: [],
		input: ['int', '+', '(', 'int', ')', '+', '(', 'int', ')'],
		action: 'shift',
		next: 1
	},
	{
		stack: ['int'],
		input: ['+', '(', 'int', ')', '+', '(', 'int', ')'],
		action: 'red. E → int',
		next: 1
	},
	{
		stack: ['E'],
		input: ['+', '(', 'int', ')', '+', '(', 'int', ')'],
		action: 'shift 3 times',
		next: 3
	},
	{
		stack: ['E', '+', '(', 'int'],
		input: [')', '+', '(', 'int', ')'],
		action: 'red. E → int',
		next: 1
	},
	{ stack: ['E', '+', '(', 'E'], input: [')', '+', '(', 'int', ')'], action: 'shift', next: 1 },
	{
		stack: ['E', '+', '(', 'E', ')'],
		input: ['+', '(', 'int', ')'],
		action: 'red. E → E + (E)',
		next: 5
	},
	{ stack: ['E'], input: ['+', '(', 'int', ')'], action: 'shift 3 times', next: 3 },
	{ stack: ['E', '+', '(', 'int'], input: [')'], action: 'red. E → int', next: 1 },
	{ stack: ['E', '+', '(', 'E'], input: [')'], action: 'shift', next: 1 },
	{ stack: ['E', '+', '(', 'E', ')'], input: [], action: 'red. E → E + (E)', next: 5 },
	{ stack: ['E'], input: [], action: 'accept', next: 0 }
];

/** int + (int) at E + (int I )$, the configuration `shiftReduceForest` draws (a reduce by E → int is next). */
export const shiftReduceForestRow: ShiftReduceRow = {
	stack: ['E', '+', '(', 'int'],
	input: [')'],
	action: 'red. E → int',
	next: 1
};

/** The two sides of a configuration as pieces, the symbols of the next action marked. */
export function configurationPieces(row: ShiftReduceRow): {
	left: FormPiece[];
	right: FormPiece[];
} {
	const reduce = row.action.startsWith('red.');
	const left = reduce
		? formPieces(row.stack, row.stack.length - row.next, row.stack.length)
		: formPieces(row.stack);
	const right = reduce ? formPieces(row.input) : formPieces(row.input, 0, row.next);
	// The decks write the end marker right after the input: `(int)$`, and `E I $` when it is all that is left.
	right.push({ text: '$' });
	return { left, right };
}

/** The configuration as text with the divider: `E + (int I ) + (int)$`. */
export function configurationText(row: ShiftReduceRow): string {
	const { left, right } = configurationPieces(row);
	const text = (pieces: FormPiece[]) => pieces.map((p) => p.text).join('');
	return [text(left), 'I', text(right)].filter(Boolean).join(' ');
}

/** Slide 21: the LR parsing algorithm, as the slide writes it. */
export const lrAlgorithm = `Let I = w $
Let j = 0
Let DFA state 0 be the start state
Let stack = < dummy, 0 >
  repeat
    case action[top_state(stack), I[j]] of
      shift k: push < I[j++], k >
      reduce X → α:
        pop |α| pairs,
        push < X, Goto[top_state(stack), X] >
      accept: halt normally
      error: halt and report error`;

// ─────────────────────────── LR(1) items (Bottom-up Parsing III) ───────────────────────────

/** Bottom-up Parsing III, slide 14: S → E, E → E+(E) | int. */
export const lrGrammar = `S → E
E → E + ( E ) | int`;

/** An item from its right side, written with • where the dot is: `lrItem('E', 'E + • ( E )', '$', '+')`. */
export function lrItem(lhs: string, rhs: string, ...lookaheads: string[]): ItemView {
	const symbols = rhs.split(' ').filter(Boolean);
	const dot = symbols.indexOf('•');
	if (dot < 0) throw new Error(`no dot in ${rhs}`);
	symbols.splice(dot, 1);
	return { lhs, rhs: symbols, dot, lookaheads };
}

/** States 0–6 as slide 14 draws them (the slide stops with "and so on…"). */
export const lrStates: { number: number; items: ItemView[] }[] = [
	{
		number: 0,
		items: [
			lrItem('S', '• E', '$'),
			lrItem('E', '• E + ( E )', '$', '+'),
			lrItem('E', '• int', '$', '+')
		]
	},
	{ number: 1, items: [lrItem('E', 'int •', '$', '+')] },
	{ number: 2, items: [lrItem('S', 'E •', '$'), lrItem('E', 'E • + ( E )', '$', '+')] },
	{ number: 3, items: [lrItem('E', 'E + • ( E )', '$', '+')] },
	{
		number: 4,
		items: [
			lrItem('E', 'E + ( • E )', '$', '+'),
			lrItem('E', '• E + ( E )', ')', '+'),
			lrItem('E', '• int', ')', '+')
		]
	},
	{ number: 5, items: [lrItem('E', 'int •', ')', '+')] },
	{ number: 6, items: [lrItem('E', 'E + ( E • )', '$', '+'), lrItem('E', 'E • + ( E )', ')', '+')] }
];

/** The edges slide 14 draws between states 0–6. */
export const lrEdges: [from: number, symbol: string, to: number][] = [
	[0, 'int', 1],
	[0, 'E', 2],
	[2, '+', 3],
	[3, '(', 4],
	[4, 'int', 5],
	[4, 'E', 6]
];

/** Slide 10. */
export const closureCode = `Closure(Items) =
  repeat
    for each [X → α•Yβ, a] in Items
      for each production Y → γ
        for each b ∈ First(βa)
          add [Y → •γ, b] to Items
  until Items is unchanged`;

/** Slide 13. */
export const transitionCode = `Transition (state, y)
  Items ← ∅
  for each [X → α•yβ, b] ∈ state
    add [X → αy•β, b] to Items
  return Closure(Items)`;

// ─────────────────────────── LR tables (Bottom-up Parsing II) ───────────────────────────

export type LrCell =
	| { kind: 'shift'; state: number }
	| { kind: 'goto'; state: number }
	| { kind: 'reduce'; lhs: string; rhs: string[] }
	| { kind: 'accept' };

/** Columns of the table of E → E + ( E ) | int: the action part, then the goto part. */
export const lrTerminals = ['int', '+', '(', ')', '$'] as const;
export const lrNonterminals = ['E'] as const;

const reduceInt: LrCell = { kind: 'reduce', lhs: 'E', rhs: ['int'] };
const reducePlus: LrCell = { kind: 'reduce', lhs: 'E', rhs: ['E', '+', '(', 'E', ')'] };

/**
 * Slide 19: rows 3–7 of the table ("a fragment of our DFA"). The slide prints
 * row 6's s8 and s7 one column to the left; per the DFA of slide 17 they are
 * under + and ).
 */
export const lrTableRows: { state: number; cells: Record<string, LrCell> }[] = [
	{ state: 3, cells: { '(': { kind: 'shift', state: 4 } } },
	{ state: 4, cells: { int: { kind: 'shift', state: 5 }, E: { kind: 'goto', state: 6 } } },
	{ state: 5, cells: { '+': reduceInt, ')': reduceInt } },
	{ state: 6, cells: { '+': { kind: 'shift', state: 8 }, ')': { kind: 'shift', state: 7 } } },
	{ state: 7, cells: { '+': reducePlus, $: reducePlus } }
];

/** `s4`, `g6`, `accept`; for a reduction, `r` and the production it reduces by (drawn as a subscript). */
export function cellCode(cell: LrCell): { code: string; production?: string } {
	if (cell.kind === 'shift') return { code: `s${cell.state}` };
	if (cell.kind === 'goto') return { code: `g${cell.state}` };
	if (cell.kind === 'accept') return { code: 'accept' };
	return { code: 'r', production: `${cell.lhs}→${joinSymbols(cell.rhs, 'compact')}` };
}

// ─────────────────────────── Conflicts and precedence (Bottom-up Parsing III) ───────────────────────────

export interface ConflictExample {
	slide: number;
	grammar: string;
	/** Part of a state and part of the state it goes to on `symbol`. */
	from: ItemView[];
	symbol: string;
	to: ItemView[];
	/** The slide leaves items out of both states (writes …). */
	partial: boolean;
	/** The conflict, as the slide states it. */
	conflict: string;
}

export const conflictExamples: ConflictExample[] = [
	{
		slide: 18,
		grammar: 'E → E + E | E * E | int',
		from: [lrItem('E', 'E * • E', '+'), lrItem('E', '• E + E', '+')],
		symbol: 'E',
		to: [lrItem('E', 'E * E •', '+'), lrItem('E', 'E • + E', '+')],
		partial: true,
		conflict: 'shift/reduce on input +'
	},
	{
		slide: 25,
		grammar: 'S → ε | id | id S',
		from: [
			lrItem('S’', '• S', '$'),
			lrItem('S', '•', '$'),
			lrItem('S', '• id', '$'),
			lrItem('S', '• id S', '$')
		],
		symbol: 'id',
		to: [
			lrItem('S', 'id •', '$'),
			lrItem('S', 'id • S', '$'),
			lrItem('S', '•', '$'),
			lrItem('S', '• id', '$'),
			lrItem('S', '• id S', '$')
		],
		partial: false,
		conflict: 'reduce/reduce on input $'
	}
];

/** Bottom-up Parsing III, slide 19, as bison reads it. */
export const bisonDeclarations = `%left '+'
%left '*'`;

/** Slide 19: when bison resolves a shift/reduce conflict with a shift. */
export const shiftRules = [
	'no precedence declared for either rule or terminal',
	'input terminal has higher precedence than the rule',
	'the precedences are the same and right associative'
];

/** Text of a form or a stack for screen readers and tests. */
export const formText = (symbols: readonly string[]) => joinSymbols(symbols, 'hug');
