/**
 * The report `bison –v Parser.yy -o Parser.cc` writes to Parser.output
 * (Bottom-up Parsing III, slide 28), for the grammar and declarations of this
 * tool: rules useless in the parser, the states with conflicts, the grammar
 * with its rules numbered from 0 (`$accept: exp $end`), the terminals and
 * non-terminals, and every state with its items and actions (the reductions
 * of an unresolved conflict that lose in brackets), in bison 3.8's layout.
 * The conflicts precedence settles are not listed: `-v` is
 * `--report=state`, and bison writes those under `--report=solved`.
 *
 * bison builds the LALR(1) automaton, not the canonical LR(1) automaton of
 * the decks: the states are those of lalr1Automaton, renumbered as bison
 * numbers them. Its start rule ends with `$end`, which bison shifts into one
 * more state that accepts. The report is for the bison file that declares the
 * terminals that are not single characters with %token (in grammar order),
 * then the precedence lines, then the rules in grammar order: bison numbers
 * symbols, and so states, in the order they are declared.
 *
 * How bison settles conflicts follows its conflicts.c: rule by rule, then
 * token by token, a declared precedence removes the shift or the reduce
 * (both, and records an error, for %nonassoc); then every state takes as its
 * default reduction the rule that most tokens reduce by.
 */
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import {
	readPrecedence,
	rulePrecedence,
	type PrecedenceDeclaration
} from '$lib/theory/grammar/lr-table';
import { END_MARKER } from '$lib/theory/grammar/types';
import { bisonSymbol } from './precedence';

export interface BisonState {
	/** bison's number. */
	number: number;
	/** The LALR(1) state (lalr1Automaton) it is; null for the state bison adds that accepts after $end. */
	lalr: number | null;
	/** The LR(1) states merged into it. */
	merged: number[];
	/** Its block of the report, from `State N` on. */
	lines: string[];
	/** Conflicts bison reports for it. */
	sr: number;
	rr: number;
	/**
	 * Its parser actions by terminal (grammar names, `$` for $end) before
	 * bison folds the commonest reduction into `$default`.
	 */
	actions: Record<string, BisonAction>;
	/** The rule of `$default`, if any (0: accept). */
	defaultRule: number | null;
}

/** An action of bison's table: shift to a state, reduce by a rule (0 accepts), or an error. */
export type BisonAction =
	{ kind: 'shift'; to: number } | { kind: 'reduce'; rule: number } | { kind: 'error' };

export interface BisonReport {
	/** The sections before the states, each with its title line first. */
	head: { title: string; lines: string[] }[];
	states: BisonState[];
	/** bison's number of each LALR(1) state. */
	numberOf: number[];
	/** Conflicts bison reports. */
	sr: number;
	rr: number;
	/** What bison prints when it runs on the file. */
	messages: string[];
	/** The whole of Parser.output. */
	text: string;
	/** bison's name of each terminal and non-terminal: '+', INT, "==", $end, $accept. */
	names: Record<string, string>;
}

