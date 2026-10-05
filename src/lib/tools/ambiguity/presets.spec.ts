/**
 * Every preset loads without problems and reproduces what its slides show
 * (Ambiguity, Precedence, Associativity & Top-Down Parsing, slides 3–18).
 */
import { describe, expect, it } from 'vitest';
import { describeTree } from '$lib/components/grammar/tree-layout';
import { decks, formatCitation } from '$lib/lectures';
import { parseGrammar } from '$lib/theory/grammar';
import { tool } from '$lib/tools/catalog/ambiguity';
import { toolBySlug, toolsForStage } from '$lib/tools/registry';
import { toolLink } from '$lib/tools/links';
import { buildCascade } from './cascade';
import { compareTexts } from './compare';
import { printDeclaration } from './declarations';
import {
	analyzeDeclarations,
	analyzeRewrite,
	leafLabeler,
	leftmostChain,
	listTrees,
	readSource,
	verdictText
} from './model';
import {
	ADDITION,
	AMBIGUOUS,
	CASCADE,
	DANGLING_ELSE,
	DEFAULT_PRESET_ID,
	DEFAULT_STATE,
	MATCHED_IF,
	SUM_PRODUCT,
	presetFor,
	presets,
	presetState,
	type AmbiguityPreset
} from './presets';

const FORBIDDEN =
	/helps? you|understand|learn|intuition|explore|discover|common mistake|misconception|university|professor|instructor/i;

function load(id: string) {
	const preset = presets.find((p) => p.id === id);
	if (!preset) throw new Error(`no preset ${id}`);
	return view(preset);
}

/** Everything the page computes for a preset. */
function view(preset: AmbiguityPreset) {
	const state = presetState(preset);
	const source = readSource(state);
	const original = source.ready ? listTrees(source.grammar!, source) : null;
	const rewrite = analyzeRewrite(source, original, state.rewrite);
	const declarations =
		source.grammar && original
			? analyzeDeclarations(source.grammar, source, original, state.decls)
			: null;
	const labels = leafLabeler(source.display);
	return { preset, state, source, original, rewrite, declarations, labels };
}

