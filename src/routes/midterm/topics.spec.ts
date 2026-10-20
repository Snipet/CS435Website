import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { navLinks } from '$lib/site';
import {
	presetFor as ambiguityPresetFor,
	presets as ambiguityPresets
} from '$lib/tools/ambiguity/presets';
import {
	isAmbiguityHash,
	stateFromHash as ambiguityState,
	type AmbiguityHash
} from '$lib/tools/ambiguity/state';
import {
	presetFor as conflictsPresetFor,
	presetState as conflictsPresetState,
	presets as conflictsPresets
} from '$lib/tools/conflicts/presets';
import { isConflictsHash, stateFromHash as conflictsState } from '$lib/tools/conflicts/state';
import {
	FOLLOW_START,
	presetFor as ll1PresetFor,
	presetState as ll1PresetState,
	presets as ll1Presets
} from '$lib/tools/ll1/presets';
import { isLL1Hash, stateFromHash as ll1State } from '$lib/tools/ll1/state';
import {
	presetFor as lr1PresetFor,
	presetState as lr1PresetState,
	presets as lr1Presets
} from '$lib/tools/lr1/presets';
import { isLr1Hash, stateFromHash as lr1State } from '$lib/tools/lr1/state';
import {
	presetFor as shiftReducePresetFor,
	presetState as shiftReducePresetState,
	presets as shiftReducePresets
} from '$lib/tools/shift-reduce/presets';
import {
	isShiftReduceHash,
	stateFromHash as shiftReduceState
} from '$lib/tools/shift-reduce/state';
import {
	defaultState as flexDefault,
	fromLink as flexState,
	isFlexState
} from '$lib/tools/flex/state';
import {
	activePreset as grammarActivePreset,
	applyPreset as applyGrammarPreset,
	presetById as grammarPreset,
	presets as grammarPresets
} from '$lib/tools/grammar/presets';
import {
	DEFAULT_MAX_LENGTH,
	isGrammarHash,
	stateFromHash as grammarState
} from '$lib/tools/grammar/state';
import { isLexerHash, normalizeState as lexerState } from '$lib/tools/lexer/state';
import {
	defaultState as phasesDefault,
	isPhasesHash,
	stateFromHash as phasesState
} from '$lib/tools/phases/state';
import { toolBySlug, tools } from '$lib/tools/registry';
import { DEFAULT_PRESET as CMINUS_DEFAULT_PRESET } from '$lib/tools/cminus/presets';
import {
	defaultState as cminusDefault,
	isCminusHash,
	stateFromHash as cminusState
} from '$lib/tools/cminus/state';
import { TAB_LABEL as CMINUS_TABS } from '$lib/tools/cminus/views';
import {
	presetFor as predictivePresetFor,
	presetState as predictivePresetState,
	presets as predictivePresets
} from '$lib/tools/rd-predictive/presets';
import { isPredictiveHash, stateFromHash as predictiveState } from '$lib/tools/rd-predictive/state';
import {
	DEFAULT_STATE as SCANNER_DEFAULT,
	isSavedState as isScannerHash,
	loadState as scannerState
} from '$lib/tools/scanner-dfa/state';
import {
	defaultState as subsetDefault,
	isSubsetHash,
	stateFromHash as subsetState
} from '$lib/tools/subset/state';
import { presetById as tDiagramsPreset } from '$lib/tools/t-diagrams/presets';
import {
	isTDiagramsHash,
	startsFrom,
	stateFromHash as tDiagramsState,
	stateFromPreset
} from '$lib/tools/t-diagrams/state';
import {
	DEFAULT_STATE as THOMPSON_DEFAULT,
	isThompsonHash,
	stateFromHash as thompsonState
} from '$lib/tools/thompson/state';
import type { ToolMeta } from '$lib/tools/types';
import { decode } from '$lib/url-state';
import Home from '../+page.svelte';
import Page from './+page.svelte';
import { ID_SEPARATOR, lines as checklistLines } from './checklist';
import {
	CMINUS_SYNTAX_TREE,
	CMINUS_VISITOR,
	CONFLICTS_PRESETS,
	ENDS_IN_ONE,
	EXAM,
	FOUR_TUPLE,
	HAND_CODED_SWITCH,
	LL1_PRESETS,
	LR1_PRESETS,
	NOTATION_SECTIONS,
	PLAIN_SLUGS,
	PRECEDENCE_CASCADE,
	STAR_NOTE,
	SUMMARY,
	SYNTAX_TREE,
	TITLE,
	VISITOR_TAB,
	allTopics,
	chipFor,
	chipsFor,
	isInline,
	sectionStars,
	sectionTitle,
	sections,
	type NotationSection,
	type Section,
	type Topic,
	type TopicLink,
	type ToolTopicLink
} from './topics';

/**
 * The midterm review list (exam on Thursday 10/22): one block per group, a line
 * per topic, points indented under their topic, and the list's asterisks in
 * front of a line. As handed out, "Predictive RD" and "Bottom-Up" are written
 * twice, each time in another place.
 */
const LIST = `
What is compiler?

* Language Impl Methods
  “Languages are not interpreted or compiled” (witness “cling”, the C++ interpreter)
  Compilation (AOT)
  Pure Interpretation — how TINY VM worked
  Hybrid Impl. — translate to IR and interpret — Python
  JIT — Java, .NET
  JavaScript?
  Examples of each
  * Bytecode: Python and Java

** Phases of Compilation
  Preprocessor — macros and textual inclusion
  Lexer
  Parser
  Semantic Analyzer
    Type Checking
    Symbol Table
  Intermed. Codegen
  Optimizer
  Code Generator
  Target Code Optimizer
  Assembler
  Linker

Analysis/Synthesis Model
Front/Middle/Back end
Role of IR
Passes

* T-Diagrams
  Cross compiler
  Retargetable compiler
  Bootstrapping

History
  Assembly vs. High-level
  * Fortran

Lexical Analysis
  Tokens (categories) vs. lexemes
  Lookahead
  Languages and alphabets
  * Regular Expressions
  Disambiguation
    maximal munch
    first match
  DFAs, NFAs
  * RE to NFA (Thompson’s Construction)
  * NFA to DFA (Subset Construction)
  Table driven scanner
  Hand-coding a scanner
    Ada
    C-
  * Flex
    Pattern/action rules
    C- Scanner
    Word count
  grep

Parsing
  Grammars
  Formal defn of CFG (N, T, S, P)
  * Chomsky Hierarchy
    3 Regular
    2 CF
    1 CS
    0 Unrestricted
  * Derivations
    leftmost
    rightmost
    mixed
  Parse trees and relation to derivations
    Derivation defines parse tree
    One tree can have many derivations
  * Bison
  * ASTs
  Ambiguity
  * Precedence cascades
  Parsing Algorithms
    Top-Down
      Generate-Match parsing
      RD with backtracking
      Predictive RD
      ** Computing First and Follow sets
        Fixed-point computations
      * Table Driven LL(1)
    Bottom-Up
      Shift-Reduce parsing
      * LR(1) algorithm
    ** Predictive RD
      * Left factoring (use EBNF)
      * Remove left recursion (use EBNF)
      Associativity
      * Building AST
      ** Visitor Design Pattern
    Table Driven
      * Remove left recursion (no EBNF)
      * Left factor (no EBNF)
      Explicit stack
      Generate RHSs/match tokens
      ** Computing First/Follow sets
      ** Building table!
  Bottom-Up
    Reduce string to start symbol
    Produce rightmost derivation in reverse
    ** LR(1)
      * LR(1) Items
      * Closure(Items)
      * Constructing DFA and table
`;

