/**
 * Recursive descent with backtracking, as animated on Top-Down Parsing,
 * slides 5–16, and described on slides 18–22.
 *
 * The parse starts with the top-level non-terminal and tries its rules in the
 * order written. The children of a rule are processed left to right: a
 * non-terminal child is expanded in turn, a terminal child is compared with
 * the token under the input pointer. On a mismatch the search goes back to
 * the most recent choice: the children added there are removed, the pointer
 * returns to where that alternative started, and the next alternative is
 * tried. A non-terminal whose choices are all used up is left behind, and the
 * search goes back to the choice before it (slide 19: "Have exhausted the
 * choices for T2 and T1 so backtrack to choice for E0"). The input is
 * accepted when the tree is complete and the pointer is past the last token;
 * a complete tree with tokens left over is one more failure.
 *
 * Every event is recorded as a step, so the run can be played forward and
 * backward. A step itself holds a few numbers. Its tree, the path of its
 * current node and its fringe are worked out when they are read, by playing
 * the run's changes to the tree up to that step, so a run of thousands of
 * steps on a deep tree stays cheap until a step is looked at.
 */
import { printSymbols } from '$lib/theory/grammar/parse';
import { EPSILON, type Grammar, type ParseNode, type Production } from '$lib/theory/grammar/types';
import { joinPieces, plainText, text, type Piece } from './notation';

/** Steps recorded before a run stops by itself. */
export const DEFAULT_MAX_STEPS = 3000;
/** The smallest `depthCap` the page runs with: the tree is drawn at least this far down its left edge. */
export const DEFAULT_DEPTH_CAP = 8;

/**
 * The `depthCap` for a token string of `tokens` tokens: large enough that it
 * only ends runs that would never end by themselves.
 *
 * Take instances of one non-terminal nested in each other that all start at
 * the same token. In the tree a run ends with, each of them ends at a
 * different token: were two to cover the same tokens, the smaller tree
 * without the outer one would have been reached first, or the search would
 * never have come back from the inner one to get past it. And while it runs,
 * the search cannot get rid of such a nest again, because giving up the inner
 * instance means trying on it the rule that made the nest, which makes the
 * next one. A string of n tokens has n + 1 places to end at, so once more
 * than n + 1 instances are nested the run can neither accept nor reject.
 */
export function depthCapFor(tokens: number): number {
	return Math.max(DEFAULT_DEPTH_CAP, tokens + 1);
}

/** A node of the partial parse tree. */
export interface RdNode extends ParseNode {
	children: RdNode[];
	/** Number of this instance of a non-terminal; the root is 0 (E0, T1 … on slides 18–20). */
	instance?: number;
	/** A terminal that has been matched with a token. */
	matched?: boolean;
}

/** One instance of a non-terminal in the tree. */
export interface Instance {
	symbol: string;
	instance: number;
}

/** A leaf of the partial tree. */
export interface FringeItem {
	symbol: string;
	terminal: boolean;
	/** Instance number of a non-terminal. */
	instance?: number;
}

/**
 * The leaves of the partial tree from left to right (slide 22): the matched
 * terminals t1 t2 … tk, then what is still to do, in which `next` is the
 * leftmost non-terminal A.
 */
export interface Fringe {
	items: FringeItem[];
	/** k: how many terminals at the front are matched. */
	matched: number;
	/** Index of the leftmost non-terminal that is not expanded, or -1. */
	next: number;
}

/** The fringe of a `try` with its production applied; `added` is the range of the right-hand side. */
export type NewFringe = Fringe & { added: [start: number, end: number] };

export type BacktrackEvent =
	'try' | 'match' | 'mismatch' | 'backtrack' | 'exhausted' | 'accept' | 'reject' | 'stop';

export interface StopInfo {
	/**
	 * `depth`: too many instances of one non-terminal nested without input
	 * consumed; `steps`: the step budget.
	 */
	reason: 'depth' | 'steps';
	limit: number;
	/** `depth`: the non-terminal whose instances are nested. */
	symbol?: string;
}

