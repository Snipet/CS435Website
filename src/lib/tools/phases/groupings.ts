/**
 * The rows of the two phase tables and the ways the seven-phase table can be
 * grouped (Intro (cont'd), compiler architecture: phases, slide 4;
 * analysis/synthesis, slide 5; front end/back end, slide 6; passes, slide 10).
 */
import type { Citation } from '$lib/lectures';

export type View = 'seven' | 'five';
export type Grouping = 'phases' | 'analysis' | 'ends' | 'passes';

export const VIEWS: readonly View[] = ['seven', 'five'];
export const GROUPINGS: readonly Grouping[] = ['phases', 'analysis', 'ends', 'passes'];

export type RowId =
	| 'source'
	| 'scanner'
	| 'parser'
	| 'semantic'
	| 'icg'
	| 'optimizer'
	| 'codegen'
	| 'peephole'
	| 'lexical'
	| 'syntax'
	| 'semantics'
	| 'optimization'
	| 'generation';

export interface PhaseRow {
	id: RowId;
	/** Phase name as on the slide, e.g. "Scanner". */
	name: string;
	/** Parenthetical after the name, e.g. "performs lexical analysis". */
	role?: string;
	/** The Output column. */
	output: string;
}

/** Intro (cont'd), compiler architecture, slide 4: "7 Phases of a Compiler". */
export const SEVEN_ROWS: readonly PhaseRow[] = [
	{ id: 'source', name: 'Programmer', role: 'source code producer', output: 'Source string' },
	{
		id: 'scanner',
		name: 'Scanner',
		role: 'performs lexical analysis',
		output: 'Tokens and their attributes (lexemes)'
	},
	{
		id: 'parser',
		name: 'Parser',
		role: 'performs syntax analysis based on the grammar of the programming language',
		output: 'Abstract syntax tree'
	},
	{
		id: 'semantic',
		name: 'Semantic analyzer',
		role: 'type checking, etc.',
		output: 'Annotated abstract syntax tree'
	},
	{ id: 'icg', name: 'Intermediate code generator', output: 'Three-address code, P-code, or RTL' },
	{ id: 'optimizer', name: 'Optimizer', output: 'Three-address code, P-code, or RTL' },
	{ id: 'codegen', name: 'Code generator', output: 'Assembly code' },
	{ id: 'peephole', name: 'Peephole optimizer', output: 'Assembly code' }
];

/** Intro (cont'd), compiler structure with examples, slide 2: the five phases. */
export const FIVE_ROWS: readonly PhaseRow[] = [
	{ id: 'source', name: 'Program text', output: 'Source string' },
	{
		id: 'lexical',
		name: 'Lexical Analysis',
		role: 'Lexing, Scanning',
		output: 'Lexemes and tokens'
	},
	{ id: 'syntax', name: 'Syntax Analysis', role: 'Parsing', output: 'Parse diagram' },
	{ id: 'semantics', name: 'Semantic Analysis', output: 'Declarations and types checked' },
	{ id: 'optimization', name: 'Optimization', output: 'Three-address code' },
	{ id: 'generation', name: 'Code Generation', output: 'Assembly code' }
];

export interface RowGroup {
	/** Shown in the bracket; '' for the source row. */
	label: string;
	/** Smaller text under the label (the slide's wording). */
	detail?: string;
	/** Marked as optional (the slide sets these passes in italics). */
	optional?: boolean;
	rows: RowId[];
}

export interface GroupingInfo {
	id: Grouping;
	/** Control label. */
	label: string;
	cite: Citation;
	groups: RowGroup[];
	/** One line shown above the table. */
	caption: string;
	/** A note on how the slide's grouping maps onto the table's rows. */
	note?: string;
}

const SOURCE: RowGroup = { label: '', rows: ['source'] };

export const GROUPING_INFO: Record<Grouping, GroupingInfo> = {
	phases: {
		id: 'phases',
		label: 'Phases',
		cite: { deck: '01', slide: 4 },
		caption: 'Seven phases; each one turns the output of the phase before it into a new form.',
		groups: [
			SOURCE,
			{ label: '1', rows: ['scanner'] },
			{ label: '2', rows: ['parser'] },
			{ label: '3', rows: ['semantic'] },
			{ label: '4', rows: ['icg'] },
			{ label: '5', rows: ['optimizer'] },
			{ label: '6', rows: ['codegen'] },
			{ label: '7', rows: ['peephole'] }
		]
	},
	analysis: {
		id: 'analysis',
		label: 'Analysis / Synthesis',
		cite: { deck: '01', slide: 5 },
		caption:
			'Analysis: Lexical, Syntax, Semantic, Optimization. Synthesis: Code Generation, Optimization.',
		note: 'The slide does not list intermediate code generation; its row sits between semantic analysis and optimization.',
		groups: [
			SOURCE,
			{
				label: 'Analysis',
				detail: 'Lexical, Syntax, Semantic, Optimization',
				rows: ['scanner', 'parser', 'semantic', 'icg', 'optimizer']
			},
			{
				label: 'Synthesis',
				detail: 'Code Generation, Optimization',
				rows: ['codegen', 'peephole']
			}
		]
	},
	ends: {
		id: 'ends',
		label: 'Front end / Back end',
		cite: { deck: '01', slide: 6 },
		caption:
			'Source Code → Front End → Intermediate Code → Back End → Target Code. The IR is the glue between the two ends.',
		groups: [
			SOURCE,
			{
				label: 'Front end',
				detail: 'source dependent',
				rows: ['scanner', 'parser', 'semantic', 'icg']
			},
			{
				label: 'Back end',
				detail: 'source independent',
				rows: ['optimizer', 'codegen', 'peephole']
			}
		]
	},
	passes: {
		id: 'passes',
		label: 'Passes',
		cite: { deck: '01', slide: 10 },
		caption: 'Lexical, syntax // semantic // intermed cgen // optimization // cgen // optimization',
		note: 'A pass processes the entire source program. The slide sets the two optimization passes apart in italics.',
		groups: [
			SOURCE,
			{ label: 'Pass 1', detail: 'Lexical, syntax', rows: ['scanner', 'parser'] },
			{ label: 'Pass 2', detail: 'semantic', rows: ['semantic'] },
			{ label: 'Pass 3', detail: 'intermed cgen', rows: ['icg'] },
			{ label: 'Pass 4', detail: 'optimization', optional: true, rows: ['optimizer'] },
			{ label: 'Pass 5', detail: 'cgen', rows: ['codegen'] },
			{ label: 'Pass 6', detail: 'optimization', optional: true, rows: ['peephole'] }
		]
	}
};

/** The five-phase view numbers its rows 1–5. */
export const FIVE_GROUPS: RowGroup[] = [
	SOURCE,
	{ label: '1', rows: ['lexical'] },
	{ label: '2', rows: ['syntax'] },
	{ label: '3', rows: ['semantics'] },
	{ label: '4', rows: ['optimization'] },
	{ label: '5', rows: ['generation'] }
];
