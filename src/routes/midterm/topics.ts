/**
 * The midterm review list, and for each of its topics the tools and notation
 * sections of this site that cover it.
 *
 * The list is kept as it was handed out: its groups, their order, its nesting
 * and the wording of every line. An asterisk in the list is a star here
 * (`stars: 1`, or 2 for two asterisks). A topic with nothing on the site has
 * no links.
 *
 * Lines nest as the list indents them; a tab counts as eight spaces. So the
 * second "Bottom-Up", indented as far as "Parsing Algorithms", stands next to
 * it, and the lines indented further under it are its points. The typing of
 * the list is tidied up: its bullets ("o", "--") are left out, and the lines
 * they start, with "JavaScript?" lined up under the text of one, are topics of
 * their group; "--" between words is a dash; quotes are curly; blank lines
 * inside a group are dropped; a remark on the line under a topic joins it in
 * parentheses ("(witness “cling”, …)"); and a list in parentheses after a
 * topic ("Chomsky Hierarchy (3 Regular, …)"), or on a line of its own under it
 * ("Type Checking, Symbol Table"), gives the topic's points.
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
import { presets as predictivePresets } from '$lib/tools/rd-predictive/presets';
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
/** The list: "Exam will be Thursday 10/22". */
export const EXAM = 'Thursday 10/22';
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
	declarations: 'Disambiguating declarations',
	'first-follow': 'First and Follow',
	'll1-tables': 'LL(1) parsing tables',
	'll1-traces': 'LL(1) parse traces',
	handles: 'Handles',
	'shift-reduce': 'Shift-reduce parsing',
	'lr-items': 'LR(1) items',
	'lr-tables': 'LR parsing tables',
	conflicts: 'Conflicts',
	bison: 'Precedence in bison',
	'grammar-classes': 'Grammar classes'
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

/**
 * The Predictive Recursive Descent tool on one of its presets (Top-Down
 * Parsing, slides 23–41): the preset's grammar, tokens and options, which the
 * tool recognizes as that preset, so it shows the slide's note and questions.
 * The chip names the grammar or the tokens (`example`): the preset's own label
 * may be words around them ("E → T + E | T before left factoring"). Without
 * that preset the link opens the tool as it first loads.
 */
function predictiveOn(id: string, example: string): TopicLink {
	const preset = predictivePresets.find((p) => p.id === id);
	if (!preset) return tool('rd-predictive');
	const state = { ...preset.value };
	return linked('rd-predictive', state, example, true);
}

/** The tab of the C- Compiler that draws the course's AST, by its title on the tool's page. */
export const SYNTAX_TREE = 'Syntax tree';

/**
 * The C- Compiler on its Syntax tree tab, with the program and input it first
 * loads (its preset "Greatest common divisor"). Written out here because the
 * tool's preset module loads the compiler; the spec compares the two.
 */
export const CMINUS_SYNTAX_TREE = {
	source: `/* The greatest common divisor of two numbers.
   C- has no remainder operator:
   u - u / v * v is the remainder of u by v. */

int gcd(int u, int v)
{
  if (v == 0)
    return u;
  return gcd(v, u - u / v * v);
}

void main(void)
{
  int a;
  int b;
  a = input();
  b = input();
  output(gcd(a, b));
}
`,
	input: '48 18',
	tab: 'syntax'
};