export interface BacktrackStep {
	event: BacktrackEvent;
	/**
	 * The tree as the slide for this step draws it. At a `try` the node being
	 * expanded has no children yet; they are in the tree of the next step.
	 * Computed when read (see `BacktrackResult.steps`).
	 */
	readonly tree: RdNode;
	/** Path of the current node (the one drawn in red on the slides), or null. Computed when read. */
	readonly path: number[] | null;
	/** Index of the token under the input pointer; `tokens.length` at the end of the input. */
	pos: number;
	/** `try`: id of the production being tried. */
	production: number | null;
	/** `match`, `mismatch`: id of the production whose right-hand side the terminal is in. */
	within: number | null;
	/** The leaves of `tree`. Computed when read. */
	readonly fringe: Fringe;
	/** `try`: the instance being expanded and the right-hand side with its new instances. */
	attempt?: { lhs: Instance; rhs: FringeItem[] };
	/** `try`: the fringe with the production applied. Computed when read. */
	readonly newFringe?: NewFringe;
	/** `match`, `mismatch`: the terminal of the tree and the token under the pointer (null at the end). */
	compare?: { expected: string; found: string | null };
	/** `backtrack`: the tokens left over under a complete tree. Computed when read. */
	readonly remaining?: string[];
	/** `exhausted`, `reject`: the instances with no choices left, most recent first. */
	exhausted?: Instance[];
	/** `exhausted`: the instance whose choice the search goes back to. */
	target?: Instance;
	/** `stop`: why the run ended early. */
	stop?: StopInfo;
	/** The step in the slides' words, instances numbered: see `describeStep`. */
	message: string[];
	/** Productions tried so far, this step included. */
	tries: number;
	/** Failures so far (mismatches and complete trees with tokens left), this step included. */
	backtracks: number;
	/** Number of entries of `BacktrackResult.log` written so far, this step included. */
	log: number;
}

/** A line of the "Try …" log of slides 18–20: a `try`, an `exhausted` note, or the last step. */
export interface LogEntry {
	/** Index of the step the line describes. */
	step: number;
	/** `try`: the first step whose tree no longer has this alternative; null while it stands. */
	undone: number | null;
	/** `try`: the mismatch or leftover step that sent the search back to this choice. */
	cause: number | null;
}

export interface BacktrackResult {
	/**
	 * Every step, in order. A step's tree, path and fringe are computed when
	 * they are read and kept for the last few steps read, so reading one step
	 * twice gives the same objects. Reading steps in ascending order is the
	 * cheapest: each one continues from the one before.
	 */
	steps: BacktrackStep[];
	log: LogEntry[];
	outcome: 'accept' | 'reject' | 'stopped';
	stop: StopInfo | null;
	/** The parse tree, when the input is accepted. Computed when read. */
	readonly tree: RdNode | null;
	tries: number;
	backtracks: number;
	/** Most levels below the root that any step's drawing has (an ε leaf counts as a level). */
	depth: number;
}

export interface BacktrackOptions {
	/** Steps to record at most, the closing `stop` step included. */
	maxSteps?: number;
	/**
	 * Stop when this many instances of one non-terminal are nested with no
	 * token matched between them and one more of them would be expanded. Only
	 * a left-recursive non-terminal can be nested in itself like that, so the
	 * rest of the grammar is never held back. With `depthCapFor` the run that
	 * is stopped could not have ended. Null (default) for no limit.
	 */
	depthCap?: number | null;
}

const sym = (symbol: string): string => printSymbols([symbol]);

function symbolPiece(item: FringeItem, instances: boolean): Piece {
	if (item.terminal) return { text: sym(item.symbol), kind: 'terminal' };
	const piece: Piece = { text: sym(item.symbol), kind: 'nonterminal' };
	if (instances && item.instance !== undefined) piece.sub = String(item.instance);
	return piece;
}

const instancePiece = (i: Instance, instances: boolean): Piece =>
	symbolPiece({ symbol: i.symbol, terminal: false, instance: i.instance }, instances);

/** Symbols with spaces between them; `ε` for none. */
export function symbolPieces(items: readonly FringeItem[], instances: boolean): Piece[] {
	if (items.length === 0) return [text(EPSILON)];
	return joinPieces(
		items.map((item) => [symbolPiece(item, instances)]),
		' ',
		' '
	);
}

/** The parts of a step that its message is written from. */
export type StepFacts = Pick<
	BacktrackStep,
	'event' | 'attempt' | 'compare' | 'remaining' | 'exhausted' | 'target' | 'stop'
