/**
 * What the page shows of a `minimize` run: the partition after every round
 * with stable block numbers, the signature table of each round, why blocks
 * split, and the two runs behind a distinguishing string.
 *
 * Blocks are numbered from 1 in round 0. When a block splits, the part that
 * holds its first state keeps its number (and color); every other part gets
 * the next unused number. The engine orders blocks by their first state, so
 * numbers stay put while stepping.
 */
import type { CharSet } from '$lib/theory/charset';
import {
	distinguish,
	isLabeled,
	runDfa,
	symbolClasses,
	type Automaton,
	type MinimizeResult,
	type StateId
} from '$lib/theory/automata';

/**
 * Colors of partition blocks by palette index, in the order AutomatonView
 * colors its group outlines (`.group.t0` … `.group.t5`).
 */
export const BLOCK_COLORS = [
	'var(--accent)',
	'var(--accept)',
	'var(--epsilon)',
	'var(--active)',
	'var(--info)',
	'var(--reject)'
] as const;
export const BLOCK_TONES = BLOCK_COLORS.length;

/** CSS color of a block's palette index. */
export const blockColor = (tone: number): string =>
	BLOCK_COLORS[((Math.trunc(tone) % BLOCK_TONES) + BLOCK_TONES) % BLOCK_TONES];

export interface Block {
	/** Display number (1-based), stable across rounds. */
	id: number;
	/** Palette index 0–5. */
	tone: number;
	/** States of the partitioned machine, ascending. */
	states: StateId[];
}

export interface Partition {
	/** In the engine's order (by first state). */
	blocks: Block[];
	/** State → display number of its block. */
	of: number[];
}

export interface Cell {
	/** T(s, a) */
	to: StateId;
	/** Display number of the block T(s, a) lies in, in the previous partition. */
	block: number;
}

export interface SignatureRow {
	state: StateId;
	/** One cell per symbol class. */
	cells: Cell[];
	/** Display number of the state's block after the round. */
	next: number;
}

/** The rows of one block of the previous partition. */
export interface SignatureGroup {
	block: Block;
	/** Display numbers of the blocks it becomes (one when it does not split). */
	into: number[];
	/** Ordered by the block they go to, then by state. */
	rows: SignatureRow[];
	/** differing[k]: the rows disagree on the block of column k. */
	differing: boolean[];
}

export interface InitialRow {
	state: StateId;
	accepting: boolean;
	token?: string;
	block: number;
}

/** Why the part holding `q` left the part holding `p`. */
export interface SplitReason {
	/** First states of the two parts. */
	p: StateId;
	q: StateId;
	/** Display number of the part holding q. */
	part: number;
	/** The symbol class the two first states disagree on (null in round 0). */
	symbol: CharSet | null;
	/** Column of `symbol` (-1 in round 0). */
	column: number;
	/** T(p, a) and T(q, a) with their blocks in the previous partition (round ≥ 1). */
	pTo: StateId | null;
	qTo: StateId | null;
	pToBlock: number | null;
	qToBlock: number | null;
	/** A string that tells p and q apart ("" in round 0). */
	witness: string;
	/** Where the witness leads from p and from q. */
	pEnd: StateId;
	qEnd: StateId;
}

export interface SplitView {
	/** The block that splits (null in round 0, where every state starts together). */
	block: Block | null;
	/** Display numbers of its parts; the first keeps the block's number. */
	parts: number[];
	/** One reason per part after the first. */
	reasons: SplitReason[];
}

export interface RoundView {
	index: number;
	partition: Partition;
	previous: Partition | null;
	splits: SplitView[];
	/** Round 0: how each state starts. */
	initial: InitialRow[];
	/** Round ≥ 1: signatures against the previous partition, grouped by its blocks. */
	groups: SignatureGroup[];
}

export interface RefinementView {
	/** The total, trimmed machine that was partitioned. */
	input: Automaton;
	/** Symbol classes (table columns), ascending. */
	classes: CharSet[];
	/** delta[s][k] = T(s, class k). */
	delta: StateId[][];
	rounds: RoundView[];
	/** Minimal DFA state → the final block it stands for. */
	resultBlocks: Block[];
	/**
	 * The final block that holds only the added trap state. The minimal DFA
	 * drops it (its missing transitions mean the trap), so it is the one final
	 * block without a state in `resultBlocks`; null when every block is kept.
	 */
	droppedTrap: Block | null;
	/** True when some accepting state reports a token. */
	hasTokens: boolean;
}