function outline(list: readonly Section[]): string {
	return list
		.map((section) =>
			allTopics([section])
				.map(({ topic, depth }) => '  '.repeat(depth) + '*'.repeat(topic.stars) + topic.text)
				.join('\n')
				// "* Fortran": a space after the asterisks.
				.replace(/^( *\*+)/gm, '$1 ')
		)
		.join('\n\n');
}

const lines = allTopics().map((entry) => entry.topic);

/**
 * The line of the list with this text. A text the list has twice is named with
 * the text of a line above it: "Top-Down › Predictive RD".
 */
function line(text: string): Topic {
	const found = checklistLines.filter(
		(l) => l.id === text || l.id.endsWith(`${ID_SEPARATOR}${text}`)
	);
	if (found.length !== 1) throw new Error(`${found.length} lines read "${text}"`);
	return found[0].topic;
}

const isTool = (link: TopicLink): link is ToolTopicLink => link.kind === 'tool';
const toolLinks = lines.flatMap((t) => t.links.filter(isTool));

/** The link of a line to one tool, with the state it opens the tool on. */
function opened(text: string, slug: string) {
	const link = line(text).links.find((l) => l.kind === 'tool' && l.slug === slug);
	if (!link || link.kind !== 'tool' || link.open === undefined)
		throw new Error(`"${text}" does not open ${slug} on a state`);
	return link;
}

const stateOf = (text: string, slug: string): unknown => opened(text, slug).state;

/** The links of a line to one tool on a state, in order. */
const openedAll = (text: string, slug: string) =>
	line(text).links.flatMap((l) => (l.kind === 'tool' && l.slug === slug && l.open ? [l] : []));

/** The key of a table of written-out presets whose entry a link's state is. */
const keyOf = (table: Record<string, unknown>, state: unknown) =>
	Object.keys(table).find((key) => table[key] === state);

/** What the links of a line read as: "Tool: Scanner Rules · new foo". */
const chipTexts = (text: string) =>
	chipsFor(line(text).links).map(
		(c) => `${c.kind}: ${c.name}${c.example === undefined ? '' : ` · ${c.example}`}`
	);

/** Reads a file by its path from this folder. */
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the list', () => {
	it('has the groups, the order and the wording of the review list', () => {
		expect(outline(sections)).toBe(LIST.trim());
	});

	it('marks the lines the list marks: two asterisks seven times, one asterisk twenty-three times', () => {
		const starred = lines.filter((t) => t.stars > 0).map((t) => `${t.stars} ${t.text}`);
		expect(starred).toEqual([
			'1 Language Impl Methods',
			'1 Bytecode: Python and Java',
			'2 Phases of Compilation',
			'1 T-Diagrams',
			'1 Fortran',
			'1 Regular Expressions',
			'1 RE to NFA (Thompson’s Construction)',
			'1 NFA to DFA (Subset Construction)',
			'1 Flex',
			'1 Chomsky Hierarchy',
			'1 Derivations',
			'1 Bison',
			'1 ASTs',
			'1 Precedence cascades',
			'2 Computing First and Follow sets',
			'1 Table Driven LL(1)',
			'1 LR(1) algorithm',
			'2 Predictive RD',
			'1 Left factoring (use EBNF)',
			'1 Remove left recursion (use EBNF)',
			'1 Building AST',
			'2 Visitor Design Pattern',
			'1 Remove left recursion (no EBNF)',
			'1 Left factor (no EBNF)',
			'2 Computing First/Follow sets',
			'2 Building table!',
			'2 LR(1)',
			'1 LR(1) Items',
			'1 Closure(Items)',
			'1 Constructing DFA and table'
		]);
	});

	it('gives each group an anchor of its own', () => {
		const ids = sections.map((s) => s.id);
		expect(ids).toEqual([
			'compiler',
			'language-impl',
			'phases',
			'structure',
			't-diagrams',
			'history',
			'lexical-analysis',
			'parsing'
		]);
		for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});

	it('names a group by its top-level lines', () => {
		expect(sections.map(sectionTitle)).toEqual([
			'What is compiler?',
			'Language Impl Methods',
			'Phases of Compilation',
			'Analysis/Synthesis Model; Front/Middle/Back end; Role of IR; Passes',
			'T-Diagrams',
			'History',
			'Lexical Analysis',
			'Parsing'
		]);
		expect(sections.map(sectionStars)).toEqual([0, 1, 2, 0, 1, 0, 0, 0]);
	});

	it('writes every line once, and no two lines under one line alike', () => {
		expect(lines.length).toBe(104);
		expect(new Set(lines).size).toBe(lines.length);
		for (const t of lines) expect(t.text.trim()).toBe(t.text);
		const siblings = [
			...sections.map((s) => [...s.heads, ...s.topics]),
			...lines.map((t) => t.sub)
		];
		for (const list of siblings) {
			const texts = list.map((t) => t.text);
			expect(new Set(texts).size, texts.join(', ')).toBe(texts.length);
		}
	});

	it('has the two lines it writes twice in their two places', () => {
		const twice = (text: string) => lines.filter((t) => t.text === text);
		expect(twice('Predictive RD').map((t) => t.stars)).toEqual([0, 2]);
		expect(line('Top-Down › Predictive RD').sub).toEqual([]);
		expect(line('Parsing Algorithms › Predictive RD').sub.map((t) => t.text)).toEqual([
			'Left factoring (use EBNF)',
			'Remove left recursion (use EBNF)',
			'Associativity',
			'Building AST',
			'Visitor Design Pattern'
		]);
		expect(twice('Bottom-Up')).toHaveLength(2);
		expect(line('Parsing Algorithms › Bottom-Up').sub.map((t) => t.text)).toEqual([
			'Shift-Reduce parsing',
			'LR(1) algorithm'
		]);
		// The second stands next to Parsing Algorithms, as the list indents it.
		const parsing = sections.find((s) => s.id === 'parsing')!;
		expect(parsing.topics.map((t) => t.text).slice(-2)).toEqual([
			'Parsing Algorithms',
			'Bottom-Up'
		]);
		expect(line('Parsing › Bottom-Up').sub.map((t) => t.text)).toEqual([
			'Reduce string to start symbol',
			'Produce rightmost derivation in reverse',
			'LR(1)'
		]);
	});

	it('keeps the exam line and the note on the asterisks', () => {
		expect(EXAM).toBe('Thursday 10/22');
		expect(STAR_NOTE).toBe('Asterisks (*’s) are used to mark particularly important concepts');
	});

	it('runs points without links on one line, and gives points with links rows', () => {
		expect(isInline(line('Chomsky Hierarchy').sub)).toBe(true);
		expect(isInline(line('Semantic Analyzer').sub)).toBe(true);
		expect(isInline(line('Disambiguation').sub)).toBe(false);
		expect(isInline(line('Flex').sub)).toBe(false);
		expect(isInline(line('Parsing Algorithms').sub)).toBe(false);
		expect(isInline(line('Derivations').sub)).toBe(true);
		expect(isInline(line('Computing First and Follow sets').sub)).toBe(false);
		expect(isInline(line('Parsing › Bottom-Up').sub)).toBe(false);
	});
});