>;

/** `E0 → T1 + E2` for a `try` step (without the numbers when `instances` is false). */
export function attemptPieces(step: Pick<BacktrackStep, 'attempt'>, instances = true): Piece[] {
	if (!step.attempt) return [];
	return [
		instancePiece(step.attempt.lhs, instances),
		text(' → '),
		...symbolPieces(step.attempt.rhs, instances)
	];
}

const MAX_LISTED = 4;

/** `T2 and T1`, `T3, T2, T1 and 4 more`. Without numbers each name is listed once. */
function instanceList(list: readonly Instance[], instances: boolean): Piece[] {
	let names = list;
	if (!instances) {
		const seen = new Set<string>();
		names = list.filter((i) => !seen.has(i.symbol) && !!seen.add(i.symbol));
	}
	const shown = names.length > MAX_LISTED ? names.slice(0, MAX_LISTED - 1) : names;
	const parts = shown.map((i) => [instancePiece(i, instances)]);
	if (shown.length < names.length) parts.push([text(`${names.length - shown.length} more`)]);
	return joinPieces(parts);
}

const MAX_TOKENS_LISTED = 8;

/**
 * A step in the slides' words, one array of pieces per line: "Mismatch: int
 * is not (" and "Backtrack …", "Match! Advance input.", "End of input,
 * accept" (slides 7–16); "Try E0 → T1 + E2" and "Have exhausted the choices
 * for T2 and T1" / "so backtrack to choice for E0" (slides 18–19). Without
 * `instances` the non-terminals are written without their numbers.
 */
export function describeStep(step: StepFacts, opts: { instances?: boolean } = {}): Piece[][] {
	const instances = opts.instances ?? true;
	switch (step.event) {
		case 'try':
			return [[text('Try '), ...attemptPieces(step, instances)]];
		case 'match':
			return [[text('Match! Advance input.')]];
		case 'mismatch': {
			const { expected, found } = step.compare!;
			const token = found === null ? 'end of input' : sym(found);
			return [[text(`Mismatch: ${sym(expected)} is not ${token}`)], [text('Backtrack …')]];
		}
		case 'backtrack': {
			const rest = step.remaining ?? [];
			const shown = rest.slice(0, MAX_TOKENS_LISTED).map(sym).join(' ');
			const more = rest.length > MAX_TOKENS_LISTED ? ' …' : '';
			return [[text(`Tokens remain after the parse: ${shown}${more}`)], [text('Backtrack …')]];
		}
		case 'exhausted':
			return [
				[text('Have exhausted the choices for '), ...instanceList(step.exhausted ?? [], instances)],
				[text('so backtrack to choice for '), instancePiece(step.target!, instances)]
			];
		case 'accept':
			return [[text('End of input, accept')]];
		case 'reject':
			return [[text('No more choices, reject')]];
		case 'stop': {
			if (step.stop?.reason !== 'depth')
				return [[text(`Stopped after ${step.stop?.limit ?? 0} steps`)]];
			const { limit, symbol } = step.stop;
			if (symbol === undefined)
				return [[text(`Stopped: ${limit} instances nested, no input consumed`)]];
			return [
				[
					text(`Stopped: ${limit} instances of `),
					{ text: sym(symbol), kind: 'nonterminal' },
					text(' nested, no input consumed')
				]
			];
		}
	}
}

/** The label of a tree node with its instance number: `E₀`; null for terminals. */
export function instanceLabel(node: ParseNode): string | null {
	const n = (node as RdNode).instance;
	return n === undefined || node.terminal ? null : plainText([{ text: node.symbol, sub: `${n}` }]);
}

/** The paths of the terminals of `tree` that are matched. */
export function matchedPaths(tree: RdNode): number[][] {
	const out: number[][] = [];
	if (tree.matched) out.push([]);
	// Depth first, left to right, with one path that grows and shrinks: only matched nodes copy it.
	const path: number[] = [];
	const open: { node: RdNode; next: number }[] = [{ node: tree, next: 0 }];
	while (open.length > 0) {
		const top = open[open.length - 1];
		if (top.next >= top.node.children.length) {
			open.pop();
			path.pop();
			continue;
		}
		const child = top.node.children[top.next];
		path.push(top.next++);
		if (child.matched) out.push([...path]);
		if (child.children.length > 0) open.push({ node: child, next: 0 });
		else path.pop();
	}
	return out;
}

