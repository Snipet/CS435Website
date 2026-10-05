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
	defaultState as flexDefault,
	fromLink as flexState,
	isFlexState
} from '$lib/tools/flex/state';
import {
	activePreset as grammarActivePreset,
	applyPreset as applyGrammarPreset,
	presetById as grammarPreset
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
import {
	ENDS_IN_ONE,
	EXAM,
	HAND_CODED_SWITCH,
	NOTATION_SECTIONS,
	PLAIN_SLUGS,
	PRECEDENCE_CASCADE,
	STAR_NOTE,
	SUMMARY,
	TITLE,
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
 * The midterm review list: one block per group, a line per topic, points
 * indented under their topic, and the list's asterisks in front of a line.
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
  * Syntax-directed Translation (SDT)
    Grammar + Translation rules/Semantic actions
    Semantic values
    * Bison
  * ASTs
  Ambiguity
  * Precedence cascades
  Parsing Algorithms
    Top-Down
      RD with backtracking
      Predictive RD
      Table Driven LL(1)
    Bottom-Up
      LR(1)
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

/** The line of the list with this text. */
function line(text: string): Topic {
	const found = lines.filter((t) => t.text === text);
	if (found.length !== 1) throw new Error(`${found.length} lines read "${text}"`);
	return found[0];
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

	it('marks the lines the list marks: two asterisks once, one asterisk fourteen times', () => {
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
			'1 Syntax-directed Translation (SDT)',
			'1 Bison',
			'1 ASTs',
			'1 Precedence cascades'
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

	it('writes every line once', () => {
		const texts = lines.map((t) => t.text);
		expect(new Set(texts).size).toBe(texts.length);
		for (const text of texts) expect(text.trim()).toBe(text);
	});

	it('keeps the exam line and the note on the asterisks', () => {
		expect(EXAM).toBe('Thursday 10/15');
		expect(STAR_NOTE).toBe('Asterisks (*’s) are used to mark particularly important concepts');
	});

	it('runs points without links on one line, and gives points with links rows', () => {
		expect(isInline(line('Chomsky Hierarchy').sub)).toBe(true);
		expect(isInline(line('Semantic Analyzer').sub)).toBe(true);
		expect(isInline(line('Disambiguation').sub)).toBe(false);
		expect(isInline(line('Flex').sub)).toBe(false);
		expect(isInline(line('Parsing Algorithms').sub)).toBe(false);
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
			'Phases of Compilation': ['phases'],
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
			'Languages and alphabets': ['regex'],
			'Regular Expressions': ['regex'],
			grep: ['regex'],
			'DFAs, NFAs': ['automata'],
			'RE to NFA (Thompson’s Construction)': ['thompson'],
			'NFA to DFA (Subset Construction)': ['subset'],
			'Table driven scanner': ['scanner-dfa'],
			'Hand-coding a scanner': ['scanner-dfa'],
			Flex: ['flex'],
			'Pattern/action rules': ['flex'],
			'Word count': ['flex'],
			Grammars: ['grammar'],
			'Formal defn of CFG (N, T, S, P)': ['grammar'],
			'Chomsky Hierarchy': ['grammar'],
			Derivations: ['grammar'],
			'Parse trees and relation to derivations': ['grammar'],
			ASTs: ['rd-predictive', 'phases'],
			Ambiguity: ['ambiguity'],
			'Precedence cascades': ['ambiguity'],
			'RD with backtracking': ['rd-backtracking'],
			'Predictive RD': ['rd-predictive']
		};
		for (const [text, tools] of Object.entries(expected)) expect(slugs(text), text).toEqual(tools);
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
			'Syntax-directed Translation (SDT)',
			'Grammar + Translation rules/Semantic actions',
			'Semantic values',
			'Bison',
			'Table Driven LL(1)',
			'LR(1)'
		]) {
			expect(line(text).links, text).toEqual([]);
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
			't-diagrams': isTDiagramsHash
		};
		const withState = toolLinks.filter((l) => l.open !== undefined);
		expect(withState.length).toBeGreaterThan(12);
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
		expect(opened('Formal defn of CFG (N, T, S, P)', 'grammar').example).toBe('N ? T ? S ?');
	});

	it('is the precedence-cascade preset of the ambiguity tool', () => {
		const preset = ambiguityPresets.find((p) => p.id === 'cascade')!;
		expect(PRECEDENCE_CASCADE).toEqual(preset.value);
		const state = stateOf('Precedence cascades', 'ambiguity');
		expect(state).toBe(PRECEDENCE_CASCADE);
		expect.assert(isAmbiguityHash(state));
		expect(ambiguityPresetFor(ambiguityState(state as AmbiguityHash))?.id).toBe('cascade');
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
			'Languages and alphabets': ['sets'],
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
			'RD with backtracking': ['descent'],
			'Predictive RD': ['descent', 'ebnf']
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
		expect(body).toMatch(/Exam:<\/span>\s*Thursday 10\/15/);
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