interface Node {
	lalr: number | null;
	merged: number[];
	/** Kernel items as (bison rule, dot), sorted. */
	kernel: [number, number][];
	shifts: { symbol: string; to: number; enabled: boolean }[];
	gotos: { symbol: string; to: number }[];
	/** Reductions in rule order, with the tokens they reduce on. */
	reds: { rule: number; lookaheads: Set<string> }[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Parser.output for an LALR(1) automaton and the precedence declarations, lowest first. */
export function bisonReport(
	lalr: LrAutomaton,
	declarations: readonly PrecedenceDeclaration[],
	opts?: { file?: string }
): BisonReport {
	const file = opts?.file ?? 'Parser.yy';
	const aug = lalr.augmented;
	const g = aug.grammar;
	const { terminals: precedence } = readPrecedence(g, declarations);

	// ───────── names and numbers ─────────
	const names: Record<string, string> = {};
	const terminals = g.terminals.filter((t) => t !== END_MARKER);
	for (const t of terminals) names[t] = bisonSymbol(t);
	for (const n of g.nonterminals) names[n] = n;
	names[END_MARKER] = '$end';
	names[aug.start] = '$accept';
	const tag = (s: string) => names[s] ?? s;
	const isChar = (t: string) => names[t].startsWith("'");
	const declared = [
		...new Set(declarations.flatMap((d) => d.terminals).filter((t) => terminals.includes(t)))
	];
	const user = [
		...terminals.filter((t) => !isChar(t) && !declared.includes(t)),
		...declared,
		...terminals.filter((t) => isChar(t) && !declared.includes(t))
	];
	/** Tokens in bison's symbol order: $end, error and $undefined are 0, 1 and 2. */
	const tokens = [END_MARKER, ...user];
	const number = new Map<string, number>([[END_MARKER, 0]]);
	user.forEach((t, i) => number.set(t, 3 + i));
	const ntokens = 3 + user.length;
	number.set(aug.start, ntokens);
	g.nonterminals.forEach((n, i) => number.set(n, ntokens + 1 + i));
	const symbolOrder = (a: { symbol: string }, b: { symbol: string }) =>
		number.get(a.symbol)! - number.get(b.symbol)!;

	// Rule 0 is $accept: S $end; rule r is the grammar's production r − 1.
	const ruleCount = g.productions.length + 1;
	const ruleOf = (production: number) => (production === aug.production.id ? 0 : production + 1);
	const lhsOf = (r: number) => (r === 0 ? aug.start : g.productions[r - 1].lhs);
	const rhsOf = (r: number) => (r === 0 ? [g.start, END_MARKER] : g.productions[r - 1].rhs);

	// ───────── states ─────────
	const FINAL = lalr.states.length;
	const isNonterminal = new Set(g.nonterminals);
	const nodes: Node[] = lalr.states.map((s) => {
		const cores = new Map<string, [number, number]>();
		for (const item of s.items.slice(0, s.kernel)) {
			const core: [number, number] = [ruleOf(item.production), item.dot];
			cores.set(core.join(','), core);
		}
		const shifts = s.transitions
			.filter((t) => !isNonterminal.has(t.symbol))
			.map((t) => ({ ...t, enabled: true }));
		if (s.accept) shifts.push({ symbol: END_MARKER, to: FINAL, enabled: true });
		const reds = new Map<number, Set<string>>();
		for (const item of s.items) {
			const p = aug.productions[item.production];
			if (item.dot !== p.rhs.length || p.id === aug.production.id) continue;
			const r = ruleOf(p.id);
			if (!reds.has(r)) reds.set(r, new Set());
			if (item.lookahead !== null) reds.get(r)!.add(item.lookahead);
		}
		return {
			lalr: s.id,
			merged: s.merged ?? [s.id],
			kernel: [...cores.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
			shifts: shifts.sort(symbolOrder),
			gotos: s.transitions.filter((t) => isNonterminal.has(t.symbol)).sort(symbolOrder),
			reds: [...reds]
				.sort((a, b) => a[0] - b[0])
				.map(([rule, lookaheads]) => ({ rule, lookaheads }))
		};
	});
	nodes.push({
		lalr: null,
		merged: [],
		kernel: [[0, 2]],
		shifts: [],
		gotos: [],
		reds: [{ rule: 0, lookaheads: new Set() }]
	});

	// bison numbers states as it makes them: breadth first, each state's transitions in symbol order.
	const numberOf = nodes.map(() => -1);
	numberOf[0] = 0;
	const queue = [0];
	for (let q = 0; q < queue.length; q++) {
		const node = nodes[queue[q]];
		for (const t of [...node.shifts, ...node.gotos].sort(symbolOrder))
			if (numberOf[t.to] < 0) {
				numberOf[t.to] = queue.length;
				queue.push(t.to);
			}
	}

	// ───────── conflicts, as conflicts.c settles them ─────────
	const used = new Set<number>([0]);
	const blocks = queue.map((id) => {
		const node = nodes[id];
		const shiftSet = new Set(node.shifts.map((s) => s.symbol));
		const consistent = !(node.reds.length > 1 || (node.reds.length === 1 && shiftSet.size > 0));
		const errs: string[] = [];
		const reds = node.reds.map((r) => ({ rule: r.rule, lookaheads: new Set(r.lookaheads) }));
		const shifts = node.shifts.map((s) => ({ ...s }));
		const flushShift = (t: string) => {
			shiftSet.delete(t);
			for (const s of shifts) if (s.symbol === t) s.enabled = false;
		};
		// A conflict settled here is not in the report: `bison -v` (--report=state) leaves the
		// "Conflict between rule … resolved as …" lines to --report=solved.
		if (!consistent) {
			for (const red of reds) {
				if (red.rule === 0) continue;
				const { precedence: rp } = rulePrecedence(g, precedence, red.rule - 1);
				if (!rp) continue;
				if (![...red.lookaheads].some((t) => shiftSet.has(t))) continue;
				for (const t of tokens) {
					if (!red.lookaheads.has(t) || !shiftSet.has(t)) continue;
					const tp = precedence.get(t);
					if (!tp) continue;
					if (tp.level < rp.level) flushShift(t);
					else if (tp.level > rp.level || tp.assoc === 'right') red.lookaheads.delete(t);
					else if (tp.assoc === 'left') flushShift(t);
					else {
						flushShift(t);
						red.lookaheads.delete(t);
						errs.push(t);
					}
				}
			}
		}
		// The actions (tables.c): the first rule of a token, then the shift, then %nonassoc errors.
		const act = new Map<string, BisonAction>();
		if (!consistent)
			for (const red of [...reds].reverse())
				for (const t of red.lookaheads) act.set(t, { kind: 'reduce', rule: red.rule });
		for (const s of shifts) if (s.enabled) act.set(s.symbol, { kind: 'shift', to: s.to });
		for (const t of errs) act.set(t, { kind: 'error' });
		let defaultRule: number | null = null;
		if (reds.length > 0) {
			if (consistent) defaultRule = reds[0].rule;
			else {
				let max = 0;
				for (const red of reds) {
					let count = 0;
					for (const a of act.values()) if (a.kind === 'reduce' && a.rule === red.rule) count++;
					if (count > max) {
						max = count;
						defaultRule = red.rule;
					}
				}
			}
		}
		for (const a of act.values()) if (a.kind === 'reduce') used.add(a.rule);
		if (defaultRule !== null) used.add(defaultRule);
		let sr = 0;
		let rr = 0;
		if (!consistent) {
			for (const t of tokens) {
				const count = reds.filter((r) => r.lookaheads.has(t)).length;
				if (count > 0 && shiftSet.has(t)) sr++;
				if (count >= 2) rr += count - 1;
			}
		}
		return { id, node, consistent, shifts, reds, errs, defaultRule, sr, rr, act };
	});

	// ───────── printing ─────────
	const ruleLine = (r: number, previous: string | null, body: string): string => {
		const lhs = tag(lhsOf(r));
		const head = previous === lhsOf(r) ? `${' '.repeat(lhs.length)}|` : `${lhs}:`;
		return `  ${String(r).padStart(3)} ${head}${body}`;
	};
	const rhsText = (r: number) => {
		const rhs = rhsOf(r);
		return rhs.length === 0 ? ' %empty' : rhs.map((s) => ` ${tag(s)}`).join('');
	};
	/** Rules that pass the filter, a blank line between groups of one left-hand side. */
	const rulesBlock = (filter: (r: number) => boolean): string[] => {
		const out: string[] = [];
		let previous: string | null = null;
		for (let r = 0; r < ruleCount; r++) {
			if (!filter(r)) continue;
			if (previous !== null && previous !== lhsOf(r)) out.push('');
			out.push(ruleLine(r, previous, rhsText(r)));
			previous = lhsOf(r);
		}
		return out;
	};
	const column = (entries: [string, string][]): string[] => {
		const width = Math.max(...entries.map(([k]) => k.length)) + 2;
		return entries.map(([k, v]) => `    ${k}${' '.repeat(width - k.length)}${v}`);
	};

	const states: BisonState[] = blocks.map((b, n) => {
		const lines = [`State ${n}`, ''];
		let previous: string | null = null;
		for (const [r, dot] of b.node.kernel) {
			const rhs = rhsOf(r);
			const before = rhs
				.slice(0, dot)
				.map((s) => ` ${tag(s)}`)
				.join('');
			const after =
				rhs.length === 0
					? ' %empty'
					: rhs
							.slice(dot)
							.map((s) => ` ${tag(s)}`)
							.join('');
			lines.push(ruleLine(r, previous, `${before} •${after}`));
			previous = lhsOf(r);
		}
		const section = (part: string[]) => {
			if (part.length) lines.push('', ...part);
		};
		section(
			column(
				b.shifts
					.filter((s) => s.enabled)
					.map((s) => [tag(s.symbol), `shift, and go to state ${numberOf[s.to]}`])
			)
		);
		section(b.errs.length ? column(b.errs.map((t) => [tag(t), 'error (nonassociative)'])) : []);
		// print_reductions
		const reduction = (r: number, enabled: boolean) => {
			const text = r === 0 ? 'accept' : `reduce using rule ${r} (${tag(lhsOf(r))})`;
			return enabled ? text : `[${text}]`;
		};
		const reduceEntries: [string, string][] = [];
		if (!b.consistent) {
			const noReduce = new Set([
				...b.shifts.filter((s) => s.enabled).map((s) => s.symbol),
				...b.errs
			]);
			for (const t of tokens) {
				let count = noReduce.has(t);
				let defaulted = false;
				for (const red of b.reds) {
					if (!red.lookaheads.has(t)) continue;
					if (!count) {
						if (red.rule !== b.defaultRule) reduceEntries.push([tag(t), reduction(red.rule, true)]);
						else defaulted = true;
						count = true;
					} else {
						if (defaulted) reduceEntries.push([tag(t), reduction(b.defaultRule!, true)]);
						defaulted = false;
						reduceEntries.push([tag(t), reduction(red.rule, false)]);
					}
				}
			}
		}
		if (b.defaultRule !== null) reduceEntries.push(['$default', reduction(b.defaultRule, true)]);
		section(reduceEntries.length ? column(reduceEntries) : []);
		section(
			b.node.gotos.length
				? column(b.node.gotos.map((t) => [tag(t.symbol), `go to state ${numberOf[t.to]}`]))
				: []
		);
		const actions: Record<string, BisonAction> = {};
		for (const [t, a] of b.act)
			actions[t] = a.kind === 'shift' ? { kind: 'shift', to: numberOf[a.to] } : a;
		return {
			number: n,
			lalr: b.node.lalr,
			merged: [...b.node.merged],
			lines,
			sr: b.sr,
			rr: b.rr,
			actions,
			defaultRule: b.defaultRule
		};
	});

	const head: BisonReport['head'] = [];
	const useless = rulesBlock((r) => !used.has(r));
	if (useless.length)
		head.push({
			title: 'Rules useless in parser due to conflicts',
			lines: ['Rules useless in parser due to conflicts', '', ...useless]
		});
	const conflictLines = states
		.filter((s) => s.sr || s.rr)
		.map(
			(s) =>
				`State ${s.number} conflicts: ${[
					s.sr ? `${s.sr} shift/reduce` : '',
					s.rr ? `${s.rr} reduce/reduce` : ''
				]
					.filter(Boolean)
					.join(', ')}`
		);
	if (conflictLines.length) head.push({ title: 'Conflicts', lines: conflictLines });
	head.push({ title: 'Grammar', lines: ['Grammar', '', ...rulesBlock(() => true)] });

	// Terminals by token code: $end 0, a character its code, error 256, the others 258 on.
	const appearsIn = (s: string) => {
		const rules: number[] = [];
		for (let r = 0; r < ruleCount; r++) if (rhsOf(r).includes(s)) rules.push(r);
		return rules;
	};
	let next = 258;
	const codes: { code: number; line: string }[] = [
		{
			code: 0,
			line: `    $end (0)${appearsIn(END_MARKER)
				.map((r) => ` ${r}`)
				.join('')}`
		},
		{ code: 256, line: '    error (256)' }
	];
	for (const t of user) {
		const code = isChar(t) ? t.codePointAt(0)! : next++;
		codes.push({
			code,
			line: `    ${tag(t)} (${code})${appearsIn(t)
				.map((r) => ` ${r}`)
				.join('')}`
		});
	}
	head.push({
		title: 'Terminals, with rules where they appear',
		lines: [
			'Terminals, with rules where they appear',
			'',
			...codes.sort((a, b) => a.code - b.code).map((c) => c.line)
		]
	});
	const nonterminalLines = [aug.start, ...g.nonterminals].flatMap((n) => {
		const left: number[] = [];
		for (let r = 0; r < ruleCount; r++) if (lhsOf(r) === n) left.push(r);
		const right = appearsIn(n);
		return [
			`    ${tag(n)} (${number.get(n)})`,
			...(left.length ? [`        on left:${left.map((r) => ` ${r}`).join('')}`] : []),
			...(right.length ? [`        on right:${right.map((r) => ` ${r}`).join('')}`] : [])
		];
	});
	head.push({
		title: 'Nonterminals, with rules where they appear',
		lines: ['Nonterminals, with rules where they appear', '', ...nonterminalLines]
	});

	const sr = states.reduce((n, s) => n + s.sr, 0);
	const rr = states.reduce((n, s) => n + s.rr, 0);
	const messages: string[] = [];
	if (sr)
		messages.push(
			`${file}: warning: ${plural(sr, 'shift/reduce conflict', 'shift/reduce conflicts')} [-Wconflicts-sr]`
		);
	if (rr)
		messages.push(
			`${file}: warning: ${plural(rr, 'reduce/reduce conflict', 'reduce/reduce conflicts')} [-Wconflicts-rr]`
		);
	if (sr || rr)
		messages.push(
			`${file}: note: rerun with option '-Wcounterexamples' to generate conflict counterexamples`
		);

	const text =
		[...head.map((h) => h.lines.join('\n')), ...states.map((s) => s.lines.join('\n'))].join(
			'\n\n\n'
		) + '\n';
	return {
		head,
		states,
		numberOf: numberOf.slice(0, FINAL),
		sr,
		rr,
		messages,
		text,
		names
	};
}