// ───────────────────────────── the tree and its changes ─────────────────────────────

/** A tree node while the search runs, or while its changes are played back. */
interface Work {
	/** Number of the node in the order of creation; the root is 0. */
	id: number;
	symbol: string;
	terminal: boolean;
	instance?: number;
	parent: Work | null;
	/** Position among the parent's children. */
	index: number;
	depth: number;
	children: Work[];
	production?: number;
	matched: boolean;
	/** Input position at which the node was expanded (the search only). */
	start: number;
	/** The node as last drawn, until it or something below it changes (playback only). */
	snap: RdNode | null;
}

/**
 * One change to the partial tree. A run is a list of these; the tree of a
 * step is what the changes made before it leave behind.
 */
type Change =
	/** The node gets the right-hand side of a production as children, numbered from `first`. */
	| { kind: 'expand'; node: number; production: number; first: number; rhs: readonly FringeItem[] }
	/** The node's children are removed again. They have no children themselves by then. */
	| { kind: 'collapse'; node: number }
	| { kind: 'match'; node: number }
	| { kind: 'unmatch'; node: number };

/** The partial tree, with its nodes by id. */
class Tree {
	readonly root: Work;
	readonly nodes = new Map<number, Work>();

	constructor(start: string) {
		this.root = {
			id: 0,
			symbol: start,
			terminal: false,
			instance: 0,
			parent: null,
			index: 0,
			depth: 0,
			children: [],
			matched: false,
			start: 0,
			snap: null
		};
		this.nodes.set(0, this.root);
	}

	apply(change: Change): void {
		const node = this.nodes.get(change.node)!;
		switch (change.kind) {
			case 'expand':
				node.children = change.rhs.map((item, index) => {
					const kid: Work = {
						id: change.first + index,
						symbol: item.symbol,
						terminal: item.terminal,
						parent: node,
						index,
						depth: node.depth + 1,
						children: [],
						matched: false,
						start: 0,
						snap: null
					};
					if (item.instance !== undefined) kid.instance = item.instance;
					this.nodes.set(kid.id, kid);
					return kid;
				});
				node.production = change.production;
				break;
			case 'collapse':
				for (const kid of node.children) this.nodes.delete(kid.id);
				node.children = [];
				node.production = undefined;
				break;
			case 'match':
				node.matched = true;
				break;
			case 'unmatch':
				node.matched = false;
				break;
		}
		// The drawings of the node and of everything above it are out of date.
		for (let n: Work | null = node; n && n.snap; n = n.parent) n.snap = null;
	}
}

/** The node as plain data; subtrees that did not change since the last call are shared. */
function snapshot(root: Work): RdNode {
	if (root.snap) return root.snap;
	const open: { node: Work; done: number; kids: RdNode[] }[] = [{ node: root, done: 0, kids: [] }];
	for (;;) {
		const top = open[open.length - 1];
		if (top.done < top.node.children.length) {
			const child = top.node.children[top.done];
			if (child.snap) {
				top.kids.push(child.snap);
				top.done++;
			} else open.push({ node: child, done: 0, kids: [] });
			continue;
		}
		const { node } = top;
		const snap: RdNode = { symbol: node.symbol, terminal: node.terminal, children: top.kids };
		if (node.production !== undefined) snap.production = node.production;
		if (node.instance !== undefined) snap.instance = node.instance;
		if (node.matched) snap.matched = true;
		node.snap = snap;
		open.pop();
		if (open.length === 0) return snap;
		const parent = open[open.length - 1];
		parent.kids.push(snap);
		parent.done++;
	}
}

function fringeOf(root: Work): Fringe {
	const items: FringeItem[] = [];
	let matched = 0;
	let next = -1;
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.terminal) {
			if (node.matched) matched++;
			items.push({ symbol: node.symbol, terminal: true });
		} else if (node.production === undefined) {
			if (next < 0) next = items.length;
			items.push({ symbol: node.symbol, terminal: false, instance: node.instance });
		} else for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
	}
	return { items, matched, next };
}

function pathOf(node: Work): number[] {
	const path: number[] = [];
	for (let n = node; n.parent; n = n.parent) path.push(n.index);
	return path.reverse();
}

