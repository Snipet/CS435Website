/**
 * The midterm review list, and for each of its topics the tools and notation
 * sections of this site that cover it.
 *
 * The list is kept as it was handed out: its groups, their order and the
 * wording of every line. An asterisk in the list is a star here (`stars: 1`,
 * or 2 for two asterisks). A topic with nothing on the site has no links.
 *
 * Links are data (`TopicLink`); `chipFor` turns one into a label and a URL, and
 * gives null for a tool that is not registered, so the page never points at a
 * route that does not exist.
 */
import { resolve } from '$app/paths';
import { toolHref } from '$lib/site';
import { presetById as flexPreset } from '$lib/tools/flex/presets';
import type { FlexView } from '$lib/tools/flex/state';
import { presetById as grammarPreset } from '$lib/tools/grammar/presets';
import { presetById as lexerPreset } from '$lib/tools/lexer/presets';
import { toolLink, type LinkSlug, type LinkStates } from '$lib/tools/links';
import { GROUPING_INFO, type Grouping } from '$lib/tools/phases/groupings';
import type { PhasesState } from '$lib/tools/phases/state';
import { toolBySlug } from '$lib/tools/registry';
import { LEX2_DEFS, LEX2_RULES } from '$lib/tools/scanner-dfa/presets';
import { presetById as tDiagramsPreset } from '$lib/tools/t-diagrams/presets';
import type { TDiagramsHash } from '$lib/tools/t-diagrams/state';
import type { ToolMeta } from '$lib/tools/types';
import { encode } from '$lib/url-state';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const TITLE = 'Midterm Review';
export const SUMMARY =
	'The midterm review list, with the tools and notation sections on this site for each topic.';
/** The list: "Exam will be Thursday 10/15". */
export const EXAM = 'Thursday 10/15';
/** The list's own note on its asterisks. */
export const STAR_NOTE = 'Asterisks (*’s) are used to mark particularly important concepts';

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * Sections of the notation page that topics link to: anchor id → heading, as
 * in `src/routes/notation/+page.svelte` (the spec compares the two).
 */
export const NOTATION_SECTIONS = {
	sets: 'Sets, strings, and languages',
	regex: 'Regular expressions',
	flex: 'Flex patterns',
	automata: 'Finite automata',
	tables: 'Transition tables',
	tokens: 'Tokens and lexemes',
	productions: 'Productions and alternatives',
	derivations: 'Derivations',
	cfg: 'Context-free grammars',
	chomsky: 'Chomsky hierarchy',
	ebnf: 'EBNF',
	trees: 'Parse trees',
	descent: 'Recursive descent',
	declarations: 'Disambiguating declarations'
} as const;

export type NotationSection = keyof typeof NOTATION_SECTIONS;

/**
 * Tools without a `LinkStates` entry. A link opens them as they first load, or
 * on a view of their own (`SavedViews`).
 */
export const PLAIN_SLUGS = ['phases', 't-diagrams', 'tiny-vm'] as const;
export type PlainSlug = (typeof PLAIN_SLUGS)[number];
export type ToolSlug = LinkSlug | PlainSlug;

/**
 * What the tools without a `LinkStates` entry keep in their own URL hash: the
 * shape their "Copy link" writes and their page reads back.
 */
export interface SavedViews {
	phases: Partial<PhasesState>;
	't-diagrams': TDiagramsHash;
}

/** What a link opens its tool on, as the chip names it. */
interface Opened {
	example: string;
	/** The example is an input or an expression: set in the monospace font. */
	code: boolean;
}

/** A tool as it first loads. */
export interface PlainToolLink {
	kind: 'tool';
	slug: ToolSlug;
	open?: undefined;
}

/** A tool opened on a `LinkStates` state; fields beyond that shape are the tool's own saved ones. */
export type LinkedToolLink = {
	[S in LinkSlug]: { kind: 'tool'; slug: S; open: 'link'; state: LinkStates[S] } & Opened;
}[LinkSlug];

