/**
 * DFA minimization by Moore-style partition refinement.
 *
 * The machine is first made total (explicit trap) and trimmed to reachable
 * states. The initial partition separates non-accepting from accepting states
 * (and accepting states by token). Each round splits every block whose states
 * disagree on which block some symbol class leads to; it stops when a round
 * splits nothing. Each split records a string that tells its parts apart.
 */
import { CharSet } from '../charset';
import { analyzeDeterminism, complete, isLabeled, removeUnreachable, symbolClasses } from './core';
import { compile, step } from './internal';
import type { AcceptInfo, Automaton, State, StateId, Transition } from './types';

export interface MinimizeSplit {
	/** The block before the split. */
	block: StateId[];
	/** Its parts, ordered by smallest state. */
	parts: StateId[][];
	/** A class on which parts[0] and parts[1] go to different blocks (empty in round 0). */
	symbol: CharSet;
	/**
	 * A string that separates parts[0] and parts[1] ("" in round 0): it is
	 * accepted from exactly one of them, or (when splitting by token) accepted
	 * from both with different tokens.
	 */
	witness: string;
	/** For every part i ≥ 1: the class and string that separate it from parts[0]. */
	witnesses: { part: number; symbol: CharSet; witness: string }[];
}

export interface MinimizeRound {
	/** The partition after this round, blocks ordered by smallest state. */
	blocks: StateId[][];
	/** Round 0: the initial split. Later rounds: every block that split. Empty in the last round. */
	splits: MinimizeSplit[];
}

export interface MinimizeResult {
	/**
	 * The minimal DFA. Each state is named after its block's first member and
	 * lists in `merged` the states of the machine passed to `minimize` (original
	 * ids, ascending) that it replaces; an added trap is not listed, and a state
	 * whose block holds it is flagged `trap`.
	 */
	dfa: Automaton;
	rounds: MinimizeRound[];
	/** State of `input` → index of its block in the last round (= its state in `dfa`). */
	blockOf: Map<StateId, number>;
	/** The total, trimmed machine that was partitioned. `rounds` and `blockOf` use its ids. */
	input: Automaton;
	/** The trap state added to make the machine total (an `input` id), or null. */
	trap: StateId | null;
	/** States of the original machine that were unreachable. */
	removed: StateId[];
	/** Original state id → `input` id. */
	map: Map<StateId, StateId>;
}

const byFirst = (a: StateId[], b: StateId[]) => a[0] - b[0];

/**
 * Minimizes a DFA (partial DFAs are completed first). With `splitByToken`
 * (default), accepting states that report different tokens stay apart.
 * Throws when given an NFA.
 */
