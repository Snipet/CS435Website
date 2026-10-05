/**
 * The precedence cascade: an unambiguous grammar for binary operators with
 * one non-terminal per precedence level.
 *
 * Levels are listed from lowest to highest precedence. Level i gets the
 * non-terminal Xᵢ and refers to the next level Xᵢ₊₁:
 *
 *   left-associative    Xᵢ → Xᵢ op Xᵢ₊₁ | Xᵢ₊₁      (left recursion)
 *   right-associative   Xᵢ → Xᵢ₊₁ op Xᵢ | Xᵢ₊₁      (right recursion)
 *
 * and the last non-terminal derives the atoms. The non-terminals are named E,
 * T, F and then further letters, so the levels `+` and `*` with the atoms
 * `int | ( E )` give the lecture's grammar
 *
 *   E → E + T | T
 *   T → T * F | F
 *   F → int | ( E )
 *
 * In the atoms, E is the start symbol of the generated grammar.
 *
 * The operators of a level are words separated by spaces (operators.ts), so
 * `== !=` is a level with the two operators == and !=; the generated grammar
 * writes them in quotes, as a grammar has to.
 */
import { makeGrammar, parseGrammar, printGrammar, type Grammar } from '$lib/theory/grammar';
import { operatorsOf } from './operators';

export interface CascadeLevel {
	/** Operators of this level, separated by spaces (`+ -`, `== !=`). */
	ops: string;
	assoc: 'left' | 'right';
}

export interface Cascade {
	/** The generated grammar; null when the atoms cannot be read. */
	grammar: Grammar | null;
	/** Its text, one non-terminal per line; '' without a grammar. */
	text: string;
	/** The non-terminal of each level given (null for a level without operators), then the atoms'. */
	names: (string | null)[];
	problems: string[];
}

export const MAX_LEVELS = 8;
export const DEFAULT_LEVELS: readonly CascadeLevel[] = [
	{ ops: '+', assoc: 'left' },
	{ ops: '*', assoc: 'left' }
];
export const DEFAULT_ATOMS = 'int | ( E )';

/** E, T, F, then the rest of the alphabet. */
const LETTERS = ['E', 'T', 'F', ...'GHIJKLMNOPQRSUVWXYZABCD'];

/** Names for `count` non-terminals: E first, then letters that are not symbols already. */
export function cascadeNames(count: number, taken: ReadonlySet<string> = new Set()): string[] {
	const names: string[] = ['E'];
	for (const letter of LETTERS.slice(1)) {
		if (names.length >= count) break;
		if (!taken.has(letter)) names.push(letter);
	}
	// More levels than letters: number the rest.
	for (let i = 1; names.length < count; i++) if (!taken.has(`E${i}`)) names.push(`E${i}`);
	return names.slice(0, Math.max(1, count));
}

/** Builds the stratified grammar for the levels (lowest precedence first) and the atoms. */
export function buildCascade(levels: readonly CascadeLevel[], atoms: string): Cascade {
	const problems: string[] = [];
	const failed = (): Cascade => ({ grammar: null, text: '', names: [], problems });

	if (atoms.trim() === '') {
		problems.push('Enter the atoms, for example int | ( E ).');
		return failed();
	}
	// The atoms are the alternatives of one right-hand side.
	const parsed = parseGrammar(`Atoms → ${atoms.replace(/\s*\n\s*/gu, ' ')}`);
	if (!parsed.grammar) {
		for (const d of parsed.diagnostics) if (d.severity === 'error') problems.push(d.message);
		return failed();
	}
	const alternatives = parsed.grammar.productions.map((p) => p.rhs);

	const operators = levels.map((level) => [...new Set(operatorsOf(level.ops))]);
	const seen = new Map<string, number>();
	operators.forEach((ops, i) => {
		if (ops.length === 0) problems.push(`Level ${i + 1} has no operator and is left out.`);
		for (const op of ops) {
			const earlier = seen.get(op);
			if (earlier !== undefined)
				problems.push(
					`${op} is on levels ${earlier + 1} and ${i + 1}: the grammar is ambiguous for ${op}.`
				);
			else seen.set(op, i);
		}
	});

	const used = operators.flatMap((ops, i) => (ops.length > 0 ? [i] : []));
	const taken = new Set([...operators.flat(), ...alternatives.flat()]);
	const letters = cascadeNames(used.length + 1, taken);
	const names: (string | null)[] = levels.map(() => null);
	used.forEach((level, k) => (names[level] = letters[k]));
	names.push(letters[used.length]);

	const productions: { lhs: string; rhs: string[] }[] = [];
	used.forEach((level, k) => {
		const here = letters[k];
		const next = letters[k + 1];
		for (const op of operators[level])
			productions.push({
				lhs: here,
				rhs: levels[level].assoc === 'left' ? [here, op, next] : [next, op, here]
			});
		productions.push({ lhs: here, rhs: [next] });
	});
	for (const rhs of alternatives) productions.push({ lhs: letters[used.length], rhs });

	const grammar = makeGrammar(productions);
	return { grammar, text: printGrammar(grammar), names, problems };
}