/** A tool opened on a view it saves in its hash. */
export type SavedToolLink = {
	[S in keyof SavedViews]: { kind: 'tool'; slug: S; open: 'view'; state: SavedViews[S] } & Opened;
}[keyof SavedViews];

export type ToolTopicLink = PlainToolLink | LinkedToolLink | SavedToolLink;

export interface NotationTopicLink {
	kind: 'notation';
	section: NotationSection;
}

export type TopicLink = ToolTopicLink | NotationTopicLink;

const tool = (slug: ToolSlug): TopicLink => ({ kind: 'tool', slug });

function linked<S extends LinkSlug>(
	slug: S,
	state: LinkStates[S],
	example: string,
	code = false
): TopicLink {
	return { kind: 'tool', slug, open: 'link', state, example, code } as LinkedToolLink;
}

function saved<S extends keyof SavedViews>(
	slug: S,
	state: SavedViews[S],
	example: string
): TopicLink {
	return { kind: 'tool', slug, open: 'view', state, example, code: false } as SavedToolLink;
}

const notation = (section: NotationSection): TopicLink => ({ kind: 'notation', section });

/**
 * The Scanner Rules tool on one of its presets. The state is the preset's own
 * (`LinkStates['lexer']` plus the tab it opens on) with the preset's id, so
 * the tool shows the slide's note and question. The chip names the preset by
 * its input. Without that preset the link opens the tool as it first loads.
 */
function lexerOn(id: string): TopicLink {
	const preset = lexerPreset(id);
	if (!preset) return tool('lexer');
	const state = { ...preset.value, preset: preset.id };
	return linked('lexer', state, preset.label, true);
}

/**
 * The Flex Playground on one of its presets, with the preset's first sample
 * input, in one of the tool's views (Run, unless one is given).
 */
function flexOn(id: string, example: string, view?: FlexView): TopicLink {
	const preset = flexPreset(id);
	if (!preset) return tool('flex');
	const state = {
		spec: preset.value.spec,
		input: preset.value.inputs[0].value,
		preset: preset.id,
		view
	};
	return linked('flex', state, example);
}

/**
 * The Context-Free Grammars tool on one of its presets, with the slide's
 * questions. The chip names what the link is for (`example`, a panel of the
 * tool): a preset's own label may be a question from its slide ("N ? T ? S ?"),
 * which says nothing on a chip.
 */
function grammarOn(id: string, example: string): TopicLink {
	const preset = grammarPreset(id);
	if (!preset) return tool('grammar');
	const state = { ...preset.value, preset: preset.id };
	return linked('grammar', state, example);
}

/**
 * The panel of the Context-Free Grammars tool that lists N, T, S and P, by its
 * title on the tool's page (the spec compares the two).
 */
export const FOUR_TUPLE = 'Four-tuple';

/**
 * The Context-Free Grammars tool on the derivation of ( int + int ) * int
 * (Introduction to Parsing, slide 12), with the leftmost and the rightmost
 * derivation of the builder's parse tree shown as well. The chip names the
 * string.
 */
function grammarDerivations(): TopicLink {
	const preset = grammarPreset('rewrite-rules');
	if (!preset?.value.input) return tool('grammar');
	const state = { ...preset.value, preset: preset.id, lm: true, rm: true };
	return linked('grammar', state, preset.value.input, true);
}

/** The T-Diagrams tool on one of its presets: the preset's toolbox, facts and goal. */
function tDiagramsOn(id: string): TopicLink {
	const preset = tDiagramsPreset(id);
	if (!preset) return tool('t-diagrams');
	return saved('t-diagrams', { ...preset.value, preset: preset.id }, preset.label);
}

/** The seven-phase table of the Compiler Phases tool with its rows grouped one of the slides' ways. */
const phasesBy = (grouping: Grouping): TopicLink =>
	saved('phases', { view: 'seven', grouping }, GROUPING_INFO[grouping].label);

