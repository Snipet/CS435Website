/**
 * The action/goto table of an LR automaton (Bottom-up Parsing II, slides
 * 18–19), its conflicts (Bottom-up Parsing III, slides 16 and 23) and their
 * resolution by bison's precedence and associativity declarations (slide 19).
 *
 * action[i, t] is shift k, reduce X → α or accept; goto[i, A] = k. A state
 * that holds [X → α•aβ, b] and [Y → γ•, a] has a shift/reduce conflict on a;
 * one that holds [X → α•, a] and [Y → β•, a] has a reduce/reduce conflict
 * on a. Every conflict is kept with the two items involved and how it was
 * settled, and the table holds the action that won, so the driver can run
 * on it as bison's parser would.
 */
import type { Diagnostic } from '../diagnostics';
import { followSets } from './analyze';
import type { LrAutomaton, LrItem, Augmented } from './lr';
import { printProduction } from './lr';
import { printSymbols } from './parse';
import { END_MARKER, type Grammar } from './types';

export type Assoc = 'left' | 'right' | 'nonassoc';

/** One declaration line, `%left + -`: lines listed later bind tighter. */
export interface PrecedenceDeclaration {
	assoc: Assoc;
	terminals: string[];
}

export interface Precedence {
	/** The 1-based declaration line: a larger level binds tighter. */
	level: number;
	assoc: Assoc;
}

/**
 * The precedence of each declared terminal. A terminal declared again keeps
 * its first declaration. Warnings: a line without terminals, a non-terminal
 * or an unknown symbol in a declaration, a terminal declared twice.
 */
export function readPrecedence(
	g: Grammar,
	declarations: readonly PrecedenceDeclaration[]
): { terminals: Map<string, Precedence>; diagnostics: Diagnostic[] } {
	const terminals = new Map<string, Precedence & { line: number }>();
	const diagnostics: Diagnostic[] = [];
	const warn = (message: string) => diagnostics.push({ severity: 'warning', message });
	const isTerminal = new Set(g.terminals);
	const isNonterminal = new Set(g.nonterminals);
	declarations.forEach((d, i) => {
		const line = i + 1;
		if (d.terminals.length === 0) warn(`Line ${line} (%${d.assoc}) declares no terminal.`);
		for (const t of d.terminals) {
			const name = printSymbols([t]);
			const earlier = terminals.get(t);
			if (earlier) {
				if (earlier.line !== line)
					warn(
						`${name} is already declared on line ${earlier.line}; line ${line} does not change it.`
					);
				continue;
			}
			if (isNonterminal.has(t))
				warn(`${name} on line ${line} is a non-terminal: precedence is declared for terminals.`);
			else if (!isTerminal.has(t))
				warn(`${name} on line ${line} is not a terminal of the grammar.`);
			terminals.set(t, { level: line, assoc: d.assoc, line });
		}
	});
	return {
		terminals: new Map([...terminals].map(([t, { level, assoc }]) => [t, { level, assoc }])),
		diagnostics
	};
}

/**
 * The precedence of a rule: that of its last terminal (Bottom-up Parsing III,
 * slide 19). null when the rule has no terminal or its last terminal has no
 * declared precedence.
 */
export function rulePrecedence(
	g: Grammar,
	terminals: ReadonlyMap<string, Precedence>,
	production: number
): { terminal: string | null; precedence: Precedence | null } {
	const isNonterminal = new Set(g.nonterminals);
	const rhs = g.productions[production]?.rhs ?? [];
	for (let i = rhs.length - 1; i >= 0; i--)
		if (!isNonterminal.has(rhs[i]))
			return { terminal: rhs[i], precedence: terminals.get(rhs[i]) ?? null };
	return { terminal: null, precedence: null };
}

export type LrAction =
	| { kind: 'shift'; state: number }
	/** A production id of the grammar (the start production is never reduced: accept). */
	| { kind: 'reduce'; production: number }
	| { kind: 'accept' }
	/** An error entry made by %nonassoc (a blank entry is null). */
	| { kind: 'error' };

export interface LrResolution {
	/** What the table holds: the shift, the reduce, or an error entry (%nonassoc). */
	action: LrAction;
	/**
	 * 'precedence': the declarations settle it. 'default': nothing settles it,
	 * so it is reported and bison's default is taken (shift for shift/reduce,
	 * the earlier rule for reduce/reduce).
	 */
	by: 'precedence' | 'default';
	reason: string;
}

export interface LrConflict {
	state: number;
	terminal: string;
	kind: 'shift/reduce' | 'reduce/reduce';
	/** [X → α•aβ, b] and [Y → γ•, a]; or [X → α•, a] and [Y → β•, a] with X → α the earlier rule. */
	items: [LrItem, LrItem];
	/** The two actions in the entry, in the order of `items`. */
	actions: [LrAction, LrAction];
	resolution: LrResolution;
}