/** Palette index of a block number: blocks 1–6 take the six colors, then they repeat. */
export const blockTone = (id: number): number => (id - 1) % BLOCK_TONES;
const tone = blockTone;

/** Where `w` leads from `s` (the machine must be total). */
export function runFrom(a: Automaton, s: StateId, w: string): StateId[] {
	return runDfa({ ...a, start: s }, w).steps.flatMap((step) =>
		step.state === null ? [] : [step.state]
	);
}

function transitionsByClass(a: Automaton, classes: CharSet[]): StateId[][] {
	const delta = a.states.map(() => classes.map(() => -1));
	for (const t of a.transitions) {
		if (!isLabeled(t)) continue;
		classes.forEach((c, k) => {
			if (t.label.overlaps(c)) delta[t.from][k] = t.to;
		});
	}
	return delta;
}

function numberPartitions(result: MinimizeResult): Partition[] {
	const n = result.input.states.length;
	const out: Partition[] = [];
	let counter = 0;
	result.rounds.forEach((round, r) => {
		const of = new Array<number>(n).fill(0);
		const prev = out[r - 1];
		const blocks = round.blocks.map((states): Block => {
			let id: number;
			if (!prev) id = ++counter;
			else {
				const parent = prev.blocks.find((b) => b.id === prev.of[states[0]])!;
				id = parent.states[0] === states[0] ? parent.id : ++counter;
			}
			for (const s of states) of[s] = id;
			return { id, tone: tone(id), states };
		});
		out.push({ blocks, of });
	});
	return out;
}

export function refinementView(result: MinimizeResult): RefinementView {
	const { input } = result;
	const classes = symbolClasses(input);
	const delta = transitionsByClass(input, classes);
	const partitions = numberPartitions(result);
	const lastRun = (s: StateId, w: string) => runFrom(input, s, w).at(-1) ?? s;

	const rounds = result.rounds.map((round, r): RoundView => {
		const partition = partitions[r];
		const previous = r > 0 ? partitions[r - 1] : null;
		const blockById = (p: Partition, id: number) => p.blocks.find((b) => b.id === id)!;

		const splits = round.splits.map((split): SplitView => {
			const parts = split.parts.map((states) => partition.of[states[0]]);
			const reasons = split.witnesses.map((w): SplitReason => {
				const p = split.parts[0][0];
				const q = split.parts[w.part][0];
				const column = previous ? classes.findIndex((c) => c.equals(w.symbol)) : -1;
				const pTo = column >= 0 ? delta[p][column] : null;
				const qTo = column >= 0 ? delta[q][column] : null;
				return {
					p,
					q,
					part: parts[w.part],
					symbol: column >= 0 ? classes[column] : null,
					column,
					pTo,
					qTo,
					pToBlock: previous && pTo !== null ? previous.of[pTo] : null,
					qToBlock: previous && qTo !== null ? previous.of[qTo] : null,
					witness: w.witness,
					pEnd: lastRun(p, w.witness),
					qEnd: lastRun(q, w.witness)
				};
			});
			return {
				block: previous ? blockById(previous, previous.of[split.block[0]]) : null,
				parts,
				reasons
			};
		});

		const initial: InitialRow[] =
			r === 0
				? [...input.states]
						.sort((a, b) => partition.of[a.id] - partition.of[b.id] || a.id - b.id)
						.map((s) => ({
							state: s.id,
							accepting: s.accepting,
							...(s.accepting && s.accept ? { token: s.accept.token } : {}),
							block: partition.of[s.id]
						}))
				: [];

		const groups: SignatureGroup[] = previous
			? previous.blocks.map((block) => {
					const rows = block.states
						.map((state): SignatureRow => ({
							state,
							cells: delta[state].map((to) => ({ to, block: previous.of[to] })),
							next: partition.of[state]
						}))
						.sort((a, b) => a.next - b.next || a.state - b.state);
					const into = [...new Set(rows.map((row) => row.next))];
					const differing = classes.map((_, k) =>
						rows.some((row) => row.cells[k].block !== rows[0].cells[k].block)
					);
					return { block, into, rows, differing };
				})
			: [];

		return { index: r, partition, previous, splits, initial, groups };
	});

	const final = partitions[partitions.length - 1];
	const resultBlocks = result.dfa.states.map((_, i) => final.blocks[i]);
	const droppedTrap = final.blocks.find((b) => !resultBlocks.includes(b)) ?? null;
	const hasTokens = input.states.some((s) => s.accepting && s.accept !== undefined);
	return { input, classes, delta, rounds, resultBlocks, droppedTrap, hasTokens };
}

