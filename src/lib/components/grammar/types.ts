import type { TreePath } from './tree-layout';

/**
 * Color of a whole parse tree: an index into the token palette (`--tok-0` …
 * `--tok-5`, modulo 6), the accent color, or the muted text color. Two trees
 * for one string are told apart by giving them two tones.
 */
export type TreeTone = number | 'accent' | 'muted';

/** Nodes of a parse tree to mark, each given by its path from the root. */
export interface TreeHighlight {
	/** The node being expanded or compared: amber mark, bold label. */
	current?: readonly TreePath[];
	/** Nodes just added. */
	fresh?: readonly TreePath[];
	/** Terminals matched against the input. */
	matched?: readonly TreePath[];
	/** Nodes drawn faded, with the line to their parent. */
	dim?: readonly TreePath[];
}

/** One derivation step, as `DerivationChain` marks it. */
export interface ChainStep {
	/** Position, in the form before the step, of the non-terminal that is replaced. */
	index: number;
	/** Number of symbols it is replaced by (0 for an ε-production). */
	length: number;
}