/**
 * How reduce lookaheads are chosen: 'lr1' from the items (LR(1), LALR(1));
 * 'slr1' Follow(X) for X → α•; 'lr0' every terminal. Only 'lr1' is in the
 * decks; the other two are for grammarClasses.
 */
export type LrMethod = 'lr0' | 'slr1' | 'lr1';

export interface LrTable {
	method: LrMethod;
	augmented: Augmented;
	/** Action columns: the terminals in grammar order, then `$`. */
	terminals: string[];
	/** Goto columns: the grammar's non-terminals (not the added start symbol). */
	nonterminals: string[];
	/** action[state][column]; null is a blank entry (error). */
	action: (LrAction | null)[][];
	/** goto[state][column]: the state, or null. */
	goto: (number | null)[][];
	/** Every conflict, by state, then column. */
	conflicts: LrConflict[];
	/** Conflicts that no declaration settled: the ones bison reports. */
	unresolved: number;
	diagnostics: Diagnostic[];
}

interface Candidate {
	action: LrAction;
	item: LrItem;
	/** Production id; the start production for accept. */
	production: number;
}

/**
 * The action/goto table of an automaton. `method` defaults to 'lr0' for an
 * LR(0) automaton and 'lr1' otherwise. `precedence` lists bison
 * declarations, lowest precedence first.
 *
 * A shift/reduce conflict on terminal t with rule X → α is resolved as
 * Bottom-up Parsing III, slide 19 says: shift when no precedence is declared
 * for the rule or for t (reported, bison's default), when t has higher
 * precedence than the rule, or when they are equal and %right; reduce when
 * the rule is higher, or they are equal and %left; equal and %nonassoc make
 * the entry an error. A reduce/reduce conflict is reported and the earlier
 * rule wins (accept counts as the earliest).
 */
