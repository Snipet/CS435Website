// Grammar components. See docs/ARCHITECTURE.md §5.2a.
export { default as DerivationChain } from './DerivationChain.svelte';
export { default as GrammarEditor } from './GrammarEditor.svelte';
export { default as ParseTreeView } from './ParseTreeView.svelte';
export { default as TokenStream } from './TokenStream.svelte';

export {
	boxWidth,
	describeTree,
	isEpsilonNode,
	labelWidth,
	layoutTree,
	neighborOf,
	nodeAtPath,
	pathKey,
	splitSubscript,
	treeSizing,
	type LabelParts,
	type TreeDirection,
	type TreeLabeler,
	type TreeLayout,
	type TreeLayoutEdge,
	type TreeLayoutNode,
	type TreeLayoutOptions,
	type TreePath,
	type TreeSizing
} from './tree-layout';
export {
	createGrammarInput,
	type EditInfo,
	type GrammarField,
	type GrammarInput,
	type GrammarInputHost
} from './grammar-input';
export {
	classifyGrammarText,
	convertArrows,
	highlightGrammar,
	leftHandSides,
	normalizeSymbol,
	paletteInsertion,
	tokenizeGrammarText,
	type ArrowConversion,
	type ClassifiedToken,
	type GrammarHighlightOptions,
	type GrammarTextOptions,
	type GrammarToken,
	type GrammarTokenClass,
	type GrammarTokenKind
} from './grammar-text';
export {
	clampPointer,
	describeTokens,
	layoutTokens,
	pointerText,
	type TokenCell,
	type TokenStreamOptions
} from './token-stream';
export {
	chainForms,
	formText,
	type ChainForm,
	type ChainSegment,
	type ChainSymbol
} from './derivation-chain';
export type { ChainStep, TreeHighlight, TreeTone } from './types';