describe('the catalog entry', () => {
	it('registers the tool in the syntax stage', () => {
		expect(tool).toMatchObject({
			slug: 'ambiguity',
			title: 'Ambiguity and Precedence',
			summary:
				'List every parse tree of a string, then remove the ambiguity by rewriting the grammar or by declaring precedence and associativity.',
			stage: 'syntax',
			order: 20,
			cites: [{ deck: '10', slide: [2, 19] }]
		});
		expect(toolBySlug('ambiguity')).toBe(tool);
		expect(toolsForStage('syntax')).toContain(tool);
		expect(formatCitation(tool.cites[0])).toBe(
			'Ambiguity, Precedence, Associativity & Top-Down Parsing · slides 2–19'
		);
	});

	it('can be linked to with a grammar and a string', () => {
		const href = toolLink('ambiguity', { grammar: AMBIGUOUS, input: 'int + int + int' });
		expect(href).toMatch(/\/ambiguity#v1\./);
	});
});

describe('every preset', () => {
	it.each(presets.map((p) => [p.id, p] as const))('%s loads without problems', (_, preset) => {
		const v = view(preset);
		expect(v.source.grammarDiagnostics).toEqual([]);
		expect(v.source.inputDiagnostics).toEqual([]);
		expect(v.source.labelProblems).toEqual([]);
		expect(v.source.valuesError).toBeNull();
		expect(v.source.ready).toBe(true);
		expect(v.original!.trees.length).toBeGreaterThan(0);
		expect(v.original!.truncated).toBe(false);
		expect(v.original!.valuesNote).toBeNull();
		// Every tree has a leftmost derivation that ends in the string.
		for (const entry of v.original!.trees) {
			const chain = leftmostChain(v.source.grammar!, entry.tree);
			expect(chain.forms[chain.forms.length - 1]).toEqual(v.source.tokens);
		}
		expect(v.rewrite.diagnostics).toEqual([]);
		expect(v.rewrite.unknown).toEqual([]);
		expect(v.rewrite.empty).toBe(v.state.rewrite === '');
		if (!v.rewrite.empty) expect(v.rewrite.listing!.trees.length).toBeGreaterThan(0);
		expect(v.declarations!.problems).toEqual([]);
		// The cascade builder starts from the slide's levels in every preset.
		expect(buildCascade(v.state.levels, v.state.atoms).text).toBe(CASCADE);
	});

	it('has a unique id, a slide of this deck, a description and plain copy', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		expect(new Set(presets.map((p) => p.label)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.cite.deck).toBe('10');
			expect(decks[p.cite.deck]).toBeDefined();
			expect(p.cite.slide).toBeDefined();
			expect(p.group).toBeTruthy();
			expect(p.description).toMatch(/\.$/);
			const copy = [
				p.label,
				p.description,
				...(p.questions ?? []).flatMap((q) => [q.prompt, q.answer])
			];
			for (const text of copy) expect(text).not.toMatch(FORBIDDEN);
			for (const q of p.questions ?? []) {
				expect(q.prompt).toMatch(/\?$/);
				expect(q.answer.length).toBeGreaterThan(10);
			}
		}
	});

	it('is the one the page finds for its own state', () => {
		for (const p of presets) expect(presetFor(presetState(p))?.id).toBe(p.id);
		// Fields outside the match may change without losing the preset.
		const state = presetState(presets[0]);
		expect(presetFor({ ...state, tab: 'declarations', abbreviated: true, values: '' })?.id).toBe(
			presets[0].id
		);
		expect(presetFor({ ...state, input: 'int' })).toBeUndefined();
	});

	it('stays the one shown when a view switch is turned', () => {
		// Slides 3–4 and slide 6 share the grammar and the string.
		const sum = presetState(presets.find((p) => p.id === 'sum')!);
		const definition = presetState(presets.find((p) => p.id === 'definition')!);
		expect([sum.grammar, sum.input]).toEqual([definition.grammar, definition.input]);
		// Turning the derivations on under slides 3–4 does not move the page to slide 6 …
		const turnedOn = { ...sum, derivations: true };
		expect(presetFor(turnedOn, 'sum')?.id).toBe('sum');
		expect(presetFor({ ...sum, flipped: [2] }, 'sum')?.id).toBe('sum');
		// … nor turning them off under slide 6 to slides 3–4.
		expect(presetFor({ ...definition, derivations: false }, 'definition')?.id).toBe('definition');
		expect(presetFor({ ...definition, flipped: [1] }, 'definition')?.id).toBe('definition');
		// A link carries no preset: the switch says which of the two it is.
		expect(presetFor(turnedOn)?.id).toBe('definition');
		expect(presetFor(turnedOn, null)?.id).toBe('definition');
		expect(presetFor(sum)?.id).toBe('sum');
		// The preset loaded last counts only while it fits the state.
		expect(presetFor(sum, 'cascade')?.id).toBe('sum');
		expect(presetFor({ ...sum, input: 'int' }, 'sum')).toBeUndefined();
		for (const p of presets) expect(presetFor(presetState(p), p.id)?.id).toBe(p.id);
	});

	it('starts on int * int + int (slide 5)', () => {
		expect(DEFAULT_PRESET_ID).toBe('product-sum');
		expect(DEFAULT_STATE).toEqual(presetState(presets.find((p) => p.id === 'product-sum')!));
		expect(DEFAULT_STATE.grammar).toBe('E → E + E | E * E | ( E ) | int');
		expect(DEFAULT_STATE.input).toBe('int * int + int');
		expect(presetFor(DEFAULT_STATE)?.cite).toEqual({ deck: '10', slide: 5 });
	});
});

