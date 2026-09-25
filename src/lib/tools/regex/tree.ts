/**
 * The syntax tree view: sub-expression text, clause names, the set-builder
 * rule of each clause (Lexical Analysis, slides 23–27), and the rows shown
 * for a given set of expanded nodes.
 */
import type { CharSet } from '$lib/theory/charset';
import { formatString } from '$lib/theory/chars';
import { children, printRegex, type PrintOptions, type Regex } from '$lib/theory/regex';

export type Dialect = 'lecture' | 'flex';

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** 12 → ¹², as the slides write digit³. */
export const superscript = (n: number) =>
	String(n)
		.split('')
		.map((d) => SUPERSCRIPT[Number(d)])
		.join('');

/** A range written with an ellipsis ('0' | '1' | … | '9') keeps its lecture spelling. */
function writtenRange(node: Regex): string | null {
	if (node.kind !== 'chars' || node.set.isSingleton || !node.text) return null;
	return node.text.includes('…') || node.text.includes('...') ? node.text : null;
}

/** The sub-expression as shown in the tree: printRegex, except ranges written with …. */
export function nodeText(node: Regex, opts: PrintOptions): string {
	return writtenRange(node) ?? printRegex(node, opts);
}

/** `{ "A", "B", …, "Z" }`: the one-symbol strings of a set (a sample when large). */
export function singleSymbolStrings(set: CharSet): string {
	const comp = set.complement();
	if (set.size > 0x10000 && comp.size <= 8) {
		const out = [...comp.codePoints()].map((c) => formatString(String.fromCodePoint(c)));
		return `{ "c" | c ∉ { ${out.join(', ')} } }`;
	}
	const all = set.chars(6);
	if (set.size <= 5) return `{ ${all.map(formatString).join(', ')} }`;
	const last = String.fromCodePoint(set.ranges[set.ranges.length - 1][1]);
	return `{ ${formatString(all[0])}, ${formatString(all[1])}, …, ${formatString(last)} }`;
}

export interface RuleContext {
	dialect: Dialect;
	/** Sub-expression text for leaves. */
	text: (node: Regex) => string;
	/** A definition's text as written, by name. */
	definition?: (name: string) => string | undefined;
}

/**
 * The set-builder rule for a node's clause. Leaves are written out
 * (L('0') = { "0" }); operators use the slides' generic form with A and B.
 */
export function ruleFor(node: Regex, ctx: RuleContext): string {
	const flex = ctx.dialect === 'flex';
	switch (node.kind) {
		case 'empty':
			return 'L(ɸ) = { }';
		case 'epsilon':
			return flex ? 'L("") = { "" }' : 'L(ε) = { "" }';
		case 'any':
			return 'L(Σ) = { "c" | c ∈ Σ }';
		case 'chars':
			return node.set.isSingleton
				? `L(${ctx.text(node)}) = { ${formatString(node.set.firstChar()!)} }`
				: `L(${ctx.text(node)}) = ${singleSymbolStrings(node.set)}`;
		case 'concat':
			return 'L(AB) = { ab | a ∈ L(A) and b ∈ L(B) }';
		case 'alt':
			return 'L(A | B) = { s | s ∈ L(A) or s ∈ L(B) }';
		case 'star':
			return 'L(A*) = { "" } ∪ L(A) ∪ L(AA) ∪ …';
		case 'plus':
			return 'L(A+) = L(A A*)';
		case 'optional':
			return flex ? 'L(A?) = L(A | "")' : 'L(A?) = L(A | ε)';
		case 'repeat':
			return repeatRule(node.min, node.max, flex);
		case 'ref': {
			const written =
				ctx.definition?.(node.name) ?? printRegex(node.body, { dialect: ctx.dialect });
			return `${flex ? `{${node.name}}` : node.name} = ${written}`;
		}
	}
}

function repeatRule(min: number, max: number | null, flex: boolean): string {
	const count =
		max === min
			? flex
				? `{${min}}`
				: superscript(min)
			: flex
				? `{${min},${max ?? ''}}`
				: `^{${min},${max ?? ''}}`;
	const lhs = `L(A${count})`;
	const pow = (n: number) => `A${superscript(n)}`;
	if (max === min) {
		if (min === 0) return `${lhs} = L(${flex ? '""' : 'ε'})`;
		if (min <= 4) return `${lhs} = L(${Array(min).fill('A').join(' ')})`;
		return `${lhs} = L(A A … A), A repeated ${min} times`;
	}
	if (max === null) return `${lhs} = L(${min === 0 ? '' : `${pow(min)} `}A*)`;
	const terms =
		max - min <= 3
			? Array.from({ length: max - min + 1 }, (_, k) => `L(${pow(min + k)})`)
			: [`L(${pow(min)})`, `L(${pow(min + 1)})`, '…', `L(${pow(max)})`];
	return `${lhs} = ${terms.join(' ∪ ')}`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface TreeRow {
	/** Path joined with '.', '' for the root. */
	key: string;
	path: number[];
	depth: number;
	node: Regex;
	hasChildren: boolean;
	expanded: boolean;
	/** Key of the parent row, or null for the root. */
	parent: string | null;
}

export const pathKey = (path: readonly number[]) => path.join('.');

/**
 * Nodes start expanded, except definition uses and quoted literals such as
 * 'if' (whose parts are single symbols).
 */
export function expandedByDefault(node: Regex): boolean {
	return !(node.kind === 'ref' || (node.kind === 'concat' && node.quoted === true));
}

/**
 * The rows of the tree in display order (pre-order), descending only into
 * expanded nodes, and stopping after `limit` rows.
 */
export function visibleRows(
	root: Regex,
	isExpanded: (key: string, node: Regex) => boolean,
	limit = 400
): { rows: TreeRow[]; truncated: boolean } {
	const rows: TreeRow[] = [];
	let truncated = false;
	const visit = (node: Regex, path: number[], parent: string | null) => {
		if (rows.length >= limit) {
			truncated = true;
			return;
		}
		const key = pathKey(path);
		const kids = children(node);
		const expanded = kids.length > 0 && isExpanded(key, node);
		rows.push({
			key,
			path,
			depth: path.length,
			node,
			hasChildren: kids.length > 0,
			expanded,
			parent
		});
		if (expanded) kids.forEach((c, i) => visit(c, [...path, i], key));
	};
	visit(root, [], null);
	return { rows, truncated };
}