/** The node to process once `node` and everything below it is done; null after the last one. */
function successor(node: Work): Work | null {
	for (let n = node; n.parent; n = n.parent)
		if (n.index + 1 < n.parent.children.length) return n.parent.children[n.index + 1];
	return null;
}

const instanceOf = (node: Work): Instance => ({ symbol: node.symbol, instance: node.instance! });

// ───────────────────────────── steps ─────────────────────────────

/** What a step draws. */
interface View {
	tree: RdNode;
	path: number[] | null;
	fringe: Fringe;
	newFringe?: NewFringe;
}

/** Where a step is in the run: the changes made before it, and its current node. */
interface Mark {
	changes: number;
	at: number | null;
	rhs: readonly FringeItem[] | null;
}

/** Views kept, so a step that is drawn again (or read field by field) is not played again. */
const VIEWS_KEPT = 8;

/**
 * Plays the changes of a run on a tree of its own, to draw the step asked
 * for. Going forward it continues from where it is; going back it starts
 * again from the root, which for a run within the step budget is quick.
 */
class Playback {
	readonly tokens: readonly string[];
	readonly changes: Change[] = [];
	readonly marks: Mark[] = [];
	readonly #start: string;
	#tree: Tree;
	#applied = 0;
	readonly #views = new Map<number, View>();

	constructor(start: string, tokens: readonly string[]) {
		this.#start = start;
		this.tokens = tokens;
		this.#tree = new Tree(start);
	}

