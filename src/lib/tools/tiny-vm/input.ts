/**
 * The input queue: integers IN reads in order, typed as text such as "3" or
 * "5 12 30 0" (spaces or commas between values).
 */

export interface InputToken {
	text: string;
	start: number;
	end: number;
	/** The integer, or null when the text is not one. */
	value: number | null;
}

export interface InputQueue {
	/** Valid values in order; IN reads these. */
	values: number[];
	tokens: InputToken[];
	/** Tokens that are not integers (skipped). */
	invalid: InputToken[];
}

const INT = /^[+-]?\d+$/;

/** Reads an integer the way the IN prompt does; null when the text is not one. */
export function parseInteger(text: string): number | null {
	const s = text.trim();
	if (!INT.test(s)) return null;
	const n = Number(s);
	return n >= -(2 ** 31) && n <= 2 ** 31 - 1 ? n : null;
}

export function parseInputs(text: string): InputQueue {
	const tokens: InputToken[] = [];
	const re = /[^\s,]+/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		tokens.push({
			text: m[0],
			start: m.index,
			end: m.index + m[0].length,
			value: parseInteger(m[0])
		});
	}
	return {
		values: tokens.flatMap((t) => (t.value === null ? [] : [t.value])),
		tokens,
		invalid: tokens.filter((t) => t.value === null)
	};
}

/** The queue text with `value` added at the end. */
export function appendInput(text: string, value: number): string {
	const trimmed = text.replace(/[\s,]+$/, '');
	if (!trimmed) return String(value);
	// Keep the separator style already in use: "1 2", "1, 2" or "1,2".
	const sep = trimmed.includes(',') ? (/,\s/.test(trimmed) ? ', ' : ',') : ' ';
	return `${trimmed}${sep}${value}`;
}

/** "Not an integer (skipped): x" style message, or null. */
export function inputError(queue: InputQueue): string | null {
	if (!queue.invalid.length) return null;
	const list = queue.invalid
		.slice(0, 4)
		.map((t) => `"${t.text}"`)
		.join(', ');
	const more = queue.invalid.length > 4 ? ', …' : '';
	return queue.invalid.length === 1
		? `${list} is not a 32-bit integer; it is skipped.`
		: `${list}${more} are not 32-bit integers; they are skipped.`;
}
