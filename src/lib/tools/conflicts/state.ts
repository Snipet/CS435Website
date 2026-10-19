/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['conflicts']` ({ grammar, input?,
 * precedence? }) as well as its own saved shape, which adds how the items of
 * a conflict are shown and the actions chosen for the other parse.
 */
import type { LinkStates } from '$lib/tools/links';

/** The items beside ⇒: the conflict items and those they move from, or the whole states. */
export type ItemsView = 'partial' | 'full';

export interface ConflictsState {
	/** The grammar, in lecture notation. */
	grammar: string;
	/** Token string, space-separated; `$` may close it. */
	input: string;
	/** bison declarations, one per line, lowest precedence first; `//` turns a line off. */
	precedence: string;
	items: ItemsView;
	/**
	 * [conflict, action]: the other parse puts this action (0 or 1, in the
	 * order of the conflict's two items) in the conflict's table entry.
	 */
	choices: [number, 0 | 1][];
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type ConflictsHash = LinkStates['conflicts'] &
	Partial<Omit<ConflictsState, 'grammar' | 'input' | 'precedence'>>;

/** Bottom-up Parsing III, slides 18–20. */
export const DEFAULT_GRAMMAR = 'E → E + E | E * E | int';
export const DEFAULT_PRECEDENCE = "%left '+'\n%left '*'";

/** Slides 19–20: the ambiguous grammar with %left '+' then %left '*', on int + int * int. */
export const DEFAULT_STATE: ConflictsState = {
	grammar: DEFAULT_GRAMMAR,
	input: 'int + int * int',
	precedence: DEFAULT_PRECEDENCE,
	items: 'partial',
	choices: []
};

/** Most choices a state keeps (a choice per conflict of a large grammar is far more than enough). */
export const MAX_CHOICES = 500;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isChoice = (v: unknown): v is [number, 0 | 1] =>
	Array.isArray(v) &&
	v.length === 2 &&
	Number.isInteger(v[0]) &&
	(v[0] as number) >= 0 &&
	(v[1] === 0 || v[1] === 1);

/**
 * Accepts `{ grammar, input?, precedence?, items?, choices? }`; extra fields
 * are ignored.
 */
export function isConflictsHash(value: unknown): value is ConflictsHash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	if (value.input !== undefined && typeof value.input !== 'string') return false;
	if (value.precedence !== undefined && typeof value.precedence !== 'string') return false;
	if (value.items !== undefined && value.items !== 'partial' && value.items !== 'full')
		return false;
	if (
		value.choices !== undefined &&
		!(
			Array.isArray(value.choices) &&
			value.choices.length <= MAX_CHOICES &&
			value.choices.every(isChoice)
		)
	)
		return false;
	return true;
}

/**
 * The state a hash value describes. A link from another tool has the grammar
 * and perhaps a token string and declarations: the items are shown in part
 * and the other parse takes no choices.
 */
export function stateFromHash(value: ConflictsHash): ConflictsState {
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		precedence: value.precedence ?? '',
		items: value.items ?? 'partial',
		choices: (value.choices ?? []).map(([c, a]) => [c, a])
	};
}

/** The choices with the one for `conflict` set to `action`, or removed (null). */
export function withChoice(
	choices: readonly [number, 0 | 1][],
	conflict: number,
	action: 0 | 1 | null
): [number, 0 | 1][] {
	const rest = choices.filter(([c]) => c !== conflict);
	return action === null
		? rest
		: [...rest, [conflict, action] as [number, 0 | 1]].sort((a, b) => a[0] - b[0]);
}
