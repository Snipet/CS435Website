/**
 * The state that opens Conflicts & Precedence on this tool's grammar, token
 * string and declarations. There the declarations are bison's, one per line,
 * lowest precedence first, with terminals written as bison writes them
 * (Bottom-up Parsing III, slide 19): `%left '+' '-'`, `%left "=="`.
 */
import type { LinkStates } from '$lib/tools/links';
import { operatorsOf, type Declaration } from './declarations';

/**
 * A terminal as bison writes it: one character other than a letter quoted
 * (`'+'`, `'\''`), a name bare (`then`, `INT`), anything else as a string
 * (`"=="`).
 */
export function bisonSymbol(t: string): string {
	if (/^\\[ntr0]$/.test(t)) return `'${t}'`;
	if ([...t].length === 1 && !/[\p{L}_]/u.test(t))
		return t === "'" ? "'\\''" : t === '\\' ? "'\\\\'" : `'${t}'`;
	if (/^[A-Za-z_.][A-Za-z0-9_.-]*$/.test(t) && !t.endsWith('-')) return t;
	return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The declarations in bison's syntax, one line each; a line without operators is left out. */
export function bisonDeclarations(decls: readonly Declaration[]): string {
	return decls
		.flatMap((d) => {
			const ops = operatorsOf(d.ops);
			return ops.length ? [[`%${d.assoc}`, ...ops.map(bisonSymbol)].join(' ')] : [];
		})
		.join('\n');
}

/** `{ grammar, input?, precedence? }`, leaving out an empty token string and no declarations. */
export function conflictsState(
	grammar: string,
	input: string,
	decls: readonly Declaration[]
): LinkStates['conflicts'] {
	const precedence = bisonDeclarations(decls);
	return {
		grammar,
		...(input.trim() ? { input } : {}),
		...(precedence ? { precedence } : {})
	};
}
