import { describe, expect, it } from 'vitest';
import {
	formatItem,
	mergeLookaheads,
	productionText,
	stateAnnotations,
	annotationText,
	type ItemView
} from '$lib/components/grammar';
import {
	bottomUpSlideTree,
	bottomUpTree,
	shiftReduceForest
} from '$lib/components/grammar/fixtures';
import {
	derivationFromTree,
	firstOfSequence,
	firstSets,
	followSets,
	makeGrammar,
	parseGrammar,
	parseTrees,
	tokenizeInput,
	treeEquals,
	yieldOf,
	EPSILON,
	END_MARKER,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import {
	bottomUpGrammar,
	cellCode,
	configurationPieces,
	configurationText,
	conflictExamples,
	formPieces,
	handleRows,
	ll1Columns,
	ll1Grammar,
	ll1Sets,
	ll1Table,
	ll1Trace,
	lrEdges,
	lrGrammar,
	lrNonterminals,
	lrStates,
	lrTableRows,
	lrTerminals,
	shiftReduceForestRow,
	sectionLink,
	sectionTools,
	shiftReduceTrace,
	type LrCell,
	type ParsingSectionId,
	type SectionTool,
	type ShiftReduceRow
} from './parsing-notation';
import { presetFor as conflictsPresetFor } from '$lib/tools/conflicts/presets';
import { isConflictsHash, stateFromHash as conflictsState } from '$lib/tools/conflicts/state';
import { isLL1Hash, stateFromHash as ll1State } from '$lib/tools/ll1/state';
import { isLr1Hash, stateFromHash as lr1State } from '$lib/tools/lr1/state';
import { toolBySlug } from '$lib/tools/registry';
import {
	isShiftReduceHash,
	stateFromHash as shiftReduceState
} from '$lib/tools/shift-reduce/state';
import { decode } from '$lib/url-state';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

describe('LL(1) examples (Table-based Predictive Parsing)', () => {
	const g = grammar(ll1Grammar);

	it('lists First and Follow as the engine computes them', () => {
		const first = firstSets(g);
		const follow = followSets(g);
		for (const row of ll1Sets) {
			expect([...first.get(row.nonterminal)!]).toEqual(row.first);
			expect([...follow.get(row.nonterminal)!]).toEqual(row.follow);
		}
		expect(ll1Sets.map((r) => r.nonterminal).sort()).toEqual([...g.nonterminals].sort());
	});

	it('fills the table by the rule of slide 24, with no cell defined twice', () => {
		const first = firstSets(g);
		const follow = followSets(g);
		const built = new Map<string, string[][]>();
		const put = (a: string, b: string, rhs: string[]) => {
			const key = `${a} ${b}`;
			built.set(key, [...(built.get(key) ?? []), rhs]);
		};
		for (const p of g.productions) {
			const f = firstOfSequence(g, p.rhs, first);
			for (const b of f) if (b !== EPSILON) put(p.lhs, b, p.rhs);
			if (f.has(EPSILON)) for (const b of follow.get(p.lhs)!) put(p.lhs, b, p.rhs);
		}
		for (const cells of built.values()) expect(cells).toHaveLength(1);
		const written = new Map<string, string[][]>();
		for (const row of ll1Table) {
			for (const [column, rhs] of Object.entries(row.cells)) {
				written.set(`${row.nonterminal} ${column}`, [rhs]);
			}
		}
		expect(written).toEqual(built);
		expect([...ll1Columns]).toEqual(['int', '*', '+', '(', ')', '$']);
		expect(ll1Table.map((r) => r.nonterminal)).toEqual(['T', 'E', 'X', 'Y']);
	});

	it('traces int * int $ as the algorithm of slide 11 runs it', () => {
		const table = new Map(ll1Table.map((r) => [r.nonterminal, r.cells]));
		let stack = [g.start, END_MARKER];
		let input = ['int', '*', 'int', END_MARKER];
		const rows: { stack: string[]; input: string[]; action: string }[] = [];
		for (let guard = 0; guard < 50; guard++) {
			const top = stack[0];
			if (top === END_MARKER && input[0] === END_MARKER) {
				rows.push({ stack, input, action: 'ACCEPT' });
				break;
			}
			const cells = table.get(top);
			if (cells) {
				const rhs = cells[input[0] as keyof typeof cells]!;
				rows.push({ stack, input, action: rhs.length ? rhs.join(' ') : 'ε' });
				stack = [...rhs, ...stack.slice(1)];
			} else {
				expect(top).toBe(input[0]);
				rows.push({ stack, input, action: 'terminal' });
				stack = stack.slice(1);
				input = input.slice(1);
			}
		}
		expect(ll1Trace).toEqual(rows);
	});
});

/** The reverse of the rightmost derivation of a tree: each form with the handle that reduces it. */
function reductions(g: Grammar, tree: ParseNode) {
	const d = derivationFromTree(g, tree, 'rightmost');
	const forms = [d.start, ...d.steps.map((s) => s.form)];
	return d.steps
		.map((step, k) => {
			const p = g.productions[step.production];
			return {
				form: forms[k + 1],
				handle: [step.index, step.index + p.rhs.length] as [number, number],
				production: p
			};
		})
		.reverse();
}

describe('handles (Bottom-Up Parsing)', () => {
	const g = grammar(bottomUpGrammar);

	it('uses the only parse tree of int + ( int ), and the slides’ tree of int + ( int ) + ( int )', () => {
		const small = parseTrees(g, yieldOf(bottomUpTree));
		expect(small.trees).toHaveLength(1);
		expect(treeEquals(small.trees[0], bottomUpTree)).toBe(true);
		const slide = parseTrees(g, yieldOf(bottomUpSlideTree));
		expect(slide.trees).toHaveLength(1);
		expect(treeEquals(slide.trees[0], bottomUpSlideTree)).toBe(true);
	});

	it('lists the forms of a reverse rightmost derivation with their handles', () => {
		const steps = reductions(g, bottomUpTree);
		expect(handleRows).toEqual([
			...steps.map((s) => ({ form: s.form, handle: s.handle })),
			{ form: ['E'], handle: null }
		]);
		// Right of every handle there are only terminals (slide 11).
		for (const row of handleRows) {
			if (row.handle) {
				expect(row.form.slice(row.handle[1]).every((s) => g.terminals.includes(s))).toBe(true);
			}
		}
	});

	it('writes forms as the slides do, the handle in one piece', () => {
		expect(formPieces(['int', '+', '(', 'int', ')'], 0, 1)).toEqual([
			{ text: 'int', mark: true },
			{ text: ' + (int)' }
		]);
		expect(formPieces(['E', '+', '(', 'int', ')'], 3, 4)).toEqual([
			{ text: 'E + (' },
			{ text: 'int', mark: true },
			{ text: ')' }
		]);
		expect(formPieces(['E', '+', '(', 'E', ')'], 0, 5)).toEqual([{ text: 'E + (E)', mark: true }]);
		expect(formPieces(['E'])).toEqual([{ text: 'E' }]);
		expect(formPieces([])).toEqual([]);
	});
});

/** A shift-reduce parse of a tree, rows as slide 14 writes them (consecutive shifts in one row). */
function shiftReduceRows(g: Grammar, tree: ParseNode): ShiftReduceRow[] {
	const rows: ShiftReduceRow[] = [];
	let stack: string[] = [];
	let input = yieldOf(tree);
	for (const { form, handle, production } of reductions(g, tree)) {
		const shifts = handle[1] - stack.length;
		if (shifts > 0) {
			rows.push({
				stack,
				input,
				action: shifts === 1 ? 'shift' : `shift ${shifts} times`,
				next: shifts
			});
			stack = [...stack, ...input.slice(0, shifts)];
			input = input.slice(shifts);
		}
		expect(stack).toEqual(form.slice(0, handle[1]));
		rows.push({
			stack,
			input,
			action: `red. ${productionText(production.lhs, production.rhs, 'hug')}`,
			next: production.rhs.length
		});
		stack = [...form.slice(0, handle[0]), production.lhs];
	}
	rows.push({ stack, input, action: 'accept', next: 0 });
	return rows;
}

describe('shift-reduce parsing (Bottom-up Parsing II)', () => {
	const g = grammar(bottomUpGrammar);

	it('traces int + (int) + (int)$ as a shift-reduce parse does', () => {
		expect(shiftReduceTrace).toEqual(shiftReduceRows(g, bottomUpSlideTree));
	});

	it('writes the configurations of slide 14 word for word', () => {
		expect(shiftReduceTrace.map(configurationText)).toEqual([
			'I int + (int) + (int)$',
			'int I + (int) + (int)$',
			'E I + (int) + (int)$',
			'E + (int I ) + (int)$',
			'E + (E I ) + (int)$',
			'E + (E) I + (int)$',
			'E I + (int)$',
			'E + (int I )$',
			'E + (E I )$',
			'E + (E) I $',
			'E I $'
		]);
		expect(shiftReduceTrace.map((r) => r.action)).toEqual([
			'shift',
			'red. E → int',
			'shift 3 times',
			'red. E → int',
			'shift',
			'red. E → E + (E)',
			'shift 3 times',
			'red. E → int',
			'shift',
			'red. E → E + (E)',
			'accept'
		]);
	});

	it('marks the symbols each action works on', () => {
		const marked = shiftReduceTrace.map((row) => {
			const { left, right } = configurationPieces(row);
			return [...left, ...right]
				.filter((p) => p.mark)
				.map((p) => p.text)
				.join('|');
		});
		expect(marked).toEqual([
			'int',
			'int',
			'+ (int',
			'int',
			')',
			'E + (E)',
			'+ (int',
			'int',
			')',
			'E + (E)',
			''
		]);
	});

	it('draws the partial parse of int + (int) at E + (int I )$', () => {
		const rows = shiftReduceRows(g, bottomUpTree);
		const at = shiftReduceForestRow;
		expect(rows).toContainEqual(at);
		expect(configurationText(at)).toBe('E + (int I )$');
		const { roots, marker } = shiftReduceForest;
		expect(roots.map((r) => r.symbol)).toEqual([...at.stack, ...at.input]);
		expect(marker).toBe(at.stack.length);
		expect(roots.flatMap((r) => yieldOf(r))).toEqual(yieldOf(bottomUpTree));
	});
});

// ───────────────────────── LR(1) construction (Bottom-up Parsing III, slides 10–14) ─────────────────────────

interface Lr1Item {
	production: number;
	dot: number;
	lookahead: string;
}

/**
 * The canonical LR(1) collection by Closure and Transition as slides 10 and 13
 * write them, states numbered breadth first; from each state, the terminal
 * edges in the order of the items, then the non-terminal edges (the numbering
 * of Bottom-up Parsing II, slide 17).
 */
function lr1(g: Grammar) {
	const first = firstSets(g);
	const key = (it: Lr1Item) => `${it.production}.${it.dot}.${it.lookahead}`;
	const isNonterminal = (s: string) => g.nonterminals.includes(s);
	const closure = (kernel: Lr1Item[]): Lr1Item[] => {
		const items = [...kernel];
		const seen = new Set(items.map(key));
		for (let i = 0; i < items.length; i++) {
			const { production, dot, lookahead } = items[i];
			const rhs = g.productions[production].rhs;
			const y = rhs[dot];
			if (y === undefined || !isNonterminal(y)) continue;
			const after = firstOfSequence(g, [...rhs.slice(dot + 1), lookahead], first);
			for (const p of g.productions) {
				if (p.lhs !== y) continue;
				for (const b of after) {
					const it = { production: p.id, dot: 0, lookahead: b };
					if (!seen.has(key(it))) {
						seen.add(key(it));
						items.push(it);
					}
				}
			}
		}
		return items;
	};
	const setKey = (items: Lr1Item[]) => items.map(key).sort().join(' ');
	const states = [closure([{ production: 0, dot: 0, lookahead: END_MARKER }])];
	const keys = [setKey(states[0])];
	const edges: [number, string, number][] = [];
	for (let s = 0; s < states.length; s++) {
		const next: string[] = [];
		for (const it of states[s]) {
			const y = g.productions[it.production].rhs[it.dot];
			if (y !== undefined && !next.includes(y)) next.push(y);
		}
		for (const y of [...next.filter((y) => !isNonterminal(y)), ...next.filter(isNonterminal)]) {
			const target = closure(
				states[s]
					.filter((it) => g.productions[it.production].rhs[it.dot] === y)
					.map((it) => ({ ...it, dot: it.dot + 1 }))
			);
			let t = keys.indexOf(setKey(target));
			if (t < 0) {
				t = states.length;
				states.push(target);
				keys.push(setKey(target));
			}
			edges.push([s, y, t]);
		}
	}
	const view = (it: Lr1Item): ItemView => ({
		lhs: g.productions[it.production].lhs,
		rhs: g.productions[it.production].rhs,
		dot: it.dot,
		lookaheads: [it.lookahead]
	});
	return { states: states.map((items) => items.map(view)), edges };
}

const full = (items: readonly ItemView[]) =>
	items.flatMap((it) => it.lookaheads.map((a) => formatItem({ ...it, lookaheads: [a] })));

describe('LR(1) items and tables (Bottom-up Parsing II and III)', () => {
	const g = grammar(lrGrammar);
	const dfa = lr1(g);

	it('reproduces states 0–6 of slide 14, items in order', () => {
		expect(dfa.states).toHaveLength(12);
		for (const state of lrStates) {
			expect(
				mergeLookaheads(dfa.states[state.number]).map((it) => formatItem(it, 'compact'))
			).toEqual(state.items.map((it) => formatItem(it, 'compact')));
		}
		// The slide draws the edges among states 0–6.
		expect(dfa.edges.filter(([from, , to]) => from <= 6 && to <= 6)).toEqual(lrEdges);
	});

	it('labels the states as Bottom-up Parsing II, slide 17 does', () => {
		const notes = dfa.states.map((items) =>
			stateAnnotations(items, { start: g.start }).map(annotationText).join('; ')
		);
		expect(notes).toEqual([
			'',
			'E → int on $, +',
			'accept on $',
			'',
			'',
			'E → int on ), +',
			'',
			'E → E + (E) on $, +',
			'',
			'',
			'',
			'E → E + (E) on ), +'
		]);
		expect(dfa.edges).toEqual([
			[0, 'int', 1],
			[0, 'E', 2],
			[2, '+', 3],
			[3, '(', 4],
			[4, 'int', 5],
			[4, 'E', 6],
			[6, ')', 7],
			[6, '+', 8],
			[8, '(', 9],
			[9, 'int', 5],
			[9, 'E', 10],
			[10, ')', 11],
			[10, '+', 8]
		]);
	});

	it('writes rows 3–7 of the table as slide 19 does, row 6 under + and )', () => {
		const table = dfa.states.map((items, s) => {
			const cells: Record<string, LrCell> = {};
			for (const [from, y, to] of dfa.edges) {
				if (from === s)
					cells[y] = { kind: g.nonterminals.includes(y) ? 'goto' : 'shift', state: to };
			}
			for (const it of items) {
				if (it.dot < it.rhs.length) continue;
				for (const a of it.lookaheads) {
					cells[a] =
						it.lhs === g.start
							? { kind: 'accept' }
							: { kind: 'reduce', lhs: it.lhs, rhs: [...it.rhs] };
				}
			}
			return { state: s, cells };
		});
		expect(table.slice(3, 8)).toEqual(lrTableRows);
		expect(table[2].cells.$).toEqual({ kind: 'accept' });
		const columns = new Set(table.flatMap((r) => Object.keys(r.cells)));
		expect([...columns].sort()).toEqual([...lrTerminals, ...lrNonterminals].sort());
	});

	it('codes the cells as s, g and r with the production', () => {
		expect(lrTableRows.flatMap((r) => Object.values(r.cells).map(cellCode))).toEqual([
			{ code: 's4' },
			{ code: 's5' },
			{ code: 'g6' },
			{ code: 'r', production: 'E→int' },
			{ code: 'r', production: 'E→int' },
			{ code: 's8' },
			{ code: 's7' },
			{ code: 'r', production: 'E→E+(E)' },
			{ code: 'r', production: 'E→E+(E)' }
		]);
		expect(cellCode({ kind: 'accept' })).toEqual({ code: 'accept' });
	});

	it('takes the conflict examples from real states of their grammars', () => {
		for (const ex of conflictExamples) {
			const base = grammar(ex.grammar);
			const augmented = makeGrammar([
				{ lhs: 'S’', rhs: [base.start] },
				...base.productions.map((p) => ({ lhs: p.lhs, rhs: p.rhs }))
			]);
			const { states, edges } = lr1(augmented);
			const found = states.findIndex((items) => {
				const all = new Set(full(items));
				return full(ex.from).every((it) => all.has(it));
			});
			expect(found, ex.grammar).toBeGreaterThanOrEqual(0);
			const to = edges.find(([from, y]) => from === found && y === ex.symbol)![2];
			const all = new Set(full(states[to]));
			expect(full(ex.to).every((it) => all.has(it))).toBe(true);
			// A slide without … shows both states whole.
			if (!ex.partial) {
				expect(full(states[found]).sort()).toEqual(full(ex.from).sort());
				expect([...all].sort()).toEqual(full(ex.to).sort());
			}
		}
	});
});

describe('section tools', () => {
	/** What each tool makes of a link, or null when it refuses the hash. */
	const opens: Record<
		SectionTool['slug'],
		(value: unknown) => { grammar: string; input: string; precedence?: string } | null
	> = {
		ll1: (v) => (isLL1Hash(v) ? ll1State(v) : null),
		'shift-reduce': (v) => (isShiftReduceHash(v) ? shiftReduceState(v) : null),
		lr1: (v) => (isLr1Hash(v) ? lr1State(v) : null),
		conflicts: (v) => (isConflictsHash(v) ? conflictsState(v) : null)
	};
	const ids = Object.keys(sectionTools) as ParsingSectionId[];

	it('opens each section’s tool on its example, as the tool reads it', () => {
		expect(ids).toHaveLength(10);
		for (const id of ids) {
			const { slug, state } = sectionTools[id];
			const link = sectionLink(id)!;
			expect(link.title, id).toBe(toolBySlug(slug)!.title);
			const [path, hash] = link.href.split('#');
			expect(path, id).toBe(`/${slug}`);
			const opened = opens[slug](decode(hash));
			expect(opened, id).toMatchObject(state);
			const g = grammar(opened!.grammar);
			expect(tokenizeInput(opened!.input, g.terminals).diagnostics, id).toEqual([]);
		}
	});

	it('uses the grammars and strings of the sections', () => {
		expect(sectionTools['ll1-traces'].state).toEqual({ grammar: ll1Grammar, input: 'int * int' });
		expect(ll1Trace[0].input.join(' ')).toBe('int * int $');
		expect(sectionTools.handles.state).toEqual({
			grammar: bottomUpGrammar,
			input: handleRows[0].form.join(' ')
		});
		expect(sectionTools['shift-reduce'].state.input).toBe(shiftReduceTrace[0].input.join(' '));
		expect(sectionTools.conflicts.state.grammar).toBe(conflictExamples[0].grammar);
	});

	it('opens the conflicts examples on the presets of the same slides', () => {
		const presetOf = (id: ParsingSectionId) => {
			const value = decode(sectionLink(id)!.href.split('#')[1]);
			return conflictsPresetFor(conflictsState(value as never))?.id;
		};
		expect(presetOf('conflicts')).toBe('ambiguous');
		expect(presetOf('bison')).toBe('precedence');
	});
});