	view(index: number): View {
		const kept = this.#views.get(index);
		if (kept) return kept;
		const mark = this.marks[index];
		if (mark.changes < this.#applied) {
			this.#tree = new Tree(this.#start);
			this.#applied = 0;
		}
		while (this.#applied < mark.changes) this.#tree.apply(this.changes[this.#applied++]);
		const root = this.#tree.root;
		const fringe = fringeOf(root);
		const view: View = {
			tree: snapshot(root),
			path: mark.at === null ? null : pathOf(this.#tree.nodes.get(mark.at)!),
			fringe
		};
		if (mark.rhs) {
			// The right-hand side takes the place of the leftmost non-terminal.
			const at = fringe.next;
			const items = [...fringe.items.slice(0, at), ...mark.rhs, ...fringe.items.slice(at + 1)];
			view.newFringe = {
				items,
				matched: fringe.matched,
				next: items.findIndex((item) => !item.terminal),
				added: [at, at + mark.rhs.length]
			};
		}
		if (this.#views.size >= VIEWS_KEPT) this.#views.delete(this.#views.keys().next().value!);
		this.#views.set(index, view);
		return view;
	}
}

/** What a step holds itself; the rest is drawn by the playback. */
type StepData = Omit<BacktrackStep, 'tree' | 'path' | 'fringe' | 'newFringe' | 'remaining'>;

class Step implements BacktrackStep {
	declare event: BacktrackEvent;
	declare pos: number;
	declare production: number | null;
	declare within: number | null;
	declare attempt?: { lhs: Instance; rhs: FringeItem[] };
	declare compare?: { expected: string; found: string | null };
	declare exhausted?: Instance[];
	declare target?: Instance;
	declare stop?: StopInfo;
	declare message: string[];
	declare tries: number;
	declare backtracks: number;
	declare log: number;
	readonly #playback: Playback;
	readonly #index: number;

	constructor(playback: Playback, index: number, data: StepData) {
		this.#playback = playback;
		this.#index = index;
		Object.assign(this, data);
	}

	get tree(): RdNode {
		return this.#playback.view(this.#index).tree;
	}
	get path(): number[] | null {
		return this.#playback.view(this.#index).path;
	}
	get fringe(): Fringe {
		return this.#playback.view(this.#index).fringe;
	}
	get newFringe(): NewFringe | undefined {
		return this.#playback.view(this.#index).newFringe;
	}
	get remaining(): string[] | undefined {
		return this.event === 'backtrack' ? this.#playback.tokens.slice(this.pos) : undefined;
	}
}

// ───────────────────────────── the search ─────────────────────────────

/** An expanded non-terminal and the alternative applied at it. */
interface Choice {
	node: Work;
	alts: readonly Production[];
	k: number;
	/** Input position, numbering floor and number of matched terminals when the node was reached. */
	pos: number;
	floor: number;
	trail: number;
	entry: LogEntry | null;
}

/**
 * Parses `tokens` by recursive descent with backtracking and records every
 * step. The grammar's alternatives are tried in the order written.
 *
 * Instances are numbered as on slides 18–20: the root is 0, and a new
 * instance takes the smallest number above those of the instances before it
 * in the tree (above it and to its left) that no instance of the same
 * non-terminal is using. Numbers freed by backtracking are used again, so
 * Example 2 reads E0 → T1 + E2, T1 → ( E3 ), T1 → int, T1 → int * T2.
 *
 * A left-recursive grammar can keep the search going forever: pass `depthCap`
 * (see `leftRecursion` in the grammar engine and `depthCapFor`). `maxSteps`
 * bounds every run.
 */
export function backtrack(
	g: Grammar,
	tokens: readonly string[],
	opts: BacktrackOptions = {}
): BacktrackResult {
	const maxSteps = Math.max(2, Math.floor(opts.maxSteps ?? DEFAULT_MAX_STEPS));
	const depthCap = opts.depthCap ?? null;
	const alternatives = new Map<string, Production[]>(g.nonterminals.map((n) => [n, []]));
	for (const p of g.productions) alternatives.get(p.lhs)!.push(p);
	const inUse = new Map<string, Set<number>>(g.nonterminals.map((n) => [n, new Set<number>()]));

	const playback = new Playback(g.start, [...tokens]);
	const steps: BacktrackStep[] = [];
	const log: LogEntry[] = [];
	/** Alternatives removed since the last step: the next step is the first without them. */
	let undone: LogEntry[] = [];
	let tries = 0;
	let backtracks = 0;
	let depth = 0;

	// The search works on a tree of its own and writes down every change it makes to it.
	const tree = new Tree(g.start);
	const root = tree.root;
	inUse.get(g.start)!.add(0);
	let nodes = 1;
	const change = (c: Change): void => {
		playback.changes.push(c);
		tree.apply(c);
	};

	/** The leftmost node still to process; null when the tree is complete. */
	let cursor: Work | null = root;
	let pos = 0;
	/** Largest number among the instances expanded so far. */
	let floor = -1;
	const stack: Choice[] = [];
	/** The matched terminals, in the order they were matched. */
	const trail: Work[] = [];

	type Detail = Partial<
		Pick<
			BacktrackStep,
			'production' | 'within' | 'attempt' | 'compare' | 'exhausted' | 'target' | 'stop'
		>
	>;

	function emit(event: BacktrackEvent, at: Work | null, detail: Detail = {}): void {
		const index = steps.length;
		for (const entry of undone) entry.undone = index;
		undone = [];
		playback.marks.push({
			changes: playback.changes.length,
			at: at ? at.id : null,
			rhs: detail.attempt ? detail.attempt.rhs : null
		});
		const step = new Step(playback, index, {
			event,
			pos,
			production: null,
			within: null,
			...detail,
			message: [],
			tries,
			backtracks,
			log: log.length
		});
		step.message = describeStep(step).map(plainText);
		steps.push(step);
	}

	const full = (): boolean => steps.length >= maxSteps - 1;

	let outcome: BacktrackResult['outcome'] = 'stopped';
	let stop: StopInfo | null = null;

	/** Ends the run early with a `stop` step at `at`. */
	function halt(reason: StopInfo['reason'], limit: number, at: Work | null): false {
		stop = reason === 'depth' && at ? { reason, limit, symbol: at.symbol } : { reason, limit };
		log.push({ step: steps.length, undone: null, cause: null });
		emit('stop', at, { stop });
		return false;
	}

	/** Applies alternative `c.k` at `c.node`, which has no children. False when the run is over. */
	function attempt(c: Choice): boolean {
		const node = c.node;
		if (full()) return halt('steps', maxSteps, node);
		const p = c.alts[c.k];
		floor = Math.max(c.floor, node.instance!);
		let number = floor;
		const rhs = p.rhs.map((symbol): FringeItem => {
			const used = inUse.get(symbol);
			if (!used) return { symbol, terminal: true };
			do number++;
			while (used.has(number));
			used.add(number);
			return { symbol, terminal: false, instance: number };
		});
		node.start = pos;
		tries++;
		c.entry = { step: steps.length, undone: null, cause: null };
		log.push(c.entry);
		// The slide of a try shows the node before its children are drawn.
		emit('try', node, { production: p.id, attempt: { lhs: instanceOf(node), rhs } });
		change({ kind: 'expand', node: node.id, production: p.id, first: nodes, rhs });
		nodes += rhs.length;
		// An ε leaf is drawn one level below its production, like a child.
		depth = Math.max(depth, node.depth + 1);
		cursor = node.children.length > 0 ? node.children[0] : successor(node);
		return true;
	}

	/** Removes the alternative applied at `c.node` and everything matched since. */
	function undo(c: Choice): void {
		for (let i = trail.length - 1; i >= c.trail; i--)
			change({ kind: 'unmatch', node: trail[i].id });
		trail.length = c.trail;
		for (const kid of c.node.children)
			if (!kid.terminal) inUse.get(kid.symbol)!.delete(kid.instance!);
		change({ kind: 'collapse', node: c.node.id });
		pos = c.pos;
		floor = c.floor;
		if (c.entry) undone.push(c.entry);
	}

	/** Goes back to the most recent choice that has an alternative left. False when the run is over. */
	function fail(cause: number): boolean {
		const exhausted: Work[] = [];
		const top = stack[stack.length - 1];
		if (top?.entry) top.entry.cause = cause;
		while (stack.length > 0) {
			const c = stack[stack.length - 1];
			if (c.k + 1 >= c.alts.length) {
				undo(c);
				exhausted.push(c.node);
				stack.pop();
				continue;
			}
			if (exhausted.length > 0) {
				if (full()) return halt('steps', maxSteps, c.node);
				log.push({ step: steps.length, undone: null, cause: null });
				emit('exhausted', c.node, {
					exhausted: exhausted.map(instanceOf),
					target: instanceOf(c.node)
				});
			}
			undo(c);
			c.k++;
			return attempt(c);
		}
		cursor = null;
		log.push({ step: steps.length, undone: null, cause: null });
		emit('reject', null, { exhausted: exhausted.map(instanceOf) });
		outcome = 'reject';
		return false;
	}

	/**
	 * Instances of `node`'s non-terminal above it that were expanded at the
	 * current input position. Other non-terminals between them do not count: a
	 * chain of rules such as A → B, B → C is as long as the grammar makes it,
	 * and only a non-terminal that comes round to itself can go on without end.
	 */
	function nested(node: Work): number {
		let count = 0;
		for (let n = node.parent; n && n.start === pos; n = n.parent)
			if (n.symbol === node.symbol) count++;
		return count;
	}

	for (;;) {
		if (cursor === null && pos === tokens.length) {
			log.push({ step: steps.length, undone: null, cause: null });
			emit('accept', null);
			outcome = 'accept';
			break;
		}
		if (full()) {
			halt('steps', maxSteps, cursor);
			break;
		}
		if (cursor === null) {
			backtracks++;
			emit('backtrack', null);
			if (!fail(steps.length - 1)) break;
			continue;
		}
		const node: Work = cursor;
		if (node.terminal) {
			const found = pos < tokens.length ? tokens[pos] : null;
			const detail: Detail = {
				compare: { expected: node.symbol, found },
				within: node.parent!.production!
			};
			if (found === node.symbol) {
				emit('match', node, detail);
				change({ kind: 'match', node: node.id });
				trail.push(node);
				pos++;
				cursor = successor(node);
			} else {
				backtracks++;
				emit('mismatch', node, detail);
				if (!fail(steps.length - 1)) break;
			}
			continue;
		}
		if (depthCap !== null && nested(node) >= depthCap) {
			halt('depth', depthCap, node);
			break;
		}
		const choice: Choice = {
			node,
			alts: alternatives.get(node.symbol)!,
			k: 0,
			pos,
			floor,
			trail: trail.length,
			entry: null
		};
		stack.push(choice);
		if (!attempt(choice)) break;
	}

	const accepted = outcome === 'accept';
	return {
		steps,
		log,
		outcome,
		stop,
		get tree(): RdNode | null {
			return accepted ? steps[steps.length - 1].tree : null;
		},
		tries,
		backtracks,
		depth
	};
}