export function lrTable(
	a: LrAutomaton,
	opts?: { method?: LrMethod; precedence?: readonly PrecedenceDeclaration[] }
): LrTable {
	const aug = a.augmented;
	const g = aug.grammar;
	const method = opts?.method ?? (a.kind === 'lr0' ? 'lr0' : 'lr1');
	if (method === 'lr1' && a.kind === 'lr0')
		throw new Error('lrTable: an LR(0) automaton has no lookaheads for the lr1 method');
	const terminals = [...g.terminals.filter((t) => t !== END_MARKER), END_MARKER];
	const nonterminals = [...g.nonterminals];
	const columnOf = new Map(terminals.map((t, i) => [t, i]));
	const gotoColumnOf = new Map(nonterminals.map((n, i) => [n, i]));
	const isNonterminal = new Set(nonterminals);
	const { terminals: precedence, diagnostics } = readPrecedence(g, opts?.precedence ?? []);
	const follow = method === 'slr1' ? followSets(g) : null;
	const show = (p: number): string => printProduction(aug.productions[p]);

	const resolveShiftReduce = (t: string, production: number): LrResolution => {
		const shift: LrAction = { kind: 'shift', state: -1 };
		const reduce: LrAction = { kind: 'reduce', production };
		const term = printSymbols([t]);
		const rule = show(production);
		const tp = precedence.get(t);
		const { terminal: last, precedence: rp } = rulePrecedence(g, precedence, production);
		if (!rp || !tp) {
			const ruleNote =
				last === null
					? `the rule ${rule} (it has no terminal)`
					: `the rule ${rule} (its last terminal is ${printSymbols([last])})`;
			const reason =
				!rp && !tp
					? `No precedence is declared for ${ruleNote} or for the terminal ${term}.`
					: !rp
						? `No precedence is declared for ${ruleNote}.`
						: `No precedence is declared for the terminal ${term}.`;
			return { action: shift, by: 'default', reason };
		}
		if (tp.level > rp.level)
			return {
				action: shift,
				by: 'precedence',
				reason: `The terminal ${term} has higher precedence than the rule ${rule}.`
			};
		if (rp.level > tp.level)
			return {
				action: reduce,
				by: 'precedence',
				reason: `The rule ${rule} has higher precedence than the terminal ${term}.`
			};
		const same = `The rule ${rule} and the terminal ${term} have the same precedence`;
		if (tp.assoc === 'left')
			return { action: reduce, by: 'precedence', reason: `${same} and are left associative.` };
		if (tp.assoc === 'right')
			return { action: shift, by: 'precedence', reason: `${same} and are right associative.` };
		return {
			action: { kind: 'error' },
			by: 'precedence',
			reason: `${same} and are non-associative: the entry is an error.`
		};
	};

	const action: (LrAction | null)[][] = [];
	const gotoTable: (number | null)[][] = [];
	const conflicts: LrConflict[] = [];
	for (const state of a.states) {
		const shifts = new Map<string, Candidate>();
		const reduces = new Map<string, Candidate[]>();
		const targetOf = new Map(state.transitions.map((t) => [t.symbol, t.to]));
		const gotoRow: (number | null)[] = nonterminals.map(() => null);
		for (const t of state.transitions)
			if (isNonterminal.has(t.symbol)) gotoRow[gotoColumnOf.get(t.symbol)!] = t.to;
		for (const item of state.items) {
			const p = aug.productions[item.production];
			const y = p.rhs[item.dot];
			if (y !== undefined) {
				if (isNonterminal.has(y)) continue;
				const to = targetOf.get(y);
				// The item a conflict names: the first with •y whose lookahead is y, else the first
				// with •y (Bottom-up Parsing III, slide 18 pairs [E → E * E •, +] with [E → E • + E, +]).
				const earlier = shifts.get(y);
				if (
					to !== undefined &&
					(!earlier || (earlier.item.lookahead !== y && item.lookahead === y))
				)
					shifts.set(y, { action: { kind: 'shift', state: to }, item, production: -1 });
				continue;
			}
			const accept = p.id === aug.production.id;
			const columns: Iterable<string> = accept
				? [END_MARKER]
				: method === 'lr1'
					? [item.lookahead!]
					: method === 'slr1'
						? follow!.get(p.lhs)!
						: terminals;
			for (const t of columns) {
				const list = reduces.get(t) ?? [];
				if (list.some((c) => c.production === p.id)) continue;
				list.push({
					action: accept ? { kind: 'accept' } : { kind: 'reduce', production: p.id },
					item,
					production: p.id
				});
				reduces.set(t, list);
			}
		}
		const row: (LrAction | null)[] = terminals.map(() => null);
		for (const t of terminals) {
			let shift = shifts.get(t) ?? null;
			// Accept first: it is the start rule, which bison numbers first.
			const list = (reduces.get(t) ?? []).sort((x, y) =>
				x.action.kind === 'accept'
					? -1
					: y.action.kind === 'accept'
						? 1
						: x.production - y.production
			);
			const removed = new Set<Candidate>();
			let errorEntry = false;
			for (const r of list) {
				if (!shift) break;
				const resolution = resolveShiftReduce(t, r.production);
				const settled = resolution.action.kind === 'shift' ? shift.action : resolution.action;
				conflicts.push({
					state: state.id,
					terminal: t,
					kind: 'shift/reduce',
					items: [shift.item, r.item],
					actions: [shift.action, r.action],
					resolution: { ...resolution, action: settled }
				});
				if (resolution.action.kind === 'shift') removed.add(r);
				else {
					shift = null;
					if (resolution.action.kind === 'error') {
						removed.add(r);
						errorEntry = true;
					}
				}
			}
			const left = list.filter((r) => !removed.has(r));
			for (const other of left.slice(1))
				conflicts.push({
					state: state.id,
					terminal: t,
					kind: 'reduce/reduce',
					items: [left[0].item, other.item],
					actions: [left[0].action, other.action],
					resolution: {
						action: left[0].action,
						by: 'default',
						reason: `${show(left[0].production)} is the earlier rule.`
					}
				});
			row[columnOf.get(t)!] = shift
				? shift.action
				: left.length > 0
					? left[0].action
					: errorEntry
						? { kind: 'error' }
						: null;
		}
		action.push(row);
		gotoTable.push(gotoRow);
	}
	return {
		method,
		augmented: aug,
		terminals,
		nonterminals,
		action,
		goto: gotoTable,
		conflicts,
		unresolved: conflicts.filter((c) => c.resolution.by === 'default').length,
		diagnostics: [...a.diagnostics, ...diagnostics]
	};
}

/**
 * A table entry. 'short' is the notation of Bottom-up Parsing II, slide 19
 * with the reduce subscript in parentheses: `s4`, `r(E → int)`, `accept`;
 * 'long' the words of slide 21: `shift 4`, `reduce E → int`.
 */
export function printAction(
	aug: Augmented,
	action: LrAction,
	opts?: { style?: 'short' | 'long' }
): string {
	const long = opts?.style === 'long';
	switch (action.kind) {
		case 'shift':
			return long ? `shift ${action.state}` : `s${action.state}`;
		case 'reduce': {
			const p = printProduction(aug.productions[action.production]);
			return long ? `reduce ${p}` : `r(${p})`;
		}
		case 'accept':
			return 'accept';
		case 'error':
			return 'error';
	}
}