/** Lexical Analysis IV, slide 6: the regular expression of the Thompson and subset slides. */
export const ENDS_IN_ONE = '(1 | 0)*1';

/**
 * The relop DFA's hand-coded getToken () (Lexical Analysis IV, slides 17–19).
 * `rules` and `input` make this a `LinkStates['scanner-dfa']`; with a source
 * and a tab the tool reads it as its own saved view and keeps its rules.
 */
export const HAND_CODED_SWITCH = {
	defs: LEX2_DEFS,
	rules: LEX2_RULES,
	input: '<=',
	source: 'relop',
	tab: 'switch'
};

/**
 * The preset "E, T, F: the precedence cascade" of the Ambiguity and Precedence
 * tool (slides 7–10 of its deck): the ambiguous grammar with its rewrite. It
 * is written out here because the tool's preset module loads the whole grammar
 * engine; the spec compares the two.
 */
export const PRECEDENCE_CASCADE = {
	grammar: 'E → E + E | E * E | ( E ) | int',
	input: 'int * int + int',
	values: '2 3 4',
	tab: 'rewrite',
	rewrite: 'E → E + T | T\nT → T * F | F\nF → int | ( E )'
};

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/** Asterisks on a line of the list. */
export type Stars = 0 | 1 | 2;

export interface Topic {
	/** The line as written in the list, without its asterisks. */
	text: string;
	stars: Stars;
	links: readonly TopicLink[];
	/** The points listed under the topic. */
	sub: readonly Topic[];
}

/**
 * One group of the list. `heads` are its top-level lines: one for most groups,
 * several where the list gives a run of topics with nothing under them.
 */
export interface Section {
	/** Anchor id on the page. */
	id: string;
	heads: readonly Topic[];
	topics: readonly Topic[];
}

interface TopicOptions {
	stars?: Stars;
	links?: readonly TopicLink[];
	sub?: readonly (Topic | string)[];
}

function topic(text: string, options: TopicOptions = {}): Topic {
	return {
		text,
		stars: options.stars ?? 0,
		links: options.links ?? [],
		sub: (options.sub ?? []).map((s) => (typeof s === 'string' ? topic(s) : s))
	};
}

const PHASES = [tool('phases')];
const T_DIAGRAMS = [tool('t-diagrams')];