describe('tool links', () => {
	/** The keys of `LinkStates`, read from the source of `$lib/tools/links.ts`. */
	const linkSlugs = (() => {
		const body = /export interface LinkStates \{\n([\s\S]*?)\n\}/.exec(
			source('../../lib/tools/links.ts')
		);
		return [...(body?.[1] ?? '').matchAll(/^\t(?:'([^']+)'|(\w+))\??:/gm)].map((m) => m[1] ?? m[2]);
	})();

	it('reads the keys of LinkStates', () => {
		expect(linkSlugs).toEqual(expect.arrayContaining(['regex', 'thompson', 'scanner-dfa']));
		expect(linkSlugs).not.toContain('re');
	});

	it('point at a registered route or at a tool listed in LinkStates', () => {
		expect(toolLinks.length).toBeGreaterThan(40);
		for (const { slug } of toolLinks) {
			expect(toolBySlug(slug) !== undefined || linkSlugs.includes(slug), slug).toBe(true);
		}
	});

	it('use toolLink only for tools listed in LinkStates', () => {
		for (const link of toolLinks) {
			if (link.open === 'link') expect(linkSlugs, link.slug).toContain(link.slug);
			if (link.open === 'view') expect(PLAIN_SLUGS, link.slug).toContain(link.slug);
		}
	});

	it('open the other tools by their route, which is registered', () => {
		for (const slug of PLAIN_SLUGS) expect(toolBySlug(slug), slug).toBeDefined();
		// A tool the list uses that LinkStates does not list is one of them.
		const outside = toolLinks.map((l) => l.slug).filter((s) => !linkSlugs.includes(s));
		for (const slug of outside) expect(PLAIN_SLUGS, slug).toContain(slug);
	});

	it('cover the tools named for each topic', () => {
		const slugs = (text: string) =>
			line(text)
				.links.filter(isTool)
				.map((l) => l.slug);
		const expected: Record<string, string[]> = {
			'What is compiler?': ['phases'],
			'Pure Interpretation — how TINY VM worked': ['tiny-vm'],
			'Phases of Compilation': ['phases', 'cminus'],
			Lexer: ['phases', 'cminus'],
			'Semantic Analyzer': ['phases', 'cminus'],
			'Code Generator': ['phases', 'cminus'],
			'Preprocessor — macros and textual inclusion': ['phases'],
			Assembler: ['phases'],
			Linker: ['phases'],
			'Analysis/Synthesis Model': ['phases'],
			'Front/Middle/Back end': ['phases'],
			'Role of IR': ['phases'],
			Passes: ['phases'],
			'T-Diagrams': ['t-diagrams'],
			'Cross compiler': ['t-diagrams'],
			'Retargetable compiler': ['t-diagrams'],
			Bootstrapping: ['t-diagrams'],
			Fortran: ['lexer'],
			'Tokens (categories) vs. lexemes': ['lexer'],
			Lookahead: ['lexer'],
			'maximal munch': ['lexer'],
			'first match': ['lexer'],
			Disambiguation: ['lexer'],
			'Languages and alphabets': ['regex'],
			'Regular Expressions': ['regex'],
			grep: ['regex'],
			'DFAs, NFAs': ['automata'],
			'RE to NFA (Thompson’s Construction)': ['thompson'],
			'NFA to DFA (Subset Construction)': ['subset'],
			'Table driven scanner': ['scanner-dfa'],
			'Hand-coding a scanner': ['scanner-dfa', 'cminus'],
			Flex: ['flex'],
			'Pattern/action rules': ['flex'],
			'Word count': ['flex'],
			Grammars: ['grammar'],
			'Formal defn of CFG (N, T, S, P)': ['grammar'],
			'Chomsky Hierarchy': ['grammar'],
			Derivations: ['grammar'],
			'Parse trees and relation to derivations': ['grammar'],
			Bison: ['conflicts'],
			ASTs: ['rd-predictive', 'cminus', 'phases'],
			Ambiguity: ['ambiguity', 'conflicts'],
			'Precedence cascades': ['ambiguity'],
			'Generate-Match parsing': ['rd-backtracking', 'll1'],
			'RD with backtracking': ['rd-backtracking'],
			'Top-Down › Predictive RD': ['rd-predictive'],
			'Computing First and Follow sets': ['ll1', 'll1'],
			'Fixed-point computations': ['ll1', 'll1'],
			'Table Driven LL(1)': ['ll1', 'll1'],
			'Shift-Reduce parsing': ['shift-reduce'],
			'LR(1) algorithm': ['lr1'],
			'Parsing Algorithms › Predictive RD': ['rd-predictive'],
			'Left factoring (use EBNF)': ['rd-predictive'],
			'Remove left recursion (use EBNF)': ['rd-predictive'],
			Associativity: ['rd-predictive', 'rd-predictive'],
			'Building AST': ['rd-predictive', 'cminus'],
			'Visitor Design Pattern': ['cminus'],
			'Remove left recursion (no EBNF)': ['rd-predictive', 'll1'],
			'Left factor (no EBNF)': ['ll1'],
			'Explicit stack': ['ll1'],
			'Generate RHSs/match tokens': ['ll1'],
			'Computing First/Follow sets': ['ll1', 'll1'],
			'Building table!': ['ll1'],
			'Reduce string to start symbol': ['shift-reduce'],
			'Produce rightmost derivation in reverse': ['shift-reduce'],
			'LR(1)': ['lr1'],
			'LR(1) Items': ['lr1'],
			'Closure(Items)': ['lr1', 'lr1'],
			'Constructing DFA and table': ['lr1', 'lr1']
		};
		for (const [text, tools] of Object.entries(expected)) expect(slugs(text), text).toEqual(tools);
	});

	it('give a line at most three tool chips', () => {
		for (const topic of lines) {
			expect(topic.links.filter(isTool).length, topic.text).toBeLessThanOrEqual(3);
		}
	});

	it('link Tokens vs. lexemes, Lookahead and Disambiguation to the Scanner Rules tool, each on its own row', () => {
		for (const text of ['Tokens (categories) vs. lexemes', 'Lookahead', 'Disambiguation']) {
			expect(chipTexts(text)[0], text).toMatch(/^tool: Scanner Rules( · |$)/);
		}
		// The row itself, and not only the two points under it.
		expect(chipTexts('Disambiguation')).toEqual([
			'tool: Scanner Rules',
			'notation: Tokens and lexemes'
		]);
		expect(chipTexts('maximal munch')).toEqual(['tool: Scanner Rules · foo+3']);
		expect(chipTexts('first match')).toEqual(['tool: Scanner Rules · new foo']);
	});

	it('link Languages and alphabets, Regular Expressions and grep to the regex tool and to its notation section', () => {
		for (const text of ['Languages and alphabets', 'Regular Expressions', 'grep']) {
			const chips = chipTexts(text);
			expect(chips[0], text).toBe('tool: Regular Expressions');
			expect(chips, text).toContain('notation: Regular expressions');
		}
		// Alphabets and languages are defined in the section before it.
		expect(chipTexts('Languages and alphabets')).toEqual([
			'tool: Regular Expressions',
			'notation: Sets, strings, and languages',
			'notation: Regular expressions'
		]);
	});

	it('leave the topics the site does not cover without links', () => {
		for (const text of [
			'Language Impl Methods',
			'“Languages are not interpreted or compiled” (witness “cling”, the C++ interpreter)',
			'Compilation (AOT)',
			'Hybrid Impl. — translate to IR and interpret — Python',
			'JIT — Java, .NET',
			'JavaScript?',
			'Examples of each',
			'Bytecode: Python and Java',
			'Assembly vs. High-level',
			'C- Scanner',
			'Top-Down',
			'Parsing Algorithms › Bottom-Up',
			'Table Driven',
			'Parsing › Bottom-Up'
		]) {
			expect(line(text).links, text).toEqual([]);
		}
	});

	it('link the LL(1) and bottom-up topics to their tools, ahead of the notation sections', () => {
		const parsing = ['ll1', 'shift-reduce', 'lr1', 'conflicts'];
		for (const slug of parsing) expect(toolBySlug(slug), slug).toBeDefined();
		for (const text of [
			'Computing First and Follow sets',
			'Fixed-point computations',
			'Table Driven LL(1)',
			'Shift-Reduce parsing',
			'LR(1) algorithm',
			'Remove left recursion (no EBNF)',
			'Left factor (no EBNF)',
			'Explicit stack',
			'Generate RHSs/match tokens',
			'Computing First/Follow sets',
			'Building table!',
			'Reduce string to start symbol',
			'Produce rightmost derivation in reverse',
			'LR(1)',
			'LR(1) Items',
			'Closure(Items)',
			'Constructing DFA and table',
			'Bison'
		]) {
			const kinds = line(text).links.map((l) => l.kind);
			const tools = line(text).links.filter(isTool);
			expect(
				tools.some((l) => parsing.includes(l.slug)),
				text
			).toBe(true);
			// The tools first, then the notation sections.
			expect(kinds, text).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === 'tool' ? -1 : 1)));
		}
	});
});