const cminusSyntaxTree = (): TopicLink => linked('cminus', CMINUS_SYNTAX_TREE, SYNTAX_TREE);

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
/** Phases the C- compiler also carries out on a whole program. */
const COMPILED = [tool('phases'), tool('cminus')];
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
		heads: [topic('Phases of Compilation', { stars: 2, links: COMPILED })],
		topics: [
			topic('Preprocessor — macros and textual inclusion', { links: PHASES }),
			topic('Lexer', { links: COMPILED }),
			topic('Parser', { links: COMPILED }),
			topic('Semantic Analyzer', { links: COMPILED, sub: ['Type Checking', 'Symbol Table'] }),
			topic('Intermed. Codegen', { links: COMPILED }),
			topic('Optimizer', { links: COMPILED }),
			topic('Code Generator', { links: COMPILED }),
			topic('Target Code Optimizer', { links: COMPILED }),
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
				links: [linked('scanner-dfa', HAND_CODED_SWITCH, 'Hand-coded switch'), tool('cminus')],
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
			topic('Bison', { stars: 1, links: [notation('bison'), notation('declarations')] }),
			topic('ASTs', {
				stars: 1,
				links: [tool('rd-predictive'), cminusSyntaxTree(), tool('phases')]
			}),
			topic('Ambiguity', { links: [tool('ambiguity'), notation('declarations')] }),
			topic('Precedence cascades', {
				stars: 1,
				links: [linked('ambiguity', PRECEDENCE_CASCADE, 'E, T, F', true)]
			}),
			// The LL(1) and bottom-up topics link the notation sections that cover them.
			// The tools for them go at the front of a topic's `links`.
			topic('Parsing Algorithms', {
				links: [notation('grammar-classes')],
				sub: [
					topic('Top-Down', {
						sub: [
							topic('Generate-Match parsing', { links: [tool('rd-backtracking')] }),
							topic('RD with backtracking', {
								links: [tool('rd-backtracking'), notation('descent')]
							}),
							topic('Predictive RD', {
								links: [tool('rd-predictive'), notation('descent'), notation('ebnf')]
							}),
							topic('Computing First and Follow sets', {
								stars: 2,
								links: [notation('first-follow')],
								sub: ['Fixed-point computations']
							}),
							topic('Table Driven LL(1)', {
								stars: 1,
								links: [notation('ll1-tables'), notation('ll1-traces')]
							})
						]
					}),
					topic('Bottom-Up', {
						sub: [
							topic('Shift-Reduce parsing', { links: [notation('shift-reduce')] }),
							topic('LR(1) algorithm', { stars: 1, links: [notation('lr-tables')] })
						]
					}),
					topic('Predictive RD', {
						stars: 2,
						links: [tool('rd-predictive')],
						sub: [
							topic('Left factoring (use EBNF)', {
								stars: 1,
								links: [predictiveOn('suitable', 'E → T + E | T'), notation('ebnf')]
							}),
							topic('Remove left recursion (use EBNF)', {
								stars: 1,
								links: [predictiveOn('left-recursion-ebnf', 'E → E + T | T'), notation('ebnf')]
							}),
							topic('Associativity', {
								links: [
									predictiveOn('left-recursion-ebnf', 'E → E + T | T'),
									predictiveOn('right-recursion', 'A → X op A | X')
								]
							}),
							topic('Building AST', {
								stars: 1,
								links: [predictiveOn('ast', 'int + int + int'), cminusSyntaxTree()]
							}),
							topic('Visitor Design Pattern', { stars: 2 })
						]
					}),
					topic('Table Driven', {
						sub: [
							topic('Remove left recursion (no EBNF)', {
								stars: 1,
								links: [predictiveOn('general-form', 'S → S a | S b | c | d')]
							}),
							topic('Left factor (no EBNF)', { stars: 1 }),
							topic('Explicit stack', { links: [notation('ll1-traces')] }),
							topic('Generate RHSs/match tokens', { links: [notation('ll1-traces')] }),
							topic('Computing First/Follow sets', {
								stars: 2,
								links: [notation('first-follow')]
							}),
							topic('Building table!', { stars: 2, links: [notation('ll1-tables')] })
						]
					})
				]
			}),
			topic('Bottom-Up', {
				sub: [
					topic('Reduce string to start symbol', { links: [notation('handles')] }),
					topic('Produce rightmost derivation in reverse', { links: [notation('handles')] }),
					topic('LR(1)', {
						stars: 2,
						sub: [
							topic('LR(1) Items', { stars: 1, links: [notation('lr-items')] }),
							topic('Closure(Items)', { stars: 1, links: [notation('lr-items')] }),
							topic('Constructing DFA and table', {
								stars: 1,
								links: [notation('lr-items'), notation('lr-tables'), notation('conflicts')]
							})
						]
					})
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
