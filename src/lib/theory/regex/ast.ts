/**
 * Regular-expression AST shared by the lecture-notation parser and the flex
 * parser. Nodes mirror the inductive definition from Lexical Analysis (slides
 * 23–27): basis clauses (Atomic, Empty, Epsilon) and inductive clauses
 * (Concatenation, Choice/Alternation, Iteration), plus derived forms.
 *
 * Concatenation and alternation are n-ary (≥ 2 children). Constructions that
 * follow the binary lecture definitions (e.g. Thompson) fold them
 * left-associatively: A B C = (A B) C and A | B | C = (A | B) | C.
 */
import { CharSet } from '../charset';

/** Location of a node in source text. `source` is null for the main expression, or the definition name. */
export interface Span {
	start: number;
	end: number;
	source: string | null;
}

interface NodeBase {
	span?: Span;
}

/** ɸ: L(ɸ) = { } */
export interface EmptyNode extends NodeBase {
	kind: 'empty';
}

/** ε: L(ε) = { "" } */
export interface EpsilonNode extends NodeBase {
	kind: 'epsilon';
}

/**
 * One input symbol drawn from `set`. A plain atom such as 'c' has a singleton
 * set; classes such as [a-z] or flex `.` have larger sets.
 */
export interface CharsNode extends NodeBase {
	kind: 'chars';
	set: CharSet;
	/** Source text for display, e.g. `'a'`, `0`, `[a-z]`, `.` */
	text?: string;
}

/** Σ: any single symbol of the alphabet in use; resolved when an alphabet is known. */
export interface AnyNode extends NodeBase {
	kind: 'any';
}

/** AB…: L(AB) = { ab | a ∈ L(A) and b ∈ L(B) } */
export interface ConcatNode extends NodeBase {
	kind: 'concat';
	parts: Regex[];
	/** True when the node came from a multi-character quoted literal such as 'if'. */
	quoted?: boolean;
}

/** A | B | …: L(A | B) = { s | s ∈ L(A) or s ∈ L(B) } */
export interface AltNode extends NodeBase {
	kind: 'alt';
	options: Regex[];
}

/** A*: L(A*) = { "" } ∪ L(A) ∪ L(AA) ∪ … */
export interface StarNode extends NodeBase {
	kind: 'star';
	body: Regex;
}

/** A+: L(A+) = L(A A*) */
export interface PlusNode extends NodeBase {
	kind: 'plus';
	body: Regex;
}

/** A?: L(A?) = L(A | ε) (flex; also accepted in lecture notation) */
export interface OptionalNode extends NodeBase {
	kind: 'optional';
	body: Regex;
}

/** A^n (min = max = n) or flex A{n,m} / A{n,} (max = null). */
export interface RepeatNode extends NodeBase {
	kind: 'repeat';
	body: Regex;
	min: number;
	max: number | null;
}

/** A use of a regular definition, e.g. `digit` or flex `{DIGIT}`. `body` is the definition's AST. */
export interface RefNode extends NodeBase {
	kind: 'ref';
	name: string;
	body: Regex;
}

export type Regex =
	| EmptyNode
	| EpsilonNode
	| CharsNode
	| AnyNode
	| ConcatNode
	| AltNode
	| StarNode
	| PlusNode
	| OptionalNode
	| RepeatNode
	| RefNode;

export type RegexKind = Regex['kind'];

/** Clause names as they appear on the lecture slides. */
export function clauseName(node: Regex): string {
	switch (node.kind) {
		case 'empty':
			return 'Empty';
		case 'epsilon':
			return 'Epsilon';
		case 'chars':
			return node.set.isSingleton ? 'Atomic' : 'Character class';
		case 'any':
			return 'Any symbol (Σ)';
		case 'concat':
			return 'Concatenation';
		case 'alt':
			return 'Choice/Alternation';
		case 'star':
			return 'Iteration (Kleene closure)';
		case 'plus':
			return 'Positive closure';
		case 'optional':
			return 'Optional';
		case 'repeat':
			return node.max === node.min ? 'Fixed iteration' : 'Repetition';
		case 'ref':
			return 'Regular definition';
	}
}

/** Children in left-to-right order. */
export function children(node: Regex): Regex[] {
	switch (node.kind) {
		case 'concat':
			return node.parts;
		case 'alt':
			return node.options;
		case 'star':
		case 'plus':
		case 'optional':
		case 'repeat':
		case 'ref':
			return [node.body];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// Builders (handy in tests and presets)
// ---------------------------------------------------------------------------

export const empty = (): EmptyNode => ({ kind: 'empty' });
export const eps = (): EpsilonNode => ({ kind: 'epsilon' });
export const any = (): AnyNode => ({ kind: 'any' });

/** A single symbol, or a multi-character literal (a quoted concatenation), e.g. sym('if'). */
export function sym(text: string): Regex {
	const chars = [...text];
	if (chars.length === 0) return eps();
	const atoms: CharsNode[] = chars.map((c) => ({ kind: 'chars', set: CharSet.single(c) }));
	return atoms.length === 1 ? atoms[0] : { kind: 'concat', parts: atoms, quoted: true };
}

export const chars = (set: CharSet, text?: string): CharsNode => ({ kind: 'chars', set, text });

export function cat(...parts: Regex[]): Regex {
	if (parts.length === 0) return eps();
	return parts.length === 1 ? parts[0] : { kind: 'concat', parts };
}

export function alt(...options: Regex[]): Regex {
	if (options.length === 0) return empty();
	return options.length === 1 ? options[0] : { kind: 'alt', options };
}

export const star = (body: Regex): StarNode => ({ kind: 'star', body });
export const plus = (body: Regex): PlusNode => ({ kind: 'plus', body });
export const opt = (body: Regex): OptionalNode => ({ kind: 'optional', body });
export const pow = (body: Regex, n: number): RepeatNode => ({
	kind: 'repeat',
	body,
	min: n,
	max: n
});
export const repeat = (body: Regex, min: number, max: number | null): RepeatNode => ({
	kind: 'repeat',
	body,
	min,
	max
});
export const ref = (name: string, body: Regex): RefNode => ({ kind: 'ref', name, body });