describe('the state a link opens its tool on', () => {
	it('is accepted by the tool and comes back out of the link', () => {
		const accepts: Record<string, (v: unknown) => boolean> = {
			thompson: isThompsonHash,
			subset: isSubsetHash,
			lexer: isLexerHash,
			'scanner-dfa': isScannerHash,
			flex: isFlexState,
			grammar: isGrammarHash,
			ambiguity: isAmbiguityHash,
			phases: isPhasesHash,
			't-diagrams': isTDiagramsHash,
			'rd-predictive': isPredictiveHash,
			cminus: isCminusHash,
			ll1: isLL1Hash,
			'shift-reduce': isShiftReduceHash,
			lr1: isLr1Hash,
			conflicts: isConflictsHash
		};
		const withState = toolLinks.filter((l) => l.open !== undefined);
		expect(withState.length).toBeGreaterThan(40);
		for (const link of withState) {
			if (link.open === undefined) continue;
			expect(accepts[link.slug], link.slug).toBeDefined();
			const chip = chipFor(link);
			expect(chip, link.slug).not.toBeNull();
			const [path, hash] = chip!.href.split('#');
			expect(path).toBe(`/${link.slug}`);
			const state = decode(hash);
			expect(state).toEqual(JSON.parse(JSON.stringify(link.state)));
			expect(accepts[link.slug](state), `${link.slug}: ${link.example}`).toBe(true);
			expect(link.example).not.toBe('');
		}
	});

	it('is the RE of the Thompson and subset slides', () => {
		expect(ENDS_IN_ONE).toBe('(1 | 0)*1');
		const re = stateOf('RE to NFA (Thompson’s Construction)', 'thompson');
		expect(re).toEqual({ re: '(1 | 0)*1' });
		expect(isThompsonHash(re) && thompsonState(re)).toEqual(THOMPSON_DEFAULT);

		const nfa = stateOf('NFA to DFA (Subset Construction)', 'subset');
		expect(nfa).toEqual({ from: 're', re: '(1 | 0)*1' });
		expect(isSubsetHash(nfa) && subsetState(subsetDefault(), nfa)).toMatchObject({
			from: 're',
			re: '(1 | 0)*1',
			defs: ''
		});
		expect(chipTexts('RE to NFA (Thompson’s Construction)')).toEqual([
			"tool: Thompson's Construction · (1 | 0)*1"
		]);
		expect(chipTexts('NFA to DFA (Subset Construction)')).toEqual([
			'tool: Subset Construction · (1 | 0)*1'
		]);
	});

	it('is a Scanner Rules preset, named by its input', () => {
		const cases = [
			['Fortran', 'fortran-do', 'DO 15 I = 1.100', 'strip'],
			['Lookahead', 'lookahead-iffy', 'i if iffy', 'lookahead'],
			['maximal munch', 'foo-plus-3', 'foo+3', 'matches'],
			['first match', 'new-foo', 'new foo', 'matches']
		] as const;
		for (const [text, preset, input, tab] of cases) {
			const link = opened(text, 'lexer');
			expect(link.example, text).toBe(input);
			expect(link.code, text).toBe(true);
			const state = link.state;
			expect(isLexerHash(state) && lexerState(state), text).toMatchObject({ preset, input, tab });
		}
		// Fortran ignores spaces: the preset scans after stripping them.
		const fortran = stateOf('Fortran', 'lexer');
		expect(isLexerHash(fortran) && lexerState(fortran).strip).toBe(true);
	});

	it('is the hand-coded switch of the relop DFA, with the tool’s other fields as they first load', () => {
		const state = stateOf('Hand-coding a scanner', 'scanner-dfa');
		expect(state).toBe(HAND_CODED_SWITCH);
		expect(isScannerHash(state) && scannerState(SCANNER_DEFAULT, state)).toEqual({
			...SCANNER_DEFAULT,
			tab: 'switch'
		});
	});

	it('is the word-count spec of the flex slides', () => {
		const state = stateOf('Word count', 'flex');
		expect(isFlexState(state) && flexState(state)).toMatchObject({
			preset: 'example-2',
			input: 'hello world\n',
			view: 'run'
		});
		expect((state as { spec: string }).spec).toContain('++ch; ++wd; ++nl;');
	});

	it('is the Rules view of the flex tool on the spec it first loads', () => {
		const link = opened('Pattern/action rules', 'flex');
		expect(link.example).toBe('Rules');
		expect(isFlexState(link.state) && flexState(link.state)).toEqual({
			...flexDefault(),
			view: 'rules'
		});
	});

	it('shows the leftmost and the rightmost derivation of the tree of ( int + int ) * int', () => {
		const preset = grammarPreset('rewrite-rules')!;
		for (const text of ['Derivations', 'Parse trees and relation to derivations']) {
			const link = opened(text, 'grammar');
			expect(link.example, text).toBe('( int + int ) * int');
			expect(link.code, text).toBe(true);
			const state = link.state;
			expect.assert(isGrammarHash(state));
			const loaded = grammarState(state);
			expect(loaded, text).toEqual({
				...applyGrammarPreset(preset, { maxLength: DEFAULT_MAX_LENGTH }),
				lm: true,
				rm: true
			});
			expect(grammarActivePreset(loaded)?.id, text).toBe('rewrite-rules');
			// The derivation in the builder is complete, so the tool can list both.
			expect(loaded.steps.length, text).toBe(6);
		}
	});

	it('is the four-tuple preset of the grammar tool', () => {
		const preset = grammarPreset('four-tuple')!;
		const state = stateOf('Formal defn of CFG (N, T, S, P)', 'grammar');
		expect.assert(isGrammarHash(state));
		const loaded = grammarState(state);
		expect(loaded).toEqual(applyGrammarPreset(preset, { maxLength: DEFAULT_MAX_LENGTH }));
		expect(grammarActivePreset(loaded)?.id).toBe('four-tuple');
	});

	it('names the four-tuple link by the panel of the grammar tool, not by the slide’s question', () => {
		const link = opened('Formal defn of CFG (N, T, S, P)', 'grammar');
		expect(grammarPreset('four-tuple')!.label).toBe('N ? T ? S ?');
		expect(link.example).toBe('Four-tuple');
		expect(link.example).toBe(FOUR_TUPLE);
		expect(link.code).toBe(false);
		// The title of the panel on the tool's page.
		expect(source('../grammar/+page.svelte')).toContain(`<Panel title="${FOUR_TUPLE}"`);
		expect(chipTexts('Formal defn of CFG (N, T, S, P)')).toEqual([
			'tool: Context-Free Grammars · Four-tuple',
			'notation: Context-free grammars'
		]);
	});

	it('is named by an input, a view or a title, never by a question from a slide', () => {
		const prompts = [ll1Presets, shiftReducePresets, lr1Presets, conflictsPresets].flatMap((list) =>
			list.flatMap((p) => (p.questions ?? []).map((q) => q.prompt))
		);
		const questions = new Set([
			...grammarPresets.flatMap((p) => (p.questions ?? []).map((q) => q.question)),
			...prompts
		]);
		expect(questions).toContain('N ? T ? S ?');
		expect(questions).toContain('Consider the [E, int] entry');
		for (const link of toolLinks) {
			if (link.open === undefined) continue;
			const where = `${link.slug}: ${link.example}`;
			expect(link.example, where).not.toMatch(/\?/);
			expect(questions.has(link.example), where).toBe(false);
			expect(link.example.trim(), where).toBe(link.example);
		}
	});

	it('is the precedence-cascade preset of the ambiguity tool', () => {
		const preset = ambiguityPresets.find((p) => p.id === 'cascade')!;
		expect(PRECEDENCE_CASCADE).toEqual(preset.value);
		const state = stateOf('Precedence cascades', 'ambiguity');
		expect(state).toBe(PRECEDENCE_CASCADE);
		expect.assert(isAmbiguityHash(state));
		expect(ambiguityPresetFor(ambiguityState(state as AmbiguityHash))?.id).toBe('cascade');
	});

	it('is a preset of the Predictive Recursive Descent tool, named by its grammar or its tokens', () => {
		const cases = [
			['Left factoring (use EBNF)', 'suitable', 'E → T + E | T', 'ebnf'],
			['Remove left recursion (use EBNF)', 'left-recursion-ebnf', 'E → E + T | T', 'ebnf'],
			['Building AST', 'ast', 'int + int + int', 'ebnf'],
			['Remove left recursion (no EBNF)', 'general-form', 'S → S a | S b | c | d', 'bnf']
		] as const;
		for (const [text, id, example, form] of cases) {
			const link = opened(text, 'rd-predictive');
			const preset = predictivePresets.find((p) => p.id === id)!;
			expect(link.example, text).toBe(example);
			expect(link.code, text).toBe(true);
			expect([preset.value.grammar.split('\n')[0], preset.value.input], text).toContain(example);
			const state = link.state;
			expect.assert(isPredictiveHash(state));
			const loaded = predictiveState(state);
			expect(loaded, text).toEqual(predictivePresetState(preset));
			// The tool shows the preset's note and the slide's questions.
			expect(predictivePresetFor(loaded)?.id, text).toBe(id);
			// The result of removing left recursion is written with or without EBNF.
			expect(loaded.form, text).toBe(form);
		}
		// Left recursion gives left associativity, right recursion right associativity (slides 38–39).
		const associativity = line('Associativity').links.map((l) => {
			const state = l.kind === 'tool' && l.open === 'link' ? l.state : null;
			expect.assert(isPredictiveHash(state));
			const loaded = predictiveState(state);
			return [predictivePresetFor(loaded)?.id, l.kind === 'tool' && l.open && l.example];
		});
		expect(associativity).toEqual([
			['left-recursion-ebnf', 'E → E + T | T'],
			['right-recursion', 'A → X op A | X']
		]);
	});

	it('is the Syntax tree tab of the C- Compiler, on the program it first loads', () => {
		expect(CMINUS_SYNTAX_TREE.source).toBe(CMINUS_DEFAULT_PRESET.value.source);
		expect(CMINUS_SYNTAX_TREE.input).toBe(CMINUS_DEFAULT_PRESET.value.input);
		expect(CMINUS_TABS.syntax).toBe(SYNTAX_TREE);
		for (const text of ['ASTs', 'Building AST']) {
			const link = opened(text, 'cminus');
			expect(link.state, text).toBe(CMINUS_SYNTAX_TREE);
			expect(link.example, text).toBe('Syntax tree');
			const state = link.state;
			expect.assert(isCminusHash(state));
			expect(cminusState(state), text).toEqual({ ...cminusDefault(), tab: 'syntax' });
		}
		expect(chipTexts('ASTs')).toEqual([
			'tool: Predictive Recursive Descent',
			'tool: C- Compiler · Syntax tree',
			'tool: Compiler Phases'
		]);
	});

	it('is the Visitor tab of the C- Compiler, running PrintVisitor on the program it first loads', () => {
		expect(CMINUS_VISITOR.source).toBe(CMINUS_DEFAULT_PRESET.value.source);
		expect(CMINUS_VISITOR.input).toBe(CMINUS_DEFAULT_PRESET.value.input);
		expect(CMINUS_TABS.visitor).toBe(VISITOR_TAB);
		const link = opened('Visitor Design Pattern', 'cminus');
		expect(link.state).toBe(CMINUS_VISITOR);
		expect(link.example).toBe('Visitor');
		const state = link.state;
		expect.assert(isCminusHash(state));
		expect(cminusState(state)).toEqual({ ...cminusDefault(), tab: 'visitor', visitor: 'print' });
		expect(chipTexts('Visitor Design Pattern')).toEqual(['tool: C- Compiler · Visitor']);
	});

	it('is a preset of the LL(1) Parsing Table tool with its id, named by its input, grammar, entry or label', () => {
		const ids = (text: string) =>
			openedAll(text, 'll1').map((l) => (l.state as { preset?: string }).preset);
		expect({
			'Generate-Match parsing': ids('Generate-Match parsing'),
			'Computing First and Follow sets': ids('Computing First and Follow sets'),
			'Fixed-point computations': ids('Fixed-point computations'),
			'Table Driven LL(1)': ids('Table Driven LL(1)'),
			'Remove left recursion (no EBNF)': ids('Remove left recursion (no EBNF)'),
			'Left factor (no EBNF)': ids('Left factor (no EBNF)'),
			'Explicit stack': ids('Explicit stack'),
			'Generate RHSs/match tokens': ids('Generate RHSs/match tokens'),
			'Computing First/Follow sets': ids('Computing First/Follow sets'),
			'Building table!': ids('Building table!')
		}).toEqual({
			'Generate-Match parsing': ['trace'],
			'Computing First and Follow sets': ['first-sets', 'follow-sets'],
			'Fixed-point computations': ['first-sets', 'follow-sets'],
			'Table Driven LL(1)': ['table', 'trace'],
			'Remove left recursion (no EBNF)': ['bottom-up'],
			'Left factor (no EBNF)': ['left-factor'],
			'Explicit stack': ['trace'],
			'Generate RHSs/match tokens': ['trace'],
			'Computing First/Follow sets': ['first-sets', 'follow-sets'],
			'Building table!': ['table']
		});
		const linked = toolLinks.filter((l) => l.slug === 'll1' && l.open === 'link');
		expect(new Set(linked.map((l) => l.state)).size).toBe(Object.keys(LL1_PRESETS).length);
		for (const link of linked) {
			if (link.open !== 'link') continue;
			const state = link.state;
			expect.assert(isLL1Hash(state));
			const id = state.preset;
			const preset = ll1Presets.find((p) => p.id === id);
			expect(preset, `${id}`).toBeDefined();
			// Written out as the tool has it, and loaded as the tool loads it.
			expect(LL1_PRESETS[id as keyof typeof LL1_PRESETS], `${id}`).toEqual(preset!.value);
			const loaded = ll1State(state);
			expect(loaded, `${id}`).toEqual(ll1PresetState(preset!));
			expect(ll1PresetFor(loaded)?.id, `${id}`).toBe(id);
			const cell = preset!.value.cell;
			expect(link.example, `${id}`).toBe(
				id === 'table' && cell ? `[${cell[0]}, ${cell[1]}]` : preset!.label
			);
			expect(link.code, `${id}`).toBe(!/sets, pass by pass$/.test(link.example));
		}
		// First from the start, Follow from its first step, after First is done.
		expect(LL1_PRESETS['first-sets'].setStep).toBe(0);
		expect(LL1_PRESETS['follow-sets'].setStep).toBe(FOLLOW_START);
		// The grammar whose rewrite removes left recursion is left recursive.
		expect(LL1_PRESETS['bottom-up'].grammar).toMatch(/^E → E /);
		expect(chipTexts('Table Driven LL(1)')).toEqual([
			'tool: LL(1) Parsing Table · [E, int]',
			'tool: LL(1) Parsing Table · int * int $',
			'notation: LL(1) parsing tables',
			'notation: LL(1) parse traces'
		]);
	});

	it('is a preset of the Shift-Reduce Parsing tool, which it recognizes by its grammar, input and view', () => {
		const cases = [
			['Shift-Reduce parsing', 'slide-14', 'trace', true],
			['Reduce string to start symbol', 'slides-5-10', 'handles', false],
			['Produce rightmost derivation in reverse', 'slides-5-10', 'handles', false]
		] as const;
		for (const [text, id, view, code] of cases) {
			const link = opened(text, 'shift-reduce');
			const state = link.state;
			expect.assert(isShiftReduceHash(state));
			const loaded = shiftReduceState(state);
			// The tool reads a link without the preset it was loaded from.
			const preset = shiftReducePresetFor(loaded);
			expect(preset?.id, text).toBe(id);
			expect(loaded, text).toEqual(shiftReducePresetState(preset!));
			expect(loaded.view, text).toBe(view);
			expect(link.example, text).toBe(preset!.label);
			expect(link.code, text).toBe(code);
		}
		expect(chipTexts('Reduce string to start symbol')).toEqual([
			'tool: Shift-Reduce Parsing · Handles of int + (int) + (int)',
			'notation: Handles'
		]);
	});

	it('is a preset of the LR(1) Parser Builder, which it recognizes by the state the link opens', () => {
		const ids = (text: string) => openedAll(text, 'lr1').map((l) => keyOf(LR1_PRESETS, l.state));
		expect([
			ids('LR(1) algorithm'),
			ids('LR(1) Items'),
			ids('Closure(Items)'),
			ids('Constructing DFA and table')
		]).toEqual([
			['lr-parse'],
			['extend-context'],
			['start-context', 'transition'],
			['item-sets', 'table-fragment']
		]);
		// The head of the four opens the tool as it first loads.
		expect(line('LR(1)').links).toEqual([{ kind: 'tool', slug: 'lr1' }]);
		const linked = toolLinks.filter((l) => l.slug === 'lr1' && l.open === 'link');
		expect(new Set(linked.map((l) => l.state)).size).toBe(Object.keys(LR1_PRESETS).length);
		for (const link of linked) {
			if (link.open !== 'link') continue;
			const id = keyOf(LR1_PRESETS, link.state);
			const preset = lr1Presets.find((p) => p.id === id);
			expect(preset, `${id}`).toBeDefined();
			expect(link.state, `${id}`).toEqual(preset!.value);
			const state = link.state;
			expect.assert(isLr1Hash(state));
			const loaded = lr1State(state);
			expect(loaded, `${id}`).toEqual(lr1PresetState(preset!));
			// The tool reads a link without the preset it was loaded from.
			expect(lr1PresetFor(loaded)?.id, `${id}`).toBe(id);
			expect(link.example, `${id}`).toBe(preset!.label);
			expect(link.code, `${id}`).toBe(/^(Closure|Transition)\(|^int /.test(link.example));
		}
	});

	it('is a preset of the Conflicts & Precedence tool, which it recognizes by its grammar, input and declarations', () => {
		const cases = [
			['Bison', 'precedence'],
			['Ambiguity', 'dangling-else']
		] as const;
		expect(Object.keys(CONFLICTS_PRESETS).sort()).toEqual(cases.map((c) => c[1]).sort());
		for (const [text, id] of cases) {
			const link = opened(text, 'conflicts');
			expect(link.state, text).toBe(CONFLICTS_PRESETS[id]);
			const preset = conflictsPresets.find((p) => p.id === id)!;
			expect(link.state, text).toEqual(preset.value);
			const state = link.state;
			expect.assert(isConflictsHash(state));
			const loaded = conflictsState(state);
			expect(loaded, text).toEqual(conflictsPresetState(preset));
			expect(conflictsPresetFor(loaded)?.id, text).toBe(id);
			expect(link.example, text).toBe(preset.label);
			expect(link.code, text).toBe(false);
		}
		expect(chipTexts('Bison')).toEqual([
			"tool: Conflicts & Precedence · %left '+' then %left '*'",
			'notation: Precedence in bison',
			'notation: Disambiguating declarations'
		]);
	});

	it('groups the seven-phase table the way the topic names', () => {
		const cases = [
			['Analysis/Synthesis Model', 'analysis', 'Analysis / Synthesis'],
			['Front/Middle/Back end', 'ends', 'Front end / Back end'],
			['Role of IR', 'ends', 'Front end / Back end'],
			['Passes', 'passes', 'Passes']
		] as const;
		for (const [text, grouping, example] of cases) {
			const link = opened(text, 'phases');
			expect(link.example, text).toBe(example);
			const state = link.state;
			expect(isPhasesHash(state) && phasesState(phasesDefault(), state), text).toEqual({
				...phasesDefault(),
				view: 'seven',
				grouping
			});
		}
	});

	it('is the T-diagram preset of the topic', () => {
		const cases = [
			['Cross compiler', 'cross', 'Cross compiler'],
			['Retargetable compiler', 'retargetable', 'Retargetable compiler'],
			['Bootstrapping', 'bootstrap', 'Bootstrapping a compiler']
		] as const;
		for (const [text, id, example] of cases) {
			const preset = tDiagramsPreset(id)!;
			const link = opened(text, 't-diagrams');
			expect(link.example, text).toBe(example);
			const state = link.state;
			expect.assert(isTDiagramsHash(state));
			const loaded = tDiagramsState(state);
			expect(loaded, text).toEqual(stateFromPreset(preset.value, undefined, id));
			expect(startsFrom(loaded, preset), text).toBe(true);
		}
	});
});

describe('notation links', () => {
	const page = source('../notation/+page.svelte');
	const used = new Set(
		lines.flatMap((t) => t.links.flatMap((l) => (l.kind === 'notation' ? [l.section] : [])))
	);

	it('name sections of the notation page by their anchor and heading', () => {
		const entries = Object.entries(NOTATION_SECTIONS);
		expect(entries.length).toBeGreaterThan(10);
		for (const [id, title] of entries) {
			// Listed in the page's table of contents, and rendered as the section's <h2 id>.
			expect(page, id).toContain(`{ id: '${id}', title: '${title}' }`);
			expect(page, id).toContain(`{@render sectionHead('${id}', '${title}')}`);
		}
	});

	it('use every section that is listed', () => {
		expect([...used].sort()).toEqual(Object.keys(NOTATION_SECTIONS).sort());
	});

	it('cover the sections named for each topic', () => {
		const anchors = (text: string) =>
			line(text).links.flatMap((l) => (l.kind === 'notation' ? [l.section] : []));
		const expected: Record<string, NotationSection[]> = {
			'Tokens (categories) vs. lexemes': ['tokens'],
			'Languages and alphabets': ['sets', 'regex'],
			'Regular Expressions': ['regex'],
			Disambiguation: ['tokens'],
			'DFAs, NFAs': ['automata'],
			'Table driven scanner': ['tables'],
			Flex: ['flex'],
			grep: ['regex'],
			Grammars: ['productions'],
			'Formal defn of CFG (N, T, S, P)': ['cfg'],
			'Chomsky Hierarchy': ['chomsky'],
			Derivations: ['derivations'],
			'Parse trees and relation to derivations': ['trees'],
			Ambiguity: ['declarations'],
			Bison: ['bison', 'declarations'],
			'Parsing Algorithms': ['grammar-classes'],
			'RD with backtracking': ['descent'],
			'Top-Down › Predictive RD': ['descent', 'ebnf'],
			'Computing First and Follow sets': ['first-follow'],
			'Table Driven LL(1)': ['ll1-tables', 'll1-traces'],
			'Shift-Reduce parsing': ['shift-reduce'],
			'LR(1) algorithm': ['lr-tables'],
			'Left factoring (use EBNF)': ['ebnf'],
			'Remove left recursion (use EBNF)': ['ebnf'],
			'Explicit stack': ['ll1-traces'],
			'Generate RHSs/match tokens': ['ll1-traces'],
			'Computing First/Follow sets': ['first-follow'],
			'Building table!': ['ll1-tables'],
			'Reduce string to start symbol': ['handles'],
			'Produce rightmost derivation in reverse': ['handles'],
			'LR(1) Items': ['lr-items'],
			'Closure(Items)': ['lr-items'],
			'Constructing DFA and table': ['lr-items', 'lr-tables', 'conflicts']
		};
		for (const [text, ids] of Object.entries(expected)) expect(anchors(text), text).toEqual(ids);
	});

	it('become chips that point into the notation page', () => {
		expect(chipFor({ kind: 'notation', section: 'chomsky' })).toEqual({
			kind: 'notation',
			name: 'Chomsky hierarchy',
			href: '/notation#chomsky'
		});
	});
});

describe('chips', () => {
	const meta = (slug: string): ToolMeta => ({
		slug,
		title: `The ${slug} tool`,
		summary: '',
		stage: 'syntax',
		order: 1,
		cites: []
	});

	it('name the tool by its title and link to its route', () => {
		expect(chipFor({ kind: 'tool', slug: 'phases' })).toEqual({
			kind: 'tool',
			name: 'Compiler Phases',
			href: '/phases'
		});
		expect(chipTexts('Chomsky Hierarchy')).toEqual([
			'notation: Chomsky hierarchy',
			'tool: Context-Free Grammars'
		]);
		expect(chipTexts('first match')).toEqual(['tool: Scanner Rules · new foo']);
		expect(chipTexts('Passes')).toEqual(['tool: Compiler Phases · Passes']);
	});

	it('are left out for a tool that is not registered', () => {
		const none = () => undefined;
		for (const link of toolLinks) expect(chipFor(link, none), link.slug).toBeNull();
		// A notation link does not depend on the registry.
		expect(chipFor({ kind: 'notation', section: 'ebnf' }, none)?.href).toBe('/notation#ebnf');
	});

	it('appear for rd-predictive once it is registered', () => {
		const asts = line('ASTs').links;
		const registered = (slug: string) => toolBySlug(slug) ?? meta(slug);
		const chip = chipFor(asts[0], registered);
		expect(chip).toEqual({
			kind: 'tool',
			name: toolBySlug('rd-predictive')?.title ?? 'The rd-predictive tool',
			href: '/rd-predictive'
		});
		// Today the registry decides: the chip is there exactly when the route is.
		expect(chipFor(asts[0]) !== null).toBe(toolBySlug('rd-predictive') !== undefined);
	});

	it('are the links of a topic, in order, for the registered tools', () => {
		for (const topic of lines) {
			const expected = topic.links.filter((l) => l.kind === 'notation' || toolBySlug(l.slug));
			const chips = chipsFor(topic.links);
			expect(chips.length, topic.text).toBe(expected.length);
			expect(
				chips.map((c) => c.kind),
				topic.text
			).toEqual(expected.map((l) => l.kind));
			// One chip per destination: the page keys them by href.
			expect(new Set(chips.map((c) => c.href)).size, topic.text).toBe(chips.length);
		}
	});
});

describe('the page', () => {
	const { body, head } = render(Page);
	const hrefs = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
	const chipCount = lines.reduce((n, t) => n + chipsFor(t.links).length, 0);

	it('has the title, the line saying what the page is, the exam line and the legend', () => {
		expect(body).toContain(`<h1>${TITLE}</h1>`);
		expect(body).toContain(SUMMARY);
		expect(SUMMARY).toBe(
			'The midterm review list, with the tools and notation sections on this site for each topic.'
		);
		expect(body).toMatch(/Exam:<\/span>\s*Thursday 10\/22/);
		expect(body).toContain(STAR_NOTE);
		expect(body).toContain('one asterisk in the list');
		expect(body).toContain('two asterisks');
		expect(head).toContain('<title>Midterm Review · CS435</title>');
	});

	it('has a section and a table-of-contents entry for every group', () => {
		for (const section of sections) {
			expect(body, section.id).toContain(`<section id="${section.id}"`);
			// Once in the side list and once in the compact list.
			expect(hrefs.filter((h) => h === `#${section.id}`).length, section.id).toBe(2);
		}
		expect(body.match(/<section\b/g)?.length).toBe(sections.length);
	});

	it('writes every line of the list', () => {
		const text = body.replace(/<[^>]+>/g, '');
		for (const topic of lines) {
			const escaped = topic.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
			expect(text, topic.text).toContain(escaped);
		}
	});

	it('shows ★ for one asterisk and ★★ for two', () => {
		const marks = [...body.matchAll(/<span class="stars[^"]*"[^>]*>(★+)<\/span>/g)].map(
			(m) => m[1].length
		);
		// The legend shows each once; the rest stand on the lines of the list.
		const onLines = lines.filter((t) => t.stars > 0).map((t) => t.stars);
		expect(marks.filter((n) => n === 2).length).toBe(1 + onLines.filter((n) => n === 2).length);
		expect(marks.filter((n) => n === 1).length).toBe(1 + onLines.filter((n) => n === 1).length);
		// The table of contents repeats the stars of its groups.
		const inToc = [...body.matchAll(/<span class="toc-stars[^"]*"[^>]*>(★+)<\/span>/g)];
		expect(inToc.length).toBe(2 * sections.filter((s) => sectionStars(s) > 0).length);
	});

	it('links only to this page, the notation page and registered tools', () => {
		const routes = new Set(tools.map((t) => `/${t.slug}`));
		const chips = hrefs.filter((h) => !h.startsWith('#'));
		expect(chips.length).toBe(chipCount);
		expect(chipCount).toBeGreaterThan(50);
		for (const href of chips) {
			const [path, hash] = href.split('#');
			if (path === '/notation') expect(Object.keys(NOTATION_SECTIONS), href).toContain(hash);
			else expect(routes.has(path), href).toBe(true);
		}
	});

	it('labels every chip Tool or Notation', () => {
		expect(body.match(/class="chip-kind[^"]*"[^>]*>Tool:/g)?.length).toBe(
			lines.reduce((n, t) => n + chipsFor(t.links).filter((c) => c.kind === 'tool').length, 0)
		);
		expect(body.match(/class="chip-kind[^"]*"[^>]*>Notation:/g)?.length).toBe(
			lines.reduce((n, t) => n + t.links.filter((l) => l.kind === 'notation').length, 0)
		);
	});

	it('promises nothing for the topics without links', () => {
		expect(body).not.toMatch(/coming soon|not yet|to be added|planned/i);
	});
});

describe('the site', () => {
	it('lists Midterm after Notation in the header', () => {
		const labels = navLinks.map((l) => l.label);
		expect(labels).toContain('Notation');
		expect(labels.indexOf('Midterm')).toBe(labels.indexOf('Notation') + 1);
		expect(navLinks.find((l) => l.label === 'Midterm')?.href).toBe('/midterm');
	});

	describe('home page', () => {
		const home = render(Home).body.replace(/\s+/g, ' ');
		const reference = home.slice(home.indexOf('id="reference"'));

		it('has a card for the page next to Notation in the Reference section', () => {
			const cards = [...reference.matchAll(/<a class="card[^"]*" href="([^"]*)"/g)].map(
				(m) => m[1]
			);
			expect(cards).toContain('/notation');
			expect(cards.indexOf('/midterm')).toBe(cards.indexOf('/notation') + 1);
			expect(reference).toContain(TITLE);
			expect(reference).toContain(SUMMARY);
		});

		it('samples lines of the list on the card, with their stars', () => {
			const sample = /<span class="card-sample[^"]*"[^>]*>(★[^<]*)<\/span>/.exec(reference)?.[1];
			const items = (sample ?? '').trim().split(' · ');
			expect(items.length).toBeGreaterThan(1);
			for (const item of items) {
				const [stars, ...words] = item.split(' ');
				expect(stars, item).toMatch(/^★+$/);
				expect(line(words.join(' ')).stars, item).toBe(stars.length);
			}
		});
	});
});

describe('the contract', () => {
	// docs/ARCHITECTURE.md §2 lists the routes and says what this page may read of a tool.
	const doc = source('../../../docs/ARCHITECTURE.md');
	const imports = [
		...source('./topics.ts').matchAll(
			/^import (type )?\{[^}]*\} from '\$lib\/tools\/([a-z-]+)\/([\w.-]+)';$/gm
		)
	].map((m) => ({ typeOnly: m[1] !== undefined, folder: m[2], module: m[3] }));

	it('lists the route next to the notation page', () => {
		const tree = /```\n(src\/[\s\S]*?)```/.exec(doc)?.[1].split('\n') ?? [];
		const notation = tree.findIndex((l) => /^ {4}notation\/\+page\.svelte {2,}\S/.test(l));
		expect(notation).toBeGreaterThan(0);
		expect(tree[notation + 1]).toMatch(/^ {4}midterm\/\+page\.svelte {2,}\S/);
	});

	it('reads of a tool folder only its presets, its groupings and the types of its state', () => {
		expect(imports.length).toBeGreaterThan(5);
		for (const { typeOnly, folder, module } of imports) {
			const where = `${folder}/${module}`;
			expect(['presets', 'groupings', 'state'], where).toContain(module);
			if (module === 'state') expect(typeOnly, where).toBe(true);
			// A folder of a registered tool, never another tool's components or engine.
			expect(toolBySlug(folder), where).toBeDefined();
		}
		expect(doc).toContain('src/routes/midterm/topics.ts');
		for (const module of new Set(imports.map((i) => i.module)))
			expect(doc, module).toMatch(new RegExp(`\\b${module}\\.ts\\b`));
	});

	it('reads only the types of the preset modules that load an engine, and writes those presets out', () => {
		// These modules load the grammar engine, the LR(1) engine or the C- compiler.
		const heavy = ['ambiguity', 'cminus', 'conflicts', 'll1', 'lr1'];
		for (const { typeOnly, folder, module } of imports) {
			if (heavy.includes(folder)) expect(typeOnly, `${folder}/${module}`).toBe(true);
		}
		expect(imports.filter((i) => i.folder === 'shift-reduce')).toEqual([
			{ typeOnly: false, folder: 'shift-reduce', module: 'presets' }
		]);
	});

	it('names the tools it opens on a view of their own, which have no LinkStates entry', () => {
		const viewed = [...new Set(toolLinks.filter((l) => l.open === 'view').map((l) => l.slug))];
		expect(viewed.sort()).toEqual(['phases', 't-diagrams']);
		const section = /### 5\.1a Cross-tool links\n([\s\S]*?)\n### /.exec(doc)?.[1] ?? '';
		for (const slug of viewed) expect(section, slug).toContain(`\`${slug}\``);
	});
});

describe('copy', () => {
	// Pages say what they hold; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|study (aid|guide)|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const sources = readdirSync(here)
		.filter((f) => !f.endsWith('.spec.ts'))
		.map((f) => here + f);

	it('has no teaching-purpose wording in the list', () => {
		for (const topic of lines) expect(topic.text).not.toMatch(forbidden);
		for (const text of [TITLE, SUMMARY, STAR_NOTE, EXAM]) expect(text).not.toMatch(forbidden);
	});

	it('has no teaching-purpose wording in the page or in what it renders', () => {
		expect(sources.map((f) => f.slice(here.length))).toEqual(
			expect.arrayContaining(['+page.svelte', 'topics.ts'])
		);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
		const { body, head } = render(Page);
		expect(body + head).not.toMatch(forbidden);
	});

	it('names neither the university nor an instructor', () => {
		for (const file of sources)
			expect(readFileSync(file, 'utf8'), file).not.toMatch(
				/universit|professor|instructor|\bDr\.|CS ?435/i
			);
	});
});