describe('slides 3–4: int + int + int', () => {
	const v = load('sum');

	it('has the grammar and the first string of slide 3', () => {
		expect(v.state.grammar).toBe('E → E + E | E * E | ( E ) | int');
		expect(v.state.input).toBe('int + int + int');
		expect(v.preset.cite).toEqual({ deck: '10', slide: [3, 4] });
	});

	it('has two parse trees, the left-nested one first', () => {
		expect(v.original!.trees.map((t) => t.bracket)).toEqual([
			'E( E( E(int) + E(int) ) + E(int) )',
			'E( E(int) + E( E(int) + E(int) ) )'
		]);
		expect(verdictText(v.original!)).toBe('2 parse trees: the grammar is ambiguous');
	});

	it('computes the same value with both trees', () => {
		expect(v.original!.trees.map((t) => t.value)).toEqual([
			{ ok: true, value: 6, text: '(1 + 2) + 3' },
			{ ok: true, value: 6, text: '1 + (2 + 3)' }
		]);
	});

	it('poses the slide’s questions', () => {
		expect(v.preset.questions!.map((q) => q.prompt)).toEqual([
			'int + int + int has two parse trees, which are ?',
			'Which one do we want? Does it matter?'
		]);
	});
});

describe('slide 5: int * int + int', () => {
	const v = load('product-sum');

	it('has two parse trees: + at the root, then * at the root', () => {
		expect(v.original!.trees.map((t) => t.bracket)).toEqual([
			'E( E( E(int) * E(int) ) + E(int) )',
			'E( E(int) * E( E(int) + E(int) ) )'
		]);
		expect(v.original!.trees.map((t) => t.tree.children[1].symbol)).toEqual(['+', '*']);
	});

	it('computes two values with the two trees', () => {
		expect(v.original!.trees.map((t) => t.value?.ok && [t.value.text, t.value.value])).toEqual([
			['(2 * 3) + 4', 10],
			['2 * (3 + 4)', 14]
		]);
		expect(v.preset.questions!.map((q) => q.prompt)).toEqual(['Which one do we want?']);
	});

	it('has nothing in the rewrite and declarations tabs yet', () => {
		expect(v.rewrite.empty).toBe(true);
		expect(v.declarations!.kept).toEqual([0, 1]);
		expect(v.declarations!.undeclared).toEqual(['+', '*']);
	});
});

describe('slide 6: more than one leftmost derivation', () => {
	const v = load('definition');

	it('shows the derivations', () => {
		expect(v.state.derivations).toBe(true);
		expect(v.preset.questions![0].prompt).toMatch(/Equivalently, there is more than one \?$/);
		expect(v.preset.questions![0].answer).toMatch(/^Leftmost derivation/);
	});

	it('has two different leftmost derivations of one string', () => {
		const chains = v.original!.trees.map((t) =>
			leftmostChain(v.source.grammar!, t.tree)
				.forms.map((f) => f.join(' '))
				.join(' → ')
		);
		expect(chains).toEqual([
			'E → E + E → E + E + E → int + E + E → int + int + E → int + int + int',
			'E → E + E → int + E → int + E + E → int + int + E → int + int + int'
		]);
	});
});