export function minimize(dfa: Automaton, opts: { splitByToken?: boolean } = {}): MinimizeResult {
	const splitByToken = opts.splitByToken ?? true;
	if (analyzeDeterminism(dfa).kind === 'nfa')
		throw new Error('minimize expects a DFA; run the subset construction first');

	const completed = complete(dfa);
	const trimmed = removeUnreachable(completed.automaton);
	const input = trimmed.automaton;
	const n0 = dfa.states.length;
	const trap = completed.trap === null ? null : (trimmed.map.get(completed.trap) ?? null);
	const removed = trimmed.removed.filter((id) => id < n0);
	const map = new Map([...trimmed.map].filter(([old]) => old < n0));

	const classes = symbolClasses(input);
	const reps = classes.map((c) => c.firstChar()!);
	const n = input.states.length;
	const delta: number[][] = input.states.map(() => classes.map(() => -1));
	for (const t of input.transitions) {
		if (!isLabeled(t)) continue;
		classes.forEach((c, k) => {
			if (t.label.overlaps(c)) delta[t.from][k] = t.to;
		});
	}

	// Round 0.
	const initialKey = (s: StateId) => {
		const st = input.states[s];
		if (!st.accepting) return 'N';
		return splitByToken ? `A:${st.accept?.token ?? ''}` : 'A';
	};
	const history: number[][] = [];
	const groupBy = (ids: StateId[], key: (s: StateId) => string) => {
		const groups = new Map<string, StateId[]>();
		for (const s of ids) {
			const k = key(s);
			const g = groups.get(k);
			if (g) g.push(s);
			else groups.set(k, [s]);
		}
		return [...groups.values()].sort(byFirst);
	};
	const indexBlocks = (blocks: StateId[][]) => {
		const of = new Array<number>(n);
		blocks.forEach((b, i) => b.forEach((s) => (of[s] = i)));
		return of;
	};

	const all = input.states.map((s) => s.id);
	let blocks = groupBy(all, initialKey);
	history.push(indexBlocks(blocks));
	const rounds: MinimizeRound[] = [
		{
			blocks,
			splits:
				blocks.length > 1
					? [
							{
								block: all,
								parts: blocks,
								symbol: CharSet.EMPTY,
								witness: '',
								witnesses: blocks
									.slice(1)
									.map((_, i) => ({ part: i + 1, symbol: CharSet.EMPTY, witness: '' }))
							}
						]
					: []
		}
	];

	// Witness for states x, y that are in different blocks of round `r`.
	const memo = new Map<string, { symbol: number; witness: string }>();
	const separate = (x: number, y: number, r: number): { symbol: number; witness: string } => {
		let j = 0;
		while (j < r && history[j][x] === history[j][y]) j++;
		if (j === 0) return { symbol: -1, witness: '' };
		const key = `${x},${y},${j}`;
		const hit = memo.get(key);
		if (hit) return hit;
		const prev = history[j - 1];
		const k = classes.findIndex((_, i) => prev[delta[x][i]] !== prev[delta[y][i]]);
		const rest = separate(delta[x][k], delta[y][k], j - 1);
		const out = { symbol: k, witness: reps[k] + rest.witness };
		memo.set(key, out);
		return out;
	};

	for (let r = 1; ; r++) {
		const prev = history[r - 1];
		const next: StateId[][] = [];
		const splits: MinimizeSplit[] = [];
		for (const block of blocks) {
			const parts = groupBy(block, (s) => delta[s].map((t) => prev[t]).join(','));
			next.push(...parts);
			if (parts.length > 1) {
				const pairs = parts.slice(1).map((p, i) => {
					const x = parts[0][0];
					const y = p[0];
					const k = classes.findIndex((_, c) => prev[delta[x][c]] !== prev[delta[y][c]]);
					const w = reps[k] + separate(delta[x][k], delta[y][k], r - 1).witness;
					return { part: i + 1, symbol: classes[k], witness: w };
				});
				splits.push({
					block,
					parts,
					symbol: pairs[0].symbol,
					witness: pairs[0].witness,
					witnesses: pairs
				});
			}
		}
		next.sort(byFirst);
		history.push(indexBlocks(next));
		rounds.push({ blocks: next, splits });
		blocks = next;
		if (splits.length === 0) break;
	}

	// Build the quotient machine.
	const final = history[history.length - 1];
	const lonelyTrap = trap !== null && blocks[final[trap]].length === 1;
	const kept = blocks.filter((b) => !(lonelyTrap && b[0] === trap));
	const originalOf = new Map([...map].map(([o, i]) => [i, o]));
	const states: State[] = kept.map((b, id) => {
		const first = input.states[b[0]];
		// Input ids keep the original order (the added trap comes last), so b[0] is original.
		const merged = b.flatMap((s) => originalOf.get(s) ?? []);
		const state: State = { id, name: first.name, accepting: first.accepting, merged };
		let accept: AcceptInfo | undefined;
		for (const s of b) {
			const a = input.states[s].accept;
			if (a && (!accept || a.rule < accept.rule)) accept = a;
		}
		if (accept) state.accept = accept;
		if (b.some((s) => s === trap || input.states[s].trap)) state.trap = true;
		return state;
	});
	const transitions: Transition[] = [];
	kept.forEach((b, from) => {
		const byTarget = new Map<number, CharSet>();
		classes.forEach((c, k) => {
			const to = final[delta[b[0]][k]];
			if (to >= kept.length) return; // the dropped trap block is last
			const prevLabel = byTarget.get(to);
			byTarget.set(to, prevLabel ? prevLabel.union(c) : c);
		});
		for (const [to, label] of byTarget)
			transitions.push({ id: transitions.length, from, to, label });
	});
	const result: Automaton = { states, transitions, start: final[input.start] };
	if (dfa.alphabet) result.alphabet = dfa.alphabet;
	const blockOf = new Map(all.map((s) => [s, final[s]]));
	return { dfa: result, rounds, blockOf, input, trap, removed, map };
}

export type Distinction =
	| { equivalent: true }
	| {
			equivalent: false;
			witness: string;
			/** The state (p or q) the witness is accepted from; p when both accept it. */
			accepts: StateId;
			/** Present when both accept the witness, with these different tokens. */
			tokens?: { p: string; q: string };
	  };

/**
 * The shortest string (shortlex among the shortest) that tells p and q apart,
 * found by breadth-first search over pairs of states. Missing transitions go
 * to the trap. With `byToken` (default, as in `minimize`), a string accepted
 * from both with different tokens also tells them apart; a state without
 * token info counts as the token ''. Throws when given an NFA.
 */
export function distinguish(
	dfa: Automaton,
	p: StateId,
	q: StateId,
	opts: { byToken?: boolean } = {}
): Distinction {
	if (analyzeDeterminism(dfa).kind === 'nfa') throw new Error('distinguish expects a DFA');
	const byToken = opts.byToken ?? true;
	const m = compile(dfa);
	const reps = symbolClasses(dfa).map((c) => c.first()!);
	const acc = (s: number) => s >= 0 && m.accepting[s];
	const token = (s: number) => dfa.states[s].accept?.token ?? '';
	const differ = (x: number, y: number) =>
		acc(x) !== acc(y) || (byToken && acc(x) && token(x) !== token(y));
	const found = (x: number, y: number, witness: string): Distinction =>
		acc(x) && acc(y)
			? { equivalent: false, witness, accepts: p, tokens: { p: token(x), q: token(y) } }
			: { equivalent: false, witness, accepts: acc(x) ? p : q };
	if (differ(p, q)) return found(p, q, '');
	const n = dfa.states.length + 1;
	const code = (x: number, y: number) => (x + 1) * n + (y + 1);
	const seen = new Set<number>([code(p, q)]);
	const queue: { x: number; y: number; w: string }[] = [{ x: p, y: q, w: '' }];
	for (let i = 0; i < queue.length; i++) {
		const { x, y, w } = queue[i];
		for (const cp of reps) {
			const x2 = step(m, x, cp);
			const y2 = step(m, y, cp);
			if (x2 === y2) continue;
			const c = code(x2, y2);
			if (seen.has(c)) continue;
			seen.add(c);
			const w2 = w + String.fromCodePoint(cp);
			if (differ(x2, y2)) return found(x2, y2, w2);
			queue.push({ x: x2, y: y2, w: w2 });
		}
	}
	return { equivalent: true };
}
