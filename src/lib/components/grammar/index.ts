// Grammar components. See docs/ARCHITECTURE.md §5.2a.
export { default as DerivationChain } from './DerivationChain.svelte';
export { default as GrammarClasses } from './GrammarClasses.svelte';
export { default as GrammarEditor } from './GrammarEditor.svelte';
export { default as LrItem } from './LrItem.svelte';
export { default as LrState } from './LrState.svelte';
export { default as ParseTreeView } from './ParseTreeView.svelte';
export { default as TokenStream } from './TokenStream.svelte';

export {
	boxWidth,
	describeForest,
	describeTree,
	isEpsilonNode,
	labelWidth,
	layoutForest,
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
	type TreeLayoutKind,
	type TreeLayoutNode,
	type TreeLayoutOptions,
	type TreeMarker,
	type TreePath,
	type TreeSizing
} from './tree-layout';
export {
	ITEM_DOT,
	annotationText,
	formatItem,
	itemParts,
	joinSymbols,
	lookaheadSymbol,
	lookaheadText,
	mergeLookaheads,
	productionText,
	splitLookaheads,
	stateAnnotations,
	symbolSeparators,
	symbolText,
	type ItemPart,
	type ItemPartKind,
	type ItemStyle,
	type ItemView,
	type StateAnnotation,
	type SymbolSpacing
} from './lr-item';
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
export {
	AMBIGUOUS_X,
	LL0_REGION,
	LL_REGIONS,
	LR_REGIONS,
	MARKER_RADIUS,
	classPoint,
	cornerRadius,
	insideLl0,
	insideRegion,
	placeText,
	type ClassRegion,
	type GrammarPlace,
	type LlPlace,
	type LrPlace
} from './grammar-classes';