describe('slides 7–8 and 10: the precedence cascade', () => {
	const v = load('cascade');

	it('rewrites the grammar as on slide 8', () => {
		expect(v.state.rewrite).toBe('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		expect(v.state.tab).toBe('rewrite');
		expect(v.preset.questions![0].prompt).toBe(
			'E → E + E | E * E | ( E ) | int can be rewritten as ?'
		);
	});

	it('has only one parse tree now', () => {
		expect(v.rewrite.listing!.trees.map((t) => t.bracket)).toEqual([
			'E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )'
		]);
		expect(verdictText(v.rewrite.listing!, 'the rewritten grammar')).toBe('1 parse tree');
		expect(v.rewrite.listing!.trees[0].value).toEqual({
			ok: true,
			value: 10,
			text: '(2 * 3) + 4'
		});
	});

	it('crosses out the old tree with * at the root', () => {
		expect(v.rewrite.matches).toEqual([1, null]);
		const crossed = v.original!.trees[1];
		expect(crossed.bracket).toBe('E( E(int) * E( E(int) + E(int) ) )');
		expect(crossed.tree.children[1].symbol).toBe('*');
	});

	it('generates the same strings as the ambiguous grammar', () => {
		const r = compareTexts({
			original: v.state.grammar,
			rewritten: v.state.rewrite,
			maxLength: v.state.maxLength
		});
		expect(r).toMatchObject({
			status: 'done',
			checkedUpTo: v.state.maxLength,
			onlyOriginal: { count: 0 },
			onlyRewritten: { count: 0 }
		});
	});
});

describe('slides 11–12: the dangling else', () => {
	const v = load('dangling-else');

	it('has the grammar of slide 11 and shows the string of slide 12', () => {
		expect(v.state.grammar).toBe(DANGLING_ELSE);
		expect(parseGrammar(v.state.grammar).grammar!.productions.map((p) => p.rhs.join(' '))).toEqual([
			'if E then E',
			'if E then E else E',
			'OTHER'
		]);
		expect(v.state.input).toBe('if OTHER then if OTHER then OTHER else OTHER');
		expect(v.source.display.join(' ')).toBe('if E₁ then if E₂ then E₃ else E₄');
		expect(v.preset.label).toBe('if E₁ then if E₂ then E₃ else E₄');
	});

	it('has two parse trees, drawn abbreviated as on the slide', () => {
		expect(verdictText(v.original!)).toBe('2 parse trees: the grammar is ambiguous');
		expect(v.state.abbreviated).toBe(true);
		// Left: the else belongs to the outer if (three children). Right: to the inner if.
		expect(v.original!.trees.map((t) => describeTree(t.abbreviated!, v.labels))).toEqual([
			'if ( E₁ if ( E₂ E₃ ) E₄ )',
			'if ( E₁ if ( E₂ E₃ E₄ ) )'
		]);
		expect(v.original!.trees.map((t) => t.grouping)).toEqual([
			'if E₁ then (if E₂ then E₃) else E₄',
			'if E₁ then (if E₂ then E₃ else E₄)'
		]);
	});

	it('keeps the full parse trees for when the abbreviation is off', () => {
		expect(v.original!.trees.map((t) => t.bracket)).toEqual([
			'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) ) else E(OTHER) )',
			'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) else E(OTHER) ) )'
		]);
	});

	it('poses the slides’ questions', () => {
		expect(v.preset.questions!.map((q) => q.prompt)).toEqual([
			'Ambiguous?',
			'Which one do we want?'
		]);
	});
});

describe('slides 13–14: MIF and UIF', () => {
	const v = load('matched-if');

	it('has the grammar exactly as slide 13 writes it, comments included', () => {
		expect(v.state.rewrite).toBe(MATCHED_IF);
		expect(v.state.rewrite).toContain('/* all then are matched */');
		expect(v.state.rewrite).toContain('/* some then is unmatched */');
		expect(v.rewrite.grammar!.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ')}`)).toEqual([
			'E → MIF',
			'E → UIF',
			'MIF → if E then MIF else MIF',
			'MIF → OTHER',
			'UIF → if E then E',
			'UIF → if E then MIF else UIF'
		]);
	});

	it('has one valid tree: the else belongs to the inner if', () => {
		expect(v.rewrite.listing!.trees).toHaveLength(1);
		const [valid] = v.rewrite.listing!.trees;
		expect(describeTree(valid.abbreviated!, v.labels)).toBe('if ( E₁ if ( E₂ E₃ E₄ ) )');
		expect(valid.bracket).toBe(
			'E( UIF( if E( MIF(OTHER) ) then E( MIF( if E( MIF(OTHER) ) then MIF(OTHER) else MIF(OTHER) ) ) ) )'
		);
	});

	it('crosses out the tree with the else on the outer if', () => {
		expect(v.rewrite.matches).toEqual([null, 1]);
		expect(describeTree(v.original!.trees[0].abbreviated!, v.labels)).toBe(
			'if ( E₁ if ( E₂ E₃ ) E₄ )'
		);
		expect(v.rewrite.origins).toEqual([2]);
	});

	it('answers the blanks of slide 14: a valid tree for UIF, the middle E is not MIF', () => {
		const [valid] = v.rewrite.listing!.trees;
		// E → UIF → if E then E, whose second E is the inner if-then-else, a MIF.
		const uif = valid.tree.children[0];
		expect(uif.symbol).toBe('UIF');
		expect(uif.children.map((c) => c.symbol)).toEqual(['if', 'E', 'then', 'E']);
		expect(uif.children[3].children[0].symbol).toBe('MIF');
		// if E₂ then E₃ is not a MIF: MIF derives no if without an else.
		const rules = [
			'E → MIF | UIF',
			'MIF → if E then MIF else MIF | OTHER',
			'UIF → if E then E | if E then MIF else UIF'
		];
		const startingAt = (name: string) =>
			parseGrammar([...rules].sort((a) => (a.startsWith(name) ? -1 : 0)).join('\n')).grammar!;
		const mif = startingAt('MIF');
		expect(mif.start).toBe('MIF');
		const middle = readSource({
			grammar: MATCHED_IF,
			input: 'if OTHER then OTHER',
			labels: '',
			values: ''
		});
		expect(listTrees(mif, middle).trees).toEqual([]);
		expect(listTrees(startingAt('UIF'), middle).trees).toHaveLength(1);
		const [, forUif, notMif] = v.preset.questions!;
		expect(forUif.answer).toMatch(/^UIF\./);
		expect(notMif.answer).toMatch(/^MIF\./);
	});

	it('describes the same set of strings (slide 13), up to length 9', () => {
		expect(v.preset.questions![0].prompt).toBe('Does this describe the same set of strings?');
		expect(v.preset.questions![0].answer).toMatch(/^Yes\./);
		const r = compareTexts({ original: v.state.grammar, rewritten: v.state.rewrite, maxLength: 9 });
		expect(r).toEqual({
			status: 'done',
			checkedUpTo: 9,
			maxLength: 9,
			onlyOriginal: { count: 0, examples: [] },
			onlyRewritten: { count: 0, examples: [] }
		});
	});
});

