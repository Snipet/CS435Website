/**
 * Occurrence labels for the token string.
 *
 * The dangling-else slides write the string as
 * `if E₁ then if E₂ then E₃ else E₄`, where E₁ … E₄ stand for four
 * sub-expressions. The grammar reads them as its terminal OTHER, so the token
 * string the parser gets is `if OTHER then if OTHER then OTHER else OTHER`.
 *
 * The mapping between the two is kept as text, `OTHER = E`: the k-th token
 * that is OTHER is displayed as E with the subscript k. Several terminals can
 * be mapped (`OTHER = E, id = x`); terminals mapped to the same letter share
 * one numbering. The labels only change what is displayed, in the token string
 * and at the leaves of the trees; the grammar, the parser, bracket forms and
 * derivations keep the grammar's own symbols.
 */

export interface OccurrenceLabels {
	/** Terminal → the letter its occurrences are shown as. */
	map: Map<string, string>;
	problems: string[];
}

const ITEM = /^(\S+)\s*=\s*(\S+)$/u;

/**
 * Reads `terminal = label` items separated by commas, semicolons or line
 * breaks. `terminals` are the terminals of the grammar; an item for another
 * symbol is reported and ignored.
 */
export function parseLabels(text: string, terminals?: readonly string[]): OccurrenceLabels {
	const map = new Map<string, string>();
	const problems: string[] = [];
	const known = terminals ? new Set(terminals) : null;
	for (const raw of text.split(/[,;\n]+/u)) {
		const item = raw.trim();
		if (item === '') continue;
		const m = ITEM.exec(item);
		if (!m) {
			problems.push(`${item} is not of the form OTHER = E.`);
			continue;
		}
		const [, terminal, label] = m;
		if (known && !known.has(terminal)) {
			problems.push(`${terminal} is not a terminal of the grammar.`);
			continue;
		}
		if (map.has(terminal)) {
			problems.push(`${terminal} is listed twice; the first label is used.`);
			continue;
		}
		map.set(terminal, label);
	}
	return { map, problems };
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** A number in subscript digits: 12 → ₁₂. */
export function subscript(n: number): string {
	return [...String(n)].map((d) => SUBSCRIPTS[Number(d)] ?? d).join('');
}

/**
 * The display form of each token: a mapped terminal becomes its label with the
 * occurrence number as a subscript (`E₁`), every other token stays as it is.
 */
export function displayTokens(
	tokens: readonly string[],
	map: ReadonlyMap<string, string>
): string[] {
	const count = new Map<string, number>();
	return tokens.map((token) => {
		const label = map.get(token);
		if (label === undefined) return token;
		const k = (count.get(label) ?? 0) + 1;
		count.set(label, k);
		return label + subscript(k);
	});
}