export const sections: readonly Section[] = [
	{
		id: 'compiler',
		heads: [topic('What is compiler?', { links: PHASES })],
		topics: []
	},
	{
		id: 'language-impl',
		heads: [topic('Language Impl Methods', { stars: 1 })],
		topics: [
			topic('“Languages are not interpreted or compiled” (witness “cling”, the C++ interpreter)'),
			topic('Compilation (AOT)'),
			topic('Pure Interpretation — how TINY VM worked', { links: [tool('tiny-vm')] }),
			topic('Hybrid Impl. — translate to IR and interpret — Python'),
			topic('JIT — Java, .NET'),
			topic('JavaScript?'),
			topic('Examples of each'),
			topic('Bytecode: Python and Java', { stars: 1 })
		]
	},
	{
		id: 'phases',
		heads: [topic('Phases of Compilation', { stars: 2, links: PHASES })],
		topics: [
			topic('Preprocessor — macros and textual inclusion', { links: PHASES }),
			topic('Lexer', { links: PHASES }),
			topic('Parser', { links: PHASES }),
			topic('Semantic Analyzer', { links: PHASES, sub: ['Type Checking', 'Symbol Table'] }),
			topic('Intermed. Codegen', { links: PHASES }),
			topic('Optimizer', { links: PHASES }),
			topic('Code Generator', { links: PHASES }),
			topic('Target Code Optimizer', { links: PHASES }),
			topic('Assembler', { links: PHASES }),
			topic('Linker', { links: PHASES })
		]
	},
	{
		id: 'structure',
		heads: [
			topic('Analysis/Synthesis Model', { links: [phasesBy('analysis')] }),
			topic('Front/Middle/Back end', { links: [phasesBy('ends')] }),
			topic('Role of IR', { links: [phasesBy('ends')] }),
			topic('Passes', { links: [phasesBy('passes')] })
		],
		topics: []
	},
	{
		id: 't-diagrams',
		heads: [topic('T-Diagrams', { stars: 1, links: T_DIAGRAMS })],
		topics: [
			topic('Cross compiler', { links: [tDiagramsOn('cross')] }),
			topic('Retargetable compiler', { links: [tDiagramsOn('retargetable')] }),
			topic('Bootstrapping', { links: [tDiagramsOn('bootstrap')] })
		]
	},
	{
		id: 'history',
		heads: [topic('History')],
		topics: [
			topic('Assembly vs. High-level'),
			topic('Fortran', { stars: 1, links: [lexerOn('fortran-do')] })
		]
	},
	{
		id: 'lexical-analysis',
		heads: [topic('Lexical Analysis')],
		topics: [
			topic('Tokens (categories) vs. lexemes', { links: [tool('lexer'), notation('tokens')] }),
			topic('Lookahead', { links: [lexerOn('lookahead-iffy')] }),
			topic('Languages and alphabets', {
				links: [tool('regex'), notation('sets'), notation('regex')]
			}),
			topic('Regular Expressions', { stars: 1, links: [tool('regex'), notation('regex')] }),
			topic('Disambiguation', {
				links: [tool('lexer'), notation('tokens')],
				sub: [
					topic('maximal munch', { links: [lexerOn('foo-plus-3')] }),
					topic('first match', { links: [lexerOn('new-foo')] })
				]
			}),
			topic('DFAs, NFAs', { links: [tool('automata'), notation('automata')] }),
			topic('RE to NFA (Thompson’s Construction)', {
				stars: 1,
				links: [linked('thompson', { re: ENDS_IN_ONE }, ENDS_IN_ONE, true)]
			}),
			topic('NFA to DFA (Subset Construction)', {
				stars: 1,
				links: [linked('subset', { from: 're', re: ENDS_IN_ONE }, ENDS_IN_ONE, true)]
			}),
			topic('Table driven scanner', { links: [tool('scanner-dfa'), notation('tables')] }),
			topic('Hand-coding a scanner', {
				links: [linked('scanner-dfa', HAND_CODED_SWITCH, 'Hand-coded switch')],
				sub: ['Ada', 'C-']
			}),
			topic('Flex', {
				stars: 1,
				links: [tool('flex'), notation('flex')],
				sub: [
					topic('Pattern/action rules', { links: [flexOn('example-3', 'Rules', 'rules')] }),
					'C- Scanner',
					topic('Word count', { links: [flexOn('example-2', 'Example 2')] })
				]
			}),
			topic('grep', { links: [tool('regex'), notation('regex')] })
		]
	},
	{
		id: 'parsing',
		heads: [topic('Parsing')],
		topics: [
			topic('Grammars', { links: [tool('grammar'), notation('productions')] }),
			topic('Formal defn of CFG (N, T, S, P)', {
				links: [grammarOn('four-tuple', FOUR_TUPLE), notation('cfg')]
			}),
			topic('Chomsky Hierarchy', {
				stars: 1,
				links: [notation('chomsky'), tool('grammar')],
				sub: ['3 Regular', '2 CF', '1 CS', '0 Unrestricted']
			}),
			topic('Derivations', {
				stars: 1,
				links: [grammarDerivations(), notation('derivations')],
				sub: ['leftmost', 'rightmost', 'mixed']
			}),
			topic('Parse trees and relation to derivations', {
				links: [grammarDerivations(), notation('trees')],
				sub: ['Derivation defines parse tree', 'One tree can have many derivations']
			}),
			topic('Syntax-directed Translation (SDT)', {
				stars: 1,
				sub: [
					'Grammar + Translation rules/Semantic actions',
					'Semantic values',
					topic('Bison', { stars: 1 })
				]
			}),
			topic('ASTs', { stars: 1, links: [tool('rd-predictive'), tool('phases')] }),
			topic('Ambiguity', { links: [tool('ambiguity'), notation('declarations')] }),
			topic('Precedence cascades', {
				stars: 1,
				links: [linked('ambiguity', PRECEDENCE_CASCADE, 'E, T, F', true)]
			}),
			topic('Parsing Algorithms', {
				sub: [
					topic('Top-Down', {
						sub: [
							topic('RD with backtracking', {
								links: [tool('rd-backtracking'), notation('descent')]
							}),
							topic('Predictive RD', {
								links: [tool('rd-predictive'), notation('descent'), notation('ebnf')]
							}),
							'Table Driven LL(1)'
						]
					}),
					topic('Bottom-Up', { sub: ['LR(1)'] })
				]
			})
		]
	}
];