/**
 * A set of state names with spaces inside the braces, `{ A, B }` (`{ }` when
 * empty). The spaces next to the braces do not break, so a line break only
 * falls between names.
 */
export function setText(names: readonly string[]): string {
	return names.length === 0 ? '{ }' : `{\u00a0${names.join(', ')}\u00a0}`;
}

/** "a", "a and b", "a, b and c". */
export function listText(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One-sentence description of a round, announced when stepping. */
export function roundSummary(view: RefinementView, r: number): string {
	const round = view.rounds[r];
	const blocks = round.partition.blocks;
	if (r === 0) {
		const acc = blocks.filter((b) => view.input.states[b.states[0]].accepting);
		const non = blocks.filter((b) => !view.input.states[b.states[0]].accepting);
		if (acc.length === 0) return 'Round 0: no state accepts, so every state starts in block 1.';
		if (non.length === 0 && acc.length === 1)
			return 'Round 0: every state accepts, so every state starts in block 1.';
		const nonText = non.length ? `the non-accepting states form block ${non[0].id}; ` : '';
		if (!view.hasTokens || acc.length === 1)
			return `Round 0: ${nonText}the accepting states form block ${acc[0].id}.`;
		const byToken = acc.map(
			(b) => `${view.input.states[b.states[0]].accept?.token ?? 'no token'} (block ${b.id})`
		);
		return `Round 0: ${nonText}the accepting states form one block per token: ${listText(byToken)}.`;
	}
	if (round.splits.length === 0) {
		const n = blocks.length;
		const blockText = `${n} ${n === 1 ? 'block' : 'blocks'}`;
		const states = view.resultBlocks.length;
		const stateText = `${states} ${states === 1 ? 'state' : 'states'}`;
		if (view.droppedTrap)
			return `Round ${r}: no block splits, so the partition is final: ${blockText}. Block ${view.droppedTrap.id} holds only the trap and is dropped, so the minimal DFA has ${stateText}.`;
		return `Round ${r}: no block splits, so the partition is final: ${blockText}, ${stateText} in the minimal DFA.`;
	}
	const parts = round.splits.map(
		(s) => `block ${s.block?.id} splits into blocks ${listText(s.parts.map(String))}`
	);
	return `Round ${r}: ${parts.join('; ')}.`;
}

/** Display text of one symbol class, e.g. `0` or `a–e,g,h`. */
export type ClassText = (c: CharSet) => string;

/**
 * The split explanation as plain text, e.g. `A and C split on 0: A →0 B
 * (block 1) but C →0 C (block 2); distinguishing string "0"`.
 */
export function reasonText(
	reason: SplitReason,
	name: (s: StateId) => string,
	classText: ClassText,
	quote: (w: string) => string
): string {
	const p = name(reason.p);
	const q = name(reason.q);
	if (reason.symbol === null || reason.pTo === null || reason.qTo === null)
		return `${p} and ${q} start apart; distinguishing string ${quote(reason.witness)}`;
	const a = classText(reason.symbol);
	return (
		`${p} and ${q} split on ${a}: ${p} →${a} ${name(reason.pTo)} (block ${reason.pToBlock}) ` +
		`but ${q} →${a} ${name(reason.qTo)} (block ${reason.qToBlock}); ` +
		`distinguishing string ${quote(reason.witness)}`
	);
}

export type PairResult =
	| { kind: 'same' }
	| { kind: 'equivalent'; block: number | null }
	| {
			kind: 'distinct';
			witness: string;
			/** States visited from p and from q, starting with p and q. */
			pRun: StateId[];
			qRun: StateId[];
	  };

/** Pair check on the partitioned machine: equal, equivalent, or told apart by a shortest string. */
export function pairCheck(
	view: RefinementView,
	p: StateId,
	q: StateId,
	byToken: boolean
): PairResult {
	if (p === q) return { kind: 'same' };
	const d = distinguish(view.input, p, q, { byToken });
	if (d.equivalent) {
		const final = view.rounds[view.rounds.length - 1].partition;
		return { kind: 'equivalent', block: final.of[p] === final.of[q] ? final.of[p] : null };
	}
	return {
		kind: 'distinct',
		witness: d.witness,
		pRun: runFrom(view.input, p, d.witness),
		qRun: runFrom(view.input, q, d.witness)
	};
}