describe('slide 17: %left +', () => {
	const v = load('left-assoc');

	it('has the grammar, string and declaration of the slide', () => {
		expect(v.state.grammar).toBe(ADDITION);
		expect(v.state.grammar).toBe('E → E + E | int');
		expect(v.state.input).toBe('int + int + int');
		expect(v.state.decls.map(printDeclaration)).toEqual(['%left +']);
		expect(v.state.tab).toBe('declarations');
	});

	it('is ambiguous: two parse trees of int + int + int', () => {
		expect(verdictText(v.original!)).toBe('2 parse trees: the grammar is ambiguous');
	});

	it('crosses out the right-nested tree and keeps the left-nested one', () => {
		expect(v.original!.trees.map((t) => t.grouping)).toEqual([
			'(int + int) + int',
			'int + (int + int)'
		]);
		expect(v.declarations!.kept).toEqual([0]);
		expect(v.declarations!.reasons).toEqual([
			[],
			['+ is left-associative, so the right operand of + cannot be another +']
		]);
	});
});

describe('slide 18: %left + then %left *', () => {
	const v = load('precedence');

	it('has the grammar, string and declarations of the slide', () => {
		expect(v.state.grammar).toBe(SUM_PRODUCT);
		expect(v.state.grammar).toBe('E → E + E | E * E | int');
		expect(v.state.input).toBe('int + int * int');
		expect(v.state.decls.map(printDeclaration)).toEqual(['%left +', '%left *']);
	});

	it('crosses out the tree with * at the root, which the slide draws on the left', () => {
		expect(v.original!.trees.map((t) => t.bracket)).toEqual([
			'E( E( E(int) + E(int) ) * E(int) )',
			'E( E(int) + E( E(int) * E(int) ) )'
		]);
		expect(v.declarations!.kept).toEqual([1]);
		expect(v.declarations!.reasons).toEqual([
			['* binds tighter than +, so + cannot be an operand of *'],
			[]
		]);
		expect(v.original!.trees.map((t) => t.value?.ok && t.value.value)).toEqual([20, 14]);
	});
});