// ---------------------------------------------------------------------------
// Views of the list
// ---------------------------------------------------------------------------

/** A group's name: its top-level lines, joined as the list would run them together. */
export function sectionTitle(section: Section): string {
	return section.heads.map((h) => h.text).join('; ');
}

/** The most asterisks on a group's top-level lines. */
export function sectionStars(section: Section): Stars {
	return section.heads.reduce<Stars>((n, h) => (h.stars > n ? h.stars : n), 0);
}

/**
 * Whether the points under a topic fit on one line: none of them has links or
 * points of its own. Otherwise each is drawn as a row.
 */
export function isInline(sub: readonly Topic[]): boolean {
	return sub.every((s) => s.links.length === 0 && s.sub.length === 0);
}

/** Every line of the list, top to bottom, with its depth (0 for a group's top-level lines). */
export function allTopics(list: readonly Section[] = sections): { topic: Topic; depth: number }[] {
	const out: { topic: Topic; depth: number }[] = [];
	const walk = (t: Topic, depth: number) => {
		out.push({ topic: t, depth });
		for (const s of t.sub) walk(s, depth + 1);
	};
	for (const section of list) {
		for (const head of section.heads) walk(head, 0);
		for (const t of section.topics) walk(t, 1);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** A link as the page shows it: "Tool: Thompson's Construction", "Notation: Chomsky hierarchy". */
export interface Chip {
	kind: 'tool' | 'notation';
	/** The tool's title or the notation section's heading. */
	name: string;
	/** What the tool is opened on, when the link carries a state. */
	example?: string;
	/** The example is an input or an expression. */
	code?: boolean;
	href: string;
}

export const KIND_LABELS: Record<Chip['kind'], string> = { tool: 'Tool', notation: 'Notation' };

/**
 * The chip of a link, or null when its tool is not part of the site. `lookup`
 * is the registry's `toolBySlug`; tests pass their own.
 */
export function chipFor(
	link: TopicLink,
	lookup: (slug: string) => ToolMeta | undefined = toolBySlug
): Chip | null {
	if (link.kind === 'notation') {
		return {
			kind: 'notation',
			name: NOTATION_SECTIONS[link.section],
			href: `${resolve('/notation')}#${link.section}`
		};
	}
	const meta = lookup(link.slug);
	if (!meta) return null;
	if (link.open === undefined) return { kind: 'tool', name: meta.title, href: toolHref(link.slug) };
	const href =
		link.open === 'link'
			? toolLink(link.slug, link.state)
			: `${toolHref(link.slug)}#${encode(link.state)}`;
	if (href === null) return null;
	return { kind: 'tool', name: meta.title, example: link.example, code: link.code, href };
}

/** The chips of a topic's links, in order, without the tools that are not registered. */
export function chipsFor(links: readonly TopicLink[]): Chip[] {
	return links.map((link) => chipFor(link)).filter((c): c is Chip => c !== null);
}
